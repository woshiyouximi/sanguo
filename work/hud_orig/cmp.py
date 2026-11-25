"""work/hud_orig/cmp.py —— 生成 project/180 报告用的对照图

输入：
  原作帧  work/video_ui_b/B_battle_0842.png   1280×720（游戏画面实际内容 x160..1120）
  我们帧  work/hud_orig/after_battle.png      1500×2668（750×1334 设计稿 @2x，dpr=2 的页面截图）

我们的帧不是纯 design*2：页面把 canvas 缩放成 718×1277 css 再按 dpr=2 出图，
所以 design → 图像 的映射是 image = (32, 57) + 1.9147 * design（已用头像框 x18/y1012 校准）。

输出：
  work/hud_orig/cmp_orig_vs_ours.png   原作 | 我们，四行对照（底部全条 / 左块 / 右块 / 金牌）
"""
from PIL import Image, ImageDraw, ImageFont

ORIG = r'F:\sanguo\work\video_ui_b\B_battle_0842.png'
OURS = r'F:\sanguo\work\hud_orig\after_battle.png'
OUT = r'F:\sanguo\work\hud_orig\cmp_orig_vs_ours.png'

SX = 1.9147          # design → 图像 的缩放
OX, OY = 32, 57      # design(0,0) → 图像偏移


def ours_box(x, y, w, h):
    return (int(OX + x * SX), int(OY + y * SX), int(OX + (x + w) * SX), int(OY + (y + h) * SX))


def load_font(size):
    for p in (r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\simhei.ttf'):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


o = Image.open(ORIG).convert('RGB')
u = Image.open(OURS).convert('RGB')

# (标题, 原作裁剪框, 我们裁剪框, 面板显示宽)
ROWS = [
    ('① 底部整条：左右两块主将（原作 x160..1120 / y505..720）',
     (160, 505, 1120, 720), ours_box(0, 990, 750, 344), 600),
    ('② 左块四字段：疲勞 / 士氣 / 智力 / 武力（原作左块 y628..720）',
     (160, 628, 520, 720), ours_box(108, 1004, 262, 96), 600),
    ('③ 右块镜像：士氣 / 疲勞 / 武力 / 智力（原作右块 y628..720）',
     (760, 628, 1120, 720), ours_box(366, 1004, 152, 96), 600),
    ('④ 中央金牌：中文数字倒计时（原作 0842 = 六十七）',
     (556, 505, 726, 586), ours_box(262, 2, 228, 54), 600),
]

PAD = 18
LABEL_H = 34
GAP = 16
W = PAD * 2 + 600 * 2 + GAP

font = load_font(19)
font_s = load_font(15)

panels = []
for title, ob, ub, width in ROWS:
    a = o.crop(ob)
    b = u.crop(ub)
    a = a.resize((width, max(1, round(a.height * width / a.width))), Image.LANCZOS)
    b = b.resize((width, max(1, round(b.height * width / b.width))), Image.LANCZOS)
    panels.append((title, a, b))

# 标注尺寸
note_h = 44
H = PAD
for title, a, b in panels:
    H += LABEL_H + max(a.height, b.height) + note_h + GAP
H += PAD

canvas = Image.new('RGB', (W, H), (18, 20, 24))
dr = ImageDraw.Draw(canvas)

y = PAD
for title, a, b in panels:
    dr.text((PAD, y), title, font=font, fill=(232, 214, 168))
    dr.text((PAD + 600 + GAP, y), '', font=font, fill=(232, 214, 168))
    y += LABEL_H
    canvas.paste(a, (PAD, y))
    canvas.paste(b, (PAD + 600 + GAP, y))
    dr.rectangle([PAD - 1, y - 1, PAD + a.width, y + a.height], outline=(90, 80, 60))
    dr.rectangle([PAD + 600 + GAP - 1, y - 1, PAD + 600 + GAP + b.width, y + b.height], outline=(90, 80, 60))
    y += max(a.height, b.height) + 4
    dr.text((PAD, y), '← 原作（1280×720 录像帧）', font=font_s, fill=(150, 160, 170))
    dr.text((PAD + 600 + GAP, y), '→ 我们（750×1334 @2x，改后）', font=font_s, fill=(150, 160, 170))
    y += note_h + GAP

canvas.save(OUT)
print('wrote', OUT, canvas.size)
