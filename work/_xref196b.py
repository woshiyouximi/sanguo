"""Robust xref: any 4-byte VA occurrence in .text, validated as an instruction operand.
Dumps the surrender-panel string block and all code refs to it."""
import pefile, capstone, struct, re, sys

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]

def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None

def read_cstr(va, maxn=300):
    off = va2off(va)
    if off is None: return None
    end = data.find(b"\0", off, off + maxn)
    if end < 0: return None
    raw = data[off:end]
    for enc in ("cp950", "ascii"):
        try: return raw.decode(enc)
        except UnicodeDecodeError: pass
    return None

text = [s for s in SEC if s[4] == '.text'][0]
tstart, tend, tva = text[2], text[2] + text[3], IB + text[0]
tb = data[tstart:tend]

# 1. dump the string block so we have exact addresses
print("=== string block 0x491D80..0x491EC0 ===")
off = va2off(0x491D80)
chunk = data[off:off + 0x140]
va = 0x491D80
i = 0
while i < len(chunk):
    if chunk[i] == 0:
        i += 1
        continue
    j = chunk.find(b"\0", i)
    if j < 0: break
    raw = chunk[i:j]
    try: s = raw.decode("cp950")
    except UnicodeDecodeError: s = repr(raw)
    print("  %08X  %-40r" % (va + i, s))
    i = j + 1

# 2. collect target VAs present in the dumped range
targets = []
off0 = va2off(0x491D80)
chunk = data[off0:off0 + 0x140]
i = 0
while i < len(chunk):
    if chunk[i] == 0:
        i += 1; continue
    j = chunk.find(b"\0", i)
    if j < 0: break
    targets.append(0x491D80 + i)
    i = j + 1

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True

print("\n=== xrefs ===")
def instr_ending_at(off_hit):
    """try starts off_hit-15..off_hit-1, return (start_va, ins) if an ins ends exactly at off_hit"""
    for k in range(1, 16):
        st = off_hit - k
        if st < 0: continue
        for ins in md.disasm(tb[st:st + 16], tva + st):
            if ins.address + ins.size == tva + off_hit:
                return ins
            break
    return None

for t in targets:
    pat = struct.pack("<I", t)
    hits = []
    for m in re.finditer(re.escape(pat), tb):
        o = m.start()
        ins = instr_ending_at(o)
        if ins is not None:
            hit_at = o - (ins.address - tva) if False else o
            ok = any(op.type == capstone.x86.X86_OP_IMM and op.imm == t for op in ins.operands)
            if ok:
                hits.append(ins.address)
    s = read_cstr(t) or ""
    if hits:
        print("%08X %-30r xrefs=%d %s" % (t, s, len(hits), ",".join("%X" % h for h in hits)))
