# -*- coding: utf-8 -*-
"""把 terrain_*.png 按 y 轴切成 远/中/近 三层（带羽化），并出视差演示拼版。

用法：
  python split_layers.py            # 切 12 张 + 出 work/env_parallax_demo.jpg
输出：
  project/art_ref/cloud_env_v1_layers/terrain_XX_{far,mid,near}.png   （RGBA，832 宽）
  work/env_parallax_demo.jpg                                        （4 张代表作：三层分解 + 错位合成）
"""
import os
from pathlib import Path

from PIL import Image, ImageDraw

SRC = Path(r"F:\sanguo\project\art_ref\cloud_env_v1")
OUT = Path(r"F:\sanguo\project\art_ref\cloud_env_v1_layers")
DEMO = Path(r"F:\sanguo\work\env_parallax_demo.jpg")

# 分带（按画面高度比例）：远天际 0-20%、中景障碍 20-48%、近景地面 48-100%
CUT = (0.20, 0.48)
FEATHER = 26  # 羽化像素，避免硬切边


def band_mask(h, top, bottom, feather=FEATHER):
    """返回 (h,1) 的 L 掩膜：top..bottom 为 255，两端 feather 内线性过渡。"""
    m = Image.new("L", (1, h), 0)
    px = m.load()
    for y in range(h):
        if y < top - feather or y > bottom + feather:
            v = 0
        elif y < top:
            v = int(255 * (y - (top - feather)) / feather)
        elif y <= bottom:
            v = 255
        else:
            v = int(255 * ((bottom + feather) - y) / feather)
        px[0, y] = max(0, min(255, v))
    return m.resize((1, h))


def split(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    y1, y2 = int(h * CUT[0]), int(h * CUT[1])
    layers = {}
    for name, (top, bottom) in {
        "far": (0, y1),
        "mid": (y1, y2),
        "near": (y2, h),
    }.items():
        mask = band_mask(h, top, bottom).resize((w, h))
        layer = im.copy()
        layer.putalpha(mask)
        layers[name] = layer
    return layers


def checker(w, h, step=24):
    im = Image.new("RGB", (w, h), (232, 232, 232))
    d = ImageDraw.Draw(im)
    for y in range(0, h, step):
        for x in range(0, w, step):
            if (x // step + y // step) % 2:
                d.rectangle([x, y, x + step - 1, y + step - 1], fill=(204, 204, 204))
    return im


def compose(layers, offset, size):
    """把三层按水平错位叠加（far 不动，mid -offset*0.5，near -offset），返回 RGB。"""
    w, h = size
    canvas = Image.new("RGB", (w, h), (26, 22, 20))
    for name, dx in (("far", 0), ("mid", -int(offset * 0.5)), ("near", -offset)):
        lay = layers[name]
        if dx == 0:
            canvas.paste(lay, (0, 0), lay)
        else:
            # 用镜像延展补左右空档，模拟无限滚动
            wide = Image.new("RGBA", (w * 3, h), (0, 0, 0, 0))
            wide.paste(lay, (w, 0))
            wide.paste(lay.transpose(Image.FLIP_LEFT_RIGHT), (0, 0))
            wide.paste(lay.transpose(Image.FLIP_LEFT_RIGHT), (w * 2, 0))
            crop = wide.crop((w + dx, 0, w + dx + w, h))
            canvas.paste(crop, (0, 0), crop)
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ids = [f"terrain_{i:02d}" for i in range(12)]
    all_layers = {}
    for tid in ids:
        src = SRC / f"{tid}.png"
        if not src.exists():
            print("skip", tid)
            continue
        layers = split(src)
        all_layers[tid] = layers
        for name, lay in layers.items():
            lay.save(OUT / f"{tid}_{name}.png")
        print("split", tid, layers["far"].size)

    # ---- 演示页：4 张代表作 × (三层分解 + 错位合成) ----
    picks = ["terrain_00", "terrain_04", "terrain_06", "terrain_10"]
    tw = 300
    th = int(1216 * tw / 832)
    pad, label_h = 10, 26
    cols = 4
    rows = []
    sheet_w = pad + cols * (tw + pad)
    for tid in picks:
        row = Image.new("RGB", (sheet_w, th + label_h + pad), (18, 16, 15))
        d = ImageDraw.Draw(row)
        for i, (name, cn) in enumerate((("far", "远"), ("mid", "中"), ("near", "近"))):
            lay = all_layers[tid][name].resize((tw, th), Image.LANCZOS)
            tile = checker(tw, th).convert("RGBA")
            tile.alpha_composite(lay)
            row.paste(tile.convert("RGB"), (pad + i * (tw + pad), 0))
        # 第 4 列：近层右移 90 px 的视差合成
        comp = compose(all_layers[tid], 90, (832, 1216)).resize((tw, th), Image.LANCZOS)
        row.paste(comp, (pad + 3 * (tw + pad), 0))
        d.text((pad, th + 6), f"{tid}  far/mid/near + parallax(-90px near)", fill=(200, 190, 170))
        rows.append(row)

    sheet_h = pad + len(rows) * (th + label_h + pad)
    sheet = Image.new("RGB", (sheet_w, sheet_h), (18, 16, 15))
    for i, row in enumerate(rows):
        sheet.paste(row, (0, pad + i * (th + label_h + pad)))
    DEMO.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(DEMO, quality=88)
    print("demo", DEMO, sheet.size)


if __name__ == "__main__":
    main()
