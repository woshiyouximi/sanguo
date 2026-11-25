# -*- coding: utf-8 -*-
"""区分哨兵路径后重算端点吻合度；并生成 6 城的放大核对图。"""
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r'F:\sanguo'
OUT = os.path.join(ROOT, r'work\map_orig')
src = Image.open(os.path.join(ROOT, r'export\png\SHAPE\MAP\CHINAMAP.png')).convert('RGB')
sc = json.load(open(os.path.join(ROOT, r'game\data\scenarios.json'), encoding='utf-8'))[0]
by = {c['NAME']: c for c in sc['cities']}

real, sent = [], []
for p in sc['paths']:
    a, b = by[p['Start']], by[p['End']]
    pts = p['points']
    e0 = max(abs(pts[0][0] - a['pos_xy'][0]), abs(pts[0][1] - a['pos_xy'][1]))
    e1 = max(abs(pts[-1][0] - b['pos_xy'][0]), abs(pts[-1][1] - b['pos_xy'][1]))
    (sent if (p.get('Length') or 0) >= 30000 else real).append((e0, e1))
for nm, arr in (('真实路(Length<30000)', real), ('哨兵路(Length>=30000)', sent)):
    if not arr:
        continue
    e = np.array(arr).ravel()
    print('%-22s n=%3d paths  端点误差: exact0=%3d/%3d  <=1px=%3d  <=2px=%3d  中位=%.0f  最大=%.0f' % (
        nm, len(arr), int((e == 0).sum()), e.size, int((e <= 1).sum()), int((e <= 2).sum()),
        np.median(e), e.max()))

SIX = ['洛陽', '長安', '成都', '建業', '襄平', '代縣']
f = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 26)
tiles = []
R = 110            # 取 ±110px 邻域
Z = 3              # 放大 3 倍
for nm in SIX:
    c = by[nm]
    x, y = c['pos_xy']
    box = (max(0, x - R), max(0, y - R), min(src.width, x + R), min(src.height, y + R))
    t = src.crop(box).resize(((box[2] - box[0]) * Z, (box[3] - box[1]) * Z), Image.NEAREST)
    d = ImageDraw.Draw(t)
    cx, cy = (x - box[0]) * Z, (y - box[1]) * Z
    d.line([(cx - 26, cy), (cx + 26, cy)], fill=(255, 0, 255), width=2)
    d.line([(cx, cy - 26), (cx, cy + 26)], fill=(255, 0, 255), width=2)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(255, 255, 255), outline=(255, 0, 255))
    d.rectangle([0, 0, t.width - 1, t.height - 1], outline=(80, 80, 90))
    d.text((8, 6), '%s POS=%d,%d' % (nm, x, y), font=f, fill=(255, 255, 120),
           stroke_width=3, stroke_fill=(0, 0, 0))
    tiles.append(t)

W = max(t.width for t in tiles)
H = max(t.height for t in tiles)
sheet = Image.new('RGB', (W * 3, H * 2), (18, 18, 22))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % 3) * W, (i // 3) * H))
p = os.path.join(OUT, 'six_city_check.png')
sheet.save(p)
print('\nwrote', p, sheet.size)
