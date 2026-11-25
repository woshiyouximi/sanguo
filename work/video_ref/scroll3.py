# -*- coding: utf-8 -*-
"""Q4b probe: (a) camera scroll via 1-D brightness profiles, (b) red/blue unit masks.

(a) If the camera pans, the *backdrop* column profile shifts; if it also pans in
    depth, the ground row profile shifts.  Profiles average 60+ rows/cols, which
    suppresses the heavy compression noise of this 389 kb/s source.
(b) Counts strongly saturated red (敵) and blue (我) pixels inside the battlefield
    area (y 74..264) and prints their bounding boxes -> tells us whether both
    armies are on screen at the same time.
"""
import sys, os, subprocess, glob
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "bili", "p01.mp4")
FF = r"C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe"
TMP = os.path.join(HERE, "_scan", "q4b")

X0, X1 = 76, 564
SKY = (4, 70)        # backdrop strip (sky/mountain/wall/trees)
GND = (100, 262)     # battlefield floor
FLD = (74, 264)


def extract(t0, t1, fps):
    if os.path.isdir(TMP):
        for f in glob.glob(os.path.join(TMP, "*.png")):
            os.remove(f)
    os.makedirs(TMP, exist_ok=True)
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", str(t0), "-to", str(t1),
                    "-i", SRC, "-vf", "fps=%f" % fps, os.path.join(TMP, "f_%05d.png")], check=True)
    return sorted(glob.glob(os.path.join(TMP, "f_*.png")))


def prof_x(p):
    a = np.asarray(Image.open(p).convert("L").crop((X0, SKY[0], X1, SKY[1])), dtype=np.float32)
    return a.mean(axis=0), a


def prof_y(p):
    a = np.asarray(Image.open(p).convert("L").crop((X0, GND[0], X1, GND[1])), dtype=np.float32)
    return a.mean(axis=1), a


def xcorr_prof(a, b, rng):
    """best shift d minimising |a[x] - b[x+d]|, plus Pearson r at that shift."""
    best = None
    for d in range(-rng, rng + 1):
        if d >= 0:
            aa, bb = a[:len(a) - d], b[d:]
        else:
            aa, bb = a[-d:], b[:len(b) + d]
        if len(aa) < 80:
            continue
        err = float(np.mean(np.abs(aa - bb)))
        if best is None or err < best[1]:
            best = (d, err)
    # Pearson at best
    d = best[0]
    aa, bb = (a[:len(a) - d], b[d:]) if d >= 0 else (a[-d:], b[:len(b) + d])
    r = float(np.corrcoef(aa, bb)[0, 1])
    return d, best[1], r


def masks(p):
    a = np.asarray(Image.open(p).convert("RGB").crop((X0, FLD[0], X1, FLD[1])), dtype=np.int16)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    red = (R > 85) & (R - G > 45) & (R - B > 35)
    blue = (B > 60) & (B - R > 22) & (B - G > 5)
    out = []
    for m in (red, blue):
        n = int(m.sum())
        if n > 40:
            ys, xs = np.nonzero(m)
            out.append((n, int(xs.min()) + X0, int(xs.max()) + X0, int(ys.min()) + FLD[0], int(ys.max()) + FLD[0]))
        else:
            out.append((n, -1, -1, -1, -1))
    return out


def main():
    t0, t1, fps = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
    files = extract(t0, t1, fps)
    step = 1.0 / fps
    rows = []
    prev = None
    for i, f in enumerate(files):
        ts = t0 + i * step
        px, _ = prof_x(f)
        py, _ = prof_y(f)
        if prev is None:
            d = (0, 0.0, 1.0, 0, 0.0, 1.0)
        else:
            d = xcorr_prof(prev[0], px, 100) + xcorr_prof(prev[1], py, 40)
        prev = (px, py)
        (rc, rx0, rx1, ry0, ry1), (bc, bx0, bx1, by0, by1) = masks(f)
        rows.append((ts, *d, rc, rx0, rx1, ry0, ry1, bc, bx0, bx1, by0, by1))
        print("%7.2f  dx=%+4d (mae %5.2f r=%.3f)   dy=%+3d (mae %5.2f r=%.3f) | RED n=%5d x[%4d,%4d] y[%3d,%3d] | BLUE n=%5d x[%4d,%4d] y[%3d,%3d]"
              % (ts, d[0], d[1], d[2], d[3], d[4], d[5], rc, rx0, rx1, ry0, ry1, bc, bx0, bx1, by0, by1))
    dxs = [abs(r[1]) for r in rows[1:]]
    dys = [abs(r[4]) for r in rows[1:]]
    rs = [r[3] for r in rows[1:]]
    print("\n=== %d samples %s..%s ===  camera dx: |max|=%d mean=%.2f  (min profile r=%.3f)  dy: |max|=%d mean=%.2f"
          % (len(rows), t0, t1, max(dxs), sum(dxs) / len(dxs), min(rs), max(dys), sum(dys) / len(dys)))
    both = [r for r in rows if r[6] > 60 and r[10] > 60]
    print("frames with BOTH red>60 and blue>60 : %d  first=%.1fs  last=%.1fs"
          % (len(both), both[0][0] if both else -1, both[-1][0] if both else -1))
    onlyred = [r[0] for r in rows if r[6] > 60 and r[10] <= 60]
    onlyblue = [r[0] for r in rows if r[6] <= 60 and r[10] > 60]
    print("only-red frames: %d  %s" % (len(onlyred), ["%.0f" % x for x in onlyred][:30]))
    print("only-blue frames: %d  %s" % (len(onlyblue), ["%.0f" % x for x in onlyblue][:30]))


if __name__ == "__main__":
    main()
