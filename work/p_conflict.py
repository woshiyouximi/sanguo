# -*- coding: utf-8 -*-
"""统计字符串法 vs 对象号法不一致的技能，供 05c §4.7 使用。"""
import sys, os, re, json, collections
sys.path.insert(0, r'F:\sanguo\tools')
import magic_map as M

so, funcs, offs, by_off, by_num, by_name = M.load_so()
seqmap = M.things_seqmap()
magic = json.load(open(M.MAGIC_JSON, encoding='utf-8'))
skills = [e for e in magic['entries'] if e['kind'] == 'magic']

rows = []
for e in skills:
    sc = e['script']
    f = by_num.get(sc)
    info = M.closure(so, offs, by_off, by_name, f) if f else None
    str_dirs, ids = set(), []
    if info:
        for pc, idx, name, src in info['strings']:
            m = re.match(r'^magic\\(\d{3})\\(.+)$', name, re.I)
            if m:
                str_dirs.add(int(m.group(1)))
        for pc, val, src in info['pushes']:
            if val in seqmap:
                ids.append((pc, val, seqmap[val][0], seqmap[val][1], src))
    sd = str_dirs - {0}
    dd = {v[2] for v in ids if v[2] != 0}
    if sd and dd and sd != dd:
        rows.append((e['index'], e['name'], sorted(sd), sorted(dd), ids))

print('不一致的技能数: %d' % len(rows))
with open(r'F:\sanguo\work\dis_magicmap_idconflict.txt', 'w', encoding='utf-8') as fh:
    fh.write('字符串法 vs 对象号法 不一致的技能（%d 个）\n' % len(rows))
    for idx, name, sd, dd, ids in rows:
        only_s = sorted(set(sd) - set(dd))
        only_i = sorted(set(dd) - set(sd))
        fh.write('#%-3d %-8s 字符串=%s 对象号=%s  仅字符串=%s 仅对象号=%s\n'
                 % (idx, name, sd, dd, only_s, only_i))
        for pc, val, d, nm, src in ids:
            fh.write('     0x%06X %-6d -> %03d %s  <- %s\n' % (pc, val, d, nm, src))
    fh.write('\n--- 汇总：对象号法独有目录 -> 出现在哪些技能 ---\n')
    agg = collections.defaultdict(list)
    for idx, name, sd, dd, ids in rows:
        for d in sorted(set(dd) - set(sd)):
            agg[d].append(name)
    for d in sorted(agg):
        sem = M.DIR_SEM.get(d, '')
        fh.write('%03d  技能 %d 个  %s\n' % (d, len(agg[d]), ', '.join(agg[d][:8])))
print('dump -> F:\\sanguo\\work\\dis_magicmap_idconflict.txt')
