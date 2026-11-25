#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Screenshot stats: unique colors, mean luminance, contrast (RMS + p5-p95 span), dark ratio.

Usage: python imgstat.py <img1> <img2> ...
Read-only analysis, no writes.
"""
import os
import sys
import datetime

from PIL import Image


def stats(path):
    im = Image.open(path)
    w, h = im.size
    rgb = im.convert("RGB")
    small = rgb.resize((w // 2, h // 2), Image.NEAREST) if w * h > 400000 else rgb
    colors = small.getcolors(maxcolors=1 << 24)
    nunique = len(colors) if colors is not None else -1
    px = list(small.getdata())
    n = len(px)

    # luminance (Rec.601)
    lums = [0.299 * r + 0.587 * g + 0.114 * b for (r, g, b) in px]
    mean = sum(lums) / n
    var = sum((x - mean) ** 2 for x in lums) / n
    rms = var ** 0.5
    srt = sorted(lums)
    p5 = srt[int(n * 0.05)]
    p95 = srt[int(n * 0.95)]
    span = p95 - p5
    dark = sum(1 for x in lums if x < 12.0) / n
    near_black = sum(1 for x in lums if x < 4.0) / n
    # mean saturation proxy: mean(max-min per pixel)
    sat = sum(max(r, g, b) - min(r, g, b) for (r, g, b) in px) / n

    st = os.stat(path)
    print(
        "%-34s %4dx%-4d %-5s %10dB %s  色数=%-7d 亮度=%.1f 对比(RMS)=%.1f P5-P95=%.1f "
        "近黑(<12)=%.1f%% 纯黑(<4)=%.1f%% 饱和=%.1f"
        % (
            os.path.basename(path),
            w,
            h,
            im.mode,
            st.st_size,
            datetime.datetime.fromtimestamp(st.st_mtime).strftime("%m-%d %H:%M"),
            nunique,
            mean,
            rms,
            span,
            dark * 100,
            near_black * 100,
            sat,
        )
    )


if __name__ == "__main__":
    for p in sys.argv[1:]:
        try:
            stats(p)
        except Exception as e:  # noqa: BLE001
            print("%s ERR %s" % (p, e))
