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
def sc(s):
    if not s: return s
    n = k32.LCMapStringW(0, LCMAP, s, len(s), None, 0)
    b = ctypes.create_unicode_buffer(n + 1)
    k32.LCMapStringW(0, LCMAP, s, len(s), b, n + 1)
    return b.value

BASE = r'F:\sanguo\extract\pak'
ini = parse_ini.IniFile.load(os.path.join(BASE, 'SANGO.INI'))
print('SANGO.INI section names:', [s.name for s in ini.sections][:30])
for nm in ('SYSTEM', 'SCRIPT'):
    s = ini.get(nm)
    print('---', nm)
    for k, v, ln in s.fields:
        print('   %-18s = %s' % (k, v))
print('--- ITEM01')
s = ini.get('ITEM01')
for k, v, ln in s.fields:
    print('   %-18s = %s' % (k, v))
print('--- TERRAIN01')
s = ini.get('TERRAIN01')
for k, v, ln in s.fields:
    print('   %-18s = %s' % (k, v))
print('--- FONTS01')
s = ini.get('FONTS01')
for k, v, ln in s.fields:
    print('   %-18s = %s' % (k, v))

print('=' * 60)
ini = parse_ini.IniFile.load(os.path.join(BASE, 'COMBINE.INI'))
for s in ini.sections:
    print('---', s.name)
    for k, v, ln in s.fields:
        print('   L%-4d %-8s = %s' % (ln, k, v))

print('=' * 60)
ini = parse_ini.IniFile.load(os.path.join(BASE, 'MESSAGE.INI'))
s = ini.get('MESSAGE')
ks = [k for k, v, l in s.fields]
print('MESSAGE keys', len(ks), ks[:5], ks[-5:])
for k, v, ln in s.fields[:12]:
    print('   %-8s L%-4d = %s' % (k, ln, v))
print('   ...')
for k, v, ln in s.fields[-6:]:
    print('   %-8s L%-4d = %s' % (k, ln, v))
