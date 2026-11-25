import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT

# --- countdown numeral series: crop top-centre numerals, upscale 4x ---
NUM = (255, 248, 375, 296)   # in 640x360 coords
items = []
for i, t in enumerate(range(365, 466, 5)):      # 06:05 .. 07:45 step 5s
    p = _mk.grab(t, f"cd_{t:04d}.png", sub="cd")
    im = Image.open(p).convert("RGB")
    items.append((_mk.crop(im, NUM, 4), _mk.hms(t)))
_mk.montage(items, os.path.join(OUT, "s08a_countdown_0605_0745.png"), cols=4,
            title="countdown numeral crop x4 (06:05-07:45 step 5s)")

items = []
for t in [500, 510, 520, 530, 540, 550]:
    p = _mk.grab(t, f"cd_{t:04d}.png", sub="cd")
    im = Image.open(p).convert("RGB")
    items.append((_mk.crop(im, NUM, 4), _mk.hms(t)))
_mk.montage(items, os.path.join(OUT, "s08b_countdown_0820_0910.png"), cols=3,
            title="countdown numeral crop x4 (08:20-09:10 step 10s)")
print("ok")
