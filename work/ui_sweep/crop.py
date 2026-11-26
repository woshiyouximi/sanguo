# -*- coding: utf-8 -*-
"""裁图/缩放：python crop.py src.png out.png x y w h [scale]
坐标为设备像素（1456x2560）。scale 省略=1。"""
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
x, y, w, h = (int(v) for v in sys.argv[3:7])
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 1.0
im = Image.open(src)
c = im.crop((x, y, x + w, y + h))
if scale != 1.0:
    c = c.resize((max(1, int(c.width * scale)), max(1, int(c.height * scale))), Image.LANCZOS)
c.save(out)
print('saved', out, c.size)
