# -*- coding: utf-8 -*-
"""Find code refs to a VA (push/mov imm32) and show context.
usage: a_refs.py 0x4A2C9C [ctx]
"""
import sys, struct, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()
T = [s for s in SEC if s[4] == '.text'][0]
TV, TP, TR = T[0], T[2], T[3]


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def cstr(va):
    o = va2off(va)
    if o is None:
        return None
    e = data.find(b'\0', o, o + 64)
    if e < 0:
        return None
    b = data[o:e]
    if len(b) >= 2 and all(0x20 <= c < 0x7f for c in b):
        return b.decode('latin1')
    return None


md = Cs(CS_ARCH_X86, CS_MODE_32)

def dis(va, n):
    o = va2off(va)
    out = []
    for ins in md.disasm(data[o:o + n], va):
        t = ins.mnemonic + ' ' + ins.op_str
        cm = ''
        if ins.op_str.startswith('0x') and len(ins.op_str) <= 10:
            s = cstr(int(ins.op_str, 16))
            if s:
                cm = '  ; "%s"' % s
        out.append('%08X  %-34s%s' % (ins.address, t, cm))
    return out


tgt = int(sys.argv[1], 16)
ctx = int(sys.argv[2]) if len(sys.argv) > 2 else 64
pat = struct.pack('<I', tgt)
print('=== refs to %08X' % tgt)
hits = []
for m in __import__('re').finditer(__import__('re').escape(pat), data[TP:TP + TR]):
    o = TP + m.start()
    va = IB + TV + (o - TP)
    # only if previous byte looks like push(68) or mov(B8-BF)
    hits.append(va)
for va in hits:
    print('--- ref at %08X' % va)
    for line in dis(max(va - ctx, IB + TV), ctx + 40):
        print('   ' + line)
print('total refs', len(hits))
