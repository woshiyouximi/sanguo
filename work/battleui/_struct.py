# -*- coding: utf-8 -*-
"""ASCII alpha/rgb structure dump for a crop of one MENU image.

usage: python _struct.py NAME x0 y0 x1 y1 [mode]
mode: a = alpha map, c = colour letters (R gold / b dark / . transparent)
"""
import os
import sys
from PIL import Image

MENU = r'F:\sanguo\export\png\SHAPE\MENU'
name = sys.argv[1]
x0, y0, x1, y1 = (int(v) for v in sys.argv[2:6])
mode = sys.argv[6] if len(sys.argv) > 6 else 'a'
im = Image.open(os.path.join(MENU, name + '.png')).convert('RGBA')
px = im.load()
w, h = im.size
print('%s %dx%d crop=(%d,%d)-(%d,%d)' % (name, w, h, x0, y0, x1, y1))
hdr = '    ' + ''.join(str(x % 10) for x in range(x0, min(x1, w)))
print(hdr)
cols = {}
for y in range(y0, min(y1, h)):
    line = []
    for x in range(x0, min(x1, w)):
        r, g, b, a = px[x, y]
        if mode == 'a':
            line.append('#' if a > 200 else ('+' if a > 60 else ('-' if a > 0 else '.')))
        else:
            if a < 60:
                line.append('.')
            else:
                k = (r >> 5, g >> 5, b >> 5)
                ch = '#'
                if g < 40 and b < 40 and r < 40:
                    ch = 'K'
                elif r > 150 and g > 110 and b < 110:
                    ch = 'G'   # gold
                elif b > r and b > 80:
                    ch = 'B'   # blue
                elif r > 200 and g > 200 and b > 200:
                    ch = 'W'   # white
                elif r > 120 and g < 100:
                    ch = 'R'   # red
                cols.setdefault(ch, (k, 0))
                cols[ch] = (cols[ch][0], cols[ch][1] + 1)
                line.append(ch)
    print('%4d' % y + ''.join(line))
if mode == 'c':
    for k, v in sorted(cols.items()):
        print(k, v[0], v[1])
