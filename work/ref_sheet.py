# -*- coding: utf-8 -*-
"""把原作底图拼成一张对照表，先看清 1999 年原作的信息层级。

产物：F:\\sanguo\\work\\ref_sheet.jpg  （约 1300 宽，带文件名 + 尺寸 + 用途标注）
"""
import os
from PIL import Image, ImageDraw, ImageFont

E = r'F:\sanguo\export\png'
M = os.path.join(E, 'SHAPE', 'MENU')
BG = os.path.join(E, 'SHAPE', 'BG')
T = os.path.join(E, 'tex')
OUT = r'F:\sanguo\work\ref_sheet.jpg'

FONT = 'C:/Windows/Fonts/msyh.ttc'
f_lab = ImageFont.truetype(FONT, 19, index=0)
f_note = ImageFont.truetype(FONT, 15, index=0)
f_title = ImageFont.truetype(FONT, 30, index=0)
f_sub = ImageFont.truetype(FONT, 17, index=0)

W = 1320
PAD = 14
LAB_H = 26
NOTE_H = 20
INK = (232, 224, 206)
DIM = (150, 145, 133)
ACC = (216, 179, 106)

# 每行：(标题, [(文件, 目标宽, 备注)], 行高上限)
ROWS = [
    ('大地图（整张）', [
        (os.path.join(E, 'SHAPE', 'MAP', 'CHINAMAP.png'), 700,
         '60 城 pos_xy 就是这张图的像素坐标；道路/河流已烘进像素'),
        (os.path.join(T, 'SHAPE_MAP_TEXTURE.png'), 260, '地表纹理'),
        (os.path.join(T, 'SHAPE_POLICY_YIELD.png'), 260, '内政产出底'),
    ], 560),
    ('内政大殿（全屏 640×480）', [
        (os.path.join(T, 'SHAPE_POLICY_PALAIS01.png'), 300, ''),
        (os.path.join(T, 'SHAPE_POLICY_PALAIS02.png'), 300, ''),
        (os.path.join(T, 'SHAPE_POLICY_PALAIS03.png'), 300, ''),
        (os.path.join(T, 'SHAPE_POLICY_PALAIS04.png'), 300, ''),
    ], 300),
    ('标题 / 主菜单 / 超长条', [
        (os.path.join(M, 'TITLEBG.png'), 380, '带 logo 与 ©1999 ODIN SOFT，不可整张用'),
        (os.path.join(M, 'TITLEBG2.png'), 380, '同上，仅取“军队/天空”区域'),
        (os.path.join(M, 'STAFF.png'), 90, '542×2711 制作名单长条'),
        (os.path.join(M, 'D1_1B.png'), 380, '内政主框 500×410'),
    ], 420),
    ('窗框 / 信息条 / 按钮（九宫格素材）', [
        (os.path.join(M, 'WARINFO01.png'), 190, '212×293 竖窗'),
        (os.path.join(M, 'WARINFO02.png'), 190, '212×293 竖窗'),
        (os.path.join(M, 'WARINFO03.png'), 90, '67×67 角'),
        (os.path.join(M, 'WARINFO04.png'), 190, '175×106 小条'),
        (os.path.join(M, 'WARINFO05.png'), 190, '158×107 小条'),
        (os.path.join(M, 'MAIN01A.png'), 190, '125×28 顶条'),
        (os.path.join(M, 'MAIN01B.png'), 190, '125×28 顶条'),
        (os.path.join(M, 'BUTTON01.png'), 120, '68×30 按钮'),
    ], 320),
    ('战斗底：全部是 96px 高的横条视差层，不是全屏图', [
        (os.path.join(BG, 'BG00A.png'), 310, 'BG 远山 730×96'),
        (os.path.join(BG, 'BG03B.png'), 310, 'BG 远山 730×96'),
        (os.path.join(BG, 'MG00A.png'), 310, 'MG 中景 880×96'),
        (os.path.join(BG, 'FG00A.png'), 310, 'FG 近景 1000×96'),
    ], 130),
]


def fit(img, w, hmax):
    iw, ih = img.size
    w = min(w, iw)
    h = round(ih * w / iw)
    if h > hmax:
        h = hmax
        w = round(iw * h / ih)
    return img.resize((max(1, w), max(1, h)), Image.LANCZOS)


def main():
    blocks = []
    for title, items, hmax in ROWS:
        cells = []
        for path, w, note in items:
            if not os.path.exists(path):
                print('MISS', path)
                continue
            im = Image.open(path)
            if im.mode != 'RGB':
                bg = Image.new('RGB', im.size, (24, 26, 30))
                bg.paste(im, mask=im.split()[-1] if im.mode in ('RGBA', 'LA') else None)
                im = bg
            else:
                im = im.convert('RGB')
            cells.append((fit(im, w, hmax), os.path.basename(path), im.size, note))
        blocks.append((title, cells))

    # 量尺寸
    total_h = 46 + 34
    for title, cells in blocks:
        total_h += 34 + max([c[0].size[1] + LAB_H + (NOTE_H if c[3] else 0) for c in cells] or [80]) + PAD

    sheet = Image.new('RGB', (W, total_h), (14, 16, 20))
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 12), '原作底图对照  ·  三國群英傳 II(1999 ODIN SOFT)', font=f_title, fill=INK)
    d.text((PAD, 50), '仅作构图与信息层级参考：不进包体、不描图、不取色。所有卡片尺寸与用途已标注。',
           font=f_sub, fill=ACC)

    y = 84
    for title, cells in blocks:
        d.text((PAD, y), title, font=f_lab, fill=ACC)
        y += 30
        x = PAD
        row_h = max([c[0].size[1] + LAB_H + (NOTE_H if c[3] else 0) for c in cells] or [80])
        for im, name, srcsize, note in cells:
            sheet.paste(im, (x, y))
            # 细边框，便于看清素材边界
            d.rectangle([x, y, x + im.size[0] - 1, y + im.size[1] - 1], outline=(70, 66, 58))
            d.text((x, y + im.size[1] + 3), '%s  %d×%d' % (name, srcsize[0], srcsize[1]),
                   font=f_note, fill=INK)
            if note:
                d.text((x, y + im.size[1] + 3 + 17), note, font=f_note, fill=DIM)
            x += im.size[0] + PAD
        y += row_h + PAD

    sheet.crop((0, 0, W, min(total_h, y + 6))).save(OUT, quality=88, optimize=True)
    print('wrote', OUT, sheet.size)


if __name__ == '__main__':
    main()
