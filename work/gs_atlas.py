# -*- coding: utf-8 -*-
"""主将战场小人图集打包器
输出 game/web/anim/general/index.json + sheet_NN.png
锚点语义（见 project/48_武将小人装配.md）：draw = (unitX,unitY) - (ox,oy)
用法：python gs_atlas.py [--test] [--tiers 1,2]
"""
import io, json, os, sys, time
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'F:\sanguo'
SRC = os.path.join(ROOT, 'export', 'png', 'SHAPE')
INV = json.load(open(os.path.join(ROOT, 'work', 'gen_sprites', 'inventory.json'), encoding='utf-8'))
THINGS = json.load(open(os.path.join(ROOT, 'work', 'things_parsed.json'), encoding='utf-8'))
DST = os.path.join(ROOT, 'game', 'web', 'anim', 'general')
SHAPES = '123456789ABCDE0'
OBJ = {o['sequence']: o for o in THINGS['objects'] if o.get('sequence')}

BODY_TIER = {'Wait': 1, 'Walk': 1, 'Attack': 1,
             'Death': 2, 'Defense': 2, 'Pain': 2, 'Shot1': 2, 'Spell1': 2,
             'Attack2': 3, 'Attack3': 3}
WPN_TIER = {'Wait': 1, 'Attack': 1, 'Attack2': 3, 'Attack3': 3}
HOR_TIER = {'Wait': 1, 'Walk': 1, 'Attack': 1}
TIERS = {1, 2, 3}
COLORS = 63

META = {'BODY': INV['files']['BODY'], 'WEAPON': INV['files']['WEAPON'], 'HORSE': INV['files']['HORSE']}
CATDIR = {'BODY': 'MAJOR/BODY', 'WEAPON': 'MAJOR/WEAPON', 'HORSE': 'MAJOR/HORSE'}
_cache = {}


def cat_of(name):
    if name[0] in 'LR':
        return 'BODY'
    if name[0] == 'H':
        return 'HORSE'
    return 'WEAPON'


def frame(name):
    """返回 (RGBA image 已裁到 ink bbox, ox, oy)；ox/oy 为锚点相对图左上的偏移"""
    if name in _cache:
        return _cache[name]
    cat = cat_of(name)
    m = META[cat][name]
    im = Image.open(os.path.join(SRC, CATDIR[cat], name + '.png')).convert('RGBA')
    a = np.array(im)
    ys, xs = np.where(a[:, :, 3] > 0)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    im = im.crop((x0, y0, x1 + 1, y1 + 1))
    r = (im, m['offx'] - x0, m['offy'] - y0, (x1 - x0 + 1) * (y1 - y0 + 1) / float(m['width'] * m['height']))
    _cache[name] = r
    return r


def decode_body(seq):
    if 600 <= seq < 660:
        side, base = 'L', 600
    elif 800 <= seq < 860:
        side, base = 'R', 800
    else:
        return None
    i = (seq - base) // 4
    return side, SHAPES[i], (seq - base) % 4 + 1


def collect():
    frames, order = {}, []
    groups, actions, objects = {}, {}, {}

    def want(name, cat):
        if name not in frames:
            frames[name] = cat
            order.append(name)

    for seq, o in sorted(OBJ.items()):
        if not (600 <= seq <= 659 or 700 <= seq <= 767 or 800 <= seq <= 859 or 900 <= seq <= 907):
            continue
        d = decode_body(seq)
        cat = 'BODY' if d else ('HORSE' if 900 <= seq < 950 else 'WEAPON')
        tier = {'BODY': BODY_TIER, 'WEAPON': WPN_TIER, 'HORSE': HOR_TIER}[cat]
        info = {'name': o['name'], 'kind': cat, 'seq': seq}
        if d:
            info.update(side=d[0], shape=d[1], slot=d[2])
        objects[str(seq)] = info
        for an, spec in o['actions'].items():
            if an not in tier or tier[an] not in TIERS:
                continue
            names = [f['shape'] for f in spec['frames'] if f.get('shape')]
            if not names or all(n == 'NULSHAPE' for n in names):
                continue
            for n in names:
                if n != 'NULSHAPE':
                    want(n, cat)
            if cat == 'BODY':
                slot = d[2] if an in ('Wait', 'Attack') else 0
                key = '%s%s:%s' % (d[0], d[1], an) + (':%d' % slot if slot else '')
            else:
                key = '%s%d:%s' % (cat[0], seq, an)
            if key in actions:
                continue
            holds = [(f.get('delay') if f.get('delay') is not None else spec['default_delay']) for f in spec['frames']]
            actions[key] = {'d': spec['default_delay'], 'h': holds,
                            'loop': 1 if an in ('Wait', 'Walk') else 0}
            groups[key] = names
    return frames, order, groups, actions, objects


def build_palette(imgs, ncol=255):
    px = []
    rng = np.random.default_rng(7)
    for im in imgs:
        a = np.array(im)
        p = a[a[:, :, 3] > 0][:, :3]
        if len(p) > 6000:
            p = p[rng.choice(len(p), 6000, replace=False)]
        px.append(p)
    px = np.concatenate(px)
    mont = Image.fromarray(px.reshape(-1, 1, 3).astype(np.uint8), 'RGB')
    q = mont.quantize(colors=ncol, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:3 * ncol]
    # 索引 255 是透明哨兵：填一个调色板里绝对不会出现的洋红，
    # 避免「暗像素最近色 = 补零的黑」被当成透明挖出洞（这是第一版的 bug）。
    # 其余空位复制第 0 色，量化时不影响任何像素的真实落点。
    pal = pal + [pal[0], pal[1], pal[2]] * (255 - ncol) + [255, 0, 255]
    return pal


def pack_page(items, size, ncol=255):
    W, H = size
    pad = 2
    order = sorted(items, key=lambda t: (-t[1].height, t[0]))
    x = y = rowh = 0
    place = {}
    for name, im, ox, oy in order:
        w, h = im.size
        if x + w + pad > W:
            x, y, rowh = 0, y + rowh + pad, 0
        if y + h + pad > H:
            raise RuntimeError('page overflow %s %s' % (name, size))
        place[name] = (x, y)
        x += w + pad
        rowh = max(rowh, h)
    pal = build_palette([im for _, im, _, _ in items], ncol)
    palimg = Image.new('P', (1, 1))
    palimg.putpalette(pal)
    canvas = np.full((H, W), 255, np.uint8)
    pala = np.array(pal).reshape(-1, 3).astype(np.int16)
    err = errn = 0
    for name, im, ox, oy in items:
        a = np.array(im)
        mask = a[:, :, 3] > 0
        idx = np.array(im.convert('RGB').quantize(palette=palimg, dither=Image.Dither.NONE))
        idx[~mask] = 255
        px, py = place[name]
        canvas[py:py + im.height, px:px + im.width] = idx
        err += float(np.abs(a[mask][:, :3].astype(np.int16) - pala[idx[mask]]).mean()) * mask.sum()
        errn += mask.sum()
    out = Image.fromarray(canvas, 'P')
    out.putpalette(pal)
    return out, place, err / max(1, errn)


def main():
    global TIERS, COLORS
    for i, a in enumerate(sys.argv):
        if a == '--tiers':
            TIERS = {int(x) for x in sys.argv[i + 1].split(',')}
        if a == '--colors':
            COLORS = int(sys.argv[i + 1])
    test = '--test' in sys.argv
    frames, order, groups, actions, objects = collect()
    units = {}
    for n in order:
        u = n[:2] if n[0] in 'LR' else ('W:' + n[0] if n[0] in 'ABCD' else 'H')
        units.setdefault(u, []).append(n)
    print('frames %d  units %d  tiers %s' % (len(order), len(units), sorted(TIERS)))

    if test:
        items = [(n, frame(n)[0], frame(n)[1], frame(n)[2]) for n in units['L1']]
        for ncol in (63, 95, 127, 255):
            img, place, err = pack_page(items, (1024, 1024), ncol)
            buf = io.BytesIO()
            img.save(buf, 'PNG', optimize=True, transparency=255)
            print('  ncol=%3d n=%d bytes=%7d %6.0f B/frame err=%.2f' % (
                ncol + 1, len(items), buf.tell(), buf.tell() / len(items), err))
        return

    t0 = time.time()
    os.makedirs(DST, exist_ok=True)
    for f in os.listdir(DST):
        if f.endswith('.png'):
            os.remove(os.path.join(DST, f))
    pages = []
    total = 0
    for ui, unit in enumerate(sorted(units)):
        names = units[unit]
        items = [(n, frame(n)[0], frame(n)[1], frame(n)[2]) for n in names]
        ncol = {'BODY': COLORS, 'W': max(COLORS, 127), 'H': max(COLORS, 95)}[unit[0] if unit[0] in 'WH' else 'BODY']
        side = 1024
        try:
            img, place, err = pack_page(items, (side, side), ncol)
        except RuntimeError:
            side = 2048
            img, place, err = pack_page(items, (side, side), ncol)
        fn = 'sheet_%02d.png' % ui
        img.save(os.path.join(DST, fn), 'PNG', optimize=True, transparency=255)
        sz = os.path.getsize(os.path.join(DST, fn))
        total += sz
        spots = []
        for n in names:
            im, ox, oy, fill = frame(n)
            x, y = place[n]
            spots.append({'name': n, 'x': x, 'y': y, 'w': im.width, 'h': im.height, 'ox': ox, 'oy': oy})
        pages.append({'file': fn, 'w': side, 'h': side, 'unit': unit, 'sprites': spots})
        print('  %-14s %-13s n=%3d %5dpx %7d B err=%.2f' % (fn, unit, len(names), side, sz, err))
    print('sheets %.2f MB  %.1fs' % (total / 1e6, time.time() - t0))

    # ---- index.json ----
    idx = {'meta': {
        'version': 1,
        'source': 'SANGUO2 PAK / SHAPE\\MAJOR\\{BODY,WEAPON,HORSE} (SHP -> PNG)',
        'anchor': 'draw top-left at (unitX - ox, unitY - oy); 1px = 1 world unit at scale 1',
        'note': 'BODY/WEAPON/HORSE share one anchor: the unit ground point under the horse',
        'page_size': [1024, 2048], 'padding': 1, 'palette_colors': 256,
        'count': len(order), 'sheets_bytes': total, 'generated': time.strftime('%Y-%m-%d %H:%M'),
        'tiers': sorted(TIERS),
    }, 'pages': pages, 'groups': groups, 'actions': actions,
        'objects': objects}
    j = json.dumps(idx, ensure_ascii=False, separators=(',', ':'))
    open(os.path.join(DST, 'index.json'), 'w', encoding='utf-8').write(j)
    print('index.json %.0f KB  TOTAL %.2f MB' % (len(j.encode()) / 1e3, (total + len(j.encode())) / 1e6))


if __name__ == '__main__':
    main()
