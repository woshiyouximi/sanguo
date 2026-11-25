# -*- coding: utf-8 -*-
"""一次性探查：scenarios.json / generals.json / timesN.json 的结构。"""
import io
import json

W = r'F:\sanguo\work\scen_levels'
OUT = []


def say(*a):
    OUT.append(' '.join(str(x) for x in a))


def load(p):
    return json.load(io.open(p, encoding='utf-8-sig'))


sc = load(r'F:\sanguo\game\data\scenarios.json')
say('== scenarios.json ==')
say('type:', type(sc).__name__)
if isinstance(sc, dict):
    say('keys:', list(sc.keys())[:20])
gen = load(r'F:\sanguo\game\data\generals.json')
say('== generals.json ==')
say('type:', type(gen).__name__)
if isinstance(gen, dict):
    say('keys:', list(gen.keys())[:20])
    for k, v in gen.items():
        if isinstance(v, list):
            say('  list key %r len=%d' % (k, len(v)))
            if v:
                say('  first item keys:', list(v[0].keys()) if isinstance(v[0], dict) else type(v[0]))
elif isinstance(gen, list):
    say('len', len(gen))
    say('first keys:', list(gen[0].keys()))

with io.open(W + r'\probe1.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(OUT))
print('ok')
