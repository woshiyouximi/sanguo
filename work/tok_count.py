import json, collections

d = json.load(open(r'F:\sanguo\work\things_parsed.json', encoding='utf-8'))
refs = collections.Counter()
bang = collections.Counter()
om = sc = nul = lines = 0
for o in d['objects']:
    for a, v in o['actions'].items():
        lines += 1
        for t in [x.strip() for x in v['raw'].split(',') if x.strip()]:
            if t.startswith('$'):
                refs[t] += 1
            elif t.startswith('@'):
                om += 1
            elif t.startswith('!'):
                bang[t] += 1
            elif t == 'SCROVER':
                sc += 1
            elif t == 'NULSHAPE':
                nul += 1
print('动作行', lines, 'refs', sum(refs.values()), 'OM', om, 'SCROVER', sc, 'NULSHAPE', nul)
print('refs:', refs.most_common(12))
print('bang:', bang.most_common(12))
