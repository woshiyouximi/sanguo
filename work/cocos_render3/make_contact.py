#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build work/cocos_render3/contact.png — 四页 before/after 对照页.

四行（大地圖 / 內政 / 物品 / 編成）× 两列（before / after），每格下标 page 名与色数。
色数用主口径（cstat.py 同一个函数语义）：750x1334 NEAREST 半分辨率 375x667 下
出现次数 >= 8 的 RGB 值个数。脚本自己重算一遍，并与 cstat.py 的既有数字对齐校验。

Usage: python make_contact.py   （输出路径固定 work/cocos_render3/contact.png）
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "contact.png")
THR = 8
FONTS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fontcensus.json")

PAGES = [
    ("大地圖", "b3_before_campaign.png", "campaign"),
    ("內政", "b3_before_city.png", "city"),
    ("物品", "b3_before_items.png", "items"),
    ("編成", "b3_before_deploy.png", "deploy"),
]
# after 截图的前缀（默认 b3g；本轮补拍用 b3h）
AFTER_PREFIX = "b3g"

# 与 cstat.py 完全同一口径：半分辨率 + count >= 8
def ge8(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    half = im.resize((w // 2, h // 2), Image.NEAREST) if w * h > 400000 else im
    cols = half.getcolors(maxcolors=1 << 24)
    return sum(1 for (n, _c) in cols if n >= THR)


def font(size):
    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf"):
        p = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def font_count(key):
    """同屏字号数（steps_fontcensus.mjs 的 after 普查结果，落在 fontcensus.json）。"""
    try:
        with open(FONTS_JSON, encoding="utf-8") as fp:
            data = json.load(fp)
        return data.get(key, {}).get("sizes")
    except Exception:
        return None


def main():
    global AFTER_PREFIX
    if len(sys.argv) > 1:
        AFTER_PREFIX = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    cell_w, cell_h = 300, 534          # 750x1334 * 0.4
    cap_h, gap, margin, title_h, head_h = 36, 14, 18, 88, 30
    cols_n, rows_n = 2, len(PAGES)
    width = margin * 2 + cell_w * cols_n + gap
    height = title_h + head_h + rows_n * (cell_h + cap_h + gap) + margin
    sheet = Image.new("RGB", (width, height), "#0E0C0A")
    d = ImageDraw.Draw(sheet)
    f_title, f_head, f_cap = font(24), font(18), font(18)

    d.text((margin, 12), "三國群英傳 2 · Cocos 渲染對齊第 3 輪 · before / after", font=f_title, fill="#E8D6A8")
    f_sub = font(14)
    d.text((margin, 44), "色數口徑：750×1334 半分辨率 375×667，出現次數 ≥8 的 RGB 值個數", font=f_sub, fill="#9C9182")
    d.text((margin, 62), "（與 cstat.py 同一個統計函數；before=第 1 轮后 13:17 构建，after=本轮官方构建）", font=f_sub, fill="#7A6F62")
    d.text((margin, 76), "字級 = 同屏實際可見 Label 的字號種數（steps_fontcensus.mjs，只算 activeInHierarchy 為真者）", font=f_sub, fill="#7A6F62")

    for ci, head in enumerate(("before（第 1 轮后 · 13:17 构建）", "after（本轮 · 官方构建）")):
        x = margin + ci * (cell_w + gap)
        d.text((x, title_h + 2), head, font=f_head, fill="#D8B36A")

    if not os.path.exists(os.path.join(here, PAGES[0][1])):
        raise SystemExit("missing before shot: %s" % PAGES[0][1])

    for ri, (name, before, after_key) in enumerate(PAGES):
        y = title_h + head_h + ri * (cell_h + cap_h + gap)
        for ci, rel in enumerate((before, "%s_%s.png" % (AFTER_PREFIX, after_key))):
            x = margin + ci * (cell_w + gap)
            src_path = os.path.join(here, rel)
            im = Image.open(src_path).convert("RGB").resize((cell_w, cell_h), Image.LANCZOS)
            sheet.paste(im, (x, y))
            d.rectangle([x, y, x + cell_w - 1, y + cell_h - 1], outline="#3B3227")
            n = ge8(src_path)
            d.rectangle([x, y + cell_h, x + cell_w - 1, y + cell_h + cap_h - 1], fill="#16130F")
            cap = "%s · %d 色" % (name, n)
            if ci == 1:
                sizes = font_count(after_key)
                if sizes:
                    cap += " · %d 字級" % sizes
            d.text((x + 8, y + cell_h + 7), cap, font=f_cap, fill="#E8D6A8")

    sheet.save(OUT)
    print("wrote %s  %dx%d  %d bytes" % (OUT, width, height, os.path.getsize(OUT)))


if __name__ == "__main__":
    main()
