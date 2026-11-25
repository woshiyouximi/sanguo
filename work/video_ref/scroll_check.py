# -*- coding: utf-8 -*-
"""Measure camera scroll by cross-correlating a background strip between two frames."""
import sys, numpy as np
from PIL import Image

def shift(pa, pb, y0, y1, x0=76, x1=564):
    a = np.asarray(Image.open(pa).convert("L"), dtype=np.float32)[y0:y1, x0:x1]
    b = np.asarray(Image.open(pb).convert("L"), dtype=np.float32)[y0:y1, x0:x1]
    best = None
    for dx in range(-160, 161):
        # b shifted by dx compared to a
        if dx >= 0:
            aa, bb = a[:, :a.shape[1] - dx], b[:, dx:]
        else:
            aa, bb = a[:, -dx:], b[:, :b.shape[1] + dx]
        if aa.shape[1] < 80:
            continue
        err = float(np.mean(np.abs(aa - bb)))
        if best is None or err < best[1]:
            best = (dx, err)
    return best

if __name__ == "__main__":
    y0, y1 = int(sys.argv[1]), int(sys.argv[2])
    pairs = sys.argv[3:]
    for i in range(0, len(pairs), 2):
        dx, err = shift(pairs[i], pairs[i + 1], y0, y1)
        print("%s vs %s  band y=%d..%d  dx=%+d  mae=%.2f" % (pairs[i].split("\\")[-1], pairs[i + 1].split("\\")[-1], y0, y1, dx, err))
