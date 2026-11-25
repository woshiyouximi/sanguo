"""re_power disassembly helper.
Usage:
  rd.py dis <VA> [count]        linear disasm from VA
  rd.py fn  <VA>                disasm whole function containing VA (funcmap3 size)
  rd.py fns <hexprefix>         list functions whose VA starts with prefix
  rd.py disp <hexdisp>          scan .text for memory operand [reg+disp] (all funcs, context +-)
  rd.py find <heximm>           scan .text for immediate operand == imm
  rd.py glob <VA> [n]           dump dwords at VA (n=1 default)
"""
import sys, io, os, struct
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32, x86

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b"\0").decode("latin1")) for s in pe.sections]
text = next(s for s in pe.sections if s.Name.startswith(b".text"))
TEXT_VA = IB + text.VirtualAddress
TEXT_OFF = text.PointerToRawData
TEXT_LEN = text.Misc_VirtualSize

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

IAT = {}
for e in pe.DIRECTORY_ENTRY_IMPORT:
    for imp in e.imports:
        IAT[imp.address] = (imp.name or b"").decode("ascii", "replace") + "@" + e.dll.decode()

FM = []
for r in io.open(r"F:\sanguo\work\funcmap3.tsv", encoding="utf-8").read().splitlines():
    p = r.split("\t")
    if len(p) < 2:
        continue
    try:
        FM.append((int(p[0], 16), int(p[1]), p[2] if len(p) > 2 else "", p[3] if len(p) > 3 else ""))
    except ValueError:
        pass


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


def func_at(va):
    best = None
    for fva, size, strs, imps in FM:
        if fva <= va < fva + size:
            if best is None or fva > best[0]:
                best = (fva, size, strs, imps)
    return best


def cstr(va, maxn=160):
    off = va2off(va)
    if off is None:
        return None
    end = data.find(b"\0", off, off + maxn)
    if end < 0 or end - off < 2:
        return None
    raw = data[off:end]
    for enc in ("cp950", "gbk", "ascii"):
        try:
            s = raw.decode(enc)
        except Exception:
            continue
        if all(32 <= ord(c) < 127 or ord(c) > 0x2000 for c in s):
            return s
    return None


def note(ins):
    out = []
    for op in ins.operands:
        if op.type == x86.X86_OP_IMM:
            v = op.imm
            s = cstr(v) if IB <= v < IB + 0x200000 else None
            if s:
                out.append('"%s"' % s)
            elif IB <= v:
                f = func_at(v)
                out.append("data_%X" % v + (" (in fn %08X)" % f[0] if f and f[0] == v else ""))
        elif op.type == x86.X86_OP_MEM:
            if op.mem.base == 0 and op.mem.index == 0:
                v = op.mem.disp
                if v in IAT:
                    out.append("IAT " + IAT[v])
                else:
                    s = cstr(v) if IB <= v < IB + 0x200000 else None
                    if s:
                        out.append('"%s"' % s)
                    elif v >= IB:
                        out.append("g_%X" % v)
    return ("   ; " + " | ".join(out)) if out else ""


def fmt(ins):
    b = ins.bytes.hex()
    return "  %08X  %-16s %-7s %-40s%s" % (ins.address, b, ins.mnemonic, ins.op_str, note(ins))


def dis(va, count=60):
    off = va2off(va)
    if off is None:
        print("bad va %X" % va)
        return
    n = 0
    for ins in md.disasm(data[off:off + count * 16], va):
        print(fmt(ins))
        n += 1
        if n >= count:
            break


def fn(va):
    f = func_at(va)
    if not f:
        print("no func at %X" % va)
        return dis(va, 60)
    print("; ===== func %08X size=%d strs=%s imps=%s" % f)
    dis(f[0], f[1] // 2 + 20)


def fns(prefix):
    p = int(prefix, 16)
    if p < IB:
        p += IB
    for fva, size, strs, imps in FM:
        if fva >> 8 == p >> 8 or (fva & 0xFFFFF000) == (p & 0xFFFFF000):
            print("%08X size=%-6d strs=%s | imps=%s" % (fva, size, strs[:100], imps[:70]))


def allins():
    """Linear sweep of .text. NOTE: capstone stops at the first undecodable byte,
    so this may cover only part of .text -- use fins() for full coverage."""
    for ins in md.disasm(data[TEXT_OFF:TEXT_OFF + TEXT_LEN], TEXT_VA):
        yield ins


def fins():
    """Per-function disassembly using funcmap3 boundaries: covers ALL functions,
    including everything past the first data blob that stops allins()."""
    for fva, size, _s, _i in sorted(FM):
        off = va2off(fva)
        if off is None or size <= 0:
            continue
        for ins in md.disasm(data[off:off + size], fva):
            yield ins


def _scan(pred, label):
    hits = []
    for ins in fins():
        if pred(ins):
            hits.append(ins)
    print("; %d hits for %s (per-function sweep of %d funcs)" % (len(hits), label, len(FM)))
    for ins in hits:
        f = func_at(ins.address)
        print("  [fn %08X] %08X %-7s %s%s" % (f[0] if f else 0, ins.address, ins.mnemonic, ins.op_str, note(ins)))


def disp(d):
    d = int(d, 16)
    def _p(ins):
        for op in ins.operands:
            if op.type == x86.X86_OP_MEM and op.mem.disp == d and (op.mem.base or op.mem.index):
                return True
        return False
    _scan(_p, "disp 0x%X" % d)


def find(imm):
    v = int(imm, 16)
    def _p(ins):
        for op in ins.operands:
            if op.type == x86.X86_OP_IMM and op.imm == v:
                return True
        return False
    _scan(_p, "imm 0x%X" % v)


def glob(va, n=1):
    v = int(va, 16)
    if v < IB:
        v += IB
    off = va2off(v)
    for i in range(int(n)):
        print("%08X: %08X" % (v + i * 4, struct.unpack_from("<I", data, off + i * 4)[0]))


if __name__ == "__main__":
    cmd = sys.argv[1]
    a = sys.argv[2] if len(sys.argv) > 2 else None
    if cmd == "dis":
        dis(int(a, 16) if int(a, 16) >= IB else int(a, 16) + IB,
            int(sys.argv[3]) if len(sys.argv) > 3 else 60)
    elif cmd == "fn":
        fn(int(a, 16) if int(a, 16) >= IB else int(a, 16) + IB)
    elif cmd == "fns":
        fns(a)
    elif cmd == "disp":
        disp(a)
    elif cmd == "find":
        find(a)
    elif cmd == "glob":
        glob(a, sys.argv[3] if len(sys.argv) > 3 else 1)
