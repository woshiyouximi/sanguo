# -*- coding: utf-8 -*-
import sys, os, json, ctypes
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
def xls(name):
    with open(os.path.join(J, 'xls_%s.json' % name), encoding='utf-8') as f:
        return json.load(f)['rows']

gens_x = xls('群英2')
t1 = parse_ini.IniFile.load(os.path.join(BASE, 'TIMES1.INI'))
gg = [s for s in t1.sections if s.name.upper() == 'GENERAL']
numbered = [s for s in gg if s.get('SEQUENCE')]
print('numbered', len(numbered))
bad = 0
byseq = {}
for s in numbered:
    byseq[int(s.get('SEQUENCE'))] = s
for row in gens_x:
    seq = int(row[0])
    s = byseq.get(seq)
    if not s:
        print('MISSING seq', seq); bad += 1; continue
    a, b = sc(s.get('NAME')), row[1]
    if a != b:
        bad += 1
        print('NAME MISMATCH seq %d: ini=%s(%s) xls=%s  STR %s/%s INT %s/%s' % (
            seq, s.get('NAME'), a, b, s.get('STR'), row[2], s.get('INT'), row[3]))
print('general name mismatches:', bad, '/', len(gens_x))
# attribute mismatches
ab = 0
for row in gens_x:
    s = byseq[int(row[0])]
    if int(s.get('STR')) != int(row[2]) or int(s.get('INT')) != int(row[3]):
        ab += 1
        if ab < 12:
            print('ATTR MISMATCH', row[1], s.get('STR'), row[2], s.get('INT'), row[3])
print('attr mismatches:', ab)

# cities
cc = [s for s in t1.sections if s.name.upper().startswith('CITY')]
cityx = xls('城池')
for i, row in enumerate(cityx):
    s = cc[i]
    if sc(s.get('NAME')) != row[1]:
        print('CITY MISMATCH', i + 1, s.name, s.get('NAME'), sc(s.get('NAME')), row[1])
print('city count', len(cc), len(cityx))

# magic
ini = parse_ini.IniFile.load(os.path.join(BASE, 'MAGIC.INI'))
mm = [s for s in ini.sections if s.name.upper() == 'MAGIC']
magx = xls('武将技')
print('MAGIC', len(mm), 'xls', len(magx))
for i, row in enumerate(magx):
    s = mm[i]
    if sc(s.get('NAME')) != row[1]:
        print('MAGIC NAME MISMATCH', i + 1, s.get('NAME'), sc(s.get('NAME')), row[1])
    if int(s.get('MP')) != int(row[2]):
        print('MAGIC MP MISMATCH', i + 1, s.get('NAME'), s.get('MP'), row[2])
    if int(s.get('POWER')) != int(row[3]):
        print('MAGIC POWER MISMATCH', i + 1, s.get('NAME'), s.get('POWER'), row[3])
    if int(s.get('ATTACK')) != int(row[4]):
        print('MAGIC ATK MISMATCH', i + 1, s.get('NAME'), s.get('ATTACK'), row[4])
    if int(s.get('SCRIPT')) != int(row[5]):
        print('MAGIC SCRIPT MISMATCH', i + 1, s.get('NAME'), s.get('SCRIPT'), row[5])
# wise
ww = [s for s in ini.sections if s.name.upper() == 'WISE']
wisex = xls('军师技')
print('WISE', len(ww), 'xls', len(wisex))
for i, row in enumerate(wisex):
    s = ww[i]
    if sc(s.get('NAME')) != row[3]:
        print('WISE NAME MISMATCH', i + 1, s.get('NAME'), sc(s.get('NAME')), row[3], 'Lv', s.get('Level'), row[5])
# items
ini2 = parse_ini.IniFile.load(os.path.join(BASE, 'SANGO.INI'))
ii = [s for s in ini2.sections if s.name.upper() == 'ITEM']
itx = xls('物品')
print('ITEM', len(ii), 'xls', len(itx))
for i, row in enumerate(itx):
    s = ii[i]
    if sc(s.get('Name')) != row[1]:
        print('ITEM NAME MISMATCH', i + 1, s.get('Name'), sc(s.get('Name')), row[1])
