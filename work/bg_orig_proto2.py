# -*- coding: utf-8 -*-
"""离线原型 2：统一 1.04 缩放的“地平线带”（BG/MG/FG 同基线 y=200）"""
import os
from PIL import Image, ImageDraw

BG = r"F:\sanguo\export\png\SHAPE\BG"
TGA = r"F:\sanguo\export\png\tga"
OUT = r"F:\sanguo\work\bg_orig"
W, H = 750, 900
FIELD_TOP = 100
BASE = 200          # 地平线基线（整块带的底边）
K = 1.04            # 三层统一缩放
FADE = {"BG": 26, "MG": 16, "FG": 0}   # 各自底边淡出像素
TOPSHADOW = (100, 132, 0.55)           # 顶边压暗：从 100 起 32px 内 0.55 -> 0


def load(p):
    return Image.open(p).convert("RGBA")


def place(name, terrain, base=BASE, k=K):
    im = load(os.path.join(BG, f"{name}{terrain:02d}A.png"))
    w = round(im.width * k)
    h = round(im.height * k)
    im = im.resize((w, h), Image.LANCZOS)
    top = base - h
    fade = FADE[name]
    if fade:
        a = im.getchannel("A").point(lambda v: v)
        mask = Image.new("L", im.size, 255)
        px = mask.load()
        for y in range(h):
            ay = top + y
            cut = base - fade
            if ay <= cut:
                v = 255
            else:
                v = int(255 * max(0.0, 1 - (ay - cut) / fade))
            for x in range(w):
                px[x, y] = v
        im.putalpha(Image.composite(a, Image.new("L", im.size, 0), mask))
    if name == "BG" and TOPSHADOW:
        y0, y1, s = TOPSHADOW
        shr = Image.new("L", im.size, 0)
        p2 = shr.load()
        for y in range(h):
            ay = top + y
            if ay < y0:
                v = 255
            elif ay >= y1:
                v = 0
            else:
                v = int(255 * s * (1 - (ay - y0) / (y1 - y0)))
            for x in range(w):
                p2[x, y] = v
        im.alpha_composite(Image.merge("RGBA", [Image.new("L", im.size, 0)] * 3 + [shr]))
    return im, top


def paste_clip(canvas, im, x, y):
    """把 im 贴到 canvas 的 (x,y)，越界部分裁掉（PIL 的 alpha_composite 不支持负偏移）"""
    sx0 = max(0, -x)
    sy0 = max(0, -y)
    dx0 = max(0, x)
    dy0 = max(0, y)
    w = min(im.width - sx0, canvas.width - dx0)
    h = min(im.height - sy0, canvas.height - dy0)
    if w <= 0 or h <= 0:
        return canvas
    piece = im.crop((sx0, sy0, sx0 + w, sy0 + h))
    canvas.alpha_composite(piece, (dx0, dy0))
    return canvas


def band(terrain, include=("BG", "MG", "FG")):
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for name in ("BG", "MG", "FG"):
        if name not in include:
            continue
        im, top = place(name, terrain)
        # 水平居中放（未做平移，原型只看静态构图）
        x = (W - im.width) // 2
        paste_clip(out, im, x, top)
    return out


def floor(terrain, scale=0.5):
    src = load(os.path.join(TGA, f"SHAPE_BG_FLOOR{terrain:02d}.png"))
    side = round(512 * scale)
    t = src.resize((side, side), Image.LANCZOS)
    out = Image.new("RGBA", (W, H))
    for y in range(0, H, side):
        for x in range(0, W, side):
            out.paste(t, (x, y))
    return out


def compose(terrain, mode):
    img = floor(terrain)
    if mode == "b":
        img.alpha_composite(band(terrain))
    elif mode == "b2":
        img.alpha_composite(band(terrain, ("MG", "FG")))
    elif mode == "c":
        im, top = place("FG", terrain)
        sw = 240
        for sx, dx in ((0, 0), (im.width - sw, W - sw)):
            piece = im.crop((sx, 0, sx + sw, im.height))
            a = piece.getchannel("A").point(lambda v: int(v * 0.8))
            piece.putalpha(a)
            img.alpha_composite(piece, (dx, H - im.height - 40))
            img.alpha_composite(piece, (dx, FIELD_TOP - 40))
    return img


def grid(modes, fn, scale=0.36):
    cw, ch = int(W * scale), int(H * scale)
    sheet = Image.new("RGB", (cw * len(modes), ch * 3), (20, 20, 24))
    d = ImageDraw.Draw(sheet)
    for r in range(3):
        t = r * 4 + 1
        for c, m in enumerate(modes):
            im = compose(t, m)
            sheet.paste(im.convert("RGB").resize((cw, ch), Image.LANCZOS), (c * cw, r * ch))
            d.text((c * cw + 6, r * ch + 6), f"{m} t{t:02d}", fill=(255, 255, 0))
    sheet.save(os.path.join(OUT, fn))


grid(["a", "b", "b2"], "proto2_modes.png")
for t in (0, 4, 6, 8, 9, 11):
    compose(t, "b").convert("RGB").save(os.path.join(OUT, f"proto2_b_{t:02d}.png"))
compose(0, "c").convert("RGB").save(os.path.join(OUT, "proto2_c_00.png"))
print("ok")
