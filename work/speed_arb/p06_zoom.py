# p06_zoom.py -- 任意帧裁剪+放大（读 f30b 或 f30）
import sys, os
from PIL import Image

SRC = {'b': r'F:\sanguo\work\speed_arb\f30b\b%04d.png',
       'f': r'F:\sanguo\work\orig_motion\f30\f%04d.png'}
OUT = r'F:\sanguo\work\speed_arb'

if __name__ == '__main__':
    kind = sys.argv[1]
    k = int(sys.argv[2])
    x0, y0, x1, y1 = (int(v) for v in sys.argv[3:7])
    sc = float(sys.argv[7]) if len(sys.argv) > 7 else 3.0
    name = sys.argv[8] if len(sys.argv) > 8 else 'z_%s%04d' % (kind, k)
    im = Image.open(SRC[kind] % k).convert('RGB').crop((x0, y0, x1, y1))
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.NEAREST)
    p = os.path.join(OUT, name + '.png')
    im.save(p)
    print(p, im.size)
