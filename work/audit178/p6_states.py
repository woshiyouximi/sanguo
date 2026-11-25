import sys, os, numpy as np
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
BOX = (296, 264, 348, 285)
T0 = 384.0

arr = [os.path.join(OUT, "cdnum", f) for f in sorted(os.listdir(os.path.join(OUT, "cdnum"))) if f.endswith(".png")]
print("frames", len(arr))

states = []   # (first_frame_idx, ref_mask, ref_img)
for i, p in enumerate(arr):
    g = np.asarray(Image.open(p).convert("L").crop(BOX), dtype=np.uint8)
    m = (g < 95)
    if not states or (m ^ states[-1][1]).sum() > 18:
        states.append((i, m, Image.open(p).convert("RGB").crop(BOX)))
print("states:", len(states))
for k, (i, m, im) in enumerate(states):
    end = states[k + 1][0] if k + 1 < len(states) else len(arr)
    print(f"  state{k:02d} frames {i:3d}-{end-1:3d}  t={T0 + i/30:7.2f}..{T0 + (end-1)/30:7.2f}  dur={(end-i)/30:5.2f}s")

items = [(im.resize((im.width * 6, im.height * 6), Image.NEAREST), f"#{k} t={T0+i/30:.2f}") for k, (i, m, im) in enumerate(states)]
_mk.montage(items, os.path.join(OUT, "s08d_states.png"), cols=4, title="countdown numeral states 06:24-06:48")
