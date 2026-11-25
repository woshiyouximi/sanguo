"""Sango2 (三国群英传2) 美术资源全量导出。

用法：
    python export_all.py                 # 全部
    python export_all.py shp tex tga msk font sheets manifest
    python export_all.py shp --limit 50  # 调试

产出：
    F:\\sanguo\\export\\png\\SHAPE\\...   10969 张 SHP -> PNG（RGBA，色键 -> alpha=0）
    F:\\sanguo\\export\\png\\tex\\...     .TEX (TGA) -> PNG
    F:\\sanguo\\export\\png\\tga\\...     .TGA -> PNG
    F:\\sanguo\\export\\png\\msk\\...     .MSK -> PNG（地形图，调色板版 + 灰度版）
    F:\\sanguo\\export\\png\\font\\...    点阵字体字表/样张
    F:\\sanguo\\export\\sheets\\...       contact sheet
    F:\\sanguo\\export\\manifest_art.json
"""
import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sango_shp as SHP
import sango_tex as TEX
import sango_msk as MSK
import sango_font as FONT

SRC = r'F:\sanguo\extract\pak'
OUT = r'F:\sanguo\export'
PNG = os.path.join(OUT, 'png')
SHEETS = os.path.join(OUT, 'sheets')
MANIFEST = os.path.join(OUT, 'manifest_art.json')


def sha1(b):
    return hashlib.sha1(b).hexdigest()


def walk(ext=None):
    for root, dirs, files in os.walk(SRC):
        dirs.sort()
        for f in sorted(files):
            if ext and not f.lower().endswith(ext):
                continue
            yield os.path.join(root, f)


def rel(p):
    return os.path.relpath(p, SRC).replace('\\', '/')


def ensure(p):
    d = os.path.dirname(p)
    if d and not os.path.isdir(d):
        os.makedirs(d)


# ---------------------------------------------------------------- SHP
def export_shp(limit=None, quiet=False):
    recs = []
    n = 0
    t0 = time.time()
    for p in walk('.shp'):
        if limit and n >= limit:
            break
        r = rel(p)
        try:
            data = open(p, 'rb').read()
            s = SHP.parse(data, p)
            # 非空像素占比
            w, h, rgba = SHP.to_rgba(s)
            npx = w * h
            # alpha=0 的像素就是空/色键
            solid = 0
            step = 4
            for i in range(3, len(rgba), step):
                if rgba[i]:
                    solid += 1
            dst = os.path.join(PNG, r[:-4] + '.png')
            ensure(dst)
            from PIL import Image
            Image.frombytes('RGBA', (w, h), bytes(rgba)).save(dst, optimize=False)
            recs.append({
                'path': r, 'type': 'shp', 'bytes': len(data), 'width': w, 'height': h,
                'rows': len(s.rows), 'key': '0x%04X' % s.key, 'offx': s.offx, 'offy': s.offy,
                'runs': sum(len(x) for x in s.rows),
                'ink': round(solid / float(npx), 5) if npx else 0,
                'png': 'png/' + r[:-4] + '.png',
                'sha1': sha1(data),
            })
        except Exception as e:
            recs.append({'path': r, 'type': 'shp', 'error': repr(e)})
        n += 1
        if not quiet and n % 500 == 0:
            print('  shp %d  %.1fs' % (n, time.time() - t0), flush=True)
    return recs


# ---------------------------------------------------------------- TEX
def export_tex():
    recs = []
    for p in walk('.tex'):
        r = rel(p)
        try:
            t = TEX.load(p)
            im = TEX.to_image(t)
            dst = os.path.join(PNG, 'tex', r.replace('/', '_')[:-4] + '.png')
            ensure(dst)
            im.save(dst)
            recs.append({'path': r, 'type': 'tex', 'bytes': os.path.getsize(p),
                         'width': t.width, 'height': t.height, 'bpp': t.bpp,
                         'desc': t.desc, 'trailer': len(t.trailer),
                         'png': 'png/tex/' + os.path.basename(dst), 'sha1': sha1(open(p, 'rb').read())})
        except Exception as e:
            recs.append({'path': r, 'type': 'tex', 'error': repr(e)})
    return recs


# ---------------------------------------------------------------- TGA
def export_tga():
    recs = []
    for p in walk('.tga'):
        r = rel(p)
        try:
            t = TEX.load(p)
            im = TEX.to_image(t)
            dst = os.path.join(PNG, 'tga', r.replace('/', '_')[:-4] + '.png')
            ensure(dst)
            im.save(dst)
            recs.append({'path': r, 'type': 'tga', 'bytes': os.path.getsize(p),
                         'width': t.width, 'height': t.height, 'bpp': t.bpp,
                         'desc': t.desc, 'trailer': len(t.trailer),
                         'png': 'png/tga/' + os.path.basename(dst), 'sha1': sha1(open(p, 'rb').read())})
        except Exception as e:
            recs.append({'path': r, 'type': 'tga', 'error': repr(e)})
    return recs


# ---------------------------------------------------------------- MSK
def export_msk():
    recs = []
    for p in walk('.msk'):
        r = rel(p)
        try:
            m = MSK.load(p)
            base = r.replace('/', '_')[:-4]
            dst = os.path.join(PNG, 'msk', base + '.png')
            ensure(dst)
            MSK.to_image(m, 'palette').save(dst)
            MSK.to_image(m, 'gray').save(os.path.join(PNG, 'msk', base + '_gray.png'))
            hist = {}
            for v in m.pixels:
                hist[v] = hist.get(v, 0) + 1
            recs.append({'path': r, 'type': 'msk', 'bytes': os.path.getsize(p),
                         'width': m.width, 'height': m.height, 'header': m.header.hex(),
                         'consumed': m.consumed, 'palette': [list(c) for c in m.palette],
                         'values': dict(sorted((str(k), v) for k, v in hist.items())),
                         'png': 'png/msk/' + base + '.png',
                         'sha1': sha1(open(p, 'rb').read())})
        except Exception as e:
            recs.append({'path': r, 'type': 'msk', 'error': repr(e)})
    return recs


# ---------------------------------------------------------------- 字体
def export_font():
    from PIL import Image, ImageDraw
    recs = []
    d = os.path.join(PNG, 'font')
    if not os.path.isdir(d):
        os.makedirs(d)
    f20 = FONT.BitmapFont(os.path.join(SRC, 'SANGO.20'), index=FONT.load_idx(os.path.join(SRC, 'SANGO.IDX')))
    f15 = FONT.BitmapFont(os.path.join(SRC, 'SANGO.15'), index=FONT.load_idx(os.path.join(SRC, 'SANGO.IDX')))

    # 样张
    lines = ['三國群英傳２', '曹操 劉備 孫權 關羽 張飛', '諸葛亮 司馬懿 呂布 貂蟬',
             '桃園三結義 赤壁之戰', '西元一九九年 許昌 洛陽 成都']
    for font, name, z in ((f20, 'sample_20', 3), (f15, 'sample_15', 4)):
        ims = [FONT.render_text(font, s) for s in lines]
        W = max(i.width for i in ims) * z
        H = sum(i.height for i in ims) * z + 8 * len(ims)
        out = Image.new('RGB', (W, H), (16, 16, 20))
        y = 0
        for i in ims:
            i = i.resize((i.width * z, i.height * z), Image.NEAREST)
            out.paste(i, (0, y), i)
            y += i.height + 8
        out.save(os.path.join(d, name + '.png'))

    # 全字表：13867 槽，80 列
    for font, name, sc in ((f20, 'table_20', 1), (f15, 'table_15', 1)):
        cols = 80
        cw, ch = font.width * sc + 1, font.height * sc + 1
        rows = (font.count + cols - 1) // cols
        out = Image.new('RGB', (cols * cw, rows * ch), (16, 16, 20))
        for s in range(font.count):
            g = font.glyph_image(s)
            out.paste(g, ((s % cols) * cw, (s // cols) * ch), g)
        out.save(os.path.join(d, name + '.png'))
        # 分块字表（每块 3200 字，便于肉眼核对）
        per = 3200
        for k in range(0, font.count, per):
            cnt = min(per, font.count - k)
            c2 = 80
            r2 = (cnt + c2 - 1) // c2
            im2 = Image.new('RGB', (c2 * cw * 2, r2 * ch * 2), (16, 16, 20))
            for j in range(cnt):
                g = font.glyph_image(k + j).resize((font.width * 2, font.height * 2), Image.NEAREST)
                im2.paste(g, ((j % c2) * cw * 2, (j // c2) * ch * 2), g)
            im2.save(os.path.join(d, '%s_%05d.png' % (name, k)))

    # 英文字模
    for fn, w, h, per in (('MINGASC.20', 10, 20, 2), ('OLDASC.15', 8, 15, 1)):
        ef = FONT.BitmapFont(os.path.join(SRC, fn))
        cols = 32
        cw, ch = w * 2 + 1, h * 2 + 1
        out = Image.new('RGB', (cols * cw, 8 * ch), (16, 16, 20))
        for i in range(256):
            g = ef.glyph_image(i).resize((w * 2, h * 2), Image.NEAREST)
            out.paste(g, ((i % cols) * cw, (i // cols) * ch), g)
        out.save(os.path.join(d, fn.split('.')[0].lower() + '_table.png'))
        recs.append({'path': fn, 'type': 'font', 'bytes': os.path.getsize(os.path.join(SRC, fn)),
                     'width': w, 'height': h, 'glyphs': ef.count,
                     'png': 'png/font/' + fn.split('.')[0].lower() + '_table.png'})

    for fn, font, w, h in (('SANGO.20', f20, 20, 20), ('SANGO.15', f15, 16, 15)):
        recs.append({'path': fn, 'type': 'font', 'bytes': os.path.getsize(os.path.join(SRC, fn)),
                     'width': w, 'height': h, 'glyphs': font.count, 'cell': font.cell,
                     'png': 'png/font/table_%s.png' % fn.split('.')[1]})
    recs.append({'path': 'SANGO.IDX', 'type': 'fontidx',
                 'bytes': os.path.getsize(os.path.join(SRC, 'SANGO.IDX')),
                 'entries': len(f20.index), 'note': 'Big5 code -> glyph slot (1-based)'})
    return recs


# ---------------------------------------------------------------- contact sheet
def make_sheet(paths, dst, cols=20, cell=72, title=None, maxn=400, strip=''):
    from PIL import Image, ImageDraw
    paths = paths[:maxn]
    rows = (len(paths) + cols - 1) // cols
    pad = 12
    im = Image.new('RGB', (cols * cell, rows * (cell + pad) + (18 if title else 0)), (28, 28, 34))
    dr = ImageDraw.Draw(im)
    y0 = 0
    if title:
        dr.text((4, 3), title, fill=(255, 220, 120))
        y0 = 18
    for i, p in enumerate(paths):
        try:
            g = Image.open(p)
        except Exception:
            continue
        g = g.convert('RGBA')
        g.thumbnail((cell - 4, cell - 4), Image.NEAREST)
        x = (i % cols) * cell
        y = y0 + (i // cols) * (cell + pad)
        im.paste(g, (x + (cell - g.width) // 2, y + (cell - g.height) // 2), g)
        nm = os.path.basename(p)[:-4]
        if strip and nm.startswith(strip):
            nm = nm[len(strip):]
        dr.text((x + 2, y + cell - 8), nm[:16], fill=(150, 200, 150))
    im.save(dst)
    return dst


def export_sheets(manifest):
    """每类 1~2 张 contact sheet：>400 的文件组按 400 分块，最多 2 块（超出部分抽样）。"""
    if not os.path.isdir(SHEETS):
        os.makedirs(SHEETS)
    for f in os.listdir(SHEETS):          # 先清空，保证可重复运行
        if f.endswith('.png'):
            os.remove(os.path.join(SHEETS, f))
    groups = {}
    for r in manifest:
        if r.get('type') != 'shp' or 'png' not in r:
            continue
        parts = r['path'].split('/')
        if parts[0] == 'SHAPE' and len(parts) > 2:
            # MAJOR/BODY、MAJOR/WEAPON、MAJOR/HORSE 各自成组；MAGIC 归并成一组
            if parts[1] in ('MAJOR', 'MAGIC'):
                key = 'MAJOR_' + parts[2] if parts[1] == 'MAJOR' else 'MAGIC'
            else:
                key = parts[1]
        else:
            key = 'SHAPE_root'
        groups.setdefault(key, []).append(os.path.join(OUT, r['png']))
    out = []
    for k, v in sorted(groups.items()):
        v.sort()
        per = 400
        chunks = [v[i:i + per] for i in range(0, len(v), per)]
        # MAGIC（41 个数字子目录）与 >800 的文件组只做 2 张，其余抽样均匀覆盖
        if len(chunks) > 2:
            step = max(1, len(v) // per)
            sampled = v[::step][:per]
            chunks = [v[:per], sampled]
        for i, ch in enumerate(chunks):
            name = 'sheet_%s%s.png' % (k, '' if i == 0 else '_b')
            tag = 'part %d' % (i + 1) if len(chunks) > 1 else 'all'
            dst = os.path.join(SHEETS, name)
            make_sheet(ch, dst, title='%s  %d files (%s)' % (k, len(v), tag),
                       cols=20, cell=76, maxn=per)
            out.append(dst)
    # 其他格式（tex/tga/msk/font 已在 png/ 下扁平存放）
    for sub, cols, cell in (('tex', 3, 300), ('tga', 4, 220), ('msk', 2, 360), ('font', 3, 320)):
        d = os.path.join(PNG, sub)
        if os.path.isdir(d):
            v = sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith('.png'))
            if v:
                dst = os.path.join(SHEETS, 'sheet_%s.png' % sub)
                make_sheet(v, dst, cols=cols, cell=cell, title=sub + '  (%d)' % len(v),
                           maxn=24, strip='SHAPE_')
                out.append(dst)
    return out


# ---------------------------------------------------------------- 音频
def audio_inventory():
    import wave
    recs = []
    for p in walk('.wav'):
        r = rel(p)
        try:
            with wave.open(p, 'rb') as wv:
                rec = {'path': r, 'type': 'wav', 'bytes': os.path.getsize(p),
                       'channels': wv.getnchannels(), 'rate': wv.getframerate(),
                       'bits': wv.getsampwidth() * 8, 'frames': wv.getnframes(),
                       'seconds': round(wv.getnframes() / float(wv.getframerate() or 1), 3)}
            recs.append(rec)
        except Exception as e:
            recs.append({'path': r, 'type': 'wav', 'bytes': os.path.getsize(p), 'error': repr(e)})
    for p in walk('.mp3'):
        recs.append({'path': rel(p), 'type': 'mp3', 'bytes': os.path.getsize(p)})
    # MP3 在外层目录（PAK 之外）
    ext = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\MP3'
    if os.path.isdir(ext):
        for f in sorted(os.listdir(ext)):
            fp = os.path.join(ext, f)
            if os.path.isfile(fp):
                recs.append({'path': 'MP3/' + f, 'type': 'mp3', 'bytes': os.path.getsize(fp),
                             'external': True})
    return recs


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    limit = None
    for a in sys.argv[1:]:
        if a.startswith('--limit'):
            limit = int(a.split('=')[1]) if '=' in a else None
    do = set(args) if args else {'shp', 'tex', 'tga', 'msk', 'font', 'sheets', 'manifest', 'audio'}

    man = []
    if 'shp' in do:
        print('[shp] ...', flush=True)
        r = export_shp(limit=limit)
        print('[shp] %d files' % len(r), flush=True)
        man += r
    if 'tex' in do:
        print('[tex] ...', flush=True)
        r = export_tex()
        print('[tex] %d' % len(r), flush=True)
        man += r
    if 'tga' in do:
        print('[tga] ...', flush=True)
        r = export_tga()
        print('[tga] %d' % len(r), flush=True)
        man += r
    if 'msk' in do:
        print('[msk] ...', flush=True)
        r = export_msk()
        print('[msk] %d' % len(r), flush=True)
        man += r
    if 'font' in do:
        print('[font] ...', flush=True)
        r = export_font()
        print('[font] %d' % len(r), flush=True)
        man += r
    if 'audio' in do:
        print('[audio] ...', flush=True)
        r = audio_inventory()
        print('[audio] %d' % len(r), flush=True)
        man += r

    # 合并旧 manifest 里本次没重跑的部分
    old = []
    if os.path.isfile(MANIFEST):
        try:
            old = json.load(open(MANIFEST, encoding='utf-8'))
        except Exception:
            old = []
    have = set((r.get('type'), r.get('path')) for r in man)
    for r in old:
        if (r.get('type'), r.get('path')) not in have:
            man.append(r)

    if 'sheets' in do:
        print('[sheets] ...', flush=True)
        export_sheets([r for r in man if r.get('type') == 'shp'])
        print('[sheets] done', flush=True)

    if 'manifest' in do or True:
        ensure(MANIFEST)
        json.dump(man, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('[manifest] %d records -> %s' % (len(man), MANIFEST), flush=True)


if __name__ == '__main__':
    main()
