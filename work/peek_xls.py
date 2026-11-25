import json
for name in ('xls_兵种.json','xls_阵形.json'):
    d = json.load(open(r'F:\sanguo\extract\json\\' + name, encoding='utf-8'))
    print('==', name, type(d), list(d)[:5] if isinstance(d, dict) else len(d))
    rows = d['rows'] if isinstance(d, dict) and 'rows' in d else d
    print('header:', d.get('header') if isinstance(d, dict) else None)
    print('n rows:', len(rows))
    for r in rows[:3]:
        print(' ', r[:16])
