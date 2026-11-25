# -*- coding: utf-8 -*-
"""A2 素材分析：A/B 真实关系 + 尺寸/alpha/接缝（结论必须有像素证据）"""
import hashlib
import os
import sys

from PIL import Image

BG = r"F:\sanguo\export\png\SHAPE\BG"
TGA = r"F:\sanguo\export\png\tga"

def md5(p):
    with open(p, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()[:12]

def info(p):
    im = Image.open(p)
    return im

print("== 尺寸 / 模式 / md5 ==")
rows = []
for t in range(12):
    for layer in ("BG", "MG", "FG"):
        for v in ("A", "B"):
            p = os.path.join(BG, f"{layer}{t:02d}{v}.png")
            im = info(p)
            rows.append((f"{layer}{t:02d}{v}", im.size, im.mode, md5(p), os.path.getsize(p)))
for name, size, mode, h, sz in rows:
    print(f"{name} {size[0]}x{size[1]} {mode} md5={h} {sz}B")

print("\n== A vs B 完全相同 ==")
same = []
for t in range(12):
    for layer in ("BG", "MG", "FG"):
        a = os.path.join(BG, f"{layer}{t:02d}A.png")
        b = os.path.join(BG, f"{layer}{t:02d}B.png")
        if md5(a) == md5(b):
            same.append(f"{layer}{t:02d}")
print("identical:", same)

print("\n== alpha 分布 / 不透明 bbox ==")
for t in range(12):
    line = []
    for layer in ("BG", "MG", "FG"):
        for v in ("A", "B"):
            p = os.path.join(BG, f"{layer}{t:02d}{v}.png")
            im = Image.open(p).convert("RGBA")
            al = im.getchannel("A")
            h = al.histogram()
            nz = sum(h[1:])
            zero = h[0]
            bbox = im.getbbox()
            # 每行是否全透明，找"天空"范围
            line.append(f"{layer}{t:02d}{v}: nz={nz} zero={zero} bbox={bbox}")
    print(" | ".join(line))

print("\n== 地面 FLOOR 尺寸/模式/平均色/边缘接缝 ==")
import numpy as np
for t in range(12):
    p = os.path.join(TGA, f"SHAPE_BG_FLOOR{t:02d}.png")
    im = Image.open(p).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    # 左右接缝：第 0 列 vs 第 511 列（相邻平铺时这两列挨着）
    lr = np.abs(a[:, 0, :] - a[:, -1, :]).mean()
    tb = np.abs(a[0, :, :] - a[-1, :, :]).mean()
    # 相邻列差均值，作为"正常纹理梯度"参照
    inner = np.abs(np.diff(a, axis=1)).mean()
    print(f"FLOOR{t:02d} {im.size} {im.mode} mean={tuple(a.reshape(-1,3).mean(0).round(1))} "
          f"seamLR={lr:.2f} seamTB={tb:.2f} innerGrad={inner:.2f}")
