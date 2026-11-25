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
with open(os.path.join(J, 'xls_群英2.json'), encoding='utf-8') as f:
    d = json.load(f)
hdr, gens_x = d['header'], d['rows']
print('len hdr', len(hdr))
for i, h in enumerate(hdr):
    print('%2d %r' % (i, h))
print('row0 len', len(gens_x[0]))
print('row0 tail', gens_x[0][36:])
