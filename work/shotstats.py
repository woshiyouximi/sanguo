# -*- coding: utf-8 -*-
"""截图亮度体检：验收用。

对每张图给出 Rec.709 亮度分布 + 死黑/死白占比，用来客观支撑
"没有大片死黑或死白" 这条验收要求（而不是只说"我看过了"）。

判据（本项目自定，写在 17_底图与版式.md 里）：
  - p50 落在 26~120：整体在"暗底+可读白字"的区间；
  - dark_lo（<16 的像素占比）< 0.55：不出现半屏死黑；
  - bright_hi（>240 的像素占比）< 0.02：不出现大片死白。
"""
import os
import sys
import glob
import numpy as np
from PIL import Image

FILES = [
    r'F:\sanguo\work\bg_campaign.png',
    r'F:\sanguo\work\bg_deploy.png',
    r'F:\sanguo\work\bg_items.png',
    r'F:\sanguo\work\bg_battle.png',
    r'F:\sanguo\work\bg_campaign_wide.png',
    r'F:\sanguo\work\bg_deploy_wide.png',
    r'F:\sanguo\work\bg_items_wide.png',
    r'F:\sanguo\work\bg_battle_wide.png',
    r'F:\sanguo\game\web\assets\bg\map_sheet.png',
    r'F:\sanguo\game\web\assets\bg\map_bg.png',
    r'F:\sanguo\game\web\assets\bg\map_bg_v2.png',
    r'F:\sanguo\game\web\assets\bg\deploy_bg.png',
    r'F:\sanguo\game\web\assets\bg\items_bg.png',
    r'F:\sanguo\game\web\assets\bg\hud_bar.png',
    r'F:\sanguo\game\web\assets\bg\panel_frame.png',
]


def stat(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    y = a[:, :, 0] * 0.2126 + a[:, :, 1] * 0.7152 + a[:, :, 2] * 0.0722
    p = np.percentile(y, [1, 5, 50, 95, 99])
    return dict(size=im.size, mean=y.mean(), p1=p[0], p5=p[1], p50=p[2], p95=p[3], p99=p[4],
                dark=float((y < 16).mean()), bright=float((y > 240).mean()),
                bytes=os.path.getsize(path))


def main():
    files = [f for f in FILES if os.path.exists(f)]
    extra = sys.argv[1:]
    files += [f for f in extra if os.path.exists(f) and f not in files]
    hdr = f"{'file':34s} {'size':11s} {'mean':>5s} {'p1':>4s} {'p5':>4s} {'p50':>4s} {'p95':>4s} {'p99':>4s} {'dark':>5s} {'bright':>6s} {'KB':>6s}"
    print(hdr)
    print('-' * len(hdr))
    for f in files:
        s = stat(f)
        print(f"{os.path.basename(f)[:34]:34s} {s['size'][0]:5d}x{s['size'][1]:<5d} "
              f"{s['mean']:5.1f} {s['p1']:4.0f} {s['p5']:4.0f} {s['p50']:4.0f} {s['p95']:4.0f} {s['p99']:4.0f} "
              f"{s['dark']:5.2f} {s['bright']:6.3f} {s['bytes'] / 1024:6.0f}")


if __name__ == '__main__':
    main()
