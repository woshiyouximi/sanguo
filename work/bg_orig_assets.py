# -*- coding: utf-8 -*-
"""
A2 资产管线：把原作素材烘焙成运行时直接 1:1 贴的 PNG。

输出 F:\\sanguo\\game\\web\\assets\\bg\\orig\\：
  floor00..11.png  256x256 RGB   512x512 地面 ×0.5（一张 tile 落在 3.6 行 ≈ 257px）
  bg00..11.png     759x100  RGBA BG 条 ×1.04 + 顶边压暗 + 底边淡出
  mg00..11.png     915x100  RGBA MG 条 ×1.04 + 底边淡出
  fg00..11.png    1040x100  RGBA FG 条 ×1.04（近景不淡出，底边就是地平线）
布局口径（与 game/src/view/battleBg.ts 的常量一一对应）：
  BAND_SCALE=1.04  BAND_H=100  BAND_TOP=100  BAND_BASE=200
  BG_FADE=26  MG_FADE=16  FG_FADE=0  TOPSHADOW=(100,132,0.55)
"""
import os
import numpy as np
from PIL import Image

SRC_BG = r"F:\sanguo\export\png\SHAPE\BG"
SRC_TGA = r"F:\sanguo\export\png\tga"
DST = r"F:\sanguo\game\web\assets\bg\orig"
os.makedirs(DST, exist_ok=True)

FLOOR_SCALE = 0.5
BAND_SCALE = 1.04
BAND_H = round(96 * BAND_SCALE)      # 100
BAND_TOP = 100
BAND_BASE = 200
FADE = {"BG": 26, "MG": 16, "FG": 0}
TOPSHADOW = (100, 124, 0.28)
# 原作是 RGB555 素材；烘焙后再量化到 5/6 bit 只是去掉重采样引入的抖动，肉眼几乎无损，
# 但 PNG 体积能掉一半（BG 的天空用 6bit 以免出现色带）
BITS = {"floor": 5, "BG": 6, "MG": 5, "FG": 5}


def posterize(im, bits):
    step = 2 ** (8 - bits)
    a = np.asarray(im).astype(np.uint16)
    rgb = (np.round(a[..., :3] / step) * step).clip(0, 255).astype(np.uint8)
    if a.shape[2] == 4:
        out = np.dstack([rgb, a[..., 3].astype(np.uint8)])
        return Image.fromarray(out, "RGBA")
    return Image.fromarray(rgb, "RGB")


def load(p):
    return Image.open(p).convert("RGBA")


def alpha_bottom_fade(im, fade_px):
    """底边 fade_px 行内 alpha 线性 1->0（层顶就是 BAND_TOP）"""
    if fade_px <= 0:
        return im
    h = im.height
    a = im.getchannel("A")
    px = a.load()
    cut = h - fade_px
    for y in range(h):
        if y <= cut:
            continue
        k = 1.0 - (y - cut) / fade_px
        if k >= 1:
            continue
        for x in range(im.width):
            px[x, y] = int(px[x, y] * k)
    im.putalpha(a)
    return im


def top_shadow(im, y0, y1, strength):
    h = im.height
    sh = Image.new("L", im.size, 0)
    px = sh.load()
    for y in range(h):
        ay = BAND_TOP + y
        if ay < y0:
            v = strength
        elif ay >= y1:
            v = 0.0
        else:
            v = strength * (1 - (ay - y0) / (y1 - y0))
        if v > 0:
            row = int(round(v * 255))
            for x in range(im.width):
                px[x, y] = row
    black = Image.new("RGBA", im.size, (0, 0, 0, 0))
    black.putalpha(sh)
    return Image.alpha_composite(background=im, foreground=black) if False else _over(im, black)


def _over(dst, src):
    out = dst.copy()
    out.alpha_composite(src)
    return out


manifest = []
for t in range(12):
    # 地面：512 -> 256（0.5 缩放烘焙进资产）
    f = load(os.path.join(SRC_TGA, f"SHAPE_BG_FLOOR{t:02d}.png")).convert("RGB")
    side = round(f.width * FLOOR_SCALE)
    f = posterize(f.resize((side, side), Image.LANCZOS), BITS["floor"])
    p = os.path.join(DST, f"floor{t:02d}.png")
    f.save(p, optimize=True, compress_level=9)
    manifest.append(("floor", t, side, side, os.path.getsize(p)))

    for layer in ("BG", "MG", "FG"):
        im = load(os.path.join(SRC_BG, f"{layer}{t:02d}A.png"))
        w = round(im.width * BAND_SCALE)
        im = im.resize((w, BAND_H), Image.LANCZOS)
        assert im.height == BAND_H, (layer, t, im.height)
        if layer == "BG":
            im = top_shadow(im, *TOPSHADOW)
        im = alpha_bottom_fade(im, FADE[layer])
        im = posterize(im, BITS[layer])
        p = os.path.join(DST, f"{layer.lower()}{t:02d}.png")
        im.save(p, optimize=True, compress_level=9)
        manifest.append((layer, t, im.width, im.height, os.path.getsize(p)))

total = sum(m[4] for m in manifest)
lines = [f"{m[0]}{m[1]:02d}.png {m[2]}x{m[3]} {m[4]}B" for m in manifest]
lines.append("")
lines.append(f"files={len(manifest)} total={total}B = {total/1048576:.2f}MB")
for grp in ("floor", "BG", "MG", "FG"):
    s = sum(m[4] for m in manifest if m[0] == grp)
    lines.append(f"  {grp}: {s/1024:.1f}KB")
open(r"F:\sanguo\work\bg_orig\assets_manifest.txt", "w", encoding="utf-8").write("\n".join(lines))
print("\n".join(lines[-6:]))
