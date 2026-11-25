# -*- coding: utf-8 -*-
"""
取证脚本（只读）：把 units_00.png 里某兵种的 walk / atk 帧裁出来放大拼版，
并量化「攻击帧之间到底差多少像素」——用来回答「攻击有没有挥砍动作」这个视觉问题。

跑法：
  python F:\\sanguo\\work\\anim_fix\\sheet_frames.py
产出（都在 work\\anim_fix\\）：
  sheet_podao_atk.png     朴刀 walk_00..03 + atk_00..09，3x 放大，格上标序号
  sheet_dadao_atk.png     大刀 同上
  sheet_actions_atk.png   anim/actions.json 的 attack_back_f000..f009（animSelect 那套）
  frame_diff.json         逐帧与「第一帧」的差异度（平均绝对差 / 变化像素占比 / 包围盒）
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = r'F:\sanguo\game\web\anim'
OUT = r'F:\sanguo\work\anim_fix'
SCALE = 3
PAD = 6
LABEL_H = 14

units = json.load(open(os.path.join(ROOT, 'units.json'), encoding='utf-8'))
actions = json.load(open(os.path.join(ROOT, 'actions.json'), encoding='utf-8'))
units_img = Image.open(os.path.join(ROOT, 'units_00.png')).convert('RGBA')
actions_img = Image.open(os.path.join(ROOT, 'actions_00.png')).convert('RGBA')

rects = {sp['name']: sp for sp in units['pages'][0]['sprites']}
arects = {sp['name']: sp for page in actions['pages'] for sp in page['sprites']}


def crop(img, r):
    return img.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))


def diff_stats(frames, base, tag):
    """frames: [(name, PIL.Image)]；base = 参考帧下标。返回可进 JSON 的统计。"""
    b = frames[base][1].convert('RGBA')
    bw, bh = b.size
    out = []
    for i, (name, im) in enumerate(frames):
        im2 = im.convert('RGBA').resize((bw, bh), Image.NEAREST) if im.size != (bw, bh) else im.convert('RGBA')
        pb = b.load()
        pi = im2.load()
        tot = 0
        changed = 0
        sumdiff = 0
        # 只在参考帧 bbox 内比，避免不同帧高矮把差异算成「背景变了」
        for y in range(bh):
            for x in range(bw):
                a = pb[x, y]
                c = pi[x, y]
                d = abs(a[0] - c[0]) + abs(a[1] - c[1]) + abs(a[2] - c[2]) + abs(a[3] - c[3])
                sumdiff += d
                tot += 1
                if d > 24:
                    changed += 1
        out.append({
            'i': i,
            'name': name,
            'w': im.size[0],
            'h': im.size[1],
            'meanAbsDiff': round(sumdiff / (tot * 4.0), 2),
            'changedPct': round(100.0 * changed / tot, 2),
        })
    return {'frames': out, 'baseIndex': base, 'baseName': frames[base][0], 'tag': tag}


def sheet(rows, out_name, title):
    """rows: [(rowLabel, [(frameLabel, PIL.Image)])] —— 每行等高居中对齐，3x 放大。"""
    cell_w = max(im.size[0] for _, row in rows for _, im in row) * SCALE
    cell_h = max(im.size[1] for _, row in rows for _, im in row) * SCALE
    cols = max(len(row) for _, row in rows)
    row_h = cell_h + LABEL_H
    W = PAD + cols * (cell_w + PAD)
    H = 22 + PAD + len(rows) * (row_h + PAD)
    canvas = Image.new('RGBA', (W, H), (18, 18, 22, 255))
    d = ImageDraw.Draw(canvas)
    d.text((PAD, 6), title, fill=(255, 220, 120, 255))
    y = 22 + PAD
    for row_label, row in rows:
        d.text((PAD, y), row_label, fill=(140, 200, 255, 255))
        y += LABEL_H
        for i, (lab, im) in enumerate(row):
            big = im.resize((im.size[0] * SCALE, im.size[1] * SCALE), Image.NEAREST)
            x = PAD + i * (cell_w + PAD) + (cell_w - big.size[0]) // 2
            cy = y + (cell_h - big.size[1])  # 底对齐（脚底同一条线）
            d.rectangle((PAD + i * (cell_w + PAD), y, PAD + i * (cell_w + PAD) + cell_w - 1, y + cell_h - 1),
                        outline=(60, 60, 70, 255))
            canvas.alpha_composite(big, (x, cy))
            d.text((PAD + i * (cell_w + PAD) + 2, y + cell_h - 12), lab, fill=(230, 230, 230, 255))
        y += row_h + PAD
    path = os.path.join(OUT, out_name)
    canvas.convert('RGB').save(path)
    print('wrote', path, canvas.size)


report = {}

for troop in ('podao', 'dadao'):
    walk = [('%s_walk_%02d' % (troop, i), crop(units_img, rects['%s_walk_%02d' % (troop, i)])) for i in range(4)]
    atk = [('%s_atk_%02d' % (troop, i), crop(units_img, rects['%s_atk_%02d' % (troop, i)])) for i in range(10)]
    eatk = [('%s_eatk_%02d' % (troop, i), crop(units_img, rects['%s_eatk_%02d' % (troop, i)])) for i in range(10)]
    sheet([
        ('walk (走路循环 12 帧的前 4 帧)', walk),
        ('atk (我方攻击 10 帧)', atk),
        ('eatk (敌方攻击 10 帧)', eatk),
    ], 'sheet_%s_atk.png' % troop, '%s: walk vs atk vs eatk  (%dx)' % (troop, SCALE))
    report[troop + '_atk'] = diff_stats(atk, 0, troop + ':attack vs atk_00')
    report[troop + '_walk'] = diff_stats(walk, 0, troop + ':walk vs walk_00')
    report[troop + '_walk_vs_atk'] = diff_stats([('walk_00', walk[0][1])] + atk, 0, troop + ':walk_00 as base')

act = [('attack_back_f%03d' % i, crop(actions_img, arects['attack_back_f%03d' % i])) for i in range(10)]
hit = [('hit_back_f%03d' % i, crop(actions_img, arects['hit_back_f%03d' % i])) for i in range(10)]
sheet([
    ('attack_back (animSelect 我方挥砍 10 帧)', act),
    ('hit_back (animSelect 我方受击 10 帧)', hit),
], 'sheet_actions_atk.png', 'actions_00.png: attack_back vs hit_back  (%dx)' % SCALE)
report['attack_back'] = diff_stats(act, 0, 'attack_back vs f000')
report['hit_back'] = diff_stats(hit, 0, 'hit_back vs f000')

with open(os.path.join(OUT, 'frame_diff.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=1)
print('wrote', os.path.join(OUT, 'frame_diff.json'))

# 控制台摘要，方便直接抄进 REPORT
for k, v in report.items():
    fr = v['frames']
    ch = [f['changedPct'] for f in fr]
    print('%-18s %-34s changed%% min=%.2f max=%.2f  (frame0..N: %s)' % (
        k, v['tag'], min(ch), max(ch), ' '.join('%.0f' % c for c in ch)))
