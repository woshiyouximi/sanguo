# -*- coding: utf-8 -*-
"""Build timestamped contact sheets from _scan frames."""
import os, sys, glob
from PIL import Image, ImageDraw, ImageFont

SCAN = r"F:\sanguo\work\video_ref\_scan"
OUT = r"F:\sanguo\work\video_ref\_sheets"
os.makedirs(OUT, exist_ok=True)

files = sorted(glob.glob(os.path.join(SCAN, "s_*.jpg")))
print("frames", len(files))

COLS, ROWS = 6, 5
CW, CH = 320, 180
LABEL = 18
PER = COLS * ROWS

try:
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 15)
except Exception:
    font = ImageFont.load_default()

def fmt(t):
    return "%d:%02d:%02d" % (t // 3600, (t % 3600) // 60, t % 60)

per_sheet = PER
n_sheets = (len(files) + per_sheet - 1) // per_sheet
for s in range(n_sheets):
    chunk = files[s * per_sheet:(s + 1) * per_sheet]
    rows = (len(chunk) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * CW, rows * (CH + LABEL)), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    for k, f in enumerate(chunk):
        idx = s * per_sheet + k
        t = idx * 15
        im = Image.open(f).convert("RGB")
        im = im.resize((CW, CH))
        x = (k % COLS) * CW
        y = (k // COLS) * (CH + LABEL)
        sheet.paste(im, (x, y))
        d.text((x + 4, y + CH + 1), "#%03d %s" % (idx, fmt(t)), fill=(255, 255, 0), font=font)
    p = os.path.join(OUT, "sheet_%02d.png" % s)
    sheet.save(p)
    print(p, sheet.size)
