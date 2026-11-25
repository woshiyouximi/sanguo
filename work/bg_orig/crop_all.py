# -*- coding: utf-8 -*-
"""把 raw 里的整页截图裁成画布本体 750x1334。用法：crop_all.py <前缀...>"""
import glob
import os
import sys

from PIL import Image

from crop import crop_canvas

RAW = r"F:\sanguo\work\bg_orig\raw"
OUT = r"F:\sanguo\work\bg_orig"


def outname(base):
    if base.startswith("raw_"):
        return "terrain_" + base[4:]
    return base


def main(prefixes):
    files = []
    for p in prefixes:
        files += sorted(glob.glob(os.path.join(RAW, p + "*.png")))
    for p in files:
        im = Image.open(p).convert("RGB")
        c = crop_canvas(im)
        if c is None:
            print("FAIL", os.path.basename(p), im.size)
            continue
        name = outname(os.path.basename(p))
        c.save(os.path.join(OUT, name))
        print("ok", os.path.basename(p), "->", name, c.size)


if __name__ == "__main__":
    main(sys.argv[1:] or ["raw_"])
