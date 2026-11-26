# -*- coding: utf-8 -*-
"""查『平原』在 5 个剧本里各自的人事名单，看張角是从哪来的。"""
import io, json, sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
P = r'F:\sanguo\game\cocos\assets\bundles\res\data\scenarios.json'
rows = json.load(io.open(P, encoding='utf-8'))
print('N', len(rows), 'type0', type(rows[0]).__name__)
sc = rows[1]
if isinstance(sc, dict):
    print('KEYS', list(sc.keys()))
elif isinstance(sc, list):
    print('LEN', len(sc), 'first', sc[:2])
for i, s in enumerate(rows):
    if isinstance(s, dict):
        cities = s.get('cities') or {}
        p = cities.get('平原') if isinstance(cities, dict) else None
        offs = (p or {}).get('officers') or []
        names = [o.get('name') if isinstance(o, dict) else o for o in offs]
        print(f'[{i}] 平原:', names)
        hits = []
        for cname, c in cities.items():
            for o in (c.get('officers') or []):
                n = o.get('name') if isinstance(o, dict) else o
                if n == '張角':
                    hits.append(cname)
        print(f'    張角 in', hits)
