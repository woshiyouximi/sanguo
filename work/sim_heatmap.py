# -*- coding: utf-8 -*-
"""三国群英传2 竖版重制 · 兵种对拍 13×13 胜率热力图（Pillow，无 matplotlib）"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = 'F:/sanguo'
SRC = f'{ROOT}/work/sim_report.json'
OUT = f'{ROOT}/project/img/sim_heatmap.png'
FONT = 'C:/Windows/Fonts/msyh.ttc'
if len(sys.argv) > 1:
    SRC = sys.argv[1]
if len(sys.argv) > 2:
    OUT = sys.argv[2]

j = json.load(open(SRC, encoding='utf-8'))
g = j['groups']['troop']
names = g['names']
rate = g['rate']          # 13x13，上三角实测、下三角 1-p 镜像
nmat = [[60] * len(names) for _ in names]
n_of = {}
for c in g['cells']:
    n_of[(c['i'], c['j'])] = c['n']
meta = j['meta']

# 按实测行胜率排序（跨全部对手）
row = []
for i in range(len(names)):
    vals = [rate[i][k] for k in range(len(names)) if k != i]
    row.append(sum(vals) / len(vals))
order = sorted(range(len(names)), key=lambda i: -row[i])

W, H = 1500, 1490
img = Image.new('RGB', (W, H), (252, 252, 250))
d = ImageDraw.Draw(img)
f_title = ImageFont.truetype(FONT, 34)
f_sub = ImageFont.truetype(FONT, 21)
f_lab = ImageFont.truetype(FONT, 22)
f_cell = ImageFont.truetype(FONT, 21)
f_small = ImageFont.truetype(FONT, 18)
f_note = ImageFont.truetype(FONT, 19)

INK = (34, 34, 38)
GREY = (110, 110, 116)


def blend(c1, c2, u):
    return tuple(int(round(c1[k] + (c2[k] - c1[k]) * u)) for k in range(3))


def ramp(t):
    """0 → 深蓝，0.5 → 近白，1 → 深红"""
    t = max(0.0, min(1.0, t))
    if t <= 0.5:
        return blend((31, 66, 145), (250, 250, 250), t / 0.5)
    return blend((250, 250, 250), (172, 26, 38), (t - 0.5) / 0.5)


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


d.text((52, 34), '三国群英传2 竖版重制 · 兵种对拍实测胜率（13×13）', font=f_title, fill=INK)
d.text((54, 84), '行 = A 方兵种，列 = B 方兵种；格内数字 = 行方胜率 %；红 = 行方压制列方，蓝 = 行方被压制；'
                 '行按实测行胜率从高到低排序', font=f_sub, fill=GREY)
d.text((54, 116), f'同阵形（方形）· 同士气（60）· 同主将武力（70）· 各 100 兵 · 每对 n={n_of.get((0, 1), 60)} 局 · '
                  f'digest {meta.get("digest", "?")}', font=f_sub, fill=GREY)

CELL = 66
X0, Y0 = 200, 220
size = len(names)
grid = CELL * size

for r in range(size):
    i = order[r]
    for c in range(size):
        k = order[c]
        x, y = X0 + c * CELL, Y0 + r * CELL
        if i == k:
            d.rectangle([x, y, x + CELL, y + CELL], fill=(232, 232, 234), outline=(252, 252, 250))
            d.text((x + CELL / 2, y + CELL / 2), '—', font=f_cell, fill=(150, 150, 155), anchor='mm')
            continue
        p = rate[i][k]
        col = ramp(p)
        d.rectangle([x, y, x + CELL, y + CELL], fill=col, outline=(252, 252, 250))
        txt = f'{p * 100:.0f}'
        d.text((x + CELL / 2, y + CELL / 2), txt, font=f_cell,
               fill=(255, 255, 255) if lum(col) < 135 else (30, 30, 34), anchor='mm')

# 行/列标签
for r in range(size):
    i = order[r]
    y = Y0 + r * CELL + CELL / 2
    d.text((X0 - 14, y), names[i], font=f_lab, fill=INK, anchor='rm')
    d.text((X0 - 88, y), f'{row[i] * 100:.0f}%', font=f_small, fill=GREY, anchor='rm')
    x = X0 + r * CELL + CELL / 2
    d.text((x, Y0 - 12), names[i], font=f_small, fill=GREY, anchor='mb')

d.text((X0 - 88, Y0 - 40), '行胜率', font=f_small, fill=GREY)

# 色标
cx, cy, cw, ch = X0 + grid + 46, Y0, 26, 260
for t in range(ch):
    d.line([(cx, cy + t), (cx + cw, cy + t)], fill=ramp(1 - t / ch))
d.rectangle([cx, cy, cx + cw, cy + ch], outline=(180, 180, 184))
for t, lab in ((0.0, '0%'), (0.5, '50%'), (1.0, '100%')):
    yy = cy + ch * (1 - t)
    d.line([(cx + cw, yy), (cx + cw + 6, yy)], fill=(120, 120, 126))
    d.text((cx + cw + 10, yy), lab, font=f_small, fill=GREY, anchor='lm')
d.text((cx + cw + 10, cy + ch + 6), '行方胜率\n（格值=1 即为\n必克）', font=f_small, fill=GREY, spacing=5)
d.text((cx - 2, cy + ch + 96), '注：矩阵反对称\n列方胜率 = 1 − 格值\n下三角由 1−p 镜像补全', font=f_small,
       fill=GREY, spacing=6)

# 底部：相克幅度 vs 决定度（饱和曲线）
bx, by, bw = X0, Y0 + grid + 96, 620
d.text((bx, by - 40), '表值幅度 vs 实际决定度（每档取该对强方胜率；越接近 100% 越"一锤定音"）', font=f_note, fill=INK)
bins = [(1, 20), (21, 40), (41, 55), (56, 68)]
pairs = []
for r in range(size):
    for c in range(r + 1, size):
        i, k = order[r], order[c]
        pairs.append((abs(g['matrix'][i][k]), max(rate[i][k], 1 - rate[i][k]), i, k))
for bi, (lo, hi) in enumerate(bins):
    sel = [p[1] for p in pairs if lo <= p[0] <= hi]
    if not sel:
        continue
    avg = sum(sel) / len(sel)
    y = by + bi * 42
    d.text((bx - 8, y + 13), f'|{lo}–{hi}|', font=f_small, fill=GREY, anchor='rm')
    d.rectangle([bx + 76, y, bx + 76 + bw, y + 26], fill=(238, 238, 240))
    d.rectangle([bx + 76, y, bx + 76 + int(bw * avg), y + 26], fill=ramp(avg))
    d.text((bx + 76 + bw + 12, y + 13), f'强方均胜 {avg * 100:.1f}%（{len(sel)} 对）', font=f_small, fill=INK, anchor='lm')

small = [p[1] for p in pairs if p[0] <= 20]
d.text((bx, by + 4 * 42 + 6),
       f'结论：|表值| 最小的一档（1–20，{len(small)} 对）强方已经赢到 {sum(small) / len(small) * 100:.1f}%，最高档 100.0%。'
       '相克表更像"开关"而不是"旋钮"。', font=f_note, fill=INK)

d.text((54, H - 34), '数据：work/sim_report.json（tools/sim_balance.mjs）　脚本：work/sim_heatmap.py', font=f_small, fill=(150, 150, 155))

img.save(OUT)
print('wrote', OUT, img.size)
