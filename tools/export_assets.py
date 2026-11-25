"""三国群英传2 美术资源批量导出器。

产出：
  F:\\sanguo\\export\\png\\<相对路径>.png     10969 个 .SHP → RGBA PNG（RGB565，色键→alpha=0）
  F:\\sanguo\\export\\png_tga\\*.png           12 个 BG\\FLOOR*.TGA（16bpp TGA，自带解码器）
  F:\\sanguo\\export\\png_tex\\*.png           7 个 .TEX（640x480 RGB565，含 TEXTURE.TEX 0x2C 头）
  F:\\sanguo\\export\\sheets\\*.png            按目录的总览拼图（96px 格 + 文件名）
  F:\\sanguo\\export\\manifest.csv            资源清单
  F:\\sanguo\\export\\stats.json              统计（给文档用）

用法：
  python export_assets.py                # 全做（幂等，已存在的 PNG 会跳过）
  python export_assets.py --only shp
  python export_assets.py --only tex,tga
  python export_assets.py --only sheets,manifest
  python export_assets.py --force        # 强制重导
  python export_assets.py --jobs 8
"""
import os
import sys
import csv
import json
import time
import struct
import argparse
import traceback
from collections import Counter, defaultdict

ROOT = r'F:\sanguo\extract\pak\SHAPE'
EXP = r'F:\sanguo\export'
PNG_DIR = os.path.join(EXP, 'png')
TGA_DIR = os.path.join(EXP, 'png_tga')
TEX_DIR = os.path.join(EXP, 'png_tex')
MSK_DIR = os.path.join(EXP, 'png_msk')
SHEET_DIR = os.path.join(EXP, 'sheets')
MANIFEST = os.path.join(EXP, 'manifest.csv')
STATS = os.path.join(EXP, 'stats.json')

SHP_HDR = 0x24
ZERO = b'\x00\x00\x00\x00'


# ---------------------------------------------------------------- RGB565 表
_TAB = None


def tab565():
    """65536 项 RGB565 → 4 字节 RGBA（alpha=255）。"""
    global _TAB
    if _TAB is None:
        t = []
        for c in range(65536):
            r = (c >> 11) & 0x1F
            g = (c >> 5) & 0x3F
            b = c & 0x1F
            t.append(bytes(((r << 3) | (r >> 2),
                           (g << 2) | (g >> 4),
                           (b << 3) | (b >> 2), 255)))
        _TAB = t
    return _TAB


# ---------------------------------------------------------------- SHP
def shp_decode(data):
    """返回 (w, h, key, offx, offy, bytearray RGBA)。坏文件抛异常。"""
    if len(data) < SHP_HDR or data[:4] != b'TLHS':
        raise ValueError('not TLHS')
    key, w, h = struct.unpack_from('<3I', data, 0x10)
    offx, offy = struct.unpack_from('<2i', data, 0x1C)
    if SHP_HDR + 4 * h > len(data):
        raise ValueError('truncated offset table')
    if w <= 0 or h <= 0 or w > 8192 or h > 8192:
        raise ValueError('bad dims %dx%d' % (w, h))
    offs = struct.unpack_from('<%dI' % h, data, SHP_HDR)
    tab = tab565()
    get = tab.__getitem__
    buf = bytearray(w * h * 4)
    kk = key & 0xFFFF
    n = len(data)
    for y in range(h):
        start = offs[y]
        end = offs[y + 1] if y + 1 < h else n
        if end > n:
            end = n
        p = start
        base = y * w * 4
        while p + 4 <= end:
            x, cnt = struct.unpack_from('<HH', data, p)
            if x == 0xFFFF or cnt == 0xFFFF:
                break
            p += 4
            if p + 2 * cnt > end:
                break
            cols = struct.unpack_from('<%dH' % cnt, data, p)
            p += 2 * cnt
            if x >= w or cnt == 0:
                continue
            if x + cnt > w:
                cnt = w - x
                cols = cols[:cnt]
            o = base + x * 4
            if kk in cols:
                for c in cols:
                    buf[o:o + 4] = ZERO if c == kk else get(c)
                    o += 4
            else:
                buf[o:o + 4 * cnt] = b''.join(map(get, cols))
    return w, h, key, offx, offy, buf


def shp_meta(data):
    key, w, h = struct.unpack_from('<3I', data, 0x10)
    offx, offy = struct.unpack_from('<2i', data, 0x1C)
    return w, h, key, offx, offy


# ---------------------------------------------------------------- TGA（自写，16bpp/24bpp/32bpp）
def tga_decode(data):
    if len(data) < 18:
        raise ValueError('short TGA')
    idlen, cmap, typ = data[0], data[1], data[2]
    cm_first, cm_len, cm_bits = struct.unpack_from('<3H', data, 3)
    x0, y0, w, h = struct.unpack_from('<4H', data, 8)
    bpp, desc = data[16], data[17]
    if cmap not in (0, 1) or w == 0 or h == 0:
        raise ValueError('bad TGA hdr')
    p = 18 + idlen + (cm_len * ((cm_bits + 7) // 8) if cmap else 0)
    rle = (typ in (9, 10, 11))
    step = bpp // 8
    if step not in (2, 3, 4):
        raise ValueError('unsupported TGA bpp %d' % bpp)
    npx = w * h
    out = bytearray(npx * 4)
    tab = tab565() if step == 2 else None

    def put(idx, px):
        o = idx * 4
        out[o:o + 4] = px

    idx = 0
    while idx < npx:
        cnt = 1
        if rle:
            if p >= len(data):
                raise ValueError('TGA truncated')
            hb = data[p]
            p += 1
            cnt = (hb & 0x7F) + 1
            if hb & 0x80:
                if p + step > len(data):
                    raise ValueError('TGA truncated')
                px = data[p:p + step]
                p += step
                base = px[2], px[1], px[0]  # BGR
                if step == 2:
                    c = px[0] | (px[1] << 8)
                    r, g, b = (c >> 11) & 31, (c >> 5) & 63, c & 31
                    px4 = bytes(((r << 3) | (r >> 2), (g << 2) | (g >> 4),
                                 (b << 3) | (b >> 2), 255))
                else:
                    px4 = bytes((base[0], base[1], base[2], 255))
                for _ in range(min(cnt, npx - idx)):
                    put(idx, px4)
                    idx += 1
                continue
        for _ in range(min(cnt, npx - idx)):
            if p + step > len(data):
                raise ValueError('TGA truncated')
            if step == 2:
                c = data[p] | (data[p + 1] << 8)
                px4 = tab[c]
            elif step == 3:
                px4 = bytes((data[p + 2], data[p + 1], data[p], 255))
            else:
                px4 = bytes((data[p + 2], data[p + 1], data[p], 255))
            p += step
            put(idx, px4)
            idx += 1
    return w, h, 0, 0, 0, out


# ---------------------------------------------------------------- TEX
def tex_decode(data):
    if len(data) < 0x2C:
        raise ValueError('short TEX')
    magic = struct.unpack_from('<I', data, 0)[0]
    w, h = struct.unpack_from('<2H', data, 0x0C)
    if magic != 0x00020000:
        raise ValueError('bad TEX magic %08X' % magic)
    raw = w * h * 2
    if len(data) == raw + 0x2C:
        off = 0x2C          # TEXTURE.TEX
    elif len(data) == raw + 0x14:
        off = 0x14
    else:
        off = len(data) - raw
        if off < 0x14 or off > 0x400:
            raise ValueError('unexpected TEX size %d for %dx%d' % (len(data), w, h))
    src = data[off:off + raw]
    tab = tab565()
    get = tab.__getitem__
    # RGB565 → RGBA（不含色键）
    buf = bytearray(w * h * 4)
    vals = struct.unpack('<%dH' % (w * h), src)
    buf[:] = b''.join(map(get, vals))
    return w, h, 0xFFFF, 0, 0, buf


# ---------------------------------------------------------------- 单文件导出
def rel_of(path):
    return os.path.relpath(path, ROOT).replace('\\', '/')


def category_of(rel):
    parts = rel.split('/')
    if len(parts) == 1:
        return '(root)'
    if parts[0] == 'MAJOR':
        return 'MAJOR/' + parts[1]
    return parts[0]


def export_one(job):
    """job = (src, dst, force) -> dict。worker 里跑。"""
    src, dst, force = job
    rel = rel_of(src)
    ext = os.path.splitext(src)[1].upper()
    rec = {'path': rel, 'category': category_of(rel), 'bytes': 0,
           'width': 0, 'height': 0, 'offx': 0, 'offy': 0, 'key': 0,
           'frames': '', 'png_path': '', 'type': ext.lstrip('.'), 'status': 'ok'}
    try:
        st = os.stat(src)
        rec['bytes'] = st.st_size
        if (not force) and os.path.exists(dst) and os.path.getsize(dst) > 0 \
                and os.path.getmtime(dst) >= st.st_mtime:
            with open(src, 'rb') as f:
                head = f.read(0x30)
            if ext == '.SHP':
                rec['width'], rec['height'], rec['key'], rec['offx'], rec['offy'] = shp_meta(head)
            elif ext == '.TGA':
                rec['width'], rec['height'] = struct.unpack_from('<2H', head, 12)
            else:
                rec['width'], rec['height'] = struct.unpack_from('<2H', head, 0x0C)
                rec['key'] = 0xFFFF
            rec['png_path'] = os.path.relpath(dst, EXP).replace('\\', '/')
            rec['status'] = 'skip'
            return rec
        with open(src, 'rb') as f:
            data = f.read()
        if ext == '.SHP':
            w, h, key, ox, oy, buf = shp_decode(data)
            mode = 'RGBA'
        elif ext == '.TGA':
            w, h, key, ox, oy, buf = tga_decode(data)
            mode = 'RGBA'
        else:
            w, h, key, ox, oy, buf = tex_decode(data)
            mode = 'RGBA'
        from PIL import Image
        img = Image.frombytes(mode, (w, h), bytes(buf))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        tmp = dst + '.tmp'
        img.save(tmp, 'PNG', compress_level=6)
        os.replace(tmp, dst)
        rec.update(width=w, height=h, key=key, offx=ox, offy=oy,
                   png_path=os.path.relpath(dst, EXP).replace('\\', '/'))
        return rec
    except Exception as e:
        rec['status'] = 'ERR %s: %s' % (type(e).__name__, e)
        return rec


# ---------------------------------------------------------------- 任务清单
def build_jobs(force):
    jobs = []
    for dp, dn, fn in os.walk(ROOT):
        for f in sorted(fn):
            ext = os.path.splitext(f)[1].upper()
            src = os.path.join(dp, f)
            if ext == '.SHP':
                dst = os.path.join(PNG_DIR, os.path.relpath(src, ROOT)) + '.png'
            elif ext == '.TGA':
                dst = os.path.join(TGA_DIR, os.path.splitext(f)[0] + '.png')
            elif ext == '.TEX':
                dst = os.path.join(TEX_DIR, os.path.splitext(f)[0] + '.png')
            else:
                continue
            jobs.append((src, dst, force))
    jobs.sort(key=lambda j: j[0].upper())
    return jobs


def run_export(jobs, procs):
    t0 = time.time()
    total = len(jobs)
    done = 0
    recs = []
    errs = []
    if procs <= 1:
        for j in jobs:
            r = export_one(j)
            recs.append(r)
            if r['status'].startswith('ERR'):
                errs.append(r)
            done += 1
            if done % 100 == 0 or done == total:
                el = time.time() - t0
                print('[%5d/%5d] %5.1f%%  %5.1f f/s  ETA %s  err=%d' % (
                    done, total, 100.0 * done / total, done / max(el, 1e-6),
                    fmt_eta(el / done * (total - done)), len(errs)), flush=True)
    else:
        from multiprocessing import Pool
        with Pool(processes=procs) as pool:
            for r in pool.imap_unordered(export_one, jobs, chunksize=8):
                recs.append(r)
                if r['status'].startswith('ERR'):
                    errs.append(r)
                    print('ERR', r['path'], r['status'], flush=True)
                done += 1
                if done % 200 == 0 or done == total:
                    el = time.time() - t0
                    print('[%5d/%5d] %5.1f%%  %5.1f f/s  ETA %s  err=%d' % (
                        done, total, 100.0 * done / total, done / max(el, 1e-6),
                        fmt_eta(el / done * (total - done)), len(errs)), flush=True)
    el = time.time() - t0
    print('导出完成：%d 个文件，用时 %.1fs（%.1f f/s），错误 %d' % (
        len(recs), el, len(recs) / max(el, 1e-6), len(errs)), flush=True)
    if errs:
        with open(os.path.join(EXP, '_errors.txt'), 'w', encoding='utf-8') as f:
            for r in errs:
                f.write('%s\t%s\n' % (r['path'], r['status']))
    return recs


def fmt_eta(sec):
    sec = int(max(0, sec))
    return '%02d:%02d' % (sec // 60, sec % 60)


# ---------------------------------------------------------------- 拼图
SHEET_ORDER = ['FACE', 'MAJOR/BODY', 'MAJOR/WEAPON', 'MAJOR/HORSE', 'FORCE',
               'MAGIC', 'MENU', 'TROOP', 'MAP', 'BG', 'POLICY', 'JEWEL', '(root)']
SHEET_NAME = {'MAJOR/BODY': 'MAJOR_BODY', 'MAJOR/WEAPON': 'MAJOR_WEAPON',
              'MAJOR/HORSE': 'MAJOR_HORSE', '(root)': 'ROOT'}
CELL = 96
PAD = 4
LABEL_H = 12
COLS, ROWS = 20, 20
MAXCELL = COLS * ROWS


def _font():
    from PIL import ImageFont
    for p in (r'C:\Windows\Fonts\consola.ttf', r'C:\Windows\Fonts\arial.ttf'):
        try:
            return ImageFont.truetype(p, 9)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size=9)
    except Exception:
        return ImageFont.load_default()


def _fit(im):
    from PIL import Image
    w, h = im.size
    s = min(CELL / float(w), CELL / float(h))
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    if (nw, nh) == (w, h):
        return im
    return im.resize((nw, nh), Image.NEAREST)


def build_sheets(recs, msk_pngs):
    from PIL import Image, ImageDraw
    font = _font()
    # 分组
    groups = defaultdict(list)
    for r in recs:
        if not r['png_path']:
            continue
        groups[r['category']].append(r)
    for r in msk_pngs:
        groups['MAP'].append(r)
    # 排序
    for k in groups:
        groups[k].sort(key=lambda r: r['path'].upper())
    os.makedirs(SHEET_DIR, exist_ok=True)
    made = []
    order = [c for c in SHEET_ORDER if c in groups]
    order += [c for c in groups if c not in SHEET_ORDER]
    for cat in order:
        items = groups[cat]
        if not items:
            continue
        # 分组行（MAGIC 这类带子目录的）
        rows = []
        last_sub = None
        for r in items:
            parts = r['path'].split('/')
            sub = parts[1] if len(parts) > 2 else ''
            if sub != last_sub:
                rows.append(('H', sub or cat))
                last_sub = sub
            rows.append(('I', r))
        # 分页：按格子数估算（H 行占一格）
        pages = []
        cur = []
        n = 0
        for it in rows:
            if n >= MAXCELL:
                pages.append(cur)
                cur, n = [], 0
            cur.append(it)
            n += 1
        if cur:
            pages.append(cur)
        base = SHEET_NAME.get(cat, cat.replace('/', '_'))
        for pi, page in enumerate(pages, 1):
            name = base + '.png' if len(pages) == 1 else '%s_p%02d.png' % (base, pi)
            dst = os.path.join(SHEET_DIR, name)
            W = COLS * (CELL + PAD) + PAD
            H = 26 + ROWS * (CELL + LABEL_H + PAD) + PAD
            sheet = Image.new('RGBA', (W, H), (28, 28, 32, 255))
            d = ImageDraw.Draw(sheet)
            d.text((6, 6), '%s  (%d 项, 第 %d/%d 页, 每格 %dpx)' % (
                cat, len(items), pi, len(pages), CELL), fill=(230, 230, 120, 255), font=font)
            x = PAD
            y = 26
            col = 0
            for kind, obj in page:
                if kind == 'H':
                    if col:
                        col = 0
                        y += CELL + LABEL_H + PAD
                    d.rectangle([0, y, W, y + LABEL_H], fill=(52, 52, 66, 255))
                    d.text((6, y + 1), '— %s —' % obj, fill=(160, 200, 255, 255), font=font)
                    y += LABEL_H + 2
                    continue
                r = obj
                png = os.path.join(EXP, r['png_path'].replace('/', os.sep))
                try:
                    im = Image.open(png)
                    im.load()
                except Exception:
                    im = None
                if im is not None:
                    im = _fit(im)
                    # 透明底棋盘
                    for by in range(0, CELL, 12):
                        for bx in range(0, CELL, 12):
                            if ((bx // 12) + (by // 12)) % 2 == 0:
                                d.rectangle([x + bx, y + by, x + min(bx + 11, CELL - 1),
                                             y + min(by + 11, CELL - 1)], fill=(44, 44, 52, 255))
                    px = x + (CELL - im.width) // 2
                    py = y + (CELL - im.height) // 2
                    sheet.alpha_composite(im.convert('RGBA'), (px, py))
                d.rectangle([x, y, x + CELL - 1, y + CELL - 1], outline=(70, 70, 80, 255))
                label = os.path.basename(r['path'])
                while label and d.textlength(label, font=font) > CELL and len(label) > 4:
                    label = label[:-1]
                d.text((x + 1, y + CELL + 1), label, fill=(200, 200, 200, 255), font=font)
                col += 1
                x += CELL + PAD
                if col >= COLS:
                    col = 0
                    x = PAD
                    y += CELL + LABEL_H + PAD
            sheet.convert('RGB').save(dst, 'PNG', compress_level=6)
            made.append(dst)
            print('sheet %-28s %d 项 -> %s' % (cat, len(page), name), flush=True)
    return made


# ---------------------------------------------------------------- manifest / stats
MAN_COLS = ['path', 'category', 'bytes', 'width', 'height', 'offx', 'offy',
            'key', 'frames', 'png_path', 'type']


def write_manifest(recs):
    recs = sorted(recs, key=lambda r: r['path'].upper())
    os.makedirs(EXP, exist_ok=True)
    tmp = MANIFEST + '.tmp'
    with open(tmp, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=MAN_COLS, extrasaction='ignore')
        w.writeheader()
        for r in recs:
            row = dict(r)
            row['key'] = '0x%04X' % (r['key'] & 0xFFFF)
            w.writerow(row)
    os.replace(tmp, MANIFEST)
    print('manifest:', MANIFEST, len(recs), '行', flush=True)
    return MANIFEST


def write_stats(recs):
    by_cat = defaultdict(lambda: {'n': 0, 'bytes': 0, 'px': 0,
                                  'dims': Counter(), 'keys': Counter(),
                                  'w': [], 'h': []})
    for r in recs:
        c = by_cat[r['category']]
        c['n'] += 1
        c['bytes'] += r['bytes']
        c['px'] += r['width'] * r['height']
        c['dims'][(r['width'], r['height'])] += 1
        c['keys']['0x%04X' % (r['key'] & 0xFFFF)] += 1
        c['w'].append(r['width'])
        c['h'].append(r['height'])
    out = {}
    for k, v in by_cat.items():
        ws = sorted(v['w'])
        hs = sorted(v['h'])
        out[k] = {
            'n': v['n'], 'bytes': v['bytes'], 'megapixels': round(v['px'] / 1e6, 3),
            'dims_top': [{'w': d[0][0], 'h': d[0][1], 'n': d[1]} for d in v['dims'].most_common(6)],
            'keys': v['keys'].most_common(8),
            'w_min': ws[0], 'w_med': ws[len(ws) // 2], 'w_max': ws[-1],
            'h_min': hs[0], 'h_med': hs[len(hs) // 2], 'h_max': hs[-1],
        }
    with open(STATS, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('stats:', STATS, flush=True)


# ---------------------------------------------------------------- 主流程
def msk_png_records():
    """把 png_msk 里已导出的 MSK PNG 做成拼图用的伪记录。"""
    out = []
    if os.path.isdir(MSK_DIR):
        for f in sorted(os.listdir(MSK_DIR)):
            if f.lower().endswith('.png'):
                p = os.path.join(MSK_DIR, f)
                out.append({'path': 'MAP/' + f.replace('.png', '.MSK'),
                            'category': 'MAP', 'png_path': 'png_msk/' + f,
                            'bytes': os.path.getsize(p), 'width': 0, 'height': 0})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='shp,tex,tga,sheets,manifest')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--jobs', type=int, default=min(8, (os.cpu_count() or 4)))
    args = ap.parse_args()
    want = set(x.strip() for x in args.only.split(',') if x.strip())
    os.makedirs(EXP, exist_ok=True)
    t0 = time.time()
    recs = []
    if want & {'shp', 'tex', 'tga'}:
        jobs = build_jobs(args.force)
        if 'shp' in want and 'tga' in want and 'tex' in want:
            pass
        else:
            keep = []
            for j in jobs:
                e = os.path.splitext(j[0])[1].upper().lstrip('.')
                if (e == 'SHP' and 'shp' in want) or (e == 'TGA' and 'tga' in want) \
                        or (e == 'TEX' and 'tex' in want):
                    keep.append(j)
            jobs = keep
        print('待处理 %d 个文件，%d 进程' % (len(jobs), args.jobs), flush=True)
        recs = run_export(jobs, args.jobs)
    else:
        # 只做拼图/清单：从已有 PNG 反推记录
        if os.path.exists(MANIFEST):
            with open(MANIFEST, encoding='utf-8-sig') as f:
                for row in csv.DictReader(f):
                    row['bytes'] = int(row['bytes'])
                    row['width'] = int(row['width'])
                    row['height'] = int(row['height'])
                    row['key'] = int(row['key'], 16)
                    row['offx'] = int(row['offx'])
                    row['offy'] = int(row['offy'])
                    recs.append(row)
    if not recs:
        print('没有记录，退出', flush=True)
        return
    if 'manifest' in want:
        write_manifest(recs)
        write_stats(recs)
    if 'sheets' in want:
        made = build_sheets(recs, msk_png_records())
        print('拼图 %d 张，用时 %.1fs' % (len(made), time.time() - t0), flush=True)
    print('总用时 %.1fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
