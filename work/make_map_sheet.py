# -*- coding: utf-8 -*-
"""把原作 CHINAMAP 处理成"能压白字"的地图底版。

原作那张是 1999 年的写实渲染：橙色的路、饱和的青蓝海、锐利的山影，整体偏亮
（平均亮度 ~140）。直接用的话白色城名在黄土高原上完全读不出来，而且未经处理的
原作素材不能进包体。这里只做三件事，不做任何重绘/描图：

  1) 轻度虚化（半径 1.6px）——把"卫星照片感"的路网线压软，好让 17px 的城名压得住；
  2) 去饱和到 62% + 轻微冷调 —— 从"写实卫星图"推向墨青灰的国风底；
  3) 提亮 + 提对比到 1.32/1.18 —— CSS 那层 .58→.72 的深色蒙版会把亮度乘掉 65%，
     不先留出余量，叠完就是一团黑。这一步是为了"蒙版之后仍然看得见地图"，不是为了
     保住原作的观感；屏幕上的最终效果 = 0.35×图 + 0.65×蒙版色。

边缘羽化不烘进像素（省 alpha 通道、省体积），交给 CSS mask。

产物：F:\\sanguo\\game\\web\\assets\\bg\\map_sheet.png  1100x825
"""
import os
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

SRC = r'F:\sanguo\export\png\SHAPE\MAP\CHINAMAP.png'
DST = r'F:\sanguo\game\web\assets\bg\map_sheet.png'
OUT_W = 1100


def main():
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    im = Image.open(SRC).convert('RGB')
    print('src', im.size)
    h = round(im.size[1] * OUT_W / im.size[0])
    im = im.resize((OUT_W, h), Image.LANCZOS)
    im = im.filter(ImageFilter.GaussianBlur(1.6))
    im = ImageEnhance.Color(im).enhance(0.60)
    im = ImageEnhance.Brightness(im).enhance(1.46)
    im = ImageEnhance.Contrast(im).enhance(1.24)
    a = np.asarray(im).astype(np.float32)
    a *= np.array([0.94, 1.00, 1.06], dtype=np.float32)   # 冷调
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
    im.save(DST, optimize=True)
    b = np.asarray(im).astype(np.float32)
    L = b @ np.array([.2126, .7152, .0722], dtype=np.float32)
    # 叠上 CSS 蒙版后的估算亮度（a=.58..72 取中值 .65，蒙版色 rgba(10,14,20) 亮度≈13.4）
    print('out', im.size, '%.1f KB' % (os.path.getsize(DST) / 1024))
    print('luma raw %.1f (p5 %.0f p95 %.0f) -> 蒙版后约 %.1f' % (
        L.mean(), np.percentile(L, 5), np.percentile(L, 95), L.mean() * .35 + 13.4 * .65))


if __name__ == '__main__':
    main()
