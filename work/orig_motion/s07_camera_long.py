# s07_camera_long.py -- 大范围背景配准：以 f_ref 为基准，对目标帧在 dx∈[-200,200], dy∈[-40,40] 内做 NCC
# 条带用 y=63..95（地平线下方地面纹理，无单位遮挡）与 y=6..60（远景），分别报最优位移
# 用法: python s07_camera_long.py 62 118 154 162 178 250 300 400 500 660
import sys
import numpy as np
from libimg import frame


def gray(a):
    return a.astype(np.float32) @ np.array([0.299, 0.587, 0.114], dtype=np.float32)


def ncc(a, b):
    a = a - a.mean()
    b = b - b.mean()
    d = (a * a).sum() ** 0.5 * (b * b).sum() ** 0.5
    return float((a * b).sum() / d) if d > 0 else 0.0


def best_shift(ref, tgt, y0, y1, x0, x1, dxs, dys):
    R = ref[y0:y1, x0:x1]
    best = (-2, 0, 0)
    for dy in dys:
        for dx in dxs:
            T = tgt[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
            if T.shape != R.shape:
                continue
            s = ncc(R, T)
            if s > best[0]:
                best = (s, dx, dy)
    return best


def main():
    ref_i = int(sys.argv[1])
    R = gray(frame(ref_i))
    print('ref f%04d' % ref_i)
    for s in sys.argv[2:]:
        i = int(s)
        F = gray(frame(i))
        b1 = best_shift(R, F, 63, 96, 100, 540, range(-200, 201, 1), range(-30, 31, 2))
        b2 = best_shift(R, F, 6, 60, 100, 540, range(-200, 201, 1), range(-30, 31, 2))
        print('f%04d  ground(y63-96): dx=%+4d dy=%+3d ncc=%.4f   far(y6-60): dx=%+4d dy=%+3d ncc=%.4f'
              % (i, b1[1], b1[2], b1[0], b2[1], b2[2], b2[0]), flush=True)


if __name__ == '__main__':
    main()
