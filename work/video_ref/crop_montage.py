# -*- coding: utf-8 -*-
"""Crop several regions out of one frame and lay them out in a labelled montage.

usage: python crop_montage.py <t_sec> <out.png> <scale> <cols> <x,y,w,h> <x,y,w,h> ...
Each cell is labelled with its source rect so coordinates can be quoted in the report.
"""
import sys, os, subprocess
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "bili", "p01.mp4")
FF = r"C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe"

t = sys.argv[1]
out = sys.argv[2]
scale = int(sys.argv[3])
cols = int(sys.argv[4])
rects = [tuple(int(v) for v in a.split(",")) for a in sys.argv[5:]]

tmp = os.path.join(HERE, "_scan", "_cm_%.1f.png" % float(t))
os.makedirs(os.path.dirname(tmp), exist_ok=True)
if not os.path.exists(tmp):
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", t, "-i", SRC,
                    "-frames:v", "1", "-y", tmp], check=True)
im = Image.open(tmp).convert("RGB")

font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 16)
cells = []
for (x, y, w, h) in rects:
    c = im.crop((x, y, x + w, y + h)).resize((w * scale, h * scale), Image.NEAREST)
    cells.append(((x, y, w, h), c))
CW = max(c.size[0] for _, c in cells)
CH = max(c.size[1] for _, c in cells) + 20
rows = (len(cells) + cols - 1) // cols
canvas = Image.new("RGB", (cols * CW, rows * CH), (20, 20, 20))
dr = ImageDraw.Draw(canvas)
for i, ((x, y, w, h), c) in enumerate(cells):
    cx, cy = (i % cols) * CW, (i // cols) * CH
    canvas.paste(c, (cx, cy))
    dr.text((cx + 3, cy + c.size[1] + 2), "#%d %d,%d %dx%d @%.0fs" % (i, x, y, w, h, float(t)),
            fill=(255, 255, 0), font=font)
p = os.path.join(HERE, out)
canvas.save(p)
print(p, canvas.size, len(cells))
