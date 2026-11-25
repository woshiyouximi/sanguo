import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
# 07:54 战场中段（红兵行军）放大 4 倍，量士兵间距/格距
p = _mk.grab(474.0, "geom_0754.png", sub="geom")
im = Image.open(p).convert("RGB")
c = im.crop((0, 130, 380, 300))
c.resize((c.width * 4, c.height * 4), Image.NEAREST).save(os.path.join(OUT, "s02a_march_0754_x4.png"))
print(p, c.size)
