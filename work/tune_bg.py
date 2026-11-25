# -*- coding: utf-8 -*-
"""底图后期：把"纯黑空洞"补成"有空气感的暗场"，并统一到出货口径。

为什么需要这一步（实测结论）：
  Qwen 出的 deploy_bg / items_bg 是双峰直方图——主体很亮，配景被压成 0。实测
  deploy_bg 压暗后 mean 16.9、p50 = 1、72% 的像素 < 16，属于"大片死黑"，直接上
  页面就是一大块黑洞。gamma 压暗只会更黑（黑场 0^g 还是 0），所以必须在后期
  **加一层极暗的环境光 + 空间渐变**，让空洞变成"暗场里有雾"。

做法（全部在 8bit sRGB 上用 float 算，再夹回去）：
  a' = a*(1-k) + k*AMB  （把黑场抬到 AMB 附近，白场几乎不动）
  a' += glow * WARM      （一盏径向暖光的余晖，给暗场一个光源理由）
  a' += (1-v) * COOL     （顶部偏冷一点点，模拟室内上部更暗更青）

跑法：
  python F:\\sanguo\\work\\tune_bg.py            # 全部按配方重做
  python F:\\sanguo\\work\\tune_bg.py --only deploy_bg
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comfy_bg import grade, JOBS  # noqa: E402  同一套压暗参数

RAW = r'F:\sanguo\work\bg_raw'
FINAL = r'F:\sanguo\game\web\assets\bg'

# 每张图的配方：k=黑场抬升强度, amb=环境光 RGB, glow=(cu,cv,su,sv,rgb), cool=顶部冷色
RECIPE = {
    'map_bg':      dict(k=0.10, amb=(9, 11, 15), glow=(0.5, 0.42, 0.55, 0.45, (10, 8, 5)), cool=(2, 3, 5)),
    'map_bg_v2':   dict(k=0.10, amb=(9, 11, 15), glow=(0.5, 0.45, 0.6, 0.5, (9, 8, 5)), cool=(2, 3, 5)),
    'deploy_bg':   dict(k=0.42, amb=(18, 19, 22), glow=(0.70, 0.56, 0.62, 0.55, (34, 21, 11)), cool=(4, 5, 8)),
    'items_bg':    dict(k=0.40, amb=(17, 18, 21), glow=(0.50, 0.50, 0.60, 0.55, (22, 16, 10)), cool=(4, 5, 8)),
    'hud_bar':     dict(k=0.24, amb=(11, 12, 15), glow=(0.5, 0.5, 0.55, 0.9, (14, 9, 6)),  cool=(0, 0, 0)),
    'panel_frame': dict(k=0.26, amb=(11, 12, 15), glow=(0.5, 0.5, 0.8, 0.8, (10, 8, 5)),   cool=(0, 0, 0)),
}


def tune(name, a):
    rc = RECIPE[name]
    H, W = a.shape[:2]
    v = ((np.arange(H, dtype=np.float32) + 0.5) / H)[:, None, None]
    u = ((np.arange(W, dtype=np.float32) + 0.5) / W)[None, :, None]
    out = a * (1.0 - rc['k']) + rc['k'] * np.array(rc['amb'], dtype=np.float32)
    cu, cv, su, sv, warm = rc['glow']
    g = np.exp(-(((u - cu) ** 2) / (2 * su * su) + ((v - cv) ** 2) / (2 * sv * sv)))
    out = out + g * np.array(warm, dtype=np.float32)
    out = out + (1.0 - v) * np.array(rc['cool'], dtype=np.float32)
    return np.clip(out, 0, 255)


def stats(a):
    y = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    return dict(mean=float(y.mean()), p50=float(np.percentile(y, 50)),
                dark=float((y < 16).mean()), bright=float((y > 240).mean()),
                p99=float(np.percentile(y, 99)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    args = ap.parse_args()
    names = [n.strip() for n in args.only.split(',') if n.strip()] or list(RECIPE)
    os.makedirs(FINAL, exist_ok=True)
    print('%-12s %-17s %-17s' % ('image', 'before(mean/p50/dark)', 'after(mean/p50/dark)'))
    for n in names:
        if n not in RECIPE:
            sys.exit('no recipe: %s' % n)
        src = os.path.join(RAW, n + '.png')
        if not os.path.exists(src):
            print('SKIP %s (no raw)' % n)
            continue
        # 先跑 comfy_bg 里同一套"压暗 + 高光压缩"，再补暗场，保证只有一条流水线
        tmp = os.path.join(RAW, n + '_graded.png')
        grade(src, tmp, JOBS[n].get('gamma_color', 1.0) if n in JOBS else 1.0)
        im = Image.open(tmp).convert('RGB')
        a = np.asarray(im).astype(np.float32)
        b4 = stats(a)
        out = tune(n, a)
        af = stats(out)
        dst = os.path.join(FINAL, n + '.png')
        Image.fromarray(out.astype(np.uint8), 'RGB').save(dst, optimize=True)
        print('%-12s %5.1f/%4.0f/%.2f   %5.1f/%4.0f/%.2f   %s %dx%d %.0fKB'
              % (n, b4['mean'], b4['p50'], b4['dark'], af['mean'], af['p50'], af['dark'],
                 os.path.basename(dst), im.size[0], im.size[1], os.path.getsize(dst) / 1024))


if __name__ == '__main__':
    main()
