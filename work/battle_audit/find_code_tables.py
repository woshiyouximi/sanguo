# -*- coding: utf-8 -*-
"""只读：列出 .rdata 里指向代码的连续指针表，并给出 xref。

用途：定位战斗指令菜单的 198 项「可用判定」表与「动作」表。
"""
import struct
import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, "rb").read()
SEC = [(s.Name.rstrip(b"\0").decode(), s.VirtualAddress, s.Misc_VirtualSize,
        s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]

TEXT = None
for n, v, vs, p, rs in SEC:
    if n == ".text":
        TEXT = (v, max(vs, rs), p, rs)
TV, TVS, TP, TRS = TEXT
TLO, THI = IB + TV, IB + TV + TVS


def off2va(off):
    for n, v, vs, p, rs in SEC:
        if p <= off < p + rs:
            return IB + v + (off - p)
    return None


def va2off(va):
    rva = va - IB
    for n, v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


def scan(lo_va, hi_va):
    lo = va2off(lo_va)
    hi = va2off(hi_va)
    out = open(r"F:\sanguo\work\battle_audit\code_ptr_tables.txt", "w", encoding="utf-8")
    runs = []
    i = lo
    while i < hi - 4:
        v = struct.unpack_from("<I", data, i)[0]
        if TLO <= v < THI:
            runs.append(i)
        i += 4
    groups = []
    cur = [runs[0]] if runs else []
    for k in runs[1:]:
        if k - cur[-1] <= 4:
            cur.append(k)
        else:
            groups.append(cur)
            cur = [k]
    if cur:
        groups.append(cur)
    out.write("扫描区 %08X-%08X\n" % (lo_va, hi_va))
    for g in groups:
        if len(g) < 3:
            continue
        out.write("表 @%08X 项数=%d 首=%08X 末=%08X\n" % (
            off2va(g[0]), len(g),
            struct.unpack_from("<I", data, g[0])[0],
            struct.unpack_from("<I", data, g[-1])[0]))
    out.close()
    print("groups>=3", sum(1 for g in groups if len(g) >= 3))


scan(0x48E000, 0x492000)
