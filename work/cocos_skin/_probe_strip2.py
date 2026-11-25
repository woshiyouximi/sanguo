# -*- coding: utf-8 -*-
"""Check whether bar_div / sep tile seamlessly (first vs last column)."""
from PIL import Image

for p, name in [(r"F:\sanguo\game\web\assets\ui\orig\bar_div.png", "bar_div"),
                (r"F:\sanguo\game\web\assets\battleui\sep.png", "sep")]:
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    print("%s %dx%d" % (name, w, h))
    for x in [0, 1, 2, w - 3, w - 2, w - 1]:
        col = [im.getpixel((x, y)) for y in range(h)]
        print("  x=%3d %s" % (x, col))
    # seam error: mean abs diff between column 0 and column w-1 (as if repeated)
    e = 0
    for y in range(h):
        a = im.getpixel((0, y))
        b = im.getpixel((w - 1, y))
        e += sum(abs(a[i] - b[i]) for i in range(4))
    print("  seam |col0-colEnd| total=%d avg=%.1f" % (e, e / (h * 4)))
    # interior uniformity: how many distinct columns
    cols = set(tuple(im.getpixel((x, y)) for y in range(h)) for x in range(w))
    print("  distinct columns=%d" % len(cols))
