# p20_rank.py -- 用「同排成对间距」量格距：色掩码找人 -> 合并碎片 -> 同 y 成对距离直方图
# 用法: p20_rank.py <f|b> <k> <color:blue|red> [dy_tol] [dmin] [dmax]
import sys, os
import numpy as np
from PIL import Image

D_F30 = r'F:\sanguo\work\orig_motion\f30'
D_F30B = r'F:\sanguo\work\speed_arb\f30b'


def load(tag, k):
    if tag == 'f':
        p = os.path.join(D_F30, 'f%04d.png' % k)
    else:
        p = os.path.join(D_F30B, 'b%04d.png' % k)
    return np.asarray(Image.open(p).convert('RGB')).astype(np.int16)


def mask_of(a, color):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    if color == 'blue':
        return (b - r > 40) & (b > 55) & (g < b + 10)
    else:  # red / 红甲
        return (r - b > 45) & (r > 70) & (r - g > 25)


def frags(m, amin=6):
    """极简连通域：只在战场区内，返回 [(area,cx,cy,x0,y0,x1,y1)]"""
    H, W = m.shape
    seen = np.zeros((H, W), bool)
    out = []
    ys, xs = np.nonzero(m)
    pts = set(zip(ys.tolist(), xs.tolist()))
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]
        seen[y0, x0] = True
        comp = []
        while stack:
            yy, xx = stack.pop()
            comp.append((yy, xx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = yy + dy, xx + dx
                    if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        if len(comp) >= amin:
            cy = sum(p[0] for p in comp) / len(comp)
            cx = sum(p[1] for p in comp) / len(comp)
            out.append((len(comp), cx, cy, min(p[1] for p in comp), min(p[0] for p in comp),
                        max(p[1] for p in comp), max(p[0] for p in comp)))
    out.sort(reverse=True)
    return out


def merge(fr, dxm=10, dym=18):
    """把同一人的碎片合并（甲/裤/头）"""
    fr = [list(f) for f in fr]
    changed = True
    while changed:
        changed = False
        for i in range(len(fr)):
            for j in range(i + 1, len(fr)):
                if abs(fr[i][1] - fr[j][1]) <= dxm and abs(fr[i][2] - fr[j][2]) <= dym:
                    a = fr[i][0] + fr[j][0]
                    cx = (fr[i][1] * fr[i][0] + fr[j][1] * fr[j][0]) / a
                    cy = (fr[i][2] * fr[i][0] + fr[j][2] * fr[j][0]) / a
                    nf = [a, cx, cy, min(fr[i][3], fr[j][3]), min(fr[i][4], fr[j][4]),
                          max(fr[i][5], fr[j][5]), max(fr[i][6], fr[j][6])]
                    fr = [f for k, f in enumerate(fr) if k not in (i, j)] + [nf]
                    changed = True
                    break
            if changed:
                break
    return fr


def main():
    tag, k, color = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    dytol = float(sys.argv[4]) if len(sys.argv) > 4 else 6
    dmin = float(sys.argv[5]) if len(sys.argv) > 5 else 30
    dmax = float(sys.argv[6]) if len(sys.argv) > 6 else 220
    a = load(tag, k)
    m = mask_of(a, color)
    m[:56, :] = False
    m[256:, :] = False
    m[:, :84] = False
    m[:, 558:] = False
    fr = frags(m)
    print('fragments=%d  (area %d..%d)' % (len(fr), fr[-1][0], fr[0][0]))
    men = merge(fr)
    men.sort(key=lambda t: (t[2], t[1]))
    print('men=%d' % len(men))
    for f in men:
        print('   area=%5d  c=(%6.1f,%6.1f)  bbox x%d..%d y%d..%d  h=%d' %
              (f[0], f[1], f[2], f[3], f[5], f[4], f[6], f[6] - f[4]))
    print('\n--- 同排成对（|dy|<=%.0f）' % dytol)
    rows = []
    for i in range(len(men)):
        for j in range(i + 1, len(men)):
            yi, yj = men[i][2], men[j][2]
            if abs(yi - yj) > dytol:
                continue
            d = abs(men[i][1] - men[j][1])
            if d < dmin or d > dmax:
                continue
            rows.append(((yi + yj) / 2, d, men[i][1], men[j][1]))
    rows.sort()
    for y, d, xa, xb in rows:
        print('   y=%6.1f  d=%6.1f   (x %.1f & %.1f)' % (y, d, xa, xb))
    print('\npairs=%d' % len(rows))
    if rows:
        ds = np.array([r[1] for r in rows])
        print('d: min=%.1f  p25=%.1f  med=%.1f  p75=%.1f  max=%.1f' %
              (ds.min(), np.percentile(ds, 25), np.median(ds), np.percentile(ds, 75), ds.max()))


main()
