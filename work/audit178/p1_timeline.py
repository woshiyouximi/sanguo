import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

# Timeline orientation: when does the battlefield actually appear?
ts = [320, 326, 332, 336, 340, 344, 350, 360, 370, 380, 400, 420, 440, 450, 456]
items = []
for t in ts:
    p = _mk.grab(t, f"tl_{t:04d}.png", sub="tl")
    im = Image.open(p).convert("RGB")
    im = im.resize((320, 180), Image.LANCZOS)
    items.append((im, _mk.hms(t)))
_mk.montage(items, os.path.join(_mk.OUT, "s00_timeline.png"), cols=5,
            title="p01 05:20-07:36 时间轴 (320x180 each)")
print("ok")
