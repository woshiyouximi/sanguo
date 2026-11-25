from PIL import Image
import json, os
import numpy as np

web = r'F:\sanguo\game\web\anim\general'
proto = r'F:\sanguo\work\cocos_art\_proto'
src = json.load(open(os.path.join(web, 'index.json'), encoding='utf-8'))
pidx = json.load(open(os.path.join(proto, 'index.json'), encoding='utf-8'))
frame_of = {}
for p in src['pages']:
    for sp in p['sprites']:
        frame_of[sp['name']] = (p['file'], sp)

pg = pidx['pages']['L0']
sf = frame_of[pg['sprites'][0]['name']][0]
im = Image.open(os.path.join(web, sf))
tr = im.info.get('transparency')
print('transparency', tr, 'mode', im.mode)
pal = im.getpalette()

used = set()
for sp in pg['sprites']:
    _, ssp = frame_of[sp['name']]
    arr = np.asarray(im.crop((ssp['x'], ssp['y'], ssp['x'] + ssp['w'], ssp['y'] + ssp['h'])))
    used.update(int(v) for v in np.unique(arr))
used.discard(tr)
order = sorted(used) + [tr]
newpal = []
for idx in order:
    newpal.extend(pal[idx * 3:idx * 3 + 3])
lut = np.zeros(256, dtype=np.uint8)
for newi, oldi in enumerate(order):
    lut[oldi] = newi

out = Image.new('P', (pg['w'], pg['h']), len(order) - 1)
out.putpalette(newpal)
out.info['transparency'] = len(order) - 1
for sp in pg['sprites']:
    _, ssp = frame_of[sp['name']]
    arr = np.asarray(im.crop((ssp['x'], ssp['y'], ssp['x'] + ssp['w'], ssp['y'] + ssp['h'])))
    rem = lut[arr]
    tile = Image.fromarray(rem, mode='P')
    tile.putpalette(newpal)
    out.paste(tile, (sp['x'], sp['y']))
out.save(r'F:\sanguo\work\cocos_art\_proto\L0_exact.png', optimize=True)
p2 = r'F:\sanguo\work\cocos_art\_proto\L0_exact.png'
print('colors', len(order), 'exact size', os.path.getsize(p2), 'quant size', os.path.getsize(r'F:\sanguo\work\cocos_art\_proto\L0.png'))
a = Image.open(p2).convert('RGBA')
bad = 0
for sp in pg['sprites']:
    _, ssp = frame_of[sp['name']]
    s = im.crop((ssp['x'], ssp['y'], ssp['x'] + ssp['w'], ssp['y'] + ssp['h'])).convert('RGBA')
    o = a.crop((sp['x'], sp['y'], sp['x'] + sp['w'], sp['y'] + sp['h']))
    if np.array_equal(np.asarray(s), np.asarray(o)) is False:
        bad += 1
print('bad frames', bad)
