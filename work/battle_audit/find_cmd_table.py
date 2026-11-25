# -*- coding: utf-8 -*-
"""只读：找引用 0x48F94C..0x490294 这段战斗指令串的指针表。

输出：每个候选表（连续 >=6 个 dword 且全部落在串区间内）的起始 VA、项数。
"""
import struct
import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, "rb").read()
SEC = [(s.Name.rstrip(b"\0").decode(), s.VirtualAddress, s.Misc_VirtualSize,
        s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]

LO, HI = 0x48F94C, 0x490294


def off2va(off):
    for n, v, vs, p, rs in SEC:
        if p <= off < p + rs:
            return IB + v + (off - p)
    return None


def main():
    out = open(r"F:\sanguo\work\battle_audit\cmd_ptr_table.txt", "w", encoding="utf-8")
    n = len(data)
    runs = []
    i = 0
    # 按 4 字节对齐扫描整个文件
    for i in range(0, n - 4, 4):
        v = struct.unpack_from("<I", data, i)[0]
        if LO <= v < HI:
            runs.append(i)
    # 合并连续（间隔 <= 8 字节）的 run
    groups = []
    cur = [runs[0]] if runs else []
    for k in runs[1:]:
        if k - cur[-1] <= 8:
            cur.append(k)
        else:
            groups.append(cur)
            cur = [k]
    if cur:
        groups.append(cur)
    for g in groups:
        va = off2va(g[0])
        out.write("表 @%s  项数=%d  首项=%08X\n" % (
            ("%08X" % va) if va else "?", len(g),
            struct.unpack_from("<I", data, g[0])[0]))
        for k in g:
            vv = struct.unpack_from("<I", data, k)[0]
            off = None
            rva = vv - IB
            for nm, v, vs, p, rs in SEC:
                if v <= rva < v + max(vs, rs):
                    off = p + (rva - v)
                    break
            s = ""
            if off is not None:
                e = data.find(b"\0", off, off + 24)
                s = data[off:e].decode("big5", "replace")
            out.write("    @%08X -> %08X %s\n" % (off2va(k), vv, s))
        out.write("\n")
    out.close()
    print("groups", len(groups))


main()
