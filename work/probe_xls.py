# -*- coding: utf-8 -*-
import json, os, sys
J = r'F:\sanguo\extract\json'
for f in ['xls_index.json', 'xls_群英2.json', 'xls_武将技.json', 'xls_军师技.json',
          'xls_物品.json', 'xls_城池.json', 'xls_路径.json', 'xls_兵种.json',
          'xls_阵形.json', 'xls_增技.json', 'xls_恢技.json', 'xls_增体.json', 'xls_恢体.json']:
    with open(os.path.join(J, f), encoding='utf-8') as fh:
        d = json.load(fh)
    print('=' * 70)
    print(f, type(d).__name__)
    if isinstance(d, dict):
        print('  keys:', list(d.keys()))
        print('  sheet=', d.get('sheet'), 'header=', d.get('header'))
        rows = d.get('rows', [])
        print('  rows=', len(rows), 'cols=', max((len(r) for r in rows), default=0))
        for r in rows[:3]:
            print('   ', json.dumps(r, ensure_ascii=False)[:400])
    else:
        print(json.dumps(d, ensure_ascii=False)[:800])
