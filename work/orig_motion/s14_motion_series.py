# s14_motion_series.py -- 全场"运动能量"时间序列：mean|F_i - F_{i-1}| over 战场区
# 用途：找全局动作节拍（原作所有单位共用同一个行动闸门，动画应同步脉动）
# 用法: python s14_motion_series.py 62 660
import sys
import numpy as np
from libimg import frame, OUT
import os

Y0, Y1, X0, X1 = 70, 250, 90, 556


def main():
    a0, a1 = int(sys.argv[1]), int(sys.argv[2])
    prev = None
    rows = []
    for i in range(a0, a1 + 1):
        f = frame(i)[Y0:Y1, X0:X1].astype(np.int16)
        if prev is not None:
            me = float(np.abs(f - prev).mean())
            mov = int((np.abs(f - prev).sum(axis=2) > 40).sum())
            rows.append((i, me, mov))
        prev = f
        if i % 50 == 0:
            print('..', i, flush=True)
    p = os.path.join(OUT, 'motion.csv')
    with open(p, 'w') as fh:
        fh.write('i,mean_abs_diff,moved_px\n')
        for r in rows:
            fh.write('%d,%.4f,%d\n' % r)
    a = np.array([r[1] for r in rows])
    print('mean=%.3f median=%.3f p95=%.3f max=%.3f' % (a.mean(), np.median(a), np.percentile(a, 95), a.max()))
    # 打印序列（每帧）
    print('series:')
    for i, me, mov in rows:
        bar = '#' * int(me * 4)
        print('%4d %6.3f %5d %s' % (i, me, mov, bar))
    print('wrote', p)


if __name__ == '__main__':
    main()
