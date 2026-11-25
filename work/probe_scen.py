# -*- coding: utf-8 -*-
import sys, os, json, ctypes, itertools
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
files = {}
for i in range(1, 6):
    ini = parse_ini.IniFile.load(os.path.join(BASE, 'TIMES%d.INI' % i))
    gg = [s for s in ini.sections if s.name.upper() == 'GENERAL']
    files[i] = {int(s.get('SEQUENCE')): s for s in gg if s.get('SEQUENCE')}

# 1) base data identical across scenarios?
keys = ('FACE', 'STR', 'INT', 'BaseHP', 'BaseMP', 'Loyal', 'Spirit', 'BaseEXP',
        'Weapon', 'Horse', 'Thing', 'BattleArray', 'UseBattleArray', 'Force',
        'UseForce', 'LoyalKing', 'BLOOD', 'CONSTANCY', 'TYPE', 'FLAGS')
diff = {}
for seq in files[1]:
    for k in keys:
        vals = {files[i][seq].get(k) for i in range(1, 6)}
        if len(vals) > 1:
            diff.setdefault(k, []).append((seq, vals))
print('fields differing across TIMES1-5:', {k: len(v) for k, v in diff.items()})
for k, v in list(diff.items())[:6]:
    print('  ', k, v[:3])
# SKILL lists differ?
sk = 0
for seq in files[1]:
    a = [x for x in files[1][seq].getall('SKILL')]
    for i in range(2, 6):
        if [x for x in files[i][seq].getall('SKILL')] != a:
            sk += 1
            break
print('generals whose SKILL lists differ across scenarios:', sk)

# 2) scenario column mapping: match xls city col with TIMES city
xls_city_cols = [38, 40, 42, 44, 46]
xls_stat_cols = [39, 41, 43, 45, 47]
print('xls scenario headers:', [xls('群英2') and None])
with open(os.path.join(J, 'xls_群英2.json'), encoding='utf-8') as f:
    hdr = json.load(f)['header']
print('hdr[38..47] =', hdr[38:48])
for i in range(1, 6):
    for j, (cc, sc_) in enumerate(zip(xls_city_cols, xls_stat_cols)):
        hit = 0; tot = 0
        for row in gens_x:
            seq = int(row[0])
            s = files[i].get(seq)
            if not s: continue
            xc, xs = row[cc], row[sc_]
            if xc in (None, ''):
                continue
            tot += 1
            if sc(s.get('CITY')) == xc and s.get('Status') == xs:
                hit += 1
        print('TIMES%d vs xls col%d: %d/%d match' % (i, j + 1, hit, tot))

# 3) best permutation
print('--- per-file exact city match (ignoring status)')
for i in range(1, 6):
    for j, cc in enumerate(xls_city_cols):
        hit = tot = 0
        for row in gens_x:
            if row[cc] in (None, ''): continue
            s = files[i].get(int(row[0]))
            if not s: continue
            tot += 1
            if sc(s.get('CITY')) == row[cc]: hit += 1
        print('  T%d col%d %d/%d' % (i, j + 1, hit, tot), end='')
    print()

# 4) skill id check
ini = parse_ini.IniFile.load(os.path.join(BASE, 'MAGIC.INI'))
mm = [s for s in ini.sections if s.name.upper() == 'MAGIC']
ww = [s for s in ini.sections if s.name.upper() == 'WISE']
print('MAGIC seq48 =', mm[47].get('NAME'), 'seq59 =', mm[58].get('NAME'),
      'seq69 =', mm[68].get('NAME'), 'seq70 =', mm[69].get('NAME'),
      'seq81 =', mm[80].get('NAME'), 'seq93 =', mm[92].get('NAME'))
print('WISE seq6 =', ww[5].get('NAME'), 'seq12 =', ww[11].get('NAME'),
      'seq18 =', ww[17].get('NAME'), 'seq32 =', ww[31].get('NAME'))
print('magic seq range:', mm[0].get('SEQUENCE'), mm[-1].get('SEQUENCE'))
print('wise seq range:', ww[0].get('SEQUENCE'), ww[-1].get('SEQUENCE'))
