# -*- coding: utf-8 -*-
"""把 782x1500 的整页截图裁成画布本体 750x1334。

画布有 `border: 1px solid #2a313c`(=42,49,60) 且水平居中于 782 宽窗口里，
所以按"整整一行都是边框色"来找上边界，最可靠。
"""
import glob
import os
import sys

from PIL import Image

RAW = r"F:\sanguo\work\bg_orig\raw"
OUT = r"F:\sanguo\work\bg_orig"
BORDER = (42, 49, 60)
# 782x1500 视口下画布固定落在 (16,133)-(766,1467)：750 宽居中 + 主区垂直居中。
# 直接按这个位置裁 750x1334，1:1 不重采样（像素越界会导致尺寸不符，所以下面有断言）。
BOX = (16, 133, 766, 1467)


def crop_canvas(im):
    w, h = im.size
    if w < 782 or h < 1467:
        return None
    px = im.load()
    # 校验：画布边框色在四条边的中点位置（角上是 10px 圆角，不能用）
    for (x, y) in ((16, 800), (765, 800), (400, 133), (400, 1466)):
        r, g, b = px[x, y][:3]
        if abs(r - BORDER[0]) > 8 or abs(g - BORDER[1]) > 8 or abs(b - BORDER[2]) > 8:
            return None
    return im.crop(BOX)


def find_canvas(im):
    w, h = im.size
    px = im.load()
    rows = []
    for y in range(h):
        n = 0
        for x in range(120, 640, 4):
            r, g, b = px[x, y][:3]
            if abs(r - BORDER[0]) <= 6 and abs(g - BORDER[1]) <= 6 and abs(b - BORDER[2]) <= 6:
                n += 1
        if n >= 125:  # 采样 130 个点里 125 个是边框色
            rows.append(y)
    if not rows:
        return None
    # 画布上下两条边框：取最上面一条和最下面一条（相距应为 1335/1336）
    top = rows[0]
    bot = None
    for y in rows:
        if abs(y - top - 1335) <= 3:
            bot = y
    # 左边界：从 top+20 的扫描行找第一列边框色
    left = None
    yy = top + 40
    for x in range(0, w):
        r, g, b = px[x, yy][:3]
        if abs(r - BORDER[0]) <= 6 and abs(g - BORDER[1]) <= 6 and abs(b - BORDER[2]) <= 6:
            left = x
            break
    return top, bot, left


def main(paths, prefix):
    for p in paths:
        im = Image.open(p).convert("RGB")
        crop = crop_canvas(im)
        if crop is None:
            print(f"FAIL {os.path.basename(p)} size={im.size}")
            continue
        base = os.path.basename(p)
        if base.startswith("raw_"):
            base = "terrain_" + base[4:]
        name = prefix + base
        out = os.path.join(OUT, name)
        crop.save(out)
        print(f"{os.path.basename(p)} -> {name} box=({left},{top}) h={bot-top} size={crop.size}")


if __name__ == "__main__":
    pref = sys.argv[1] if len(sys.argv) > 1 else ""
    pre = sys.argv[2] if len(sys.argv) > 2 else ""
    files = sorted(glob.glob(os.path.join(RAW, f"{pref}*.png")))
    main(files, pre)
