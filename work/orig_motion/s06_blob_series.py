# s06_blob_series.py -- 对区间内每一帧做 帧差->blob，输出 CSV（i, maskpx, 前8个blob:area,x0,y0,x1,y1）
# 用法: python s06_blob_series.py 62 660 [thr] [outname]
import sys
import numpy as np
from libimg import frame, bg, diffmask, label, OUT
import os

BGM = bg()


def main():
    a0 = int(sys.argv[1]); a1 = int(sys.argv[2])
    thr = int(sys.argv[3]) if len(sys.argv) > 3 else 70
    name = sys.argv[4] if len(sys.argv) > 4 else 'blobs.csv'
    rows = []
    for i in range(a0, a1 + 1):
        f = frame(i)
        m, d = diffmask(f, BGM, thr=thr)
        blobs = label(m, min_area=40)
        top = blobs[:8]
        rec = [i, int(m.sum())]
        for b in top:
            rec += list(b)
        while len(rec) < 2 + 6 * 8:
            rec += [-1] * 6
        rows.append(rec)
        if i % 25 == 0:
            print('..', i, flush=True)
    with open(os.path.join(OUT, name), 'w') as fh:
        fh.write(','.join(['i', 'maskpx'] + ['a%d,x0_%d,y0_%d,x1_%d,y1_%d' % (k, k, k, k, k) for k in range(8)]) + '\n')
        for r in rows:
            fh.write(','.join(str(x) for x in r) + '\n')
    print('wrote', os.path.join(OUT, name), len(rows), 'rows')


if __name__ == '__main__':
    main()
