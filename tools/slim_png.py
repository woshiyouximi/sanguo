# -*- coding: utf-8 -*-
"""slim_png.py —— 微信小游戏构建产物 png 瘦身（两种模式，均可复跑）。

背景（决定方案的事实，2026-11-26 实测）：
  - 引擎按 `<bundle>/native/<uuid[:2]>/<uuid>.<nativeVer>.<ext>` 请求图片，ext 来自
    ImageAsset 的 `_format`，序列化在 `import/<uuid[:2]>/<uuid>.<hash>.json` 的
    `{"fmt":"N"}`，N 是 ImageAsset.extnames=[".png",".jpg",".jpeg",".bmp",".webp",...] 的下标
    （png 的 import json 是 fmt=0，webp 的是 fmt=4，实测 1210 个 webp 全是 4）。
    三个 bundle 的 config.extensionMap 都是 {}，所以扩展名不是从 config 来的。
  - 因此 png -> webp 只需三件事：同名换扩展名、改 import json 的 fmt 0->4。原生文件名里的
    hash 只是版本串（config.versions.native 指向它），不需要重算。

模式：
  --mode quant  保底：256 色量化后同名同扩展名重编码（零引用改动，风险最低）
  --mode webp   主方案：转 webp（有损，quality 可调），改 import json 的 fmt，删 png

用法：
  python slim_png.py <dir> [<dir> ...] [--mode quant|webp] [--dry-run] [--report out.txt]
        [--min-bytes 102400] [--min-gain 0.10] [--jobs N]
        [--webp-quality 92] [--webp-method 6] [--alpha-quality 100]
        [--backup-dir DIR] [--only-png-name SUBSTR]
  质量闸（quant 模式）：可见像素 RGB 平均绝对误差 <= --max-rgb-diff，alpha <= --max-alpha-diff，
  否则需满足 relax 规则；两个模式都只在「新文件比旧的至少小 --min-gain」时才替换。
"""
import argparse
import io
import json
import os
import re
import shutil
import sys
import time

from PIL import Image, ImageChops

Image.MAX_IMAGE_PIXELS = None
Image.init()

# import json 里 fmt 的下标 -> 扩展名（ImageAsset.extnames）
EXTNAMES = ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.pvr', '.pkm', '.astc']
FMT_WEBP = EXTNAMES.index('.webp')
FMT_PNG = EXTNAMES.index('.png')
FMT_RE = re.compile(r'"fmt":"(\d+)"')


def kb(n):
    return n / 1024.0


def encode_png(img, **extra):
    buf = io.BytesIO()
    kw = {'format': 'PNG', 'optimize': True}
    kw.update(extra)
    img.save(buf, **kw)
    return buf.getvalue()


def alpha_channel(im):
    if im.mode in ('RGBA', 'LA'):
        return im.getchannel('A')
    if im.mode == 'P' and 'transparency' in im.info:
        return im.convert('RGBA').getchannel('A')
    return None


def is_opaque(im):
    a = alpha_channel(im)
    if a is None:
        return True
    return a.getextrema()[0] >= 255


def alpha_values(im):
    a = alpha_channel(im)
    if a is None:
        return {255}
    hist = a.histogram()
    return {i for i, c in enumerate(hist) if c > 0}


def madiff(im_a, im_b):
    """可见像素 RGB 平均绝对误差 + alpha 平均绝对误差（0..255 均值）。"""
    a = im_a.convert('RGBA')
    b = im_b.convert('RGBA')
    ca = a.getchannel('A')
    chans_a = a.split()
    chans_b = b.split()
    d_rgb = ImageChops.difference(
        Image.merge('RGB', chans_a[:3]), Image.merge('RGB', chans_b[:3]))
    d_a = ImageChops.difference(ca, b.getchannel('A'))
    mask = ca.point(lambda v: 255 if v > 0 else 0)
    n_vis = mask.histogram()[255]
    total_rgb = 0.0
    if n_vis > 0:
        r, g, bb = d_rgb.split()
        hist_sum = 0
        for ch in (r, g, bb):
            ch = ImageChops.multiply(ch, mask)
            hist_sum += sum(i * c for i, c in enumerate(ch.histogram()))
        total_rgb = hist_sum / (3.0 * n_vis)
    total_a = sum(i * c for i, c in enumerate(d_a.histogram())) / float(a.width * a.height)
    return total_rgb, total_a


# ---------------- quant 模式 ------------

def pal_from_indexed(im, colors):
    return im.convert('RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)


def pal_rgba_fastoctree(im, colors):
    return im.convert('RGBA').quantize(colors=colors, method=Image.FASTOCTREE, dither=Image.NONE)


def pal_binary_alpha(im):
    """alpha 只有 0/255 的图：最多 255 色 + 0 号索引作全透明。"""
    rgba = im.convert('RGBA')
    r, g, b, a = rgba.split()
    mask = a.point(lambda v: 255 if v > 127 else 0)
    rgb = Image.merge('RGB', (r, g, b))
    q = rgb.quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    qpal = q.getpalette() or []
    entries = min(len(qpal) // 3, 255)
    newpal = [0, 0, 0] + qpal[:entries * 3]
    newpal += [0, 0, 0] * (256 - len(newpal) // 3)
    src = list(q.getdata())
    msk = list(mask.getdata())
    out = Image.new('P', im.size)
    out.putpalette(newpal[:768])
    out.putdata([(v + 1) if m else 0 for v, m in zip(src, msk)])
    out.info['transparency'] = bytes([0] + [255] * 255)
    return out


def candidates(im, opaque, binary_alpha):
    out = []
    if opaque:
        out.append(('pal256-mediancut', pal_from_indexed(im, 256)))
        out.append(('pal128-mediancut', pal_from_indexed(im, 128)))
    elif binary_alpha:
        out.append(('pal255-binaryalpha', pal_binary_alpha(im)))
    else:
        out.append(('pal256-fastoctree', pal_rgba_fastoctree(im, 256)))
    return out


def best_quant(im, raw, args):
    """返回 (策略名, data, size, rgb, alpha) 或 None；质量闸见 --max-rgb-diff 等。"""
    note = []
    opaque = is_opaque(im)
    binary_alpha = opaque or alpha_values(im).issubset({0, 255})
    best = None
    for name, cand in candidates(im, opaque, binary_alpha):
        try:
            data = encode_png(cand)
        except Exception as e:
            note.append('%s:encode-error %s' % (name, e))
            continue
        if len(data) >= raw * (1.0 - args.min_gain):
            continue
        try:
            back = Image.open(io.BytesIO(data))
            back.load()
            d_rgb, d_a = madiff(im, back)
        except Exception as e:
            note.append('%s:diff-error %s' % (name, e))
            continue
        gain = 1.0 - len(data) / float(raw)
        ok_strict = d_rgb <= args.max_rgb_diff and d_a <= args.max_alpha_diff
        ok_relax = (d_rgb <= args.relax_rgb_diff and d_a <= args.max_alpha_diff
                    and gain >= args.relax_min_gain)
        if not (ok_strict or ok_relax):
            note.append('%s:quality(rgb=%.2f,a=%.2f,gain=%.0f%%)' % (name, d_rgb, d_a, gain * 100))
            continue
        if best is None or len(data) < best[2]:
            best = (name + ('' if ok_strict else '*relax'), data, len(data), d_rgb, d_a)
    return best, note


def write_inplace(path, data):
    """原子替换（先写 .slimtmp 再 os.replace）。"""
    tmp = path + '.slimtmp'
    try:
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, path)
        return True, ''
    except Exception as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False, 'write-error %s' % e


def slim_quant(im, raw, args, res):
    best, note = best_quant(im, raw, args)
    if best is None:
        res['note'] = ('; '.join(note) or 'no-gain')[:200]
        return res
    name, data, size, d_rgb, d_a = best
    res.update({'after': size, 'strategy': name, 'rgb': d_rgb, 'alpha': d_a, 'kind': 'quant'})
    if args.dry_run:
        res['note'] = 'dry-run'
        return res
    ok, err = write_inplace(res['path'], data)
    if not ok:
        res['note'] = err
        return res
    res['changed'] = True
    return res


# ---------------- webp 模式 ------------

def split_native_path(path):
    """<bundle>/native/<xx>/<uuid>.<hash>.<ext> -> (bundle_dir, uuid, hash)"""
    d = os.path.dirname(path)
    xx = os.path.basename(d)
    if len(xx) != 2:
        return None
    native_dir = os.path.dirname(d)
    if os.path.basename(native_dir) != 'native':
        return None
    bundle = os.path.dirname(native_dir)
    stem = os.path.basename(path)
    parts = stem.split('.')
    if len(parts) < 3:
        return None
    ext = parts[-1]
    hashs = parts[-2]
    uuid = '.'.join(parts[:-2])
    if len(uuid) != 36:
        return None
    return {'bundle': bundle, 'uuid': uuid, 'hash': hashs, 'ext': ext}


def find_import_json(bundle, uuid):
    d = os.path.join(bundle, 'import', uuid[:2])
    if not os.path.isdir(d):
        return None
    cands = [os.path.join(d, n) for n in os.listdir(d)
             if n.startswith(uuid + '.') and n.endswith('.json')]
    if not cands:
        return None
    return sorted(cands)[0]


def quant_fallback(im, raw, args, res, note):
    """webp 不合算或超质量上限时退回 256 色重编码（同名同扩展名 png）。"""
    r2 = dict(res)
    r2['note'] = ''
    out = slim_quant(im, raw, args, r2)
    if out.get('after'):
        out['note'] = ('%s=>%s' % (note, out.get('strategy', 'quant')))[:200]
        out['kind'] = 'quant'
        return out
    res['note'] = (note + '; ' + (out.get('note') or ''))[:200]
    return res


def slim_webp(im, raw, args, res):
    info = split_native_path(res['path'])
    if not info:
        res['note'] = 'not-native-layout'
        return res
    imp = find_import_json(info['bundle'], info['uuid'])
    if not imp:
        res['note'] = 'no-import-json'
        return res
    try:
        with open(imp, 'r', encoding='utf-8') as f:
            imp_txt = f.read()
    except Exception as e:
        res['note'] = 'import-read-error %s' % e
        return res
    m = FMT_RE.search(imp_txt)
    if not m:
        res['note'] = 'no-fmt-field'
        return res
    cur_fmt = int(m.group(1))
    if cur_fmt == FMT_WEBP:
        res['note'] = 'already-webp'
        return res
    if cur_fmt != FMT_PNG:
        res['note'] = 'fmt=%d(非png)跳过' % cur_fmt
        return res
    # 有损 webp：alpha 用无损通道（alpha_quality=100）
    buf = io.BytesIO()
    src = im.convert('RGBA') if not is_opaque(im) else im.convert('RGB')
    src.save(buf, format='WEBP', quality=args.webp_quality, method=args.webp_method,
             alpha_quality=args.alpha_quality)
    data = buf.getvalue()
    if len(data) >= raw * (1.0 - args.min_gain):
        note = 'webp-no-gain(%d>=%d)' % (len(data), int(raw * (1.0 - args.min_gain)))
        return quant_fallback(im, raw, args, res, note)
    try:
        back = Image.open(io.BytesIO(data))
        back.load()
        d_rgb, d_a = madiff(im, back)
    except Exception as e:
        return quant_fallback(im, raw, args, res, 'webp-diff-error %s' % e)
    if d_rgb > args.webp_max_rgb_diff or d_a > args.max_alpha_diff:
        return quant_fallback(im, raw, args, res,
                              'webp-quality(rgb=%.2f,a=%.2f)' % (d_rgb, d_a))
    res.update({'after': len(data), 'strategy': 'webp-q%d' % args.webp_quality, 'kind': 'webp',
                'rgb': d_rgb, 'alpha': d_a,
                'webp_path': os.path.join(os.path.dirname(res['path']),
                                          '%s.%s.webp' % (info['uuid'], info['hash'])),
                'import_json': imp, 'fmt_from': cur_fmt})
    if args.dry_run:
        res['note'] = 'dry-run'
        return res
    new_txt = FMT_RE.sub('"fmt":"%d"' % FMT_WEBP, imp_txt, count=1)
    try:
        if args.backup_dir:
            bd = os.path.join(args.backup_dir, os.path.basename(info['bundle']),
                              os.path.basename(os.path.dirname(res['path'])))
            os.makedirs(bd, exist_ok=True)
            shutil.copy2(res['path'], os.path.join(bd, os.path.basename(res['path'])))
            shutil.copy2(imp, os.path.join(bd, os.path.basename(imp)))
        with open(res['webp_path'], 'wb') as f:
            f.write(data)
        with open(imp, 'w', encoding='utf-8', newline='') as f:
            f.write(new_txt)
        with open(imp, 'r', encoding='utf-8') as f:
            chk = FMT_RE.search(f.read())
        if not chk or int(chk.group(1)) != FMT_WEBP:
            raise RuntimeError('fmt 回读校验失败')
        os.remove(res['path'])
    except Exception as e:
        res['note'] = 'webp-write-error %s' % e
        return res
    res['changed'] = True
    return res


# ---------------- 驱动 ------------

def slim_one(path, args):
    raw = os.path.getsize(path)
    res = {'path': path, 'before': raw, 'after': raw, 'strategy': '-', 'changed': False,
           'rgb': 0.0, 'alpha': 0.0, 'note': ''}
    if args.only_png_name and args.only_png_name not in os.path.basename(path):
        res['note'] = 'skip(only-png-name)'
        return res
    if raw < args.min_bytes:
        res['note'] = 'skip(<min-bytes)'
        return res
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:
        res['note'] = 'open-error: %s' % e
        return res
    if im.format != 'PNG':
        res['note'] = 'not-png(%s)' % im.format
        return res
    if im.width * im.height > 20000000:
        res['note'] = 'skip(>20MP)'
        return res
    if args.mode == 'webp':
        return slim_webp(im, raw, args, res)
    return slim_quant(im, raw, args, res)


def walk_png(roots):
    for root in roots:
        if os.path.isfile(root):
            yield root
            continue
        for dirpath, _dirnames, filenames in os.walk(root):
            for fn in filenames:
                if fn.lower().endswith('.png'):
                    yield os.path.join(dirpath, fn)


def _worker(pair):
    path, args = pair
    return slim_one(path, args)


def main(argv=None):
    ap = argparse.ArgumentParser(description='构建产物 png 瘦身（quant=同名重编码 / webp=转 webp 并改 fmt）')
    ap.add_argument('roots', nargs='+', help='要处理的目录或 png 文件')
    ap.add_argument('--mode', choices=['quant', 'webp'], default='quant')
    ap.add_argument('--dry-run', action='store_true', help='只算不写')
    ap.add_argument('--report', default='', help='报告输出路径（UTF-8）')
    ap.add_argument('--min-bytes', type=int, default=100 * 1024)
    ap.add_argument('--min-gain', type=float, default=0.10)
    ap.add_argument('--max-rgb-diff', type=float, default=2.0)
    ap.add_argument('--max-alpha-diff', type=float, default=1.0)
    ap.add_argument('--relax-rgb-diff', type=float, default=2.5)
    ap.add_argument('--relax-min-gain', type=float, default=0.35)
    ap.add_argument('--webp-quality', type=int, default=92)
    ap.add_argument('--webp-method', type=int, default=6)
    ap.add_argument('--webp-max-rgb-diff', type=float, default=6.0,
                    help='webp 可见像素平均绝对误差上限，超过就退回量化或保持 png')
    ap.add_argument('--alpha-quality', type=int, default=100)
    ap.add_argument('--backup-dir', default='', help='webp 模式：把被替换的 png 与 import json 备份到这里')
    ap.add_argument('--only-png-name', default='', help='只处理文件名含该子串的 png（调试用）')
    ap.add_argument('--jobs', type=int, default=min(8, (os.cpu_count() or 4)))
    args = ap.parse_args(argv)

    t0 = time.time()
    files = sorted(walk_png(args.roots))
    print('slim_png mode=%s: %d 个 png，min_bytes=%d min_gain=%.0f%%%s' % (
        args.mode, len(files), args.min_bytes, args.min_gain * 100,
        ' [DRY-RUN]' if args.dry_run else ''))
    results = []
    pair_list = [(f, args) for f in files]
    if args.jobs > 1 and len(files) > 4:
        from concurrent.futures import ProcessPoolExecutor
        with ProcessPoolExecutor(max_workers=args.jobs) as ex:
            for i, r in enumerate(ex.map(_worker, pair_list), 1):
                results.append(r)
                if r['after'] < r['before']:
                    print('  [%d/%d] %8.1f KB -> %8.1f KB  %-20s %s' % (
                        i, len(files), kb(r['before']), kb(r['after']), r['strategy'],
                        os.path.basename(r['path'])))
    else:
        for i, pr in enumerate(pair_list, 1):
            r = slim_one(*pr)
            results.append(r)
            if r['after'] < r['before']:
                print('  [%d/%d] %8.1f KB -> %8.1f KB  %-20s %s' % (
                    i, len(files), kb(r['before']), kb(r['after']), r['strategy'],
                    os.path.basename(r['path'])))

    before = sum(r['before'] for r in results)
    after = sum(r['after'] for r in results)
    hit = [r for r in results if r['after'] < r['before']]
    noop = [r for r in results if r['after'] >= r['before']]
    lines = []
    lines.append('=== slim_png 报告 %s ===' % time.strftime('%Y-%m-%d %H:%M:%S'))
    lines.append('根目录: %s' % ', '.join(args.roots))
    lines.append('模式: %s  %s' % (args.mode, 'DRY-RUN（未写盘）' if args.dry_run else '实际替换'))
    lines.append('参数: min_bytes=%d min_gain=%.0f%% max_rgb_diff=%.2f max_alpha_diff=%.2f '
                 'relax_rgb=%.2f relax_gain=%.0f%% webp_q=%d webp_method=%d alpha_q=%d' % (
                     args.min_bytes, args.min_gain * 100, args.max_rgb_diff, args.max_alpha_diff,
                     args.relax_rgb_diff, args.relax_min_gain * 100, args.webp_quality,
                     args.webp_method, args.alpha_quality))
    lines.append('')
    lines.append('处理 %d 个 png：%d 个被瘦身（changed=%d），%d 个保持原样' % (
        len(results), len(hit), len([r for r in hit if r['changed']]), len(noop)))
    lines.append('字节合计: %d -> %d  省 %d B (%.2f MB)，降幅 %.1f%%' % (
        before, after, before - after, (before - after) / 1048576.0,
        100.0 * (before - after) / before if before else 0))
    if hit:
        lines.append('')
        lines.append('--- 被瘦身的文件（%d 个）---' % len(hit))
        for r in sorted(hit, key=lambda x: x['before'] - x['after'], reverse=True):
            lines.append('%-8d -> %-8d 省 %7d B (%5.1f%%) %-18s rgb_diff=%.2f alpha_diff=%.2f  %s' % (
                r['before'], r['after'], r['before'] - r['after'],
                100.0 * (r['before'] - r['after']) / r['before'], r['strategy'], r['rgb'],
                r['alpha'], r['path']))
    lines.append('')
    lines.append('--- 未改动（%d 个）---' % len(noop))
    for r in noop:
        lines.append('%-8d  %-20s %s' % (r['before'], r['strategy'], r['note'][:110]))
    lines.append('')
    lines.append('耗时 %.1f s' % (time.time() - t0))
    text = '\n'.join(lines)
    print('')
    print('\n'.join(lines[3:7]))
    if args.report:
        d = os.path.dirname(os.path.abspath(args.report))
        if d:
            os.makedirs(d, exist_ok=True)
        with open(args.report, 'w', encoding='utf-8') as f:
            f.write(text)
        print('报告已写入: %s' % args.report)
    return 0


if __name__ == '__main__':
    sys.exit(main())
