# -*- coding: utf-8 -*-
"""Scan .text for instructions whose memory operand displacement == OFFS.
Usage: python scan_off.py 0x92 [--write|--read|--all]
Prints VA, mnemonic, op_str and the nearest preceding 16-byte-aligned
function-ish boundary (previous 'int3' padding or ret) for context.
"""
import sys, re
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32, CS_OP_MEM, CS_OP_IMM

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, 'rb').read()
SECTIONS = [(s.Name.decode(errors='ignore').strip('\x00'), s.VirtualAddress,
             s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData)
            for s in pe.sections]


def va2off(va):
    rva = va - IB
    for name, v, d, ptr, rs in SECTIONS:
        if v <= rva < v + max(d, rs):
            return ptr + (rva - v)
    return None


text = [s for s in SECTIONS if s[0] == '.text'][0]
tname, tva, tsz, tptr, trs = text
code = data[tptr:tptr + min(tsz, trs)]
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

offs = int(sys.argv[1], 16)
mode = sys.argv[2] if len(sys.argv) > 2 else '--write'
hits_w, hits_r = [], []
insns = list(md.disasm(code, IB + tva))
for ins in insns:
    for op in ins.operands:
        if op.type != CS_OP_MEM:
            continue
        base = ins.reg_name(op.mem.base) if op.mem.base else ''
        idx = ins.reg_name(op.mem.index) if op.mem.index else ''
        # only plain [reg+disp] forms (base reg, no index, scale 1)
        if idx or not base:
            continue
        if (op.mem.disp & 0xFFFFFFFF) != offs and op.mem.disp != offs:
            continue
        # destination-memory detection: first operand is mem
        dst_mem = ins.operands[0].type == CS_OP_MEM
        rec = '%08X  %-8s %-30s  base=%s' % (ins.address, ins.mnemonic, ins.op_str, base)
        (hits_w if dst_mem else hits_r).append((ins.address, rec))

sel = hits_w if mode == '--write' else hits_r if mode == '--read' else hits_w + hits_r
print('# offs = 0x%X   writes=%d reads=%d  (showing %s)' % (offs, len(hits_w), len(hits_r), mode))
for addr, rec in sel:
    print(rec)
