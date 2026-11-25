# -*- coding: utf-8 -*-
"""素材入库 + 图元几何分析。

1) CHINAMAP.png -> assets/map/chinamap.webp (q85, RGB, 不缩放) + chinamap.png fallback
2) CITY01-04 -> city_1..4.png, POINT -> point.png（逐字节拷贝，不改像素）
3) 报告每个图元的：画布尺寸、非透明包围盒、有效内容居中偏移、alpha 覆盖率
"""
import os, shutil
import numpy as np
from PIL import Image

SRC_DIR = r'F:\sanguo\export\png\SHAPE\MAP'
DST = r'F:\sanguo\game\web\assets\map'
os.makedirs(DST, exist_ok=True)

# ---- 1) 底图 ----
src = Image.open(os.path.join(SRC_DIR, 'CHINAMAP.png'))
assert src.size == (1280, 960), src.size
rgb = src.convert('RGB')
wp = os.path.join(DST, 'chinamap.webp')
rgb.save(wp, 'WEBP', quality=85, method=6)
pp = os.path.join(DST, 'chinamap.png')
shutil.copyfile(os.path.join(SRC_DIR, 'CHINAMAP.png'), pp)
print('chinamap.webp %8.1f KB  %s' % (os.path.getsize(wp) / 1024, Image.open(wp).size))
print('chinamap.png  %8.1f KB  %s (verbatim copy)' % (os.path.getsize(pp) / 1024,
                                                      Image.open(pp).size))

# ---- 2) 图元 ----
pairs = [('CITY01.png', 'city_1.png'), ('CITY02.png', 'city_2.png'),
         ('CITY03.png', 'city_3.png'), ('CITY04.png', 'city_4.png'),
         ('POINT.png', 'point.png')]
print('\n%-10s %-11s %-5s %-13s %-14s %-8s %s' % (
    'src', 'dst', 'size', 'content_bbox', 'center_offset', 'opaque%', 'w/h'))
for s, d in pairs:
    sp = os.path.join(SRC_DIR, s)
    dp = os.path.join(DST, d)
    shutil.copyfile(sp, dp)
    im = Image.open(sp).convert('RGBA')
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(a > 8)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    bw, bh = bbox[2] - bbox[0] + 1, bbox[3] - bbox[1] + 1
    # 画布中心 vs 内容中心
    ccx, ccy = (im.width - 1) / 2, (im.height - 1) / 2
    kcx, kcy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    print('%-10s %-11s %-5s %-13s (%+.1f,%+.1f) %-8s %.2f' % (
        s, d, '%dx%d' % im.size, '%dx%d@%d,%d' % (bw, bh, bbox[0], bbox[1]),
        kcx - ccx, kcy - ccy, '%.1f' % (100.0 * (a > 8).mean()), bw / bh))
print('\nfiles:')
for d in sorted(os.listdir(DST)):
    print('  %-16s %8d B' % (d, os.path.getsize(os.path.join(DST, d))))
