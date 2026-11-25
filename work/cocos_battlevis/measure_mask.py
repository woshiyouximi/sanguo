# 判定 FORCE 图集里 back / front 到底是「调色板互换」还是「不同姿势」：
#   1) 两帧 alpha 掩膜是否逐像素相同（同 → 同一 silhouette）
#   2) 掩膜交叠处，N 相对 M 的 RGB 增减分布（同 → 纯调色板）
from PIL import Image
import json, hashlib, os

ROOT = r'F:\sanguo'
j = json.load(open(os.path.join(ROOT, 'game', 'web', 'anim', 'units.json'), encoding='utf-8'))
img = Image.open(os.path.join(ROOT, 'game', 'web', 'anim', 'units_00.png')).convert('RGBA')
PH = j['pages'][0]['h']
NM = {s['name']: s for s in j['pages'][0]['sprites']}


def cut(name):
    s = NM[name]
    box = (s['x'], PH - s['y'] - s['h'], s['x'] + s['w'], PH - s['y'] - s['h'] + s['h'])
    return img.crop(box)


def mask(c):
    return bytes(255 if p[3] > 128 else 0 for p in c.getdata())


print('group\tmask_same\tsize\tdR\tdG\tdB\t%%redder\t%%bluer')
for key, grp in j['groups'].items():
    b, f = grp.get('back'), grp.get('front')
    if not b or not f:
        continue
    ca, cb = cut(b[0]), cut(f[0])
    ma, mb = mask(ca), mask(cb)
    same = hashlib.md5(ma).hexdigest() == hashlib.md5(mb).hexdigest()
    pa, pb = list(ca.getdata()), list(cb.getdata())
    both = [(x, y) for x, y in zip(pa, pb) if x[3] > 128 and y[3] > 128]
    n = max(1, len(both))
    dr = sum(y[0] - x[0] for x, y in both) / n
    dg = sum(y[1] - x[1] for x, y in both) / n
    db = sum(y[2] - x[2] for x, y in both) / n
    redder = sum(1 for x, y in both if y[0] - y[2] > x[0] - x[2] + 20) / n
    bluer = sum(1 for x, y in both if x[0] - x[2] > y[0] - y[2] + 20) / n
    print('%s\t%s\t%s\t%+.1f\t%+.1f\t%+.1f\t%.0f\t%.0f' % (
        key, 'YES' if same else 'no', '%dx%d' % ca.size, dr, dg, db, redder * 100, bluer * 100))
