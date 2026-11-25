# -*- coding: utf-8 -*-
"""CHINAMAP.png -> webp 多档体积/质量对比。

不缩放（保 1280x960），不用 jpeg（海上渐变更容易出色带）。
输出到 work/map_orig/webp_try/，并打印体积 + 与源图的最大/中位误差 + 平滑海域色阶数。
"""
import os, sys
import numpy as np
from PIL import Image

SRC = r'F:\sanguo\export\png\SHAPE\MAP\CHINAMAP.png'
OUT = r'F:\sanguo\work\map_orig\webp_try'

im = Image.open(SRC)
print('src', im.size, im.mode)
a = np.asarray(im.convert('RGBA'))
alpha = a[:, :, 3]
print('alpha min/max', alpha.min(), alpha.max(), 'opaque%%=%.2f' % (100.0 * (alpha == 255).mean()))
rgb = Image.fromarray(a[:, :, :3], 'RGB')
os.makedirs(OUT, exist_ok=True)


def band_score(img, box):
    """平滑海域的色阶数（越多越平滑；色带会造成平台/断层）。"""
    c = np.asarray(img.crop(box).convert('RGB')).astype(np.int16)
    g = c.mean(axis=2)
    return dict(uniq=int(len(np.unique(c.reshape(-1, 3), axis=0))),
                uniq_luma=int(len(np.unique(np.round(g)))),
                p1=float(np.percentile(g, 1)), p99=float(np.percentile(g, 99)))


SEA = (880, 380, 1180, 620)   # 东海大片平滑渐变
for q in (85, 82, 78, 72, 65):
    for method in ('photo',):
        p = os.path.join(OUT, 'chinamap_q%d.webp' % q)
        rgb.save(p, 'WEBP', quality=q, method=6)
        kb = os.path.getsize(p) / 1024
        d = np.abs(np.asarray(rgb, np.int16) - np.asarray(Image.open(p).convert('RGB'), np.int16))
        print('q%-3d %-6s %8.1f KB  err max=%3d med=%.2f  sea_uniq=%4d luma_steps=%3d' % (
            q, method, kb, d.max(), np.median(d), band_score(Image.open(p), SEA)['uniq'],
            band_score(Image.open(p), SEA)['uniq_luma']))
