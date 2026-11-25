# -*- coding: utf-8 -*-
"""对比图排版（只读素材 + 复用 pixel_post 的量化函数，不改任何游戏文件）。

产出：
  F:\\sanguo\\work\\pixel_ab_units.jpg   兵种 原图 / 推荐 / 像素化 三列，叠在 32 色地形上
  F:\\sanguo\\work\\pixel_ab_hero.jpg    立绘 同上
  F:\\sanguo\\work\\pixel_ab\\_groups\\*.png  3 组代表的 before/after 条图（透明底）
运行： python work\\pixel_ab\\_probe\\make_sheets.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"F:\sanguo"
AB = os.path.join(ROOT, "work", "pixel_ab")
sys.path.insert(0, os.path.join(ROOT, "tools"))
from pixel_post import build_palette, map_to_palette  # noqa: E402

TERRAIN = os.path.join(ROOT, "game", "web", "assets", "bg", "env", "terrain_04.jpg")
ANIM = os.path.join(ROOT, "game", "web", "anim")
UNITS_PNG = os.path.join(ANIM, "units_00.png")
UNITS_JSON = os.path.join(ANIM, "units.json")
INK = (232, 223, 200)      # C01 绢白
INK2 = (200, 164, 106)     # C02 土黄


def font(size):
    for f in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf",
              r"C:\Windows\Fonts\msyhbd.ttc"):
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()


def terrain(tw, th, colors=32):
    """真实地形 -> 铺满 (tw,th) 的 cover 裁切 -> 量化到 N 色（无抖动，硬边）。"""
    im = Image.open(TERRAIN).convert("RGB")
    s = max(tw / im.width, th / im.height)
    im = im.resize((max(tw, int(im.width * s + 0.5)), max(th, int(im.height * s + 0.5))),
                   Image.LANCZOS)
    x0 = (im.width - tw) // 2
    y0 = (im.height - th) // 2
    a = np.array(im.crop((x0, y0, x0 + tw, y0 + th)), np.float32)
    a = np.clip((a - 128.0) * 0.82 + 118.0, 0, 255).astype(np.uint8)
    u, c = np.unique(a.reshape(-1, 3), axis=0, return_counts=True)
    pal = build_palette(u, c, colors)
    q = map_to_palette(a, np.ones(a.shape[:2], bool), pal)
    return Image.fromarray(q, "RGB").convert("RGBA"), pal


def frame_map():
    d = json.load(open(UNITS_JSON, encoding="utf-8"))
    return {s["name"]: s for s in d["pages"][0]["sprites"]}


def crop(png, m, name):
    s = m[name]
    return Image.open(png).crop((s["x"], s["y"], s["x"] + s["w"], s["y"] + s["h"]))


def paste(canvas, im, xy, scale=1):
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    canvas.alpha_composite(im, xy)


def tag(dr, xy, text, f, fill=INK, anchor="la"):
    dr.text((xy[0] + 1, xy[1] + 1), text, font=f, fill=(0, 0, 0, 210), anchor=anchor)
    dr.text(xy, text, font=f, fill=fill, anchor=anchor)


def plaque(canvas, xy, w, h, fill=(10, 12, 14, 168)):
    lay = Image.new("RGBA", (w, h), fill)
    canvas.alpha_composite(lay, xy)


GROUPS = [
    ("弓兵·背   archer_back", "archer_back_f00%d"),
    ("弓兵·正   archer_front", "archer_front_f00%d"),
    ("布衣走   walk_side", "walk_side_f00%d"),
]


def make_units(right_png, right_label, out_path, nframes=4, cols=None):
    """cols = [(png, 标签), ...]；第一列永远是原图。"""
    m = frame_map()
    S = 2
    FW, FH = 80, 104
    if cols is None:
        cols = [(UNITS_PNG, "原图（全彩）"), (right_png, right_label)]
    n = nframes
    colw = n * FW * S
    W = 40 + len(cols) * colw + (len(cols) - 1) * 32 + 40
    band = len(GROUPS) * (24 + FH * S + 16)
    H = 96 + band + 30 + 3 * 80 + 60
    cv, _ = terrain(W, H, 32)
    dr = ImageDraw.Draw(cv)
    f_title, f_lab, f_tiny = font(26), font(17), font(14)
    plaque(cv, (0, 0), W, 76)
    tag(dr, (24, 12), "work\\pixel_ab_units.jpg   ·   背景 = game/web/assets/bg/env/terrain_04.jpg 量化到 32 色",
        f_tiny, INK2)
    tag(dr, (24, 30), "兵种精灵 A/B（同一张地形上，左→右＝原图 → 推荐参数 → 更激进的像素化）", f_title, INK)

    xs = [40 + i * (colw + 32) for i in range(len(cols))]
    y = 96
    for gi, (title, pat) in enumerate(GROUPS):
        for ci, (png, lab) in enumerate(cols):
            tag(dr, (xs[ci], y), title if ci == 0 else lab, f_lab, INK2 if ci == 0 else INK)
        y0 = y + 24
        for ci, (png, lab) in enumerate(cols):
            for i in range(n):
                paste(cv, crop(png, m, pat % i), (xs[ci] + i * FW * S, y0), S)
        y = y0 + FH * S + 16
        dr.line([(24, y - 8), (W - 24, y - 8)], fill=(232, 223, 200, 40))

    plaque(cv, (0, y + 2), W, 3 * 80 + 34)
    tag(dr, (24, y + 8), "1x ＝ 游戏内实际尺寸（源帧 80x104 → 64px 高，NEAREST，与 main.js 的比例一致）",
        f_tiny, INK2)
    yy = y + 32
    gs = 64 / 104.0
    gw = int(80 * gs)
    for title, pat in GROUPS:
        for ci, (png, lab) in enumerate(cols):
            x = xs[ci]
            for i in range(3):
                paste(cv, crop(png, m, pat % i).resize((gw, 64), Image.NEAREST), (x, yy))
                x += gw + 6
        yy += 80

    tag(dr, (24, yy + 8), "注意：脚下那圈浅灰是源素材自带的 AI 接地光斑，二值化后被压成硬边亮块（见 43 号文档 §4）",
        f_tiny, INK)
    tag(dr, (24, H - 34), "推荐 = --colors 32 --alpha-threshold 0.5 --outline-mode outside --outline-color auto --kill-glint"
        "（不加 --pixel：80x104 已经和原作 FORCE 的 64x117 同级，再降采样就比原作还粗）", f_tiny, INK2)
    tag(dr, (24, H - 18), "第三列 = 再叠 --pixel 2，用来看它到底帮不帮忙（结论：兵种不合用）", f_tiny, INK2)
    cv.convert("RGB").save(out_path, quality=94, subsampling=0)
    print("->", out_path, cv.size)


def make_hero(hero_png, out_path):
    W, H = 1240, 940
    cv, _ = terrain(W, H, 32)
    dr = ImageDraw.Draw(cv)
    f_title, f_lab, f_tiny = font(26), font(17), font(14)
    plaque(cv, (0, 0), W, 74)
    tag(dr, (24, 11), "work\\pixel_ab_hero.jpg", f_tiny, INK2)
    tag(dr, (24, 30), "主将立绘 A/B：左=原图（480x701 全彩）  右=后处理", f_title, INK)

    panels = [
        ("原图（74200 种颜色）", Image.open(hero_png).convert("RGBA")),
        ("32 色", Image.open(os.path.join(AB, "_hero", "guanyu_32.png")).convert("RGBA")),
        ("32 色 + 2x 像素化", Image.open(os.path.join(AB, "_hero", "guanyu_32px2.png")).convert("RGBA")),
    ]
    pw, ph = 240, 350
    y = 104
    x = 60
    for lab, p in panels:
        cv.alpha_composite(p.resize((pw, ph), Image.NEAREST), (x, y + 26))
        dr.rectangle([x - 2, y + 24, x + pw + 1, y + 26 + ph], outline=INK2, width=2)
        tag(dr, (x + pw // 2, y + 2), lab, f_lab, INK, anchor="ma")
        x += pw + 80

    by = y + 26 + ph + 46
    tag(dr, (24, by - 32), "脸部 3x（左：原图   中：32 色   右：32 色 + 2x 像素化）", f_tiny, INK)
    box = (176, 150, 176 + 96, 150 + 96)
    x = 60
    for lab, p in panels:
        cv.alpha_composite(p.crop(box).resize((96 * 3, 96 * 3), Image.NEAREST), (x, by))
        x += 96 * 3 + 24
    tag(dr, (24, H - 30), "立绘无 alpha 通道：二值化/描边这两步对它无效，只能靠量化 + 像素化；"
        "描边要靠 UI 面板框（见 43 号文档 §4）", f_tiny, INK2)
    cv.convert("RGB").save(out_path, quality=94, subsampling=0)
    print("->", out_path, cv.size)


def make_groups(before_png, after_png, out_dir):
    """把 3 组代表的 4 帧各拼成一条，before/after 分开存，方便直接看/替换。"""
    os.makedirs(out_dir, exist_ok=True)
    m = frame_map()
    for title, pat in GROUPS:
        key = pat.rsplit("_f00", 1)[0]
        for tagname, png in (("before", before_png), ("after", after_png)):
            strip = Image.new("RGBA", (4 * 80, 104), (0, 0, 0, 0))
            for i in range(4):
                strip.alpha_composite(crop(png, m, pat % i), (i * 80, 0))
            p = os.path.join(out_dir, "%s.%s.png" % (key, tagname))
            strip.save(p, optimize=True)
            print("->", p)


if __name__ == "__main__":
    default = os.path.join(AB, "units_00.px.png")
    px2 = os.path.join(AB, "_var", "32ogp2", "units_00.px.png")
    make_units(default, "32 色+描边（推荐）", os.path.join(ROOT, "work", "pixel_ab_units.jpg"),
               nframes=3,
               cols=[(UNITS_PNG, "原图（1297–2874 色/帧）"),
                     (default, "32 色 + 描边 + 清接地光斑（推荐）"),
                     (px2, "推荐参数 + 2x 像素化")])
    make_hero(os.path.join(ROOT, "game", "web", "assets", "hero", "關羽.png"),
              os.path.join(ROOT, "work", "pixel_ab_hero.jpg"))
    make_groups(UNITS_PNG, default, os.path.join(AB, "_groups"))
