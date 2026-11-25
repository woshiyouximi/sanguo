import json, os
from PIL import Image

IDX = r'F:\sanguo\game\web\assets\fx\index.json'
doc = json.load(open(IDX, encoding='utf-8'))


def stats(d):
    meta = doc['dirs'][d]
    img = Image.open(os.path.join(os.path.dirname(IDX), meta['sheet'])).convert('RGBA')
    out = []
    for i, (sx, sy, sw, sh, ax, ay) in enumerate(meta['list']):
        crop = img.crop((sx, sy, sx + sw, sy + sh))
        a = crop.getchannel('A')
        nz = sum(1 for p in a.getdata() if p > 32)
        out.append((i, sw, sh, nz, round(nz / max(1, sw * sh), 2)))
    return out


for d in ['004', '014', '038', '003', '039', '034']:
    s = stats(d)
    print('dir', d, 'frames', len(s), 'rot', doc['dirs'][d].get('rot'))
    print('  ', ' '.join('%d:%dx%d/%d' % (i, w, h, nz) for (i, w, h, nz, _r) in s[:14]))
    if len(s) > 14:
        print('  ', ' '.join('%d:%dx%d/%d' % (i, w, h, nz) for (i, w, h, nz, _r) in s[14:]))
