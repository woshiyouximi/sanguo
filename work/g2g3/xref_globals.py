"""Map all absolute references to the engine-global int array 0x4A6878[0..63]
(= 0x4A6878 .. 0x4A6974) in Sango2.exe .text, and classify read vs write.

usage: python xref_globals.py [out.txt]
"""
import sys, collections
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32, CS_OP_MEM, CS_OP_IMM
from capstone.x86 import X86_OP_MEM, X86_OP_IMM

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364" + "\\" + "\u4e09\u56fd\u7fa4\u82f1\u4f20\u0032 \u4fee\u6b63\u7248 1.05+" + r"\Sango2.exe"
BASE = 0x4A6878
COUNT = 64
END = BASE + COUNT * 4

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

def sec_of(va):
    rva = va - IB
    for v, vs, p, rs, nm in SEC:
        if v <= rva < v + max(vs, rs):
            return nm
    return "?"

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

WRITE_MN = {"mov", "add", "sub", "or", "and", "xor", "inc", "dec", "movzx", "movsx",
            "adc", "sbb", "shl", "shr", "sar", "not", "neg", "imul"}

tv, tvs, tp, trs, tnm = [s for s in SEC if s[4].startswith(".text")][0]
code = data[tp:tp + trs]
text_va = IB + tv

# linear sweep; keep instruction list for context windows
insns = []
for ins in md.disasm(code, text_va):
    insns.append(ins)

hits = []   # (va, slot, kind, text)
for idx, ins in enumerate(insns):
    for oi, op in enumerate(ins.operands):
        va_val = None
        if op.type == X86_OP_MEM and op.mem.base == 0 and op.mem.index == 0:
            va_val = op.mem.disp
        if va_val is None:
            continue
        if not (BASE <= va_val < END):
            continue
        is_write = False
        if oi == 0 and ins.mnemonic in WRITE_MN:
            is_write = True
        kind = "WRITE" if is_write else "read"
        # stack pushes of the address are "address-taken"
        if ins.mnemonic in ("push", "lea"):
            kind = "addr"
        hits.append((ins.address, (va_val - BASE) // 4, kind, ins))

print("; .text %08X..%08X  (%d insns)" % (text_va, text_va + trs, len(insns)))
print("; %d refs to globals array" % len(hits))

by_kind = collections.Counter(h[2] for h in hits)
print("; kinds: %s" % dict(by_kind))

# writes grouped per slot
for slot in range(COUNT):
    ws = [h for h in hits if h[1] == slot and h[2] == "WRITE"]
    rs = [h for h in hits if h[1] == slot and h[2] != "WRITE"]
    if not ws and not rs:
        continue
    print()
    print("=== slot %d (0x%08X): %d writes, %d reads ===" % (slot, BASE + slot * 4, len(ws), len(rs)))
    for va, _, kind, ins in ws + rs:
        ctx = []
        for ins2 in insns:
            if ins2.address >= va - 24 and ins2.address <= va + 16:
                mark = ">>" if ins2.address == va else "  "
                ctx.append("    %s %08X  %-16s %-8s %s" % (mark, ins2.address, ins2.bytes.hex(), ins2.mnemonic, ins2.op_str))
            if ins2.address > va + 16:
                break
        print("  [%s] ctx:" % kind)
        print("\n".join(ctx))
