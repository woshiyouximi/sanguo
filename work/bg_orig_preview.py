# -*- coding: utf-8 -*-
"""生成 A/B 对照与三层叠加预览，供肉眼判断 A/B 关系与地平线高度"""
import os
from PIL import Image, ImageDraw

BG = r"F:\sanguo\export\png\SHAPE\BG"
TGA = r"F:\sanguo\export\png\tga"
OUT = r"F:\sanguo\work\bg_orig"
os.makedirs(OUT, exist_ok=True)


def load(name):
    return Image.open(os.path.join(BG, name)).convert("RGBA")


def tile_h(im, w):
    """横向平铺到宽 w"""
    out = Image.new("RGBA", (w, im.height), (0, 0, 0, 0))
    x = 0
    while x < w:
        out.paste(im, (x, 0), im)
        x += im.width
    return out


# 1) 单套三层叠加预览（原作图：BG 在最上、往下 MG、FG，再往下地面）
for t in (0, 3, 4, 6, 8, 9):
    W = 1000
    canvas = Image.new("RGBA", (W, 420), (24, 26, 32, 255))
    sky = load(f"BG{t:02d}A.png")
    mg = load(f"MG{t:02d}A.png")
    fg = load(f"FG{t:02d}A.png")
    floor = Image.open(os.path.join(TGA, f"SHAPE_BG_FLOOR{t:02d}.png")).convert("RGBA")
    # 天空（BG 顶部补一段渐变，模拟原作天空）
    for y in range(0, 160):
        k = y / 160
        canvas.paste(Image.new("RGBA", (W, 1), (int(60 + 40 * k), int(70 + 30 * k), int(90 + 20 * k), 255)), (0, y))
    canvas.alpha_composite(tile_h(sky, W), (0, 40))
    canvas.alpha_composite(tile_h(mg, W), (0, 90))
    canvas.alpha_composite(tile_h(fg, W), (0, 130))
    # 地面：从 y=226 起平铺
    fl = floor.resize((256, 256), Image.LANCZOS)
    fy = 226
    for yy in range(fy, 420, 256):
        for xx in range(0, W, 256):
            canvas.paste(fl, (xx, yy))
    ImageDraw.Draw(canvas).text((8, 8), f"terrain {t:02d}  BG@40 MG@90 FG@130 floor@226", fill=(255, 255, 0, 255))
    canvas.convert("RGB").save(os.path.join(OUT, f"stack_{t:02d}.png"))

# 2) A/B 对照条：A 上 B 下，并在 B 之后接 A，看接缝
for t in (0, 4, 8, 10):
    for layer in ("BG", "MG", "FG"):
        a = load(f"{layer}{t:02d}A.png")
        b = load(f"{layer}{t:02d}B.png")
        W = a.width
        c = Image.new("RGBA", (W * 2, 96 * 2 + 8), (40, 40, 40, 255))
        c.paste(a, (0, 0), a)
        c.paste(b, (W, 0), b)
        # 第二行：B 后接 A（B|A 接缝）
        c.paste(b, (0, 104), b)
        c.paste(a, (W, 104), a)
        c.convert("RGB").save(os.path.join(OUT, f"ab_{layer}{t:02d}.png"))
print("ok")
