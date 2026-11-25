# -*- coding: utf-8 -*-
"""原型 2：110 个 MagicN 的目录归属统计。"""
import struct, sys, collections, json
sys.path.insert(0, r'F:\sanguo\tools')
sys.path.insert(0, r'F:\sanguo\work')
from p_so_walk import so, func_of_num, closure, func_of_off

magic = json.load(open(r'F:\sanguo\extract\json\magic.json', encoding='utf-8'))
ents = [e for e in magic['entries'] if e['kind'] == 'magic']
by_script = {e['script']: e for e in ents}

rows = []
dir2skills = collections.defaultdict(list)
allext = collections.Counter()
for e in ents:
    sc = e['script']
    n = sc - 500
    f = func_of_num.get(sc)
    strs, calls, seen = closure(f) if f else ([], [], set())
    names = [so.names[s] for s, _ in strs]
    dirs = sorted({int(s.split('\\')[1]) for s in names
                   if s.lower().startswith('magic\\') and len(s.split('\\')) > 1 and s.split('\\')[1].isdigit()})
    files = sorted({s for s in names if s.lower().startswith('magic\\') and not s.endswith('*')})
    snds = sorted({s for s in names if 'snd' in s.lower()})
    for dd in dirs:
        dir2skills[dd].append((e['index'], e['name']))
    rows.append(dict(index=e['index'], name=e['name'], script=sc, magicfun='Magic%d' % n,
                     funcs=len(seen), dirs=dirs, files=files, snds=snds,
                     calls=sorted({c[1] for c in calls})))

print('技能数=%d' % len(rows))
nodir = [r for r in rows if not r['dirs']]
print('无 magic 目录引用: %d' % len(nodir))
for r in nodir:
    print('   %-3d %-8s script=%d calls=%s' % (r['index'], r['name'], r['script'], r['calls'][:6]))
only0 = [r for r in rows if r['dirs'] == [0]]
print('只引用 000: %s' % [(r['index'], r['name']) for r in only0])
print('--- 前 20 行 ---')
for r in rows[:20]:
    print('%-3d %-8s sc=%d %-9s dirs=%-18s files=%d calls=%s' %
          (r['index'], r['name'], r['script'], r['magicfun'], r['dirs'], len(r['files']), r['calls'][:3]))
print('--- 目录 → 技能数 ---')
for dd in sorted(dir2skills):
    print('  %03d : %2d  %s' % (dd, len(dir2skills[dd]), [x[1] for x in dir2skills[dd]][:4]))
