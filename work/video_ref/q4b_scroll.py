# -*- coding: utf-8 -*-
"""Q4b: 镜头是否滚动 —— 逐对测背景位移 + 地平线高度 + 累计漂移。

方法（对 389kb/s 的二压源做了抗噪处理）：
  * 背景带 y=0..66, x=76..564，先做 2px 高斯模糊再比，抑制块效应噪声。
  * 位移搜索 dx in [-160,160]，报告 best mae、dx=0 时的 mae、以及 best 处 Pearson r。
  * 判据：mae(0) - mae(best) < 0.8 视为「无可信位移」（噪声），否则若 |dx|>=3 记「位移」。
  * 地平线：从 y=0 向下找第一处连续 12 行标准差 <14 的 y，作为画面里地面起始行（=背景/地面分界）。
  * 累计漂移 = 所有 pair 的 dx 求和（正负抵消后仍大 → 真的在滚）。
"""
import sys, os, subprocess, glob
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "bili", "p01.mp4")
FF = r"C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe"
TMP = os.path.join(HERE, "_scan", "q4b_scroll")
X0, X1 = 76, 564


def extract(t0, t1, fps):
    if os.path.isdir(TMP):
        for f in glob.glob(os.path.join(TMP, "*.png")):
            os.remove(f)
    os.makedirs(TMP, exist_ok=True)
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", str(t0), "-to", str(t1),
                    "-i", SRC, "-vf", "fps=%f" % fps, os.path.join(TMP, "f_%05d.png")], check=True)
    return sorted(glob.glob(os.path.join(TMP, "f_*.png")))


def bg(p):
    # 只用「沒有单位、也沒有右侧作战指令面板」的区域：x=90..455, y=0..60
    im = Image.open(p).convert("L").crop((90, 0, 455, 60)).filter(ImageFilter.GaussianBlur(2))
    return np.asarray(im, dtype=np.float32)


def horizon(p):
    a = np.asarray(Image.open(p).convert("L").crop((90, 0, 550, 200)), dtype=np.float32)
    s = a.std(axis=1)
    for y in range(0, 170):
        if all(s[y:y + 12] < 14):
            return y
    return -1


def dx_of(a, b, rng=160):
    e0 = float(np.mean(np.abs(a - b)))
    best = (0, e0)
    for dx in range(-rng, rng + 1):
        if dx >= 0:
            aa, bb = a[:, :a.shape[1] - dx], b[:, dx:]
        else:
            aa, bb = a[:, -dx:], b[:, :b.shape[1] + dx]
        if aa.shape[1] < 200:
            continue
        e = float(np.mean(np.abs(aa - bb)))
        if e < best[1]:
            best = (dx, e)
    dx, mae = best
    aa, bb = (a[:, :a.shape[1] - dx], b[:, dx:]) if dx >= 0 else (a[:, -dx:], b[:, :b.shape[1] + dx])
    r = float(np.corrcoef(aa.ravel(), bb.ravel())[0, 1])
    return dx, mae, e0, r


def main():
    t0, t1, step = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
    tag = sys.argv[4] if len(sys.argv) > 4 else "run"
    files = extract(t0, t1, 1.0 / step)
    rows = []
    prev = None
    for i, f in enumerate(files):
        ts = t0 + i * step
        cur = bg(f)
        hy = horizon(f)
        if prev is None:
            rows.append((ts, 0, 0.0, 0.0, 1.0, hy, "起始帧"))
        else:
            dx, mae, e0, r = dx_of(prev, cur)
            if e0 > 10.0:
                verdict = "换场/被面板覆盖"
            elif e0 - mae < 0.8:
                verdict = "静止"
            elif abs(dx) >= 3:
                verdict = "位移%+dpx" % dx
            else:
                verdict = "静止(±2)"
            rows.append((ts, dx, mae, e0, r, hy, verdict))
        prev = cur
        print("%7.2f  dx=%+4d  mae=%6.2f  mae0=%6.2f  r=%.4f  horizon=%3d  %s"
              % (ts, rows[-1][1], rows[-1][2], rows[-1][3], rows[-1][4], rows[-1][5], rows[-1][6]))
    moving = [r for r in rows[1:] if r[6] not in ("静止", "静止(±2)")]
    hist = [r[5] for r in rows if r[5] > 0]
    cum = sum(r[1] for r in rows[1:])
    print("\n=== %s : %d pairs over %s..%s (step %.1fs) ===" % (tag, len(rows) - 1, t0, t1, step))
    print("dx: |max|=%d  mean|dx|=%.2f  累计漂移=%+dpx" % (max(abs(r[1]) for r in rows[1:]),
                                                       sum(abs(r[1]) for r in rows[1:]) / (len(rows) - 1), cum))
    print("mae mean=%.2f  判为位移的pair=%d  -> %s" % (sum(r[2] for r in rows[1:]) / (len(rows) - 1),
                                                   len(moving), ["%.0fs(%s)" % (r[0], r[6]) for r in moving][:16]))
    print("horizon y: min=%d max=%d unique=%s" % (min(hist), max(hist), sorted(set(hist))))
    with open(os.path.join(HERE, "q4b_scroll_table_%s.csv" % tag), "w", encoding="utf-8") as fh:
        fh.write("t_sec,t_clock,dx_px,mae_best,mae_at_0,pearson_r,horizon_y,verdict\n")
        for r in rows:
            fh.write("%.2f,%d:%02d,%d,%.2f,%.2f,%.4f,%d,%s\n"
                     % (r[0], int(r[0]) // 60, int(r[0]) % 60, r[1], r[2], r[3], r[4], r[5], r[6]))
    print("csv -> q4b_scroll_table_%s.csv" % tag)


if __name__ == "__main__":
    main()
