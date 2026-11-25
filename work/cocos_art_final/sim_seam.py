# -*- coding: utf-8 -*-
"""CityPanel 内政页合成模拟 + 接缝量化
按 CityPanel.ts 的版面常量与 drawMain() 的 alpha 逐层合成，用来
(1) 量 y=562 朝堂/地面接缝的硬边有多硬（以及被面板遮掉多少），
(2) 试几种柔化带，量「相邻行亮度台阶」下降多少，并出对比图。
资源来自 bundles/res/bg/policy/palais_0N.webp + floor_0N.webp（真实文件）。
"""
import os
import numpy as np
from PIL import Image

RES = r'F:\sanguo\game\cocos\assets\bundles\res'
OUT = r'F:\sanguo\work\cocos_art_final'
W, H = 750, 1334
SEAM = 562

C = {
    'bgDeep': (0x0E, 0x11, 0x16),
    'panel': (0x1A, 0x1F, 0x27),
    'panelHi': (0x23, 0x2B, 0x36),
    'gold': (0xD8, 0xB3, 0x6A),
    'line': (0x2C, 0x34, 0x40),
    'pageBase': (0x0B, 0x0E, 0x13),
}

R_HEADER = (0, 0, 750, 118)
R_BACK = (18, 26, 104, 64)
R_HUD = (18, 126, 714, 340)
R_CMD = (18, 478, 714, 312)
R_LOG = (18, 798, 714, 416)
R_HINT = (18, 1222, 714, 56)
CMD_W, CMD_H, GAP = 230, 96, 12


def cover(im, w, h):
    sw, sh = im.size
    s = max(w / sw, h / sh)
    nw, nh = int(round(sw * s)), int(round(sh * s))
    im2 = im.resize((nw, nh), Image.LANCZOS)
    x = (nw - w) // 2
    y = (nh - h) // 2
    return im2.crop((x, y, x + w, y + h))


def overlay(img, rect, color, alpha):
    x, y, w, h = rect
    a = alpha / 255.0
    sub = np.asarray(img, dtype=np.float64)
    y0, y1 = max(0, y), min(H, y + h)
    x0, x1 = max(0, x), min(W, x + w)
    if y1 <= y0 or x1 <= x0:
        return img
    reg = sub[y0:y1, x0:x1]
    c = np.array(color, dtype=np.float64)
    sub[y0:y1, x0:x1] = reg * (1 - a) + c * a
    return Image.fromarray(np.clip(sub, 0, 255).astype(np.uint8))


def art_layer(n):
    pal = Image.open(os.path.join(RES, 'bg', 'policy', 'palais_0%d.webp' % n)).convert('RGB')
    flo = Image.open(os.path.join(RES, 'bg', 'policy', 'floor_0%d.webp' % n)).convert('RGB')
    base = Image.new('RGB', (W, H), C['pageBase'])
    base.paste(cover(pal, 750, SEAM), (0, 0))
    base.paste(flo.resize((750, 318), Image.LANCZOS), (0, SEAM))
    return base, pal, flo


def seam_band(img, n, mode):
    """在接缝上加柔化带；返回新图。"""
    flo = Image.open(os.path.join(RES, 'bg', 'policy', 'floor_0%d.webp' % n)).convert('RGB')
    ftop = np.asarray(flo, dtype=np.float64)[0:6].reshape(-1, 3).mean(axis=0)
    pal = Image.open(os.path.join(RES, 'bg', 'policy', 'palais_0%d.webp' % n)).convert('RGB')
    # 引擎里 hall 是 cover 到 750×562，取最后 6 行（缩放后）
    hb = np.asarray(cover(pal, 750, SEAM), dtype=np.float64)[-6:].reshape(-1, 3).mean(axis=0)
    a = np.asarray(img, dtype=np.float64)
    if mode == 'A':      # hall 侧渐变到地面色，56px
        up, peak = 56, 235
        for i in range(up):
            t = (i + 1) / up           # 0..1，往下变强
            al = (peak / 255.0) * (t ** 1.25)
            y = SEAM - up + i
            a[y] = a[y] * (1 - al) + ftop * al
    elif mode == 'B':    # 对称三角，84px，地面色
        up, dn, peak = 56, 28, 200
        for i in range(up):
            t = (i + 1) / (up + 1)
            al = (peak / 255.0) * t
            y = SEAM - up + i
            a[y] = a[y] * (1 - al) + ftop * al
        for i in range(dn):
            t = 1.0 - i / (dn + 1)
            al = (peak / 255.0) * t
            y = SEAM + i
            a[y] = a[y] * (1 - al) + ftop * al
    elif mode == 'D':    # 实际实现：二次曲线三角，上 56 / 下 32，peak 236，地面色
        up, dn, peak = 56, 32, 236
        for i in range(up):
            t = (i + 1) / (up + 1)
            al = (peak / 255.0) * (t * t)
            y = SEAM - up + i
            a[y] = a[y] * (1 - al) + ftop * al
        for i in range(dn):
            t = (dn - i) / (dn + 1)
            al = (peak / 255.0) * (t * t)
            y = SEAM + i
            a[y] = a[y] * (1 - al) + ftop * al
    elif mode == 'C':    # 对称三角，84px，两侧均值色
        mid = (ftop + hb) / 2.0
        up, dn, peak = 56, 28, 170
        for i in range(up):
            t = (i + 1) / (up + 1)
            al = (peak / 255.0) * t
            y = SEAM - up + i
            a[y] = a[y] * (1 - al) + mid * al
        for i in range(dn):
            t = 1.0 - i / (dn + 1)
            al = (peak / 255.0) * t
            y = SEAM + i
            a[y] = a[y] * (1 - al) + mid * al
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), ftop, hb


def panels(img, art_ready=True):
    img = overlay(img, (0, 0, W, H), C['pageBase'], 60 if art_ready else 253)
    if art_ready:
        img = overlay(img, (0, 880, W, H - 880), C['pageBase'], 252)
    img = overlay(img, R_HEADER, C['panelHi'], 240 if art_ready else 255)
    img = overlay(img, R_BACK, C['panel'], 235)
    img = overlay(img, R_HUD, C['panel'], 168 if art_ready else 255)
    for i in range(6):
        pass
    for r in range(3):
        for c in range(3):
            x = R_CMD[0] + c * (CMD_W + GAP)
            y = R_CMD[1] + r * (CMD_H + GAP)
            img = overlay(img, (x, y, CMD_W, CMD_H), C['panelHi'] if (r + c) % 2 == 0 else C['panel'], 212)
    img = overlay(img, R_LOG, C['bgDeep'], 220)
    img = overlay(img, R_HINT, C['panel'], 240)
    return img


def L(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def seam_stats(img, label):
    a = np.asarray(img, dtype=np.float64)
    l = L(a)
    step = np.abs(l[SEAM + 1] - l[SEAM - 1])       # 跨接缝的两行亮度差
    # 暴露列：y=562 处没有被按钮盖住的 x（按钮 18..248 / 260..490 / 502..732）
    covered = np.zeros(W, dtype=bool)
    for c in range(3):
        x = 18 + c * 242
        covered[x:x + 230] = True
    exp = ~covered
    print('%-22s 全宽mean|ΔL|=%.2f  全宽max=%.2f  暴露列(%dpx) mean=%.2f max=%.2f  Y=%s vs %s'
          % (label, step.mean(), step.max(), exp.sum(), step[exp].mean(), step[exp].max(),
             a[SEAM - 1][exp].mean(axis=0).round(1), a[SEAM][exp].mean(axis=0).round(1)))
    return step[exp].mean()


def crop_zoom(img, path, y0=470, y1=660, scale=1.0, box=None):
    c = img.crop(box or (0, y0, W, y1))
    if scale != 1.0:
        c = c.resize((int(c.width * scale), int(c.height * scale)), Image.LANCZOS)
    c.save(path)
    return c


if __name__ == '__main__':
    rows = {}
    for n in (1, 2, 3, 4, 5):
        art, pal, flo = art_layer(n)
        base = panels(art)
        base.save(os.path.join(OUT, 'sim_before_%d.png' % n))
        s0 = seam_stats(base, 'n%d before' % n)
        for mode in ('A', 'B', 'C'):
            art2, ftop, hb = seam_band(art, n, mode)
            after = panels(art2)
            s1 = seam_stats(after, 'n%d after-%s' % (n, mode))
            rows[(n, mode)] = (s0, s1)
        print('   floor_top=%s hall_bottom=%s' % (ftop.round(1), hb.round(1)))
    print()
    print('汇总（暴露列 mean|ΔL|）：')
    for n in (1, 2, 3, 4, 5):
        line = 'n%d  before %.2f' % (n, rows[(n, 'A')][0])
        for mode in ('A', 'B', 'C'):
            line += '   %s %.2f' % (mode, rows[(n, mode)][1])
        print(line)
