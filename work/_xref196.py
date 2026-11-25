"""Find xrefs (push imm32 / mov reg,imm32) to the 09:10 surrender-panel strings and
disassemble the referencing code, so we can see which general fields feed 勝場數/敗場數."""
import pefile, capstone, struct, sys

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

text = [s for s in SEC if s[4] == '.text'][0]
tstart, tend = text[2], text[2] + text[3]
tb = data[tstart:tend]

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)

def read_cstr(va, maxn=200):
    off = va2off(va)
    if off is None: return None
    end = data.find(b"\0", off, off + maxn)
    if end < 0: return None
    raw = data[off:end]
    for enc in ("cp950", "ascii"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return None

TARGETS = [0x491E10, 0x491E20, 0x491E2C, 0x491E38, 0x491E44, 0x491E50,
           0x491E5C, 0x491E68, 0x491E80, 0x491E9C, 0x491EA8]

for t in TARGETS:
    hits = []
    pat = struct.pack("<I", t)
    for m in range(len(tb) - 5):
        pass
    import re
    for m in re.finditer(rb"\x68" + re.escape(pat), tb):
        hits.append(IB + text[0] + m.start())
    for m in re.finditer(rb"[\xb8-\xbf]" + re.escape(pat), tb):
        hits.append(IB + text[0] + m.start())
    print("%08X %-22s xrefs=%d %s" % (t, read_cstr(t) or "", len(hits),
                                      ",".join("%X" % h for h in hits)))
    for h in hits:
        print("---- around %08X ----" % h)
        off = va2off(h - 0x40)
        va = h - 0x40
        for ins in md.disasm(data[off:off + 0x80], va):
            note = ""
            for op in ins.operands:
                if op.type == capstone.x86.X86_OP_IMM:
                    s = read_cstr(op.imm)
                    if s and len(s) >= 2:
                        note += '   ; "%s"' % s
            print("  %08X  %-4s %-30s%s" % (ins.address, ins.mnemonic, ins.op_str, note))
