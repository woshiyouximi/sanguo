# -*- coding: utf-8 -*-
"""Generic xref over .text: find instructions referencing an absolute VA or a
struct displacement. Usage:
  python xref85.py 0x4C30E0            # instructions touching that VA (imm or [disp])
  python xref85.py 0x92 --disp         # instructions with mem disp 0x92
Prints VA + mnemonic + op_str, marking writes (first operand is memory).
"""
import sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32, CS_OP_MEM, CS_OP_IMM

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, 'rb').read()
SEC = [(s.Name.rstrip(b'\0').decode('latin1'), s.VirtualAddress, s.Misc_VirtualSize,
        s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]
tname, tva, tsz, tptr, trs = [s for s in SEC if s[0] == '.text'][0]
code = data[tptr:tptr + min(tsz, trs)]

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

target = int(sys.argv[1], 16)
disp_mode = '--disp' in sys.argv

hits = []
for ins in md.disasm(code, IB + tva):
    hit = False
    for op in ins.operands:
        if op.type == CS_OP_IMM and not disp_mode and (op.imm & 0xFFFFFFFF) == target:
            hit = True
        if op.type == CS_OP_MEM and disp_mode and (op.mem.disp & 0xFFFFFFFF) == target:
            hit = True
        if op.type == CS_OP_MEM and not disp_mode and (op.mem.disp & 0xFFFFFFFF) == target:
            hit = True
    if hit:
        w = ins.operands[0].type == CS_OP_MEM
        hits.append((ins.address, ins.mnemonic, ins.op_str, w))

print('# %s=0x%X  hits=%d  (W=写内存, R=读/其它)' % ('disp' if disp_mode else 'va', target, len(hits)))
for a, m, o, w in hits:
    print('%08X %s  %-8s %s' % (a, 'W' if w else 'R', m, o))
