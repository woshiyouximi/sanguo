# -*- coding: utf-8 -*-
import json, os, sys, collections, statistics, re
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini
J = r'F:\sanguo\extract\json'
BASE = r'F:\sanguo\extract\pak'

def load(n):
    return json.load(open(os.path.join(J, 'xls_%s.json' % n), encoding='utf-8'))['rows']

# TIMES1 generals: skill lists
ini = parse_ini.IniFile.load(os.path.join(BASE, 'TIMES1.INI'))
gens = [s for s in ini.sections if s.name.upper() == 'GENERAL']
print('general sections', len(gens))
seq2skills = {}
wise_unlock = collections.defaultdict(list)
for s in gens:
    seq = s.get('SEQUENCE')
    if not seq:
        continue
    for k, v, ln in s.fields:
        if k.upper() == 'SKILL' and v:
            lv, sid = [x.strip() for x in v.split(',')]
            seq2skills.setdefault(int(seq), []).append(int(sid))
        if k.upper() == 'WISESKILL' and v:
            lv, sid = [x.strip() for x in v.split(',')]
            wise_unlock[int(sid)].append(int(lv))
known = set()
for v in seq2skills.values():
    known.update(v)
print('distinct 武将技 used in TIMES1', len(known), 'missing seqs', sorted(set(range(1, 111)) - known))

S = load('武将技')
print('\n武将技 官衔 empty? ', collections.Counter(bool(r[7]) for r in S))
titled = [int(float(r[0])) for r in S if r[7]]
untitled = [int(float(r[0])) for r in S if not r[7]]
print('titled in TIMES?', sum(1 for i in titled if i in known), '/', len(titled))
print('untitled in TIMES?', sum(1 for i in untitled if i in known), '/', len(untitled))

# WISE level vs unlock
W = load('军师技')
wrows = []
for r in W:
    seq = int(float(r[0]))
    wrows.append((seq, int(float(r[1])), int(float(r[2])), r[3], int(float(r[4])), int(float(r[5])), int(float(r[6])),
                  min(wise_unlock.get(seq, [999]))))
print('\nWISE: seq exec wlvl name attrib level active minUnlock')
for row in wrows[:12]:
    print('   ', row)
print('minUnlock 999 count', sum(1 for r in wrows if r[7] == 999))
c = collections.Counter((r[5], r[7]) for r in wrows)
print('level vs minUnlock sample', list(c.items())[:10])

# FACE vs 图形类型
G = load('群英2')
face = {}
for s in gens:
    seq = s.get('SEQUENCE')
    if seq:
        face[int(seq)] = s.get('FACE')
pairs = collections.Counter()
for i, r in enumerate(G):
    seq = int(float(r[0]))
    pairs[(face.get(seq), r[59] if len(r) > 59 else '')] += 1
print('\nFACE vs 图形的类型 (first 15):', list(pairs.items())[:15])
print('distinct FACE', len(set(face.values())))

# items use level / rate
IT = load('物品')
print('\nitem 使用等级', collections.Counter(r[8] for r in IT))
print('item 搜索机率', collections.Counter(r[10] for r in IT))
print('item 可使用兵种', [r[15] for r in IT if r[15] != ''])
print('item 学会阵法', [r[16] for r in IT if r[16] != ''])

# paths sentinel
PA = [r for r in load('路径') if len(r) >= 5]
print('\npath length==30000 count', sum(1 for r in PA if float(r[3]) == 30000))
print('path length dist buckets', collections.Counter(int(float(r[3]) // 100 * 100) for r in PA if float(r[3]) != 30000))
