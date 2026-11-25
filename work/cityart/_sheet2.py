# -*- coding: utf-8 -*-
"""PALAIS 01..05 + hall 01..06 overview sheet (nearest, labelled)."""
import os
from PIL import Image, ImageDraw, ImageFont

POL = r"F:\sanguo\game\web\assets\bg\policy"
HALL = r"F:\sanguo\game\web\assets\bg\env"
OUT = r"F:\sanguo\work\cityart"


def font(size):
    p = r"C:\Windows\Fonts\consola.ttf"
    try:
        return ImageFont.truetype(p, size)
    except OSError:
        return ImageFont.load_default()


def sheet(items, out, cols, cell, scale):
    f = font(15)
    cw, ch = cell
    rows = (len(items) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * cw, rows * ch), (24, 28, 34))
    d = ImageDraw.Draw(canvas)
    for i, (lab, path) in enumerate(items):
        if not os.path.exists(path):
            d.text(((i % cols) * cw + 6, (i // cols) * ch + 6), lab + " MISSING", fill=(255, 80, 80), font=f)
            continue
        im = Image.open(path).convert("RGB")
        w, h = im.size
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.NEAREST)
        cx, cy = (i % cols) * cw, (i // cols) * ch
        canvas.paste(im, (cx + 4, cy + 22))
        d.text((cx + 4, cy + 3), "%s %dx%d" % (lab, w, h), fill=(240, 230, 200), font=f)
    canvas.save(out)
    print("WROTE", out, canvas.size)


pol = [("P%02d" % i, os.path.join(POL, "palais_%02d.png" % i)) for i in range(1, 6)]
pol.append(("YIELD", os.path.join(POL, "palais_yield.png")))
sheet(pol, os.path.join(OUT, "_sheet_palais.png"), cols=3, cell=(440, 350), scale=0.65)

hall = [("H%d" % i, os.path.join(HALL, "hall_%02d.jpg" % i)) for i in range(1, 7)]
sheet(hall, os.path.join(OUT, "_sheet_hall.png"), cols=6, cell=(260, 470), scale=0.2)
