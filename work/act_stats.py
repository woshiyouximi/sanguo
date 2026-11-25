import json, collections, statistics

d = json.load(open(r'F:\sanguo\work\things_parsed.json', encoding='utf-8'))
acts = collections.defaultdict(lambda: {'obj': 0, 'frames': 0, 'counts': [], 'first5': collections.Counter(), 'delay': collections.Counter()})
for o in d['objects']:
    for a, v in o['actions'].items():
        st = acts[a]
        st['obj'] += 1
        n = v.get('n_files') or len([f for f in v['frames'] if f.get('shape')])
        real = [f for f in v['frames'] if f.get('shape')]
        st['frames'] += len(real)
        st['counts'].append(len(real))
        if real:
            st['first5'][real[0]['shape'][-5:]] += 1
        dd = v.get('default_delay')
        st['delay'][dd] += 1

order = ['First', 'Wait', 'Walk', 'Attack', 'Attack2', 'Attack3', 'Attack4', 'Attack5', 'Attack6', 'Attack7', 'Attack8',
         'Defense', 'Pain', 'Death', 'Win', 'Lose', 'Spell1', 'Spell2', 'Shot1', 'Shot2', 'Shot3']
print('动作 | 对象 | 帧 | min/中位/max | 首5位众数 | delay众数')
for a in order:
    st = acts.get(a)
    if not st:
        print(a, 'MISSING')
        continue
    c = st['counts']
    print('%-8s %4d %6d %d/%d/%d  %s  %s' % (
        a, st['obj'], st['frames'], min(c), int(statistics.median(c)), max(c),
        st['first5'].most_common(3), st['delay'].most_common(4)))
print('总计 objects', len(d['objects']), '动作数', sum(v['obj'] for v in acts.values()), '帧', sum(v['frames'] for v in acts.values()))
