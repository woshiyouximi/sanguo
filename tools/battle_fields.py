# -*- coding: utf-8 -*-
"""For every function that references one of the battle globals as imm32,
list struct offsets it reads/writes. Usage: battle_fields.py [--globals ...]
"""
import sys, re, collections
from capstone import Cs, CS_ARCH_X86, CS_MODE_32
from capstone.x86 import X86_OP_MEM, X86_OP_IMM

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
d = open(EXE, 'rb').read()
TEXT_VA, TEXT_OFF = 0x401000, 0x400
GLOBALS = [0x4A8A60, 0x4B03A0, 0x4A664C, 0x4A6650, 0x4A6654, 0x4A6674, 0x4A6678,
           0x4A6694, 0x4A8A30, 0x4B4C2C, 0x4A8AC8, 0x4B0408, 0x4A8AD0, 0x4B0410]

funcs = []
for l in open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8', errors='replace'):
    p = l.rstrip('\n').split('\t')
    if len(p) < 2:
        continue
    s = p[1].strip()
    if not s.isdigit():
        continue
    funcs.append((int(p[0], 16), int(s)))
funcs.sort()
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

rows = []
for va, sz in funcs:
    off = va - TEXT_VA + TEXT_OFF
    code = d[off:off + sz]
    reads, writes = collections.Counter(), collections.Counter()
    hits = set()
    n = 0
    for ins in md.disasm(code, va):
        n += 1
        if n > 4000:
            break
        for op in ins.operands:
            if op.type == X86_OP_IMM and op.imm in GLOBALS:
                hits.add(op.imm)
        for i, op in enumerate(ins.operands):
            if op.type == X86_OP_MEM and op.mem.base != 0:
                disp = op.mem.disp
                if 0 <= disp < 0x200 and disp not in (0,):
                    tgt = writes if i == 0 else reads
                    tgt[disp] += 1
    if hits:
        rows.append((va, sz, hits, reads, writes))

sel = sys.argv[1:] or ['all']
WATCH = {0x10, 0x12, 0x14, 0x16, 0x1C, 0x20, 0x24, 0x28, 0x2C, 0x34, 0x38,
         0x42, 0x44, 0x46, 0x48, 0x58, 0x5C, 0x70}
for va, sz, hits, reads, writes in rows:
    rel = sorted(WATCH & (set(reads) | set(writes)))
    if not rel:
        continue
    print('%08X sz=%d globals=%s' % (va, sz, ','.join('%08X' % h for h in sorted(hits))))
    print('   W: ' + ' '.join('%02X x%d' % (o, writes[o]) for o in rel if writes[o]))
    print('   R: ' + ' '.join('%02X x%d' % (o, reads[o]) for o in rel if reads[o]))
