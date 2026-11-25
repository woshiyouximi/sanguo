# -*- coding: utf-8 -*-
"""全 .text 反汇编，统计"哪些函数引用了指定结构体偏移"（如 +0x42/+0x44）。

用法: python field_xref.py 0x42 0x44 [--min 1] [--write]
  --write 只统计写入（Intel 语法下目的操作数是内存）
"""
import io
import sys

import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()
md = Cs(CS_ARCH_X86, CS_MODE_32)

FUNCS = []
for r in io.open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8').read().splitlines():
    p = r.split('\t')
    va = int(p[0].strip(), 16)
    size = int(p[1].strip()) if len(p) > 1 and p[1].strip().isdigit() else 0
    s = p[3].strip() if len(p) > 3 else ''
    FUNCS.append((va, size, s))
FUNCS.sort()


def off_of(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + rsize:
            return ptr + (rva - vaddr)
    return None


def is_write(ins):
    return ins.op_str.startswith(('word ptr ', 'byte ptr ', 'dword ptr ', 'qword ptr '))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    offs = set(int(a, 16) for a in args)
    onlywrite = '--write' in sys.argv
    minhits = 1
    if '--min' in sys.argv:
        minhits = int(sys.argv[sys.argv.index('--min') + 1])
    res = []
    for va, size, s in FUNCS:
        if size <= 0:
            continue
        o = off_of(va)
        if o is None:
            continue
        hits = {}
        for ins in md.disasm(data[o:o + size], va):
            m = ins.op_str
            for off in offs:
                if '+ 0x%x]' % off in m:
                    if onlywrite and not is_write(ins):
                        continue
                    hits.setdefault(off, []).append('0x%08X %s %s' % (ins.address, ins.mnemonic, ins.op_str))
        if hits:
            n = sum(len(v) for v in hits.values())
            if n >= minhits:
                res.append((va, size, n, hits, s))
    res.sort(key=lambda x: -x[2])
    for va, size, n, hits, s in res:
        print('%08X size=%-5d hits=%-3d %s' % (va, size, n, s))
        for off in sorted(hits):
            for line in hits[off][:8]:
                print('     [%02X] %s' % (off, line))


main()
