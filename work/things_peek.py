import json, collections
d = json.load(open(r'F:\sanguo\extract\json\things.json', encoding='utf-8'))
print('type', type(d).__name__, 'len', len(d))
if isinstance(d, dict):
    ks = list(d.keys())[:10]; print('keys', ks)
    first = d[ks[0]]
    print('sample', json.dumps(first, ensure_ascii=False)[:600])
elif isinstance(d, list):
    print('sample', json.dumps(d[0], ensure_ascii=False)[:600])
