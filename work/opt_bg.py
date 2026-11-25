# -*- coding: utf-8 -*-
"""底图出货压缩：256 色 + Floyd-Steinberg 抖动，PNG 体积降到 1/3 左右。

为什么敢用调色板：这 6 张图最终都会被一层 rgba 蒙版压到 30~60 的亮度区间再显示，
8bit 全彩的层次在屏幕上根本用不到；而抖动噪点正好抵消掉"256 色在暗部形成色带"
的问题（暗部色带才是唯一风险）。

做法：
  1) 原图先备份到 work\\bg_raw\\<name>_full.png（只备份一次，重跑不覆盖）；
  2) quantize(256, MEDIANCUT, FLOYDSTEINBERG) 写回 assets/bg；
  3) 打印压缩前后体积。
再跑一次 bg_contact.py 目视确认没有色带。
"""
import os
import shutil

from PIL import Image

FINAL = r'F:\sanguo\game\web\assets\bg'
RAW = r'F:\sanguo\work\bg_raw'
NAMES = ['map_bg', 'map_sheet', 'deploy_bg', 'items_bg', 'hud_bar', 'panel_frame', 'map_bg_v2']


def main():
    tot0 = tot1 = 0
    for n in NAMES:
        p = os.path.join(FINAL, n + '.png')
        if not os.path.exists(p):
            print('SKIP', n)
            continue
        bak = os.path.join(RAW, n + '_full.png')
        if not os.path.exists(bak):
            shutil.copyfile(p, bak)
        s0 = os.path.getsize(p)
        im = Image.open(bak).convert('RGB')
        q = im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
        q.save(p, 'PNG', optimize=True)
        s1 = os.path.getsize(p)
        tot0 += s0
        tot1 += s1
        print('%-14s %6.0fKB -> %6.0fKB  (%3.0f%%)' % (n, s0 / 1024, s1 / 1024, 100.0 * s1 / s0))
    print('%-14s %6.0fKB -> %6.0fKB' % ('TOTAL', tot0 / 1024, tot1 / 1024))


if __name__ == '__main__':
    main()
