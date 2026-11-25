# -*- coding: utf-8 -*-
"""把原作素材 / AI 底图裁成九屏用的 750×1334 竖屏底图，落到 proto/ui/assets/bg/。

原则：
  * 输出 ≤ 400 KB/张，总 ≤ 2.5 MB（q82，必要时降 q），首屏秒开；
  * 不预压暗到死黑 —— 屏上还会叠 --scrim（rgba(8,11,16,.62→.78)），这里只做构图与轻度渐隐；
  * 原作用「模糊补边 + 清晰主图」的竖屏合成，4:3 素材不至于只剩中间一条。
跑法：python F:\\sanguo\\work\\_uibg_build.py [name ...]
"""
import os, sys
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw

OUT = r"F:\sanguo\proto\ui\assets\bg"
AI = r"F:\sanguo\work\_uibg_ai"
EXP = r"F:\sanguo\export\png\SHAPE"
W, H = 750, 1334
MAXKB = 400


def op(p):
    return Image.open(p).convert("RGB")


def cover(im, w=W, h=H, cx=0.5, cy=0.5, zoom=1.0):
    k = max(w / im.width, h / im.height) * zoom
    nw, nh = int(round(im.width * k)), int(round(im.height * k))
    im = im.resize((nw, nh), Image.LANCZOS)
    x = int(round((nw - w) * cx))
    y = int(round((nh - h) * cy))
    return im.crop((x, y, x + w, y + h))


def blurfill(im, dark=0.42, radius=34, w=W, h=H):
    b = cover(im, w, h).filter(ImageFilter.GaussianBlur(radius))
    return ImageEnhance.Brightness(b).enhance(dark)


def vignette(im, strength=0.55, power=2.2):
    """四角压暗（不是死黑，只到 strength）。"""
    m = Image.new("L", (im.width // 4, im.height // 4), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([-im.width * 0.12, -im.height * 0.16, im.width * 0.47, im.height * 0.60], fill=255)
    m = m.resize(im.size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(60))
    black = Image.new("RGB", im.size, (6, 8, 11))
    return Image.composite(im, Image.blend(im, black, strength), m)


def fade_bottom(im, start=0.62, end=1.0, to=(10, 12, 16)):
    """底部渐隐到 to（不做纯黑，保留一点余韵）。"""
    w, h = im.size
    grad = Image.new("L", (1, h), 0)
    for y in range(h):
        t = (y / h - start) / max(1e-6, (end - start))
        grad.putpixel((0, y), int(255 * min(1.0, max(0.0, t)) ** 1.5))
    grad = grad.resize((w, h))
    return Image.composite(Image.new("RGB", im.size, to), im, grad)


def save(im, name, q=82):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name + ".jpg")
    qq = q
    while True:
        im.save(p, "JPEG", quality=qq, optimize=True, progressive=True)
        kb = os.path.getsize(p) / 1024
        if kb <= MAXKB or qq <= 62:
            break
        qq -= 4
    print("%-12s %s %4dx%-4d %6.1f KB q%d" % (name, p, im.width, im.height, kb, qq))
    return kb


# --------------------------------------------------------------------- 各屏
def do_p1():
    """AI 重绘：军队列阵背影 + 黄昏天光。标题由 CSS 排版，位图里没有字。"""
    im = cover(op(os.path.join(AI, "p1_title.png")), cy=0.46)
    im = ImageEnhance.Color(im).enhance(1.02)
    im = ImageEnhance.Contrast(im).enhance(1.04)
    im = fade_bottom(im, 0.80, 1.0, (8, 10, 14))
    return save(vignette(im, 0.35), "p1_title", 82)


def do_m1():
    """CHINAMAP 原尺寸 1280×960（等比、不裁）：m1.js 按剧本坐标裁窗口画进 canvas。

    保留 1280×960 是为了 1.6× 放大时不糊（canvas 还要乘 dpr）；q82 掉到 400 KB 以内。
    """
    src = Image.open(os.path.join(EXP, "MAP", "CHINAMAP.png")).convert("RGB")
    im = ImageEnhance.Color(src).enhance(0.92)
    im = ImageEnhance.Brightness(im).enhance(0.94)
    return save(im, "m1_map", 82)


def do_m2(src_name="PALAIS01.png", out_name="m2_city"):
    """PALAIS 内政大殿：上半清晰（宝座正落在城池头图后），下半用「地毯拉伸 + 强模糊」接出去。

    4:3 的 3D 大殿直接 cover 会把两侧卫兵裁掉、放大到糊；这里：
      fg   = 750 宽原图贴在 y=0（宝座 / 屏风 / 红毯都在）
      ext  = 取 fg 底部 92px（红毯）竖拉到 1334，强模糊 + 从上往下压暗，
             让画面像"殿内向深处暗下去"，不是硬切一条缝；
      接缝处 60px 羽化。
    """
    src = op(os.path.join(EXP, "POLICY", src_name))
    fg = src.resize((W, int(round(W * src.height / src.width))), Image.LANCZOS)
    fg = ImageEnhance.Brightness(fg).enhance(0.97)
    out = Image.new("RGB", (W, H), (9, 11, 15))
    seam = int(fg.height * 0.845)                     # 从地毯最上沿开始接
    # 只取最下面 24px（纯红毯，已过椭圆形纹样），竖拉 40 倍后再重模糊 →
    # 得到一段平滑的"红毯向深处暗下去"，不会把地毯纹样拉成怪异的蛋形/竖条纹。
    strip = fg.crop((0, fg.height - 24, W, fg.height))
    ext = strip.resize((W, H - seam), Image.LANCZOS).filter(ImageFilter.GaussianBlur(32))
    # 竖向下压暗：接缝处 0.95 → 底部 0.10
    ramp = Image.new("L", (1, H - seam), 0)
    for y in range(H - seam):
        t = y / float(H - seam)
        ramp.putpixel((0, y), int(255 * (0.95 - 0.85 * t ** 0.75)))
    ramp = ramp.resize((W, H - seam))
    ext = Image.composite(ext, Image.new("RGB", (W, H - seam), (5, 6, 9)), ramp)
    out.paste(ext, (0, seam))
    # fg 下缘羽化 70px，压到 ext 上
    mask = Image.new("L", (W, fg.height), 255)
    d = ImageDraw.Draw(mask)
    for y in range(fg.height - 70, fg.height):
        d.line([(0, y), (W, y)], fill=255 - int(255 * ((y - (fg.height - 70)) / 70.0) ** 1.5))
    out.paste(fg, (0, 0), mask)
    return save(vignette(out, 0.42), out_name, 82)


def do_ai(name, out, cy=0.5, cx=0.5, zoom=1.0, color=1.0, contrast=1.03, vig=0.5,
          bright=1.0, fade=0.82):
    src = os.path.join(AI, name + ".png")
    if not os.path.exists(src):
        print("MISS", name)
        return None
    im = cover(op(src), cy=cy, cx=cx, zoom=zoom)
    im = ImageEnhance.Brightness(im).enhance(bright)
    im = ImageEnhance.Color(im).enhance(color)
    im = ImageEnhance.Contrast(im).enhance(contrast)
    if fade < 0.999:
        im = fade_bottom(im, fade, 1.0, (9, 11, 15))
    return save(vignette(im, vig), out, 82)


def do_b1():
    """战场底：用 art_ref 的 AI 战场图（竖屏），下半压暗给 HUD。"""
    src = op(r"F:\sanguo\project\art_ref\battlefield.png")
    im = cover(src, cy=0.55)
    im = ImageEnhance.Brightness(im).enhance(0.9)
    im = fade_bottom(im, 0.56, 1.0, (9, 11, 15))
    return save(vignette(im, 0.55), "b1_battle", 82)


JOBS = {
    "p1_title": do_p1, "m1_map": do_m1, "m2_city": do_m2, "b1_battle": do_b1,
    "m3_deploy": lambda: do_ai("m3_deploy", "m3_deploy", cy=0.5, vig=0.44, bright=1.10),
    "d1_deploy": lambda: do_ai("d1_deploy", "d1_deploy", cy=0.46, vig=0.48, bright=1.02),
    "r1_result": lambda: do_ai("r1_result", "r1_result", cy=0.5, zoom=1.08, vig=0.22, bright=1.30, fade=0.94),
    "g1_hero": lambda: do_ai("g1_hero", "g1_hero", cy=0.44, cx=0.72, zoom=1.26, vig=0.18, bright=1.28, fade=0.96),
    "s1_settings": lambda: do_ai("s1_settings", "s1_settings", cy=0.5, vig=0.34, bright=1.10),
}


def main():
    want = sys.argv[1:] or list(JOBS)
    total, rows = 0.0, []
    for k in want:
        kb = JOBS[k]()
        if kb:
            total += kb
            rows.append((k, kb))
    print("-" * 52)
    for k, kb in rows:
        print("%-12s %6.1f KB" % (k, kb))
    big = [n for n in sorted(os.listdir(OUT)) if os.path.getsize(os.path.join(OUT, n)) > MAXKB * 1024]
    print("TOTAL %.0f KB (%.2f MB)  over400KB=%s" % (total, total / 1024, big or "none"))


if __name__ == "__main__":
    main()
