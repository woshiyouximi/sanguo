# s10_groundgrid.py -- 从"空场"帧的地面纹理自相关，找行距(纵向)与列距(横向)的像素周期
# 用法: python s10_groundgrid.py 122 [x0 x1 y0 y1]
import sys
import numpy as np
from libimg import frame


def autocorr(v):
    v = v - v.mean()
    ac = np.correlate(v, v, 'full')[len(v) - 1:]
    return ac / ac[0]


def main():
    i = int(sys.argv[1])
    x0, x1, y0, y1 = (85, 559, 63, 252) if len(sys.argv) < 6 else map(int, sys.argv[2:6])
    F = frame(i).astype(np.float32)
    g = F[..., 0] * 0.299 + F[..., 1] * 0.587 + F[..., 2] * 0.114
    rows = g[y0:y1, x0:x1].mean(axis=1)
    cols = g[y0:y1, x0:x1].mean(axis=0)
    ar = autocorr(rows)
    ac = autocorr(cols)
    print('rows profile (y=%d..%d) mean=%.1f std=%.1f' % (y0, y1, rows.mean(), rows.std()))
    print('  row autocorr peaks (lag 8..120):')
    for lag in range(8, 121):
        if ar[lag] > ar[lag - 1] and ar[lag] >= ar[lag + 1] and ar[lag] > 0.05:
            print('    lag=%3d  ac=%.3f' % (lag, ar[lag]))
    print('cols profile mean=%.1f std=%.1f' % (cols.mean(), cols.std()))
    print('  col autocorr peaks (lag 8..160):')
    for lag in range(8, 161):
        if ac[lag] > ac[lag - 1] and ac[lag] >= ac[lag + 1] and ac[lag] > 0.05:
            print('    lag=%3d  ac=%.3f' % (lag, ac[lag]))
    # 逐行亮度，看看有没有周期性台阶
    print('row means every 4 px:')
    for k in range(0, len(rows), 4):
        print('   y=%3d  %6.2f' % (y0 + k, rows[k]))


if __name__ == '__main__':
    main()
