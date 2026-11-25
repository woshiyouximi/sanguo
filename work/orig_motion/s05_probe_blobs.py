# s05_probe_blobs.py -- 在若干帧上打印 blob 列表（面积/bbox），用来标定"主将 vs 士兵"的判别阈值
# 用法: python s05_probe_blobs.py 62 92 122 200
import sys
import numpy as np
from libimg import frame, bg, diffmask, label

BGM = bg()


def main():
    frames = [int(x) for x in sys.argv[1:]] or [62, 92, 122, 200, 300]
    for i in frames:
        a = frame(i)
        m, d = diffmask(a, BGM, thr=70)
        blobs = label(m, min_area=40)
        print('f%04d  maskpx=%d  blobs=%d' % (i, int(m.sum()), len(blobs)))
        for area, x0, y0, x1, y1 in blobs[:8]:
            print('   area=%4d  bbox=(%3d,%3d)-(%3d,%3d)  w=%2d h=%2d  cx=%.1f cy=%.1f' %
                  (area, x0, y0, x1, y1, x1 - x0 + 1, y1 - y0 + 1, (x0 + x1) / 2, (y0 + y1) / 2))


if __name__ == '__main__':
    main()
