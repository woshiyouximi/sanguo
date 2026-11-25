import json, sys
sys.path.insert(0, r'F:\sanguo\tools')
import import_legacy as il
mx = il.build_matrices()
for key in ('troops','formations'):
    m = mx[key]
    names = m['names']; rows = m['matrix']
    print('==', key, 'names', len(names), 'rows', len(rows))
    print('names:', names)
    print('row labels:', [r['name'] for r in rows])
    worst = None
    for i in range(len(rows)):
        for j in range(len(rows)):
            s = rows[i]['vs'][j] + rows[j]['vs'][i]
            if worst is None or abs(s) > abs(worst[0]):
                worst = (s, i, j)
    print('worst', worst, [r['name'] for r in rows][worst[1]], [r['name'] for r in rows][worst[2]])
