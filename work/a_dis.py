# -*- coding: utf-8 -*-
"""Disassemble a VA range of Sango2.exe. usage: a_dis.py 0x4695C0 [len]"""
import sys, struct, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def off2va(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def cstr(va):
    o = va2off(va)
    if o is None:
        return None
    e = data.find(b'\0', o, o + 64)
    if e < 0:
        return None
    b = data[o:e]
    try:
        s = b.decode('latin1')
    except Exception:
        return None
    if all(0x20 <= c < 0x7f for c in b) and len(b) >= 2:
        return s
    return None


md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

if __name__ == '__main__':
    va = int(sys.argv[1], 16)
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 400
    off = va2off(va)
    for ins in md.disasm(data[off:off + n], va):
        txt = ins.mnemonic + ' ' + ins.op_str
        cm = ''
        if ins.mnemonic == 'push' and ins.op_str.startswith('0x'):
            s = cstr(int(ins.op_str, 16))
            if s:
                cm = '   ; "%s"' % s
        if ins.mnemonic in ('mov', 'cmp') and '0x' in ins.op_str:
            parts = ins.op_str.split(', ')
            if len(parts) == 2 and parts[1].startswith('0x'):
                s = cstr(int(parts[1], 16))
                if s:
                    cm = '   ; "%s"' % s
        print('%08X  %-32s%s' % (ins.address, txt, cm))
