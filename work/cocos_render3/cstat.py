#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Color-census for the Cocos render parity work (round 3).

Primary metric = the audit one quoted in the task: number of distinct RGB values
that occur >= 8 times in the screenshot.  Secondary: plain unique-colour count
(what rstat.py / imgstat.py printed in rounds 1-2, kept for continuity).

Sampling follows rstat.py: if the image is bigger than 400k px it is halved with
NEAREST, so 750x1334 -> 375x667.  Both are reported (half = "d2", full = "d1")
so nobody has to guess which one a number came from.

Usage: python cstat.py <img> [<img> ...]
Read-only.
"""
import os
import sys

from PIL import Image

THR = 8


def census(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    half = im.resize((w // 2, h // 2), Image.NEAREST) if w * h > 400000 else im

    def one(img):
        cols = img.getcolors(maxcolors=1 << 24)
        if cols is None:
            return -1, -1
        uniq = len(cols)
        ge = sum(1 for (_n, _c) in cols if _n >= THR)
        return uniq, ge

    u1, g1 = one(im)
    u2, g2 = one(half)
    print(
        "%-28s %4dx%-4d  >=%d: d2=%-6d d1=%-6d | uniq: d2=%-6d d1=%-6d"
        % (os.path.basename(path), w, h, THR, g2, g1, u2, u1)
    )
    return {"ge8_d2": g2, "ge8_d1": g1, "uniq_d2": u2, "uniq_d1": u1}


if __name__ == "__main__":
    for p in sys.argv[1:]:
        try:
            census(p)
        except Exception as e:  # noqa: BLE001
            print("%s ERR %s" % (p, e))
