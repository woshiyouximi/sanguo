# -*- coding: utf-8 -*-
"""12 张 750x1334 地形截图 → 4x3 宫格对照图 work/bg_orig_contact.jpg"""
import os

from PIL import Image, ImageDraw

SRC = r"F:\sanguo\work\bg_orig"
OUT = r"F:\sanguo\work\bg_orig_contact.jpg"

CW, CH = 360, 640  # 单格（750x1334 等比缩到 360x640.3）
PAD = 8
LABEL = 22
COLS, ROWS = 4, 3

W = COLS * CW + (COLS + 1) * PAD
H = ROWS * (CH + LABEL) + (ROWS + 1) * PAD
sheet = Image.new("RGB", (W, H), (16, 18, 22))
d = ImageDraw.Draw(sheet)

NAMES = [
    "00 城·砖地", "01 城·黄土", "02 市集·碎石", "03 船上·木甲板",
    "04 草原", "05 平原·杂土", "06 山地", "07 森林",
    "08 雪原", "09 沙漠·沙丘", "10 关卡", "11 长城",
]

missing = []
for i in range(12):
    p = os.path.join(SRC, "terrain_%02d.png" % i)
    if not os.path.exists(p):
        missing.append(p)
        continue
    im = Image.open(p).convert("RGB").resize((CW, CH - 4), Image.LANCZOS)
    col, row = i % COLS, i // COLS
    x = PAD + col * (CW + PAD)
    y = PAD + row * (CH + LABEL + PAD)
    sheet.paste(im, (x, y + LABEL))
    d.rectangle([x, y + LABEL, x + CW - 1, y + LABEL + CH - 5], outline=(70, 78, 90))
    d.text((x + 4, y + 5), NAMES[i], fill=(216, 179, 106))

sheet.save(OUT, quality=88, optimize=True, subsampling=1)
print("sheet", sheet.size, os.path.getsize(OUT), "bytes", "missing=", missing)
