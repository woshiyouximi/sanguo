# 生成"改造前 / 改造后"对照图（A2 战场背景）
from PIL import Image, ImageDraw, ImageFont
import os

W = 'F:\\sanguo\\work\\bg_orig'
OUT = 'F:\\sanguo\\work\\bg_orig_beforeafter.png'

# 只截场地部分（含 HUD 底边一点点），放大到可辨认的比例
CROP = (0, 88, 750, 1014)          # 926 高
SCALE = 0.46
CW = int(750 * SCALE)              # 345
CH = int((CROP[3] - CROP[1]) * SCALE)  # 426
PAD = 10
LABEL = 24

rows = [(0, 'terrain 00  城·砖地'), (4, 'terrain 04  草原'), (8, 'terrain 08  雪原')]
cols = ['改造前（纯色底 + 车道网格）', '改造后（原作战场背景）']

fw = PAD + 2 * (CW + PAD)
fh = PAD + LABEL + len(rows) * (CH + LABEL + PAD)

canvas = Image.new('RGB', (fw, fh), (18, 22, 28))
d = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype('C:\\Windows\\Fonts\\msyh.ttc', 17)
except Exception:
    font = ImageFont.load_default()

x0 = PAD
for i, cname in enumerate(cols):
    d.text((x0 + i * (CW + PAD) + 2, PAD - 2), cname, font=font, fill=(150, 220, 150))

y = PAD + LABEL
for idx, label in rows:
    d.text((2, y - 1), label, font=font, fill=(210, 210, 210))
    y += LABEL
    for i, path in enumerate([
        os.path.join(W, 'before_%02d.png' % idx),
        os.path.join(W, 'terrain_%02d.png' % idx),
    ]):
        im = Image.open(path).convert('RGB').crop(CROP)
        im = im.resize((CW, CH), Image.LANCZOS)
        canvas.paste(im, (x0 + i * (CW + PAD), y))
    y += CH + PAD

canvas.save(OUT, quality=90, optimize=True)
print(OUT, canvas.size, os.path.getsize(OUT))
