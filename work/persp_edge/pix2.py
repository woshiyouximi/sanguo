r"""work/persp_edge/pix2.py —— 截图像素判定 v2（只读）。

v1 的教训：用「暗像素比例」找面板上沿会误判——草地本身就有大片暗绿（r+g+b≈170）。
改用**行间差**找面板顶边的硬边：控制台上沿是一条贯穿全宽的边框，行均值突变远大于草地纹理。
"""
import json
import os
import sys

from PIL import Image

ROOT = r"F:\sanguo\work\persp_edge"
DESIGN_W, DESIGN_H = 750.0, 1334.0
meta = json.load(open(os.path.join(ROOT, "units.json"), encoding="utf-8"))


def rowdiff_edge(im, y0=930, y1=1050):
    px = im.convert("RGB").load()
    w, h = im.size
    xs = list(range(10, w - 10, 5))

    def rowmean(y):
        acc = [0, 0, 0]
        for x in xs:
            r, g, b = px[x, y]
            acc[0] += r
            acc[1] += g
            acc[2] += b
        n = len(xs)
        return acc[0] / n, acc[1] / n, acc[2] / n

    means = {y: rowmean(y) for y in range(y0, min(h, y1 + 1))}

    def dist(a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])

    best = max(range(y0, min(h, y1)), key=lambda y: dist(means[y], means[y + 1]))
    return best, dist(means[best], means[best + 1]), means


print("== 面板上沿（行间差峰值） ==")
edges = {}
for s in meta["shots"]:
    im = Image.open(s["file"]).convert("RGB")
    y_img, d, means = rowdiff_edge(im)
    scale_y = im.size[1] / DESIGN_H
    design = y_img / scale_y
    above, below = means[y_img - 3], means[y_img + 6]
    edges[s["name"]] = (y_img, design)
    print(f"{s['name']:18s} 图像 y={y_img} → 设计 y={design:7.2f}  行差={d:6.1f}  上方rgb={tuple(round(v) for v in above)} 下方rgb={tuple(round(v) for v in below)}")

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
        samples = []
        for dy in (-8, -6, -4, -2):
            y = int(round(fy + dy))
            if not (0 <= y < h):
                continue
            for dx in (-4, -2, 0, 2, 4):
                x = int(round(u["sx"] * scale_x + dx))
                if 0 <= x < w:
                    samples.append(px[x, y])
        gy_ = int(round(fy - 14))
        ground = px[int(round(u["sx"] * scale_x)), gy_] if 0 <= gy_ < h else (0, 0, 0)
        dev = max(abs(c[0] - ground[0]) + abs(c[1] - ground[1]) + abs(c[2] - ground[2]) for c in samples) if samples else 0
        ok = u["foot"] <= 1000.0 and fy < y_img and dev > 40
        if not ok:
            bad += 1
        print(f"   gx={u['gx']:2d} gy={u['gy']:2d} sy={u['sy']:7.2f} scale={u['scale']:.4f} 脚底={u['foot']:7.2f} "
              f"图像脚底线={fy:7.2f} 面板线={y_img} 与地面色差={dev:3d} {'OK' if ok else 'FAIL'}")

print(f"\n带内单位失败数 = {bad}")

# ---- 出剪裁图：给报告和肉眼核对用 ----
print("\n== 剪裁 ==")
crops = {
    # 设计 y 930..1010（跨控制台上沿），2x 放大
    "crop_bottom": (940, 1012, 2),
    # 设计 y 90..260（最远排头顶 + HUD 上沿），2x
    "crop_top": (88, 262, 2),
}
for s in meta["shots"]:
    im = Image.open(s["file"]).convert("RGB")
    scale_y = im.size[1] / DESIGN_H
    for name, (a, b, z) in crops.items():
        box = (0, max(0, int(a * scale_y)), im.size[0], min(im.size[1], int(b * scale_y)))
        part = im.crop(box).resize(((box[2] - box[0]) * z, (box[3] - box[1]) * z), Image.NEAREST)
        out = os.path.join(ROOT, f"{s['name']}_{name}.png")
        part.save(out)
        print(f"  {out}  {part.size[0]}x{part.size[1]}")

sys.exit(1 if bad else 0)
