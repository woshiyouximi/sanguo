# -*- coding: utf-8 -*-
"""Crop + integer zoom a region of a png (for eyeballing 1x art).

usage: python _crop.py in.png out.png x y w h [zoom]
"""
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
x, y, w, h = (int(v) for v in sys.argv[3:7])
z = int(sys.argv[7]) if len(sys.argv) > 7 else 2
im = Image.open(src).convert('RGB')
box = im.crop((x, y, x + w, y + h))
box.resize((w * z, h * z), Image.NEAREST).save(dst)
print(dst, (w * z, h * z))
