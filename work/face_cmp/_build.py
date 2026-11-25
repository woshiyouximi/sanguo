# -*- coding: utf-8 -*-
"""Build comparison cards + contact sheet + scene sims + thumbnail test.
Writes ONLY under F:/sanguo/work/face_cmp/"""
import os, json
from PIL import Image, ImageDraw, ImageFont

OUT = r"F:\sanguo\work\face_cmp"
HERO = r"F:\sanguo\game\web\assets\hero"
FPNG = r"F:\sanguo\export\png\SHAPE\FACE"

cov = json.load(open(os.path.join(OUT, "_cov.json"), encoding="utf-8"))
by_name = {r["name"]: r for r in cov["recs"]}

BG = (14, 17, 22)
PANEL = (30, 36, 44)
INK = (232, 232, 226)
DIM = (152, 160, 170)
GOLD = (216, 179, 106)

FONT = next((p for p in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf",
                         r"C:\Windows\Fonts\simsun.ttc"] if os.path.exists(p)), None)


def f(sz):
    return ImageFont.truetype(FONT, sz, index=0) if FONT else ImageFont.load_default()


def cover(im, w, h, pos=0.14):
    sw, sh = im.size
    s = max(w / sw, h / sh)
    nw, nh = max(w, int(round(sw * s))), max(h, int(round(sh * s)))
    r = im.resize((nw, nh), Image.LANCZOS)
    return r.crop(((nw - w) // 2, int(round((nh - h) * pos)), (nw - w) // 2 + w,
                   int(round((nh - h) * pos)) + h))


def fit(im, w, h):
    sw, sh = im.size
    s = min(w / sw, h / sh)
    return im.resize((max(1, int(sw * s)), max(1, int(sh * s))), Image.LANCZOS)


def load_pair(name):
    r = by_name[name]
    return (r,
            Image.open(os.path.join(FPNG, r["face_num"] + ".png")).convert("RGB"),
            Image.open(os.path.join(HERO, name + ".webp")).convert("RGB"))


def lab(d, xy, t, sz=15, c=DIM, anchor="la"):
    d.text(xy, t, font=f(sz), fill=c, anchor=anchor)


# ------------------------------------------------------------------ card
def card(name, path):
    r, o, a = load_pair(name)
    S = 2
    W, H = 860, 548
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 46], fill=(20, 24, 30))
    lab(d, (18, 9), name, 27, INK)
    lab(d, (W - 18, 14), f"id={r['id']}  {r['face_num']}  STR{r['str']} / INT{r['int']}", 15, DIM, "ra")
    tw, th = 100 * S, 120 * S
    xs = [28, 308, 588]
    y, yl = 70, 322
    im.paste(o.resize((tw, th), Image.NEAREST), (xs[0], y))
    lab(d, (xs[0], yl), "原作 100×120 → 2× 近邻", 15, GOLD)
    lab(d, (xs[0], yl + 20), "像素就这么多，再大是硬撑", 14, DIM)
    im.paste(o.resize((tw, th), Image.LANCZOS), (xs[1], y))
    lab(d, (xs[1], yl), "原创 → 2× 平滑插值", 15, GOLD)
    lab(d, (xs[1], yl + 20), "≈ 浏览器放大后的糊感", 14, DIM)
    im.paste(cover(a, tw, th), (xs[2], y))
    lab(d, (xs[2], yl), "AI 480×701 → 裁 200×240", 15, GOLD)
    lab(d, (xs[2], yl + 20), "cover + 顶部 14% 锚点（同游戏）", 14, DIM)

    y2 = 378
    im.paste(o.resize((100, 120), Image.LANCZOS), (28, y2))
    lab(d, (140, y2 + 4), "① 原作 1× 原生", 16, INK)
    lab(d, (140, y2 + 28), "游戏最大 88×110，1× 就够", 14, DIM)
    lab(d, (140, y2 + 50), "100×120 = 1.2 万像素", 14, DIM)
    im.paste(cover(a, 100, 120), (338, y2))
    lab(d, (450, y2 + 4), "② AI 裁到 100×120", 16, INK)
    lab(d, (450, y2 + 28), "480 源只用掉 3.6% 像素", 14, DIM)
    lab(d, (450, y2 + 50), "同框里脸小、身体抢戏", 14, DIM)
    im.paste(fit(a, 100, 146), (648, y2))
    lab(d, (760, y2 + 4), "③ AI 整幅", 16, INK)
    lab(d, (760, y2 + 28), "100×146", 14, DIM)
    lab(d, (760, y2 + 50), "见框即裁", 14, DIM)
    im.save(path, quality=92)


GROUPS = [
    ("head", ["關羽", "張飛", "趙雲", "諸葛亮", "曹操", "劉備", "孫權", "呂布",
              "司馬懿", "周瑜", "張遼", "關平", "黃忠", "馬超", "龐統", "姜維",
              "陸遜", "呂蒙", "夏侯惇", "張郃", "典韋", "許褚", "孫策", "董卓"]),
    ("female/foreign", ["貂蟬", "大喬", "小喬", "孫尚香", "祝融夫人", "孟獲", "兀突骨", "孟優"]),
    ("obscure", ["土安", "孔岫", "王頎", "吳綱", "卓膺", "金環三結", "胡班",
                 "帶來洞主", "張闓", "楊祚", "雷薄", "譚雄", "嚴政", "龔景"]),
]
picked = [(g, n) for g, ns in GROUPS for n in ns if n in by_name]
print("picked:", len(picked))

os.makedirs(os.path.join(OUT, "cards"), exist_ok=True)
for g, n in picked:
    card(n, os.path.join(OUT, "cards", n + ".png"))
print("cards ok")

# ------------------------------------------------------------------ contact
COLS, ROWS = 8, 6
BW, BH = 210, 156
CW, CH = COLS * BW + 24, ROWS * BH + 56
sheet = Image.new("RGB", (CW, CH), BG)
sd = ImageDraw.Draw(sheet)
lab(sd, (16, 12), "原作 100×120（左） vs AI 480×701 裁到 100×120（右） · 1:1 原始像素 · 46 将",
    19, INK)
for i, (g, n) in enumerate(picked[:COLS * ROWS]):
    r, o, a = load_pair(n)
    cx, cy = 14 + (i % COLS) * BW, 44 + (i // COLS) * BH
    sd.rectangle([cx - 3, cy - 3, cx + BW - 8, cy + BH - 8], fill=PANEL)
    sheet.paste(o.resize((100, 120), Image.NEAREST), (cx + 1, cy + 1))
    sheet.paste(cover(a, 100, 120), (cx + 103, cy + 1))
    lab(sd, (cx + 3, cy + 123), n, 15, GOLD)
    lab(sd, (cx + 104, cy + 125), f"id{r['id']}", 13, DIM)
sheet.save(os.path.join(OUT, "contact.png"), quality=92)
print("contact", sheet.size)

# ------------------------------------------------------------------ scene sim
SCENES = [("战斗 HUD", 86, 108), ("出征編成 主將", 88, 110),
          ("物品·武將头", 72, 92), ("列表缩略", 30, 40)]


def scene_sim(name, path):
    r, o, a = load_pair(name)
    S = 2.5
    W, H = 1250, 940
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    lab(d, (18, 12), f"{name} · 四个真实显示尺寸：原作（上） vs AI（下），按 750×1334 设计稿像素放大 2.5×",
        18, INK)
    lab(d, (18, 42), "原作源 100×120 → 缩到 86/88/72/30 宽：全部 <1.0×，等于无损缩小", 15, GOLD)
    yA = 74
    x = 28
    for t, w, h in SCENES:
        tw, th = int(w * S), int(h * S)
        im.paste(o.resize((tw, th), Image.LANCZOS), (x, yA))
        lab(d, (x, 360), t, 15, INK)
        lab(d, (x, 380), f"{w}×{h}", 14, DIM)
        x += max(tw, 150) + 54
    lab(d, (18, 412), "AI 源 480×701 → 同尺寸（CSS cover + 顶 14% 锚点）：只用掉 2.8~3.6% 像素，脸被推远", 15, GOLD)
    yB = 444
    x = 28
    for t, w, h in SCENES:
        tw, th = int(w * S), int(h * S)
        im.paste(cover(a, tw, th), (x, yB))
        lab(d, (x, 730), f"{t}（AI）", 15, INK)
        lab(d, (x, 750), f"{w}×{h}", 14, DIM)
        x += max(tw, 150) + 54
    # true 1:1 strip
    lab(d, (18, 790), "1:1 真实大小（不放大，就是设计稿上的实际像素）：左四张原作 / 右四张 AI", 14, DIM)
    xx = 28
    for t, w, h in SCENES:
        im.paste(o.resize((w, h), Image.LANCZOS), (xx, 818))
        xx += w + 12
    xx += 40
    for t, w, h in SCENES:
        im.paste(cover(a, w, h), (xx, 818))
        xx += w + 12
    im.save(path, quality=92)


for n in ("關羽", "孔岫", "貂蟬"):
    scene_sim(n, os.path.join(OUT, f"_scene_{n}.png"))
print("scene sims ok")

# ------------------------------------------------------------------ thumbnail legibility
def thumb_test(path):
    names = ["關羽", "曹操", "趙雲", "諸葛亮", "張飛", "呂布", "貂蟬", "孟獲",
             "孔岫", "胡班", "龔景", "譚雄"]
    S = 6
    COLS, ROWS = 4, 3
    tw, th = 30 * S, 40 * S
    BW = 2 * tw + 34
    BH = th + 62
    W, H = 24 + COLS * BW, 56 + ROWS * BH
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    lab(d, (18, 12), "列表缩略图实测：30×40（items.html .pick .it img）放大 6× — 每格左=原作 / 右=AI", 19, INK)
    lab(d, (18, 36), "原作的脸几乎占满 30×40；AI 的头只剩约 9×11 像素，认不出是谁", 15, GOLD)
    for i, n in enumerate(names):
        r, o, a = load_pair(n)
        cx = 14 + (i % COLS) * BW
        cy = 64 + (i // COLS) * BH
        d.rectangle([cx - 4, cy - 4, cx + BW - 10, cy + BH - 18], fill=PANEL)
        im.paste(o.resize((tw, th), Image.NEAREST), (cx, cy))
        im.paste(cover(a, tw, th), (cx + tw + 8, cy))
        lab(d, (cx, cy + th + 6), n, 16, GOLD)
        lab(d, (cx + tw + 8, cy + th + 6), f"id{r['id']}", 14, DIM)
    im.save(path, quality=92)


thumb_test(os.path.join(OUT, "_thumb30x40.png"))

# ------------------------------------------------------------------ upscale ladder
def ladder(path):
    r, o, a = load_pair("關羽")
    steps = [(100, 120, "1× 原生 100×120", Image.NEAREST),
             (200, 240, "2× 近邻（像素块）", Image.NEAREST),
             (200, 240, "2× 平滑（发糊）", Image.LANCZOS),
             (300, 360, "3× 近邻（台阶）", Image.NEAREST),
             (300, 360, "3× 平滑（糊成一片）", Image.LANCZOS)]
    W, H = 1460, 500
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    lab(d, (18, 12), "關羽 原作放大阶梯：100×120 = 1.2 万像素，任何超过 ~150px 宽的显示都在硬撑", 19, INK)
    x = 20
    for w, h, t, res in steps:
        im.paste(o.resize((w, h), res), (x, 52))
        lab(d, (x, 52 + h + 6), t, 14, GOLD)
        x += w + 24
    ai = fit(a, 300, 701)
    im.paste(ai, (x, 52))
    lab(d, (x, 52 + ai.size[1] + 6), f"AI 原生 {a.size[0]}×{a.size[1]}", 14, GOLD)
    im.save(path, quality=92)


ladder(os.path.join(OUT, "_upscale_guanyu.png"))
print("done. files:", len(os.listdir(OUT)))
