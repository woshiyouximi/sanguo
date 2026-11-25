# -*- coding: utf-8 -*-
"""参数扫描小图：同一组帧、四种后处理参数、叠在 32 色地形上。"""
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_sheets import (AB, GROUPS, INK, INK2, UNITS_PNG, crop, font, frame_map,
                         paste, plaque, tag, terrain)

S = 2
FW, FH = 80, 104
VG = "archer_front_f00%d"
VARIANTS = [
    ("原始（1297–2874 色/帧）", None),
    ("32 色 + 描边", "32o"),
    ("32 色 + 描边 + 2x 像素化", "32op2"),
    ("24 色 + 描边 + 2x 像素化", "24op2"),
    ("32 色 + 描边 + 2x + Bayer 抖动", "32op2d"),
]
W = 40 + 4 * FW * S + 250
H = 84 + len(VARIANTS) * (FH * S + 30) + 40
cv, _ = terrain(W, H, 32)
dr = ImageDraw.Draw(cv)
f_lab, f_tiny = font(16), font(13)
plaque(cv, (0, 0), W, 78)
tag(dr, (24, 10), "参数扫描（同一组帧 archer_front f000-003，2x，背景=terrain_04 量化到 32 色）", f_tiny, INK2)
tag(dr, (24, 30), "想让它像原作，到底哪个参数在起作用？", font(24), INK)
m = frame_map()
y = 88
for label, d in VARIANTS:
    tag(dr, (24, y), label, f_lab, INK)
    src = UNITS_PNG if d is None else os.path.join(AB, "_var", d, "units_00.px.png")
    for i in range(4):
        paste(cv, crop(src, m, VG % i), (24 + i * FW * S, y + 24), S)
    dr.line([(20, y - 4), (W - 20, y - 4)], fill=(232, 223, 200, 36))
    y += FH * S + 30
cv.convert("RGB").save(os.path.join(r"F:\sanguo\work\pixel_ab\_probe", "sweep.png"), quality=94,
                       subsampling=0)
print("ok", cv.size)
