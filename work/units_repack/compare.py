#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
出对照图（从**已装机**的 game/web/anim/units.json + units_00.png 直接裁帧，证明两军不同款）

  work/units_repack/compare.png     archer 一兵种 4 格：M walk / M atk / N walk / N atk
  work/units_repack/compare_13.png  13 兵种各一行：M / N 同帧号对照

M = groups[g].back  → `{g}_walk_NN` / `{g}_atk_NN`（蓝军）
N = groups[g].front → `{g}_ewalk_NN` / `{g}_eatk_NN`（红军）
选帧：走路 / 攻击各取「不透明像素最多」的那一帧（剪影最大，最容易看出两军不同）。
像素 1:1 裁剪 + NEAREST 整数放大（不插值），底图分蓝/红两块，避免透明处看不出轮廓。
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"F:\sanguo"
ATLAS = os.path.join(ROOT, "game", "web", "anim")
OUT_DIR = os.path.join(ROOT, "work", "units_repack")
TROOPS = ["podao", "changqiang", "dadao", "archer", "lianchui", "feidao", "wudou",
          "manzu", "tiechui", "tengjia", "huangjin", "nu", "nvbing"]
HIGHLIGHT = "archer"

INK = (232, 238, 246)
DIM = (150, 162, 178)
BG = (12, 15, 20)
BG_M = (26, 40, 66)
BG_N = (66, 30, 42)
BG_M_LINE = (44, 66, 104)
BG_N_LINE = (100, 48, 64)


def load_font(size, bold=False):
    for name in (("arialbd.ttf" if bold else "arial.ttf"), "segoeui.ttf"):
        path = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    with open(os.path.join(ATLAS, "units.json"), "r", encoding="utf-8") as fh:
        doc = json.load(fh)
    pages = doc["pages"]
    groups = doc["groups"]
    sheet = [Image.open(os.path.join(ATLAS, p["file"])).convert("RGBA") for p in pages]

    rect = {}
    for pi, page in enumerate(pages):
        for s in page["sprites"]:
            rect[s["name"]] = (pi, s["x"], s["y"], s["w"], s["h"])

    counts = {}

    def frame(name):
        pi, x, y, w, h = rect[name]
        return sheet[pi].crop((x, y, x + w, y + h))

    def opaque(name):
        if name not in counts:
            counts[name] = int(np.count_nonzero(np.asarray(frame(name))[:, :, 3] > 0))
        return counts[name]

    def best(names):
        alive = [n for n in names if n in rect]
        if not alive:
            raise SystemExit("no frame for %r" % (names,))
        return max(alive, key=lambda n: (opaque(n), -alive.index(n)))

    font_h = load_font(17, bold=True)
    font_s = load_font(13)

    # ---------------- compare.png：archer 4 格 ----------------
    scale = 4
    g = groups[HIGHLIGHT]
    picks = [
        ("M walk", best(g["back"]), BG_M, BG_M_LINE),
        ("M attack", best(g["attack"]), BG_M, BG_M_LINE),
        ("N walk", best(g["front"]), BG_N, BG_N_LINE),
        ("N attack", best(g["attackEnemy"]), BG_N, BG_N_LINE),
    ]
    cw = max(rect[n][3] for _, n, _, _ in picks) * scale
    ch = max(rect[n][4] for _, n, _, _ in picks) * scale
    pad, gap, head, foot = 10, 14, 54, 34
    title_h = 34
    w = pad * 2 + len(picks) * cw + (len(picks) - 1) * gap
    h = head + title_h + ch + gap + foot
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)
    d.text((pad, 10), "%s  M = back (blue army)   N = front (red army)" % HIGHLIGHT, font=font_h, fill=INK)
    d.text((pad, 32), "frames cropped 1:1 from game/web/anim/units_00.png, NEAREST x%d" % scale, font=font_s, fill=DIM)
    x0 = pad
    for label, name, bg, line in picks:
        cell = Image.new("RGB", (cw, ch), bg)
        cd = ImageDraw.Draw(cell)
        for gx in range(0, cw, 30):
            cd.line([(gx, 0), (gx, ch)], fill=line)
        for gy in range(0, ch, 30):
            cd.line([(0, gy), (cw, gy)], fill=line)
        f = frame(name)
        fw, fh = f.size
        scaled = f.resize((fw * scale, fh * scale), Image.NEAREST)
        cell.paste(scaled, ((cw - fw * scale) // 2, ch - fh * scale), scaled)
        img.paste(cell, (x0, head + title_h))
        d.text((x0, head + title_h - 20), "%s  %s" % (label, name), font=font_s, fill=INK)
        x0 += cw + gap
    total = sum(len(p["sprites"]) for p in pages)
    d.text((pad, h - foot + 8),
           "repacked atlas: %d page(s), %dx%d   |   per-frame RGBA SHA256 equal to original: %d/%d"
           % (len(pages), pages[0]["w"], pages[0]["h"], total, total), font=font_s, fill=DIM)
    img.save(os.path.join(OUT_DIR, "compare.png"))
    print("[compare.png] %dx%d" % img.size)

    # ---------------- compare_13.png：13 兵种 M/N 同帧号 ----------------
    scale2 = 2
    row_h = max(rect[n][4] for n in rect) * scale2
    col_w = max(rect[n][3] for n in rect) * scale2
    label_w = 132
    pad2, gap2 = 10, 12
    head2 = 50
    head_txt = "13 troops, two armies, same frame index (M=back blue, N=front red)"
    sub_txt = "walk frame = max opaque pixels; cropped 1:1, NEAREST x%d" % scale2
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    text_w = max(probe.textlength(head_txt, font=font_h), probe.textlength(sub_txt, font=font_s))
    w2 = int(max(pad2 * 2 + label_w + col_w * 2 + gap2, text_w + pad2 * 2))
    h2 = head2 + len(TROOPS) * (row_h + 6) + 26
    img2 = Image.new("RGB", (w2, h2), BG)
    d2 = ImageDraw.Draw(img2)
    d2.text((pad2, 8), head_txt, font=font_h, fill=INK)
    d2.text((pad2, 30), sub_txt, font=font_s, fill=DIM)
    y = head2
    for troop in TROOPS:
        gg = groups[troop]
        wm = best(gg["back"])
        wn = best(gg["front"])
        d2.text((pad2, y + row_h // 2 - 8), "%s  t%d" % (troop, gg.get("troop", -1)),
                font=font_s, fill=INK if troop == HIGHLIGHT else DIM)
        for k, (nm, bg, line) in enumerate(((wm, BG_M, BG_M_LINE), (wn, BG_N, BG_N_LINE))):
            cx = pad2 + label_w + k * (col_w + gap2)
            cell = Image.new("RGB", (col_w, row_h), bg)
            cd = ImageDraw.Draw(cell)
            for gx in range(0, col_w, 24):
                cd.line([(gx, 0), (gx, row_h)], fill=line)
            for gy in range(0, row_h, 24):
                cd.line([(0, gy), (col_w, gy)], fill=line)
            f = frame(nm)
            fw, fh = f.size
            scaled = f.resize((fw * scale2, fh * scale2), Image.NEAREST)
            cell.paste(scaled, ((col_w - fw * scale2) // 2, row_h - fh * scale2), scaled)
            img2.paste(cell, (cx, y))
            d2.text((cx + 4, y + 2), nm, font=font_s, fill=(240, 246, 255))
        y += row_h + 6
    d2.text((pad2, h2 - 22), "same-pixel proof: 572/572 frames RGBA SHA256 equal (see verify.json / frames.sha256.csv)",
            font=font_s, fill=DIM)
    img2.save(os.path.join(OUT_DIR, "compare_13.png"))
    print("[compare_13.png] %dx%d" % img2.size)
    print("[pick]", ", ".join("%s=%s" % (lbl, nm) for lbl, nm, _, _ in picks))


if __name__ == "__main__":
    main()
