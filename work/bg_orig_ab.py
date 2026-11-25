# -*- coding: utf-8 -*-
"""A/B 关系定量判定 + 三层素材总览图"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

BG = r"F:\sanguo\export\png\SHAPE\BG"
TGA = r"F:\sanguo\export\png\tga"
OUT = r"F:\sanguo\work\bg_orig"
os.makedirs(OUT, exist_ok=True)
rep = []


def load(name):
    return Image.open(os.path.join(BG, name)).convert("RGBA")


def arr(im):
    return np.asarray(im).astype(np.float32)


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def corr(x, y):
    x = x - x.mean()
    y = y - y.mean()
    d = np.sqrt((x * x).sum() * (y * y).sum())
    return float((x * y).sum() / d) if d > 1e-6 else 0.0


rep.append("== 1. 图层尺寸 / 与 640x410 视口的余量 ==")
for t in range(12):
    sizes = []
    for layer in ("BG", "MG", "FG"):
        im = load(f"{layer}{t:02d}A.png")
        sizes.append(f"{layer}={im.width}x{im.height}")
    rep.append(f"t{t:02d} " + " ".join(sizes))

rep.append("")
rep.append("== 2. A/B alpha 掩膜 IoU（1.0=几何完全相同）与 RGB 相关性 ==")
for t in range(12):
    line = [f"t{t:02d}"]
    for layer in ("BG", "MG", "FG"):
        a = arr(load(f"{layer}{t:02d}A.png"))
        b = arr(load(f"{layer}{t:02d}B.png"))
        ma, mb = a[..., 3] > 8, b[..., 3] > 8
        inter = (ma & mb).sum()
        uni = (ma | mb).sum()
        iou = inter / uni if uni else 0.0
        both = ma & mb
        c = corr(lum(a)[both], lum(b)[both]) if both.sum() > 100 else float("nan")
        dmean = float(np.abs(a[..., :3][both] - b[..., :3][both]).mean()) if both.sum() > 100 else float("nan")
        line.append(f"{layer} iou={iou:.3f} corr={c:.3f} dRGB={dmean:.1f}")
    rep.append(" | ".join(line))

rep.append("")
rep.append("== 3. 天顶 12 行平均色 A vs B（1 不透明天空层）==")
for t in range(12):
    a = arr(load(f"BG{t:02d}A.png"))[:12, :, :3].mean(axis=(0, 1))
    b = arr(load(f"BG{t:02d}B.png"))[:12, :, :3].mean(axis=(0, 1))
    rep.append(f"t{t:02d} A=({a[0]:.0f},{a[1]:.0f},{a[2]:.0f}) B=({b[0]:.0f},{b[1]:.0f},{b[2]:.0f}) "
               f"dL={lum(a.reshape(1,1,3))[0,0]-lum(b.reshape(1,1,3))[0,0]:+.0f}")

rep.append("")
rep.append("== 4. 对照组：不同地形 BG00A vs BG01A / BG04A ==")
a0 = arr(load("BG00A.png"))
for other in ("BG01A.png", "BG04A.png"):
    o = arr(load(other))
    rep.append(f"BG00A vs {other}: corr={corr(lum(a0).ravel(), lum(o).ravel()):.3f}")

rep.append("")
rep.append("== 5. alpha=0 的空白行分布（每层内容占几行）==")
for t in (0, 3, 4, 6, 8, 9):
    for layer in ("MG", "FG"):
        a = arr(load(f"{layer}{t:02d}A.png"))
        rows = (a[..., 3] > 8).sum(axis=1)
        nz = np.nonzero(rows)[0]
        rng = f"{nz.min()}..{nz.max()}" if len(nz) else "empty"
        rep.append(f"t{t:02d}{layer} rows={rng} 覆盖率={(rows>0).sum()}/{a.shape[0]}")

# ---- 总览图：12 地形的 MG / FG 各一条，压到 0.5 宽 ----
def sheet(layer, fn):
    W = 500
    rows = []
    for t in range(12):
        im = load(f"{layer}{t:02d}A.png").resize((W, 48), Image.LANCZOS)
        band = Image.new("RGBA", (W + 46, 48), (255, 0, 255, 255))
        band.alpha_composite(im, (46, 0))
        ImageDraw.Draw(band).text((4, 16), f"{layer}{t:02d}", fill=(255, 255, 255, 255))
        rows.append(band)
    out = Image.new("RGBA", (W + 46, 48 * 12), (255, 0, 255, 255))
    for i, r in enumerate(rows):
        out.alpha_composite(r, (0, i * 48))
    out.convert("RGB").save(os.path.join(OUT, fn))


sheet("MG", "sheet_MG.png")
sheet("FG", "sheet_FG.png")

open(os.path.join(OUT, "analyze2.txt"), "w", encoding="utf-8").write("\n".join(rep))
print("ok")
