# s16_anim_period.py -- 用"贴片自相关"量一个单位的动画循环长度（帧）
# 做法：逐帧跟踪该单位 -> 取以它为中心的 N×N 贴片 -> 计算 NCC(patch_i, patch_i+k) 对 i 平均
# 峰值 lag 即动画周期（骑马/挥砍的循环帧数）。等价于"动作重复周期"。
# 用法: python s16_anim_period.py <f0> <n> <cx> <cy> <hw> <hh> [maxlag] [name]
import sys
import numpy as np
from libimg import frame, OUT
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from s09_track_unit import match


def flat(p):
    v = p.reshape(-1).astype(np.float32)
    return v - v.mean()


def main():
    f0 = int(sys.argv[1]); n = int(sys.argv[2])
    cx, cy = int(sys.argv[3]), int(sys.argv[4])
    hw, hh = int(sys.argv[5]), int(sys.argv[6])
    maxlag = int(sys.argv[7]) if len(sys.argv) > 7 else 30
    name = sys.argv[8] if len(sys.argv) > 8 else 'anim'

    F = frame(f0)
    tpl = F[cy - hh:cy + hh, cx - hw:cx + hw].copy()
    patches = []
    pos = []
    for i in range(f0, f0 + n):
        fr = frame(i)
        s, nx, ny = match(fr, tpl, cx, cy, 12, 8)
        if s < 0.45:
            s2, nx2, ny2 = match(fr, tpl, cx, cy, 36, 20)
            if s2 > s:
                s, nx, ny = s2, nx2, ny2
        cx, cy = nx, ny
        patches.append(flat(fr[cy - hh:cy + hh, cx - hw:cx + hw]))
        pos.append((i, cx, cy, s))

    k = len(patches)
    ac = []
    for lag in range(1, min(maxlag, k - 2) + 1):
        vs = []
        for a in range(k - lag):
            A, B = patches[a], patches[a + lag]
            na = (A * A).sum() ** 0.5; nb = (B * B).sum() ** 0.5
            if na > 0 and nb > 0:
                vs.append(float((A * B).sum() / (na * nb)))
        ac.append((lag, float(np.mean(vs)) if vs else 0.0))
    print('track:')
    for p in pos:
        print('   f%04d cx=%d cy=%d ncc=%.3f' % p)
    print('patch autocorrelation (lag, mean NCC):')
    for lag, v in ac:
        bar = '#' * int(max(0, v) * 50)
        print('   lag=%2d  %.4f  %s' % (lag, v, bar))
    best = sorted(ac, key=lambda t: -t[1])[:6]
    print('top lags:', [(l, round(v, 3)) for l, v in best])
    p = os.path.join(OUT, name + '_ac.csv')
    with open(p, 'w') as fh:
        for lag, v in ac:
            fh.write('%d,%.4f\n' % (lag, v))
    print('wrote', p)


if __name__ == '__main__':
    main()
