# -*- coding: utf-8 -*-
"""THINGS.INI / COMBINE.INI 结构探针：先看清字段长什么样，再决定文档怎么写。"""
import sys, os, json, collections
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini as P

PAK = r'F:\sanguo\extract\pak'
ini = P.IniFile.load(os.path.join(PAK, 'THINGS.INI'))
print('enc=%s sections=%d' % (ini.encoding, len(ini.sections)))
print('groups:', ini.prefix_groups())

objs = ini.all('OBJECT')
print('OBJECT count =', len(objs))
print()
print('=== 前 2 个 OBJECT 段原文 ===')
for s in objs[:2]:
    print('--- [%s] #%d 起始行 %d  (%d keys)' % (s.name, s.index, s.lineno, len(s.fields)))
    for k, v, ln in s.fields:
        print('   L%-6d %-16s = %r' % (ln, k, v))
print()
# 字段出现次数
kc = collections.Counter()
for s in objs:
    for k, v, ln in s.fields:
        kc[k] += 1
print('=== 620 个 OBJECT 的字段频次 ===')
for k, n in kc.most_common():
    print('  %-20s %4d' % (k, n))
print()
# Name/Type/Flags/Directory/Sequence/Sprite 的取值分布
for key in ('Name', 'Type', 'Flags', 'Directory', 'Sprite', 'Process'):
    vals = [s.get(key) for s in objs]
    c = collections.Counter(v for v in vals)
    print('=== %s: %d 种取值 (前 25) ===' % (key, len(c)))
    for v, n in c.most_common(25):
        print('   %-28r %d' % (v, n))
    print()
# Sequence 字段形态
seqs = [(s.get('Name'), s.get('Sequence'), s.getall('Sequence')) for s in objs]
print('=== Sequence 样例（前 8 个非空）===')
shown = 0
for nm, seq, allv in seqs:
    if seq:
        print('   %-14s %r   (同名键 %d 个)' % (nm, seq, len(allv)))
        shown += 1
        if shown >= 8:
            break
