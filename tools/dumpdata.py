# -*- coding: utf-8 -*-
"""dump 一段 VA 的整数矩阵 / 原始字节，辅助识别 .data 常量表。

用法:
  python dumpdata.py <VA> <n_int32> [--w 1|2|4] [--cols N]
"""
import sys

import pefile

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


def sec_of(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return nm
    return '?'


if __name__ == '__main__':
    va = int(sys.argv[1], 16)
    if va < IB:
        va += IB
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 64
    w = 4
    if '--w' in sys.argv:
        w = int(sys.argv[sys.argv.index('--w') + 1])
    cols = 8
    if '--cols' in sys.argv:
        cols = int(sys.argv[sys.argv.index('--cols') + 1])
    off = va2off(va)
    print('VA=0x%08X off=0x%06X sec=%s width=%d' % (va, off, sec_of(va), w))
    import struct
    fmt = {1: '<b', 2: '<h', 4: '<i'}[w]
    line = []
    for i in range(n):
        v = struct.unpack_from(fmt, data, off + i * w)[0]
        line.append('%6d' % v)
        if len(line) == cols:
            print('  +0x%04X  %s' % (i * w - (cols - 1) * w, ' '.join(line)))
            line = []
    if line:
        print('  ...      %s' % ' '.join(line))
