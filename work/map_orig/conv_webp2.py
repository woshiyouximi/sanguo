# -*- coding: utf-8 -*-
"""补充：q90/q92 体积、PNG fallback 最优体积、海域暗部放大对比（肉眼查色带）。"""
import os
import numpy as np
from PIL import Image

SRC = r'F:\sanguo\export\png\SHAPE\MAP\CHINAMAP.png'
OUT = r'F:\sanguo\work\map_orig\webp_try'
rgb = Image.open(SRC).convert('RGB')

# 1) 更高档位体积
for q in (95, 92, 90, 88):
    p = os.path.join(OUT, 'chinamap_q%d.webp' % q)
    rgb.save(p, 'WEBP', quality=q, method=6)
    print('q%-3d %8.1f KB' % (q, os.path.getsize(p) / 1024))

# 2) PNG fallback：原 32bpp ARGB 全不透明，转 24bpp RGB 应无损且更小
p = os.path.join(OUT, 'chinamap_rgb.png')
rgb.save(p, 'PNG', optimize=True)
print('png RGB -O6 %8.1f KB (src %8.1f KB)' % (
    os.path.getsize(p) / 1024, os.path.getsize(SRC) / 1024))
same = np.array_equal(np.asarray(rgb), np.asarray(Image.open(p).convert('RGB')))
print('png RGB pixel-identical to src RGB:', same)

# 3) 海域暗部放大 x4 对比：原图 / q85 / q78
SEA = (900, 700, 1180, 880)   # 南海平滑深水区，最容易出色带
cells = [('src', rgb)] + [(f'q{q}', Image.open(os.path.join(OUT, f'chinamap_q{q}.webp')).convert('RGB'))
                          for q in (85, 78, 65)]
Z = 4
w, h = SEA[2] - SEA[0], SEA[3] - SEA[1]
sheet = Image.new('RGB', (w * Z * len(cells) + 8 * (len(cells) - 1), h * Z), (255, 0, 255))
for i, (name, im) in enumerate(cells):
    sheet.paste(im.crop(SEA).resize((w * Z, h * Z), Image.NEAREST), (i * (w * Z + 8), 0))
sheet.save(os.path.join(OUT, 'sea_band_cmp.png'))
print('sea cmp ->', os.path.join(OUT, 'sea_band_cmp.png'), sheet.size)
