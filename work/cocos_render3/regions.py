#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Region colour census: how many >=THR colours live in each horizontal slice.

Usage: python regions.py <img> <y0:y1> [<y0:y1> ...]
Prints per-slice >=8 / unique at half resolution plus the slice's share.
Read-only.
"""
import sys

from PIL import Image

THR = 8


def census(img):
    cols = img.getcolors(maxcolors=1 << 24) or []
    return len(cols), sum(1 for (n, _c) in cols if n >= THR)


path = sys.argv[1]
im = Image.open(path).convert("RGB")
w, h = im.size
half = im.resize((w // 2, h // 2), Image.NEAREST) if w * h > 400000 else im
u, g = census(half)
print("%s %dx%d  ALL: >=%d=%d uniq=%d" % (path, w, h, THR, g, u))
for spec in sys.argv[2:]:
    y0, y1 = [int(v) for v in spec.split(":")]
    crop = half.crop((0, y0 // 2, half.size[0], y1 // 2))
    u2, g2 = census(crop)
    print("  y %4d..%-4d  >=%d=%-5d uniq=%-6d" % (y0, y1, THR, g2, u2))
