# -*- coding: utf-8 -*-
import sys, os, json
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

# --- test Windows LCMapStringW trad->simp ---
import ctypes
from ctypes import wintypes
LCMAP_SIMPLIFIED_CHINESE = 0x02000000
LCMAP_TRADITIONAL_CHINESE = 0x04000000
k32 = ctypes.WinDLL('kernel32', use_last_error=True)
k32.LCMapStringW.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.LPCWSTR,
                             ctypes.c_int, wintypes.LPWSTR, ctypes.c_int]
k32.LCMapStringW.restype = ctypes.c_int

def sc(s, flags=LCMAP_SIMPLIFIED_CHINESE):
    if not s:
        return s
    n = k32.LCMapStringW(0, flags, s, len(s), None, 0)
    if n <= 0:
        return s
    buf = ctypes.create_unicode_buffer(n + 1)
    k32.LCMapStringW(0, flags, s, len(s), buf, n + 1)
    return buf.value

for t in ['師團移動時的物件', '命療術', '何進', '曹操', '關羽', '張飛', '趙雲', '呂布', '黃忠', '馬超', '諸葛亮']:
    print(t, '->', sc(t))

print('=' * 60)
ini = parse_ini.IniFile.load(r'F:\sanguo\extract\pak\TIMES1.INI')
gens = ini.all('GENERAL')
print('GENERAL count', len(gens))
for g in gens[:2] + gens[-2:]:
    print('--- [%s] #%d L%d' % (g.name, g.index, g.lineno))
    for k, v, ln in g.fields:
        print('   %-14s = %s' % (k, v))
print('=== KING/CITY/PATH first ===')
for nm in ('SYSTEM', 'KING', 'CITY', 'PATH'):
    s = ini.get(nm)
    print('---', nm, s.name, s.lineno)
    for k, v, ln in s.fields:
        print('   %-14s = %s' % (k, v))
