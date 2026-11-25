import json
g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
by = {x['NAME']: x for x in g}
for n in ('呂布','關羽','姜維','諸葛亮','趙雲'):
    x = by.get(n) or by.get(n.replace('呂','吕'))
    if x: print(n, 'STR', x.get('STR'), 'INT', x.get('INT'), 'Face', x.get('Face'), 'Skill', x.get('Skill'))
print('total', len(g), 'keys', len(g[0]))
print('keys sample', list(g[0].keys()))
sc = json.load(open(r'F:\sanguo\data\scenarios.json', encoding='utf-8'))
c = sc[0]['cities'][0]
print('city0', {k: c[k] for k in list(c)[:8]})
print('city count per scenario', [len(s['cities']) for s in sc], 'path', [len(s['paths']) for s in sc], 'king', [len(s['kings']) for s in sc])
t = json.load(open(r'F:\sanguo\data\troops.json', encoding='utf-8'))
print('troop names', t['names'])
print('row sum 大刀', sum(t['matrix'][2]['vs']))
