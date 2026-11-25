#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""w5-render stats (ASCII-only output to survive the GBK console).

Usage: python rstat.py <img> [<img> ...]
Per image: unique colors, mean luminance, RMS, p5-p95 span, dark(<12) share,
near-black(<4) share, saturation, longest near-black row band (thr=6.0)
and the count of dark bands >= 60px.
"""
import os
import sys

from PIL import Image


def lum(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b


def stats(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    small = im.resize((w // 2, h // 2), Image.NEAREST) if w * h > 400000 else im
    colors = small.getcolors(maxcolors=1 << 24)
    nunique = len(colors) if colors is not None else -1
    px = list(small.getdata())
    n = len(px)
    lums = [lum(r, g, b) for (r, g, b) in px]
    mean = sum(lums) / n
    var = sum((x - mean) ** 2 for x in lums) / n
    rms = var ** 0.5
    srt = sorted(lums)
    p5 = srt[int(n * 0.05)]
    p95 = srt[int(n * 0.95)]
    dark = sum(1 for x in lums if x < 12.0) / n
    near_black = sum(1 for x in lums if x < 4.0) / n
    sat = sum(max(r, g, b) - min(r, g, b) for (r, g, b) in px) / n

    rows = []
    step = 2 if w > 400 else 1
    pix = im.load()
    for y in range(h):
        s = 0.0
        c = 0
        for x in range(0, w, step):
            r, g, b = pix[x, y]
            s += lum(r, g, b)
            c += 1
        rows.append(s / c)
    bands = []
    start = None
    for y, v in enumerate(rows):
        if v < 6.0:
            if start is None:
                start = y
        elif start is not None:
            bands.append((start, y - 1))
            start = None
    if start is not None:
        bands.append((start, h - 1))
    longest = max((b1 - a1 + 1 for (a1, b1) in bands), default=0)
    wide = [b for b in bands if b[1] - b[0] + 1 >= 60]
    wide_max = max((b[1] - b[0] + 1 for b in wide), default=0)

    print(
        "%-26s %s colors=%5d mean=%5.1f rms=%5.1f span=%6.1f dark12=%5.1f%% "
        "blk4=%4.1f%% sat=%5.1f darkrow=%4.1f%% longestband=%3dpx wide60=%2d widemax=%3dpx"
        % (
            os.path.basename(path),
            "%dx%d" % (w, h),
            nunique,
            mean,
            rms,
            p95 - p5,
            dark * 100,
            near_black * 100,
            sat,
            sum(1 for v in rows if v < 6.0) / h * 100,
            longest,
            len(wide),
            wide_max,
        )
    )


for p in sys.argv[1:]:
    stats(p)
