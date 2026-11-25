import sys, os, numpy as np
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
RAW = os.path.join(OUT, "cd_raw.raw")
W, H = 60, 26
T0 = 466.0
buf = np.fromfile(RAW, dtype=np.uint8)
n = buf.size // (W * H)
fr = buf[:n * W * H].reshape(n, H, W)
masks = (fr < 45)
black = masks.reshape(n, -1).all(1)

# merge runs of nearly-identical masks into states, require len>=12
states = []
i = 0
while i < n:
    if black[i]:
        i += 1
        continue
    j = i + 1
    while j < n and not black[j] and (masks[j] ^ masks[i]).sum() <= 6:
        j += 1
    if j - i >= 12:
        states.append((i, j - 1))
    i = j

print("states", len(states))
for k, (a, b) in enumerate(states):
    print(f"  {k:02d} f{a:4d}-{b:4d} t={T0 + a / 30:7.2f}..{T0 + b / 30:7.2f} len={(b - a + 1) / 30:5.2f}s")

ds = [states[k + 1][0] - states[k][0] for k in range(len(states) - 1)]
print("start deltas:", ds)

items = []
for k, (a, b) in enumerate(states):
    img = Image.fromarray(fr[a]).convert("L").convert("RGB")
    img = img.resize((W * 3, H * 3), Image.NEAREST)
    items.append((img, f"{k}:{T0 + a / 30:.1f}"))
_mk.montage(items, os.path.join(OUT, "s09_cd_states_full.png"), cols=6,
            title="07:46-09:02 时间牌每个稳定状态的实值")
