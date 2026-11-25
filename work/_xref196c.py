"""Corrected xref: immediate spans occurrence; then disassemble the whole referencing function."""
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
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True

TARGETS = []
o0 = va2off(0x491D80)
chunk = data[o0:o0 + 0x140]
i = 0
while i < len(chunk):
    if chunk[i] == 0:
        i += 1; continue
    j = chunk.find(b"\0", i)
    if j < 0: break
    TARGETS.append(0x491D80 + i)
    i = j + 1

def find_refs(t):
    pat = struct.pack("<I", t)
    out = []
    for m in re.finditer(re.escape(pat), tb):
        o = m.start()
        for k in range(1, 16):
            st = o - k
            if st < 0: continue
            ins_list = list(md.disasm(tb[st:st + 16], tva + st))
            if not ins_list: continue
            ins = ins_list[0]
            a0, a1 = ins.address, ins.address + ins.size
            if a0 <= tva + o and tva + o + 4 <= a1:
                if any(op.type == capstone.x86.X86_OP_IMM and op.imm == t for op in ins.operands):
                    out.append(ins.address)
                break
    return out

allrefs = {}
print("=== string refs (surrender panel block) ===")
for t in TARGETS:
    refs = find_refs(t)
    s = read_cstr(t) or ""
    print("%08X %-26r n=%d %s" % (t, s, len(refs), ",".join("%X" % r for r in refs)))
    for r in refs:
        allrefs.setdefault(r, []).append(t)
print("\nref sites:", ["%X" % r for r in sorted(allrefs)])
