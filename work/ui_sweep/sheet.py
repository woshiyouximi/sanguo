# -*- coding: utf-8 -*-
"""拼图：python sheet.py out.png cols width img1 img2 ...  （每张缩到 width 宽，网格排版）"""
import sys, math
from PIL import Image

out = sys.argv[1]
cols = int(sys.argv[2])
width = int(sys.argv[3])
files = sys.argv[4:]
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    r = width / im.width
    ims.append(im.resize((width, max(1, int(im.height * r))), Image.LANCZOS))
rows = math.ceil(len(ims) / cols)
row_h = [max(ims[i].height for i in range(r * cols, min(len(ims), (r + 1) * cols))) for r in range(rows)]
canvas = Image.new('RGB', (cols * width, sum(row_h)), (20, 20, 20))
y = 0
for r in range(rows):
    for c in range(cols):
        i = r * cols + c
        if i < len(ims):
            canvas.paste(ims[i], (c * width, y))
    y += row_h[r]
canvas.save(out)
print('saved', out, canvas.size)
