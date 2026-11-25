import sys, os
from PIL import Image, ImageDraw

# usage: _corners.py out.png name=path:slice ...
# layout: per image -> [full 1x scaled to 620w] then a row of 4 corner crops (tl,tr,bl,br) at 5x
out = sys.argv[1]
items = [a.split('=', 1) for a in sys.argv[2:]]
W = 660
blocks = []
for label, spec in items:
    p, sl = spec.rsplit(':', 1)
    sl = int(sl)
    im = Image.open(p).convert('RGBA')
    s = min(620 / im.width, 2.0) if im.width > 620 else 2.0
    full = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.NEAREST)
    crops = []
    for (x, y) in [(0, 0), (im.width - sl, 0), (0, im.height - sl), (im.width - sl, im.height - sl)]:
        c = im.crop((x, y, x + sl, y + sl))
        f = max(1, min(4, 150 // max(1, sl)))
        crops.append(c.resize((c.width * f, c.height * f), Image.NEAREST))
    blocks.append((label, im.size, sl, full, crops))

H = sum(18 + b[3].height + 8 + max(c.height for c in b[4]) + 10 for b in blocks)
canvas = Image.new('RGB', (W, H), (24, 24, 28))
d = ImageDraw.Draw(canvas)
y = 0
for label, size, sl, full, crops in blocks:
    d.text((4, y + 3), f'{label} {size[0]}x{size[1]} slice={sl}  (corner crops NEAREST upscaled)', fill=(235, 225, 185))
    y += 18
    for yy in range(y, y + full.height, 8):
        for xx in range(4, 4 + full.width, 8):
            if ((xx - 4) // 8 + (yy - y) // 8) % 2 == 0:
                d.rectangle([xx, yy, min(xx + 7, 3 + full.width), min(yy + 7, y + full.height - 1)], fill=(44, 44, 50))
    canvas.paste(full, (4, y), full)
    y += full.height + 8
    x = 4
    names = ['TL', 'TR', 'BL', 'BR']
    for i, c in enumerate(crops):
        d.text((x, y), names[i], fill=(200, 200, 120))
        canvas.paste(c, (x, y + 10), c)
        d.rectangle([x, y + 10, x + c.width, y + 10 + c.height], outline=(90, 90, 60))
        x += c.width + 6
    y += 10 + max(c.height for c in crops) + 10
canvas.save(out)
print(out, canvas.size)
