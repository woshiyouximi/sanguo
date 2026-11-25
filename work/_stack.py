import sys, os
from PIL import Image, ImageDraw

# usage: _stack.py out.png label1=path1 label2=path2 ...
out = sys.argv[1]
pairs = [a.split('=', 1) for a in sys.argv[2:]]
W = 660
rows = []
for label, p in pairs:
    im = Image.open(p).convert('RGBA')
    s = min(640 / im.width, 1.0) if im.width > 640 else min(3.0, 640 / im.width)
    im2 = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.NEAREST)
    rows.append((label, im.size, im2))
H = sum(20 + r[2].height + 8 for r in rows)
canvas = Image.new('RGB', (W, H), (26, 26, 30))
d = ImageDraw.Draw(canvas)
y = 0
for label, size, im2 in rows:
    d.text((4, y + 4), f'{label} {size[0]}x{size[1]}', fill=(235, 225, 185))
    y += 20
    for yy in range(y, y + im2.height, 10):
        for xx in range(4, 4 + im2.width, 10):
            if ((xx - 4) // 10 + (yy - y) // 10) % 2 == 0:
                d.rectangle([xx, yy, min(xx + 9, 3 + im2.width), min(yy + 9, y + im2.height - 1)], fill=(46, 46, 52))
    canvas.paste(im2, (4, y), im2)
    y += im2.height + 8
canvas.save(out)
print(out, canvas.size)
