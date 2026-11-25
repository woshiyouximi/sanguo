"""Find call/jmp callers of a target VA and disassemble context before each hit.

usage: xref_call.py <targetVA> [before=0x30] [after=4]

EXE path is the original 1.05+ build (same one tools/dis_range.py uses).
"""
import sys

import capstone
import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData)
       for s in pe.sections]


def va2off(va):
    rva = va - IB
    for v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


TEXT_LO, TEXT_HI = 0x401000, 0x47E38E
tgt = int(sys.argv[1], 0)
before = int(sys.argv[2], 0) if len(sys.argv) > 2 else 0x30
after = int(sys.argv[3], 0) if len(sys.argv) > 3 else 4

lo = va2off(TEXT_LO)
text = data[lo:va2off(TEXT_HI)]
hits = []
for i in range(len(text) - 5):
    if text[i] in (0xE8, 0xE9):
        rel = int.from_bytes(text[i + 1:i + 5], "little", signed=True)
        if TEXT_LO + i + 5 + rel == tgt:
            hits.append((TEXT_LO + i, "call" if text[i] == 0xE8 else "jmp"))

print("xrefs to %08X: %d" % (tgt, len(hits)))
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
for va, kind in hits:
    print("---- %s @ %08X" % (kind, va))
    o = va2off(va - before)
    for ins in md.disasm(data[o:o + before + after], va - before):
        mark = " <== " if ins.address == va else "     "
        print("  %08X%s%-18s %s" % (ins.address, mark, ins.mnemonic, ins.op_str))
