# -*- coding: utf-8 -*-
"""离线生成巡检用「期望数据基准」，输出 UTF-8 文本，供人工对照。只读 game/data。"""
import json, os, io, sys

D = r'F:\sanguo\game\data'
OUT = r'F:\sanguo\work\ui_sweep\baseline_data.txt'
out = io.StringIO()
def w(*a):
    print(*a, file=out)

sc = json.load(open(os.path.join(D, 'scenarios.json'), encoding='utf-8'))
gen = json.load(open(os.path.join(D, 'generals.json'), encoding='utf-8'))
items = json.load(open(os.path.join(D, 'items.json'), encoding='utf-8'))
forms = json.load(open(os.path.join(D, 'formations.json'), encoding='utf-8'))
troops = json.load(open(os.path.join(D, 'troops.json'), encoding='utf-8'))
wises = json.load(open(os.path.join(D, 'wises.json'), encoding='utf-8'))
gar = json.load(open(os.path.join(D, 'garrison.json'), encoding='utf-8'))
lv = json.load(open(os.path.join(D, 'levels_by_scenario.json'), encoding='utf-8'))
meta = json.load(open(os.path.join(D, 'meta.json'), encoding='utf-8'))

def names(x):
    return [e.get('NAME') for e in x] if isinstance(x, list) else list(x)[:60]

w('== meta.json ==')
w(json.dumps(meta, ensure_ascii=False)[:2000])
w()
w('== scenarios ==')
for i, s in enumerate(sc):
    sysd = s.get('system', {})
    w('sci=%d YEAR=%s id=%s file=%s kings=%d cities=%d' % (i, sysd.get('YEAR'), s.get('id'), s.get('file'), len(s.get('kings', [])), len(s.get('cities', []))))
w()
w('== 189(sc i=1) 平原 base ==')
for c in sc[1]['cities']:
    if c.get('NAME') == '平原':
        w(json.dumps(c, ensure_ascii=False))
w()
w('== 189 kings (19) ==')
for k in sc[1]['kings']:
    w(json.dumps(k, ensure_ascii=False))
w()
w('== 平原 归属 & 相邻路径 ==')
w('paths type', type(sc[1].get('paths')).__name__)
p = sc[1].get('paths')
w(json.dumps(p, ensure_ascii=False)[:1500] if p else 'None')
w()
w('== generals.json keys sample ==')
w('type=%s len=%d' % (type(gen).__name__, len(gen)))
sample = gen[0] if isinstance(gen, list) else list(gen.values())[0]
w('entry keys:', list(sample.keys()))
for nm in ['關羽', '劉備', '張飛', '簡雍', '曹操']:
    hit = None
    if isinstance(gen, list):
        hit = next((g for g in gen if g.get('NAME') == nm), None)
    else:
        hit = gen.get(nm)
    w(nm, '->', json.dumps(hit, ensure_ascii=False) if hit else 'NOT FOUND')
w()
w('== items.json ==')
w('type=%s len=%d' % (type(items).__name__, len(items)))
sample = items[0] if isinstance(items, list) else list(items.values())[0]
w('entry keys:', list(sample.keys()))
w(json.dumps(items[:3] if isinstance(items, list) else list(items.items())[:3], ensure_ascii=False)[:1500])
w()
w('== formations.json ==')
w(json.dumps(forms, ensure_ascii=False)[:2000])
w()
w('== troops.json ==')
w(json.dumps(troops, ensure_ascii=False)[:1500])
w()
w('== wises.json (军师技) ==')
w(json.dumps(wises, ensure_ascii=False)[:1500])
w()
w('== garrison.json ==')
w(json.dumps(gar, ensure_ascii=False)[:800])
w()
w('== levels_by_scenario.json ==')
w('type=%s' % type(lv).__name__)
w(json.dumps(lv, ensure_ascii=False)[:2000])
w()
w('== scenario city names (189) ==')
w(', '.join(c.get('NAME', '') for c in sc[1]['cities']))
open(OUT, 'w', encoding='utf-8').write(out.getvalue())
print('wrote', OUT, len(out.getvalue()))
