# p21_track.py -- 通用 NCC 跟踪器（灰度、零均值归一化互相关、局部搜索）
# 用法: p21_track.py <f|b> <k0> <k1> <x0> <y0> <x1> <y1> [search] [label]
#   模板取 k0 帧的 (x0,y0)-(x1,y1)，逐帧在上一位置 ±search 内找最佳匹配
import sys, os
import numpy as np
from PIL import Image

D = {'f': r'F:\sanguo\work\orig_motion\f30', 'b': r'F:\sanguo\work\speed_arb\f30b'}
_c = {}


def gray(tag, k):
    key = (tag, k)
    if key not in _c:
        p = os.path.join(D[tag], ('f%04d.png' if tag == 'f' else 'b%04d.png') % k)
        _c[key] = np.asarray(Image.open(p).convert('L')).astype(np.float32)
    if len(_c) > 12:
        for kk in list(_c)[:-6]:
            _c.pop(kk, None)
    return _c[key]


def ncc(a, t, tz):
    """a: 搜索窗, t: 模板(已零均值), tz: 模板 (t-tmean) 范数"""
    from numpy.lib.stride_tricks import sliding_window_view
    w = sliding_window_view(a, t.shape)
    wm = w - w.mean(axis=(2, 3), keepdims=True)
    num = (wm * t[None, None]).sum(axis=(2, 3))
    den = np.sqrt((wm ** 2).sum(axis=(2, 3))) * tz + 1e-9
    return num / den


def main():
    tag, k0, k1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    x0, y0, x1, y1 = [int(v) for v in sys.argv[4:8]]
    srch = int(sys.argv[8]) if len(sys.argv) > 8 else 12
    lab = sys.argv[9] if len(sys.argv) > 9 else 'obj'
    g0 = gray(tag, k0)
    t = g0[y0:y1, x0:x1].copy()
    t = t - t.mean()
    tz = np.sqrt((t ** 2).sum())
    th, tw = t.shape
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    print('# %s  template %dx%d from %s%04d at c=(%.1f,%.1f) search=±%d' %
          (lab, tw, th, tag, k0, cx, cy, srch))
    print('# k   cx      cy      score')
    xs, ys, ss = [], [], []
    for k in range(k0, k1 + 1):
        g = gray(tag, k)
        px, py = int(round(cx - tw / 2)), int(round(cy - th / 2))
        ax0 = max(0, px - srch); ay0 = max(0, py - srch)
        ax1 = min(g.shape[1], px + tw + srch); ay1 = min(g.shape[0], py + th + srch)
        a = g[ay0:ay1, ax0:ax1]
        if a.shape[0] < th or a.shape[1] < tw:
            print('%5d  -- 出界' % k); break
        r = ncc(a, t, tz)
        iy, ix = np.unravel_index(np.argmax(r), r.shape)
        sc = float(r[iy, ix])
        cx = ax0 + ix + tw / 2.0
        cy = ay0 + iy + th / 2.0
        xs.append(cx); ys.append(cy); ss.append(sc)
        print('%5d  %7.2f %7.2f  %.3f' % (k, cx, cy, sc))
    if len(xs) > 4:
        x = np.array(xs); f = np.arange(len(x), dtype=float)
        A = np.vstack([f, np.ones_like(f)]).T
        coef, res, *_ = np.linalg.lstsq(A, x, rcond=None)
        pred = A @ coef
        d = np.diff(x)
        print('\n# n=%d  拟合 x = %.4f*k + %.3f   残差std=%.2f' %
              (len(x), coef[0], coef[1], float(np.std(x - pred))))
        print('# dx: min=%.1f med=%.1f mean=%.3f max=%.1f  零位移帧=%d  |dx|<1 帧=%d' %
              (d.min(), np.median(d), d.mean(), d.max(), int((d == 0).sum()), int((np.abs(d) < 1).sum())))
        print('# y: mean=%.1f min=%.1f max=%.1f' % (np.mean(ys), np.min(ys), np.max(ys)))
        print('# score: min=%.3f mean=%.3f' % (min(ss), sum(ss) / len(ss)))


main()
