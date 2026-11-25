import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT

def seq(t0, t1, step, prefix, out, title, cols=4, scale=1.0):
    items = []
    t = t0
    while t <= t1 + 1e-6:
        p = _mk.grab(t, f"{prefix}_{int(round(t*10)):05d}.png", sub=prefix)
        im = Image.open(p).convert("RGB")
        if scale != 1.0:
            im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        items.append((im, _mk.hms(t)))
        t += step
    _mk.montage(items, os.path.join(OUT, out), cols=cols, title=title)
    print(out, len(items))

# battle A start
seq(361.0, 371.0, 0.5, "sa", "s01a_battleA_start.png", "battle-A start 06:01-06:11 (0.5s step)", cols=5, scale=0.7)
# battle B start (formation select -> battle)
seq(465.0, 480.0, 0.5, "sb", "s01b_battleB_start.png", "battle-B start 07:45-08:00 (0.5s step)", cols=5, scale=0.7)
