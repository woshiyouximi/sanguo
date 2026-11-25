# -*- coding: utf-8 -*-
"""Disassemble from the enclosing function start (funcmap.tsv) around a VA."""
import sys, struct, bisect
import capstone, pefile

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
raw = open(EXE, 'rb').read()
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
secs = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]


def va2off(va):
    r = va - IB
    for v, vs, p, rs in secs:
        if v <= r < v + max(vs, rs):
            return p + (r - v)
    return None


fl = []
for ln in open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8'):
    a, b = ln.split('\t')[:2]
    fl.append((int(a, 16), int(b)))
fl.sort()
starts = [x[0] for x in fl]


def owner(va):
    i = bisect.bisect_right(starts, va) - 1
    return fl[i] if i >= 0 else (va, 0x400)


md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)

va = int(sys.argv[1], 16)
count = int(sys.argv[2]) if len(sys.argv) > 2 else 60
back = int(sys.argv[3], 0) if len(sys.argv) > 3 else 0
fstart, flen = owner(va)
fstart2 = max(0x401000, fstart - back)
off = va2off(fstart2)
code = raw[off:off + 12000]
print('; function 0x%X len=%d ; window start 0x%X target 0x%X' % (fstart, flen, fstart2, va))
n = 0
for ins in md.disasm(code, fstart2):
    mark = '>>' if ins.address == va else '  '
    print('%s %08X  %-24s %s %s' % (mark, ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str))
    n += 1
    if n > count and ins.address >= va:
        break
