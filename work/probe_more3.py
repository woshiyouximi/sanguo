# -*- coding: utf-8 -*-
import sys, os, json, collections, re
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

BASE = r'F:\sanguo\extract\pak'
J = r'F:\sanguo\extract\json'

# --- locate the 621st OBJECT-ish section
ini = parse_ini.IniFile.load(os.path.join(BASE, 'THINGS.INI'))
names = collections.Counter(s.name for s in ini.sections)
print('section name counter (OBJECT-ish):')
for n, c in names.items():
    if 'OBJECT' in n.upper():
        print('   %r x%d' % (n, c))
print('total sections', len(ini.sections))

# --- PATH ragged
ini_t = parse_ini.IniFile.load(os.path.join(BASE, 'TIMES1.INI'))
paths = [s for s in ini_t.sections if s.name.upper().startswith('PATH')]
with open(os.path.join(J, 'xls_路径.json'), encoding='utf-8') as f:
    px = json.load(f)['rows']
print('xls path row lens', collections.Counter(len(r) for r in px))
for r in px:
    if len(r) < 4:
        print('   RAGGED', r)
pxs = set((r[1], r[2]) for r in px if len(r) > 2)
pt = set((s.get('Start'), s.get('End')) for s in paths)
print('TIMES-only pairs:', len(pt - pxs), list(pt - pxs)[:8])
print('XLS-only pairs:', len(pxs - pt), list(pxs - pt)[:8])
# length compare
mism = []
for s in paths:
    k = (s.get('Start'), s.get('End'))
    for r in px:
        if len(r) > 3 and (r[1], r[2]) == k:
            if str(int(float(r[3]))) != s.get('Length'):
                mism.append((k, s.get('Length'), r[3]))
            break
print('length mismatches', len(mism), mism[:8])

# --- MESSAGE
ini_m = parse_ini.IniFile.load(os.path.join(BASE, 'MESSAGE.INI'))
s = ini_m.get('MESSAGE')
print('MESSAGE fields', len(s.fields))
ph = collections.Counter()
for k, v, ln in s.fields:
    for tok in ('%s', '%d', '%k', '%l', '%%'):
        if tok in v:
            ph[tok] += 1
print('placeholders', dict(ph))
print('len stats: max', max(len(v) for k, v, ln in s.fields), 'min', min(len(v) for k, v, ln in s.fields))
print('first 4:', [(k, v) for k, v, ln in s.fields[:4]])
print('mid 4:', [(k, v) for k, v, ln in s.fields[80:84]])
print('last 4:', [(k, v) for k, v in [(a, b) for a, b, c in s.fields[-4:]]])
