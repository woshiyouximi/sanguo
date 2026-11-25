# p05_blue.py -- 用蓝甲色掩码找蓝兵单位中心
import sys, os, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, r'F:\sanguo\work\orig_motion')
from libimg import label

D = r'F:\sanguo\work\speed_arb\f30b'
OUT = r'F:\sanguo\work\speed_arb'
FIELD = dict(x0=83, x1=560, y0=75, y1=249)


def fr(k):
    return np.asarray(Image.open(os.path.join(D, 'b%04d.png' % k)).convert('RGB'))


if __name__ == '__main__':
    k = int(sys.argv[1])
    dthr = int(sys.argv[2]) if len(sys.argv) > 2 else 35
    amin = int(sys.argv[3]) if len(sys.argv) > 3 else 25
    a = fr(k).astype(np.int16)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    m = (B - R > dthr) & (B > 60)
    mm = np.zeros_like(m, bool)
    mm[FIELD['y0']:FIELD['y1'], FIELD['x0']:FIELD['x1']] = m[FIELD['y0']:FIELD['y1'], FIELD['x0']:FIELD['x1']]
    print('blue px', int(mm.sum()))
    bl = label(mm, amin)
    img = Image.fromarray(fr(k).astype(np.uint8))
    dr = ImageDraw.Draw(img)
    for n, (ar, x0, y0, x1, y1) in enumerate(bl):
        dr.rectangle([x0, y0, x1, y1], outline=(255, 0, 255))
        dr.text((x0, max(0, y0 - 9)), str(n), fill=(255, 255, 0))
    print('blobs', len(bl))
    for n, (ar, x0, y0, x1, y1) in enumerate(bl):
        print('%2d a=%5d (%3d,%3d)-(%3d,%3d) w=%3d h=%3d c=(%6.1f,%6.1f) bot=%d'
              % (n, ar, x0, y0, x1, y1, x1 - x0 + 1, y1 - y0 + 1, (x0 + x1) / 2, (y0 + y1) / 2, y1))
    img.save(os.path.join(OUT, 'blue_b%04d.png' % k))
