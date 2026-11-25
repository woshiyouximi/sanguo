# 像素尺寸对比表：原作 FORCE 原帧 / 图集帧 / 屏上（改前 66、改后 75）→ 打印 markdown 行。
import json
import os

from PIL import Image

FORCE = r"F:\sanguo\export\png\SHAPE\FORCE"
ANIM = r"F:\sanguo\game\web\anim"
TROOPS = [
    (0, "朴刀", "podao", "A"),
    (1, "长枪", "changqiang", "C"),
    (2, "大刀", "dadao", "D"),
    (3, "弓箭", "archer", "F"),
    (4, "链锤", "lianchui", "I"),
    (5, "飞刀", "feidao", "H"),
    (6, "武斗", "wudou", "J"),
    (7, "蛮族", "manzu", "K"),
    (8, "铁锤", "tiechui", "E"),
    (9, "藤甲", "tengjia", "L"),
    (10, "黄巾", "huangjin", "M"),
    (11, "弩兵", "nu", "B"),
    (12, "女兵", "nvbing", "G"),
]
DESIGN_W, DESIGN_H = 750, 1334
FIELD_H = 900
ORIG_W, ORIG_H = 640, 480


def bbox(im):
    b = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    return b


def main():
    j = json.load(open(os.path.join(ANIM, "units.json"), encoding="utf-8"))
    page = Image.open(os.path.join(ANIM, j["pages"][0]["file"])).convert("RGBA")
    rects = {s["name"]: s for s in j["pages"][0]["sprites"]}
    print("| # | 兵种 | 组 | 原作字母 | 原作 raw bbox | 图集帧画布 | 图集内本体 bbox | 屏上 改前 66 | 屏上 改后 75 | 改后/屏宽 |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    rows = []
    for idx, name, g, letter in TROOPS:
        raw = None
        for pat in (f"M{letter}R10001.png", f"N{letter}R10001.png"):
            p = os.path.join(FORCE, pat)
            if os.path.exists(p):
                raw = Image.open(p).convert("RGBA")
                break
        rb = bbox(raw)
        rw, rh = rb[2] - rb[0], rb[3] - rb[1]
        s = rects[f"{g}_walk_00"]
        cell = page.crop((s["x"], s["y"], s["x"] + s["w"], s["y"] + s["h"]))
        ab = bbox(cell)
        aw, ah = ab[2] - ab[0], ab[3] - ab[1]
        bw = round(aw * 66 / s["w"], 1)
        bh = round(ah * 66 / s["w"], 1)
        aw2, ah2 = aw, ah
        pct = round(aw2 / DESIGN_W * 100, 1)
        rows.append((idx, name, g, letter, rw, rh, s["w"], s["h"], aw, ah, bw, bh, aw2, ah2, pct))
        print(
            f"| {idx} | {name} | `{g}` | {letter} | {rw}×{rh} | {s['w']}×{s['h']} | {aw}×{ah} | "
            f"{bw}×{bh} | {aw2}×{ah2} | {pct}% |"
        )
    meanw = sum(r[8] for r in rows) / len(rows)
    meanh = sum(r[9] for r in rows) / len(rows)
    print()
    print(f"avg body in atlas: {meanw:.1f}×{meanh:.1f}")
    print(f"screen before 66/75: {meanw * 66 / 75:.1f}×{meanh * 66 / 75:.1f}  -> {meanw * 66 / 75 / DESIGN_W * 100:.1f}% / {meanh * 66 / 75 / DESIGN_H * 100:.1f}% / {meanh * 66 / 75 / FIELD_H * 100:.1f}%")
    print(f"screen after  75/75: {meanw:.1f}×{meanh:.1f}  -> {meanw / DESIGN_W * 100:.1f}% / {meanh / DESIGN_H * 100:.1f}% / {meanh / FIELD_H * 100:.1f}%")
    print(f"original: {ORIG_W}x{ORIG_H} -> body width% ? height% ? (raw avg {sum(r[5] for r in rows) / 13:.1f})")
    print(f"phone 390x844: cssW=357 scale={357 / 750:.3f} -> before {meanw * 66 / 75 * 357 / 750:.1f} css px, after {meanw * 357 / 750:.1f} css px")


if __name__ == "__main__":
    main()
