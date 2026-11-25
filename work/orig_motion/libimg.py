# libimg.py -- 共用图像工具：读帧、帧差掩码、连通域、blob 统计
# 依赖: numpy + Pillow（本机 dsh 运行时自带）
import os
import numpy as np
from PIL import Image

ROOT = r'F:\sanguo\work\orig_motion'
F30 = os.path.join(ROOT, 'f30')
OUT = os.path.join(ROOT, 'out')

# 战场可视区（排掉 HUD 与左右两侧装饰兵列）
FIELD = dict(x0=85, x1=559, y0=63, y1=252)


def frame(i):
    return np.asarray(Image.open(os.path.join(F30, 'f%04d.png' % i)).convert('RGB'))


def bg():
    return np.asarray(Image.open(os.path.join(OUT, 'bg_median.png')).convert('RGB')).astype(np.int16)


def diffmask(a, bgm, thr=70, field=FIELD):
    """|frame-bg| 的 L1 距离阈值化 -> 布尔掩码（只保留战场区）"""
    d = np.abs(a.astype(np.int16) - bgm).sum(axis=2)
    m = d > thr
    mm = np.zeros_like(m)
    mm[field['y0']:field['y1'], field['x0']:field['x1']] = m[field['y0']:field['y1'], field['x0']:field['x1']]
    return mm, d


def label(mask, min_area=30):
    """4 连通域标记（union-find），返回 [(area, x0,y0,x1,y1, ys, xs)]"""
    ys, xs = np.nonzero(mask)
    n = len(ys)
    if n == 0:
        return []
    idx = -np.ones(mask.shape, dtype=np.int32)
    idx[ys, xs] = np.arange(n)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        yy = ys + dy
        xx = xs + dx
        ok = (yy < mask.shape[0]) & (xx >= 0) & (xx < mask.shape[1])
        nb = idx[yy[ok], xx[ok]]
        for a_, b_ in zip(np.arange(n)[ok], nb):
            if b_ >= 0:
                union(a_, b_)
    roots = np.array([find(i) for i in range(n)])
    out = []
    for r in np.unique(roots):
        sel = roots == r
        if sel.sum() < min_area:
            continue
        yy, xx = ys[sel], xs[sel]
        out.append((int(sel.sum()), int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max())))
    out.sort(reverse=True)
    return out


def blob_pixels(mask, box, pad=0):
    x0, y0, x1, y1 = box
    sub = mask[y0:y1 + 1, x0:x1 + 1]
    ys, xs = np.nonzero(sub)
    return ys + y0, xs + x0
