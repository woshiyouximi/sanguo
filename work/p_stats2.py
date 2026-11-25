# -*- coding: utf-8 -*-
"""05c 统计：字符串法/对象号法的补充数字。"""
import sys, re, json, collections
sys.path.insert(0, r'F:\sanguo\tools')
import magic_map as M

so, funcs, offs, by_off, by_num, by_name = M.load_so()
seqmap = M.things_seqmap()
dstats = M.dir_stats()
magic = json.load(open(M.MAGIC_JSON, encoding='utf-8'))
skills = sorted([e for e in magic['entries'] if e['kind'] == 'magic'], key=lambda e: e['index'])

no_str, no_id, id_only_dirs = [], [], collections.Counter()
edges = 0
superset = incompatible = 0
for e in skills:
    f = by_num.get(e['script'])
    info = M.closure(so, offs, by_off, by_name, f) if f else None
    sd, dd = set(), set()
    if info:
        for pc, idx, name, src in info['strings']:
            m = re.match(r'^magic\\(\d{3})\\(.+)$', name, re.I)
            if m:
                sd.add(int(m.group(1)))
        for pc, val, src in info['pushes']:
            if val in seqmap:
                dd.add(seqmap[val][0])
    sd -= {0}; dd -= {0}
    edges += len(sd | dd)
    if not sd: no_str.append((e['index'], e['name'], sorted(dd)))
    if not dd: no_id.append(e['name'])
    if sd and dd:
        if sd <= dd: superset += 1
        elif dd <= sd: superset += 1
        else: incompatible += 1
    for d in dd - sd:
        id_only_dirs[d] += 1

print('技能 %d' % len(skills))
print('无字符串目录的技能: %d -> %s' % (len(no_str), no_str))
print('无对象号目录的技能: %d' % len(no_id))
print('两法都有时: 一方包含另一方 %d，互不包含 %d' % (superset, incompatible))
print('仅由对象号引入的目录（技能数）: %s' % dict(sorted(id_only_dirs.items())))
print('(技能,目录) 依赖边合计: %d' % edges)
print('对象号可达目录总数: %d' % len(id_only_dirs | {d for d in dstats}))
