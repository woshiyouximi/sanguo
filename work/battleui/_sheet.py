# -*- coding: utf-8 -*-
"""Contact sheet for candidate MENU frames + border palette stats.

usage: python _sheet.py out.png name=path [name=path ...]
Each row: label + 4x NEAREST view on checkerboard + 6x corner strip.
"""
import sys
from PIL import Image, ImageDraw

out = sys.argv[1]
items = [a.split('=', 1) for a in sys.argv[2:]]
SCALE = 3
PAD = 10
LABEL_H = 16

imgs = []
for label, p in items:
    im = Image.open(p).convert('RGBA')
    imgs.append((label, im))

W = max(im.width * SCALE for _, im in imgs) + PAD * 2
H = sum(LABEL_H + im.height * SCALE + PAD for _, im in imgs) + PAD
canvas = Image.new('RGB', (W, H), (18, 20, 24))
d = ImageDraw.Draw(canvas)
y = PAD
for label, im in imgs:
    # border palette: opaque pixels in outer 6px ring
    a = im.getchannel('A')
    px = im.load()
    vals = []
    for yy in range(im.height):
        for xx in range(im.width):
            if xx < 6 or yy < 6 or xx >= im.width - 6 or yy >= im.height - 6:
                if px[xx, yy][3] > 200:
                    vals.append(px[xx, yy][:3])
    if vals:
        r = sum(v[0] for v in vals) / len(vals)
        g = sum(v[1] for v in vals) / len(vals)
        b = sum(v[2] for v in vals) / len(vals)
        pal = '#%02X%02X%02X' % (round(r), round(g), round(b))
    else:
        pal = 'none'
    d.text((PAD, y + 2), '%s  %dx%d  ring=%s  n=%d' % (label, im.width, im.height, pal, len(vals)),
           fill=(235, 225, 185))
    y += LABEL_H
    x0 = PAD
    for yy in range(0, im.height * SCALE, 12):
        for xx in range(0, im.width * SCALE, 12):
            if ((xx // 12) + (yy // 12)) % 2 == 0:
                d.rectangle([x0 + xx, y + yy, x0 + xx + 11, y + yy + 11], fill=(46, 46, 52))
    big = im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)
    canvas.paste(big, (x0, y), big)
    y += im.height * SCALE + PAD

canvas.save(out)
print(out, canvas.size)
