# -*- coding: utf-8 -*-
"""内政页 y=562 接缝：改前 / 改后量化（对齐 CityPanel.ts 的真实实现）

真实实现（game/cocos/assets/scripts/CityPanel.ts）
  - SEAM_TINT[n-1] = 该档 floor_0N 顶 6 列均值（十六进制，见 CityPanel.ts:145）
  - paintSeam()：上 56 行 alpha = round(236·t²)（t=(i+1)/57），下 32 行 alpha = round(236·t²)
    （t=(32-i)/33），逐行 1px 实色矩形，画在两张美术之上、CityPanelBg（各面板）之下
指标：跨接缝的两行亮度差 |L(563) − L(561)|，只统计「没被按钮盖住」的暴露列
  （按钮 x=18..248 / 260..490 / 502..732，在 y=478..790 之间 ⇒ 暴露列 60px 宽）

产物：seam_metrics.txt + ev_before_N.png / ev_after_N.png / ev_seam_N.png
"""
import os
import sys

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

RES = r'F:\sanguo\game\cocos\assets\bundles\res'
OUT = r'F:\sanguo\work\cocos_art_final'
W, H = 750, 1334
SEAM = 562

# CityPanel.ts:145 的实测色
TINT = ['#351910', '#210F05', '#3D150C', '#46210F', '#3D1706']

C = {
    'bgDeep': (0x0E, 0x11, 0x16),
    'panel': (0x1A, 0x1F, 0x27),
    'panelHi': (0x23, 0x2B, 0x36),
    'pageBase': (0x0B, 0x0E, 0x13),
}

R_HEADER = (0, 0, 750, 118)
R_BACK = (18, 26, 104, 64)
R_HUD = (18, 126, 714, 340)
R_CMD = (18, 478, 714, 312)
R_LOG = (18, 798, 714, 416)
R_HINT = (18, 1222, 714, 56)
CMD_W, CMD_H, GAP = 230, 96, 12


def hexrgb(s):
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16))


def cover(im, w, h):
    sw, sh = im.size
    s = max(w / sw, h / sh)
    im2 = im.resize((int(round(sw * s)), int(round(sh * s))), Image.LANCZOS)
    x = (im2.width - w) // 2
    y = (im2.height - h) // 2
    return im2.crop((x, y, x + w, y + h))


def overlay(img, rect, color, alpha):
    x, y, w, h = rect
    a = alpha / 255.0
    sub = np.asarray(img, dtype=np.float64)
    y0, y1 = max(0, y), min(H, y + h)
    x0, x1 = max(0, x), min(W, x + w)
    if y1 <= y0 or x1 <= x0 or a <= 0:
        return img
    sub[y0:y1, x0:x1] = sub[y0:y1, x0:x1] * (1 - a) + np.array(color, dtype=np.float64) * a
    return Image.fromarray(np.clip(sub, 0, 255).astype(np.uint8))


def art_layer(n):
    pal = Image.open(os.path.join(RES, 'bg', 'policy', 'palais_0%d.webp' % n)).convert('RGB')
    flo = Image.open(os.path.join(RES, 'bg', 'policy', 'floor_0%d.webp' % n)).convert('RGB')
    base = Image.new('RGB', (W, H), C['pageBase'])
    base.paste(cover(pal, 750, SEAM), (0, 0))
    base.paste(flo.resize((750, 318), Image.LANCZOS), (0, SEAM))
    return base


def paint_seam(img, n):
    """与 CityPanel.paintSeam() 逐行等价（整数 alpha、1px 高矩形）。"""
    color = hexrgb(TINT[n - 1])
    a = np.asarray(img, dtype=np.float64)
    c = np.array(color, dtype=np.float64)
    up, dn, peak = 56, 32, 236
    for i in range(up):
        t = (i + 1) / (up + 1)
        al = round(peak * t * t) / 255.0
        a[SEAM - up + i] = a[SEAM - up + i] * (1 - al) + c * al
    for i in range(dn):
        t = (dn - i) / (dn + 1)
        al = round(peak * t * t) / 255.0
        a[SEAM + i] = a[SEAM + i] * (1 - al) + c * al
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def panels(img, art_ready=True):
    img = overlay(img, (0, 0, W, H), C['pageBase'], 60 if art_ready else 253)
    if art_ready:
        img = overlay(img, (0, 880, W, H - 880), C['pageBase'], 252)
    img = overlay(img, R_HEADER, C['panelHi'], 240 if art_ready else 255)
    img = overlay(img, R_BACK, C['panel'], 235)
    img = overlay(img, R_HUD, C['panel'], 168 if art_ready else 255)
    for r in range(3):
        for c in range(3):
            x = R_CMD[0] + c * (CMD_W + GAP)
            y = R_CMD[1] + r * (CMD_H + GAP)
            img = overlay(img, (x, y, CMD_W, CMD_H),
                          C['panelHi'] if (r + c) % 2 == 0 else C['panel'], 212)
    img = overlay(img, R_LOG, C['bgDeep'], 220)
    img = overlay(img, R_HINT, C['panel'], 240)
    return img


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


EXPOSED = None


def exposed_cols():
    global EXPOSED
    if EXPOSED is None:
        covered = np.zeros(W, dtype=bool)
        for c in range(3):
            x = 18 + c * (CMD_W + GAP)
            covered[x:x + CMD_W] = True
        EXPOSED = ~covered
    return EXPOSED


def stats(img):
    a = np.asarray(img, dtype=np.float64)
    l = lum(a)
    step = np.abs(l[SEAM + 1] - l[SEAM - 1])
    exp = exposed_cols()
    return {
        'all_mean': float(step.mean()),
        'all_max': float(step.max()),
        'exp_n': int(exp.sum()),
        'exp_mean': float(step[exp].mean()),
        'exp_max': float(step[exp].max()),
        'above': a[SEAM - 1][exp].mean(axis=0),
        'below': a[SEAM][exp].mean(axis=0),
    }


def main():
    lines = []
    lines.append('内政页 y=%d 接缝 · 改前/改后（指标：跨接缝两行亮度差 |L(y+1)-L(y-1)|）' % SEAM)
    lines.append('暴露列 = y=562 处未被 9 个命令按钮盖住的列（%d px 宽，x=0..17 / 248..259 / 490..501 / 732..749）'
                 % exposed_cols().sum())
    lines.append('')
    lines.append('| 档 | 改前 暴露列 mean | 改前 max | 改后 mean | 改后 max | 降幅 |')
    lines.append('|---|---|---|---|---|---|')
    agg0 = []
    agg1 = []
    for n in (1, 2, 3, 4, 5):
        art = art_layer(n)
        before = panels(art)
        after = panels(paint_seam(art, n))
        before.save(os.path.join(OUT, 'ev_before_%d.png' % n))
        after.save(os.path.join(OUT, 'ev_after_%d.png' % n))
        s0 = stats(before)
        s1 = stats(after)
        agg0.append(s0['exp_mean'])
        agg1.append(s1['exp_mean'])
        lines.append('| palais_0%d | %.2f | %.2f | %.2f | %.2f | −%.0f%% |'
                     % (n, s0['exp_mean'], s0['exp_max'], s1['exp_mean'], s1['exp_max'],
                        100.0 * (1 - s1['exp_mean'] / s0['exp_mean'])))
        # 接缝放大带（y=470..660）：上=改前，下=改后
        crop_b = before.crop((0, 470, W, 660))
        crop_a = after.crop((0, 470, W, 660))
        pair = Image.new('RGB', (W, crop_b.height * 2 + 8), (0, 0, 0))
        pair.paste(crop_b, (0, 0))
        pair.paste(crop_a, (0, crop_b.height + 8))
        pair.save(os.path.join(OUT, 'ev_seam_%d.png' % n))
        lines.append('')
        lines.append('  n%d 暴露列跨缝均值 RGB：接缝上 %.1f/%.1f/%.1f → 接缝下 %.1f/%.1f/%.1f'
                     % ((n,) + tuple(s0['above']) + tuple(s0['below'])))
    lines.append('')
    lines.append('暴露列 mean|ΔL| 汇总：改前 %s → 改后 %s'
                 % (' / '.join('%.2f' % v for v in agg0),
                    ' / '.join('%.2f' % v for v in agg1)))
    lines.append('平均降幅 %.1f%%（最差档 %.2f → %.2f）'
                 % (100.0 * (1 - np.mean(agg1) / np.mean(agg0)),
                    max(agg0), agg1[agg0.index(max(agg0))]))
    text = '\n'.join(lines)
    with open(os.path.join(OUT, 'seam_metrics.txt'), 'w', encoding='utf-8') as f:
        f.write(text + '\n')
    print(text)


if __name__ == '__main__':
    main()
