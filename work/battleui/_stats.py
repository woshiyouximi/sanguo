# -*- coding: utf-8 -*-
"""Ring palette + opaque profile for hollow-frame candidates.

usage: python _stats.py [dir]
Prints for every hollow frame: size, ring mean RGB/HSV, and the per-column
opaque thickness of the TOP edge (to derive 9-slice insets).
"""
import glob
import os
import sys
from PIL import Image

root = sys.argv[1] if len(sys.argv) > 1 else r'F:\sanguo\export\png\SHAPE\MENU'
SKIP = ('STAFF', 'TITLEBG', 'WARPREP', 'MAIN0', 'BUTTON', 'SB_', 'WARINFO01', 'WARINFO02')

rows = []
for p in sorted(glob.glob(os.path.join(root, '*.png'))):
    name = os.path.basename(p)[:-4]
    if any(name.startswith(s) for s in SKIP):
        continue
    im = Image.open(p).convert('RGBA')
    w, h = im.size
    a = im.getchannel('A')
    ap = a.load()
    px = im.load()
    # quick hollow test
    cw, ch = max(1, int(w * .4)), max(1, int(h * .4))
    cx, cy = (w - cw) // 2, (h - ch) // 2
    cpx = list(a.crop((cx, cy, cx + cw, cy + ch)).get_flattened_data()) if hasattr(a, 'get_flattened_data') else list(a.crop((cx, cy, cx + cw, cy + ch)).getdata())
    if sum(cpx) / len(cpx) > 64:
        continue
    for side in ('t', 'b', 'l', 'r'):
        if side == 't':
            band = [ap[x, 0] for x in range(w)]
        elif side == 'b':
            band = [ap[x, h - 1] for x in range(w)]
        elif side == 'l':
            band = [ap[0, y] for y in range(h)]
        else:
            band = [ap[w - 1, y] for y in range(h)]
        if sum(band) / len(band) < 200:
            break
    else:
        # ring rgb
        vals = []
        for yy in range(h):
            for xx in range(w):
                if xx < 4 or yy < 4 or xx >= w - 4 or yy >= h - 4:
                    c = px[xx, yy]
                    if c[3] > 200:
                        vals.append(c[:3])
        if not vals:
            continue
        r = sum(v[0] for v in vals) / len(vals)
        g = sum(v[1] for v in vals) / len(vals)
        b = sum(v[2] for v in vals) / len(vals)
        mx, mn = max(r, g, b), min(r, g, b)
        sat = 0 if mx == 0 else (mx - mn) / mx
        # top-edge opaque thickness per column (first 20px)
        prof = []
        for x in range(0, w, max(1, w // 12)):
            n = 0
            for y in range(min(20, h)):
                if ap[x, y] > 200:
                    n += 1
                elif n:
                    break
            prof.append(n)
        rows.append((sat, name, w, h, r, g, b, prof, os.path.getsize(p)))

rows.sort()
print('%-11s %4s %4s  ring       sat   topThick profile (12 samples)  bytes' % ('name', 'w', 'h'))
for sat, name, w, h, r, g, b, prof, sz in rows:
    print('%-11s %4d %4d  #%02X%02X%02X  %.2f  %-30s %5d' % (
        name, w, h, round(r), round(g), round(b), sat, prof, sz))
