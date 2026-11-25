# s09_track_unit.py -- 模板 NCC 跟踪单个单位（主将/士兵），逐帧输出中心坐标与 NCC 峰值
# 用法: python s09_track_unit.py <f0> <f1> <cx> <cy> <hw> <hh> [name]
#   f0/f1: 起止帧；cx,cy: f0 里单位中心；hw,hh: 模板半宽/半高
# 每 1 帧在原帧上做局部搜索（窗口 ±SX, ±SY），取 NCC 最大处为新中心；
# 若峰值 < 0.5 则扩大搜索一次（跳跃/被遮挡）。
import sys
import numpy as np
from libimg import frame, OUT
import os

SX, SY = 14, 10


def match(fr, tpl, cx, cy, sx=SX, sy=SY):
    """RGB 三通道展平后做 NCC。tpl/fr 都是 HxWx3"""
    th, tw = tpl.shape[:2]
    t = tpl.reshape(-1).astype(np.float32)
    t = t - t.mean()
    tn = float((t * t).sum() ** 0.5)
    best = (-2.0, cx, cy)
    H, W = fr.shape[:2]
    for dy in range(-sy, sy + 1):
        for dx in range(-sx, sx + 1):
            x = cx + dx - tw // 2
            y = cy + dy - th // 2
            if x < 0 or y < 0 or x + tw > W or y + th > H:
                continue
            p = fr[y:y + th, x:x + tw].reshape(-1).astype(np.float32)
            p = p - p.mean()
            pn = float((p * p).sum() ** 0.5)
            if pn == 0:
                continue
            s = float((p * t).sum() / (pn * tn))
            if s > best[0]:
                best = (s, cx + dx, cy + dy)
    return best


def main():
    f0, f1 = int(sys.argv[1]), int(sys.argv[2])
    cx, cy = int(sys.argv[3]), int(sys.argv[4])
    hw, hh = int(sys.argv[5]), int(sys.argv[6])
    name = sys.argv[7] if len(sys.argv) > 7 else 'track'
    F = frame(f0)
    tpl = F[cy - hh:cy + hh, cx - hw:cx + hw].copy()
    rows = []
    sx, sy = SX, SY
    for i in range(f0, f1 + 1):
        fr = frame(i)
        s, nx, ny = match(fr, tpl, cx, cy, sx, sy)
        if s < 0.45:                      # 丢了：扩大搜索
            s2, nx2, ny2 = match(fr, tpl, cx, cy, 40, 22)
            if s2 > s:
                s, nx, ny = s2, nx2, ny2
        rows.append((i, nx, ny, s))
        cx, cy = nx, ny
        print('%4d  cx=%3d cy=%3d  ncc=%.3f' % (i, nx, ny, s), flush=True)
    p = os.path.join(OUT, name + '.csv')
    with open(p, 'w') as fh:
        fh.write('i,cx,cy,ncc\n')
        for r in rows:
            fh.write('%d,%d,%d,%.3f\n' % r)
    print('wrote', p)


if __name__ == '__main__':
    main()
