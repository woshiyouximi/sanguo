# -*- coding: utf-8 -*-
"""把 v1 与 fix 版 UI 并排画在棋盘格上，肉眼比抠图与形态。"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, r"F:\sanguo\work")
from build_env_v1 import _alpha_key, _trim, font

A = r"F:\sanguo\project\art_ref\cloud_env_v1"
B = r"F:\sanguo\project\art_ref\cloud_env_v1_fix"
ids = [f[:-4] for f in sorted(os.listdir(B)) if f.endswith(".png")]

cell, pad, lab = 340, 22, 30
W = pad * 2 + cell * 2 + 20
H = pad * 2 + len(ids) * (cell + lab + 12) + 30
c = Image.new("RGB", (W, H), (24, 20, 18))
d = ImageDraw.Draw(c)
f1, f2 = font(26), font(20)
d.text((pad, 6), "左 = v1 原始   右 = fix 重跑", font=f2, fill=(217, 178, 106))

for i, rid in enumerate(ids):
    y = pad + 30 + i * (cell + lab + 12)
    for j, base in enumerate((A, B)):
        x = pad + j * (cell + 20)
        for by in range(0, cell, 20):
            for bx in range(0, cell, 20):
                col = (56, 56, 56) if ((bx // 20 + by // 20) % 2 == 0) else (72, 72, 72)
                d.rectangle([x + bx, y + by, x + min(bx + 19, cell - 1), y + min(by + 19, cell - 1)], fill=col)
        p = os.path.join(base, rid + ".png")
        if not os.path.exists(p):
            continue
        im = _trim(_alpha_key(Image.open(p).convert("RGB")))
        im.thumbnail((cell - 10, cell - 10), Image.LANCZOS)
        c.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
    d.text((pad, y + cell + 4), rid.replace("ui_", ""), font=f1, fill=(232, 223, 200))

out = r"F:\sanguo\work\env_ui_fix_review.jpg"
c.save(out, quality=90, optimize=True)
print(out, c.size, os.path.getsize(out) // 1024, "KB")
