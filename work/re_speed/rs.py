# -*- coding: utf-8 -*-
"""只读反汇编基础设施：PE 映射 + 全 .text 线性扫描索引 + 查询。

用法（交互）：
  import rs
  rs.dis(0x43B574, 40)                  # 反汇编
  rs.find_mem(0x6C)                     # 所有 [reg+0x6C] 引用
  rs.find_imm(0x10000)                  # 所有立即数 0x10000
  rs.callers(0x43B574)                  # 所有 e8/e9 到该地址
  rs.find_or(0x2c, 0x4000)              # or [reg+0x2c], 0x4000
"""
import json
import os
import struct

import capstone
import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
HERE = os.path.dirname(os.path.abspath(__file__))
IDX = os.path.join(HERE, "insn.json")

pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.Name.rstrip(b"\0").decode("latin1"), s.VirtualAddress, s.Misc_VirtualSize,
        s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]


def va2off(va):
    rva = va - IB
    for nm, vaddr, vsize, ptr, rsize in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def off2va(off):
    for nm, vaddr, vsize, ptr, rsize in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def sect_of(va):
    rva = va - IB
    for nm, vaddr, vsize, ptr, rsize in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return nm
    return None


def bytes_at(va, n):
    o = va2off(va)
    return data[o:o + n] if o is not None else b""


def dword(va):
    b = bytes_at(va, 4)
    return struct.unpack("<I", b)[0] if len(b) == 4 else None


md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True
md.skipdata = False

IAT = {}
for d in pe.DIRECTORY_ENTRY_IMPORT:
    for imp in d.imports:
        if imp.name:
            IAT[imp.address] = imp.name.decode() + "@" + d.dll.decode()


def _cstr(va, maxn=120):
    o = va2off(va)
    if o is None:
        return None
    end = data.find(b"\0", o, o + maxn)
    if end < 0 or end - o < 3:
        return None
    try:
        s = data[o:end].decode("ascii")
    except UnicodeDecodeError:
        return None
    return s if all(32 <= ord(c) < 127 for c in s) else None


def dis(va, count=40, show_bytes=True, stop_at_ret=False):
    o = va2off(va)
    if o is None:
        print("bad va %08X" % va)
        return
    for ins in md.disasm(data[o:o + count * 16], va):
        note = ""
        for op in ins.operands:
            if op.type == capstone.x86.X86_OP_IMM:
                s = _cstr(op.imm)
                if s:
                    note += '   ; "%s"' % s
            elif op.type == capstone.x86.X86_OP_MEM and op.mem.base == 0 and op.mem.index == 0:
                if op.mem.disp in IAT:
                    note += "   ; IAT %s" % IAT[op.mem.disp]
                else:
                    s = _cstr(op.mem.disp)
                    if s:
                        note += '   ; "%s"' % s
        call = ""
        if ins.mnemonic in ("call", "jmp"):
            for op in ins.operands:
                if op.type == capstone.x86.X86_OP_IMM and op.imm in IAT:
                    call = "  <" + IAT[op.imm] + ">"
        b = ins.bytes.hex(" ") if show_bytes else ""
        print("  %08X  %-22s %-7s %-44s%s%s" % (ins.address, b, ins.mnemonic, ins.op_str, call, note))
        count -= 1
        if count <= 0:
            break


# ---------------- full .text index ----------------

def build_index(force=False):
    if os.path.exists(IDX) and not force:
        return
    out = []
    bad = 0
    for nm, vaddr, vsize, ptr, rsize in SEC:
        if nm != ".text":
            continue
        va0 = IB + vaddr
        blob = data[ptr:ptr + rsize]
        off = 0
        n = len(blob)
        while off < n:
            last = off
            for ins in md.disasm(blob[off:off + 4096], va0 + off):
                rec = _rec(ins)
                out.append(rec)
                last = ins.address - va0 + ins.size
            if last == off:
                bad += 1
                off += 1
            else:
                off = last
    if bad:
        print("skipped %d undecodable bytes" % bad)
    out.sort(key=lambda r: r[0])
    json.dump(out, open(IDX, "w"), separators=(",", ":"))
    return out


def _rec(ins):
    """[addr,size,mnem,op_str,kind,mem[],imm[],target]  kind 1=call 2=jmp"""
    rec = [ins.address, ins.size, ins.mnemonic, ins.op_str, 0, [], [], None]
    for op in ins.operands:
        if op.type == capstone.x86.X86_OP_IMM:
            rec[6].append(op.imm)
        elif op.type == capstone.x86.X86_OP_MEM:
            rec[5].append([op.mem.base, op.mem.index, op.mem.disp, op.mem.scale])
    if ins.operands and ins.operands[0].type == capstone.x86.X86_OP_IMM:
        if ins.mnemonic == "call":
            rec[7] = ins.operands[0].imm
            rec[4] = 1
        elif ins.mnemonic == "jmp":
            rec[7] = ins.operands[0].imm
            rec[4] = 2
    return rec


_CACHE = None


def I():
    global _CACHE
    if _CACHE is None:
        if os.path.exists(IDX):
            _CACHE = json.load(open(IDX))
        else:
            _CACHE = build_index(True)
    return _CACHE


def _show(recs, limit=200):
    for r in recs[:limit]:
        print("  %08X  %-7s %s" % (r[0], r[2], r[3]))
    if len(recs) > limit:
        print("  ... %d more" % (len(recs) - limit))
    return recs


def find_mem(disp, base=None, limit=200, mn=None):
    """所有 operand 里出现 [base+disp] 的指令。"""
    out = []
    for r in I():
        if mn and r[2] not in mn:
            continue
        for b, idx, d, sc in r[5]:
            if d == disp and (base is None or b == base):
                out.append(r)
                break
    return _show(out, limit)


def find_imm(imm, limit=200, mn=None):
    out = []
    for r in I():
        if mn and r[2] not in mn:
            continue
        if imm in r[6]:
            out.append(r)
    return _show(out, limit)


def find_text(sub, limit=200, mn=None, start=0, end=0):
    out = []
    for r in I():
        if mn and r[2] not in mn:
            continue
        if start and r[0] < start:
            continue
        if end and r[0] > end:
            continue
        if sub in r[3]:
            out.append(r)
    return _show(out, limit)


def callers(target, limit=200):
    out = [r for r in I() if r[7] == target]
    return _show(out, limit)


def func_start(va, back=0x600):
    """向上找 push ebp; mov ebp,esp 作为函数起点（近似）。"""
    b = bytes_at(va - back, back + 8)
    pat = b"\x55\x8b\xec"
    i = b.rfind(pat)
    if i < 0:
        return None
    return va - back + i


def raw(va, n=32):
    b = bytes_at(va, n)
    print("%08X  %s" % (va, b.hex(" ")))
    return b


if __name__ == "__main__":
    import sys
    build_index(True)
    print("indexed", len(I()), "insns")
