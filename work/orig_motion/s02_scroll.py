# s02_scroll.py -- 测摄像机的水平滚动量
# 背景（城楼/地面纹理）在世界坐标里静止，画面却在动 => 相机跟随平移。
# 算法：取城楼条带 y=26..70 与地面条带 y=150..250，对相邻两帧做 1D 互相关，
#       取峰值位移作为该帧相对上一帧的滚动增量，累加得 scroll[i]。
# 输出 out/scroll.csv (frame, t, dx_build, dx_ground, scroll)
import os
import numpy as np
from PIL import Image

ROOT = r'F:\sanguo\work\orig_motion'
OUT = os.path.join(ROOT, 'out')
os.makedirs(OUT, exist_ok=True)

N = 660
BAND_BUILD = (26, 70)
BAND_GROUND = (150, 250)


def gray(i):
    a = np.asarray(Image.open(os.path.join(ROOT, 'f30', 'f%04d.png' % i)).convert('RGB'), dtype=np.float32)
    return a.mean(axis=2)


def shift_1d(prev, cur, y0, y1, maxs=96):
    """在 [y0,y1) 条带上找 cur 相对 prev 的水平位移 d（cur(x+d) ~ prev(x)）"""
    p = prev[y0:y1].mean(axis=0)
    c = cur[y0:y1].mean(axis=0)
    p = p - p.mean()
    c = c - c.mean()
    best, bestd = -1e18, 0
    for d in range(-maxs, maxs + 1):
        if d >= 0:
            a, b = p[:len(p) - d], c[d:]
        else:
            a, b = p[-d:], c[:len(c) + d]
        s = float((a * b).sum() / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
        if s > best:
            best, bestd = s, d
    return bestd, best


def main():
    prev = gray(1)
    rows = [(1, 0.0, 0, 0, 0.0, 0.0)]
    acc = 0
    for i in range(2, N + 1):
        cur = gray(i)
        db, sb = shift_1d(prev, cur, *BAND_BUILD)
        dg, sg = shift_1d(prev, cur, *BAND_GROUND)
        acc += db
        rows.append((i, (i - 2) / 30.0, db, dg, acc, sb))
        prev = cur
    with open(os.path.join(OUT, 'scroll.csv'), 'w', encoding='utf-8') as f:
        f.write('frame,t_rel,dx_build,dx_ground,scroll_x,score_build\n')
        for r in rows:
            f.write('%d,%.4f,%d,%d,%.1f,%.4f\n' % r)
    # 摘要
    print('frame  dx_build dx_ground  scroll  score')
    for r in rows:
        if r[0] % 30 == 2:
            print('%4d   %+3d      %+3d      %6.1f  %.3f' % (r[0], r[2], r[3], r[4], r[5]))
    print('total scroll', acc)


if __name__ == '__main__':
    main()
