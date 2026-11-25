# -*- coding: utf-8 -*-
"""把三张 750x1334 截图拼成朝向对照图：半月斬（未转 / 已转）+ 衝車（已转）。"""
from PIL import Image, ImageDraw, ImageFont

FONT = r'C:\Windows\Fonts\msyh.ttc'
BG = (18, 21, 28)
FG = (232, 236, 244)
DIM = (150, 158, 172)
GOLD = (232, 196, 106)

shots = [
    (r'F:\sanguo\work\v_half_old.png', '半月斬 seq50 · 未转（fxrot=0）', '月牙竖着劈：原作是横版画法，但战场推进已是纵向'),
    (r'F:\sanguo\work\v_half_new.png', '半月斬 seq50 · 已转 +90°（默认）', '月牙横过来朝敌方阵地推进，和原作观感一致'),
    (r'F:\sanguo\work\v_cart65.png', '衝車 seq65 · 已转 +90°（默认）', '木车竖过来，撞头朝上；轮子朝左 = 俯视竖版战场'),
]

SCALE = 0.44
PAD = 14
TOP = 86
CAP = 46
cols = len(shots)
w0, h0 = Image.open(shots[0][0]).size
cw, ch = int(w0 * SCALE), int(h0 * SCALE)
W = PAD + cols * (cw + PAD)
H = TOP + ch + CAP + PAD
img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)
title = ImageFont.truetype(FONT, 26)
cap = ImageFont.truetype(FONT, 15)
sub = ImageFont.truetype(FONT, 12)
d.text((PAD, 18), '三國群英傳2 竖版重制 · 武将技特效朝向修正（原作横版 → 竖版战场）', font=title, fill=FG)
d.text((PAD, 54), '帧绕「帧内热点」旋转：A 方 +90°、B 方 -90°；汉字/竖柱/立物/坐骑那 12 个目录保持 0°', font=sub, fill=DIM)

for i, (path, title_txt, sub_txt) in enumerate(shots):
    im = Image.open(path).convert('RGB').resize((cw, ch), Image.LANCZOS)
    x = PAD + i * (cw + PAD)
    img.paste(im, (x, TOP))
    d.rectangle([x, TOP, x + cw - 1, TOP + ch - 1], outline=(48, 54, 66))
    d.text((x + 2, TOP + ch + 6), title_txt, font=cap, fill=GOLD)
    d.text((x + 2, TOP + ch + 26), sub_txt, font=sub, fill=DIM)

out = r'F:\sanguo\work\fx_compare.jpg'
img.save(out, quality=88, optimize=True)
print(out, img.size)
