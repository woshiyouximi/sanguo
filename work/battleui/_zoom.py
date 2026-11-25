# -*- coding: utf-8 -*-
"""Zoom sheet: for each candidate show 2x full view + 8x TL / TR / mid-left crops.

usage: python _zoom.py out.png name [name ...]
"""
import os
import sys
from PIL import Image, ImageDraw

MENU = r'F:\sanguo\export\png\SHAPE\MENU'
out = sys.argv[1]
names = sys.argv[2:]

ZOOM = 8
CORNER = 12
LABEL_W = 96


def checker(d, x, y, w, h, a=(44, 46, 52), b=(16, 18, 22)):
    for yy in range(0, h, 12):
        for xx in range(0, w, 12):
            if ((xx // 12) + (yy // 12)) % 2 == 0:
                d.rectangle([x + xx, y + yy, x + xx + 11, y + yy + 11], fill=a)


rows = []
for n in names:
    im = Image.open(os.path.join(MENU, n + '.png')).convert('RGBA')
    c = min(CORNER, im.width, im.height)
    rows.append((n, im,
                 im.resize((im.width * 2, im.height * 2), Image.NEAREST),
                 im.crop((0, 0, c, c)).resize((c * ZOOM, c * ZOOM), Image.NEAREST),
                 im.crop((im.width - c, 0, im.width, c)).resize((c * ZOOM, c * ZOOM), Image.NEAREST),
                 im.crop((0, im.height // 2 - c // 2, c, im.height // 2 + c // 2)).resize((c * ZOOM, c * ZOOM), Image.NEAREST)))

cell_w = max(max(r[2].width for r in rows) + 10, 240)
zoom_w = CORNER * ZOOM
W = LABEL_W + cell_w + 3 * (zoom_w + 8) + 8
H = sum(max(r[2].height, zoom_w) + 16 for r in rows) + 8
canvas = Image.new('RGB', (W, H), (16, 18, 22))
d = ImageDraw.Draw(canvas)
y = 6
for n, im, full, tl, tr, ml in rows:
    rh = max(full.height, zoom_w)
    d.text((6, y + 2), n, fill=(240, 230, 190))
    d.text((6, y + 14), '%dx%d' % (im.width, im.height), fill=(150, 145, 130))
    fx = LABEL_W
    checker(d, fx, y, full.width, full.height)
    canvas.paste(full, (fx, y), full)
    zx = fx + cell_w
    for z in (tl, tr, ml):
        checker(d, zx, y, z.width, z.height)
        canvas.paste(z, (zx, y), z)
        zx += z.width + 8
    y += rh + 16

canvas.save(out)
print(out, canvas.size)
