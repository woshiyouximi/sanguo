# -*- coding: utf-8 -*-
"""把 13 张切兵种截图做量化比对 + 裁出放大素材。

产出：
  work/troopmap/_zoom/<i>_<group>.png   每兵种 90x100 战场像素 ×4（NEAREST）
  work/troopmap/_screen_diff.json       13×13 屏幕像素差异（判断"切兵种到底变没变/像不像"）
  work/troopmap/_montage6.png           6 个兵种 3x2 拼图（人眼判断用）
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"F:\sanguo")
OUT = ROOT / "work" / "troopmap"
RAW = OUT / "_raw"
ZOOM = OUT / "_zoom"
TAG = "before"
TROOPS = [
    (0, "podao", "朴刀"), (1, "changqiang", "長槍"), (2, "dadao", "大刀"),
    (3, "archer", "弓箭"), (4, "lianchui", "鍊錘"), (5, "feidao", "飛刀"),
    (6, "wudou", "武鬥"), (7, "manzu", "蠻族"), (8, "tiechui", "鐵鎚"),
    (9, "tengjia", "籐甲"), (10, "huangjin", "黃巾"), (11, "nu", "弩"),
    (12, "nvbing", "女兵"),
]
# 一个前排士兵的屏幕矩形（design 坐标，见 expr_units 的 sample: sx 348.2 / sy 736.3）
BOX = (312, 668, 402, 768)   # 90x100
BAND = (80, 640, 680, 1080)  # 整排士兵（比对用）


def load(i):
    p = RAW / f"{TAG}_A{i:02d}_B{i:02d}.png"
    return Image.open(p).convert("RGB")


def main():
    ZOOM.mkdir(parents=True, exist_ok=True)
    ims = {}
    for i, g, cn in TROOPS:
        ims[i] = load(i)

    # 1) 屏幕差异矩阵（同一 tick/同一阵型，只有兵种不同）
    print("== 屏幕像素差异（整排士兵区 600x440，mean abs diff / 明显变化像素占比）==")
    diff = {}
    keys = [t[0] for t in TROOPS]
    for i in keys:
        for j in keys:
            if j <= i:
                continue
            a = ims[i].crop(BAND).load()
            b = ims[j].crop(BAND).load()
            w, h = BAND[2] - BAND[0], BAND[3] - BAND[1]
            tot = 0
            n = 0
            big = 0
            for y in range(0, h, 2):
                for x in range(0, w, 2):
                    pa, pb = a[x, y], b[x, y]
                    d = abs(pa[0] - pb[0]) + abs(pa[1] - pb[1]) + abs(pa[2] - pb[2])
                    tot += d
                    n += 1
                    if d > 30:
                        big += 1
            diff[f"{i}-{j}"] = [round(tot / n / 3, 2), round(big / n * 100, 1)]
    pairs = sorted(diff.items(), key=lambda kv: kv[1][0])
    print("  最不像的 6 对：", pairs[:6])
    print("  最像的 6 对  ：", pairs[-6:])
    same = [k for k, v in diff.items() if v[1] < 0.5]
    print("  「切了兵种但画面几乎没变」的对：", same if same else "无")
    (OUT / "_screen_diff.json").write_text(json.dumps(diff, ensure_ascii=False, indent=1), encoding="utf-8")

    # 2) 每兵种放大裁剪
    for i, g, cn in TROOPS:
        c = ims[i].crop(BOX)
        c.resize((c.width * 4, c.height * 4), Image.NEAREST).save(ZOOM / f"{i:02d}_{g}.png")

    # 3) 6 兵种拼图
    pick = [0, 3, 8, 10, 11, 12]
    cell = 360
    sheet = Image.new("RGB", (cell * 3, (cell + 26) * 2), (18, 20, 24))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 22)
    except Exception:
        font = ImageFont.load_default()
    for k, i in enumerate(pick):
        g = [t for t in TROOPS if t[0] == i][0]
        c = ims[i].crop(BOX).resize((cell, cell), Image.NEAREST)
        x = (k % 3) * cell
        y = (k // 3) * (cell + 26)
        sheet.paste(c, (x, y + 26))
        d.text((x + 8, y + 2), f"#{i} {g[1]} / {g[2]}", fill=(230, 220, 190), font=font)
    sheet.save(OUT / "_montage6.png")
    print("wrote", OUT / "_montage6.png", sheet.size)


if __name__ == "__main__":
    main()
