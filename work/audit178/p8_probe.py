import sys, os, numpy as np
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
BOX = (289, 260, 353, 288)
p = _mk.grab(390.60, "probe_ascii.png", sub="ocr")
g = np.asarray(Image.open(p).convert("L").crop(BOX), dtype=np.float32)
for th in (45, 60, 75):
    m = g < th
    print(f"--- th={th} dark={int(m.sum())}")
    for r in m[::2]:
        print("".join("#" if v else "." for v in r))
