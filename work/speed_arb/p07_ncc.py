# p07_ncc.py -- 用单兵模板做归一化互相关（FFT），找出方阵里所有同类小人的锚点
# 用法: p07_ncc.py <k> <tx0> <ty0> <tx1> <ty1> <thr> [name]
import sys, os, numpy as np
from PIL import Image, ImageDraw

SRC = r'F:\sanguo\work\speed_arb\f30b\b%04d.png'
OUT = r'F:\sanguo\work\speed_arb'


def load(k):
    return np.asarray(Image.open(SRC % k).convert('RGB')).astype(np.float32)


def ncc(img, tpl):
    """zero-mean normalized cross correlation, returns HxW map aligned to tpl top-left"""
    H, W, _ = img.shape
    th, tw, _ = tpl.shape
    g = img.mean(2)
    t = tpl.mean(2)
    t = t - t.mean()
    tnorm = np.sqrt((t * t).sum())
    # correlation via FFT
    F = np.fft.rfft2(g, s=(H, W))
    T = np.fft.rfft2(t[::-1, ::-1], s=(H, W))
    corr = np.fft.irfft2(F * T, s=(H, W))
    corr = corr[th - 1:, tw - 1:]           # valid region
    # local sums for mean/std
    ii = np.zeros((H + 1, W + 1))
    ii[1:, 1:] = np.cumsum(np.cumsum(g, 0), 1)
    ii2 = np.zeros((H + 1, W + 1))
    ii2[1:, 1:] = np.cumsum(np.cumsum(g * g, 0), 1)

    def box(a):
        return (a[th:, tw:] - a[:-th, tw:] - a[th:, :-tw] + a[:-th, :-tw])
    n = th * tw
    s1 = box(ii)
    s2 = box(ii2)
    var = np.maximum(s2 - s1 * s1 / n, 1e-6)
    out = corr / (np.sqrt(var) * tnorm)
    return out


def peaks(m, thr, mind):
    """local maxima with mask-based non-maximum suppression"""
    pts = []
    idx = np.argwhere(m > thr)
    vals = m[idx[:, 0], idx[:, 1]]
    order = np.argsort(-vals)
    for o in order:
        y, x = idx[o]
        if all(abs(y - py) > mind or abs(x - px) > mind for py, px, _ in pts):
            pts.append((y, x, float(m[y, x])))
    return pts


if __name__ == '__main__':
    k = int(sys.argv[1])
    tx0, ty0, tx1, ty1 = (int(v) for v in sys.argv[2:6])
    thr = float(sys.argv[6]) if len(sys.argv) > 6 else 0.60
    name = sys.argv[7] if len(sys.argv) > 7 else 'z'
    a = load(k)
    tpl = a[ty0:ty1, tx0:tx1]
    print('template', (tx0, ty0, tx1, ty1), 'size', tpl.shape[1], 'x', tpl.shape[0])
    m = ncc(a, tpl)
    sub = np.zeros_like(m)
    sub[64:250, 83:561] = m[64:250, 83:561]
    pts = peaks(sub, thr, 9)
    cx0, cy0 = (tx0 + tx1) / 2, (ty0 + ty1) / 2
    print('hits', len(pts))
    img = Image.fromarray(a.astype(np.uint8))
    dr = ImageDraw.Draw(img)
    rows = []
    for i, (y, x, v) in enumerate(pts):
        ccx, ccy = x + cx0, y + cy0
        rows.append((ccy, ccx, v))
        dr.rectangle([x, y, x + tpl.shape[1] - 1, y + tpl.shape[0] - 1], outline=(0, 255, 0))
        dr.text((x, max(0, y - 8)), '%.2f' % v, fill=(255, 255, 0))
    rows.sort()
    for ccy, ccx, v in rows:
        print('  c=(%6.1f,%6.1f) v=%.3f' % (ccx, ccy, v))
    img.save(os.path.join(OUT, 'ncc_%s_b%04d.png' % (name, k)))
    np.save(os.path.join(OUT, 'ncc_%s_b%04d.npy' % (name, k)), np.array([(r[1], r[0], r[2]) for r in rows]))
