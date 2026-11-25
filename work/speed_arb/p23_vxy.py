# p23_vxy.py -- 用「相邻帧最近邻配对」测 vx 随屏幕深度 y 的变化（不需要长跟踪、不需要格尺）
# 用法: p23_vxy.py <f|b> <k0> <k1> [amin]
import sys, os
import numpy as np
from PIL import Image

D = {'f': r'F:\sanguo\work\orig_motion\f30', 'b': r'F:\sanguo\work\speed_arb\f30b'}
_c = {}


def load(tag, k):
    key = (tag, k)
    if key not in _c:
        p = os.path.join(D[tag], ('f%04d.png' if tag == 'f' else 'b%04d.png') % k)
        _c[key] = np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
    if len(_c) > 8:
        for kk in list(_c)[:-4]:
            _c.pop(kk, None)
    return _c[key]


def men(tag, k, amin=20):
    a = load(tag, k)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    m = (b - r > 40) & (b > 55) & (g < b + 10)
    m[:56, :] = False; m[256:, :] = False; m[:, :84] = False; m[:, 558:] = False
    H, W = m.shape
    seen = np.zeros((H, W), bool)
    fr = []
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
            fr.append([len(comp), sum(p[1] for p in comp) / len(comp), sum(p[0] for p in comp) / len(comp)])
    # 合并碎片
    ch = True
    while ch:
        ch = False
        for i in range(len(fr)):
            for j in range(i + 1, len(fr)):
                if abs(fr[i][1] - fr[j][1]) <= 9 and abs(fr[i][2] - fr[j][2]) <= 16:
                    a_ = fr[i][0] + fr[j][0]
                    cx = (fr[i][1] * fr[i][0] + fr[j][1] * fr[j][0]) / a_
                    cy = (fr[i][2] * fr[i][0] + fr[j][2] * fr[j][0]) / a_
                    nf = [a_, cx, cy]
                    fr = [f for t, f in enumerate(fr) if t not in (i, j)] + [nf]
                    ch = True; break
            if ch:
                break
    return [f for f in fr if f[0] >= amin]


def main():
    tag, k0, k1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    amin = int(sys.argv[4]) if len(sys.argv) > 4 else 20
    S = []
    for k in range(k0, k1):
        A = men(tag, k, amin)
        B = men(tag, k + 1, amin)
        # 全局按「距离从小到大」贪心做 1:1 配对，避免最近邻抢同一目标
        cand = []
        for ia, a in enumerate(A):
            for ib, b in enumerate(B):
                dx = b[1] - a[1]
                dy = b[2] - a[2]
                if abs(dx) <= 10 and abs(dy) <= 3.0:
                    cand.append((dx * dx + (2.5 * dy) ** 2, ia, ib, dx, dy))
        cand.sort()
        ua, ub = set(), set()
        for d, ia, ib, dx, dy in cand:
            if ia in ua or ib in ub:
                continue
            ua.add(ia); ub.add(ib)
            S.append(((A[ia][2] + B[ib][2]) / 2, dx))
    S = np.array(S)
    print('# pairs=%d   帧对=%d' % (len(S), k1 - k0))
    print('#  y范围    n    vx_med  vx_p90  |vx|_med  |vx|_p90  |vx|_max')
    for y0 in range(60, 260, 10):
        s = S[(S[:, 0] >= y0) & (S[:, 0] < y0 + 10)]
        if len(s) < 8:
            continue
        v = s[:, 1]; av = np.abs(v)
        print('  %3d..%3d  %4d  %6.2f  %6.2f  %7.2f  %7.2f  %7.2f' %
              (y0, y0 + 10, len(s), np.median(v), np.percentile(v, 90),
               np.median(av), np.percentile(av, 90), av.max()))
    np.savetxt(os.path.join(r'F:\sanguo\work\speed_arb', 'vxy_%s_%d_%d.csv' % (tag, k0, k1)), S,
               fmt='%.2f', header='y vx', comments='')


main()
