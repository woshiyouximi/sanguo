# -*- coding: utf-8 -*-
"""拼底图对照页：F:\\sanguo\\work\\bg_contact.jpg

一屏看清 6 张 AI 底图的实际亮度与内容，并在右侧标出"用在哪一页"。
底色用中性 #202020（不是纯黑），这样能看出哪张图自己就接近黑，
避免"图很暗但放在黑底上看不出来"的误判。
底部再放一条 0→255 的灰阶，方便目测对比。

跑法：python F:\\sanguo\\work\\bg_contact.py
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BG = r'F:\sanguo\game\web\assets\bg'
DST = r'F:\sanguo\work\bg_contact.jpg'

ITEMS = [
    ('map_bg.png',      'campaign 衬底',  360),
    ('map_bg_v2.png',   '大地图 AI 备选', 360),
    ('deploy_bg.png',   'deploy 底图',    360),
    ('items_bg.png',    'items 底图',     360),
    ('hud_bar.png',     'index 顶部 HUD', 360),
    ('panel_frame.png', '九宫格边框材',   360),
]

FONT_CAND = [r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\simhei.ttf']


def font(sz, bold=False):
    for p in ([FONT_CAND[1], FONT_CAND[0], FONT_CAND[2]] if bold else FONT_CAND):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def luma(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    return float((a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).mean())


def main():
    cols, pad, lab = 3, 18, 74
    cw = 360
    rows = (len(ITEMS) + cols - 1) // cols
    W = cols * cw + (cols + 1) * pad
    top = 96
    H = top + rows * (cw + lab) + (rows + 1) * pad + 120
    sheet = Image.new('RGB', (W, H), (32, 32, 32))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 24), 'AI 底图对照（本地 Qwen-Image 2.1 / ComfyUI）',
           font=font(34, True), fill=(238, 232, 216))
    d.text((pad, 64), '深色为设计意图（图上有白字要压）；每格左下角是实测平均亮度',
           font=font(20), fill=(150, 148, 140))

    for i, (name, use, w) in enumerate(ITEMS):
        cx = pad + (i % cols) * (cw + pad)
        cy = top + pad + (i // cols) * (cw + lab)
        path = os.path.join(BG, name)
        if not os.path.exists(path):
            d.rectangle([cx, cy, cx + cw, cy + cw], fill=(52, 40, 40))
            d.text((cx + 10, cy + 10), name + ' MISSING', font=font(22), fill=(230, 160, 160))
            continue
        im = Image.open(path).convert('RGB')
        sc = min(w / im.size[0], w / im.size[1])
        th = im.resize((max(1, round(im.size[0] * sc)), max(1, round(im.size[1] * sc))), Image.LANCZOS)
        bx, by = cx + (cw - th.size[0]) // 2, cy + (cw - th.size[1]) // 2
        d.rectangle([cx, cy, cx + cw, cy + cw], fill=(44, 44, 44))
        sheet.paste(th, (bx, by))
        d.rectangle([cx, cy, cx + cw, cy + cw], outline=(96, 96, 96))
        lu = luma(im)
        d.text((cx + 6, cy + cw - 30), 'L=%.0f' % lu, font=font(24, True),
               fill=(255, 196, 96) if lu > 90 else (150, 220, 150))
        d.text((cx, cy + cw + 6), name, font=font(24, True), fill=(240, 234, 220))
        d.text((cx, cy + cw + 34), '%dx%d · %s' % (im.size[0], im.size[1], use),
               font=font(17), fill=(158, 156, 148))

    # 灰阶参考
    y0 = H - 96
    for x in range(W - 2 * pad):
        g = int(255 * x / max(1, W - 2 * pad - 1))
        d.line([(pad + x, y0), (pad + x, y0 + 40)], fill=(g, g, g))
    for g in (0, 32, 64, 96, 128, 160, 200, 255):
        xx = pad + int((W - 2 * pad - 1) * g / 255)
        d.text((xx - 10, y0 + 46), str(g), font=font(18), fill=(180, 178, 170))

    sheet.save(DST, quality=90)
    print('wrote %s (%dx%d)' % (DST, W, H))
    for name, _, _ in ITEMS:
        p = os.path.join(BG, name)
        print('  %-18s %s' % (name, '%.1f' % luma(Image.open(p)) if os.path.exists(p) else 'MISSING'))


if __name__ == '__main__':
    main()
