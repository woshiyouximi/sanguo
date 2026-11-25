import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
im = Image.open(os.path.join(OUT, "hud", "hud_0830.png")).convert("RGB")
find = im.crop((140, 296, 212, 360))
enemy = im.crop((452, 296, 528, 360))
S = 12
_mk.montage([(find.resize((find.width * S, find.height * S), Image.NEAREST), "ours x12"),
             (enemy.resize((enemy.width * S, enemy.height * S), Image.NEAREST), "enemy x12")],
            os.path.join(OUT, "s07c_hud_fields2.png"), cols=2, title="HUD 4 stat fields x12")
print("ok")
