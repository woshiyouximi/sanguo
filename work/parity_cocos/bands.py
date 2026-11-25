#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Row/column luminance band scan: find near-black bands and report their pixel extents.

Usage: python bands.py <img> [thr]
Read-only, no writes. thr default 6.0 (mean luminance of the row).
"""
import sys

from PIL import Image


def scan(path, thr=6.0):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    step = 2 if w > 400 else 1
    rows = []
    for y in range(h):
        s = 0.0
        n = 0
        for x in range(0, w, step):
            r, g, b = px[x, y]
            s += 0.299 * r + 0.587 * g + 0.114 * b
            n += 1
        rows.append(s / n)
    bands = []
    start = None
    for y, v in enumerate(rows):
        dark = v < thr
        if dark and start is None:
            start = y
        elif not dark and start is not None:
            bands.append((start, y - 1))
            start = None
    if start is not None:
        bands.append((start, h - 1))
    print("%s  %dx%d  thr=%.1f" % (path, w, h, thr))
    total = 0
    for (a, b) in bands:
        ln = b - a + 1
        if ln < 4:
            continue
        total += ln
        print("    black rows y=%d..%d  (%d px, %.1f%% of height)" % (a, b, ln, ln * 100.0 / h))
    print("    total black rows = %d / %d  (%.1f%%)" % (total, h, total * 100.0 / h))
    # 也报亮度剖面（每 1/20 段）
    seg = h // 20 or 1
    prof = []
    for i in range(0, h, seg):
        chunk = rows[i:i + seg]
        prof.append("%d:%.0f" % (i, sum(chunk) / len(chunk)))
    print("    lum profile (y:mean every %dpx): %s" % (seg, " ".join(prof)))


if __name__ == "__main__":
    for p in sys.argv[1:]:
        thr = 6.0
        if ":" in p:
            head, tail = p.rsplit(":", 1)
            try:
                thr = float(tail)
                p = head
            except ValueError:
                pass
        scan(p, thr)
