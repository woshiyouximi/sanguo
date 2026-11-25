# s15_hpbar.py -- 读 HUD 顶部两条主将血条（左右各一条）的"已填充长度"，逐帧输出
# 血条几何（f0062 实测）：y 289..294；左条 x 195..275，右条镜像
# 判色：亮粉 R>195,G>125,B>135 记 1；暗红 R 70..130,G 25..75,B 25..80 记 0.5（血条底色=已扣）
# 用法: python s15_hpbar.py 62 660
import sys
import numpy as np
from libimg import frame, OUT
import os

XL0, XL1 = 188, 286      # 左条
XR0, XR1 = 356, 452      # 右条（待实测确认）
Y0, Y1 = 288, 296


def meas(F, x0, x1):
    sub = F[Y0:Y1, x0:x1].astype(np.int16)
    bright = (sub[:, :, 0] > 195) & (sub[:, :, 1] > 125) & (sub[:, :, 2] > 135)
    dark = (sub[:, :, 0] > 70) & (sub[:, :, 0] < 135) & (sub[:, :, 1] > 20) & (sub[:, :, 1] < 80) & (sub[:, :, 2] > 20) & (sub[:, :, 2] < 85)
    return int(bright.sum()), int(dark.sum())


def main():
    a0, a1 = int(sys.argv[1]), int(sys.argv[2])
    rows = []
    for i in range(a0, a1 + 1):
        F = frame(i)
        b1, d1 = meas(F, XL0, XL1)
        b2, d2 = meas(F, XR0, XR1)
        rows.append((i, b1, d1, b2, d2))
    p = os.path.join(OUT, 'hpbar.csv')
    with open(p, 'w') as fh:
        fh.write('i,brightL,darkL,brightR,darkR\n')
        for r in rows:
            fh.write('%d,%d,%d,%d,%d\n' % r)
    print('wrote', p)
    prev = None
    for i, b1, d1, b2, d2 in rows:
        tag = ''
        if prev:
            if b1 - prev[0] != 0 or b2 - prev[1] != 0:
                tag = '  <== L%+d R%+d' % (b1 - prev[0], b2 - prev[1])
        prev = (b1, b2)
        print('%4d  L bright=%3d dark=%3d | R bright=%3d dark=%3d%s' % (i, b1, d1, b2, d2, tag))


if __name__ == '__main__':
    main()
