# -*- coding: utf-8 -*-
"""15 造型 x 2 阵营 的 Wait 第 1 帧对照表：用于目视检验 TYPE n -> 造型号"""
import json, os, sys
from PIL import Image, ImageDraw
sys.stdout.reconfigure(encoding='utf-8')

ROOT = r'F:\sanguo'
PNG = os.path.join(ROOT, 'export', 'png', 'SHAPE')
OUT = os.path.join(ROOT, 'work', 'gen_sprites')
SHAPES = '123456789ABCDE0'

def load(rel):
    return Image.open(os.path.join(PNG, rel.replace('\\', '/') + '.png')).convert('RGBA')

# 每格画 body(Wait1) + 该武器位的武器(Wait1)，世界画布
CELL_W, CELL_H = 150, 190
Z = 2
cols = 15
rows = 2
img = Image.new('RGBA', (cols * CELL_W * Z // 2, rows * CELL_H * Z // 2), (24, 24, 28, 255))
d = ImageDraw.Draw(img)
SC = Z / 2.0

# body wait frame 1 的 offx/offy 从 inventory 读
inv = json.load(open(os.path.join(OUT, 'inventory.json'), encoding='utf-8'))
F = inv['files']

for ri, side in enumerate('LR'):
    for ci, sh in enumerate(SHAPES):
        name = '%s%sW1' % (side, sh) + '0001'
        m = F['BODY'].get(name)
        if not m:
            continue
        cx = ci * CELL_W + CELL_W // 2
        cy = ri * CELL_H + CELL_H - 30
        # 地面线
        gy = int(cy * SC)
        d.line([(ci * CELL_W * SC, gy), ((ci + 1) * CELL_W * SC, gy)], fill=(60, 90, 140, 255))
        b = load('MAJOR/BODY/' + name)
        px = int((cx - m['offx']) * SC)
        py = int((cy - m['offy']) * SC)
        # 画布缩放
        b2 = b.resize((max(1, int(b.width * SC)), max(1, int(b.height * SC))), Image.NEAREST)
        img.alpha_composite(b2, (px, py))
        d.text((ci * CELL_W * SC + 4, ri * CELL_H * SC + 4), '%s%s (TYPE %d?)' % (side, sh, ci + 1),
               fill=(230, 230, 120, 255))

img.convert('RGB').save(os.path.join(OUT, 'shapes15.png'))
print('wrote', os.path.join(OUT, 'shapes15.png'), img.size)
