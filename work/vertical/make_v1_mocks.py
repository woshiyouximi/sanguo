# -*- coding: utf-8 -*-
"""V1 大地图三方案小样：750x780（30 标题 + 695 地图区 + 55 注释）
底图用原作 1280x960 chinamap.webp，城点用 scenarios.json 第 1 剧本的真实 pos_xy。
"""
import json, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = r"F:\sanguo"
MAP = os.path.join(ROOT, r"game\web\assets\map\chinamap.webp")
SCEN = os.path.join(ROOT, r"game\data\scenarios.json")
OUT = os.path.join(ROOT, r"work\vertical")
FONT = r"C:\Windows\Fonts\msyh.ttc"
FONTB = r"C:\Windows\Fonts\msyhbd.ttc"
W, H = 750, 780
MAPY, MAPH = 30, 695
GOLD = (216, 179, 106)
GOLD2 = (243, 224, 180)
INK = (233, 228, 214)
DIM = (150, 145, 132)
DARK = (14, 17, 22)

f11 = ImageFont.truetype(FONT, 11)
f12 = ImageFont.truetype(FONT, 12)
f13 = ImageFont.truetype(FONT, 13)
f15 = ImageFont.truetype(FONTB, 15)
f17 = ImageFont.truetype(FONTB, 17)
f20 = ImageFont.truetype(FONTB, 20)

def scen_cities():
    j = json.load(open(SCEN, encoding="utf-8"))
    arr = j if isinstance(j, list) else (j.get("scenarios") or list(j.values()))
    return [(c["NAME"], c["pos_xy"][0], c["pos_xy"][1]) for c in arr[0]["cities"]]

def frame(d, title, sub=""):
    d.rectangle([0, 0, W, H], fill=DARK)
    d.rectangle([0, 0, W, MAPY], fill=(20, 24, 31))
    d.line([(0, MAPY), (W, MAPY)], fill=(60, 54, 40), width=1)
    d.text((14, 7), title, font=f15, fill=GOLD2)
    if sub:
        tw = d.textlength(sub, font=f11)
        d.text((W - 14 - tw, 10), sub, font=f11, fill=DIM)
    # 地图区外框
    d.rectangle([0, MAPY, W - 1, MAPY + MAPH - 1], outline=(58, 50, 34), width=1)

def footer(d, lines):
    y = MAPY + MAPH
    d.rectangle([0, y, W, H], fill=(18, 21, 27))
    d.line([(0, y), (W, y)], fill=(60, 54, 40), width=1)
    for i, (txt, col) in enumerate(lines):
        d.text((14, y + 7 + i * 20), txt, font=f12, fill=col)

def ring(d, x, y, name, above, small=False):
    r = 5 if not small else 4
    d.ellipse([x - r - 2, y - r - 2, x + r + 2, y + r + 2], fill=(12, 10, 8))
    d.ellipse([x - r, y - r, x + r, y + r], fill=(72, 48, 18), outline=GOLD, width=2)
    d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 238, 190))
    fs = f11 if not small else f11
    tw = d.textlength(name, font=fs)
    tx, ty = x - tw / 2, (y - 17 if above else y + 7)
    # 描边
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if dx or dy:
                d.text((tx + dx, ty + dy), name, font=fs, fill=(6, 6, 8))
    d.text((tx, ty), name, font=fs, fill=INK)

def paste_map(base, s, ox, oy):
    """把 1280×960 的原图缩到 s、放到地图区 (ox, oy-MAPY)，只在地图区内合成，绝不盖标题栏。"""
    layer = Image.new("RGB", (W, MAPH), DARK)
    src = Image.open(MAP).convert("RGB")
    w, h = round(1280 * s), round(960 * s)
    im = src.resize((w, h), Image.LANCZOS)
    layer.paste(im, (round(ox), round(oy - MAPY)))
    base.paste(layer, (0, MAPY))

def silk_band(d, y0, y1):
    # 深红绢底 + 暗金云纹，上下各一道金色卷杆
    for yy in range(y0, y1):
        t = (yy - y0) / max(1, (y1 - y0))
        r = int(58 - 26 * t); g = int(22 - 10 * t); b = int(24 - 10 * t)
        d.line([(0, yy), (W, yy)], fill=(r, g, b))
    step = 34
    for k in range(-2, W // step + 3):
        cx = k * step
        for yy in (y0 + 20, y1 - 20):
            d.polygon([(cx, yy - 12), (cx + 12, yy), (cx, yy + 12), (cx - 12, yy)],
                      outline=(150, 112, 58), width=1)
            d.ellipse([cx - 4, yy - 4, cx + 4, yy + 4], outline=(120, 88, 44), width=1)
    d.line([(0, y0 + 3), (W, y0 + 3)], fill=(150, 118, 62), width=2)
    d.line([(0, y1 - 3), (W, y1 - 3)], fill=(150, 118, 62), width=2)
    lbl = "絹 帛 裝 飾 帶"
    tw = d.textlength(lbl, font=f11)
    cy = (y0 + y1) // 2
    d.text(((W - tw) / 2, cy - 7), lbl, font=f11, fill=(176, 140, 82))

def mock_a(cities):
    im = Image.new("RGB", (W, H), DARK); d = ImageDraw.Draw(im)
    frame(d, "方案 A · 等比 fit + 上下絹帛／卷軸裝飾", "750×695 地圖區 · 全圖可見")
    s = min(W / 1280, MAPH / 960)
    h = 960 * s
    oy = MAPY + (MAPH - h) / 2
    paste_map(im, s, (W - 1280 * s) / 2, oy)
    for i, (n, x, y) in enumerate(cities):
        ring(d, x * s, oy + y * s, n, i % 2 == 0)
    silk_band(d, MAPY, round(oy))
    silk_band(d, round(oy + h), MAPY + MAPH)
    d.rectangle([0, MAPY, W - 1, MAPY + MAPH - 1], outline=(58, 50, 34), width=1)
    footer(d, [
        (f"s = min(750/1280, 695/960) = {s:.4f} → 750×{h:.1f}，上下各空 {(MAPH-h)/2:.1f}px（合計 {MAPH-h:.1f}px）", GOLD),
        ("60/60 城一屏可見（最小城距 22.0px，圖示 32px，中原仍會疊）；plotRect 只需去掉 0.965，改用裝飾帶補空", DIM),
    ])
    return im

def mock_b(cities):
    im = Image.new("RGB", (W, H), DARK); d = ImageDraw.Draw(im)
    frame(d, "方案 B · 裁切中國本土（x 88..1138 / y 84..860）+ 滿高 + 横向拖動", "750×695 · 可見 51/60 城")
    x0, y0, cw, ch = 88, 84, 1050, 776
    s = MAPH / ch
    ox = (W - cw * s) / 2 - x0 * s
    oy = MAPY - y0 * s
    paste_map(im, s, ox, oy)
    for i, (n, x, y) in enumerate(cities):
        sx, sy = x * s + ox, y * s + oy
        if -10 <= sx <= W + 10 and MAPY - 8 <= sy <= MAPY + MAPH + 8:
            ring(d, sx, sy, n, i % 2 == 0)
    # 两侧渐隐 + 拖动手势
    fade = Image.new("RGBA", (W, MAPH), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fade)
    for i in range(70):
        a = int(210 * (1 - i / 70))
        fd.line([(i, 0), (i, MAPH)], fill=(10, 12, 16, a))
        fd.line([(W - 1 - i, 0), (W - 1 - i, MAPH)], fill=(10, 12, 16, a))
    im.paste(fade, (0, MAPY), fade)
    d = ImageDraw.Draw(im)
    d.text((16, MAPY + MAPH / 2 - 8), "◀ 拖動", font=f17, fill=GOLD2)
    tw = d.textlength("拖動 ▶", font=f17)
    d.text((W - 16 - tw, MAPY + MAPH / 2 - 8), "拖動 ▶", font=f17, fill=GOLD2)
    d.rectangle([0, MAPY, W - 1, MAPY + MAPH - 1], outline=(58, 50, 34), width=1)
    footer(d, [
        (f"s = 695/776 = {s:.4f} → 裁切帶 940.4×695，横向可拖 ±95.2px；源可見寬 837px（79.7%）", GOLD),
        ("中央一屏 51/60；左隱 西涼/下弁/建寧/雲南，右隱 襄平/下邳/吳/會稽/夷州；城距 33.7px 起", DIM),
    ])
    return im

def mock_c(cities):
    im = Image.new("RGB", (W, H), DARK); d = ImageDraw.Draw(im)
    frame(d, "方案 C · 可縮放拖拽視口（圖示：放大到 1.24× 滿高）", "預設 1.00× · 最大 1.60×")
    s = MAPH / 960          # 1.236x of fit-width, exactly full height
    vw = W / s              # source width visible
    x0 = (1280 - vw) / 2
    ox, oy = -x0 * s, MAPY
    paste_map(im, s, ox, oy)
    for i, (n, x, y) in enumerate(cities):
        sx, sy = x * s + ox, y * s + oy
        if -10 <= sx <= W + 10:
            ring(d, sx, sy, n, i % 2 == 0)
    # 缩放 HUD
    d.rounded_rectangle([W - 190, MAPY + 10, W - 10, MAPY + 44], 8, fill=(14, 17, 22), outline=(150, 118, 62))
    d.text((W - 180, MAPY + 17), "縮放 1.24×（滿高）", font=f13, fill=GOLD2)
    # 小地图
    mmw, mmh = 132, 99
    mm = Image.open(MAP).convert("RGB").resize((mmw, mmh), Image.LANCZOS)
    mx, my = 12, MAPY + MAPH - mmh - 12
    im.paste(mm, (mx, my))
    d = ImageDraw.Draw(im)
    d.rectangle([mx, my, mx + mmw, my + mmh], outline=GOLD, width=1)
    rx0 = mx + x0 / 1280 * mmw; ry0 = my
    rx1 = mx + (x0 + vw) / 1280 * mmw; ry1 = my + mmh
    d.rectangle([rx0, ry0, rx1, ry1], outline=(255, 240, 200), width=2)
    # 双指手势图形
    cx, cy = W - 70, MAPY + MAPH - 46
    d.ellipse([cx - 18, cy - 10, cx - 2, cy + 6], outline=GOLD2, width=2)
    d.ellipse([cx + 2, cy - 16, cx + 18, cy], outline=GOLD2, width=2)
    d.line([(cx - 2, cy + 8), (cx + 2, cy - 18)], fill=GOLD, width=1)
    d.text((W - 120, MAPY + MAPH - 18), "雙指縮放 · 拖拽平移", font=f11, fill=GOLD2)
    d.rectangle([0, MAPY, W - 1, MAPY + MAPH - 1], outline=(58, 50, 34), width=1)
    footer(d, [
        (f"預設 s=750/1280=0.5859（仍有 66.25px 帶）；放大到 z=1.236 時 s={s:.4f}，可見源寬 {vw:.0f}px", GOLD),
        ("1.00× 時 60/60 一屏；1.24× 時約 51/60；1.60× 時約 40/60；需 pointer 手勢 + 反向座標", DIM),
    ])
    return im

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    cs = scen_cities()
    a, b, c = mock_a(cs), mock_b(cs), mock_c(cs)
    a.save(os.path.join(OUT, "v1_a.png"))
    b.save(os.path.join(OUT, "v1_b.png"))
    c.save(os.path.join(OUT, "v1_c.png"))
    comp = Image.new("RGB", (W, H * 3 + 8), (0, 0, 0))
    for i, im in enumerate((a, b, c)):
        comp.paste(im, (0, i * (H + 4)))
    comp.save(os.path.join(OUT, "v1_options.png"))
    print("ok", a.size, comp.size, len(cs))
