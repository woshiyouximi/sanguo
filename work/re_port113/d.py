"""Read-only disassembly helper for the 0x113 / 0x119 investigation.

Usage:
  python d.py fn 43AF7A [maxins]      dump a function (stops at frame-balanced ret)
  python d.py raw 43AF7A 200          dump N instructions flat
  python d.py xref 43AFAA             find e8 rel32 callers by byte scan
  python d.py u32 4B3CA0 64           dump dwords
  python d.py str 43AF7A 40           dump bytes as hex
"""
import sys, struct
import pefile, capstone

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
TEXT = [s for s in SEC if s[4] == '.text'][0]


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


def cstr(va, maxn=120):
    off = va2off(va)
    if off is None:
        return None
    end = data.find(b"\0", off, off + maxn)
    if end < 0:
        return None
    raw = data[off:end]
    if len(raw) < 3:
        return None
    try:
        return raw.decode("ascii")
    except UnicodeDecodeError:
        return None


def note_for(ins):
    note = ""
    for op in ins.operands:
        if op.type == capstone.x86.X86_OP_IMM:
            s = cstr(op.imm)
            if s:
                note += '  ; "%s"' % s
            elif op.imm >= IB:
                note += "  ; va_%X" % op.imm
        elif op.type == capstone.x86.X86_OP_MEM:
            if op.mem.base == 0 and op.mem.index == 0:
                v = op.mem.disp
                s = cstr(v)
                if s:
                    note += '  ; "%s"' % s
                elif v in iat:
                    note += "  ; IAT " + iat[v]
                elif v >= IB:
                    note += "  ; g_%X" % v
    return note


def dump(va, maxins=200, flat=False, out=print):
    off = va2off(va)
    if off is None:
        out("bad va %X" % va)
        return
    depth = 0
    n = 0
    for ins in md.disasm(data[off:off + maxins * 16], va):
        out("  %08X  %-24s %-7s %-42s%s" % (ins.address, ins.bytes.hex(), ins.mnemonic,
                                           ins.op_str, note_for(ins)))
        n += 1
        if ins.mnemonic == "push" and ins.op_str == "ebp":
            depth += 1
        elif ins.mnemonic == "pop" and ins.op_str == "ebp":
            depth -= 1
        elif ins.mnemonic == "ret" and depth <= 0 and not flat:
            break
        elif ins.mnemonic == "ret" and flat:
            pass
        if n >= maxins:
            out("  ... (hit maxins=%d)" % maxins)
            break


def xref(target):
    t = struct.pack("<I", target)
    res = []
    lo = TEXT[2]
    hi = TEXT[2] + TEXT[3]
    i = data.find(b"\xe8", lo, hi)
    while i >= 0:
        if data[i + 5:i + 9] == t:
            res.append(off2va(i))
        i = data.find(b"\xe8", i + 1, hi)
    # also push imm32 of the address (function-pointer tables)
    return res


def scan_pushimm(target):
    t = struct.pack("<I", target)
    res = []
    i = data.find(t, TEXT[2], TEXT[2] + TEXT[3])
    while i >= 0:
        if data[i - 1] == 0x68:
            res.append(off2va(i - 1))
        i = data.find(t, i + 1, TEXT[2] + TEXT[3])
    return res


def main():
    cmd = sys.argv[1]
    va = int(sys.argv[2], 16)
    if va < IB:
        va += IB
    if cmd == "fn":
        mx = int(sys.argv[3]) if len(sys.argv) > 3 else 250
        dump(va, mx)
    elif cmd == "raw":
        mx = int(sys.argv[3]) if len(sys.argv) > 3 else 120
        dump(va, mx, flat=True)
    elif cmd == "xref":
        for a in xref(va):
            print("call from %08X" % a)
        for a in scan_pushimm(va):
            print("push imm  %08X" % a)
    elif cmd == "u32":
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 16
        off = va2off(va)
        for k in range(n):
            v = struct.unpack_from("<I", data, off + 4 * k)[0]
            print("%08X: %08X" % (va + 4 * k, v))
    elif cmd == "bytes":
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 64
        off = va2off(va)
        print(data[off:off + n].hex())


if __name__ == "__main__":
    main()
