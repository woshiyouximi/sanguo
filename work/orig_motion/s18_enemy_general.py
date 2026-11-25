# -*- coding: utf-8 -*-
"""
s18_enemy_general.py  ——  敌方主将到底在不在场（扩窗 08:20–09:12）

思路：不用背景模型（跨多个换场，中值背景会崩），只用颜色。
  敌方主将 曹豹 的 sprite 特征是**金/铜色盔甲**（HUD 头像可作色标）。
  战场里普通士兵只有零星金饰，整帧总金像素 50~110 px。
  如果主将进场，他的金甲面积应在 200 px 以上且聚成一团。

输出：每个采样帧的总金像素、最大连通块（面积/bbox），以及是否贴右缘。
"""
import numpy as np
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

# 色标：从 HUD 右下角 曹豹 头像里取（f0062 的 495..560 x 262..310）
F0 = np.asarray(Image.open('f30/f0062.png').convert('RGB'), dtype=np.int16)
port = F0[262:310, 495:560]
pm = (port[:, :, 0] > 150) & (port[:, :, 1] > 110) & (port[:, :, 2] < 110) & (port[:, :, 0] - port[:, :, 2] > 70)
print('HUD 头像色标: %d px, 均值 RGB = %s' % (port[pm].shape[0],
                                             np.round(port[pm].mean(axis=0), 1) if pm.any() else 'n/a'))


def cc(mask, min_area=25):
    """4 连通，返回 [(area,x0,y0,x1,y1)]"""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    out = []
    cur = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        cur += 1
        st = [(y0, x0)]
        lab[y0, x0] = cur
        n = 0
        ax0 = ay0 = 10 ** 9
        ax1 = ay1 = -1
        while st:
            y, x = st.pop()
            n += 1
            ax0 = min(ax0, x); ax1 = max(ax1, x)
            ay0 = min(ay0, y); ay1 = max(ay1, y)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = cur
                    st.append((ny, nx))
        if n >= min_area:
            out.append((n, x0 if False else ax0, ay0, ax1, ay1))
    return sorted(out, reverse=True)


print()
print('%-4s %-8s %6s %6s %s' % ('idx', 't', 'gold', 'big', 'largest blob (area,bbox)'))
print('-' * 92)
hits = []
files = sorted(os.listdir('gaps'))
for idx, fn in enumerate(files, 1):
    t = 500 + idx - 1
    im = np.asarray(Image.open('gaps/' + fn).convert('RGB'), dtype=np.int16)
    sub = im[63:252, 82:562]
    m = (sub[:, :, 0] > 150) & (sub[:, :, 1] > 110) & (sub[:, :, 2] < 110) & (sub[:, :, 0] - sub[:, :, 2] > 70)
    tot = int(m.sum())
    bl = cc(m, 25)
    big = bl[0] if bl else (0, 0, 0, 0, 0)
    tag = ''
    if big[0] >= 100 or tot >= 160:
        tag = '  <<<'
        hits.append((idx, t, tot, big))
    print('%-4d %02d:%02d:%02d %6d %6d %s%s' % (idx, t // 3600, (t % 3600) // 60, t % 60, tot, big[0],
                                                ('a=%d (%d,%d)-(%d,%d)' % (big[0], big[1] + 82, big[2] + 63, big[3] + 82, big[4] + 63)), tag))
print()
print('候选帧（总金>=160 或 最大块>=100）: %d 个' % len(hits))
for idx, t, tot, big in hits:
    print('  idx=%d  t=%02d:%02d:%02d  gold=%d  blob a=%d (%d,%d)-(%d,%d)'
          % (idx, t // 3600, (t % 3600) // 60, t % 60, tot, big[0], big[1] + 82, big[2] + 63, big[3] + 82, big[4] + 63))
