# -*- coding: utf-8 -*-
"""Decode exactly from a VA (must be an instruction boundary)."""
import sys, glob
import capstone, pefile

EXE = glob.glob(r'C:\Users\liutian\Downloads\sgqyzzwb_146364\*\Sango2.exe')[0]
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


md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
va = int(sys.argv[1], 16)
count = int(sys.argv[2], 0) if len(sys.argv) > 2 else 60
off = va2off(va)
n = 0
for ins in md.disasm(raw[off:off + 4000], va):
    print('%08X  %-22s %s %s' % (ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str))
    n += 1
    if n >= count:
        break
