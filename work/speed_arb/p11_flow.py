# p11_flow.py -- 分带相位相关：按 y 分带求每一带的前景列剖面在相邻帧间的水平位移
# 前景 = |帧 - 段内中值背景| 超过阈值（地面静止时中值即地面）
# 用法: p11_flow.py <mode f|b> <k0> <k1> [thr] [band_h]
import sys, os, glob, numpy as np
from PIL import Image

SRC = {'b': r'F:\sanguo\work\speed_arb\f30b\b%04d.png',
       'f': r'F:\sanguo\work\orig_motion\f30\f%04d.png'}
OUT = r'F:\sanguo\work\speed_arb'
FIELD = dict(x0=83, x1=560, y0=64, y1=249)


def load(kind, k):
    return np.asarray(Image.open(SRC[kind] % k).convert('RGB')).astype(np.float32)


def fgmask(a, plate, thr):
    return (np.abs(a - plate).sum(2) > thr)


def profile(mask, y0, y1):
    return mask[y0:y1, FIELD['x0']:FIELD['x1']].sum(0).astype(np.float32)


def best_shift(p0, p1, maxd=14):
    p0 = p0 - p0.mean()
    p1 = p1 - p1.mean()
    n = len(p0)
    best, bs = -1e9, 0
    for d in range(-maxd, maxd + 1):
        if d >= 0:
            a, b = p0[d:], p1[:n - d]
        else:
            a, b = p0[:n + d], p1[-d:]
        if len(a) < 40:
            continue
        c = (a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9)
        if c > best:
            best, bs = c, d
    return bs, best


if __name__ == '__main__':
    kind = sys.argv[1]
    k0, k1 = int(sys.argv[2]), int(sys.argv[3])
    thr = float(sys.argv[4]) if len(sys.argv) > 4 else 45
    bh = int(sys.argv[5]) if len(sys.argv) > 5 else 20
    ks = list(range(k0, k1 + 1))
    acc = np.stack([load(kind, k) for k in ks], 0)
    plate = np.median(acc, 0)
    Image.fromarray(plate.astype(np.uint8)).save(os.path.join(OUT, 'plate_%s_%04d_%04d.png' % (kind, k0, k1)))
    bands = [(y, min(y + bh, FIELD['y1'])) for y in range(FIELD['y0'], FIELD['y1'], bh)]
    print('bands:', bands)
    print('k  t      ' + '  '.join('b%03d' % b[0] for b in bands))
    rows = []
    for i in range(1, len(ks)):
        m0 = fgmask(acc[i - 1], plate, thr)
        m1 = fgmask(acc[i], plate, thr)
        ds, cs = [], []
        for (y0, y1) in bands:
            d, c = best_shift(profile(m0, y0, y1), profile(m1, y0, y1))
            ds.append(d)
            cs.append(c)
        rows.append(ds)
        print('%4d %7.3f  ' % (ks[i], 514 + (ks[i] - 2) / 30.0) + '  '.join('%4d' % d for d in ds))
    R = np.array(rows, float)
    print('\n-- per-band median dx (over %d frame steps)' % len(rows))
    for j, (y0, y1) in enumerate(bands):
        if len(rows):
            print('  band y=%3d..%3d  median=%5.2f  mean=%5.2f  nz%%=%3.0f' %
                  (y0, y1, np.median(R[:, j]), R[:, j].mean(), 100 * (R[:, j] != 0).mean()))
