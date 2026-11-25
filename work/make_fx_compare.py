"""把两张无头截图拼成 fx_compare.jpg（左：半月斬，右：神鬼亂舞）。

一次性脚本，产物在 work/ 下，不进 game/。
"""
import os

from PIL import Image, ImageDraw, ImageFont

WORK = r'F:\sanguo\work'
FONT = r'C:\Windows\Fonts\msyh.ttc'
BG = (18, 21, 27)
FG = (232, 226, 208)
DIM = (150, 156, 168)

SHOTS = [
    ('fx_shot1.png', '半月斬  seq 50 → MAGIC\\001（10 帧，取第 9 帧）'),
    ('fx_shot2.png', '神鬼亂舞  seq 104 → MAGIC\\004（4 帧，取第 2 帧）'),
]

f_title = ImageFont.truetype(FONT, 26)
f_cap = ImageFont.truetype(FONT, 20)

pad, gap, cap_h, title_h = 16, 16, 44, 56
panels = [(Image.open(os.path.join(WORK, n)).convert('RGB'), c) for n, c in SHOTS]
pw, ph = panels[0][0].size
W = pad * 2 + pw * 2 + gap
H = title_h + pad + ph + cap_h + pad

out = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(out)
d.text((pad, 14), '三國群英傳2 竖版重制 · 武将技特效接入：原作 SHP 序列帧 + lighter 叠加',
       font=f_title, fill=FG)

x = pad
for img, cap in panels:
    out.paste(img, (x, title_h + pad))
    d.rectangle([x - 1, title_h + pad - 1, x + pw, title_h + pad + ph], outline=(58, 64, 76))
    d.text((x, title_h + pad + ph + 12), cap, font=f_cap, fill=DIM)
    x += pw + gap

path = os.path.join(WORK, 'fx_compare.jpg')
out.save(path, quality=88, optimize=True, progressive=True)
print('%s  %dx%d  %d bytes' % (path, W, H, os.path.getsize(path)))
