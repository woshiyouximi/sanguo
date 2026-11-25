#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
make_sheets.py — 生成 3 张人工视觉验收对照图（只读源图，只写 work/asset_pipe/）。

  face_contact.png  48 将，原作 FACE(100x120) vs 现 AI hero.webp(缩到同一 100x120 框)，
                    1:1 像素并排，带武将名与 FACE 编号；表头给锐度数字（Laplacian 方差均值）。
  face_sizes.png    同一张图在真实显示位（HUD 86x108 / 列表 30x40）下的观感；
                    所有预览按整数倍 x3 用 Image.NEAREST 放大，不引入额外平滑。
  face_women.png    6 名女性武将：原作（上排）vs 现 AI（下排），证明原作性别正确、AI 错了。

用法：
  $env:PYTHONIOENCODING='utf-8'
  & "...\\python.exe" "F:\\sanguo\\work\\asset_pipe\\make_sheets.py"
"""
from __future__ import annotations

import json
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageStat

ROOT = r"F:\sanguo"
FACE_SRC = os.path.join(ROOT, "export", "png", "SHAPE", "FACE")
HERO_SRC = os.path.join(ROOT, "game", "web", "assets", "hero")
FACE_OUT = os.path.join(ROOT, "game", "web", "assets", "face")
WORK = os.path.join(ROOT, "work", "asset_pipe")
GEN_JSON = os.path.join(ROOT, "game", "data", "generals.json")

WOMEN = ["大喬", "小喬", "孫尚香", "祝融夫人", "貂蟬", "關鳳"]
HUD = (86, 108)
THUMB = (30, 40)
ZOOM = 3

BG = (22, 24, 28)
PANEL = (34, 37, 43)
FG = (238, 236, 228)
DIM = (158, 158, 150)
GOLD = (214, 178, 90)
RED = (226, 91, 74)

FONT_CANDIDATES = [
    (r"C:\Windows\Fonts\msyh.ttc", 0),
    (r"C:\Windows\Fonts\msyhbd.ttc", 0),
    (r"C:\Windows\Fonts\simhei.ttf", 0),
    (r"C:\Windows\Fonts\simsun.ttc", 0),
]


def pick_font() -> str:
    for p, _ in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit("找不到中文字体")


FONT_PATH = pick_font()


def F(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.truetype(FONT_PATH, size, index=0)


def load_json() -> dict:
    with open(os.path.join(FACE_OUT, "index.json"), encoding="utf-8") as f:
        return json.load(f)


def sharpness(im: Image.Image) -> float:
    """Laplacian 方差（越大越锐）。只看 RGB 灰度的可见区域。"""
    g = im.convert("L")
    lap = g.filter(ImageFilter.Kernel((3, 3), [0, -1, 0, -1, 4, -1, 0, -1, 0], scale=1))
    return ImageStat.Stat(lap).var[0]


def face_img(n: int) -> Image.Image:
    return Image.open(os.path.join(FACE_SRC, "FACE%03d.png" % n)).convert("RGBA")


def hero_img(name: str) -> Image.Image | None:
    p = os.path.join(HERO_SRC, name + ".webp")
    if not os.path.exists(p):
        return None
    return Image.open(p).convert("RGBA")


def box(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """CSS object-fit:cover + object-position:50% 14%（页面三个显示位都是这个规则）。"""
    W, H = size
    iw, ih = im.size
    scale = max(W / iw, H / ih)
    sw, sh = W / scale, H / scale
    x, y = (iw - sw) * 0.5, (ih - sh) * 0.14
    return im.crop((int(round(x)), int(round(y)), int(round(x + sw)), int(round(y + sh)))).resize((W, H), Image.LANCZOS)


def nearest(im: Image.Image, k: int) -> Image.Image:
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def frame(d: ImageDraw.ImageDraw, xy, im: Image.Image, color=(70, 74, 82)) -> None:
    d.rectangle([xy[0], xy[1], xy[0] + im.width - 1, xy[1] + im.height - 1], outline=color)


# ---------------------------------------------------------------------------
# 1) face_contact.png
# ---------------------------------------------------------------------------
def sheet_contact(idx: dict) -> str:
    faces = idx["faces"]
    gens = [g for g in json.load(open(GEN_JSON, encoding="utf-8"))[1:401]]
    by_name = {g["NAME"]: g for g in gens}

    # 确定性取样：6 名女性 + 按序号等距补到 48
    picks: list[str] = [w for w in WOMEN if w in faces]
    pool = [g["NAME"] for g in gens if g["NAME"] not in picks]
    want = 48 - len(picks)
    step = len(pool) / float(want)
    for i in range(want):
        picks.append(pool[int(i * step)])

    cols, rows = 8, 6
    cw, ch = 100, 120
    gap = 6
    cellw = cw * 2 + gap + 18
    cellh = ch + 46
    top = 128
    left = 24
    W = left * 2 + cols * cellw
    H = top + rows * cellh + 16

    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)
    f_title, f_h, f_name, f_small, f_note = F(26), F(16), F(15), F(12), F(14)

    # 表头数字：锐度对比（在真实 HUD 尺寸 86x108 上量）
    s_face = [sharpness(box(face_img(v["n"]), HUD)) for v in list(faces.values())[:400]]
    s_ai = []
    for name in faces:
        h = hero_img(name)
        if h is not None:
            s_ai.append(sharpness(box(h, HUD)))
    m_face = sum(s_face) / len(s_face)
    m_ai = sum(s_ai) / len(s_ai) if s_ai else 0.0

    d.text((left, 18), "原作 FACE 100×120（1:1 原样）  vs  现 AI hero.webp（按页面规则 cover 50%/14% 裁进同一 100×120 框）",
           font=f_title, fill=FG)
    d.text((left, 56),
           "锐度 Laplacian 方差 @显示位 86×108（都走 cover）：原作 %.0f  ·  现 AI %.0f  ·  比值 %.2f×"
           % (m_face, m_ai, (m_face / m_ai) if m_ai else 0),
           font=f_note, fill=GOLD)
    d.text((left, 80),
           "取样 %d 将（6 名女性 + 其余等距抽取）；左=原作彩绘，右=现 AI 立绘。两边同框同尺寸，没有一边被压扁。"
           % len(picks),
           font=f_small, fill=DIM)
    d.text((left, 100), "源：export/png/SHAPE/FACE/FACE<NNN>.png   ·   AI：game/web/assets/hero/<姓名>.webp",
           font=f_small, fill=DIM)

    for i, name in enumerate(picks[:cols * rows]):
        r, c = divmod(i, cols)
        x = left + c * cellw
        y = top + r * cellh
        e = faces[name]
        n = e["n"]
        g = by_name[name]
        col = RED if e["sex_hint"] == "F" else FG
        d.text((x, y), "%s" % name, font=f_name, fill=col)
        d.text((x, y + 19), "#%03d  seq%d" % (n, g["SEQUENCE"]), font=f_small, fill=DIM)
        a = box(face_img(n), (cw, ch))
        canvas.paste(a, (x, y + 40), a)
        frame(d, (x, y + 40), a)
        h = hero_img(name)
        if h is not None:
            b = box(h, (cw, ch))
            canvas.paste(b, (x + cw + gap, y + 40), b)
            frame(d, (x + cw + gap, y + 40), b, (90, 70, 50))
        else:
            d.rectangle([x + cw + gap, y + 40, x + cw * 2 + gap - 1, y + 40 + ch - 1], outline=RED)
            d.text((x + cw + gap + 8, y + 90), "缺图", font=f_small, fill=RED)

    out = os.path.join(WORK, "face_contact.png")
    canvas.save(out)
    return out


# ---------------------------------------------------------------------------
# 2) face_sizes.png
# ---------------------------------------------------------------------------
def sheet_sizes(idx: dict) -> str:
    faces = idx["faces"]
    # 3 个样本：高细节男将 / 女性 / 暗甲男将
    samples = ["趙雲", "大喬", "呂布"]
    samples = [s for s in samples if s in faces] or [next(iter(faces))]
    while len(samples) < 3:
        samples.append(list(faces)[len(samples) * 37 % 400])

    f_title, f_h, f_sub, f_note, f_small = F(23), F(15), F(12), F(13), F(11)

    # 列定义 (短标签, 生成函数, 目标尺寸)
    cols = [
        ("原作 100×120", lambda n, name: box(face_img(n), (100, 120)), (100, 120)),
        ("原作 → HUD", lambda n, name: box(face_img(n), HUD), HUD),
        ("現 AI → HUD", lambda n, name: box(hero_img(name), HUD) if hero_img(name) else None, HUD),
        ("原作 → 列表", lambda n, name: box(face_img(n), THUMB), THUMB),
        ("現 AI → 列表", lambda n, name: box(hero_img(name), THUMB) if hero_img(name) else None, THUMB),
        ("交付 thumb", lambda n, name: Image.open(os.path.join(FACE_OUT, "thumb", "%03d.webp" % n)).convert("RGBA"), THUMB),
    ]

    pad = 18
    gutter = 96                      # 左侧行标签栏
    colw = [sz[0] * ZOOM for _, _, sz in cols]
    colx = []
    x = pad + gutter
    for w in colw:
        colx.append(x)
        x += w + pad

    top = 168
    rowh = 24 + 120 * ZOOM + 26
    W = x
    H = top + len(samples) * rowh + 8
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)

    d.text((pad, 14), "真实显示位观感（HUD 86×108 / 列表 30×40，整数 ×3 最近邻放大预览，不额外平滑）",
           font=f_title, fill=FG)
    d.text((pad, 48), "缩放链与页面完全一致：object-fit:cover + object-position:50% 14%"
                      "（HUD 是 battleView.js 手写的同一套 cover 算法，sy=(pr.h-sh)*0.16）。",
           font=f_note, fill=DIM)
    d.text((pad, 68), "原作 100×120 进 86×108 只损失 4.4px 宽（0.9× 缩放，几乎原样）；"
                      "现 AI 480×701 进 86×108 要被裁掉一大半，脸只剩几十像素。", font=f_note, fill=DIM)
    d.text((pad, 88), "细看：列表 30×40 位谁都不「清楚」，但原作在这尺寸仍能分出「红脸/白脸/黑甲」，AI 图只剩一团深色。",
           font=f_small, fill=DIM)
    d.text((pad, 108), "每格下方的 Lap = 该图在目标尺寸下的 Laplacian 方差（锐度），同尺寸内可直接比大小。",
           font=f_small, fill=DIM)

    for ci, (label, fn, sz) in enumerate(cols):
        d.text((colx[ci], top - 42), label, font=f_h, fill=GOLD)
        d.text((colx[ci], top - 24), "%d×%d ×%d" % (sz[0], sz[1], ZOOM), font=f_small, fill=DIM)

    for ri, name in enumerate(samples):
        n = faces[name]["n"]
        y = top + ri * rowh
        d.text((pad, y + 4), "%s" % name, font=f_h, fill=FG)
        d.text((pad, y + 24), "#%03d" % n, font=f_small, fill=DIM)
        for ci, (label, fn, sz) in enumerate(cols):
            im = fn(n, name)
            if im is None:
                d.rectangle([colx[ci], y + 20, colx[ci] + sz[0] * ZOOM - 1, y + 20 + sz[1] * ZOOM - 1], outline=RED)
                d.text((colx[ci] + 6, y + 26), "缺图", font=f_small, fill=RED)
                continue
            big = nearest(im, ZOOM)
            canvas.paste(big, (colx[ci], y + 20))
            frame(d, (colx[ci], y + 20), big, (80, 84, 92))
            d.text((colx[ci], y + 20 + big.height + 5), "Lap %.0f" % sharpness(im), font=f_small, fill=DIM)

    out = os.path.join(WORK, "face_sizes.png")
    canvas.save(out)
    return out


# ---------------------------------------------------------------------------
# 3) face_women.png
# ---------------------------------------------------------------------------
def sheet_women(idx: dict) -> str:
    faces = idx["faces"]
    names = [w for w in WOMEN if w in faces]
    f_title, f_h, f_big, f_small = F(24), F(17), F(15), F(11)

    cw, ch = 100, 120
    z = ZOOM
    gap = 22
    W = 26 * 2 + len(names) * (cw * z) + (len(names) - 1) * gap
    H = 176 + 2 * (ch * z + 44) + 20
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)

    d.text((26, 14), "6 名女性武将：原作 FACE（上排）vs 现 AI hero.webp（下排）", font=f_title, fill=FG)
    d.text((26, 50), "上排全部是原作女性彩绘；下排 AI 图 6/6 都是蓄须男性武将 —— 这就是任务书说的性别错。",
           font=f_big, fill=GOLD)
    d.text((26, 74), "判定依据：原作由 三國群英傳2 原盘 SHAPE\\FACE 直出（FACE007 起依次对应），"
                     "AI 图为项目现用 assets/hero/<姓名>.webp。", font=f_small, fill=DIM)
    d.text((26, 92), "下面每张都按 ×3 最近邻放大，未做平滑。", font=f_small, fill=DIM)

    y0 = 120
    for ri, tag in enumerate(["原作 FACE", "現 AI hero.webp"]):
        y = y0 + ri * (ch * z + 44)
        d.text((26, y), tag, font=f_h, fill=GOLD if ri == 0 else RED)
        for ci, name in enumerate(names):
            x = 26 + ci * (cw * z + gap)
            n = faces[name]["n"]
            im = face_img(n) if ri == 0 else hero_img(name)
            d.text((x, y + 22), "%s  #%03d" % (name, n), font=f_h, fill=FG)
            if im is None:
                continue
            big = nearest(box(im, (cw, ch)), z)
            canvas.paste(big, (x, y + 44))
            frame(d, (x, y + 44), big, (80, 84, 92))

    out = os.path.join(WORK, "face_women.png")
    canvas.save(out)
    return out


# ---------------------------------------------------------------------------
# 4) hero_resize_5.png  —— AI 立绘 480x701 -> 176x220 重采样的视觉对照
# ---------------------------------------------------------------------------
def sheet_hero5(_idx: dict) -> str:
    names = [n for n in ["關羽", "呂布", "大喬", "曹操", "諸葛亮"] if hero_img(n) is not None]
    f_title, f_h, f_note, f_small = F(23), F(16), F(13), F(11)

    disp = (88, 110)          # 全项目最大显示位（deploy .gen img）
    z = 3
    pw, ph = disp[0] * z, disp[1] * z
    gap, pad = 20, 24
    top = 168
    rowh = ph + 58
    W = pad * 2 + len(names) * pw + (len(names) - 1) * gap
    H = top + 3 * rowh + 8
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)

    d.text((pad, 14), "AI 立绘瘦身：480×701 → 176×220（全项目最大显示位 88×110 的 2 倍）视觉无损验证",
           font=f_title, fill=FG)
    d.text((pad, 46), "算法：cover 裁到 176:220 + LANCZOS 重采样 + WebP q92/method=6；"
                      "文件名/路径不变，前端零改动。", font=f_note, fill=DIM)
    d.text((pad, 66), "下面三排都在「显示位 88×110」上比，×3 最近邻放大：上=原图理想值（480×701 直缩），"
                      "中=交付的 176×220 再缩，下=两者差值的 20 倍放大。", font=f_note, fill=DIM)
    d.text((pad, 86), "C 排几乎纯黑 = 肉眼看不出差别；PSNR 数字见每列。"
                      "（这张图只证明「瘦身无损」，不涉及女性武将性别错的问题。）", font=f_small, fill=DIM)

    rows = ["原图 480×701 → 88×110（理想）", "交付 176×220 → 88×110", "差值 ×20（越黑越无损）"]
    for ri, tag in enumerate(rows):
        y = top + ri * rowh
        d.text((pad, y - 22), tag, font=f_h, fill=GOLD if ri < 2 else DIM)

    for ci, name in enumerate(names):
        x = pad + ci * (pw + gap)
        orig = hero_img(name)
        deliv = Image.open(os.path.join(HERO_SRC, name + ".webp")).convert("RGBA")  # 已就地替换为 176x220
        bak = os.path.join(WORK, "hero_webp_orig", name + ".webp")
        if os.path.exists(bak):
            orig = Image.open(bak).convert("RGBA")
        a = nearest(box(orig, disp), z)
        b = nearest(box(deliv, disp), z)
        diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
        diff = diff.point(lambda v: min(255, v * 20))
        vals = ImageStat.Stat(ImageChops.difference(a.convert("RGB"), b.convert("RGB")).convert("L")).rms[0]
        psnr = 999.0 if vals == 0 else 20 * __import__("math").log10(255 / vals)

        d.text((x, top - 22), name, font=f_h, fill=FG)
        canvas.paste(a.convert("RGB"), (x, top))
        canvas.paste(b.convert("RGB"), (x, top + rowh))
        canvas.paste(diff, (x, top + 2 * rowh))
        for k in range(3):
            frame(d, (x, top + k * rowh), a, (80, 84, 92))
        d.text((x + pw - 62, top + rowh - 17), "%.1f dB" % psnr, font=f_small, fill=DIM)
        d.text((x, top + 2 * rowh + ph + 4),
               "原 %dKB → 新 %dB" % (os.path.getsize(bak) // 1024 if os.path.exists(bak) else 0,
                                     os.path.getsize(os.path.join(HERO_SRC, name + ".webp"))),
               font=f_small, fill=DIM)

    out = os.path.join(WORK, "hero_resize_5.png")
    canvas.save(out)
    return out


def main() -> int:
    os.makedirs(WORK, exist_ok=True)
    idx = load_json()
    for fn in (sheet_contact, sheet_sizes, sheet_women, sheet_hero5):
        p = fn(idx)
        with Image.open(p) as im:
            print("%-56s %s  %dx%d  %.1f KB" % (p, im.format, im.width, im.height, os.path.getsize(p) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
