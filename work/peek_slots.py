import json
d = json.load(open(r'F:\sanguo\data\formations.json', encoding='utf-8'))
s = d['slots'][0]
print('a', s['a'], s['name'], 'anchor', s['anchorX'], 'weights', s['weights'])
f = s['fill']['100']
print('N=100 slots', len(f), 'first', f[0], 'last', f[-1])
print('modes keys', list(s['modes'].keys()), 'mode1 len', len(s['modes']['1']))
print('rule', d['slot_rule']['formula'])
print('matrix names', d['names'])
