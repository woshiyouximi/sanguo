# -*- coding: utf-8 -*-
"""Compact sheet: 1x thumbnail + TL/BL corner at 10x for each candidate.

usage: python _corner.py out.png name [name ...]
"""
import os
import sys
from PIL import Image, ImageDraw

MENU = r'F:\sanguo\export\png\SHAPE\MENU'
out = sys.argv[1]
names = sys.argv[2:]
ZOOM = 10
C = 12

THUMB_MAX = (150, 150)


def checker(d, x, y, w, h):
    for yy in range(0, h, 10):
        for xx in range(0, w, 10):
            if ((xx // 10) + (yy // 10)) % 2 == 0:
                d.rectangle([x + xx, y + yy, x + xx + 9, y + yy + 9], fill=(44, 46, 52))


rows = []
for n in names:
    im = Image.open(os.path.join(MENU, n + '.png')).convert('RGBA')
    t = im.copy()
    t.thumbnail(THUMB_MAX, Image.NEAREST)
    c = min(C, im.width, im.height)
    tl = im.crop((0, 0, c, c)).resize((c * ZOOM, c * ZOOM), Image.NEAREST)
    bl = im.crop((0, im.height - c, c, im.height)).resize((c * ZOOM, c * ZOOM), Image.NEAREST)
    rows.append((n, im, t, tl, bl))

W = 90 + THUMB_MAX[0] + 10 + 2 * (C * ZOOM + 8) + 8
H = sum(max(C * ZOOM, r[2].height) + 14 for r in rows) + 8
canvas = Image.new('RGB', (W, H), (16, 18, 22))
d = ImageDraw.Draw(canvas)
y = 6
for n, im, t, tl, bl in rows:
    d.text((6, y + 2), n, fill=(240, 230, 190))
    d.text((6, y + 14), '%dx%d' % (im.width, im.height), fill=(150, 145, 130))
    checker(d, 90, y, t.width, t.height)
    canvas.paste(t, (90, y), t)
    x = 90 + THUMB_MAX[0] + 10
    for z in (tl, bl):
        checker(d, x, y, z.width, z.height)
        canvas.paste(z, (x, y), z)
        x += z.width + 8
    y += max(C * ZOOM, t.height) + 14
canvas.save(out)
print(out, canvas.size)
