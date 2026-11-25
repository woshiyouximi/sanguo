# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini

BASE = r'F:\sanguo\extract\pak'
for f in ['THINGS.INI', 'MAGIC.INI', 'TIMES1.INI', 'TIMES5.INI', 'SANGO.INI',
          'COMBINE.INI', 'MESSAGE.INI']:
    p = os.path.join(BASE, f)
    t, e = parse_ini.read_text(p)
    print('%-12s enc=%-8s lines=%d' % (f, e, len(t.splitlines())))
    picks = []
    for l in t.splitlines():
        ls = l.strip()
        if ls.startswith('[OBJECT]') or ls.startswith('[MAGIC]') or ls.startswith('[SYSTEM]'):
            picks.append(ls)
    print('   sections sample:', picks[:5])
    # show first Name= line
    for l in t.splitlines():
        if l.strip().lower().startswith('name'):
            print('   ', l.strip())
            break
    # raw bytes of that line
    for l in t.splitlines():
        if l.strip().lower().startswith('name'):
            for enc in ('gbk', 'cp950', 'big5'):
                try:
                    print('    %-6s -> %s' % (enc, l.strip().encode('utf-8').decode('utf-8')))
                except Exception as ex:
                    print(ex)
                break
            break
