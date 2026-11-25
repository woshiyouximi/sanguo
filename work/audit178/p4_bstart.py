import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

# ---- battle B start: 07:40-08:10, see formations / stillness ----
items = []
for t in [460, 466, 470, 473, 475, 476, 477, 478, 479, 480, 482, 485, 490, 496, 502, 508]:
    p = _mk.grab(t, f"bs_{t:04d}.png", sub="bs")
    items.append((Image.open(p).convert("RGB"), _mk.hms(t)))
_mk.montage(items, os.path.join(_mk.OUT, "s01_battleB_start.png"), cols=4,
            title="battle-B start 07:40-08:28 (full frame 640x360)")
print("ok")
