import json, os, io
from PIL import Image

SRC = r'F:/sanguo/game/web/anim/general'
OUT = r'F:/sanguo/work/cocos_art/_proto'
os.makedirs(OUT, exist_ok=True)
idx = json.load(open(SRC + '/index.json', encoding='utf-8'))
pages = idx['pages']
groups = idx['groups']
sprite_page = {}
for pi, pg in enumerate(pages):
    for s in pg['sprites']:
        sprite_page[s['name']] = (pi, s)

# keep: body units (L*/R*) Wait:1 Attack:1 Walk Death; H900 all; W700 wait/attack
keep_groups = []
for k in groups:
    unit = k.split(':')[0]
    if unit.startswith('L') or unit.startswith('R'):
        if k.endswith(':Wait:1') or k.endswith(':Attack:1') or k.endswith(':Walk') or k.endswith(':Death'):
            keep_groups.append(k)
    elif unit in ('H900', 'W700'):
        keep_groups.append(k)

print('keep_groups', len(keep_groups))

# map unit -> list of sprite names
by_unit = {}
for g in keep_groups:
    unit = g.split(':')[0]
    for nm in groups[g]:
        by_unit.setdefault(unit, []).append(nm)

sheets_cache = {}
def sheet(pi):
    if pi not in sheets_cache:
        im = Image.open(os.path.join(SRC, pages[pi]['file']))
        sheets_cache[pi] = im
    return sheets_cache[pi]

total = 0
pages_out = {}
for unit, names in sorted(by_unit.items()):
    # unique preserve order
    seen = set(); frames = []
    for nm in names:
        if nm in seen: continue
        seen.add(nm)
        pi, s = sprite_page[nm]
        im = sheet(pi)
        # original page may be P with transparency; convert once per page
        if im.mode != 'RGBA':
            im2 = im.convert('RGBA')
            sheets_cache[pi] = im2
            im = im2
        crop = im.crop((s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h']))
        frames.append((nm, crop, s))

    # row pack into width <= 1024
    W = 1024
    x = y = 0; rowh = 0; placed = []; cursor = {}
    for nm, crop, s in frames:
        w, h = s['w'], s['h']
        if x + w > W:
            x = 0; y += rowh + 1; rowh = 0
        placed.append((nm, crop, s, x, y))
        cursor[nm] = (x, y)
        x += w + 1
        if h > rowh: rowh = h
    H = y + rowh
    # round up height
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for nm, crop, s, px, py in placed:
        canvas.paste(crop, (px, py))
    q = canvas.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    out = os.path.join(OUT, unit + '.png')
    q.save(out, 'PNG', optimize=True, compress_level=9)
    sz = os.path.getsize(out)
    total += sz
    pages_out[unit] = {'file': unit + '.png', 'w': W, 'h': H, 'sprites': [
        {'name': nm, 'x': cursor[nm][0], 'y': cursor[nm][1], 'w': s['w'], 'h': s['h'], 'ox': s.get('ox'), 'oy': s.get('oy')}
        for nm, crop, s in frames]}
    print('%-5s frames=%3d %4dx%4d -> %7d B' % (unit, len(frames), W, H, sz))

print('TOTAL', total, '%.2f MB' % (total / 1048576))
json.dump({'pages': pages_out}, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
