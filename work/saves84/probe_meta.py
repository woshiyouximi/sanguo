# -*- coding: utf-8 -*-
"""R84 存档字段盘点探针：只读 game/data/*.json，把「原作字段 ↔ 数据里有没有」打到 UTF-8 文本。
用法：python work/saves84/probe_meta.py > work/saves84/probe_meta.txt
"""
import json, io, collections, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'game', 'data')


def load(name):
    with io.open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


def uniq(vals):
    c = collections.Counter(vals)
    return sorted(c.items(), key=lambda kv: (-kv[1], str(kv[0])))


out = []
p = out.append

generals = load('generals.json')
p('== generals.json (%d 条) ==' % len(generals))
for field in ['Status', 'Weapon', 'Horse', 'Thing', 'LOYAL', 'CONSTANCY', 'BLOOD', 'TYPE', 'CITY', 'POS']:
    vals = [g.get(field) for g in generals]
    u = uniq([json.dumps(v, ensure_ascii=False) for v in vals])
    p('%-10s distinct=%-3d %s' % (field, len(u), u[:12]))

p('')
p('== 非空 Weapon/Horse/Thing 例子 ==')
for field in ['Weapon', 'Horse', 'Thing']:
    ex = [(g['NAME'], g.get(field)) for g in generals if str(g.get(field) or '').strip() not in ('', '0')]
    p('%s 非空 %d 条：%s' % (field, len(ex), ex[:8]))

p('')
items = load('items.json')
p('== items.json (%d 条) TYPE 分布与序号区间 ==' % len(items))
by = collections.defaultdict(list)
for it in items:
    by[it.get('TYPE')].append(int(it.get('Sequence')))
for k in sorted(by):
    seqs = sorted(by[k])
    p('%-14s n=%-3d seq %d..%d  %s' % (k, len(seqs), seqs[0], seqs[-1], seqs[:20]))

p('')
p('== 装备类 item 名字（Sequence → Name） ==')
for t in ['JEWEL_WEAPON', 'JEWEL_HORSE', 'JEWEL_THING']:
    rows = [(int(it['Sequence']), it['Name']) for it in items if it.get('TYPE') == t]
    rows.sort()
    p('%s: %s' % (t, rows[:12]))

p('')
garrison = load('garrison.json')
p('== garrison.json (%d 个剧本条目) ==' % len(garrison))
st = collections.Counter()
okeys = set()
for sc in garrison:
    for cn, city in (sc.get('cities') or {}).items():
        for o in city.get('officers') or []:
            st[o.get('status')] += 1
            okeys.update(o.keys())
p('officer.status 分布: %s' % st.most_common())
p('officer 键: %s' % sorted(okeys))

scen = load('scenarios.json')
p('')
p('== scenarios.json (%d 个剧本) ==' % len(scen))
p('剧本键: %s' % sorted(scen[0].keys()))
p('城池键: %s' % sorted(scen[0]['cities'][0].keys()))
p('城池样例: %s' % json.dumps(scen[0]['cities'][0], ensure_ascii=False)[:600])

p('')
sysinfo = load('sango_system.json')
p('== sango_system.json ==')
p(json.dumps(sysinfo, ensure_ascii=False, indent=1))

with io.open(os.path.join(ROOT, 'work', 'saves84', 'probe_meta.txt'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(out) + '\n')
print('wrote probe_meta.txt (%d lines)' % len(out))
