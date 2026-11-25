# p24_bandflow.py -- 蓝甲掩码的分带列剖面互相关 → 每个 y 带的整体 dx（只测蓝兵，避开地面/背景）
# 用法: p24_bandflow.py <f|b> <k0> <k1> [band] [maxlag]
import sys, os
import numpy as np
from PIL import Image

D = {'f': r'F:\sanguo\work\orig_motion\f30', 'b': r'F:\sanguo\work\speed_arb\f30b'}
_c = {}


def prof(tag, k):
    key = (tag, k)
    if key in _c:
        return _c[key]
    p = os.path.join(D[tag], ('f%04d.png' if tag == 'f' else 'b%04d.png') % k)
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    m = ((b - r > 40) & (b > 55) & (g < b + 10)).astype(np.float32)
    m[:56, :] = 0; m[256:, :] = 0; m[:, :84] = 0; m[:, 558:] = 0
    _c[key] = m
    if len(_c) > 6:
        for kk in list(_c)[:-2]:
            _c.pop(kk, None)
    return m


def banddx(A, B, y0, y1, maxlag):
    pa = A[y0:y1].sum(axis=0)
    pb = B[y0:y1].sum(axis=0)
    if pa.sum() < 40 or pb.sum() < 40:
        return None, 0.0
    best, bl = None, 0
    for lag in range(-maxlag, maxlag + 1):
        if lag > 0:
            x = pa[lag:]; y = pb[:len(pb) - lag]
        elif lag < 0:
            x = pa[:len(pa) + lag]; y = pb[-lag:]
        else:
            x = pa; y = pb
        if len(x) < 50:
            continue
        d = np.abs(x - y).sum() / (len(x) + 1e-9)
        # 归一化：只统计有蓝的列，避免大片 0
        nz = ((x + y) > 0).sum()
        if nz < 20:
            continue
        d = d * 100.0 / nz
        if best is None or d < best:
            best, bl = d, lag
    return bl, float(pa.sum())


def main():
    tag, k0, k1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    band = int(sys.argv[4]) if len(sys.argv) > 4 else 15
    ml = int(sys.argv[5]) if len(sys.argv) > 5 else 8
    rows = []
    for k in range(k0, k1):
        A = prof(tag, k); B = prof(tag, k + 1)
        for y0 in range(60, 255, band):
            dx, mass = banddx(A, B, y0, min(y0 + band, 256), ml)
            if dx is None:
                continue
            rows.append((k, y0, y0 + band, dx, mass))
    R = np.array([(r[1] + r[2]) / 2 for r in rows])
    print('# 帧对=%d 带=%s' % (k1 - k0, band))
    print('#  y中心   n    dx_med  dx_mean  dx_mode(0? )  蓝量中位')
    for y0 in range(60, 256, band):
        s = [r for r in rows if r[1] == y0]
        if len(s) < 10:
            continue
        d = np.array([r[3] for r in s], float)
        m = np.array([r[4] for r in s], float)
        cnt = {}
        for v in d.astype(int):
            cnt[v] = cnt.get(v, 0) + 1
        mode = max(cnt, key=cnt.get)
        print('  %3d..%3d %4d  %6.2f  %6.2f   %+3d (%2d%%)   %7.0f' %
              (y0, y0 + band, len(s), np.median(d), d.mean(), mode, 100 * cnt[mode] // len(s), np.median(m)))
    # 只保留「明显在动」的帧对，看 dx(y) 的上包络
    print('\n# 仅取 |dx|>=2 的帧对（在动的单位）')
    for y0 in range(60, 256, band):
        s = [r for r in rows if r[1] == y0 and abs(r[3]) >= 2]
        if len(s) < 5:
            continue
        d = np.array([r[3] for r in s], float)
        print('  %3d..%3d %4d  med=%6.2f  mean=%6.2f  p90|dx|=%6.2f' %
              (y0, y0 + band, len(s), np.median(d), d.mean(), np.percentile(np.abs(d), 90)))


main()
