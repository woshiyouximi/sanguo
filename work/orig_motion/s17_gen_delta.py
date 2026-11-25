# -*- coding: utf-8 -*-
"""
s17_gen_delta.py  ——  §8 主将节奏复核（闸门周期 / 是否跳格 / 透视校正）

输入：out/gen_track.csv（模板 NCC 逐帧中心）、out/blobs.csv（帧差 blob bbox）
输出：out/gen_delta.csv + 屏幕表格

口径：cx 是整数（模板匹配在整数网格上），所以 delta 的 ±1 是量化噪声，
      多出来的 ±2~3 是 sprite 动画摆动（马腿/马尾换姿把匹配峰拉偏）。
      判「有没有停顿」不看单帧 delta，看 11 帧滑窗斜率：
        停顿 -> 窗内斜率掉到 0；跳格 -> 窗内斜率冲到 >10（96px/8帧）。
"""
import numpy as np
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

NCC_MIN = 0.60          # 低于此值判跟踪失效（f0109 之后主将贴右缘被裁）
FPS = 30.0
T = lambda i: 514 + (i - 2) / FPS

# ---------- 数据 ----------
tr = {}
for r in csv.DictReader(open('out/gen_track.csv')):
    tr[int(r['i'])] = (float(r['cx']), float(r['cy']), float(r['ncc']))
frames = [i for i in sorted(tr) if tr[i][2] > NCC_MIN]

by = {int(r['i']): r for r in csv.DictReader(open('out/blobs.csv'))}


def gen_bbox(i):
    """主将块 = 剔除背景毛刺/静态伪影后面积最大的块"""
    r = by.get(i)
    if not r:
        return None
    best = None
    for k in range(8):
        a = int(r['a%d' % k])
        if a <= 0:
            continue
        x0, y0, x1, y1 = [int(r['%s_%d' % (s, k)]) for s in ('x0', 'y0', 'x1', 'y1')]
        if y1 <= 72 and y1 - y0 <= 8:
            continue
        if (x0, y0, x1, y1) == (440, 147, 449, 166):
            continue
        if best is None or a > best[0]:
            best = (a, x0, y0, x1, y1)
    return best


# ---------- A) 逐帧 delta ----------
cx = np.array([tr[i][0] for i in frames])
d = np.diff(cx)
print('=' * 92)
print('A) 模板跟踪 cx 逐帧 delta  (f%04d..f%04d, %d 帧 = %.2f s, NCC>%.2f)'
      % (frames[0], frames[-1], len(frames), (frames[-1] - frames[0]) / FPS, NCC_MIN))
print('=' * 92)
print('frame: ' + ' '.join('%3d' % i for i in frames))
print('cx   : ' + ' '.join('%3.0f' % v for v in cx))
print('dx   : ' + ' '.join('%3.0f' % v for v in d))
print()
print('  delta  min/med/mean/max = %d / %d / %.2f / %d px' % (d.min(), np.median(d), d.mean(), d.max()))
print('  delta == 0 的帧数 = %d     delta <= 1 的帧数 = %d' % (int((d == 0).sum()), int((d <= 1).sum())))
print('  线性拟合 = %.4f px/帧 = %.2f px/s' % (d.mean(), d.mean() * FPS))

W = 11
sl = []
for s in range(len(cx) - W + 1):
    k = np.polyfit(np.arange(W), cx[s:s + W], 1)[0]
    sl.append((frames[s], frames[s + W - 1], k))
ks = np.array([k for _, _, k in sl])
print()
print('B) %d 帧滑窗斜率：min/med/max = %.2f / %.2f / %.2f px/帧  (n=%d 窗)'
      % (W, ks.min(), np.median(ks), ks.max(), len(ks)))
bad = [(a, b, k) for a, b, k in sl if k < 3.0 or k > 8.0]
print('   斜率 <3 或 >8 的窗口: %s' % (bad if bad else '无 —— 全程匀速，没有任何窗口接近停顿或跳格'))
print('   全部窗口数值: ' + ' '.join('%.1f' % k for k in ks))

# ---------- C) blob bbox 独立复核 ----------
print()
print('=' * 92)
print('C) 独立复核：帧差 blob bbox 左缘（覆盖出画段 f0109..f0118）')
print('=' * 92)
bb = [(i,) + gen_bbox(i)[1:] for i in range(62, 119) if gen_bbox(i)]
print('frame: ' + ' '.join('%4d' % b[0] for b in bb))
print('x0   : ' + ' '.join('%4d' % b[1] for b in bb))
print('x1   : ' + ' '.join('%4d' % b[3] for b in bb))
x0 = np.array([b[1] for b in bb], float)
n0 = len([b for b in bb if b[0] <= 109])
print('  拟合斜率（f62..f109, %d 点）= %.3f px/帧；f0110 之后贴边裁切，数据不可用'
      % (n0, np.polyfit(np.arange(n0), x0[:n0], 1)[0]))

# ---------- D) 透视校正 ----------
print()
print('=' * 92)
print('D) 透视校正：px/帧 -> 格/秒')
print('=' * 92)
h = lambda y: 0.29 * y + 6.7
Y_SOL, Y_GEN = 115.0, 165.0
k_persp = h(Y_GEN) / h(Y_SOL)
V_GEN, V_SOL = d.mean() * FPS, 2.94 * FPS
print('  sprite 高 h(y)=0.29y+6.7 : h(115)=%.1f  h(165)=%.1f  =>  尺度比 k=%.3f' % (h(Y_SOL), h(Y_GEN), k_persp))
print('  像素速度: 主将 %.1f px/s  士兵 %.1f px/s   =>  比值 %.2f' % (V_GEN, V_SOL, V_GEN / V_SOL))
print('  **格速度比（透视校正后）= (%.1f/%.2f)/%.1f = %.2f**' % (V_GEN, k_persp, V_SOL, (V_GEN / k_persp) / V_SOL))
print()
print('  口径1  反汇编仿射网格（py=gy*0x48+0x24，格恒 96px，无位置透视）')
print('     主将 %.1f/96  = %.2f 格/s  => 每 40 帧(1.33s) %.2f 格' % (V_GEN, V_GEN / 96, V_GEN * 40 / FPS / 96))
print('     士兵 %.1f/96  = %.2f 格/s  => 每 40 帧        %.2f 格' % (V_SOL, V_SOL / 96, V_SOL * 40 / FPS / 96))
print()
cell_sol = V_SOL * 40 / FPS          # 锚：士兵 1 格 = 40 帧的位移
cell_gen = cell_sol * k_persp
print('  口径2  把 sprite 缩放当透视（锚：士兵 1 格/40 帧）')
print('     士兵格宽 = %.1f px (y=115)；主将格宽 = %.1f px (y=165)' % (cell_sol, cell_gen))
print('     主将 = %.1f/%.1f = **%.2f 格/s** = 每 40 帧 **%.2f 格**' % (V_GEN, cell_gen, V_GEN / cell_gen, V_GEN * 40 / FPS / cell_gen))
print()
print('  反向检验：若主将真是「1 格/40 帧」，屏幕速度应为')
print('     口径1: 96/40 = 2.40 px/帧（实测 %.2f，差 %.2f 倍）' % (d.mean(), d.mean() / 2.40))
print('     口径2: %.1f/40 = %.2f px/帧（实测 %.2f，差 %.2f 倍）'
      % (cell_gen, cell_gen / 40, d.mean(), d.mean() / (cell_gen / 40)))

# ---------- 出表 ----------
with open('out/gen_delta.csv', 'w', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['frame', 't_sec', 'cx', 'cy', 'ncc', 'delta', 'blob_x0', 'blob_x1'])
    prev = None
    for i in frames:
        c, cy_, nc = tr[i]
        g = gen_bbox(i)
        w.writerow([i, '%.3f' % T(i), '%d' % c, '%d' % cy_, '%.3f' % nc,
                    ('' if prev is None else '%d' % int(c - prev)),
                    (g[1] if g else ''), (g[3] if g else '')])
        prev = c
print()
print('已写 out/gen_delta.csv (%d 行)' % len(frames))
