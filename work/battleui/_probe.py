# -*- coding: utf-8 -*-
"""Dump size + four-edge alpha + center hollow stats for MENU pngs.

usage: python _probe.py [dir] [--filter=WAR]
Edge band meanings:
  e4  = last/first 4 px along that side (mean alpha)
  e1  = outermost 1 px (mean alpha)
  ctr = center 40%x40% region (mean alpha, min, max)
A frame that can be used as a 9-slice hollow border wants e4/e1 ~ 255 on all
four sides and ctr mean low (interior transparent).
"""
import sys, os, glob
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
filt = ''
for a in sys.argv[1:]:
    if a.startswith('--filter='):
        filt = a.split('=', 1)[1]
root = args[0] if args else r'F:\sanguo\export\png\SHAPE\MENU'


def edge(im, side, band):
    w, h = im.size
    a = im.getchannel('A')
    if side == 'top':
        box = (0, 0, w, band)
    elif side == 'bottom':
        box = (0, h - band, w, h)
    elif side == 'left':
        box = (0, 0, band, h)
    else:
        box = (w - band, 0, w, h)
    px = list(a.crop(box).getdata())
    return (sum(px) / len(px), min(px), max(px))


rows = []
for p in sorted(glob.glob(os.path.join(root, '*.png'))):
    name = os.path.basename(p)[:-4]
    if filt and filt.upper() not in name.upper():
        continue
    im = Image.open(p).convert('RGBA')
    w, h = im.size
    if w < 8 or h < 8:
        continue
    e = {}
    for side in ('top', 'bottom', 'left', 'right'):
        m4, mn4, mx4 = edge(im, side, 4)
        m1, _, _ = edge(im, side, 1)
        e[side] = (m4, m1)
    cw, ch = max(1, int(w * 0.4)), max(1, int(h * 0.4))
    cx, cy = (w - cw) // 2, (h - ch) // 2
    cpx = list(im.getchannel('A').crop((cx, cy, cx + cw, cy + ch)).getdata())
    cm = sum(cpx) / len(cpx)
    hollow = cm < 64 and all(e[s][0] > 200 for s in e)
    rows.append((hollow, cm, name, w, h, e, min(cpx), max(cpx),
                 sum(1 for v in cpx if v == 0) / len(cpx), os.path.getsize(p)))

rows.sort(key=lambda r: (not r[0], r[1], r[2]))
print('%-5s %-11s %4s %4s | %-17s %-17s %-17s %-17s | ctr mean/min/max  %6s %4s %4s  zero%%  bytes' % (
    'HOLLOW', 'name', 'w', 'h', 'top e4/e1', 'bottom', 'left', 'right', 'mean', 'min', 'max'))
for hollow, cm, name, w, h, e, cmin, cmax, zf, sz in rows:
    print('%-5s %-11s %4d %4d | %6.1f/%-6.1f %6.1f/%-6.1f %6.1f/%-6.1f %6.1f/%-6.1f | %6.1f %4d %4d  %5.2f %6d' % (
        'YES' if hollow else '-', name, w, h,
        e['top'][0], e['top'][1], e['bottom'][0], e['bottom'][1],
        e['left'][0], e['left'][1], e['right'][0], e['right'][1],
        cm, cmin, cmax, zf, sz))
