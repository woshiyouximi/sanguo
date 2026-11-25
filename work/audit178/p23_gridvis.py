import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image, ImageDraw

OUT = _mk.OUT
im = Image.open(_mk.grab(470.0, "grid_src.png", sub="grid")).convert("RGB")
c = im.crop((60, 30, 580, 230))       # 520x200 主体区域
S = 3
c = c.resize((c.width * S, c.height * S), Image.LANCZOS)
d = ImageDraw.Draw(c)
for x in range(0, 520, 20):
    X = x * S
    col = (255, 255, 0) if x % 100 == 0 else (0, 255, 255)
    d.line([(X, 0), (X, c.height)], fill=col, width=1)
    if x % 40 == 0:
        d.text((X + 2, 2), str(60 + x), fill=(255, 255, 0))
for y in range(0, 200, 20):
    Y = y * S
    col = (255, 255, 0) if y % 100 == 0 else (0, 255, 255)
    d.line([(0, Y), (c.width, Y)], fill=col, width=1)
    if y % 40 == 0:
        d.text((2, Y + 2), str(30 + y), fill=(255, 255, 0))
c.save(os.path.join(OUT, "s10_grid_0750.png"))
print(c.size)
