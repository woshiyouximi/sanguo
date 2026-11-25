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

sheets = {}
worst = 0
for unit, pg in pidx['pages'].items():
    out = np.asarray(Image.open(os.path.join(proto, pg['file'])).convert('RGBA'), dtype=np.int16)
    bad_visible = 0
    max_delta = 0
    for sp in pg['sprites']:
        sf, ssp = frame_of[sp['name']]
        im = sheets.get(sf)
        if im is None:
            im = np.asarray(Image.open(os.path.join(web, sf)).convert('RGBA'), dtype=np.int16)
            sheets[sf] = im
        a = im[ssp['y']:ssp['y'] + ssp['h'], ssp['x']:ssp['x'] + ssp['w']]
        b = out[sp['y']:sp['y'] + sp['h'], sp['x']:sp['x'] + sp['w']]
        d = np.abs(a - b)
        visible = (a[:, :, 3] > 0) | (b[:, :, 3] > 0)
        dd = d.max(axis=2)
        bad_visible += int(((dd > 0) & visible).sum())
        max_delta = max(max_delta, int(dd.max()))
    worst = max(worst, max_delta)
    print(unit, 'frames', len(pg['sprites']), 'visible-diff px', bad_visible, 'max delta', max_delta)
print('worst channel delta', worst)
