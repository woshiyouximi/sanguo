"""Disassemble a VA range of Sango2.exe with string annotation, find callers.

usage: dis.py <VA> [size]        disassemble
       dis.py --callers <VA>     find direct call/jmp sites to VA
"""
import sys, re
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364" + "\\" + "\u4e09\u56fd\u7fa4\u82f1\u4f20\u0032 \u4fee\u6b63\u7248 1.05+" + r"\Sango2.exe"
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

def read_cstr(va, maxn=80):
    off = va2off(va)
    if off is None:
        return None
    end = data.find(b"\0", off, off + maxn)
    if end < 0:
        return None
    raw = data[off:end]
    if len(raw) < 2:
        return None
    for enc in ("gbk", "ascii"):
        try:
            s = raw.decode(enc)
        except Exception:
            continue
        if all(ord(c) >= 0x20 for c in s):
            return s
    return None

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

if sys.argv[1] == "--callers":
    target = int(sys.argv[2], 16)
    tv, tvs, tp, trs, tnm = [s for s in SEC if s[4].startswith(".text")][0]
    code = data[tp:tp + trs]
    text_va = IB + tv
    hits = []
    # linear sweep with resync: try to decode, skip byte on failure
    i = 0
    n = len(code)
    while i < n:
        got = False
        for ins in md.disasm(code[i:i + 16], text_va + i):
            got = True
            if ins.mnemonic in ("call", "jmp") and ins.op_str.startswith("0x"):
                tgt = int(ins.op_str, 16)
                if tgt == target:
                    hits.append((ins.address, ins.mnemonic, ins.bytes.hex()))
            i += ins.size
            break
        if not got:
            i += 1
    print("; %d call/jmp sites -> %08X" % (len(hits), target))
    for a, m, b in hits:
        print("  %08X  %-5s %s" % (a, m, b))
    sys.exit(0)

va = int(sys.argv[1], 16)
size = int(sys.argv[2], 0) if len(sys.argv) > 2 else 0x200
off = va2off(va)
assert off is not None, "bad va"
for ins in md.disasm(data[off:off + size], va):
    note = ""
    ops = ins.op_str
    for m in re.finditer(r"0x[0-9a-f]{6,8}", ops):
        s = read_cstr(int(m.group(0), 16))
        if s:
            note = '   ; "%s"' % s
            break
    print("%08X  %-20s %-8s %s%s" % (ins.address, ins.bytes.hex(), ins.mnemonic, ops, note))
