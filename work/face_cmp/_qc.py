# -*- coding: utf-8 -*-
import os, json
from PIL import Image, ImageDraw, ImageFont
OUT = r"F:\sanguo\work\face_cmp"
HERO = r"F:\sanguo\game\web\assets\hero"
FPNG = r"F:\sanguo\export\png\SHAPE\FACE"
cov = json.load(open(os.path.join(OUT, "_cov.json"), encoding="utf-8"))
by = {r["name"]: r for r in cov["recs"]}
BG = (14, 17, 22); GOLD = (216, 179, 106); DIM = (152, 160, 170); INK = (232, 232, 226)
FONT = r"C:\Windows\Fonts\msyh.ttc"


def f(s):
    return ImageFont.truetype(FONT, s, index=0)


def cover(im, w, h, pos=0.14):
    sw, sh = im.size
    s = max(w / sw, h / sh)
    nw, nh = max(w, int(round(sw * s))), max(h, int(round(sh * s)))
    r = im.resize((nw, nh), Image.LANCZOS)
    return r.crop(((nw - w) // 2, int(round((nh - h) * pos)), (nw - w) // 2 + w,
                   int(round((nh - h) * pos)) + h))


names = ["大喬", "小喬", "貂蟬", "孫尚香", "祝融夫人", "關鳳", "孟獲", "朵思大王"]
S = 1.6
tw, th = int(100 * S), int(120 * S)
BW, BH = 2 * tw + 40, th + 76
COLS = 4
W, H = 24 + COLS * BW, 60 + 2 * BH
im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)
d.text((18, 12), "性别/气质抽查：6 名女性 + 2 名南蛮首领 — 左原作 / 右 AI（100×120 等比）",
       font=f(19), fill=INK)
for i, n in enumerate(names):
    r = by[n]
    o = Image.open(os.path.join(FPNG, r["face_num"] + ".png")).convert("RGB")
    a = Image.open(os.path.join(HERO, n + ".webp")).convert("RGB")
    cx, cy = 14 + (i % COLS) * BW, 62 + (i // COLS) * BH
    d.rectangle([cx - 4, cy - 4, cx + BW - 12, cy + BH - 26], fill=(30, 36, 44))
    im.paste(o.resize((tw, th), Image.LANCZOS), (cx, cy))
    im.paste(cover(a, tw, th), (cx + tw + 8, cy))
    d.text((cx, cy + th + 6), f"{n}  id{r['id']}", font=f(16), fill=GOLD)
im.save(os.path.join(OUT, "_qc_women.png"), quality=92)
print("ok", im.size)
