# 标定 cal.png 里的洋红方块，反推设计坐标 -> 屏幕像素 的映射
import sys
from PIL import Image
import numpy as np

path = sys.argv[1] if len(sys.argv) > 1 else r"F:\sanguo\work\cocos_layout\cal.png"
im = Image.open(path).convert("RGB")
a = np.asarray(im).astype(int)
H, W, _ = a.shape
print("image", W, "x", H)

# 洋红：R高 G低 B高
mask = (a[:, :, 0] > 200) & (a[:, :, 1] < 80) & (a[:, :, 2] > 200)
ys, xs = np.nonzero(mask)
print("magenta px", len(xs))
if len(xs) == 0:
    sys.exit("no marks found")

# 连通域（简单：按 x/y 聚类）
pts = sorted(zip(xs.tolist(), ys.tolist()))
groups = []
used = [False] * len(pts)
for i, (x, y) in enumerate(pts):
    if used[i]:
        continue
    stack = [i]
    used[i] = True
    comp = []
    while stack:
        j = stack.pop()
        xj, yj = pts[j]
        comp.append((xj, yj))
        for k in range(len(pts)):
            if used[k]:
                continue
            xk, yk = pts[k]
            if abs(xk - xj) <= 2 and abs(yk - yj) <= 2:
                used[k] = True
                stack.append(k)
    groups.append(comp)

boxes = []
for comp in groups:
    if len(comp) < 20:
        continue
    xs_ = [p[0] for p in comp]
    ys_ = [p[1] for p in comp]
    boxes.append((min(xs_), min(ys_), max(xs_), max(ys_), len(comp)))
boxes.sort(key=lambda b: (b[1], b[0]))
for b in boxes:
    print("mark box x[%d..%d] y[%d..%d] n=%d center=(%.1f,%.1f) size=%dx%d" %
          (b[0], b[2], b[1], b[3], b[4], (b[0] + b[2] + 1) / 2, (b[1] + b[3] + 1) / 2, b[2] - b[0] + 1, b[3] - b[1] + 1))
