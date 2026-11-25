r"""work/persp_edge/pix3.py —— 上沿定位 + 最远排头顶判定（只读）。"""
import json
import os

from PIL import Image

ROOT = r"F:\sanguo\work\persp_edge"
DESIGN_W, DESIGN_H = 750.0, 1334.0
meta = json.load(open(os.path.join(ROOT, "units.json"), encoding="utf-8"))

# 1) 面板上沿：设计 990..1035 逐行均值，找第一行「整行明显变暗且持续变暗」的位置
print("== 控制台面板上沿（逐行均值，设计坐标） ==")
for s in meta["shots"][:1]:
    im = Image.open(s["file"]).convert("RGB")
    h = im.size[1]
    sy = h / DESIGN_H
    px = im.load()
    w = im.size[0]
    for d in range(988, 1036):
        y = min(h - 1, int(round(d * sy)))
        xs = range(10, w - 10, 5)
        m = [sum(px[x, y][i] for x in xs) / len(xs) for i in range(3)]
        dark = sum(1 for x in xs if sum(px[x, y]) < 150) / len(list(xs))
        print(f"  设计 y={d}  图像 y={y}  均值=({m[0]:5.1f},{m[1]:5.1f},{m[2]:5.1f})  很暗像素占比={dark:.2f}")

# 2) 最远排（gx=0）头顶：
print("\n== cam_min 最远排 gx=0 的头顶 ==")
s = next(s for s in meta["shots"] if s["name"] == "cam_min")
im = Image.open(s["file"]).convert("RGB")
px = im.load()
w, h = im.size
scale_x, scale_y = w / DESIGN_W, h / DESIGN_H
u = next(u for u in s["units"] if u["gx"] == 0)
sx = u["sx"] * scale_x
# 天空是亮蓝（B 分量高），单位/地形是低蓝高红绿。逐行在 sx±28 内找第一个「非天空」像素
top = None
for d in range(96, 200):
    y = int(round(d * scale_y))
    if not (0 <= y < h):
        continue
    hits = 0
    for x in range(int(sx) - 28, int(sx) + 28):
        if 0 <= x < w:
            r, g, b = px[x, y]
            if b < 150 and (r + g + b) < 420:  # 天空蓝 b>=170；岩石/士兵低于此
                hits += 1
    if hits >= 2:
        top = d
        print(f"  设计 y={d}: 非天空像素 {hits}/56  ← 精灵最高行")
        break
print(f"  gx=0 sx={u['sx']:.2f} sy={u['sy']:.2f} scale={u['scale']:.4f} 脚底={u['foot']:.2f} "
      f"按 106 帧高推算头顶={u['foot'] - 106 * u['scale']:.2f}  实测精灵最高行={top}")
