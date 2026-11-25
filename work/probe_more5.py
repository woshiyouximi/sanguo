# -*- coding: utf-8 -*-
import sys, os, re, collections
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

BASE = r'F:\sanguo\extract\pak'
ini = parse_ini.IniFile.load(os.path.join(BASE, 'THINGS.INI'))
objs = [s for s in ini.sections if s.name.upper() == 'OBJECT']
ANIM = ('First', 'Wait', 'Walk', 'Attack', 'Attack2', 'Attack3', 'Attack4', 'Attack5',
        'Attack6', 'Attack7', 'Attack8', 'Spell', 'Spell2', 'Shot', 'Shot2', 'Shot3',
        'Defense', 'Pain', 'Death', 'Win', 'Magic', 'Effect')
tok_re = re.compile(r'^[A-Za-z][A-Za-z0-9_]*$')
tokens = collections.Counter()
bad = collections.Counter()
for s in objs:
    for k, v, ln in s.fields:
        if k not in ANIM or not v:
            continue
        if not v.startswith('#'):
            bad[('nohash', v[:30])] += 1
        body = v.split(',', 1)[1] if ',' in v else ''
        for tok in re.split(r'[,\s]+', body):
            if tok_re.match(tok):
                tokens[tok] += 1
print('anim tokens', len(tokens), 'total refs', sum(tokens.values()))
print('bad frames', list(bad.items())[:10])
shape = os.path.join(BASE, 'SHAPE')
stems = set()
for root, ds, fs in os.walk(shape):
    for f in fs:
        stems.add(f.rsplit('.', 1)[0].upper())
print('shape stems', len(stems))
miss = sorted(t for t in tokens if t.upper() not in stems)
print('missing sprites', len(miss), miss[:30])
print('sample tokens', list(tokens)[:15])
print('all-shape-files by ext', collections.Counter(os.path.splitext(f)[1].lower()
      for root, ds, fs in os.walk(shape) for f in fs))
