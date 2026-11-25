# p22_row.py -- 逐帧列出某个 y 带内的「人」x 位置 + 相邻间距，用于判断「刚性小队」还是「独立单位」
# 用法: p22_row.py <f|b> <k0> <k1> <y0> <y1> [amin]
import sys, os
import numpy as np
from PIL import Image

D = {'f': r'F:\sanguo\work\orig_motion\f30', 'b': r'F:\sanguo\work\speed_arb\f30b'}


def load(tag, k):
    p = os.path.join(D[tag], ('f%04d.png' if tag == 'f' else 'b%04d.png') % k)
    return np.asarray(Image.open(p).convert('RGB')).astype(np.int16)


def frags_blue(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    m = (b - r > 40) & (b > 55) & (g < b + 10)
    m[:56, :] = False; m[256:, :] = False; m[:, :84] = False; m[:, 558:] = False
    H, W = m.shape
    seen = np.zeros((H, W), bool)
    out = []
    ys, xs = np.nonzero(m)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if seen[y0, x0]:
            continue
        st = [(y0, x0)]; seen[y0, x0] = True; comp = []
        while st:
            yy, xx = st.pop(); comp.append((yy, xx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = yy + dy, xx + dx
                    if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; st.append((ny, nx))
        if len(comp) >= 4:
            cy = sum(p[0] for p in comp) / len(comp)
            cx = sum(p[1] for p in comp) / len(comp)
            out.append([len(comp), cx, cy])
    return out


def merge(fr, dxm=9, dym=16):
    fr = [list(f) for f in fr]
    ch = True
    while ch:
        ch = False
        for i in range(len(fr)):
            for j in range(i + 1, len(fr)):
                if abs(fr[i][1] - fr[j][1]) <= dxm and abs(fr[i][2] - fr[j][2]) <= dym:
                    a = fr[i][0] + fr[j][0]
                    cx = (fr[i][1] * fr[i][0] + fr[j][1] * fr[j][0]) / a
                    cy = (fr[i][2] * fr[i][0] + fr[j][2] * fr[j][0]) / a
                    nf = [a, cx, cy]
                    fr = [f for t, f in enumerate(fr) if t not in (i, j)] + [nf]
                    ch = True; break
            if ch:
                break
    return fr


def main():
    tag, k0, k1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    y0, y1 = float(sys.argv[4]), float(sys.argv[5])
    amin = int(sys.argv[6]) if len(sys.argv) > 6 else 20
    print('# k    men(x@y)  [仅 y %.0f..%.0f, area>=%d]        相邻间距' % (y0, y1, amin))
    prev = {}
    for k in range(k0, k1 + 1):
        men = [m for m in merge(frags_blue(load(tag, k))) if y0 <= m[2] <= y1 and m[0] >= amin]
        men.sort(key=lambda t: t[1])
        s = ' '.join('%.0f@%.0f' % (m[1], m[2]) for m in men)
        d = ' '.join('%.0f' % (men[i + 1][1] - men[i][1]) for i in range(len(men) - 1))
        print('%5d  %-46s  %s' % (k, s, d))


main()
