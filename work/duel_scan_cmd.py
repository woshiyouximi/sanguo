import pefile, capstone, sys
from capstone import x86

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
base = pe.OPTIONAL_HEADER.ImageBase
text = None
for s in pe.sections:
    if b'.text' in s.Name:
        text = s
va = base + text.VirtualAddress
data = text.get_data()
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True

# find all 2533 function starts
starts = []
for line in open(r"F:\sanguo\work\funcmap3.tsv", encoding="utf-8", errors="replace"):
    p = line.rstrip("\n").split("\t")
    if len(p) >= 2 and p[0].strip():
        try:
            starts.append(int(p[0], 16))
        except ValueError:
            pass
starts.sort()


def func_of(a):
    lo, hi = 0, len(starts) - 1
    best = None
    while lo <= hi:
        mid = (lo + hi) // 2
        if starts[mid] <= a:
            best = starts[mid]
            lo = mid + 1
        else:
            hi = mid - 1
    return best


hits = []
for ins in md.disasm(data, va):
    m = ins.mnemonic
    if m == 'mov' and len(ins.operands) >= 2:
        op0, op1 = ins.operands[0], ins.operands[1]
        if op0.type == x86.X86_OP_MEM and op1.type == x86.X86_OP_IMM:
            if op0.mem.disp == 0x24 and op0.mem.base != 0:
                hits.append((ins.address, ins.bytes.hex(), ins.op_str))
for a, b, o in hits:
    print("0x%08X  %s  %s   in %08X" % (a, b, o, func_of(a) or 0))
print("total", len(hits))
