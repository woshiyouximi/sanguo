# -*- coding: utf-8 -*-
"""放大对照：TYPE 2/6/9/10/14/15 对应造型的首帧，4x，用于目视判定性别/风格"""
import json, os, sys
from PIL import Image, ImageDraw
sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'F:\sanguo'
PNG = os.path.join(ROOT, 'export', 'png', 'SHAPE')
OUT = os.path.join(ROOT, 'work', 'gen_sprites')
inv = json.load(open(os.path.join(OUT, 'inventory.json'), encoding='utf-8'))
F = inv['files']

PICK = [('2', 'L2', 'n=100 generic'), ('6', 'L6', 'n=10 brute (ZhangFei,XuChu,DianWei)'),
        ('9', 'L9', 'n=81 civil (ZhugeLiang,XunYu)'), ('A', 'LA', 'n=9 elite (LuBu,ZhaoYun,ZhouYu)'),
        ('E', 'LE', 'n=6 ALL FEMALE'), ('0', 'L0', 'n=22 southern barbarian (MengHuo)')]
Z = 4
cw, chh, GY = 340, 640, 610
img = Image.new('RGB', (len(PICK) * cw, chh), (22, 22, 26))
d = ImageDraw.Draw(img)
for i, (t, sh, note) in enumerate(PICK):
    name = 'L' + sh[1:] + 'W10001'
    m = F['BODY'][name]
    b = Image.open(os.path.join(PNG, 'MAJOR', 'BODY', name + '.png')).convert('RGBA')
    b = b.resize((b.width * Z, b.height * Z), Image.NEAREST)
    px = i * cw + cw // 2 - m['offx'] * Z
    py = GY - m['offy'] * Z
    d.line([(i * cw, GY), ((i + 1) * cw, GY)], fill=(50, 80, 130))
    img.paste(b, (px, py), b)
    d.rectangle([i * cw, 0, i * cw + cw - 1, chh - 1], outline=(60, 60, 70))
    d.text((i * cw + 6, 6), 'TYPE %s -> L%s' % (t, sh), fill=(255, 240, 120))
    d.text((i * cw + 6, 20), note, fill=(150, 200, 255))
img.save(os.path.join(OUT, 'zoom_types.png'))
print('wrote', os.path.join(OUT, 'zoom_types.png'), img.size)
