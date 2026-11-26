"""分析设备截图：找 UI 元素的行/列位置，反推设计坐标映射。"""
import sys
from PIL import Image
import numpy as np

path = sys.argv[1]
im = Image.open(path).convert('RGB')
a = np.asarray(im).astype(np.int32)
h, w, _ = a.shape
print('size', w, h)

# 亮度
lum = a.sum(axis=2) / 3.0

# 金色（约 #D8B36A / #F2DCA8 类）：r>g>b 且 r 明显高
r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
gold = (r > 120) & (r > b + 30) & (g > b + 10) & (r >= g - 10)
# 亮像素（文字）
bright = lum > 150

def runs(mask, min_len=2):
    out = []
    start = None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i - 1, i - start))
            start = None
    if start is not None and len(mask) - start >= min_len:
        out.append((start, len(mask) - 1, len(mask) - start))
    return out

# 每行金色像素数
grow = gold.sum(axis=1)
brow = bright.sum(axis=1)
print('\n== rows with many gold px (>=200) ==')
for s, e, ln in runs(grow >= 200, 1):
    print(f'y {s:4d}..{e:4d} len {ln:4d} peak {int(grow[s:e+1].max())}')
print('\n== rows with many bright px (>=100) ==')
for s, e, ln in runs(brow >= 100, 1):
    print(f'y {s:4d}..{e:4d} len {ln:4d} peak {int(brow[s:e+1].max())}')

# 每列金色像素数（找竖线/按钮边）
gcol = gold.sum(axis=0)
print('\n== cols with many gold px (>=200) ==')
for s, e, ln in runs(gcol >= 200, 1):
    print(f'x {s:4d}..{e:4d} len {ln:4d} peak {int(gcol[s:e+1].max())}')

# 打印若干高度区间的金色列分布（按钮边框）
def col_profile(y0, y1, min_peak=20):
    seg = gold[y0:y1, :].sum(axis=0)
    print(f'\n== gold col profile rows {y0}..{y1} (peak>={min_peak}) ==')
    for s, e, ln in runs(seg >= min_peak, 1):
        print(f'x {s:4d}..{e:4d} len {ln:4d} peak {int(seg[s:e+1].max())}')

if len(sys.argv) > 2:
    for spec in sys.argv[2:]:
        y0, y1 = [int(v) for v in spec.split(':')]
        col_profile(y0, y1)
