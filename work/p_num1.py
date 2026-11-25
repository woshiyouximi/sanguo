# -*- coding: utf-8 -*-
import json, os, collections, statistics
J = r'F:\sanguo\extract\json'

def load(name):
    return json.load(open(os.path.join(J, 'xls_%s.json' % name), encoding='utf-8'))

g = load('群英2')
rows = g['rows']
print('hdr', g['header'])
war = [float(r[2]) for r in rows]
intel = [float(r[3]) for r in rows]
tot = [float(r[4]) for r in rows]
print('war min/max/mean/median', min(war), max(war), statistics.mean(war), statistics.median(war))
print('int min/max/mean/median', min(intel), max(intel), statistics.mean(intel), statistics.median(intel))
print('tot range', min(tot), max(tot), 'sum check bad', sum(1 for w, i, t in zip(war, intel, tot) if w + i != t))
print('war hist', sorted(collections.Counter(war).items())[:5])
print('unique war', len(set(war)), 'unique int', len(set(intel)))

# skill level slots
print('\nskill slot levels:')
for slot in range(7):
    lv = [float(r[5 + slot * 2 + 1]) for r in rows if len(r) > 5 + slot * 2 + 1 and r[5 + slot * 2 + 1] != '']
    names = set(r[5 + slot * 2] for r in rows if len(r) > 5 + slot * 2 and r[5 + slot * 2] != '')
    print('  slot%d n=%d levels=%s mean=%.2f' % (slot + 1, len(lv),
          sorted(collections.Counter(lv).items()), statistics.mean(lv) if lv else 0))
print('wise slot levels:')
for slot in range(8):
    c = 21 + slot * 2
    lv = [float(r[c + 1]) for r in rows if len(r) > c + 1 and r[c + 1] != '']
    print('  slot%d n=%d levels=%s' % (slot + 1, len(lv), sorted(collections.Counter(lv).items())))

# scenario columns
CITY = [37, 39, 41, 43, 45]
ST = [38, 40, 42, 44, 46]
for k in range(5):
    cities = [r[CITY[k]] for r in rows if len(r) > CITY[k] and r[CITY[k]] != '']
    sts = collections.Counter(r[ST[k]] for r in rows if len(r) > ST[k])
    print('scen%d generals=%d status=%s' % (k + 1, len(cities), dict(sts)))
print('blood', collections.Counter(r[57] for r in rows if len(r) > 57))
print('constancy', collections.Counter(r[58] for r in rows if len(r) > 58))
print('gtype', collections.Counter(r[59] for r in rows if len(r) > 59))
print('flag', collections.Counter(r[60] for r in rows if len(r) > 60))
print('weapon sample', collections.Counter(r[47] for r in rows if len(r) > 47).most_common(8))
print('battlearray sample', collections.Counter(r[48] for r in rows if len(r) > 48).most_common(8))

# 武将技
s = load('武将技')
S = s['rows']
print('\n武将技 rows', len(S), 'hdr', s['header'])
import statistics as st
for i, name in [(2, 'MP'), (3, 'POWER'), (4, 'ATK'), (5, 'SCRIPT')]:
    v = [float(r[i]) for r in S]
    print('  %s min/max/mean/med %s %s %.1f %.1f' % (name, min(v), max(v), st.mean(v), st.median(v)))
print('  SCRIPT counter', sorted(collections.Counter(int(float(r[5])) for r in S).items()))
print('  ATTRIB counter', collections.Counter(r[6] for r in S).most_common())
print('  TITLE counter', collections.Counter(r[7] for r in S).most_common())
print('  ACTIVE counter', collections.Counter(r[9] for r in S).most_common())
print('  NOTE sample', [r[8] for r in S[:6]])

w = load('军师技')
W = w['rows']
print('\n军师技 rows', len(W), w['header'])
print('  exec counter', sorted(collections.Counter(int(float(r[1])) for r in W).items()))
print('  wiselevel counter', collections.Counter(int(float(r[2])) for r in W).items() if False else collections.Counter(int(float(r[2])) for r in W))
print('  level counter', sorted(collections.Counter(float(r[5]) for r in W).items()))
print('  attrib', collections.Counter(r[4] for r in W).most_common())
print('  active', collections.Counter(r[6] for r in W).most_common())
