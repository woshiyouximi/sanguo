# -*- coding: utf-8 -*-
import json, os, sys, collections, statistics, re
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini
J = r'F:\sanguo\extract\json'
BASE = r'F:\sanguo\extract\pak'
def load(n):
    return json.load(open(os.path.join(J, 'xls_%s.json' % n), encoding='utf-8'))['rows']

ini = parse_ini.IniFile.load(os.path.join(BASE, 'TIMES1.INI'))
gens = [s for s in ini.sections if s.name.upper() == 'GENERAL' and s.get('SEQUENCE')]
skill_users = collections.Counter()
for s in gens:
    for k, v, ln in s.fields:
        if k.upper() == 'SKILL' and v:
            skill_users[int(v.split(',')[1])] += 1
S = load('武将技')
titled = [int(float(r[0])) for r in S if r[7]]
untitled = [int(float(r[0])) for r in S if not r[7]]
print('avg users titled %.2f untitled %.2f' % (
    statistics.mean(skill_users[i] for i in titled), statistics.mean(skill_users[i] for i in untitled)))
print('max users', skill_users.most_common(8))
print('min users', sorted(skill_users.items(), key=lambda x: x[1])[:8])

# WISE level by wlvl
W = load('军师技')
by = collections.defaultdict(list)
for r in W:
    by[int(float(r[2]))].append(int(float(r[5])))
for k in sorted(by):
    print('wlvl %d n=%d mean level %.1f min %d max %d' % (k, len(by[k]), statistics.mean(by[k]), min(by[k]), max(by[k])))
# level vs active
bya = collections.defaultdict(list)
for r in W:
    bya[int(float(r[6]))].append(int(float(r[5])))
for k in sorted(bya):
    print('active %d n=%d mean level %.1f' % (k, len(bya[k]), statistics.mean(bya[k])))

# BODY naming
body = os.path.join(BASE, 'SHAPE', 'MAJOR', 'BODY')
fs = sorted(os.listdir(body))
print('\nBODY files', len(fs), fs[:12])
pref = collections.Counter(f[:2] for f in fs)
print('BODY prefixes', len(pref), sorted(pref.items())[:20])

# paths
PA = [r for r in load('路径') if len(r) >= 5]
real = [float(r[3]) for r in PA if float(r[3]) != 30000]
print('\nreal path len max', max(real), 'min', min(real), 'mean %.1f' % statistics.mean(real))
# connectivity ignoring 30000
adj = collections.defaultdict(dict)
for r in PA:
    if float(r[3]) == 30000:
        continue
    adj[r[1]][r[2]] = float(r[3])
    adj[r[2]][r[1]] = float(r[3])
nodes = set(adj) | set(r[2] for r in PA)
seen, stack = set(), []
comp = 0
for n in nodes:
    if n in seen:
        continue
    comp += 1
    stack = [n]
    while stack:
        x = stack.pop()
        if x in seen:
            continue
        seen.add(x)
        stack.extend(adj[x])
print('nodes', len(nodes), 'components (excluding sentinel)', comp)
# dijkstra diameter
import heapq
def dij(src):
    d = {src: 0.0}
    pq = [(0.0, src)]
    while pq:
        du, u = heapq.heappop(pq)
        if du > d[u]:
            continue
        for v, w in adj[u].items():
            if du + w < d.get(v, 1e18):
                d[v] = du + w
                heapq.heappush(pq, (du + w, v))
    return d
best = (0, None, None)
for n in list(nodes):
    dd = dij(n)
    for m, dist in dd.items():
        if dist > best[0]:
            best = (dist, n, m)
print('graph diameter %.0f between %s and %s' % best)

# cities vs TIMES1
CT = load('城池')
city_ini = {}
for s in ini.sections:
    if s.name.upper().startswith('CITY'):
        name = s.get('NAME')
        if name:
            city_ini[name] = s
print('\ncities in TIMES1', len(city_ini))
print('RATE distribution', collections.Counter(int(float(r[4])) for r in CT))
rows = []
for r in CT:
    nm = r[1]
    # find by simplified fallback
    s = city_ini.get(nm)
    if s is None:
        for k, v in city_ini.items():
            if k[-1] == nm[-1] and len(k) == len(nm):
                s = v
                break
    if s is None:
        rows.append((nm, None))
    else:
        rows.append((nm, int(s.get('POPULATION') or 0), int(s.get('DEFENSE') or 0), int(s.get('MONEY') or 0),
                     int(float(r[4])), int(float(r[5]))))
print('unmatched cities', [r[0] for r in rows if r[1] is None])
byrate = collections.defaultdict(list)
for nm, pop, df, money, rate, flag in rows:
    if pop is not None:
        byrate[rate].append((pop, df, money))
for k in sorted(byrate):
    v = byrate[k]
    print('rate %d n=%d pop mean %.0f money mean %.0f defense mean %.0f' % (
        k, len(v), statistics.mean(x[0] for x in v), statistics.mean(x[2] for x in v),
        statistics.mean(x[1] for x in v)))
print('richest', sorted([r for r in rows if r[1]], key=lambda r: -r[3])[:5])
print('populous', sorted([r for r in rows if r[1]], key=lambda r: -r[1])[:5])

# troop / formation usage
G = load('群英2')
use_troop = collections.Counter(r[51].split()[0] for r in G if len(r) > 51 and r[51])
print('\n使用兵种', use_troop.most_common())
print('可用兵种 count dist', collections.Counter(len(r[50].split()) for r in G if len(r) > 50))
use_fa = collections.Counter(r[49] for r in G if len(r) > 49)
print('使用阵形', use_fa.most_common())
print('可用阵形 count dist', collections.Counter(len(r[48].split()) for r in G if len(r) > 48))
print('wise count dist', collections.Counter(sum(1 for s in range(8)
      if len(G[0]) > 21 + s * 2 and G[0][21 + s * 2] != '') for _ in [0]))
wc = collections.Counter()
for r in G:
    n = 0
    for s in range(8):
        c = 21 + s * 2
        if len(r) > c and r[c] != '':
            n += 1
    wc[n] += 1
print('wise per general', sorted(wc.items()))
sc = collections.Counter()
for r in G:
    n = 0
    for s in range(7):
        c = 5 + s * 2
        if len(r) > c and r[c] != '':
            n += 1
    sc[n] += 1
print('skill per general', sorted(sc.items()))
