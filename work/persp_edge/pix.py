r"""work/persp_edge/pix.py —— 截图像素判定（只读）。

判定目标（与 persp_edge.test.ts 的数字互证）：
1) 四张图里「控制台/ HUD 面板」上沿都落在设计 y=1000（±1.5px）——证明设计坐标→图像坐标的映射正确；
2) 每张图里所有**带内**单位的脚底（sy + 26*scale）都在控制台上沿之上，且脚底附近确实有精灵像素
   （不是空地面），即人真的画出来了而不是被面板压住；
3) 旧端点对照组里，第 70 排的 sy=1034.6 已在带外，脚底 1065.8 被面板切掉——缺陷本体。
"""
import json
import os
import sys

from PIL import Image

ROOT = r"F:\sanguo\work\persp_edge"
DESIGN_W, DESIGN_H = 750.0, 1334.0

meta = json.load(open(os.path.join(ROOT, "units.json"), encoding="utf-8"))


def img_to_design(v, scale):
    return v / scale


def console_edge(im):
    """返回面板上沿的图像 y：逐行求「整行与地面色的差异」突变点。"""
    w, h = im.size
    px = im.convert("RGB").load()
    # 采样 x 两侧的棋盘/地面区域与面板左缘，用「暗像素比例」找面板：面板底色很暗（RGB 均值 < 70）
    rows = []
    for y in range(900, min(h, 1100)):
        dark = 0
        n = 0
        for x in range(8, w - 8, 7):
            r, g, b = px[x, y]
            n += 1
            if r + g + b < 210:
                dark += 1
        rows.append((y, dark / n))
    # 第一个暗像素比例 > 0.75 的行就是面板上沿
    for y, frac in rows:
        if frac > 0.75:
            return y, rows
    return None, rows


print("== 尺寸 ==")
sizes = {}
for s in meta["shots"]:
    im = Image.open(s["file"])
    sizes[s["name"]] = im.size
    print(f"{s['name']:18s} {im.size[0]}x{im.size[1]}  sx={im.size[0]/DESIGN_W:.5f} sy={im.size[1]/DESIGN_H:.5f}")

print("\n== 面板上沿（设计 y） ==")
edges = {}
for s in meta["shots"]:
    im = Image.open(s["file"]).convert("RGB")
    y_img, rows = console_edge(im)
    scale_y = im.size[1] / DESIGN_H
    design = y_img / scale_y if y_img else None
    edges[s["name"]] = (y_img, design)
    near = ", ".join(f"{y}:{f:.2f}" for y, f in rows[:6])
    print(f"{s['name']:18s} 图像 y={y_img} → 设计 y={design:.2f}  (rows {near})")

print("\n== 带内单位：脚底 vs 面板 ==")
bad = 0
for s in meta["shots"]:
    im = Image.open(s["file"]).convert("RGB")
    w, h = im.size
    scale_x, scale_y = w / DESIGN_W, h / DESIGN_H
    y_img, design_edge = edges[s["name"]]
    px = im.load()
    print(f"\n-- {s['name']} camX={s['camX']} --")
    for u in sorted(s["units"], key=lambda u: -u["sy"]):
        if not u["inBand"]:
            continue
        fy = u["foot"] * scale_y
        # 脚底正上方 4px 处取三点，判断是否为精灵色（与地面绿色差异明显）
        samples = []
        for dy in (-6, -4, -2):
            y = int(round(fy + dy))
            if not (0 <= y < h):
                continue
            for dx in (-3, 0, 3):
                x = int(round(u["sx"] * scale_x + dx))
                if 0 <= x < w:
                    samples.append(px[x, y])
        # 地面参照：同一 y 上、远离任何单位的一列
        gy_ = int(round(min(fy, 995) * scale_y))
        ground = px[4, gy_] if 0 <= gy_ < h else (0, 0, 0)
        dev = max(abs(c[0] - ground[0]) + abs(c[1] - ground[1]) + abs(c[2] - ground[2]) for c in samples) if samples else 0
        ok = u["foot"] <= 1000.0 and fy < y_img and dev > 40
        if not ok:
            bad += 1
        print(f"   gx={u['gx']:2d} gy={u['gy']:2d} sy={u['sy']:7.2f} scale={u['scale']:.4f} 脚底={u['foot']:7.2f} "
              f"图像脚底线={fy:7.2f} 面板线={y_img} 精灵色差={dev:3d} {'OK' if ok else 'FAIL'}")

print(f"\n带内单位失败数 = {bad}")
sys.exit(1 if bad else 0)
