import json, collections

m = json.load(open(r'F:\sanguo\extract\json\magic.json', encoding='utf-8'))
print('顶层键:', list(m.keys()))
print('magic_count', m.get('magic_count'), 'wise_count', m.get('wise_count'))
e = m['entries']
print('entries', len(e))
print('entry 键:', sorted(e[0].keys()))
print('--- 前 6 条 ---')
for x in e[:6]:
    print(json.dumps(x, ensure_ascii=False))
print('--- 后 3 条 ---')
for x in e[-3:]:
    print(json.dumps(x, ensure_ascii=False))
sc = [x.get('script') for x in e]
print('script 类型样例:', collections.Counter(type(v).__name__ for v in sc))
print('script 值域样例:', sc[:20])
