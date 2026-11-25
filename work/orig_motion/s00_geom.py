# s00_geom.py -- 确定画面几何：战场矩形、HUD 边界、是否横向拉伸
# 输出: work/orig_motion/out/geom.txt  + 若干放大裁剪图
# 用法: python s00_geom.py
import os
import numpy as np
from PIL import Image

ROOT = r'F:\sanguo\work\orig_motion'
OUT = os.path.join(ROOT, 'out')
os.makedirs(OUT, exist_ok=True)

F62 = os.path.join(ROOT, 'f30', 'f0062.png')   # = 08:36.000 = fps10_001


def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.int16)


def main():
    a = load(F62)
    H, W, _ = a.shape
    lines = []
    lines.append('frame %s  size %dx%d' % (os.path.basename(F62), W, H))

    # ---- 1. 地面（战场）区域：找"土黄"像素的行/列覆盖 ----
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    groundish = (r > 90) & (r < 190) & (g > 70) & (g < 160) & (b < 130) & (r > b + 25)
    colcov = groundish.mean(axis=0)
    rowcov = groundish.mean(axis=1)
    cols = np.where(colcov > 0.5)[0]
    rows = np.where(rowcov > 0.5)[0]
    lines.append('ground cols %d..%d  rows %d..%d' % (cols.min(), cols.max(), rows.min(), rows.max()))

    # ---- 2. HUD 顶边：自下而上找第一条"暗色占比高"的行 ----
    dark = (a.sum(axis=2) < 240)
    darkrow = dark.mean(axis=1)
    hud_top = None
    for y in range(H - 1, 0, -1):
        if darkrow[y] > 0.55:
            hud_top = y
        elif hud_top is not None and y < hud_top - 40:
            break
    lines.append('hud_top(row where dark>55%% starts, scanned up) = %s  darkrow@%s=%.2f' %
                 (hud_top, hud_top, darkrow[hud_top] if hud_top else -1))

    # ---- 3. 兵符方框（HUD 正中偏下的黑框）：找近黑连通块的 bbox ----
    blackish = (r < 45) & (g < 45) & (b < 45)
    # 限制在 HUD 区域中段
    sub = blackish[300:360, 240:400]
    ys, xs = np.nonzero(sub)
    if len(xs):
        bx0, bx1 = xs.min() + 240, xs.max() + 240
        by0, by1 = ys.min() + 300, ys.max() + 300
        lines.append('black box bbox x %d..%d (w=%d) y %d..%d (h=%d)  aspect w/h=%.3f' %
                     (bx0, bx1, bx1 - bx0 + 1, by0, by1, by1 - by0 + 1,
                      (bx1 - bx0 + 1) / (by1 - by0 + 1)))

    # ---- 4. 头像框宽度（左右两张立绘的边框）----
    #      立绘区在 y 280..350，找非战场色的连通块宽度
    lines.append('')
    lines.append('--- 供参考：整帧分区猜测 ---')
    lines.append('field x[%d..%d] y[%d..%d]' % (cols.min(), cols.max(), rows.min(), rows.max()))

    with open(os.path.join(OUT, 'geom.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))

    # ---- 5. 放大裁剪：主将、士兵、HUD 中央 ----
    crops = {
        'zoom_general_f0062': (230, 100, 340, 190),
        'zoom_hud_center': (240, 290, 400, 360),
        'zoom_field_left': (85, 100, 220, 200),
    }
    for name, (x0, y0, x1, y1) in crops.items():
        c = Image.open(F62).convert('RGB').crop((x0, y0, x1, y1))
        c = c.resize((c.width * 4, c.height * 4), Image.NEAREST)
        c.save(os.path.join(OUT, name + '.png'))


if __name__ == '__main__':
    main()
