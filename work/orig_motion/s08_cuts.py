# s08_cuts.py -- 逐对帧的"背景条带"配准，用来切分连续镜头（排除剪辑/换场）
# 条带 y=8..58（纯远景，无单位）、x=100..540，2x 降采样；搜索 dx∈[-8,8], dy∈[-6,6]
# 判据：最优残差 rms 极小(<1.0) 且位移为 0 -> 静止；rms 小但有位移 -> 缓慢平移；rms 大 -> 剪辑/换场
# 用法: python s08_cuts.py 62 660 [outname]
import sys
import numpy as np
from libimg import frame, OUT
import os

Y0, Y1, X0, X1 = 8, 58, 100, 540


def strip(i):
    return frame(i)[Y0:Y1, X0:X1].astype(np.float32)[::2, ::2]


def main():
    a0, a1 = int(sys.argv[1]), int(sys.argv[2])
    name = sys.argv[3] if len(sys.argv) > 3 else 'cuts.txt'
    prev = strip(a0)
    out = []
    for i in range(a0 + 1, a1 + 1):
        cur = strip(i)
        best = (1e9, 0, 0)
        for dy in range(-6, 7):
            for dx in range(-8, 9):
                y0a, y1a = max(0, dy), cur.shape[0] + min(0, dy)
                x0a, x1a = max(0, dx), cur.shape[1] + min(0, dx)
                A = prev[y0a:y1a, x0a:x1a]
                B = cur[y0a - dy:y1a - dy, x0a - dx:x1a - dx]
                r = float(np.sqrt(((A - B) ** 2).mean()))
                if r < best[0]:
                    best = (r, dx, dy)
        out.append((i, best[0], best[1], best[2]))
        prev = cur
        if i % 50 == 0:
            print('..', i, flush=True)
    with open(os.path.join(OUT, name), 'w') as fh:
        for r in out:
            fh.write('%d %.3f %d %d\n' % r)
    rs = np.array([r[1] for r in out])
    print('rms: median=%.2f p90=%.2f max=%.2f' % (np.median(rs), np.percentile(rs, 90), rs.max()))
    print('frames with rms>2.0:')
    for i, r, dx, dy in out:
        if r > 2.0:
            print('  f%04d rms=%.2f dx=%+d dy=%+d' % (i, r, dx, dy))
    print('frames with rms<=2.0 but shift!=0:')
    for i, r, dx, dy in out:
        if r <= 2.0 and (dx or dy):
            print('  f%04d rms=%.2f dx=%+d dy=%+d' % (i, r, dx, dy))


if __name__ == '__main__':
    main()
