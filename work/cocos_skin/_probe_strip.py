# -*- coding: utf-8 -*-
"""Inspect bar_div/sep pixel profiles to decide stretch vs tile."""
from PIL import Image

for name in ["bar_div.png", "sep.png"]:
    p = r"F:\sanguo\game\web\assets\ui\orig\%s" % name
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    print("%s %dx%d" % (name, w, h))
    for y in range(h):
        row = [im.getpixel((x, y)) for x in range(w)]
        head = "".join("%02x" % c[3] for c in row[:12])
        tail = "".join("%02x" % c[3] for c in row[-12:])
        uniq = len(set(row))
        print("  y=%2d uniq=%2d a[0:12]=%s a[-12:]=%s c0=%s c_mid=%s" % (y, uniq, head, tail, row[0], row[w // 2]))
    # column profile at a few x
    for x in [0, 1, 55, 109, 110]:
        col = [im.getpixel((x, y)) for y in range(h)]
        print("  x=%3d %s" % (x, col))
