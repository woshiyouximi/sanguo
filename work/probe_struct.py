# -*- coding: utf-8 -*-
import sys, os, json, collections
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

BASE = r'F:\sanguo\extract\pak'
OUT = r'F:\sanguo\work'

for f in ['THINGS.INI', 'MAGIC.INI', 'TIMES1.INI', 'TIMES2.INI', 'TIMES3.INI',
          'TIMES4.INI', 'TIMES5.INI', 'SANGO.INI', 'COMBINE.INI', 'MESSAGE.INI']:
    p = os.path.join(BASE, f)
    ini = parse_ini.IniFile.load(p)
    print('=' * 70)
    print(f, 'enc=', ini.encoding, 'sections=', len(ini.sections))
    print(' groups:', ini.prefix_groups())
    # key signature per group
    bykey = collections.OrderedDict()
    for s in ini.sections:
        base = s.name.rstrip('0123456789') or s.name
        ks = tuple(k for k, v, l in s.fields)
        bykey.setdefault(base, collections.Counter())[ks] += 1
    for base, cnt in bykey.items():
        print(' --', base)
        for ks, n in cnt.most_common(3):
            print('     x%-4d %s' % (n, list(ks)))
    print(' preamble:', ini.preamble[:5])
