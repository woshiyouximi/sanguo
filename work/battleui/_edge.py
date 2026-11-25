# -*- coding: utf-8 -*-
"""Per-tile alpha audit for the chosen MENU sources.

usage: python _edge.py NAME...
prints w x h, each of the four 4px border bands as mean/min alpha, and the
centre 40% box as mean alpha (0 = the canvas art shows through).
"""
import os
import sys
from PIL import Image

MENU = r'F:\sanguo\export\png\SHAPE\MENU'
B = 4

print('%-9s %7s %-22s %-22s %-22s %-22s %s' % ('name', 'size', 'top4 mean/min', 'bottom4 mean/min', 'left4 mean/min', 'right4 mean/min', 'centre40 mean'))
for name in sys.argv[1:]:
    im = Image.open(os.path.join(MENU, name + '.png')).convert('RGBA')
    a = im.getchannel('A').load()
    w, h = im.size

    def band(x0, y0, x1, y1):
        vals = [a[x, y] for y in range(y0, y1) for x in range(x0, x1)]
        return sum(vals) / len(vals), min(vals)

    top = band(0, 0, w, B)
    bot = band(0, h - B, w, h)
    lef = band(0, 0, B, h)
    rig = band(w - B, 0, w, h)
    cx0, cx1 = int(w * 0.3), int(w * 0.7)
    cy0, cy1 = int(h * 0.3), int(h * 0.7)
    cen = band(cx0, cy0, cx1, cy1)[0]
    print('%-9s %7s %-22s %-22s %-22s %-22s %.1f' % (
        name, '%dx%d' % (w, h),
        '%.1f / %d' % top, '%.1f / %d' % bot, '%.1f / %d' % lef, '%.1f / %d' % rig, cen))
