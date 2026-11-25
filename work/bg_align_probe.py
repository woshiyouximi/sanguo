"""验证 pos_xy 是否就是 CHINAMAP.png(1280x960) 的像素坐标。
产出 work/bg_align_probe.jpg：原图 + 城点 + 城名，四种映射对照。
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = r'F:\sanguo'
MAP = os.path.join(ROOT, r'export\png\SHAPE\MAP\CHINAMAP.png')
OUT = os.path.join(ROOT, r'work\bg_align_probe.jpg')

data = json.load(open(os.path.join(ROOT, r'game\data\scenarios.json'), encoding='utf-8'))
cities = data[0]['cities']
print('cities', len(cities), 'x', min(c['pos_xy'][0] for c in cities),
      max(c['pos_xy'][0] for c in cities),
      'y', min(c['pos_xy'][1] for c in cities), max(c['pos_xy'][1] for c in cities))

src = Image.open(MAP).convert('RGB')
W, H = src.size
print('map', W, H)

def font(sz):
    for p in (r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\simhei.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()

f = font(15)
panel = src.copy()
d = ImageDraw.Draw(panel)
for c in cities:
    x, y = c['pos_xy']
    d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(255, 40, 40), outline=(255, 255, 200))
    d.text((x + 7, y - 16), c['NAME'], font=f, fill=(255, 255, 120),
           stroke_width=2, stroke_fill=(0, 0, 0))
panel.save(OUT, quality=88)
print('wrote', OUT)
