"""生成文档用的几张关键示意图（可重复运行）。

  F:\\sanguo\\export\\png\\msk\\overlay_CHINAMAP1.png   MSK 地形图叠在大地图 SHP 上
  F:\\sanguo\\export\\png\\face\\combine_FACE001_004.png COMBINE.INI 的 2x2 头像拼合演示
  F:\\sanguo\\export\\png\\font\\sample_text.png         用 SANGO.20 点阵渲染的繁体中文样张
"""
import os
import sys

sys.path.insert(0, r'F:\sanguo\tools')
from PIL import Image

import sango_font as F
import sango_msk as M
import sango_shp as S

PAK = r'F:\sanguo\extract\pak'
OUT = r'F:\sanguo\export\png'


def fig_msk_overlay():
    shp = S.load(os.path.join(PAK, 'SHAPE', 'MAP', 'CHINAMAP.SHP'))
    base = S.to_image(shp).convert('RGBA')
    msk = M.load(os.path.join(PAK, 'SHAPE', 'MAP', 'CHINAMAP1.MSK'))
    ov = M.to_image(msk, mode='palette').convert('RGBA').resize(base.size, Image.NEAREST)
    px = ov.load()
    for y in range(ov.height):                       # 空地(255)透明，只叠地形要素
        for x in range(ov.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 0 if (r, g, b) == (0, 0, 0) else 150)
    out = Image.alpha_composite(base, ov)
    dst = os.path.join(OUT, 'msk', 'overlay_CHINAMAP1.png')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out.convert('RGB').save(dst)
    return dst


def fig_combine():
    # COMBINE.INI 里唯一的定义：4 张 100x120 头像按 (-96,-96)(0,-96)(-96,0)(0,0) 拼成 2x2
    tiles = ['FACE001', 'FACE002', 'FACE003', 'FACE004']
    out = Image.new('RGBA', (200, 240), (0, 0, 0, 0))
    for i, n in enumerate(tiles):
        g = S.to_image(S.load(os.path.join(PAK, 'SHAPE', 'FACE', n + '.SHP')))
        out.paste(g, ((i % 2) * 100, (i // 2) * 120), g)
    dst = os.path.join(OUT, 'face', 'combine_FACE001_004.png')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out.save(dst)
    return dst


def fig_font_text():
    font = F.load_chinese('SANGO.20', 'SANGO.IDX', PAK)
    lines = ['三國群英傳２', '曹操 劉備 孫權 關羽 張飛', '諸葛亮 司馬懿 呂布 貂蟬',
             '桃園結義 赤壁之戰', '西元一九九年 許昌 洛陽 成都']
    Z = 2
    ims = [F.render_text(font, t) for t in lines]
    W = max(i.width for i in ims) * Z
    H = sum(i.height * Z + 6 for i in ims)
    out = Image.new('RGB', (W + 8, H + 8), (18, 18, 24))
    y = 4
    for im in ims:
        im = im.resize((im.width * Z, im.height * Z), Image.NEAREST)
        out.paste(im, (4, y), im)
        y += im.height + 6
    dst = os.path.join(OUT, 'font', 'sample_text.png')
    out.save(dst)
    return dst


if __name__ == '__main__':
    for fn in (fig_msk_overlay, fig_combine, fig_font_text):
        print(fn.__name__, '->', fn())
