import json
d = json.load(open(r'F:\sanguo\data\formations.json', encoding='utf-8'))
print('keys', list(d.keys())[:10])
print('n slots', len(d.get('slots', [])))
s0 = d['slots'][0]
print('slot0 keys', list(s0.keys()))
print('name', s0.get('name'), 'anchorX', s0.get('anchorX'), 'weights', s0.get('weights'))
f = s0.get('fill', {})
print('fill keys', list(f.keys()))
one = f.get('100') or f.get(100)
print('fill100 len', len(one) if one else None, 'first3', one[:3] if one else None)
print('rule', json.dumps(d.get('slot_rule', {}), ensure_ascii=False)[:300])
print('troops sample', json.load(open(r'F:\sanguo\data\troops.json', encoding='utf-8'))['troops'][:2] if 'troops' in json.load(open(r'F:\sanguo\data\troops.json', encoding='utf-8')) else 'n/a')
