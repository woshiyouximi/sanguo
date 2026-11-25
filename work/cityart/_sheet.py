# -*- coding: utf-8 -*-
"""Contact sheet of MENU candidates, nearest-neighbour upscaled, filename + size captioned."""
import io
import os
import sys
from PIL import Image, ImageDraw, ImageFont

SRC = r"F:\sanguo\export\png\SHAPE\MENU"
OUTDIR = r"F:\sanguo\work\cityart"


def font(size):
    for p in (r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\arial.ttf"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def sheet(names, out, cols=5, scale=2.0, cw=430, ch=300):
    f = font(16)
    rows = (len(names) + cols - 1) // cols
    W, H = cols * cw, rows * ch
    canvas = Image.new("RGB", (W, H), (26, 30, 36))
    d = ImageDraw.Draw(canvas)
    for i, n in enumerate(names):
        p = os.path.join(SRC, n)
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGBA")
        w, h = im.size
        s = min(scale, (cw - 24) / w, (ch - 56) / h)
        # checkerboard behind so alpha is visible
        cx = (i % cols) * cw
        cy = (i // cols) * ch
        for by in range(cy + 24, cy + ch - 34, 12):
            for bx in range(cx + 8, cx + cw - 8, 12):
                if ((bx - cx) // 12 + (by - cy) // 12) % 2 == 0:
                    d.rectangle([bx, by, bx + 11, by + 11], fill=(58, 62, 70))
        nw, nh = max(1, int(w * s)), max(1, int(h * s))
        up = im.resize((nw, nh), Image.NEAREST)
        canvas.paste(up, (cx + 10, cy + 26), up)
        d.text((cx + 8, cy + 4), "%s  %dx%d  x%.1f" % (n, w, h, s), fill=(240, 230, 200), font=f)
    canvas.save(out)
    print("WROTE", out, canvas.size)


A = ["D1_1B.png", "D1_6A.png", "D1_6B.png", "D1_6C.png", "D1_8A.png",
     "D1_8B.png", "D1_8C.png", "C3_A.png", "C3_B1.png", "D3_1A.png",
     "D3_1B.png", "D3_1C.png", "D3_2A.png", "D3_2D.png", "D12A.png",
     "D14.png", "WARINFO03.png", "WARINFO04.png", "WARINFO05.png", "E1_D.png",
     "D0_C.png", "D0_D.png", "D0_B.png", "D7_A.png", "D25.png",
     "D3_2G.png", "D3_2H.png", "WARPREP02.png", "WARPREP07.png", "WARINFO01.png"]

B = ["WAR01.png", "WAR02.png", "WAR03.png", "WAR04.png", "WAR05.png",
     "WAR06.png", "WAR07.png", "WAR09.png", "WAR0A.png", "WAR0B.png",
     "WAR0C.png", "SB_H0.png", "SB_H1.png", "SB_H2.png", "SB_H3.png",
     "SB_H4.png", "SB_H5.png", "SB_H6.png", "SB_H7.png", "SB_V0.png",
     "SB_V1.png", "SB_V2.png", "SB_V3.png", "SB_V4.png", "SB_V5.png",
     "SB_V6.png", "SB_V7.png", "S01A.png", "S01B.png", "S02A.png",
     "S02B.png", "C4_A.png", "C4_B.png", "C4_C.png", "D3_1D.png",
     "D12F.png", "D3_2E.png", "D3_2F.png", "WARPREP03.png", "WARPREP05.png"]

sheet(A, os.path.join(OUTDIR, "_sheet_frames.png"), cols=5, scale=1.2, cw=430, ch=330)
sheet(B, os.path.join(OUTDIR, "_sheet_parts.png"), cols=5, scale=4.0, cw=330, ch=170)
