# -*- coding: utf-8 -*-
import re, os
p = r'F:\sanguo\docs\04-脚本引擎SmartScript.md'
s = open(p, encoding='utf-8').read()
L = s.splitlines()
print('lines', len(L), 'chars', len(s))
for bad in ['OP45','OP46','{{','脚本中未出现） |']:
    print('leftover', repr(bad), s.count(bad))
# table rows integrity
rows = [l for l in L if l.startswith('| 0x') and l.count('|')==7]
print('opcode rows', len(rows))
bad = [l for l in rows if not l.rstrip().endswith('|')]
print('bad rows', len(bad))
# used syscall ids 0x100-0x220 coverage
used = set()
for f in [r'F:\sanguo\export\script\magic_so.dis.txt', r'F:\sanguo\export\script\system_so.dis.txt']:
    for l in open(f, encoding='utf-8'):
        m = re.search(r'SYSCALL\s+0x([0-9A-Fa-f]+)', l)
        if m: used.add(int(m.group(1),16))
rng = sorted(i for i in used if 0x100 <= i <= 0x220)
missing = [i for i in rng if ('| 0x%03X |'%i) not in s]
print('used ids in 0x100-0x220:', len(rng), 'missing in doc:', missing)
print('total distinct used', len(used))
for f in [r'F:\sanguo\export\script\magic_so.dis.txt', r'F:\sanguo\export\script\system_so.dis.txt', r'F:\sanguo\export\script\syscall_table.json', r'F:\sanguo\export\script\syscall_handlers.asm.txt']:
    print(os.path.basename(f), os.path.getsize(f))
