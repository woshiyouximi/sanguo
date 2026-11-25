# s01_sheet.py -- 生成"战场区"连拍接触表（带帧号/时间标签），用于肉眼定位与证据图
# 用法: python s01_sheet.py "1,31,61,91,..." [缩放倍数] [输出名]
#   帧号是 f30 目录里的序号（f0001 = 08:34:00，f0062 = 08:36:00）
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = r'F:\sanguo\work\orig_motion'
OUT = os.path.join(ROOT, 'out')
os.makedirs(OUT, exist_ok=True)
FIELD = (82, 24, 562, 262)   # 战场区（不含 HUD）


def t_of(i):
    """f30 帧号 -> 视频时间（秒）"""
    return 514.0 + (i - 2) / 30.0


def hhmmss(t):
    m = int(t // 60)
    s = t - m * 60
    return '%02d:%06.3f' % (m, s)


def main():
    idx = [int(x) for x in sys.argv[1].split(',')]
    scale = float(sys.argv[2]) if len(sys.argv) > 2 else 1.5
    name = sys.argv[3] if len(sys.argv) > 3 else 'sheet'
    cols = int(sys.argv[5]) if len(sys.argv) > 5 else 4
    if len(sys.argv) > 4 and sys.argv[4] != '-':
        x0, y0, x1, y1 = [int(v) for v in sys.argv[4].split(',')]
    else:
        x0, y0, x1, y1 = FIELD
    cw, ch = int((x1 - x0) * scale), int((y1 - y0) * scale)
    cols = 4
    rows = (len(idx) + cols - 1) // cols
    pad = 14
    sheet = Image.new('RGB', (cols * cw, rows * (ch + pad)), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    for k, i in enumerate(idx):
        im = Image.open(os.path.join(ROOT, 'f30', 'f%04d.png' % i)).convert('RGB')
        im = im.crop((x0, y0, x1, y1)).resize((cw, ch), Image.LANCZOS)
        cx, cy = (k % cols) * cw, (k // cols) * (ch + pad)
        sheet.paste(im, (cx, cy + pad))
        d.text((cx + 2, cy + 2), 'f%04d  %s' % (i, hhmmss(t_of(i))), fill=(255, 255, 0))
    p = os.path.join(OUT, name + '.png')
    sheet.save(p)
    print(p, sheet.size)


if __name__ == '__main__':
    main()
