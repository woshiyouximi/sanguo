# -*- coding: utf-8 -*-
"""Contact sheet: all 26 sprites at 6x nearest, labelled, on mid-gray, with slice guides."""
import os
from PIL import Image, ImageDraw

WEB = r"F:\sanguo\game\web\assets"
NAMES = ["frame_panel.png", "plate_btn.png", "plate_sq.png", "plate_sel.png",
         "bar_div.png", "gem_gold.png"]
FILES = [os.path.join(WEB, "ui", "orig", n) for n in NAMES]
FILES += [os.path.join(WEB, "ui", "orig", "force_%02d.png" % i) for i in range(1, 14)]
FILES += [os.path.join(WEB, "battleui", n) for n in
          ["slot.png", "slot_off.png", "cmd_on.png", "cmd_off.png", "port.png", "msg.png", "sep.png"]]

SCALE = 6
PAD = 10
LABEL_H = 14
CELL_W = 320
CELL_H = 120
COLS = 5

rows = (len(FILES) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * CELL_W, rows * CELL_H), (60, 60, 60))
d = ImageDraw.Draw(sheet)
for i, path in enumerate(FILES):
    im = Image.open(path).convert("RGBA")
    big = im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)
    cx = (i % COLS) * CELL_W
    cy = (i // COLS) * CELL_H
    # checker to show transparency
    for yy in range(30, CELL_H - 2, 8):
        for xx in range(2, CELL_W - 2, 8):
            if ((xx // 8) + (yy // 8)) % 2 == 0:
                d.rectangle([cx + xx, cy + yy, cx + xx + 7, cy + yy + 7], fill=(80, 80, 80))
    sheet.paste(big, (cx + PAD, cy + 30), big)
    d.text((cx + 4, cy + 3), "%s %dx%d" % (os.path.basename(path), im.width, im.height), fill=(255, 255, 0))
    d.rectangle([cx + PAD - 1, cy + 29, cx + PAD + big.width, cy + 30 + big.height], outline=(120, 120, 120))

out = r"F:\sanguo\work\cocos_skin\_sheet.png"
sheet.save(out)
print(out, sheet.size)
