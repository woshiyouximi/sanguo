# -*- coding: utf-8 -*-
"""查字符串法与对象号法不一致的技能。"""
import sys, json, re
sys.path.insert(0, r'F:\sanguo\tools')
sys.path.insert(0, r'F:\sanguo\work')
import magic_map as MM
import smartscript as SS

so, funcs, offs, by_off, by_num, by_name = MM.load_so()
seqmap = MM.things_seqmap()
magic = json.load(open(MM.MAGIC_JSON, encoding='utf-8'))
skills = sorted([e for e in magic['entries'] if e['kind'] == 'magic'], key=lambda e: e['index'])
for e in skills:
    f = by_num.get(e['script'])
    info = MM.closure(so, offs, by_off, by_name, f) if f else None
    if not info:
        continue
    sd, idd = set(), set()
    for pc, idx, name, src in info['strings']:
        m = re.match(r'^magic\\(\d{3})\\(.+)$', name, re.I)
        if m:
            sd.add(int(m.group(1)))
    for pc, val, src in info['pushes']:
        if val in seqmap:
            idd.add(seqmap[val][0])
    if (sd - {0}) and (idd - {0}) and (sd - {0}) != (idd - {0}):
        print('#%-3d %-8s str=%-12s id=%-12s' % (e['index'], e['name'], sorted(sd), sorted(idd)))
