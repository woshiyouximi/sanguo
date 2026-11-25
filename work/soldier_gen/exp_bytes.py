# -*- coding: utf-8 -*-
"""体积实验：固定画布 W、按 offy 裁高、试 k（降采样）+ 调色板，量 PNG 字节。"""
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"F:\sanguo")
PNG = ROOT / "export" / "png" / "SHAPE" / "FORCE"
MAN = json.loads((ROOT / "export" / "manifest_art.json").read_text(encoding="utf-8"))
FORCE = {m["path"].replace("\\", "/").split("/")[-1].rsplit(".", 1)[0].upper(): m
         for m in MAN if m["path"].replace("\\", "/").upper().startswith("SHAPE/FORCE/")}
SOL = json.loads((ROOT / "work" / "soldier_gen" / "soldiers_raw.json").read_text(encoding="utf-8"))

BLUE = [o for o in SOL if o["obj"] <= 44]


def open_any(stem):
    p = PNG / (stem + ".png")
    if not p.exists():
        for q in PNG.glob("*.png"):
            if q.stem.upper() == stem.upper():
                p = q
                break
    return Image.open(p).convert("RGBA")


def frame(stem, W, k, skirt=4):
    md = FORCE[stem.upper()]
    im = open_any(stem)
    if k != 1.0:
        nw, nh = max(1, round(im.width * k)), max(1, round(im.height * k))
        im = im.resize((nw, nh), Image.LANCZOS)
        ox, oy = md["offx"] * k, md["offy"] * k
    else:
        ox, oy = md["offx"], md["offy"]
    cw = round(W * k)
    ch = round((md["offy"] + skirt) * k)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    # 脚底锚点 -> 画布底边中点（锚点上移 skirt）
    ax = cw // 2
    ay = ch - round(skirt * k)
    canvas.alpha_composite(im, (round(ax - ox), round(ay - oy)))
    return canvas


def size(im, mode):
    b = io.BytesIO()
    if mode == "rgba":
        im.save(b, "PNG", optimize=True)
    elif mode == "p8":
        im.save(b, "PNG", optimize=True)  # P 模式需要先转换
    return len(b.getvalue())


def main():
    frames = []
    for o in BLUE:
        for act in ("Walk", "Attack"):
            frames += o["anims"][act]
    print("frames", len(frames))
    for W in (120, 108):
        for k in (1.0, 0.75, 0.5):
            ims = [frame(s, W, k) for s in frames]
            # 拼成一张，测「一张图」的体积（更像真实图集）
            cw = ims[0].width
            ch = max(i.height for i in ims)
            cols = 8
            rows = (len(ims) + cols - 1) // cols
            page = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
            for i, im in enumerate(ims):
                page.alpha_composite(im, ((i % cols) * cw, (i // cols) * ch))
            b = io.BytesIO()
            page.save(b, "PNG", optimize=True)
            rgba = len(b.getvalue())
            # 调色板 256（全图共享）
            alpha = page.getchannel("A")
            q = page.convert("RGB").quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE)
            q.paste(255, mask=alpha.point(lambda v: 255 if v >= 128 else 0))
            b2 = io.BytesIO()
            q.save(b2, "PNG", optimize=True, bits=8)
            print("W=%3d k=%.2f  canvas=%dx%d  rgba=%7d  p8=%7d  px=%.2fM"
                  % (W, k, page.width, page.height, rgba, len(b2.getvalue()),
                     page.width * page.height / 1e6))


main()
