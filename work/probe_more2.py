# -*- coding: utf-8 -*-
import sys, os, json, collections
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

BASE = r'F:\sanguo\extract\pak'
J = r'F:\sanguo\extract\json'

# --- THINGS duplicate/empty object
ini = parse_ini.IniFile.load(os.path.join(BASE, 'THINGS.INI'))
objs = [s for s in ini.sections if s.name.upper() == 'OBJECT']
print('OBJECT sections', len(objs))
for s in objs:
    if not s.get('Type'):
        print('  EMPTY-TYPE object at L%d:' % s.lineno)
        for k, v, ln in s.fields[:12]:
            print('     L%-5d %-12s = %r' % (ln, k, v))
# duplicate sequence
c = collections.Counter(int(s.get('Sequence')) for s in objs if s.get('Sequence') and s.get('Sequence').isdigit())
for seq, n in c.items():
    if n > 1:
        print('  DUP Sequence', seq, [s.get('Name') for s in objs if s.get('Sequence') == str(seq)])

# --- PATH in TIMES1
ini = parse_ini.IniFile.load(os.path.join(BASE, 'TIMES1.INI'))
paths = [s for s in ini.sections if s.name.upper().startswith('PATH')]
print('PATH sections', len(paths), [s.name for s in paths[:3]])
s = paths[0]
print('  first PATH fields:')
for k, v, ln in s.fields[:10]:
    print('     %-8s = %s' % (k, v))
with open(os.path.join(J, 'xls_路径.json'), encoding='utf-8') as f:
    px = json.load(f)['rows']
print('xls paths', len(px))
print('  xls first', px[0])
print('  xls last', px[-1])
pt = set()
for s in paths:
    pt.add((s.get('Start'), s.get('End')))
pxs = set((r[1], r[2]) for r in px)
print('TIMES-only pairs:', list(pt - pxs)[:10], len(pt - pxs))
print('XLS-only pairs:', list(pxs - pt)[:20], len(pxs - pt))

# --- MESSAGE
ini = parse_ini.IniFile.load(os.path.join(BASE, 'MESSAGE.INI'))
s = ini.get('MESSAGE')
print('MESSAGE fields', len(s.fields))
ph = collections.Counter()
for k, v, ln in s.fields:
    for tok in ('%s', '%d', '%k', '%l', '%%'):
        if tok in v:
            ph[tok] += 1
print('placeholders', ph)
print('max name len', max(len(v) for k, v, ln in s.fields))
print('sample:')
for k, v, ln in s.fields[:6]:
    print('   %-8s %s' % (k, v))
for k, v, ln in s.fields[60:66]:
    print('   %-8s %s' % (k, v))

# --- SHAPE tree
shape = os.path.join(BASE, 'SHAPE')
tot = 0
for root, dirs, fs in os.walk(shape):
    rel = os.path.relpath(root, shape)
    if rel == '.':
        print('SHAPE root files:', sorted(fs)[:20])
    else:
        print('  %-22s dirs=%-24s files=%d' % (rel, sorted(dirs)[:6], len(fs)))
    tot += len(fs)
print('total shape files', tot)
