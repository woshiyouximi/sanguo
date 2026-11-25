# -*- coding: utf-8 -*-
"""Dump MENU PNG dimensions + 4-edge alpha stats. Evidence for nine-patch picking.

Why: project/54 §3 records the WARINFO01 trap (bottom 4 rows alpha only 126) -- a
frame that looks like a panel but has no solid bottom edge. Every MENU image that is
going to become a border-image must pass this check first.
"""
import io
import os
import sys
from PIL import Image

SRC = r"F:\sanguo\export\png\SHAPE\MENU"
OUT = r"F:\sanguo\work\cityart\alpha_check.txt"


def edge_stats(im):
    """Return per-edge (min_alpha, mean_alpha) over the outer 1px and outer 4px bands."""
    a = im.convert("RGBA")
    w, h = a.size
    px = a.load()
    out = {}
    bands = {"1px": 1, "4px": 4}
    for label, n in bands.items():
        # top / bottom: rows 0..n-1 and h-n..h-1; left / right: cols 0..n-1, w-n..w-1
        vals = {
            "top": [px[x, y][3] for y in range(n) for x in range(w)],
            "bottom": [px[x, y][3] for y in range(h - n, h) for x in range(w)],
            "left": [px[x, y][3] for x in range(n) for y in range(h)],
            "right": [px[x, y][3] for x in range(w - n, w) for y in range(h)],
        }
        out[label] = {k: (min(v), round(sum(v) / len(v), 1)) for k, v in vals.items()}
    return out


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith(".png"))
    lines = []
    lines.append("# MENU 图元 alpha 检查（四边最外 1px / 4px 的 min 与 mean，0-255）")
    lines.append("# 生成：work/cityart/_alpha.py  用途：project/64 的九宫格选型证据")
    lines.append("# 判据：当四边框用 ⇒ 四边的 min 必须 = 255（真不透明），否则边上会缺一截。")
    lines.append("")
    lines.append("%-16s %5s x %-5s %-6s | %-22s | %-22s | %-22s | %-22s" % (
        "file", "w", "h", "mode", "top(min/mean)", "bottom(min/mean)", "left(min/mean)", "right(min/mean)"))
    lines.append("-" * 150)
    rows = []
    for f in files:
        p = os.path.join(SRC, f)
        with Image.open(p) as im:
            im.load()
            w, h = im.size
            mode = im.mode
            st = edge_stats(im)[("4px")]
            e1 = edge_stats(im)["1px"]
        rows.append((f, w, h, mode, st, e1))
        lines.append("%-16s %5d x %-5d %-6s | %s | %s | %s | %s" % (
            f, w, h, mode,
            "%3d / %6.1f" % st["top"], "%3d / %6.1f" % st["bottom"],
            "%3d / %6.1f" % st["left"], "%3d / %6.1f" % st["right"]))

    # verdict list: images whose 4px band is fully opaque on all four sides
    solid = [r for r in rows if all(r[4][k][0] == 255 for k in ("top", "bottom", "left", "right"))]
    lines.append("")
    lines.append("# 四边 4px 全不透明（可当四边框）的图元：%d 张" % len(solid))
    for r in solid:
        lines.append("#   %-14s %4d x %-4d" % (r[0], r[1], r[2]))
    lines.append("")
    # the known trap
    trap = [r for r in rows if r[0].startswith("WARINFO0")]
    lines.append("# WARINFO 复核（project/54 §3 说 WARINFO01 底边只有 126）")
    for r in trap:
        lines.append("#   %-14s %4d x %-4d bottom4px min=%d mean=%.1f  bottom1px min=%d" % (
            r[0], r[1], r[2], r[4]["bottom"][0], r[4]["bottom"][1], r[5]["bottom"][0]))
    text = "\n".join(lines) + "\n"
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print("images=%d solid4=%d" % (len(rows), len(solid)))
    for r in trap:
        print("%s %dx%d bottom4px min=%d mean=%.1f" % (r[0], r[1], r[2], r[4]["bottom"][0], r[4]["bottom"][1]))
    print("WROTE", OUT)


if __name__ == "__main__":
    main()
