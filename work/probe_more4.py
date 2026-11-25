# -*- coding: utf-8 -*-
import sys, os, json, collections, re, ctypes
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

BASE = r'F:\sanguo\extract\pak'
J = r'F:\sanguo\extract\json'

ini = parse_ini.IniFile.load(os.path.join(BASE, 'THINGS.INI'))
for s in ini.sections:
    if s.name == 'OBJECT2':
        print('OBJECT2 at L%d, %d fields' % (s.lineno, len(s.fields)))
        for k, v, ln in s.fields[:10]:
            print('   L%-5d %-10s = %r' % (ln, k, v))

objs = [s for s in ini.sections if s.name.upper() == 'OBJECT']
# Directory -> subdir existence
shape = os.path.join(BASE, 'SHAPE')
dirs = collections.Counter(s.get('Directory') for s in objs if s.get('Directory'))
print('\nDirectory values (%d distinct):' % len(dirs))
for d, c in sorted(dirs.items(), key=lambda x: -x[1]):
    rel = d.strip('\\').replace('\\', os.sep)
    full = os.path.join(shape, rel)
    print('   %-22s x%-3d exists=%s' % (d, c, os.path.isdir(full)))
missing = [d for d in dirs if not os.path.isdir(os.path.join(shape, d.strip('\\').replace('\\', os.sep)))]
print('missing dirs:', missing)

# sprite names inside MAGIC dir
mg = os.path.join(shape, 'MAGIC')
if os.path.isdir(mg):
    conf = [f for f in os.listdir(mg) if f.lower().endswith('.shp')]
    print('\nSHAPE\\MAGIC files:', len(conf), sorted(conf)[:25])

# collect sprite tokens from object animation fields
sprite_re = re.compile(r'^#?\s*(\d+)\s*,\s*(.*)$')
keys_anim = ('First', 'Wait', 'Walk', 'Attack', 'Attack2', 'Attack3', 'Spell', 'Spell2', 'Shot', 'Defense', 'Pain', 'Death', 'Win')
tokens = collections.Counter()
for s in objs:
    for k, v, ln in s.fields:
        if k in ('Sequence', 'Type', 'Space', 'Flags', 'Process', 'Directory'):
            continue
        if not v or v.startswith('#'):
            continue
        for tok in re.split(r'[,\s]+', v):
            tok = tok.strip()
            if tok and not tok.isdigit():
                tokens[tok] += 1
print('\ndistinct sprite tokens', len(tokens), 'sample', list(tokens)[:10])

# Check every SHAPE file stem
stems = set()
for root, ds, fs in os.walk(shape):
    for f in fs:
        stems.add(f.rsplit('.', 1)[0].upper())
print('shape file stems', len(stems))
miss = [t for t in tokens if t.upper() not in stems]
print('tokens without matching .SHP file:', len(miss), miss[:20])
