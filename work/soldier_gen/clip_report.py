# -*- coding: utf-8 -*-
"""量化「画布宽 W 会裁掉多少墨水」——逐兵种、逐动作统计落在 ±W/2 窗口外的 alpha 像素占比。

用法: python clip_report.py [W ...]
输出: 每兵种 walk/attack 的裁切像素占比 + 全局最大左/右极值。
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(r"F:\sanguo")
GEN = ROOT / "work" / "soldier_gen"
PNG = ROOT / "export" / "png" / "SHAPE" / "FORCE"

TROOPS = [("A", "podao"), ("C", "changqiang"), ("D", "dadao"), ("F", "archer"),
          ("I", "lianchui"), ("H", "feidao"), ("J", "wudou"), ("K", "manzu"),
          ("E", "tiechui"), ("L", "tengjia"), ("M", "huangjin"), ("B", "nu"), ("G", "nvbing")]


def load_manifest():
    man = json.loads((ROOT / "export" / "manifest_art.json").read_text(encoding="utf-8"))
    out = {}
    for m in man:
        p = m["path"].replace("\\", "/")
        if p.upper().startswith("SHAPE/FORCE/"):
            out[p.rsplit("/", 1)[-1].rsplit(".", 1)[0].upper()] = m
    return out


def main():
    widths = [int(a) for a in sys.argv[1:]] or [100, 88, 120]
    man = load_manifest()
    sol = json.loads((GEN / "soldiers_raw.json").read_text(encoding="utf-8"))
    by = {}
    for o in sol:
        stem = o["anims"]["Walk"][0]
        if stem[2].upper() == "H" or stem[0].upper() != "M":
            continue
        by[stem[1].upper()] = o

    print("W\t troop\t act\t ink_px\t clipped_px\t clipped%%\t maxLeft\t maxRight")
    for W in widths:
        half = W / 2.0
        for letter, gname in TROOPS:
            obj = by[letter]
            for key in ("Walk", "Attack"):
                tot = clip = 0
                ml = mr = 0
                for stem in obj["anims"][key]:
                    cand = [q for q in PNG.glob("*.png") if q.stem.upper() == stem.upper()]
                    im = Image.open(cand[0]).convert("RGBA").getchannel("A")
                    ox = man[stem.upper()]["offx"]
                    px = im.load()
                    for x in range(im.width):
                        col = 0
                        for y in range(im.height):
                            if px[x, y]:
                                col += 1
                        tot += col
                        if col:
                            e = x - ox
                            ml = min(ml, e)
                            mr = max(mr, e)
                            if abs(e) > half:
                                clip += col
                pct = 100.0 * clip / tot if tot else 0.0
                print("%d\t%s\t%s\t%d\t%d\t%.2f\t%d\t%d" % (W, gname, key, tot, clip, pct, ml, mr))


main()
