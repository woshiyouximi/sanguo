# p04_form.py -- 在 b0052 (07:48.667) 的方阵里找单位：中值背景差分 + 连通域 + NCC 精定位
# 输出: blobs 列表 + 带编号调试图
import sys, os, glob, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, r'F:\sanguo\work\orig_motion')
from libimg import label

D = r'F:\sanguo\work\speed_arb\f30b'
OUT = r'F:\sanguo\work\speed_arb'
FIELD = dict(x0=83, x1=560, y0=64, y1=249)


def fr(k):
    return np.asarray(Image.open(os.path.join(D, 'b%04d.png' % k)).convert('RGB'))


def plate(a, b):
    acc = np.stack([fr(k).astype(np.float32) for k in range(a, b + 1)], 0)
    return np.median(acc, 0)


if __name__ == '__main__':
    k = int(sys.argv[1]) if len(sys.argv) > 1 else 52
    pa, pb = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (20, 40)
    thr = int(sys.argv[4]) if len(sys.argv) > 4 else 55
    pl = plate(pa, pb)
    a = fr(k).astype(np.float32)
    d = np.abs(a - pl).sum(axis=2)
    m = d > thr
    mm = np.zeros_like(m, bool)
    mm[FIELD['y0']:FIELD['y1'], FIELD['x0']:FIELD['x1']] = m[FIELD['y0']:FIELD['y1'], FIELD['x0']:FIELD['x1']]
    bl = label(mm, 100)
    img = Image.fromarray(fr(k))
    dr = ImageDraw.Draw(img)
    print('plate from', pa, pb, 'frame', k, 'blobs', len(bl))
    for n, (ar, x0, y0, x1, y1) in enumerate(bl):
        dr.rectangle([x0, y0, x1, y1], outline=(0, 255, 0))
        dr.text((x0 + 1, max(0, y0 - 9)), str(n), fill=(255, 255, 0))
        print('%2d area=%5d bbox=(%3d,%3d)-(%3d,%3d) w=%3d h=%3d c=(%.1f,%.1f) feet=%d'
              % (n, ar, x0, y0, x1, y1, x1 - x0 + 1, y1 - y0 + 1, (x0 + x1) / 2, (y0 + y1) / 2, y1))
    img.save(os.path.join(OUT, 'det_b%04d.png' % k))
    print('saved det_b%04d.png' % k)
