# -*- coding: utf-8 -*-
import sys, io, re, collections, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, r'F:\sanguo\tools')
import smartscript as ss

ss.load_syscalls(r'F:\sanguo\export\script\syscall_table.json')
res = {}
for tag, path in [('MAGIC', r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO'),
                  ('SYSTEM', r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO')]:
    so = ss.SOFile(path)
    cnt = collections.Counter()
    pc = so.code_start
    while pc + 4 <= so.code_end:
        op = int.from_bytes(so.data[pc:pc+4], 'little', signed=True)
        if op not in ss.OPS:
            pc += 4; continue
        cnt[op] += 1
        kinds = ss.OPS[op][1]
        pc += 4 + (8 if kinds in ('YF','CO') else (4 if kinds else 0))
    res[tag] = cnt
    print(tag, 'total', sum(cnt.values()), 'ops used', len(cnt))

ORDER = ''.join('%02X ' % i for i in range(0x60))
open(r'F:\sanguo\export\script\_opcounts.txt','w',encoding='utf-8').write(
    '\n'.join('0x%02X %d %d' % (op, res['MAGIC'][op], res['SYSTEM'][op]) for op in range(0x60)))
print('wrote _opcounts.txt')
