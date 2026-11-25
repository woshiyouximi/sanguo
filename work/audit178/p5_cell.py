import sys, os, numpy as np
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
BOX = (268, 250, 404, 300)   # full numeral box

p = _mk.grab(390.0, "cell_probe2.png", sub="cd")
im = Image.open(p).convert("RGB")
c = im.crop(BOX)
c.resize((c.width * 6, c.height * 6), Image.NEAREST).save(os.path.join(OUT, "s08c_cell_probe2.png"))
print(c.size)
