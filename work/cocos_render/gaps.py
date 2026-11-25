#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Blank-gap scan for the 内政 page: longest vertical run of rows with no bright
text pixel inside a y-range.

Usage: python gaps.py <img> <y0> <y1> [thr]
  thr = luminance above which a pixel counts as ink (default 110), ASCII-only output.
"""
import sys

from PIL import Image


def scan(path, y0, y1, thr=110.0):
    im = Image.open(path).convert("RGB")
    w, _ = im.size
    px = im.load()
    rows = []
    for y in range(y0, min(y1, im.size[1])):
        ink = 0
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if 0.299 * r + 0.587 * g + 0.114 * b > thr:
                ink += 1
        rows.append(ink)
    runs = []
    start = None
    for i, ink in enumerate(rows):
        if ink == 0:
            if start is None:
                start = i
        elif start is not None:
            runs.append((start + y0, i + y0 - 1))
            start = None
    if start is not None:
        runs.append((start + y0, y1 - 1))
    runs.sort(key=lambda r: r[1] - r[0], reverse=True)
    longest = (runs[0][1] - runs[0][0] + 1) if runs else 0
    top = ["%d-%d(%d)" % (a, b, b - a + 1) for a, b in runs[:4]]
    print("%-22s rows=%d-%d blankruns=%d longest=%dpx top=%s"
          % (path.split("\\")[-1].split("/")[-1], y0, y1, len(runs), longest, " ".join(top)))


if __name__ == "__main__":
    scan(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]) if len(sys.argv) > 4 else 110.0)
