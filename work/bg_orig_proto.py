# -*- coding: utf-8 -*-
"""离线原型：在 750x900 的战场矩形里试排 (a) 纯地面 (b) 地面+远景带 (c) 地面+四角框景"""
import os
from PIL import Image, ImageDraw

BG = r"F:\sanguo\export\png\SHAPE\BG"
TGA = r"F:\sanguo\export\png\tga"
OUT = r"F:\sanguo\work\bg_orig"
W, H = 750, 900
FIELD_TOP = 100

# 候选布局（像素）
BAND = dict(
    bg_h=78, mg_h=62, fg_h=54,
    bg_top=FIELD_TOP,          # 100..178
    bg_fade=(146, 180),
    mg_bottom=FIELD_TOP + 88,  # 126..188
    mg_fade=(156, 190),
    fg_bottom=FIELD_TOP + 100,  # 146..200
    fg_fade=None,               # 近景剪影不淡出，底部就是地面接触线
)


def load(p):
    return Image.open(p).convert("RGBA")


def scale_to_h(im, h):
    w = round(im.width * h / im.height)
    return im.resize((w, h), Image.LANCZOS)


def mirror_tile(im, width):
    """横向镜像平铺到 width：周期 = 2*im.width，接缝处像素完全相连"""
    per = im.width * 2
    buf = Image.new("RGBA", (per, im.height), (0, 0, 0, 0))
    buf.paste(im, (0, 0))
    buf.paste(im.transpose(Image.FLIP_LEFT_RIGHT), (im.width, 0))
    out = Image.new("RGBA", (width, im.height), (0, 0, 0, 0))
    x = 0
    while x < width:
        out.paste(buf, (x, 0))
        x += per
    return out


def fade_bottom(im, y0, y1, layer_top):
    """把层内坐标映射到绝对 y，做 1->0 的 alpha 渐变"""
    a = im.getchannel("A")
    mask = Image.new("L", im.size, 255)
    px = mask.load()
    for y in range(im.height):
        ay = layer_top + y
        if ay <= y0:
            v = 255
        elif ay >= y1:
            v = 0
        else:
            k = (ay - y0) / (y1 - y0)
            v = int(255 * (1 - k))
        for x in range(im.width):
            px[x, y] = v
    a2 = Image.composite(a, Image.new("L", im.size, 0), mask)
    im.putalpha(a2)
    return im


def floor_tile(terrain, scale=0.5, mirror=True):
    src = load(os.path.join(TGA, f"SHAPE_BG_FLOOR{terrain:02d}.png"))
    side = round(512 * scale)
    t = src.resize((side, side), Image.LANCZOS)
    if mirror:
        m = t.transpose(Image.FLIP_LEFT_RIGHT)
        m2 = t.transpose(Image.FLIP_TOP_BOTTOM)
        m3 = m2.transpose(Image.FLIP_LEFT_RIGHT)
        buf = Image.new("RGBA", (side * 2, side * 2))
        buf.paste(t, (0, 0))
        buf.paste(m, (side, 0))
        buf.paste(m2, (0, side))
        buf.paste(m3, (side, side))
        return buf
    return t


def ground(terrain, scale=0.5, mirror=True, w=W, h=H):
    t = floor_tile(terrain, scale, mirror)
    out = Image.new("RGBA", (w, h))
    for y in range(0, h, t.height):
        for x in range(0, w, t.width):
            out.paste(t, (x, y))
    return out


def band(terrain, include_bg=True):
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layers = []
    if include_bg:
        bg = scale_to_h(load(os.path.join(BG, f"BG{terrain:02d}A.png")), BAND["bg_h"])
        layers.append(("bg", bg, BAND["bg_top"], BAND["bg_fade"]))
    mg = scale_to_h(load(os.path.join(BG, f"MG{terrain:02d}A.png")), BAND["mg_h"])
    layers.append(("mg", mg, BAND["mg_bottom"] - mg.height, BAND["mg_fade"]))
    fg = scale_to_h(load(os.path.join(BG, f"FG{terrain:02d}A.png")), BAND["fg_h"])
    layers.append(("fg", fg, BAND["fg_bottom"] - fg.height, BAND["fg_fade"]))
    for name, im, top, fade in layers:
        b = mirror_tile(im, W)
        if fade:
            fade_bottom(b, fade[0], fade[1], top)
        tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        tmp.alpha_composite(b, (0, top))
        out.alpha_composite(tmp)
    return out


def corners(terrain):
    """(c) 四角框景：把 FG 的左右两端裁一块压在四角"""
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fg = scale_to_h(load(os.path.join(BG, f"FG{terrain:02d}A.png")), 120)
    sw = 220
    left = fg.crop((0, 0, sw, fg.height))
    right = fg.crop((fg.width - sw, 0, fg.width, fg.height))
    for src, x in ((left, 0), (right, W - sw)):
        for corner_top in (FIELD_TOP - 20, H - 300):
            piece = src.copy()
            a = piece.getchannel("A")
            piece.putalpha(a.point(lambda v: int(v * 0.75)))
            out.alpha_composite(piece, (x, corner_top))
    return out


def compose(terrain, mode):
    img = ground(terrain)
    if mode == "b":
        img.alpha_composite(band(terrain, True))
    elif mode == "b2":
        img.alpha_composite(band(terrain, False))
    elif mode == "c":
        img = ground(terrain)
        img.alpha_composite(corners(terrain))
    return img


def grid(modes, fn, scale=0.4):
    cw, ch = int(W * scale), int(H * scale)
    sheet = Image.new("RGB", (cw * len(modes), ch * 3), (20, 20, 24))
    d = ImageDraw.Draw(sheet)
    for r in range(3):
        t = r * 4 + 1
        for c, m in enumerate(modes):
            im = None
            try:
                im = compose(t, m)
            except FileNotFoundError:
                continue
            sheet.paste(im.convert("RGB").resize((cw, ch), Image.LANCZOS), (c * cw, r * ch))
            d.text((c * cw + 6, r * ch + 6), f"mode {m} / t{t:02d}", fill=(255, 255, 0))
    sheet.save(os.path.join(OUT, fn))


grid(["a", "b"], "proto_modes.png")
for t in (0, 4, 8):
    compose(t, "b").convert("RGB").save(os.path.join(OUT, f"proto_b_{t:02d}.png"))
compose(4, "c").convert("RGB").save(os.path.join(OUT, "proto_c_04.png"))
compose(4, "b2").convert("RGB").save(os.path.join(OUT, "proto_b2_04.png"))
print("ok")
