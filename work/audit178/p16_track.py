import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
items = []
for t in range(468, 483):
    p = _mk.grab(float(t), f"tr_{t}.png", sub="track")
    im = Image.open(p).convert("RGB").resize((352, 198), Image.LANCZOS)
    items.append((im, _mk.hms(t)))
_mk.montage(items, os.path.join(OUT, "s03_track_0748_0802.png"), cols=5,
            title="07:48-08:02 每秒一帧：我方阵列是否前移 / 主将轨迹")
print("ok")
