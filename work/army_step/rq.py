# -*- coding: utf-8 -*-
"""轻量反汇编查询层：只用 work/re_speed/insn.json + 手工 PE 解析（不依赖 capstone/pefile）。

insn.json 每条记录: [addr, size, mnem, op_str, kind, mem[[base,index,disp,scale]...], imm[...], target]
kind: 1=call 2=jmp (仅当第一操作数是立即数)
"""
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
IDX = r"F:\sanguo\work\re_speed\insn.json"
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"

# ---------------- PE ----------------
_raw = open(EXE, "rb").read()
_pe = struct.unpack_from("<I", _raw, 0x3C)[0]
_nsec = struct.unpack_from("<H", _raw, _pe + 6)[0]
_optsz = struct.unpack_from("<H", _raw, _pe + 20)[0]
_IB = struct.unpack_from("<I", _raw, _pe + 24 + 28)[0]
SEC = []
_so = _pe + 24 + _optsz
for i in range(_nsec):
    o = _so + i * 40
    name = _raw[o:o + 8].rstrip(b"\0").decode("latin1")
    vsize, va, rsize, ptr = struct.unpack_from("<IIII", _raw, o + 8)
    SEC.append((name, va, vsize, ptr, rsize))


def va2off(va):
    rva = va - _IB
    for n, v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


def off2va(off):
    for n, v, vs, p, rs in SEC:
        if p <= off < p + rs:
            return _IB + v + (off - p)
    return None


def sect(va):
    rva = va - _IB
    for n, v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return n
    return None


def rb(va, n):
    o = va2off(va)
    return _raw[o:o + n] if o is not None else b""


def u32(va):
    b = rb(va, 4)
    return struct.unpack("<I", b)[0] if len(b) == 4 else None


def cstr(va, maxn=200):
    o = va2off(va)
    if o is None:
        return None
    e = _raw.find(b"\0", o, o + maxn)
    if e < 0:
        return None
    raw = _raw[o:e]
    if len(raw) < 2:
        return None
    try:
        s = raw.decode("gbk")
    except UnicodeDecodeError:
        return None
    return s if all(ord(c) >= 0x20 for c in s) else None


# ---------------- insn index ----------------
_D = json.load(open(IDX))
_ADDR = [r[0] for r in _D]
_BY = {}


def by_addr(va):
    """精确命中，否则返回 None。"""
    lo, hi = 0, len(_ADDR) - 1
    while lo <= hi:
        m = (lo + hi) // 2
        if _ADDR[m] == va:
            return _D[m]
        if _ADDR[m] < va:
            lo = m + 1
        else:
            hi = m - 1
    return None


def idx_of(va):
    """第一个 addr >= va 的下标。"""
    lo, hi = 0, len(_ADDR)
    while lo < hi:
        m = (lo + hi) // 2
        if _ADDR[m] < va:
            lo = m + 1
        else:
            hi = m
    return lo


def dis(va, n=60, mark=None):
    """从 va 起打印 n 条指令（用索引里的原始记录）。"""
    i = idx_of(va)
    out = []
    for k in range(n):
        if i + k >= len(_D):
            break
        r = _D[i + k]
        out.append(r)
    for r in out:
        note = ""
        for imm in r[6]:
            if 0x400000 <= imm < 0x600000:
                s = cstr(imm)
                if s:
                    note = '   ; "%s"' % s
                elif va2off(imm) is not None:
                    note = "   ; g_%X" % imm
        if mark and r[0] in mark:
            note += "   <<<<"
        print("  %08X  %-7s %-44s%s" % (r[0], r[2], r[3], note))
    return out


def func(va, limit=400):
    """从 va 线性打印，直到 ret / 之后紧跟对齐填充的 jmp 结尾。"""
    i = idx_of(va)
    k = 0
    while i < len(_D) and k < limit:
        r = _D[i]
        note = ""
        for imm in r[6]:
            if 0x400000 <= imm < 0x600000:
                s = cstr(imm)
                if s:
                    note = '   ; "%s"' % s
        print("  %08X  %-7s %-44s%s" % (r[0], r[2], r[3], note))
        i += 1
        k += 1
        if r[2] in ("ret", "retn"):
            break


def mem(disp, mn=None, base=None, limit=400):
    out = []
    for r in _D:
        if mn and r[2] not in mn:
            continue
        for b, ix, d, sc in r[5]:
            if d == disp and (base is None or b == base):
                out.append(r)
                break
    for r in out[:limit]:
        print("  %08X  %-7s %s" % (r[0], r[2], r[3]))
    if len(out) > limit:
        print("  ... %d more" % (len(out) - limit))
    return out


def imm(v, mn=None, limit=400):
    out = [r for r in _D if (not mn or r[2] in mn) and v in r[6]]
    for r in out[:limit]:
        print("  %08X  %-7s %s" % (r[0], r[2], r[3]))
    if len(out) > limit:
        print("  ... %d more" % (len(out) - limit))
    return out


def callers(target, limit=200):
    out = [r for r in _D if r[7] == target]
    for r in out[:limit]:
        print("  %08X  %-7s %s" % (r[0], r[2], r[3]))
    return out


def text(sub, start=0, end=0, limit=300):
    out = []
    for r in _D:
        if start and r[0] < start:
            continue
        if end and r[0] > end:
            continue
        if sub in r[3]:
            out.append(r)
    for r in out[:limit]:
        print("  %08X  %-7s %s" % (r[0], r[2], r[3]))
    return out


def span(a, b):
    """打印 [a,b) 内所有已索引指令。"""
    i = idx_of(a)
    while i < len(_D) and _D[i][0] < b:
        r = _D[i]
        note = ""
        for imm in r[6]:
            s = cstr(imm) if 0x400000 <= imm < 0x600000 else None
            if s:
                note = '   ; "%s"' % s
        print("  %08X  %-7s %-44s%s" % (r[0], r[2], r[3], note))
        i += 1


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "d":
        dis(int(sys.argv[2], 16), int(sys.argv[3]) if len(sys.argv) > 3 else 40)
    elif cmd == "f":
        func(int(sys.argv[2], 16))
    elif cmd == "m":
        mem(int(sys.argv[2], 16))
    elif cmd == "i":
        imm(int(sys.argv[2], 16))
    elif cmd == "c":
        callers(int(sys.argv[2], 16))
    elif cmd == "s":
        span(int(sys.argv[2], 16), int(sys.argv[3], 16))
