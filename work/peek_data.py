import json
for name in ('troops','formations','magics','generals','terrains','items'):
    d = json.load(open(r'F:\sanguo\data\%s.json' % name, encoding='utf-8'))
    print('==', name, 'topkeys', list(d.keys())[:8])
    for k, v in d.items():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            print('   ', k, len(v), 'first keys:', list(v[0].keys())[:14])
        elif isinstance(v, list):
            print('   ', k, len(v), 'sample:', v[:3])
        elif isinstance(v, dict) and k != 'meta':
            print('   ', k, 'dict keys:', list(v.keys())[:6])
