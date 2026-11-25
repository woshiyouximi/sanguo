# -*- coding: utf-8 -*-
"""Show the 6 instructions preceding each call site of PlayMusic, to read the track argument."""
import glob, bisect
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

SITES = [0x41BBC3, 0x41E3C0, 0x423A88, 0x423ABC, 0x423AF0, 0x423B21, 0x423B4C,
         0x428DC8, 0x428FD1, 0x435904, 0x435AC3, 0x437CBE, 0x437ED0, 0x4380AE,
         0x443B0E, 0x447FF2, 0x44E919, 0x46CE46]
for site in SITES:
    off = va2off(site)
    st = off - 40
    va0 = site - 40
    print('--- call at 0x%X' % site)
    for ins in md.disasm(raw[st:off + 5], va0):
        print('    %08X  %-22s %s %s' % (ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str))
