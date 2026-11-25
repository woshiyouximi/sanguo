import json, collections

d = json.load(open(r'F:\sanguo\work\things_parsed.json', encoding='utf-8'))
for act in ('Wait', 'Walk', 'Attack', 'Pain', 'Death', 'Win', 'Shot1', 'Shot3'):
    short = []
    for o in d['objects']:
        v = o['actions'].get(act)
        if not v:
            continue
        real = [f for f in v['frames'] if f.get('shape')]
        if len(real) == 1:
            short.append((o['ord'], o['name'], o['directory'], v['raw'][:40]))
    print('=== %s 只有 1 帧: %d 个' % (act, len(short)))
    c = collections.Counter(s[2] for s in short)
    print('   目录分布:', c.most_common(6))
    print('   例:', short[:3])
