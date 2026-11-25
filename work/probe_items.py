# -*- coding: utf-8 -*-
import sys, os, json
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

BASE = r'F:\sanguo\extract\pak'
ini = parse_ini.IniFile.load(os.path.join(BASE, 'SANGO.INI'))
items = [s for s in ini.sections if s.name.upper() == 'ITEM']
terr = [s for s in ini.sections if s.name.upper() == 'TERRAIN']
fonts = [s for s in ini.sections if s.name.upper().startswith('FONTS')]
print('items', len(items), 'terrain', len(terr), 'fonts', len(fonts))
print('--- ITEM[0]')
for k, v, ln in items[0].fields:
    print('   L%-4d %-18s = %s' % (ln, k, v))
print('--- ITEM[76]')
for k, v, ln in items[-1].fields:
    print('   L%-4d %-18s = %s' % (ln, k, v))
print('--- items name/seq list')
for s in items:
    print('   seq=%-4s name=%-12s type=%-12s level=%-3s rate=%-4s' % (
        s.get('Sequence'), s.get('Name'), s.get('TYPE'), s.get('Level'), s.get('Rate')))
print('--- TERRAIN[0]')
for k, v, ln in terr[0].fields:
    print('   L%-4d %-14s = %s' % (ln, k, v))
print('--- FONTS[0], FONTS[3]')
for s in (fonts[0], fonts[3]):
    print('  [%s]' % s.name)
    for k, v, ln in s.fields:
        print('     %-22s = %s' % (k, v))
