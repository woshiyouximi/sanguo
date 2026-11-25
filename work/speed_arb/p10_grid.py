# p10_grid.py -- 在放大图上叠加 10px 网格与绝对坐标刻度，用于人工读格
# 用法: p10_grid.py <kind f|b> <k> <x0> <y0> <x1> <y1> <scale> <name> [step]
import sys, os
from PIL import Image, ImageDraw

SRC = {'b': r'F:\sanguo\work\speed_arb\f30b\b%04d.png',
       'f': r'F:\sanguo\work\orig_motion\f30\f%04d.png'}
OUT = r'F:\sanguo\work\speed_arb'

if __name__ == '__main__':
    kind, k = sys.argv[1], int(sys.argv[2])
    x0, y0, x1, y1 = (int(v) for v in sys.argv[3:7])
    sc = float(sys.argv[7])
    name = sys.argv[8]
    step = int(sys.argv[9]) if len(sys.argv) > 9 else 10
    im = Image.open(SRC[kind] % k).convert('RGB').crop((x0, y0, x1, y1))
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.NEAREST)
    dr = ImageDraw.Draw(im)
    for x in range(x0 - x0 % step, x1 + 1, step):
        px = (x - x0) * sc
        col = (0, 255, 0) if x % 50 == 0 else (0, 140, 0)
        dr.line([px, 0, px, im.height], fill=col, width=1)
        if x % 20 == 0:
            dr.text((px + 1, 1), str(x), fill=(255, 255, 0))
            dr.text((px + 1, im.height - 11), str(x), fill=(255, 255, 0))
    for y in range(y0 - y0 % step, y1 + 1, step):
        py = (y - y0) * sc
        col = (0, 255, 0) if y % 50 == 0 else (0, 140, 0)
        dr.line([0, py, im.width, py], fill=col, width=1)
        if y % 20 == 0:
            dr.text((1, py + 1), str(y), fill=(255, 255, 0))
            dr.text((im.width - 26, py + 1), str(y), fill=(255, 255, 0))
    im.save(os.path.join(OUT, name + '.png'))
    print(os.path.join(OUT, name + '.png'), im.size)
