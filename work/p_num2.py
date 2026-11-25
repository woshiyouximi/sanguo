# -*- coding: utf-8 -*-
import json, os, sys, collections, statistics, re
sys.path.insert(0, r'F:\sanguo\tools')
J = r'F:\sanguo\extract\json'

def load(n):
    return json.load(open(os.path.join(J, 'xls_%s.json' % n), encoding='utf-8'))['rows']

# ---------- items
it = load('物品')
print('items', len(it))
hdr = json.load(open(os.path.join(J, 'xls_物品.json'), encoding='utf-8'))['header']
for i, h in enumerate(hdr):
    vals = [r[i] for r in it if i < len(r) and r[i] != '']
    print('  [%2d] %-8s n=%-3d sample=%s' % (i, h, len(vals), vals[:6]))
print('  TYPE', collections.Counter(r[3] for r in it))
print('  Attrib', collections.Counter(r[2] for r in it))
print('  Sort', collections.Counter(r[7] for r in it).most_common())

# ---------- formations matrix
fa = json.load(open(os.path.join(J, 'xls_阵形.json'), encoding='utf-8'))
print('\nformation header', fa['header'])
print('formation rows', len(fa['rows']), [r[0] for r in fa['rows']])

tr = json.load(open(os.path.join(J, 'xls_兵种.json'), encoding='utf-8'))
print('troop header', tr['header'])
print('troop rows', len(tr['rows']), [r[0] for r in tr['rows']])

# ---------- paths
pa = [r for r in load('路径') if len(r) >= 5]
print('\npaths', len(pa))
L = [float(r[3]) for r in pa]
print('len stats min/max/mean/median', min(L), max(L), statistics.mean(L), statistics.median(L))
print('top5', sorted(pa, key=lambda r: -float(r[3]))[:5])
deg = collections.Counter()
for r in pa:
    deg[r[1]] += 1
    deg[r[2]] += 1
print('cities in paths', len(deg), 'degree dist', collections.Counter(deg.values()))
print('top degree', deg.most_common(8))

# ---------- cities + TIMES1
ct = load('城池')
print('\ncities', len(ct), ct[0])
