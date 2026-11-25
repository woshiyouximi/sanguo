"""按區域統計色數（與 work/cocos_render3/cstat.py 同口徑：半分辨率 + NEAREST + >=8 次）。

用法：python region_cstat.py <png> [--scale 0.5]
輸出每個區域的 >=8 色數、該區域像素數；再印全頁數字對照。
區域矩形是設計座標（750x1334），截圖寬若不是 750 會按比例縮放。
"""
import sys
from collections import Counter
from PIL import Image

DESIGN_W, DESIGN_H = 750, 1334

REGIONS = [
    ('header', (0, 0, 750, 124)),
    ('card_main_whole', (16, 136, 734, 302)),
    ('card_main_empty_right', (300, 136, 734, 302)),
    ('card_gen_whole', (16, 336, 734, 464)),
    ('card_gen_empty_right', (368, 336, 734, 464)),
    ('card_troop_whole', (16, 500, 734, 688)),
    ('card_troop_gaps', (16, 640, 734, 688)),
    ('card_form_whole', (16, 724, 734, 856)),
    ('card_wise_whole', (16, 884, 734, 1000)),
    ('card_wise_empty', (200, 884, 734, 1000)),
    ('card_power_whole', (16, 1040, 734, 1160)),
    ('card_power_empty', (16, 1112, 734, 1146)),
    ('queue_bar', (24, 1150, 702, 1186)),
    ('footer', (0, 1194, 750, 1334)),
    ('bg_between_cards', (0, 1160, 750, 1194)),
    ('portrait', (24, 150, 144, 300)),
]


def count(img):
    px = img.load()
    w, h = img.size
    c = Counter()
    for y in range(h):
        for x in range(w):
            c[px[x, y]] += 1
    return c


def main():
    path = sys.argv[1]
    img = Image.open(path).convert('RGB')
    W, H = img.size
    k = W / DESIGN_W
    half = img.resize((max(1, W // 2), max(1, H // 2)), Image.NEAREST)
    total = count(half)
    print(f'{path}  {W}x{H}  half={half.size[0]}x{half.size[1]}')
    print(f'PAGE  >=8: d2={sum(1 for v in total.values() if v >= 8)}  uniq={len(total)}  px={W*H}')
    hw, hh = half.size
    for name, (x0, y0, x1, y1) in REGIONS:
        box = (int(x0 * k / 2), int(y0 * k / 2), int(x1 * k / 2), int(y1 * k / 2))
        box = (max(0, box[0]), max(0, box[1]), min(hw, box[2]), min(hh, box[3]))
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        sub = half.crop(box)
        c = count(sub)
        print(f'  {name:24s} >=8: {sum(1 for v in c.values() if v >= 8):5d}  uniq: {len(c):5d}  px: {sub.size[0]*sub.size[1]:6d}')


if __name__ == '__main__':
    main()
