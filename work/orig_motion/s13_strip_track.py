# s13_strip_track.py -- 跟踪一个单位并把每一帧放大拼成连续条带（人工读动作周期），
# 同时打印每帧的运动能量 = 以该单位为中心的窗口与前一帧的平均绝对差
# 用法: python s13_strip_track.py <f0> <f1> <cx> <cy> <hw> <hh> [name] [zoom] [box]
import sys
import numpy as np
from PIL import Image, ImageDraw
from libimg import frame, OUT
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from s09_track_unit import match


def main():
    f0, f1 = int(sys.argv[1]), int(sys.argv[2])
    cx, cy = int(sys.argv[3]), int(sys.argv[4])
    hw, hh = int(sys.argv[5]), int(sys.argv[6])
    name = sys.argv[7] if len(sys.argv) > 7 else 'strip'
    zoom = int(sys.argv[8]) if len(sys.argv) > 8 else 4
    box = int(sys.argv[9]) if len(sys.argv) > 9 else 80

    F = frame(f0)
    tpl = F[cy - hh:cy + hh, cx - hw:cx + hw].copy()
    tiles = []
    prev = None
    print('i,cx,cy,ncc,motion_energy')
    cx0, cy0 = cx, cy
    for i in range(f0, f1 + 1):
        fr = frame(i)
        s, nx, ny = match(fr, tpl, cx, cy, 12, 8)
        if s < 0.45:
            s2, nx2, ny2 = match(fr, tpl, cx, cy, 36, 20)
            if s2 > s:
                s, nx, ny = s2, nx2, ny2
        cx, cy = nx, ny
        x0 = max(0, cx - box // 2); y0 = max(0, cy - box // 2)
        crop = fr[y0:y0 + box, x0:x0 + box]
        me = -1.0
        if prev is not None and prev.shape == crop.shape:
            me = float(np.abs(crop.astype(np.int16) - prev.astype(np.int16)).mean())
        prev = crop
        print('%d,%d,%d,%.3f,%.2f' % (i, cx, cy, s, me))
        im = Image.fromarray(crop).resize((box * zoom, box * zoom), Image.NEAREST)
        d = ImageDraw.Draw(im)
        d.text((3, 2), 'f%04d' % i, fill=(0, 255, 0))
        d.rectangle([box * zoom // 2 - hw * zoom, box * zoom // 2 - hh * zoom,
                     box * zoom // 2 + hw * zoom, box * zoom // 2 + hh * zoom], outline=(0, 255, 255))
        tiles.append(im)
    cols = 5
    rows = (len(tiles) + cols - 1) // cols
    W, H = box * zoom, box * zoom
    sheet = Image.new('RGB', (W * cols, H * rows), (0, 0, 0))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % cols) * W, (k // cols) * H))
    p = os.path.join(OUT, name + '.png')
    sheet.save(p)
    print('wrote', p, sheet.size)


if __name__ == '__main__':
    main()
