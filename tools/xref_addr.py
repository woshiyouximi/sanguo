"""Find all code references to an absolute VA (byte-scan for the 4-byte LE address in .text).
usage: xref_addr.py <VA> [ctx_bytes]
"""
import pefile, capstone, sys, struct

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData, s.Name)
       for s in pe.sections]

def va2off(va):
    rva = va - IB
    for v, vs, p, rs, nm in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True

target = int(sys.argv[1], 16)
if target < IB:
    target += IB
ctx = int(sys.argv[2], 0) if len(sys.argv) > 2 else 0
pat = struct.pack("<I", target)

# code range
tv, tvs, tp, trs, tnm = [s for s in SEC if s[4].startswith(b'.text')][0]
code = data[tp:tp + trs]
print("; xrefs to %08X (searching %d bytes of .text)" % (target, len(code)))
hits = []
i = 0
while True:
    j = code.find(pat, i)
    if j < 0:
        break
    va = IB + tv + j
    start = max(0, j - 8)
    for ins in md.disasm(code[start:j + 4], IB + tv + start):
        if ins.address + ins.size > va:
            print("  %08X  %-20s %-6s %s" % (ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str))
            hits.append(inst_va := va)
    i = j + 1
print("; %d hits" % len(hits))
