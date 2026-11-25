# -*- coding: utf-8 -*-
"""坐标吻合度的量化验证（不靠肉眼）。

三条独立证据：
  A) 结构：116 条 path 的 points[0]/points[-1] 必须 == 起/终城的 pos_xy（同一坐标系）
  B) 像素：path 的每个走点应落在底图烘出来的橙色道路像素上 → 给出到最近道路像素的距离分布
     这同时证明"烘进底图的道路"就是用这套坐标画的，即 pos_xy 与 CHINAMAP 同系
  C) 零假设：随机 2000 点的同一距离分布，用于说明 B 不是巧合
输出：work/map_orig/align_stats.json + roadmask_check.png
"""
import json, os
import numpy as np
from PIL import Image

ROOT = r'F:\sanguo'
OUT = os.path.join(ROOT, r'work\map_orig')
img = np.asarray(Image.open(os.path.join(ROOT, r'export\png\SHAPE\MAP\CHINAMAP.png'))
                 .convert('RGB')).astype(np.int16)
R, G, B = img[:, :, 0], img[:, :, 1], img[:, :, 2]
# 道路橙：R 很高、R-B 极大、G 中等；用 R-B>=150 把黄土高原(222,178,107→R-B=115)排除掉
road = (R >= 185) & (G >= 90) & (G <= 180) & ((R - B) >= 150)
H, W = road.shape
print('road mask px = %d (%.2f%% of %dx%d)' % (road.sum(), 100 * road.mean(), W, H))

# 距离变换（4-邻域 BFS 近似欧氏：用 scipy 没有，手写两遍 chamfer）
INF = 1e9
d = np.where(road, 0.0, INF).astype(np.float64)
# chamfer 3x3 (a=1, b=1.414)
for y in range(H):
    row = d[y]
    if y > 0:
        prev = d[y - 1]
        np.minimum(row, prev + 1.0, out=row)
        shifted = np.full(W, INF); shifted[1:] = prev[:-1] + 1.41421356
        np.minimum(row, shifted, out=row)
        shifted = np.full(W, INF); shifted[:-1] = prev[1:] + 1.41421356
        np.minimum(row, shifted, out=row)
    for x in range(1, W):
        if row[x - 1] + 1.0 < row[x]:
            row[x] = row[x - 1] + 1.0
for y in range(H - 1, -1, -1):
    row = d[y]
    if y < H - 1:
        nxt = d[y + 1]
        np.minimum(row, nxt + 1.0, out=row)
        shifted = np.full(W, INF); shifted[1:] = nxt[:-1] + 1.41421356
        np.minimum(row, shifted, out=row)
        shifted = np.full(W, INF); shifted[:-1] = nxt[1:] + 1.41421356
        np.minimum(row, shifted, out=row)
    for x in range(W - 2, -1, -1):
        if row[x + 1] + 1.0 < row[x]:
            row[x] = row[x + 1] + 1.0
print('distance transform done, road coverage max dist %.1f' % d.max())

data = json.load(open(os.path.join(ROOT, r'game\data\scenarios.json'), encoding='utf-8'))
sc = data[0]
cities = sc['cities']
by = {c['NAME']: c for c in cities}


def show(name):
    c = by[name]
    x, y = c['pos_xy']
    return dict(name=name, pos=[x, y], dist_px=round(float(d[np.clip(y, 0, H - 1), np.clip(x, 0, W - 1)]), 2))


# ---- A) 结构一致性 ----
bad = []
exact = 0
for p in sc['paths']:
    a, b = by.get(p['Start']), by.get(p['End'])
    pts = p.get('points') or []
    if not a or not b or not pts:
        bad.append((p.get('_index'), 'missing')); continue
    d0 = max(abs(pts[0][0] - a['pos_xy'][0]), abs(pts[0][1] - a['pos_xy'][1]))
    d1 = max(abs(pts[-1][0] - b['pos_xy'][0]), abs(pts[-1][1] - b['pos_xy'][1]))
    if d0 == 0 and d1 == 0:
        exact += 1
    else:
        bad.append((p.get('_index'), p['Start'], d0, p['End'], d1))
print('\n[A] paths total=%d  endpoints exactly == pos_xy: %d  mismatched: %d' % (
    len(sc['paths']), exact, len(bad)))
if bad:
    print('    mismatches:', bad[:5])

# ---- B) 走点落在道路像素上 ----
pd = []
for p in sc['paths']:
    for (x, y) in (p.get('points') or []):
        pd.append(d[np.clip(y, 0, H - 1), np.clip(x, 0, W - 1)])
pd = np.array(pd)
cd = np.array([d[np.clip(c['pos_xy'][1], 0, H - 1), np.clip(c['pos_xy'][0], 0, W - 1)]
               for c in cities])
rng = np.random.default_rng(7)
rnd = rng.integers([0, 0], [W, H], size=(2000, 2))
rd = np.array([d[y, x] for x, y in rnd])


def stat(a):
    return dict(n=int(a.size), med=round(float(np.median(a)), 2), mean=round(float(a.mean()), 2),
                p90=round(float(np.percentile(a, 90)), 2), p95=round(float(np.percentile(a, 95)), 2),
                max=round(float(a.max()), 2), le2=int((a <= 2).sum()), le4=int((a <= 4).sum()))


print('\n[B] path 走点 -> 最近橙色道路像素距离 (px):', stat(pd))
print('[B] 60 城 pos_xy -> 最近橙色道路像素距离 (px):', stat(cd))
print('[C] 随机 2000 点 同距离:', stat(rd))
print('\n城逐点:')
for c in cities:
    print('  %-4s (%4d,%3d)  d=%5.2fpx' % (c['NAME'], c['pos_xy'][0], c['pos_xy'][1],
                                           d[c['pos_xy'][1], c['pos_xy'][0]]))

SIX = ['洛陽', '長安', '成都', '建業', '襄平', '代縣']
six = [show(n) for n in SIX]
print('\n六个核对城:', six)

res = dict(road_px=int(road.sum()), road_pct=round(100 * float(road.mean()), 3),
           paths=len(sc['paths']), endpoints_exact=exact, endpoints_bad=bad,
           path_points=stat(pd), cities=stat(cd), random=stat(rd), six=six)
json.dump(res, open(os.path.join(OUT, 'align_stats.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)

# 视觉核对：道路掩膜画成红/绿叠图，确认掩膜确实只框住道路
vis = img.astype(np.uint8).copy()
vis[road] = [255, 0, 255]
Image.fromarray(vis).resize((W // 2, H // 2), Image.LANCZOS).save(
    os.path.join(OUT, 'roadmask_check.png'))
print('\nwrote align_stats.json + roadmask_check.png')
