# -*- coding: utf-8 -*-
"""Two contact sheets that do not overlap: big frames (3x, stacked) and small icons (6x, grid)."""
import os
from PIL import Image, ImageDraw

WEB = r"F:\sanguo\game\web\assets"
BIG = ["frame_panel.png", "plate_btn.png", "plate_sq.png", "plate_sel.png", "bar_div.png"]
SMALL = ["gem_gold.png"] + ["force_%02d.png" % i for i in range(1, 14)] + \
        ["slot.png", "slot_off.png", "cmd_on.png", "cmd_off.png", "port.png", "msg.png", "sep.png"]


def draw_cell(d, im, x, y, scale):
    big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    for yy in range(0, big.height, 8):
        for xx in range(0, big.width, 8):
            if ((xx // 8) + (yy // 8)) % 2 == 0:
                d.rectangle([x + xx, y + yy, x + xx + 7, y + yy + 7], fill=(78, 78, 78))
    return big


# sheet A: big frames
SW, SH = 1000, 240
sheetA = Image.new("RGB", (SW, SH * len(BIG)), (52, 52, 52))
dA = ImageDraw.Draw(sheetA)
for i, name in enumerate(BIG):
    im = Image.open(os.path.join(WEB, "ui", "orig", name)).convert("RGBA")
    top = i * SH + 18
    dA.text((6, top - 14), "%s %dx%d  (3x)" % (name, im.width, im.height), fill=(255, 255, 0))
    big = draw_cell(dA, im, 8, top, 3)
    sheetA.paste(big, (8, top), big)
    dA.rectangle([7, top - 1, 8 + big.width, top + big.height], outline=(130, 130, 130))
sheetA.save(r"F:\sanguo\work\cocos_skin\_sheet_big.png")

# sheet B: small icons
CELL_W, CELL_H = 260, 250
COLS = 6
rows = (len(SMALL) + COLS - 1) // COLS
sheetB = Image.new("RGB", (COLS * CELL_W, rows * CELL_H), (52, 52, 52))
dB = ImageDraw.Draw(sheetB)
for i, name in enumerate(SMALL):
    p = os.path.join(WEB, "battleui", name) if name in (
        "slot.png", "slot_off.png", "cmd_on.png", "cmd_off.png", "port.png", "msg.png", "sep.png") \
        else os.path.join(WEB, "ui", "orig", name)
    im = Image.open(p).convert("RGBA")
    cx = (i % COLS) * CELL_W
    cy = (i // COLS) * CELL_H
    dB.text((cx + 4, cy + 3), "%s %dx%d (6x)" % (name, im.width, im.height), fill=(255, 255, 0))
    scale = max(1, min(6, (CELL_W - 20) // im.width, (CELL_H - 40) // im.height))
    big = draw_cell(dB, im, cx + 8, cy + 24, scale)
    sheetB.paste(big, (cx + 8, cy + 24), big)
    dB.rectangle([cx + 7, cy + 23, cx + 8 + big.width, cy + 24 + big.height], outline=(130, 130, 130))
sheetB.save(r"F:\sanguo\work\cocos_skin\_sheet_small.png")
print("ok", sheetA.size, sheetB.size)
