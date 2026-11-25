#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
analyze_look.py — 给「原作 vs 现 AI」的观感差异出可复核的数字（只读，不写产物）。

指标（都在真实显示位 86x108 / 30x40 上量，cover 规则与页面一致）：
  sharp  : Laplacian 方差均值（越大越锐）
  bright : 灰度均值（越小越暗）
  std    : 灰度标准差（越小越平）
  homo   : 两两余弦相似度均值（24x24 灰度缩略图；越接近 1 越「千篇一律」）
用法：  $env:PYTHONIOENCODING='utf-8'
        & "...\\python.exe" "F:\\sanguo\\work\\asset_pipe\\analyze_look.py"
"""
from __future__ import annotations

import json
import os
import sys

from PIL import Image, ImageFilter, ImageStat

ROOT = r"F:\sanguo"
FACE_SRC = os.path.join(ROOT, "export", "png", "SHAPE", "FACE")
HERO_SRC = os.path.join(ROOT, "game", "web", "assets", "hero")
FACE_OUT = os.path.join(ROOT, "game", "web", "assets", "face")
GEN_JSON = os.path.join(ROOT, "game", "data", "generals.json")

HUD = (86, 108)
THUMB = (30, 40)


def cover(im: Image.Image, size, anchor=(0.5, 0.14)) -> Image.Image:
    W, H = size
    iw, ih = im.size
    scale = max(W / iw, H / ih)
    sw, sh = W / scale, H / scale
    x, y = (iw - sw) * anchor[0], (ih - sh) * anchor[1]
    return im.crop((int(round(x)), int(round(y)), int(round(x + sw)), int(round(y + sh)))).resize((W, H), Image.LANCZOS)


def stats(img: Image.Image) -> tuple[float, float, float]:
    g = img.convert("L")
    lap = g.filter(ImageFilter.Kernel((3, 3), [0, -1, 0, -1, 4, -1, 0, -1, 0], scale=1))
    st = ImageStat.Stat(g)
    return ImageStat.Stat(lap).var[0], st.mean[0], st.stddev[0]


def vec(img: Image.Image) -> list[float]:
    g = img.convert("L").resize((24, 24), Image.LANCZOS)
    px = g.tobytes()
    m = sum(px) / len(px)
    v = [p - m for p in px]
    n = sum(t * t for t in v) ** 0.5 or 1.0
    return [t / n for t in v]


def homo(vecs: list[list[float]]) -> float:
    n = len(vecs)
    tot, cnt = 0.0, 0
    for i in range(n):
        a = vecs[i]
        for j in range(i + 1, n):
            b = vecs[j]
            tot += sum(x * y for x, y in zip(a, b))
            cnt += 1
    return tot / cnt if cnt else 0.0


def main() -> int:
    with open(os.path.join(FACE_OUT, "index.json"), encoding="utf-8") as f:
        idx = json.load(f)
    faces = idx["faces"]

    rows = []
    for name, e in faces.items():
        n = e["n"]
        f = Image.open(os.path.join(FACE_SRC, "FACE%03d.png" % n)).convert("RGBA")
        h = None
        p = os.path.join(HERO_SRC, name + ".webp")
        if os.path.exists(p):
            h = Image.open(p).convert("RGBA")
        rows.append((name, f, h))

    for tag, pick in (("FACE", lambda r: r[1]), ("AI", lambda r: r[2])):
        ims = [cover(pick(r), HUD) for r in rows if pick(r) is not None]
        s = [stats(i) for i in ims]
        print("== %s @%dx%d (n=%d)" % (tag, HUD[0], HUD[1], len(ims)))
        print("   sharp(Lap var) mean=%.1f median=%.1f" % (sum(x[0] for x in s) / len(s), sorted(x[0] for x in s)[len(s) // 2]))
        print("   bright mean=%.1f   std mean=%.1f" % (sum(x[1] for x in s) / len(s), sum(x[2] for x in s) / len(s)))
        th = [stats(cover(pick(r), THUMB))[0] for r in rows if pick(r) is not None]
        print("   sharp @30x40 mean=%.1f" % (sum(th) / len(th)))
        v = [vec(i) for i in ims]
        print("   homogeneity: mean pairwise cosine = %.4f" % homo(v))

    # 体积
    fs = [os.path.getsize(os.path.join(FACE_OUT, "full", "%03d.webp" % e["n"])) for e in faces.values()]
    ts = [os.path.getsize(os.path.join(FACE_OUT, "thumb", "%03d.webp" % e["n"])) for e in faces.values()]
    print("== 体积  full mean=%.0fB min=%d max=%d total=%.2fMB" % (sum(fs) / len(fs), min(fs), max(fs), sum(fs) / 1048576))
    print("         thumb mean=%.0fB min=%d max=%d total=%.2fMB" % (sum(ts) / len(ts), min(ts), max(ts), sum(ts) / 1048576))
    return 0


if __name__ == "__main__":
    sys.exit(main())
