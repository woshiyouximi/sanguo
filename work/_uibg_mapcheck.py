# -*- coding: utf-8 -*-
"""校验 data_ui.js 的城/路坐标是否就是 CHINAMAP.png 的像素坐标。"""
import json, re, os
from PIL import Image, ImageDraw, ImageFont

UI = r'F:\sanguo\proto\ui\data_ui.js'
MAP = r'F:\sanguo\export\png\SHAPE\MAP\CHINAMAP.png'

s = open(UI, encoding='utf-8').read()
i = s.index('{', s.index('var SANGUO_UI'))
# 括号配平，跳过字符串
depth = 0
instr = False
esc = False
for k in range(i, len(s)):
    ch = s[k]
    if instr:
        if esc:
            esc = False
        elif ch == '\\':
            esc = True
        elif ch == '"':
            instr = False
        continue
    if ch == '"':
        instr = True
    elif ch == '{':
        depth += 1
    elif ch == '}':
        depth -= 1
        if depth == 0:
            j = k
            break
d = json.loads(s[i:j + 1])
print('keys', list(d.keys()))
print('nodes', len(d['nodes']), 'roads', len(d['roads']))
xs = [n['x'] for n in d['nodes']]
ys = [n['y'] for n in d['nodes']]
print('x', min(xs), max(xs), 'y', min(ys), max(ys))

im = Image.open(MAP).convert('RGB')
print('map size', im.size)
dr = ImageDraw.Draw(im)
try:
    f = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 17)
except Exception:
    f = ImageFont.load_default()
for r in d['roads']:
    dr.line([tuple(p) for p in r['pts']], fill=(255, 0, 255), width=2)
for n in d['nodes']:
    x, y = n['x'], n['y']
    c = (0, 255, 0) if not n['gate'] else (255, 220, 0)
    dr.ellipse([x - 7, y - 7, x + 7, y + 7], outline=c, width=3)
    dr.text((x + 9, y - 10), n['n'], fill=(255, 255, 255), font=f)
out = r'F:\sanguo\work\map_align_check.png'
im.save(out)
print('saved', out)

# 逐城判断点是否落在"海"（直接用像素色判断：蓝色海 vs 陆地）
land = 0
sea = []
for n in d['nodes']:
    x, y = int(n['x']), int(n['y'])
    px = im.getpixel((min(1279, max(0, x)), min(959, max(0, y))))
    r_, g_, b_ = px[:3]
    is_sea = b_ > 90 and b_ > r_ + 25 and g_ < b_
    if is_sea:
        sea.append((n['n'], x, y, px))
print('疑似落海', len(sea), sea)
