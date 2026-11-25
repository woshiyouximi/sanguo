# -*- coding: utf-8 -*-
"""Camera-scroll probe (2D, coarse-to-fine).

Samples a video range at a fixed step, then for every consecutive pair of frames
measures the best (dx, dy) alignment of
  band A = backdrop strip  (sky / mountains / city wall / trees, no units)
  band B = ground strip    (battlefield floor)
and prints ts / dx / dy / mae, plus mae at (0,0) for reference.

If the camera pans, the backdrop must move -> dx or dy != 0.
If the backdrop never moves but units do, the camera is locked.
"""
import sys, os, subprocess, glob
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "bili", "p01.mp4")
FF = r"C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe"
TMP = os.path.join(HERE, "_scan", "scroll2")

X0, X1 = 76, 564          # game viewport
BAND_A = (0, 92)          # backdrop (sky/mountain/wall/trees)
BAND_B = (100, 260)       # ground


def extract(t0, t1, step):
    if os.path.isdir(TMP):
        for f in glob.glob(os.path.join(TMP, "*.png")):
            os.remove(f)
    os.makedirs(TMP, exist_ok=True)
    fps = 1.0 / step
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", str(t0), "-to", str(t1),
                    "-i", SRC, "-vf", "fps=%f" % fps,
                    os.path.join(TMP, "f_%05d.png")], check=True)
    return sorted(glob.glob(os.path.join(TMP, "f_*.png")))


def load(p, band):
    a = Image.open(p).convert("L").crop((X0, band[0], X1, band[1]))
    return np.asarray(a, dtype=np.float32)


def best_shift(a, b, rng_x, rng_y, stride=1):
    """Return (dx, dy, mae) minimising |a - shift(b, dx, dy)|."""
    best = (0, 0, 1e18)
    for dy in range(-rng_y, rng_y + 1, stride):
        for dx in range(-rng_x, rng_x + 1, stride):
            ay0, ay1 = max(0, dy), a.shape[0] + min(0, dy)
            by0, by1 = max(0, -dy), b.shape[0] + min(0, -dy)
            ax0, ax1 = max(0, dx), a.shape[1] + min(0, dx)
            bx0, bx1 = max(0, -dx), b.shape[1] + min(0, -dx)
            aa = a[ay0:ay1, ax0:ax1]
            bb = b[by0:by1, bx0:bx1]
            if aa.shape[0] < 20 or aa.shape[1] < 120:
                continue
            err = float(np.mean(np.abs(aa - bb)))
            if err < best[2]:
                best = (dx, dy, err)
    return best


def full_search(a, b):
    # coarse (1/3 scale, stride 2) then refine
    def ds(x, k=3):
        h, w = x.shape
        return x[:h - h % k, :w - w % k].reshape(h // k, k, w // k, k).mean(axis=(1, 3))
    ca, cb = ds(a), ds(b)
    dx, dy, _ = best_shift(ca, cb, 30, 12, 1)
    dx, dy = dx * 3, dy * 3
    best = best_shift(a, b, 3, 3, 1)
    return (dx + best[0], dy + best[1], best[2]) if abs(best[0]) <= 3 else (dx, dy, best[2])


def main():
    t0, t1, step = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
    files = extract(t0, t1, step)
    if len(files) < 2:
        print("not enough frames"); return
    rows = []
    for i in range(1, len(files)):
        a = load(files[i - 1], BAND_A)
        b = load(files[i], BAND_A)
        dx, dy, mae = full_search(a, b)
        mae0 = float(np.mean(np.abs(a - b)))
        ga = load(files[i - 1], BAND_B)
        gb = load(files[i], BAND_B)
        gdx, gdy, gmae = full_search(ga, gb)
        gmae0 = float(np.mean(np.abs(ga - gb)))
        ts = t0 + i * step
        rows.append((ts, dx, dy, mae, mae0, gdx, gdy, gmae, gmae0))
        print("%7.2f  BACK dx=%+3d dy=%+3d mae=%5.2f (mae0=%5.2f)   GROUND dx=%+3d dy=%+3d mae=%5.2f (mae0=%5.2f)"
              % rows[-1])
    bx = [abs(r[1]) for r in rows]
    by = [abs(r[2]) for r in rows]
    print("\n=== summary over %d pairs (%s..%s step %.1fs) ===" % (len(rows), t0, t1, step))
    print("backdrop |dx| max=%d  mean=%.2f ; |dy| max=%d mean=%.2f"
          % (max(bx), sum(bx) / len(bx), max(by), sum(by) / len(by)))
    print("backdrop mae mean=%.2f max=%.2f ; ground |dx| max=%d mean=%.2f"
          % (sum(r[3] for r in rows) / len(rows), max(r[3] for r in rows),
             max(abs(r[5]) for r in rows), sum(abs(r[5]) for r in rows) / len(rows)))
    nz = [r for r in rows if abs(r[1]) > 2 or abs(r[2]) > 2]
    print("pairs with |dx|>2 or |dy|>2 : %d  -> %s" % (len(nz), ["%.0fs" % r[0] for r in nz][:20]))


if __name__ == "__main__":
    main()
