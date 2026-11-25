import pefile, capstone, sys, struct, os

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

def off2va(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None

# imported function names by IAT VA
iat = {}
for d in pe.DIRECTORY_ENTRY_IMPORT:
    for imp in d.imports:
        if imp.name:
            iat[imp.address] = imp.name.decode() + "@" + d.dll.decode()

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True

def read_cstr(va, maxn=200):
    off = va2off(va)
    if off is None: return None
    end = data.find(b"\0", off, off + maxn)
    if end < 0: return None
    raw = data[off:end]
    if len(raw) < 2: return None
    try:
        return raw.decode("ascii")
    except UnicodeDecodeError:
        return None

def disasm(va, count=80, show_bytes=False):
    off = va2off(va)
    if off is None:
        print("bad va"); return
    for ins in md.disasm(data[off:off + count * 16], va):
        note = ""
        # immediate as string / global
        for op in ins.operands:
            if op.type == capstone.x86.X86_OP_IMM:
                s = read_cstr(op.imm)
                if s and len(s) >= 3:
                    note += f'   ; "{s}"'
                elif op.imm >= IB:
                    note += f"   ; data_{op.imm:X}"
            elif op.type == capstone.x86.X86_OP_MEM:
                if op.mem.base == 0 and op.mem.index == 0:
                    v = op.mem.disp
                    s = read_cstr(v)
                    if s and len(s) >= 3:
                        note += f'   ; "{s}"'
                    elif v in iat:
                        note += f"   ; IAT {iat[v]}"
        call = ""
        if ins.mnemonic == "call":
            for op in ins.operands:
                if op.type == capstone.x86.X86_OP_IMM:
                    if op.imm in iat:
                        call = iat[op.imm]
        b = ins.bytes.hex() if show_bytes else ""
        print("  %08X  %-20s %-6s %-42s%s%s" % (ins.address, b, ins.mnemonic, ins.op_str,
                                                ("  <"+call+">") if call else "", note))
        count -= 1
        if count <= 0:
            break

if __name__ == "__main__":
    va = int(sys.argv[1], 16)
    cnt = int(sys.argv[2]) if len(sys.argv) > 2 else 80
    if va < IB:
        va = IB + va
    disasm(va, cnt, len(sys.argv) > 3)
