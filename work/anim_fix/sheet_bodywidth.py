# -*- coding: utf-8 -*-
"""只读取证：量每个兵种帧的「不透明躯干宽度」，与车道节距对比。
   判据：相邻车道的两个兵，屏幕上左右间距 = lanePitch（缩放前 43.59px）；
        若躯干宽 > 43.59px，则零抖动时身体就已经压在一起（不是包围盒重叠，是像素重叠）。
   产出 body_width.json 与 body_width.txt
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, '..', '..', 'game'))
units = json.load(open(os.path.join(GAME, 'web', 'anim', 'units.json'), encoding='utf-8'))
img = Image.open(os.path.join(GAME, 'web', 'anim', 'units_00.png')).convert('RGBA')
alpha = img.split()[3]

frames = {s['name']: s for p in units['pages'] for s in p['sprites']}
groups = units['groups']

def bbox_of(name, thr=40):
    s = frames[name]
    a = alpha.crop((s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h']))
    w, h = a.size
    px = a.load()
    x0, x1, y0, y1 = w, -1, h, -1
    for y in range(h):
        for x in range(w):
            if px[x, y] > thr:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    if x1 < 0: return None
    return dict(w=x1 - x0 + 1, h=y1 - y0 + 1, x0=x0, x1=x1, y0=y0, y1=y1, cw=w, ch=h)

def body_of(name):
    """躯干宽：只看垂直方向 55%..92%（去掉头顶刀枪、只留身子），这一段的水平跨度"""
    s = frames[name]
    a = alpha.crop((s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h']))
    w, h = a.size
    px = a.load()
    y0, y1 = int(h * 0.55), int(h * 0.92)
    xs = []
    for y in range(y0, y1):
        for x in range(w):
            if px[x, y] > 40:
                xs.append(x)
    if not xs: return None
    # 取 5%..95% 分位，避免单手/佩刀把宽度撑大
    xs.sort()
    lo = xs[int(len(xs) * 0.05)]
    hi = xs[int(len(xs) * 0.95)]
    return dict(w=hi - lo + 1, lo=lo, hi=hi)

out = {'lane_pitch_px_at_scale1': None, 'troops': {}}
for gname, g in groups.items():
    if not isinstance(g, dict):
        continue
    rec = {}
    for key in ('back', 'front', 'attack', 'attackEnemy'):
        seq = g.get(key) or []
        if not seq: continue
        # 取 4 帧（0/3/6/9 或均匀）量躯干，取最大
        idxs = sorted({0, len(seq) // 3, (2 * len(seq)) // 3, len(seq) - 1})
        bw, bh, bb = 0, 0, 0
        for i in idxs:
            n = seq[i]
            if n not in frames: continue
            b = bbox_of(n); bd = body_of(n)
            if b: bh = max(bh, b['h']); bb = max(bb, b['w'])
            if bd: bw = max(bw, bd['w'])
        rec[key] = dict(body_w=bb, body_core_w=bw, body_h=bh)
    out['troops'][gname] = rec

# 车道节距（scale=1 时）：LANE_PX * 1 * LANE_SQUEEZE
import math
LANE_PX = 750 / 14
out['lane_px_750_14'] = LANE_PX
for k, v in out['troops'].items():
    for key, r in v.items():
        r['ratio_core_to_lane'] = round(r['body_core_w'] / LANE_PX, 3) if r['body_core_w'] else None
json.dump(out, open(os.path.join(HERE, 'body_width.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

lines = ['兵种/组          方向     躯干宽  躯干核宽 高  核宽/LANE_PX(53.57)']
for gname, v in out['troops'].items():
    for key, r in v.items():
        lines.append('%-17s %-9s %4d %7d %5d   %.2f' % (gname, key, r['body_w'], r['body_core_w'], r['body_h'], r['ratio_core_to_lane'] or 0))
open(os.path.join(HERE, 'body_width.txt'), 'w', encoding='utf-8').write('\n'.join(lines))
print('\n'.join(lines))
print('\nLANE_PX =', LANE_PX)
