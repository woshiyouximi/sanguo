"""Byte-scan xref map for the engine-global int array 0x4A6878[0..63].

Robust against .text desync: raw 4-byte LE pattern scan, then local decode.
usage: python xref2.py [--all]
"""
import struct, collections, sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32
from capstone.x86 import X86_OP_MEM

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364" + "\\" + "\u4e09\u56fd\u7fa4\u82f1\u4f20\u0032 \u4fee\u6b63\u7248 1.05+" + r"\Sango2.exe"
BASE = 0x4A6878
COUNT = 64

pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b"\0").decode("latin1")) for s in pe.sections]

def va2off(va):
    rva = va - IB
    for v, vs, p, rs, nm in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None

def sec_of_off(off):
    for v, vs, p, rs, nm in SEC:
        if p <= off < p + rs:
            return nm, IB + v + (off - p)
    return "?", None

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

WRITE_MN = {"mov", "add", "sub", "or", "and", "xor", "inc", "dec", "movzx", "movsx",
            "adc", "sbb", "shl", "shr", "sar", "not", "neg", "imul", "xchg"}

results = []
for slot in range(COUNT):
    va = BASE + slot * 4
    pat = struct.pack("<I", va)
    i = 0
    while True:
        j = data.find(pat, i)
        if j < 0:
            break
        i = j + 1
        nm, ref_va = sec_of_off(j)
        # locate instruction covering j..j+4
        found = None
        for back in range(0, 10):
            s = j - back
            if s < 0:
                break
            start_va = ref_va - back
            for ins in md.disasm(data[s:j + 8], start_va):
                if ins.address <= ref_va < ins.address + ins.size:
                    found = (ins, back)
                    break
                if ins.address > ref_va:
                    break
            if found:
                break
        if not found:
            results.append((slot, ref_va, nm, None, "??"))
            continue
        ins, back = found
        kind = "?"
        if ins.operands and ins.operands[0].type == X86_OP_MEM and ins.operands[0].mem.disp == va:
            kind = "WRITE" if ins.mnemonic in WRITE_MN else "read"
        elif ins.mnemonic in ("push", "lea"):
            kind = "addr"
        elif ins.mnemonic == "cmp":
            kind = "read"
        results.append((slot, ref_va, nm, ins, kind))

print("; %d refs into [0x%08X, 0x%08X)" % (len(results), BASE, BASE + COUNT * 4))
c = collections.Counter((r[0], r[4]) for r in results)
for (slot, kind), n in sorted(c.items()):
    print(";   slot %2d (0x%08X) %-5s x%d" % (slot, BASE + slot * 4, kind, n))
print()
for slot, ref_va, nm, ins, kind in results:
    print("---- slot %2d  %s:%08X  %s" % (slot, nm, ref_va, kind))
    if ins is None:
        print("     (decode failed)")
        continue
    s = ref_va - 20
    for x in md.disasm(data[va2off(s):va2off(ref_va) + 12], s):
        mark = ">>" if x.address == ins.address else "  "
        print("   %s %08X  %-18s %-8s %s" % (mark, x.address, x.bytes.hex(), x.mnemonic, x.op_str))
