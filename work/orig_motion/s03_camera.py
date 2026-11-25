# s03_camera.py -- 判定相机是否移动：对参考帧做全图 2D 归一化互相关（NCC），
#                  在 ±(dx,dy) 范围内找最佳平移，并报告最佳位移处的残差。
# 说明：只统计"背景可解释"的区域（y 6..250，排除 HUD 与最底部），单位不影响结论
#       （单位面积小；且用高分位残差判断）。
# 输出 out/camera_ncc.txt
import os
import numpy as np
from PIL import Image

ROOT = r'F:\sanguo\work\orig_motion'
OUT = os.path.join(ROOT, 'out')
Y0, Y1, X0, X1 = 6, 250, 84, 560


def gy(i):
    a = np.asarray(Image.open(os.path.join(ROOT, 'f30', 'f%04d.png' % i)).convert('L'), dtype=np.float32)
    return a


def score(ref, cur, dx, dy):
    """把 cur 平移 (dx,dy) 后与 ref 在重叠区求 NCC"""
    ya0, ya1 = max(Y0, Y0 + dy), min(Y1, Y1 + dy)
    xa0, xa1 = max(X0, X0 + dx), min(X1, X1 + dx)
    if ya1 - ya0 < 100 or xa1 - xa0 < 200:
        return -2
    A = ref[ya0:ya1, xa0:xa1]
    B = cur[ya0 - dy:ya1 - dy, xa0 - dx:xa1 - dx]
    A = A - A.mean()
    B = B - B.mean()
    return float((A * B).sum() / np.sqrt((A * A).sum() * (B * B).sum() + 1e-9))


def best_shift(ref, cur, rx=110, ry=45, step=1):
    bs, bd = -2, (0, 0)
    for dy in range(-ry, ry + 1, step):
        for dx in range(-rx, rx + 1, step):
            s = score(ref, cur, dx, dy)
            if s > bs:
                bs, bd = s, (dx, dy)
    return bs, bd


def main():
    ref = gy(62)
    lines = []
    lines.append('ref = f0062 (08:36.000); NCC on y%d..%d x%d..%d' % (Y0, Y1, X0, X1))
    lines.append('frame  best_ncc  dx  dy   ncc@(0,0)')
    for j in [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 660]:
        c = gy(j)
        s, (dx, dy) = best_shift(ref, c)
        lines.append('%5d  %.4f  %+4d %+4d   %.4f' % (j, s, dx, dy, score(ref, c, 0, 0)))
    # 相邻帧
    lines.append('')
    lines.append('--- consecutive pairs ---')
    for a, b in [(62, 63), (200, 201), (400, 401), (600, 601)]:
        A, B = gy(a), gy(b)
        s, (dx, dy) = best_shift(A, B, rx=20, ry=20)
        lines.append('%d->%d  %.4f  %+d %+d  (0,0)=%.4f' % (a, b, s, dx, dy, score(A, B, 0, 0)))
    txt = '\n'.join(lines)
    print(txt)
    open(os.path.join(OUT, 'camera_ncc.txt'), 'w', encoding='utf-8').write(txt + '\n')


if __name__ == '__main__':
    main()
