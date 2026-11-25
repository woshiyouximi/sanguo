# -*- coding: utf-8 -*-
import sys, os, json, ctypes, collections
from ctypes import wintypes
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

LCMAP = 0x02000000
k32 = ctypes.WinDLL('kernel32', use_last_error=True)
k32.LCMapStringW.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.LPCWSTR,
                             ctypes.c_int, wintypes.LPWSTR, ctypes.c_int]
k32.LCMapStringW.restype = ctypes.c_int
_cache = {}
def sc(s):
    if not s: return s
    if s in _cache: return _cache[s]
    n = k32.LCMapStringW(0, LCMAP, s, len(s), None, 0)
    b = ctypes.create_unicode_buffer(n + 1)
    k32.LCMapStringW(0, LCMAP, s, len(s), b, n + 1)
    _cache[s] = b.value
    return b.value

BASE = r'F:\sanguo\extract\pak'
J = r'F:\sanguo\extract\json'
with open(os.path.join(J, 'xls_群英2.json'), encoding='utf-8') as f:
    d = json.load(f)
gens_x = d['rows']
files = {}
for i in range(1, 6):
    ini = parse_ini.IniFile.load(os.path.join(BASE, 'TIMES%d.INI' % i))
    gg = [s for s in ini.sections if s.name.upper() == 'GENERAL']
    files[i] = {int(s.get('SEQUENCE')): s for s in gg if s.get('SEQUENCE')}

city_cols = [37, 39, 41, 43, 45]
stat_cols = [38, 40, 42, 44, 46]
print('scenario join (city+status) / city-only:')
for i in range(1, 6):
    hit = hitc = tot = 0
    miss = []
    for row in gens_x:
        seq = int(row[0]); s = files[i].get(seq)
        if not s: continue
        xc = row[city_cols[i - 1]] if len(row) > city_cols[i - 1] else ''
        xs = row[stat_cols[i - 1]] if len(row) > stat_cols[i - 1] else ''
        if xc in (None, ''):
            continue
        tot += 1
        if sc(s.get('CITY')) == xc:
            hitc += 1
            if s.get('Status') == xs:
                hit += 1
            else:
                miss.append((row[1], xc, s.get('Status'), xs))
    print('  TIMES%d: city %d/%d  exact %d/%d' % (i, hitc, tot, hit, tot))
    print('     status miss sample:', miss[:5])
# how many generals have empty city in each times
for i in range(1, 6):
    n = sum(1 for s in files[i].values() if not s.get('CITY'))
    print('TIMES%d empty CITY: %d / %d' % (i, n, len(files[i])))
    print('   status counts:', collections.Counter(s.get('Status') for s in files[i].values()))

# THINGS
print('=' * 60)
ini = parse_ini.IniFile.load(os.path.join(BASE, 'THINGS.INI'))
objs = [s for s in ini.sections if s.name.upper() == 'OBJECT']
print('objects', len(objs))
print('Type counts:', collections.Counter(s.get('Type') for s in objs))
print('Directory counts:', collections.Counter(s.get('Directory') for s in objs).most_common(20))
seqs = [int(s.get('Sequence')) for s in objs if s.get('Sequence') and s.get('Sequence').isdigit()]
print('Sequence range', min(seqs), max(seqs), 'unique', len(set(seqs)), 'dups', len(seqs) - len(set(seqs)))
print('Process counts:', collections.Counter(s.get('Process') for s in objs))
print('Flags sample:', collections.Counter(s.get('Flags') for s in objs).most_common(8))
print('Sample objects by type:')
seen = set()
for s in objs:
    t = s.get('Type')
    if t in seen: continue
    seen.add(t)
    print('  Type=%-3s %-28s %-22s %-10s Space=%s' % (t, s.get('Name'), s.get('Directory'), s.get('Process'), s.get('Space')))
# dirs vs SHAPE
import glob
shape = os.path.join(BASE, 'SHAPE')
print('SHAPE dirs:', sorted(os.listdir(shape))[:40])
