# -*- coding: utf-8 -*-
"""试装：把 BODY/WEAPON/HORSE 按候选公式叠起来，出大图看语义。

假设 H1：draw = anchor - (offx, offy)  （即 SHP 头 off 被 loader 取负后直接加）
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(r"F:\sanguo")
PNG = ROOT / "export" / "png" / "SHAPE"
MAN = json.loads((ROOT / "export" / "manifest_art.json").read_text(encoding="utf-8"))
META = {m["path"]: m for m in MAN}


def info(rel):
    """rel like 'MAJOR/BODY/L1W10001'"""
    p = rel.replace("\\", "/")
    m = META.get("SHAPE/" + p + ".SHP") or META.get(p + ".SHP")
    return m


def load(rel):
    p = PNG / (rel.replace("/", "\\") + ".png")
    return Image.open(p).convert("RGBA")


CX0, CX1 = -110, 190
CY0, CY1 = -215, 85
OX, OY = -CX0, -CY0


def compose(layers, formula, mark_ground=True):
    """layers: [(rel, (dx,dy))] ; 固定画布，锚点在 (OX,OY)，y 向下。"""
    W, H = CX1 - CX0, CY1 - CY0
    canvas = Image.new("RGBA", (W, H), (24, 26, 32, 255))
    d = ImageDraw.Draw(canvas)
    if mark_ground:
        # 锚点：红=锚点(0,0)；蓝线=y=0 地面参考
        d.line([(0, OY), (W, OY)], fill=(60, 90, 160))
        d.line([(OX - 12, OY), (OX + 12, OY)], fill=(230, 70, 70))
        d.line([(OX, OY - 12), (OX, OY + 12)], fill=(230, 70, 70))
    for rel, extra in layers:
        im = load(rel)
        m = info(rel)
        ax, ay = formula(m, im)
        canvas.alpha_composite(im, (ax + extra[0] + OX, ay + extra[1] + OY))
    return canvas, (OX, OY)


def f_h1(m, im):
    return (-m["offx"], -m["offy"])


def main():
    out = ROOT / "work" / "gen_sprites"
    out.mkdir(parents=True, exist_ok=True)
    cases = [
        ("body_only", [("MAJOR/BODY/L1W10001", (0, 0))]),
        ("body_sword", [("MAJOR/BODY/L1W10001", (0, 0)), ("MAJOR/WEAPON/A1W10001", (0, 0))]),
        ("body_lance", [("MAJOR/BODY/L1W20001", (0, 0)), ("MAJOR/WEAPON/B1W10001", (0, 0))]),
        ("horse", [("MAJOR/HORSE/HAW10001", (0, 0))]),
        ("body_horse", [("MAJOR/BODY/L1W10001", (0, 0)), ("MAJOR/HORSE/HAW10001", (0, 0))]),
        ("death1", [("MAJOR/BODY/L1F10001", (0, 0))]),
        ("death10", [("MAJOR/BODY/L1F10010", (0, 0))]),
        ("attack_mid", [("MAJOR/BODY/L1A10006", (0, 0)), ("MAJOR/WEAPON/A1A10006", (0, 0))]),
    ]
    tiles = []
    for name, layers in cases:
        missing = [r for r, _ in layers if info(r) is None]
        if missing:
            print("MISS", name, missing)
            continue
        cv, _ = compose(layers, f_h1)
        tiles.append((name, cv))
        print(name, cv.size)
    # 横向拼版，放大 2x
    Z = 2
    pad = 8
    W = sum(t[1].width for t in tiles) * Z + pad * (len(tiles) + 1)
    Hh = max(t[1].height for t in tiles) * Z + pad * 2 + 22
    sheet = Image.new("RGB", (W, Hh), (12, 13, 17))
    d = ImageDraw.Draw(sheet)
    x = pad
    for name, cv in tiles:
        big = cv.resize((cv.width * Z, cv.height * Z), Image.NEAREST)
        # 锚点十字线在 (pad,pad) of cv
        dx, dy = pad * Z, pad * Z
        d.line([(x + dx - 10, dy + 0), (x + dx + 10, dy)], fill=(255, 80, 80))
        d.line([(x + dx, dy - 10), (x + dx, dy + 10)], fill=(255, 80, 80))
        sheet.paste(big.convert("RGB"), (x, pad))
        d.text((x + 2, pad + big.height + 4), name, fill=(230, 220, 190))
        x += big.width + pad
    sheet.save(out / "probe_h1.png")
    print("wrote", out / "probe_h1.png", sheet.size)


if __name__ == "__main__":
    main()
