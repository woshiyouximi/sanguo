# -*- coding: utf-8 -*-
"""Nine-slice preview: render each MENU frame stretched to a panel size, dark bg."""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = r"F:\sanguo\export\png\SHAPE\MENU"
OUT = r"F:\sanguo\work\cityart"


def font(sz):
    try:
        return ImageFont.truetype(r"C:\Windows\Fonts\consola.ttf", sz)
    except OSError:
        return ImageFont.load_default()


def nine(path, box, slice_):
    im = Image.open(path).convert("RGBA")
    W, H = box
    l, t, r, b = slice_
    sx, sy = im.size
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # corners
    def paste_crop(cx, cy, cw, ch, dx, dy):
        if cw <= 0 or ch <= 0:
            return
        out.alpha_composite(im.crop((cx, cy, cx + cw, cy + ch)), (dx, dy))
    paste_crop(0, 0, l, t, 0, 0)
    paste_crop(sx - r, 0, r, t, W - r, 0)
    paste_crop(0, sy - b, l, b, 0, H - b)
    paste_crop(sx - r, sy - b, r, b, W - r, H - b)
    # edges (stretched)
    if t > 0 and sx - l - r > 0 and W - l - r > 0:
        out.alpha_composite(im.crop((l, 0, sx - r, t)).resize((W - l - r, t), Image.BILINEAR), (l, 0))
    if b > 0 and sx - l - r > 0 and W - l - r > 0:
        out.alpha_composite(im.crop((l, sy - b, sx - r, sy)).resize((W - l - r, b), Image.BILINEAR), (l, H - b))
    if l > 0 and sy - t - b > 0 and H - t - b > 0:
        out.alpha_composite(im.crop((0, t, l, sy - b)).resize((l, H - t - b), Image.BILINEAR), (0, t))
    if r > 0 and sy - t - b > 0 and H - t - b > 0:
        out.alpha_composite(im.crop((sx - r, t, sx, sy - b)).resize((r, H - t - b), Image.BILINEAR), (W - r, t))
    # centre
    if sx - l - r > 0 and sy - t - b > 0:
        out.alpha_composite(im.crop((l, t, sx - r, sy - b)).resize((W - l - r, H - t - b), Image.BILINEAR), (l, t))
    return out


CAND = [
    ("E1_D", (241, 73), (10, 10, 10, 10)),
    ("D25", (183, 40), (8, 8, 8, 8)),
    ("D7_A", (404, 116), (18, 18, 18, 18)),
    ("D3_1A", (640, 147), (26, 26, 26, 26)),
    ("D3_2A", (640, 147), (26, 26, 26, 26)),
    ("D3_1C", (640, 261), (30, 30, 30, 30)),
    ("D3_2D", (640, 261), (30, 30, 30, 30)),
    ("D12A", (640, 138), (22, 22, 22, 22)),
    ("D14", (640, 138), (22, 22, 22, 22)),
    ("D0_B", (64, 68), (14, 14, 14, 14)),
    ("WAR05", (111, 12), (14, 0, 14, 0)),
    ("WAR06", (111, 12), (14, 0, 14, 0)),
    ("WARPREP05", (140, 76), (10, 10, 10, 10)),
    ("D1_6B", (449, 410), (16, 16, 16, 16)),
    ("D1_6A", (191, 410), (16, 16, 16, 16)),
    ("D3_2G", (225, 40), (12, 12, 12, 12)),
]

PW, PH = 600, 190
GAP = 16
cols = 3
rows = (len(CAND) + cols - 1) // cols
CW, CH = PW + GAP, PH + 34
canvas = Image.new("RGB", (cols * CW + GAP, rows * CH + GAP), (14, 17, 21))
d = ImageDraw.Draw(canvas)
f = font(15)
for i, (name, box, sl) in enumerate(CAND):
    p = os.path.join(SRC, name + ".png")
    cx = (i % cols) * CW + GAP
    cy = (i // cols) * CH + GAP
    # pretend page bg behind (dark olive / carpet hint)
    for yy in range(cy + 24, cy + 24 + PH):
        for xx in range(cx, cx + PW, 1):
            pass
    base = Image.new("RGBA", (PW, PH), (20, 24, 30, 255))
    bd = ImageDraw.Draw(base)
    bd.rectangle([PW // 2 - 120, 0, PW // 2 + 120, PH], fill=(58, 26, 22, 255))
    if os.path.exists(p):
        lay = nine(p, (PW, PH), sl)
        base.alpha_composite(lay)
    canvas.paste(base.convert("RGB"), (cx, cy + 24))
    d.text((cx, cy + 3), "%s  src %s  slice(%s)" % (name, "%dx%d" % Image.open(p).size, ",".join(map(str, sl))), fill=(240, 230, 200), font=f)
canvas.save(os.path.join(OUT, "_sheet_nine.png"))
print("WROTE _sheet_nine.png", canvas.size)
