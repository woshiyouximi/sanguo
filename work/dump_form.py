import json, collections
d = json.load(open(r'F:\sanguo\data\formations.json', encoding='utf-8'))
print(type(d), list(d.keys())[:4] if isinstance(d, dict) else len(d))
form = d['formations'] if isinstance(d, dict) and 'formations' in d else d
f0 = form[0]
print({k: (v if not isinstance(v, list) else 'list[%d]' % len(v)) for k, v in f0.items()})
slots = f0.get('slots') or []
print('slot0', slots[0] if slots else None)
