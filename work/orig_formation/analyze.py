# -*- coding: utf-8 -*-
"""Read-only analysis of game/data/formations.json (original game formation tables).
Prints ASCII-only labels so console encoding never matters. Writes report to data_map.txt.
"""
import json, sys, io

P = r'F:\sanguo\game\data\formations.json'
d = json.load(open(P, encoding='utf-8'))
out = io.StringIO()

def w(*a):
    print(*a)
    print(*a, file=out)

w('top keys:', sorted(d.keys()))
w('names count:', len(d['names']), 'playable:', d['playable'])
w('matrix len:', len(d['matrix']), 'vs len:', len(d['matrix'][0]['vs']))
w('slot_rule:', json.dumps(d['slot_rule'], ensure_ascii=True))
w('')
w('=== slots summary ===')
for i, s in enumerate(d['slots']):
    modes = s['modes']
    w('a=%d anchorX=%d weights=%s modes=%s bbox=%s' % (
        s['a'], s['anchorX'],
        [s['weights'][k] for k in sorted(s['weights'])],
        {k: len(v) for k, v in modes.items()},
        json.dumps(s['bbox'])))
    for k in sorted(modes):
        v = modes[k]
        w('   m%s n=%d first=%s last=%s' % (k, len(v), v[:3], v[-2:]))
    f = s['fill']
    for k in sorted(f, key=lambda z: int(z)):
        v = f[k]
        w('   fill[%s] n=%d first=%s' % (k, len(v), [(e['mode'], e['x'], e['y']) for e in v[:3]]))
    # relation checks: is fill x == mode x + anchorX (B side absolute)?
    for k in sorted(f, key=lambda z: int(z)):
        v = f[k]
        shifts = set()
        for e in v:
            m = str(e['mode'])
            pass
        # test global hypothesis: fill x - mode x == anchorX + (200-n)//25
        n = int(k)
        base = s['anchorX'] + (200 - n) // 25
        ok = 0
        bad = []
        for e in v:
            m = str(e['mode'])
            lst = modes.get(m)
            if not lst:
                bad.append((e, 'nomode'))
                continue
            # find a matching (x,y) in the mode table
            if [e['x'] - base, e['y']] in lst:
                ok += 1
            else:
                bad.append((e['mode'], e['x'], e['y']))
        w('   chk[%s] base=%d matched=%d/%d bad0=%s' % (k, base, ok, len(v), bad[:3]))
    total_w = sum(s['weights'][k] for k in s['weights'])
    w('   sum(weights)=%d  sum(modes)=%d' % (total_w, sum(len(v) for v in modes.values())))
    w('')

open(r'F:\sanguo\work\orig_formation\data_map.txt', 'w', encoding='utf-8').write(out.getvalue())
print('written data_map.txt')
