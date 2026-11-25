# -*- coding: utf-8 -*-
# 生成 work\ui_orig\used_contact.png：每个用到的原作图元 + 源码尺寸 + slice + 用在哪 + 页面实际效果
import os
from PIL import Image, ImageDraw, ImageFont

WORK = r'F:\sanguo\work\ui_orig'
A = r'F:\sanguo\game\web\assets\ui\orig'
MENU = r'F:\sanguo\export\png\SHAPE\MENU'
ITEMS = r'F:\sanguo\game\web\assets\items'

FONTP = r'C:\Windows\Fonts\msyh.ttc'
f_title = ImageFont.truetype(FONTP, 21)
f_sub = ImageFont.truetype(FONTP, 15)
f_img = ImageFont.truetype(FONTP, 13)

deploy = Image.open(os.path.join(WORK, 'deploy_after.png')).convert('RGB')
items = Image.open(os.path.join(WORK, 'items_after.png')).convert('RGB')

# (asset, source, src_size, slice, usage, crop_image)
E = [
    ('frame_panel.png', 'MENU\\E1_D.png', '241x73', 'slice 8 / border 8px',
     'deploy: .sec x6（::before 伪元素）；items: .sec 武将卡 / .listcol / .detcol\n'
     '为什么：四边 alpha 全 255、完全对称，藏青外影+4px 金带+暗红内影——MENU 里最薄的一圈「原作窗框」',
     deploy, (22, 103, 210, 200)),
    ('plate_btn.png', 'MENU\\D3_2H.png', '308x40', 'slice 16 / border 10px',
     '两页 .btn（返回 / 出征 / 装備 / 全部解锁）\n'
     '为什么：唯一「双线金框+四角十字托」且中空无烘字的按钮牌，1:1 不缩放也不糊',
     deploy, (398, 1202, 740, 1302)),
    ('plate_sq.png', 'MENU\\D0_B.png', '64x68', 'slice 12 / border 6px（小件）8px（大件）',
     'deploy: .gen img 头像、.pick .it、.grid .it 格牌；items: .gline img、.slot 装备槽、.pick .it、.gtabs .t 页签、.big 详情大图\n'
     '为什么：原作通用小方格框，四边对称、只有 4px 金带，缩到 40~130px 都还看得清',
     items, (515, 388, 690, 535)),
    ('plate_sel.png', 'MENU\\WAR08.png', '100x120', 'slice 12 / border 8px',
     'items: .irow.on 选中行（黄→红渐变+四角钩）\n'
     '为什么：原作打仗时框目标用的选择框，用来标「当前选中的道具」最贴切，且是画面里唯一的暖色强提示',
     items, (36, 452, 460, 532)),
    ('bar_div.png', 'MENU\\WAR05.png', '111x12', '背景拉伸 100% x 8~11px',
     'deploy: header 下缘 / footer 上缘；items: header / footer / .gtabs 页签下缘 / .ghead 分组粘头顶条\n'
     '为什么：原作横向分隔条（金线+藏青底），拉满宽度当「页眉与内容之间那道杠」',
     items, (22, 428, 452, 474)),
    ('gem_gold.png', 'MENU\\D3_1D.png', '22x22', '14px / image-rendering:pixelated',
     'deploy: .sec h2::before（主将 / 兵种 / 阵形 / 军师技 / 战前情报 / 兵力 六个小标题前的金色菱玉）\n'
     '为什么：原作菜单条目的引子记号，比 CSS 画的方块更「三国群英传」',
     deploy, (28, 118, 210, 152)),
    ('force_01..13.png', 'MENU\\FORCE01..13.png', '16x16', '19px / image-rendering:pixelated',
     'deploy: #troopgrid .it::before —— 13 个兵种格左侧的兵符单字图标（朴/槍/刀/弓/鏈/飛/武/蠻/鐵/籐/黃/弩/女，\n'
     '顺序与兵种表 0..12 一一对应，用 nth-child 挂，未學的灰格也有）\n'
     '为什么：原作兵种选择界面的样子就是「兵符小牌 + 名字」，这一格的辨识度全靠它',
     deploy, (34, 436, 400, 512)),
    ('assets/items/*.png (0 新增)', 'JEWEL\\WEAPONA1 / HORSEHA / BOOK01 / JEWEL01', '56x56', '16px / image-rendering:pixelated',
     'items: .slot[data-slot="weapon|horse|book|amulet"] .k::before —— 四个装备槽的槽名小图\n'
     '为什么：这 57 张原图早就在 game/web/assets/items/ 里了（道具图标就是它们），直接引，不新增文件',
     items, (36, 228, 460, 282)),
]

W = 1180
PAD = 12
rows = []
for e in E:
    name, src, sz, sl, usage, shot, box = e
    if name.startswith('assets/items'):
        im = Image.open(os.path.join(ITEMS, 'WEAPONA1.png')).convert('RGB')
    elif '..' in name:
        im = Image.open(os.path.join(A, 'force_01.png')).convert('RGB')
    else:
        im = Image.open(os.path.join(A, name)).convert('RGB')
    sc = min(190 / im.width, 150 / im.height, 5)
    sc = max(sc, 1)
    prev = im.resize((int(im.width * sc), int(im.height * sc)), Image.NEAREST)
    cr = shot.crop(box)
    csc = 2.0 if cr.width < 420 else 1.6
    cr = cr.resize((int(cr.width * csc), int(cr.height * csc)), Image.NEAREST)
    rows.append((e, im.size, prev, cr, sc, csc))

H = 96
for e, szp, prev, cr, sc, csc in rows:
    lines = e[4].split('\n')
    hh = 34 + 22 + 20 * len(lines) + max(prev.height, min(cr.height, 320)) + 16
    H += hh
H += 70

canvas = Image.new('RGB', (W, H), (18, 18, 22))
d = ImageDraw.Draw(canvas)
d.text((PAD, 14), 'F(ui-assets) 用到的原作图元对照 —— 源文件 / 尺寸 / slice / 用在哪 / 实际效果', font=f_title, fill=(232, 216, 168))
d.text((PAD, 44), '左：原图（最近邻放大）　右：截屏里的真实效果（2x 最近邻）　　全部源图来自 export\\png\\SHAPE\\MENU\\', font=f_sub, fill=(150, 150, 145))
y = 70
for i, (e, szp, prev, cr, sc, csc) in enumerate(rows):
    name, src, sz, sl, usage, shot, box = e
    d.line([(PAD, y), (W - PAD, y)], fill=(120, 100, 60), width=1)
    y += 8
    d.text((PAD, y), name, font=f_title, fill=(226, 200, 132))
    nw = d.textlength(name, font=f_title)
    d.text((PAD + nw + 10, y + 6), f'← {src}   {sz}   {sl}', font=f_sub, fill=(160, 190, 160))
    y += 30
    for ln in usage.split('\n'):
        d.text((PAD, y), ln, font=f_sub, fill=(190, 190, 185) if not ln.startswith('为什么') else (150, 170, 200))
        y += 21
    y += 4
    canvas.paste(prev, (PAD + 4, y))
    d.rectangle([PAD + 4, y, PAD + 4 + prev.width, y + prev.height], outline=(70, 70, 60))
    d.text((PAD + 4, y + prev.height + 4), f'{szp[0]}x{szp[1]}  x{sc:.2g}', font=f_img, fill=(120, 120, 115))
    if cr.height > 320:
        cr = cr.crop((0, 0, cr.width, 320))
    cy = y
    canvas.paste(cr, (PAD + 220, cy))
    d.rectangle([PAD + 220, cy, PAD + 220 + cr.width, cy + cr.height], outline=(70, 70, 60))
    d.text((PAD + 220, cy + cr.height + 4), f'截屏裁切 x{csc:g}', font=f_img, fill=(120, 120, 115))
    y = max(y + prev.height + 24, cy + cr.height + 24)

canvas = canvas.crop((0, 0, W, min(y + 12, H)))
canvas.save(os.path.join(WORK, 'used_contact.png'))
print('used_contact.png', canvas.size)
