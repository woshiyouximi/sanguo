# -*- coding: utf-8 -*-
import sys, os, json, ctypes
from ctypes import wintypes
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

LCMAP_SIMPLIFIED_CHINESE = 0x02000000
k32 = ctypes.WinDLL('kernel32', use_last_error=True)
k32.LCMapStringW.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.LPCWSTR,
                             ctypes.c_int, wintypes.LPWSTR, ctypes.c_int]
k32.LCMapStringW.restype = ctypes.c_int

def sc(s):
    if not s:
        return s
    n = k32.LCMapStringW(0, LCMAP_SIMPLIFIED_CHINESE, s, len(s), None, 0)
    buf = ctypes.create_unicode_buffer(n + 1)
    k32.LCMapStringW(0, LCMAP_SIMPLIFIED_CHINESE, s, len(s), buf, n + 1)
    return buf.value

BASE = r'F:\sanguo\extract\pak'
times = {}
for i in range(1, 6):
    ini = parse_ini.IniFile.load(os.path.join(BASE, 'TIMES%d.INI' % i))
    times[i] = ini
    syssec = ini.get('SYSTEM')
    kk = [s for s in ini.sections if s.name.upper().startswith('KING')]
    cc = [s for s in ini.sections if s.name.upper().startswith('CITY')]
    pp = [s for s in ini.sections if s.name.upper().startswith('PATH')]
    gg = [s for s in ini.sections if s.name.upper() == 'GENERAL']
    print('TIMES%d' % i, syssec.get('TIME'), syssec.get('YEAR'),
          'K=%d C=%d P=%d G=%d' % (len(kk), len(cc), len(pp), len(gg)))
    print('   KING names:', [s.name for s in kk[:4]], '...', [s.name for s in kk[-2:]])
    print('   CITY names:', [s.name for s in cc[:3]], '...', [s.name for s in cc[-2:]])

print('=' * 60)
# same general across scenarios
for i in range(1, 6):
    ini = times[i]
    g = [s for s in ini.sections if s.name.upper() == 'GENERAL']
    target = None
    for s in g:
        if s.get('NAME') == '丁奉':
            target = s
            break
    print('TIMES%d 丁奉' % i, 'CITY=', target.get('CITY'), 'Status=', target.get('Status'),
          'POS=', target.get('POS'), 'LoyalKing=', target.get('LoyalKing'),
          'Weapon=', target.get('Weapon'), 'Force=', target.get('Force'),
          'UseForce=', target.get('UseForce'))
print('=' * 60)
# KING01.. full dump + CITY01 full dump + PATH01
ini = times[1]
for nm in ('KING01', 'CITY01', 'PATH01'):
    s = ini.get(nm)
    print('---', nm, 'L%d' % s.lineno)
    for k, v, ln in s.fields:
        print('   %-14s = %s' % (k, v))
print('--- GENERALS order (first 8 names / sequences):')
gg = [s for s in ini.sections if s.name.upper() == 'GENERAL']
for s in gg[:8]:
    print('    ', s.get('SEQUENCE'), s.get('NAME'), '|', sc(s.get('NAME')))
print('    total', len(gg))
