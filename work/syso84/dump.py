"""Disassemble VA ranges to work/syso84/*.txt (UTF-8 written by python)."""
import pefile, capstone, sys, os

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]


def va2off(va):
    rva = va - IB
    for v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


iat = {}
try:
    for d in pe.DIRECTORY_ENTRY_IMPORT:
        for imp in d.imports:
            if imp.name:
                iat[imp.address] = imp.name.decode() + "@" + d.dll.decode()
except Exception:
    pass

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True


def read_cstr(va, maxn=120):
    off = va2off(va)
    if off is None:
        return None
    end = data.find(b"\0", off, off + maxn)
    if end < 0:
        return None
    raw = data[off:end]
    if len(raw) < 2:
        return None
    try:
        s = raw.decode("ascii")
        if all(32 <= ord(c) < 127 for c in s):
            return s
    except UnicodeDecodeError:
        pass
    try:
        s = raw.decode("gbk")
        if all(ord(c) >= 0x20 for c in s):
            return "GBK:" + s
    except UnicodeDecodeError:
        pass
    return None


def dump(va, size, name):
    out = []
    off = va2off(va)
    out.append("; ==== %08X .. %08X  off=0x%X ====" % (va, va + size, off))
    for ins in md.disasm(data[off:off + size], va):
        note = ""
        for op in ins.operands:
            if op.type == capstone.x86.X86_OP_IMM:
                s = read_cstr(op.imm)
                if s:
                    note += '  ; "%s"' % s
                elif IB <= op.imm < IB + 0x600000:
                    note += "  ; g_%X" % op.imm
            elif op.type == capstone.x86.X86_OP_MEM:
                if op.mem.base == 0 and op.mem.index == 0:
                    v = op.mem.disp
                    s = read_cstr(v)
                    if s:
                        note += '  ; "%s"' % s
                    elif v in iat:
                        note += "  ; IAT " + iat[v]
                    elif IB <= v < IB + 0x600000:
                        note += "  ; g_%X" % v
        call = ""
        if ins.mnemonic == "call":
            for op in ins.operands:
                if op.type == capstone.x86.X86_OP_IMM and op.imm in iat:
                    call = "  <" + iat[op.imm] + ">"
        out.append("  %08X  %-20s %-7s %-42s%s%s" % (ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str, call, note))
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), name)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print("%s  %d lines" % (path, len(out)))


if __name__ == "__main__":
    for spec in sys.argv[1:]:
        va, size, name = spec.split(":")
        dump(int(va, 16), int(size, 0), name)
