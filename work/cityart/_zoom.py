# -*- coding: utf-8 -*-
"""Zoom sheet for small ornaments / scrollbar parts / indicators (6x, labelled)."""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = r"F:\sanguo\export\png\SHAPE\MENU"
OUT = r"F:\sanguo\work\cityart"


def font(sz):
    try:
        return ImageFont.truetype(r"C:\Windows\Fonts\consola.ttf", sz)
    except OSError:
        return ImageFont.load_default()


NAMES = ["WAR08", "WARINFO03", "D3_1D", "D12F", "D3_2E", "D3_2F", "C4_A", "C4_B", "C4_C",
         "SB_V2", "SB_V3", "SB_V6", "SB_V7", "SB_H2", "SB_H3", "SB_H6", "SB_H7", "SB_V4",
         "S01A", "S01B", "WAR07", "SB_H4"]
SC = 6
CW, CH = 200, 200
cols = 8
rows = (len(NAMES) + cols - 1) // cols
canvas = Image.new("RGB", (cols * CW, rows * CH), (14, 17, 21))
d = ImageDraw.Draw(canvas)
f = font(13)
for i, n in enumerate(NAMES):
    p = os.path.join(SRC, n + ".png")
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    s = min(SC, (CW - 20) / w, (CH - 40) / h)
    up = im.resize((int(w * s), int(h * s)), Image.NEAREST)
    cx, cy = (i % cols) * CW, (i // cols) * CH
    # checker
    for by in range(cy + 18, cy + CH, 10):
        for bx in range(cx, cx + CW, 10):
            if ((bx - cx) // 10 + (by - cy) // 10) % 2 == 0:
                d.rectangle([bx, by, bx + 9, by + 9], fill=(52, 56, 64))
    canvas.paste(up, (cx + 10, cy + 30), up)
    d.text((cx + 4, cy + 3), "%s %dx%d" % (n, w, h), fill=(240, 230, 200), font=f)
canvas.save(os.path.join(OUT, "_sheet_zoom.png"))
print("WROTE _sheet_zoom.png", canvas.size)
