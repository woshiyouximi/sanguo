import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
ts = [480, 495, 510, 525, 540]
items = []
for t in ts:
    p = _mk.grab(t, f"hud_{t}.png", sub="hud")
    im = Image.open(p).convert("RGB")
    e = im.crop((444, 296, 532, 360))
    items.append((e.resize((e.width * 7, e.height * 7), Image.NEAREST), f"enemy {_mk.hms(t)}"))
_mk.montage(items, os.path.join(OUT, "s07d_enemy_rows.png"), cols=3, title="enemy card stat rows over time x7 (08:00-09:00)")
print("ok")
