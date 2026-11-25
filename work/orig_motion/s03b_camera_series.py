# s03b_camera_series.py -- 逐帧累积相机滚动量（以城楼/山体条带 y=10..70 做小范围 NCC）
# 输出 out/camera.csv : frame,t_rel,dx,dy,ncc,cum_x,cum_y
# 约定：dx>0 表示"上一帧内容向 +x 方向搬运 dx 像素后得到当前帧"，
#       即 cur(x) = prev(x-dx) => 世界的同一特征在屏幕上的 x 增加了 dx。
#       故 world_x = screen_x - cum_x + const。
import os
import numpy as np
from PIL import Image

ROOT = r'F:\sanguo\work\orig_motion'
OUT = os.path.join(ROOT, 'out')
N = 660
Y0, Y1, X0, X1 = 10, 70, 90, 555


def g(i):
    return np.asarray(Image.open(os.path.join(ROOT, 'f30', 'f%04d.png' % i)).convert('L'), dtype=np.float32)


def sc(A, B, dx, dy):
    ya0, ya1 = max(Y0, Y0 + dy), min(Y1, Y1 + dy)
    xa0, xa1 = max(X0, X0 + dx), min(X1, X1 + dx)
    a = A[ya0:ya1, xa0:xa1]
    b = B[ya0 - dy:ya1 - dy, xa0 - dx:xa1 - dx]
    a = a - a.mean()
    b = b - b.mean()
    return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum() + 1e-9))


def main():
    prev = g(1)
    cx = cy = 0
    rows = [(1, 0, 0, 1.0, 0, 0)]
    cuts = []
    for i in range(2, N + 1):
        cur = g(i)
        best = (-2, 0, 0)
        for dy in range(-2, 3):
            for dx in range(-10, 11):
                s = sc(prev, cur, dx, dy)
                if s > best[0]:
                    best = (s, dx, dy)
        s, dx, dy = best
        if s < 0.5:
            cuts.append(i)
        cx += dx
        cy += dy
        rows.append((i, dx, dy, s, cx, cy))
        prev = cur
    with open(os.path.join(OUT, 'camera.csv'), 'w', encoding='utf-8') as f:
        f.write('frame,dx,dy,ncc,cum_x,cum_y\n')
        for r in rows:
            f.write('%d,%d,%d,%.4f,%d,%d\n' % r)
    print('cuts(low ncc):', cuts)
    print('frame  dx dy ncc   cum_x')
    for r in rows:
        if r[0] % 30 == 2:
            print('%4d  %+3d %+2d %.3f  %5d' % (r[0], r[1], r[2], r[3], r[4]))
    print('total cum_x=%d cum_y=%d' % (cx, cy))


if __name__ == '__main__':
    main()
