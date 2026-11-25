import pefile, capstone, sys, struct
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + vsize:
            off = ptr + (rva - vaddr)
            if off < len(data): return off
    return None
def cstr(va, maxn=120):
    off = va2off(va)
    if off is None: return None
    end = data.find(b"\0", off, off+maxn)
    if end < 0: return None
    raw = data[off:end]
    if len(raw) < 3: return None
    try: return raw.decode("gbk")
    except Exception: return None
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32); md.detail = True
def dump(va, count=200, stop_at_ret=False):
    off = va2off(va)
    if off is None: print("bad va"); return
    n = 0
    for ins in md.disasm(data[off:off+count*16], va):
        note = ""
        for op in ins.operands:
            if op.type == capstone.x86.X86_OP_IMM:
                s = cstr(op.imm)
                if s: note += '   ; "%s"' % s
            elif op.type == capstone.x86.X86_OP_MEM and op.mem.base == 0 and op.mem.index == 0:
                s = cstr(op.mem.disp)
                if s: note += '   ; "%s"' % s
        print("  %08X  %-7s %-40s%s" % (ins.address, ins.mnemonic, ins.op_str, note))
        n += 1
        if n >= count: break
if __name__ == "__main__":
    va = int(sys.argv[1], 16)
    cnt = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    dump(va, cnt)
