# p02_scan_blobs.py -- 从已有 blobs.csv 里找"单位多且稳定"的帧
import csv, sys
P = r'F:\sanguo\work\orig_motion\out\blobs.csv'
rows = list(csv.DictReader(open(P)))
print('frames', len(rows), rows[0]['i'], rows[-1]['i'])
cur = {}
for r in rows:
    i = int(r['i'])
    us = []
    for k in range(8):
        a = int(r['a%d' % k])
        if a < 0:
            continue
        x0, y0, x1, y1 = (int(r['%s_%d' % (('x0', 'y0', 'x1', 'y1')[j], k)]) for j in range(4))
        if y0 < 75 or y0 > 250:
            continue
        if a < 120:
            continue
        us.append((a, x0, y0, x1, y1, (x0 + x1) / 2.0, (y0 + y1) / 2.0))
    cur[i] = us
# 连续 5 帧里单位数>=5 且位置几乎不变的段
keys = sorted(cur)
for i in keys:
    n = len(cur[i])
    if n >= 5:
        print(i, n, ' '.join('%.0f,%.0f' % (u[5], u[6]) for u in cur[i]))
