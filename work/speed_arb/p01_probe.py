# p01_probe.py -- 探针：给定帧区间，用局部中值背景做差分，列连通域
import sys, os, numpy as np
sys.path.insert(0, r'F:\sanguo\work\orig_motion')
from libimg import frame, label

F = dict(x0=85, x1=559, y0=78, y1=256)

def localbg(i0, i1):
    acc = None
    n = 0
    for i in range(i0, i1 + 1):
        a = frame(i).astype(np.float32)
        acc = a if acc is None else acc + a
        n += 1
    return acc / n

def blobs_of(i, bgm, thr=60, min_area=120):
    a = frame(i).astype(np.float32)
    d = np.abs(a - bgm).sum(axis=2)
    m = d > thr
    mm = np.zeros_like(m, bool)
    mm[F['y0']:F['y1'], F['x0']:F['x1']] = m[F['y0']:F['y1'], F['x0']:F['x1']]
    out = []
    for (ar, x0, y0, x1, y1) in label(mm, min_area):
        out.append((ar, x0, y0, x1, y1, (x0 + x1) / 2, (y0 + y1) / 2))
    return out, mm

if __name__ == '__main__':
    i0, i1 = int(sys.argv[1]), int(sys.argv[2])
    b0, b1 = int(sys.argv[3]), int(sys.argv[4])
    bgm = localbg(b0, b1)
    for i in range(i0, i1 + 1):
        bs, _ = blobs_of(i, bgm)
        s = ' | '.join('%d@(%d,%d,%d,%d)c(%.0f,%.0f)' % (b[0], b[1], b[2], b[3], b[4], b[5], b[6]) for b in bs[:14])
        print(i, len(bs), s)
