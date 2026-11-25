# -*- coding: utf-8 -*-
"""把同一地形的 a/b/b2/c 四个模式并成一排做对照图（各裁到场地部分 750x1000）"""
import os

from PIL import Image, ImageDraw

SRC = r"F:\sanguo\work\bg_orig"
OUT = r"F:\sanguo\work\bg_orig\modes_compare.png"
MODES = ["a", "b", "b2", "c"]
TITLES = {
    "a": "(a) 只有地面平铺",
    "b": "(b) 地面 + 顶部远景带 BG+MG+FG",
    "b2": "(b2) 地面 + MG+FG（去掉天空）",
    "c": "(c) 地面 + 四角框景",
}
# 只截场地那一段对比较方便看，仍保留完整宽度
CROP = (0, 90, 750, 1010)  # 920 高：HUD 下沿一点 + 整个场地

rows = []
for t in ("00", "04"):
    cells = []
    for m in MODES:
        p = os.path.join(SRC, "mode_%s_%s.png" % (t, m))
        im = Image.open(p).convert("RGB").crop(CROP)
        cells.append((m, im))
    rows.append((t, cells))

cw, ch = cells[0][1].size
scale = 0.62
cw2, ch2 = int(cw * scale), int(ch * scale)
PAD, LAB = 6, 26
W = len(MODES) * cw2 + (len(MODES) + 1) * PAD
H = len(rows) * (ch2 + LAB + PAD) + PAD
sheet = Image.new("RGB", (W, H), (16, 18, 22))
d = ImageDraw.Draw(sheet)
for r, (t, cells) in enumerate(rows):
    for c, (m, im) in enumerate(cells):
        x = PAD + c * (cw2 + PAD)
        y = PAD + r * (ch2 + LAB + PAD)
        sheet.paste(im.resize((cw2, ch2), Image.LANCZOS), (x, y + LAB))
        d.text((x + 4, y + 7), "terrain %s  %s" % (t, TITLES[m]), fill=(216, 179, 106))
        if c == len(MODES) - 1 and r == 0:
            pass
sheet.save(OUT, quality=90, optimize=True)
print("modes_compare", sheet.size, os.path.getsize(OUT))
