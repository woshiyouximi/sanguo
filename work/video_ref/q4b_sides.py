# -*- coding: utf-8 -*-
"""Q4b: 每秒统计「敌(深红甲) / 我(蓝紫甲) 是否同时出现在画面里」，并给出 y 分排。

敌兵甲色实测 ≈ RGB(48..110, 0..16, 0..16)（B、G 几乎为 0 的暗红），
我兵甲色为蓝紫（B 明显大于 R）。两者都能与棕色地面 (128,96,64) 干净分开。
"""
import sys, os, subprocess, glob
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "bili", "p01.mp4")
FF = r"C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe"
TMP = os.path.join(HERE, "_scan", "q4b_side")
X0, X1, Y0, Y1 = 78, 562, 72, 264


def extract(t0, t1, fps):
    if os.path.isdir(TMP):
        for f in glob.glob(os.path.join(TMP, "*.png")):
            os.remove(f)
    os.makedirs(TMP, exist_ok=True)
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", str(t0), "-to", str(t1),
                    "-i", SRC, "-vf", "fps=%f" % fps, os.path.join(TMP, "f_%05d.png")], check=True)
    return sorted(glob.glob(os.path.join(TMP, "f_*.png")))


def sides(p):
    a = np.asarray(Image.open(p).convert("RGB").crop((X0, Y0, X1, Y1)), dtype=np.int16)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    red = (R >= 40) & (R <= 135) & (G < 26) & (B < 26)
    blue = (B >= 45) & (B - R >= 18) & (B - G >= 14)
    out = []
    for m in (red, blue):
        n = int(m.sum())
        if n >= 60:
            ys, xs = np.nonzero(m)
            out.append((n, int(xs.min()) + X0, int(xs.max()) + X0, int(ys.min()) + Y0, int(ys.max()) + Y0))
        else:
            out.append((n, -1, -1, -1, -1))
    return out


def rows_of(p):
    """把单位像素按 y 做直方图，输出排中心（用于数「一屏几排」）。"""
    a = np.asarray(Image.open(p).convert("RGB").crop((X0, Y0, X1, Y1)), dtype=np.int16)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    m = ((R >= 40) & (R <= 135) & (G < 26) & (B < 26)) | ((B >= 45) & (B - R >= 18) & (B - G >= 14))
    h = m.sum(axis=1).astype(np.float32)
    peaks = []
    y = 0
    while y < len(h):
        if h[y] >= 6:
            j = y
            while j < len(h) and h[j] >= 2:
                j += 1
            seg = h[y:j]
            peaks.append((int(y + int(np.argmax(seg))) + Y0, int(seg.sum())))
            y = j
        else:
            y += 1
    return peaks


def main():
    t0, t1, fps = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
    files = extract(t0, t1, fps)
    step = 1.0 / fps
    rows = []
    for i, f in enumerate(files):
        ts = t0 + i * step
        (rc, rx0, rx1, ry0, ry1), (bc, bx0, bx1, by0, by1) = sides(f)
        if rc >= 60 and bc >= 60:
            v = "两军同屏"
        elif rc >= 60:
            v = "只有敵"
        elif bc >= 60:
            v = "只有我"
        else:
            v = "空场"
        rows.append((ts, rc, rx0, rx1, bc, bx0, bx1, v))
        print("%7.2f  RED=%5d x[%4d,%4d]  BLUE=%5d x[%4d,%4d]  %s" % (ts, rc, rx0, rx1, bc, bx0, bx1, v))
    # 连续段
    segs = []
    for r in rows:
        if segs and segs[-1][2] == r[7]:
            segs[-1][1] = r[0]
        else:
            segs.append([r[0], r[0], r[7]])
    print("\n=== segments (%s..%s) ===" % (t0, t1))
    for s in segs:
        print("  %5.0fs-%5.0fs  %s" % (s[0], s[1], s[2]))
    tot = len(rows)
    print("\n两军同屏 %d/%d 帧 (%.0f%%)" % (sum(1 for r in rows if r[7] == "两军同屏"), tot,
                                      100.0 * sum(1 for r in rows if r[7] == "两军同屏") / tot))
    for t in (376.0, 378.0, 396.0):
        p = os.path.join(TMP, "f_%05d.png" % (int(round((t - t0) * fps)) + 1))
        if os.path.exists(p):
            print("rows @%.0fs: %s" % (t, rows_of(p)))


if __name__ == "__main__":
    main()
