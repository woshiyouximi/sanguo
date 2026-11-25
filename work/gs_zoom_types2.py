# -*- coding: utf-8 -*-
"""判定 TYPE->造型：取 6 个有判别力的类型，放大上半身对比"""
import json, os, sys
from PIL import Image, ImageDraw
sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'F:\sanguo'
PNG = os.path.join(ROOT, 'export', 'png', 'SHAPE')
OUT = os.path.join(ROOT, 'work', 'gen_sprites')
inv = json.load(open(os.path.join(OUT, 'inventory.json'), encoding='utf-8'))
F = inv['files']

PICK = [('6', 'L6', 'n=10 brute ZhangFei/XuChu/DianWei'),
        ('9', 'L9', 'n=81 civil ZhugeLiang/XunYu'),
        ('10', 'LA', 'n=9 elite LuBu/ZhaoYun/ZhouYu'),
        ('12', 'LC', 'n=14 YELLOW TURBAN ZhangLiang/ZhangBao'),
        ('14', 'LE', 'n=6 ALL FEMALE'),
        ('15', 'L0', 'n=22 southern barbarian MengHuo')]
Z = 6
cw, chh, GY = 420, 480, 460
img = Image.new('RGB', (len(PICK) * cw, chh), (22, 22, 26))
d = ImageDraw.Draw(img)
for i, (t, sh, note) in enumerate(PICK):
    name = 'L' + sh[1:] + 'W10001'
    m = F['BODY'][name]
    b = Image.open(os.path.join(PNG, 'MAJOR', 'BODY', name + '.png')).convert('RGBA')
    # 只取上半身：原图顶部 62 px
    b = b.crop((0, 0, b.width, min(62, b.height)))
    b = b.resize((b.width * Z, b.height * Z), Image.NEAREST)
    px = i * cw + 10
    py = 60
    img.paste(b, (px, py), b)
    d.rectangle([i * cw, 0, i * cw + cw - 1, chh - 1], outline=(60, 60, 70))
    d.text((i * cw + 6, 6), 'TYPE %s -> L%s' % (t, sh), fill=(255, 240, 120))
    d.text((i * cw + 6, 24), note, fill=(150, 200, 255))
    d.text((i * cw + 6, 42), 'upper body 6x', fill=(120, 120, 130))
img.save(os.path.join(OUT, 'zoom_types2.png'))
print('wrote', img.size)
