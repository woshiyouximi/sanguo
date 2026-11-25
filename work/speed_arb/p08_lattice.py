# p08_lattice.py -- 蓝甲掩码 -> 片段合并成"一个人的整体" -> 两两位移直方图 -> 求屏幕格矢
# 用法: p08_lattice.py <k> [dthr] [amin]
import sys, os, numpy as np, itertools, collections
from PIL import Image, ImageDraw
sys.path.insert(0, r'F:\sanguo\work\orig_motion')
from libimg import label

SRC = r'F:\sanguo\work\speed_arb\f30b\b%04d.png'
OUT = r'F:\sanguo\work\speed_arb'
FIELD = dict(x0=83, x1=560, y0=75, y1=249)


def men(k, dthr=35, amin=20, mdx=10, mdy=16):
    a = np.asarray(Image.open(SRC % k).convert('RGB')).astype(np.int16)
    R, B = a[..., 0], a[..., 2]
    m = (B - R > dthr) & (B > 60)
    mm = np.zeros_like(m, bool)
    mm[FIELD['y0']:FIELD['y1'], FIELD['x0']:FIELD['x1']] = m[FIELD['y0']:FIELD['y1'], FIELD['x0']:FIELD['x1']]
    bl = label(mm, amin)
    # 合并同一个小人的碎片
    boxes = [[ar, x0, y0, x1, y1] for (ar, x0, y0, x1, y1) in bl]
    changed = True
    while changed:
        changed = False
        for i, j in itertools.combinations(range(len(boxes)), 2):
            a1, ax0, ay0, ax1, ay1 = boxes[i]
            a2, bx0, by0, bx1, by1 = boxes[j]
            ci = ((ax0 + ax1) / 2, (ay0 + ay1) / 2)
            cj = ((bx0 + bx1) / 2, (by0 + by1) / 2)
            if abs(ci[0] - cj[0]) <= mdx and abs(ci[1] - cj[1]) <= mdy:
                boxes[i] = [a1 + a2, min(ax0, bx0), min(ay0, by0), max(ax1, bx1), max(ay1, by1)]
                boxes.pop(j)
                changed = True
                break
    boxes.sort(key=lambda b: b[1])
    return a.astype(np.uint8), boxes


if __name__ == '__main__':
    k = int(sys.argv[1])
    dthr = int(sys.argv[2]) if len(sys.argv) > 2 else 35
    amin = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    img, boxes = men(k, dthr, amin)
    print('frame b%04d  men=%d' % (k, len(boxes)))
    C = []
    for n, (ar, x0, y0, x1, y1) in enumerate(boxes):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        C.append((cx, cy))
        print('%2d a=%4d box=(%3d,%3d)-(%3d,%3d) w=%2d h=%2d c=(%6.1f,%6.1f)' %
              (n, ar, x0, y0, x1, y1, x1 - x0 + 1, y1 - y0 + 1, cx, cy))
    # 两两位移（有符号，取较近的一半）
    hist = collections.Counter()
    pairs = []
    for (p, q) in itertools.permutations(range(len(C)), 2):
        dx = C[q][0] - C[p][0]
        dy = C[q][1] - C[p][1]
        if dx <= 0 or abs(dx) > 200 or abs(dy) > 120:
            continue
        key = (int(round(dx)), int(round(dy)))
        hist[key] += 1
        pairs.append((p, q, dx, dy))
    print('\n-- 位移直方图 (dx>0, 只取最近 200x120 内), 出现>=2 次:')
    for key, n in hist.most_common(30):
        if n >= 2:
            print('   d=(%4d,%4d)  n=%d' % (key[0], key[1], n))
    # 画图
    im = Image.fromarray(img)
    dr = ImageDraw.Draw(im)
    for n, (ar, x0, y0, x1, y1) in enumerate(boxes):
        dr.rectangle([x0, y0, x1, y1], outline=(0, 255, 0))
        dr.text((x0, max(0, y0 - 8)), str(n), fill=(255, 255, 0))
    im.save(os.path.join(OUT, 'men_b%04d.png' % k))
