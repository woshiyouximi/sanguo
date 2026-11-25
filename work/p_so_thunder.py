# -*- coding: utf-8 -*-
import sys, struct
sys.path.insert(0, r'F:\sanguo\tools')
sys.path.insert(0, r'F:\sanguo\work')
from p_so_walk import so, func_of_num, closure, func_of_off, OPS, d

for n in (37,):
    f = func_of_num[500 + n]
    strs, calls, seen = closure(f)
    print('Magic%d num=%d off=0x%X funcs=%d' % (n, f['num'], f['off'], len(seen)))
    print('  strings:')
    for s, src in strs:
        print('    %-24s <- %s' % (so.names[s], src))
    print('  calls:')
    for c in calls:
        print('    %s -> %s num=%s' % c)

# BigThunder 本体
bt = [f for f in so.funcs if f['name'] == 'BigThunder']
print('\nBigThunder:', bt)
if bt:
    out = {'strings': [], 'calls': []}
    from p_so_walk import walk
    walk(bt[0]['off'], set(), out)
    print('  strings:', [so.names[s] for s in out['strings']])
    print('  calls:', out['calls'])
# 全库所有 PUSHS 字符串按前缀统计
pref = {}
import collections
cnt = collections.Counter()
