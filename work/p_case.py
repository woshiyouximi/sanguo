# -*- coding: utf-8 -*-
import sys, json, re
sys.path.insert(0, r'F:\sanguo\tools')
sys.path.insert(0, r'F:\sanguo\work')
import magic_map as MM

so, funcs, offs, by_off, by_num, by_name = MM.load_so()
seqmap = MM.things_seqmap()
magic = json.load(open(MM.MAGIC_JSON, encoding='utf-8'))
skills = {e['index']: e for e in magic['entries'] if e['kind'] == 'magic'}

for idx in (51, 12, 54, 64 if 64 in skills else 63):
    e = skills[idx]
    f = by_num.get(e['script'])
    info = MM.closure(so, offs, by_off, by_name, f)
    print('=' * 70)
    print('#%d %s script=%d fn=%s  funcs=%s' % (idx, e['name'], e['script'], 'Magic%d' % (e['script'] - 500), info['funcs']))
    for pc, i2, name, src in info['strings']:
        if name.lower().startswith('magic') or 'snd' in name.lower():
            print('  STR 0x%06X %-22s <- %s' % (pc, name, src))
    for pc, val, src in info['pushes']:
        if val in seqmap:
            print('  ID  0x%06X %-6d -> %03d %-16s <- %s' % (pc, val, seqmap[val][0], seqmap[val][1], src))
