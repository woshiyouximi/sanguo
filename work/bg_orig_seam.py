# -*- coding: utf-8 -*-
"""判断 BG/MG/FG 条是否可横向循环：比较首末列差与相邻列差的分布"""
import os
import numpy as np
from PIL import Image

BG = r"F:\sanguo\export\png\SHAPE\BG"
OUT = r"F:\sanguo\work\bg_orig"
lines = []


def arr(p):
    return np.asarray(Image.open(p).convert("RGBA")).astype(np.float32)


for t in range(12):
    for layer in ("BG", "MG", "FG"):
        a = arr(os.path.join(BG, f"{layer}{t:02d}A.png"))
        rgb = a[..., :3]
        # 只在两列都不透明的行上比较，避免 alpha 边缘把差值放大
        seam = np.abs(rgb[:, 0, :] - rgb[:, -1, :]).mean(axis=1)
        steps = np.abs(rgb[:, 1:, :] - rgb[:, :-1, :]).mean(axis=2)  # H x (W-1)
        step_mean = steps.mean(axis=1)
        # 用 "首末列差" 与 "把图当成环时相邻列差的 99 分位" 对比
        thr = np.percentile(step_mean, 90)
        ratio = seam.mean() / max(step_mean.mean(), 1e-6)
        p99 = np.percentile(step_mean, 99)
        verdict = "可循环" if seam.mean() <= p99 * 1.15 else "接缝明显"
        lines.append(
            f"t{t:02d}{layer} 首末列|Δ|={seam.mean():6.2f} 相邻列|Δ|均值={step_mean.mean():6.2f} "
            f"p90={thr:6.2f} p99={p99:6.2f} 倍数={ratio:4.2f} -> {verdict}"
        )
    lines.append("")

open(os.path.join(OUT, "seam_test.txt"), "w", encoding="utf-8").write("\n".join(lines))
print("\n".join(lines[:8]))
