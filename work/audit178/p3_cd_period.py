import sys, os, numpy as np
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT

# ---- precise countdown period: diff the numeral cell frame by frame at native 30fps ----
T0, DUR = 384.0, 24.0     # 06:24 .. 06:48
sub = "cdnum"
d = os.path.join(OUT, sub)
arr = _mk.grab_seq(T0, T0 + DUR, 30, "n", sub)
print("frames", len(arr))

prev = None
changes = []
for i, p in enumerate(arr):
    im = Image.open(p).convert("L").crop((283, 256, 332, 292))
    a = np.asarray(im, dtype=np.int16)
    if prev is not None:
        diff = np.abs(a - prev).mean()
        if diff > 6:                    # numeral changed
            changes.append(i)
    prev = a

print("change frame idx:", changes)
if len(changes) > 1:
    deltas = np.diff(changes)
    print("delta frames:", deltas.tolist())
    print("delta sec:", [round(x / 30.0, 3) for x in deltas])
print("total changes:", len(changes), "over", DUR, "s")
