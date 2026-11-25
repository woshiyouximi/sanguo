"""Disassemble the surrender-panel function (0x44E8xx..0x44F4xx) with string + field annotations."""
import pefile, capstone, struct

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

def read_cstr(va, maxn=200):
    off = va2off(va)
    if off is None: return None
    end = data.find(b"\0", off, off + maxn)
    if end < 0: return None
    raw = data[off:end]
    for enc in ("cp950", "ascii"):
        try: return raw.decode(enc)
        except UnicodeDecodeError: pass
    return None

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True

START, END = 0x44E7C0, 0x44F480
off = va2off(START)
blob = data[off:off + (END - START)]
for ins in md.disasm(blob, START):
    note = ""
    for op in ins.operands:
        if op.type == capstone.x86.X86_OP_IMM:
            s = read_cstr(op.imm, 60)
            if s and len(s.strip()) >= 2 and any(ord(ch) > 127 or ch.isalpha() for ch in s):
                note += '   ; "%s"' % s
    print("%08X  %-7s %-34s%s" % (ins.address, ins.mnemonic, ins.op_str, note))
