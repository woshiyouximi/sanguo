# 生成 189 兵种图集核对用的对比图：
#   before_<group>.png / after_<group>.png  —— 同一兵种同一 tick 的屏上放大（4x NEAREST）
#   compare_sheet.png                        —— 13 兵种 before|after 总表（3x）
#   compare_orig.png                         —— 原作 raw 1:1 / 图集 75 1:1 / 屏上 after 1:1（2x）
# 用法：python make_compare.py
import json
import os

from PIL import Image, ImageDraw, ImageFont

RAW = r"F:\sanguo\work\troopmap\_raw"
OUT = r"F:\sanguo\work\troopmap"
FORCE = r"F:\sanguo\export\png\SHAPE\FORCE"
ANIM = r"F:\sanguo\game\web\anim"

# 兵种号 → (组名, 原作字母, 中文名)，顺序与 game/data/troops.json 的 names 一致
TROOPS = [
    ("podao", "A", "朴刀"),
    ("changqiang", "C", "长枪"),
    ("dadao", "D", "大刀"),
    ("archer", "F", "弓箭"),
    ("lianchui", "I", "链锤"),
    ("feidao", "H", "飞刀"),
    ("wudou", "J", "武斗"),
    ("manzu", "K", "蛮族"),
    ("tiechui", "E", "铁锤"),
    ("tengjia", "L", "藤甲"),
    ("huangjin", "M", "黄巾"),
    ("nu", "B", "弩兵"),
    ("nvbing", "G", "女兵"),
]
BOX = (305, 652, 415, 778)  # 前排一个士兵（底边地面点固定，改前/改后同框）


def font(size):
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def screen(tag, idx):
    p = os.path.join(RAW, f"{tag}_A{idx:02d}_B{idx:02d}.png")
    im = Image.open(p).convert("RGB")
    return im.crop(BOX)


def atlas_frames():
    j = json.load(open(os.path.join(ANIM, "units.json"), encoding="utf-8"))
    page = Image.open(os.path.join(ANIM, j["pages"][0]["file"])).convert("RGBA")
    rects = {s["name"]: (s["x"], s["y"], s["w"], s["h"]) for s in j["pages"][0]["sprites"]}
    return page, rects


def raw_shape(letter, frame=1):
    """原作 FORCE 的 Walk 首帧（M 侧 = 我方蓝）。返回 bbox 裁好的 RGBA。"""
    for pat in (f"M{letter}R1{frame:04d}.png", f"N{letter}R1{frame:04d}.png"):
        p = os.path.join(FORCE, pat)
        if os.path.exists(p):
            return Image.open(p).convert("RGBA")
    return None


def grid(label_w, cells, scale, pad=8, cap=None):
    """cells: [[(img, caption)] ...] 行×列。返回拼好的 RGB 图。"""
    f = font(15)
    fh = font(19)
    cw = max(c[0].width for row in cells for c in row) * scale
    ch = max(c[0].height for row in cells for c in row) * scale
    cap_h = 20 if cap else 0
    rows = len(cells)
    cols = max(len(r) for r in cells)
    W = pad + label_w + cols * (cw + pad) + pad
    H = pad + rows * (ch + cap_h + pad) + pad
    out = Image.new("RGB", (W, H), (24, 22, 20))
    d = ImageDraw.Draw(out)
    for ri, row in enumerate(cells):
        y = pad + ri * (ch + cap_h + pad)
        for ci, (img, text) in enumerate(row):
            x = pad + label_w + ci * (cw + pad)
            big = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
            out.paste(big, (x, y + cap_h))
            if cap:
                d.text((x, y + 1), text, font=f, fill=(226, 214, 190))
    return out, pad, label_w, cw, ch, cap_h


def main():
    page, rects = atlas_frames()
    # 1) 逐兵种 before/after 放大图
    for i, (g, _l, _n) in enumerate(TROOPS):
        for tag in ("before", "after"):
            im = screen(tag, i)
            im.resize((im.width * 4, im.height * 4), Image.NEAREST).save(os.path.join(OUT, f"{tag}_{g}.png"))

    # 2) 13 兵种 before|after 总表：每个兵种一块「标签 + 改前 + 改后」，一行放 2 个兵种
    SC = 2  # 2x NEAREST
    cw, chh = (BOX[2] - BOX[0]) * SC, (BOX[3] - BOX[1]) * SC
    lab_w, pad_y = 150, 6
    block_w = lab_w + 2 * (cw + pad_y) + 14
    block_h = chh + 22
    per_row = 2
    rows_n = (len(TROOPS) + per_row - 1) // per_row
    W = 12 + per_row * block_w
    H = 40 + rows_n * (block_h + 10) + 12
    sheet = Image.new("RGB", (W, H), (24, 22, 20))
    d = ImageDraw.Draw(sheet)
    fn, fs, ft = font(20), font(14), font(15)
    d.text((12, 10), "189 兵種圖集核對：同一 tick（60）、同一陣型，只換兵種；2x NEAREST", font=ft, fill=(150, 150, 150))
    for i, (g, letter, name) in enumerate(TROOPS):
        bx = 12 + (i % per_row) * block_w
        by = 40 + (i // per_row) * (block_h + 10)
        d.text((bx, by + 2), f"#{i} {name}", font=fn, fill=(255, 226, 168))
        d.text((bx, by + 26), f"{g} · 原作{letter}", font=fs, fill=(176, 196, 176))
        for ci, (tag, cap) in enumerate((("before", "改前 66 寬（0.88 縮）"), ("after", "改後 75 寬（1:1）"))):
            im = screen(tag, i)
            big = im.resize((im.width * SC, im.height * SC), Image.NEAREST)
            x = bx + lab_w + ci * (cw + pad_y)
            sheet.paste(big, (x, by + 22))
            d.text((x + 2, by + 2), cap, font=fs, fill=(226, 214, 190))
    sheet.save(os.path.join(OUT, "compare_sheet.png"))

    # 3) 原作 raw 1:1 | 图集帧 75 1:1 | 屏上 after 1:1
    picks = [0, 3, 8, 10, 11, 12]
    rows = []
    for i in picks:
        g, letter, name = TROOPS[i]
        raw = raw_shape(letter)
        ax, ay, aw, ah = rects[f"{g}_walk_00"]
        atl = page.crop((ax, ay, ax + aw, ay + ah))
        scr = screen("after", i)
        cell_raw = raw if raw else Image.new("RGBA", (aw, ah), (0, 0, 0, 0))
        rows.append([(cell_raw, f"原作 {raw.width}×{raw.height}" if raw else "原作缺"), (atl, f"图集帧 {aw}×{ah}"), (scr, f"屏上 {scr.width}×{scr.height}")])
    pad = 10
    cells = [[(c[0].convert("RGB"), c[1]) for c in row] for row in rows]
    sheet2, pad, lw, cw, ch, caph = grid(150, cells, 2, cap=True)
    d = ImageDraw.Draw(sheet2)
    fn = font(17)
    for ri, i in enumerate(picks):
        g, letter, name = TROOPS[i]
        y = pad + ri * (ch + caph + pad)
        d.text((pad + 4, y + caph + 6), f"{name}", font=fn, fill=(255, 226, 168))
        d.text((pad + 4, y + caph + 30), f"原作{letter}", font=font(14), fill=(176, 196, 176))
    sheet2.save(os.path.join(OUT, "compare_orig.png"))
    print("ok", os.path.join(OUT, "compare_sheet.png"), sheet.size, os.path.join(OUT, "compare_orig.png"), sheet2.size)


if __name__ == "__main__":
    main()
