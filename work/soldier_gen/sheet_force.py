# -*- coding: utf-8 -*-
"""对照图：FORCE 士兵按 锚点对齐 拼成 contact sheet，用于目视判断尺寸/裁剪。

用法：python sheet_force.py <letter> <out.png>
每个兵种一张：行 = Walk(12) / Attack(10) / Wait(6)，帧按锚点对齐、画布固定。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(r"F:\sanguo")
GEN = ROOT / "work" / "soldier_gen"
PNG = ROOT / "export" / "png" / "SHAPE" / "FORCE"
MAN = json.loads((ROOT / "export" / "manifest_art.json").read_text(encoding="utf-8"))
FORCE = {m["path"].replace("\\", "/").split("/")[-1].rsplit(".", 1)[0].upper(): m
         for m in MAN if m["path"].replace("\\", "/").upper().startswith("SHAPE/FORCE/")}
SOL = json.loads((GEN / "soldiers_raw.json").read_text(encoding="utf-8"))

ACTS = ("Walk", "Attack", "Wait")


def open_any(stem):
    p = PNG / (stem + ".png")
    if p.exists():
        return Image.open(p).convert("RGBA")
    for q in PNG.glob("*.png"):
        if q.stem.upper() == stem.upper():
            return Image.open(q).convert("RGBA")
    raise FileNotFoundError(stem)


def main():
    letter = sys.argv[1]
    out = sys.argv[2]
    obj = None
    for o in SOL:
        if o["obj"] <= 44:
            first = next(iter(o["anims"].values()))[0]
            if first[1] == letter:
                obj = o
                break
    frames = [(a, s) for a in ACTS for s in obj["anims"][a]]
    CELL_W, CELL_H, PAD = 300, 160, 6
    cols = 12
    rows = (len(frames) + cols - 1) // cols
    W, H = cols * (CELL_W + PAD) + PAD, rows * (CELL_H + PAD) + PAD
    sheet = Image.new("RGBA", (W, H), (28, 34, 30, 255))
    dr = ImageDraw.Draw(sheet)
    for i, (act, stem) in enumerate(frames):
        md = FORCE[stem.upper()]
        im = open_any(stem)
        cx = i % cols
        cy = i // cols
        ox = PAD + cx * (CELL_W + PAD)
        oy = PAD + cy * (CELL_H + PAD)
        dr.rectangle([ox, oy, ox + CELL_W - 1, oy + CELL_H - 1], outline=(70, 80, 72, 255))
        # 锚点放在格子底边中点
        ax, ay = ox + CELL_W // 2, oy + CELL_H - 6
        sheet.alpha_composite(im, (ax - md["offx"], ay - md["offy"]))
        dr.line([ax - 14, ay, ax + 14, ay], fill=(255, 80, 80, 255), width=1)
        dr.line([ax, ay - 120, ax, ay], fill=(80, 120, 255, 90), width=1)
        dr.text((ox + 3, oy + 2), "%s %s/%d" % (stem, act, md["width"]), fill=(210, 220, 200, 255))
    sheet.save(out)


main()
