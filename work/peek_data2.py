import json
for name in ('magics','generals','terrains','items','wises','scenarios','things'):
    d = json.load(open(r'F:\sanguo\data\%s.json' % name, encoding='utf-8'))
    if isinstance(d, list):
        print('==', name, 'list', len(d), 'first:', json.dumps(d[0], ensure_ascii=False)[:220])
    else:
        print('==', name, 'dict', list(d.keys())[:6])
        for k, v in d.items():
            if isinstance(v, list) and v:
                print('   ', k, len(v), json.dumps(v[0], ensure_ascii=False)[:200])
