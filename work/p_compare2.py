# -*- coding: utf-8 -*-
"""比较：排除通用辅助函数后的字符串法 vs 对象号法。"""
import sys, json, re
sys.path.insert(0, r'F:\sanguo\tools')
sys.path.insert(0, r'F:\sanguo\work')
import magic_map as MM

so, funcs, offs, by_off, by_num, by_name = MM.load_so()
seqmap = MM.things_seqmap()
magic = json.load(open(MM.MAGIC_JSON, encoding='utf-8'))
skills = sorted([e for e in magic['entries'] if e['kind'] == 'magic'], key=lambda e: e['index'])

BLACK = {'CreateDummyRef', 'CastFail'}
stats = {'both': 0, 'agree': 0, 'disagree': 0}
for e in skills:
    f = by_num.get(e['script'])
    info = MM.closure(so, offs, by_off, by_name, f)
    sd = set()
    for pc, i2, name, src in info['strings']:
        m = re.match(r'^magic\\(\d{3})\\(.+)$', name, re.I)
        if m:
            sd.add(int(m.group(1)))
    idd = set()
    idnames = {}
    for pc, val, src in info['pushes']:
        if val in seqmap and src not in BLACK:
            idd.add(seqmap[val][0])
            idnames.setdefault(seqmap[val][0], []).append((src, val, seqmap[val][1]))
    s0, i0 = sd - {0}, idd - {0}
    if s0 and i0:
        stats['both'] += 1
        if s0 == i0:
            stats['agree'] += 1
        else:
            stats['disagree'] += 1
            print('#%-3d %-8s str=%-14s id=%-14s' % (e['index'], e['name'], sorted(s0), sorted(i0)))
            for d in sorted(i0 - s0):
                print('      obj %03d: %s' % (d, idnames[d][:3]))
print(stats)
