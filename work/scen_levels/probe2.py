# -*- coding: utf-8 -*-
"""探查 2：scenarios.json 元素结构、generals.json 的 by_times 字段。"""
import io
import json

W = r'F:\sanguo\work\scen_levels'
OUT = []


def say(*a):
    OUT.append(' '.join(str(x) for x in a))


def load(p):
    return json.load(io.open(p, encoding='utf-8-sig'))


sc = load(r'F:\sanguo\game\data\scenarios.json')
say('== scenarios.json: list len=%d ==' % len(sc))
s0 = sc[0]
say('elem0 keys:', list(s0.keys()))
for k, v in s0.items():
    if isinstance(v, list):
        say('  %s: list len=%d' % (k, len(v)))
        if v and isinstance(v[0], dict):
            say('     item keys:', list(v[0].keys()))
            say('     item0:', json.dumps(v[0], ensure_ascii=False)[:600])
        elif v:
            say('     item0:', json.dumps(v[0], ensure_ascii=False)[:300])
    else:
        say('  %s: %r' % (k, v))

say('')
say('== per-scenario summary ==')
for i, s in enumerate(sc):
    keys = list(s.keys())
    say('scen[%d] name=%r keys=%s' % (i, s.get('name') or s.get('TIME'), keys))

say('')
gen = load(r'F:\sanguo\game\data\generals.json')
g0 = gen[0]
say('== generals.json g0 ==')
for k in ('NAME', 'id', 'BaseEXP', 'POS', 'CITY', 'Status', 'pos_by_times', 'city_by_times', 'status_by_times'):
    say('  %s = %s' % (k, json.dumps(g0.get(k), ensure_ascii=False)[:800]))

say('')
say('== BaseEXP distribution (generals.json) ==')
d = {}
for g in gen:
    d[g.get('BaseEXP')] = d.get(g.get('BaseEXP'), 0) + 1
say('  ', d)

say('')
say('== names sample ==')
say('  ', [g['NAME'] for g in gen[:12]])
say('  n unique names =', len({g['NAME'] for g in gen}))

with io.open(W + r'\probe2.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(OUT))
print('ok')
