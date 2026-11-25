# -*- coding: utf-8 -*-
"""只读：把 EXE 某个 VA 区间里的 NUL 结尾串按 Big5 解出来，连地址一起打印。

用法: dump_str_region.py 0x48F900 0x490300
"""
import sys
import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, "rb").read()
SEC = [(s.Name.rstrip(b"\0").decode(), s.VirtualAddress, s.Misc_VirtualSize,
        s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]


def va2off(va):
    rva = va - IB
    for n, v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


def off2va(off):
    for n, v, vs, p, rs in SEC:
        if p <= off < p + rs:
            return IB + v + (off - p)
    return None


def main():
    a = int(sys.argv[1], 16)
    b = int(sys.argv[2], 16)
    out = open(sys.argv[3], "w", encoding="utf-8") if len(sys.argv) > 3 else None
    oa, ob = va2off(a), va2off(b)
    blob = data[oa:ob]
    i = 0
    while i < len(blob):
        j = blob.find(b"\0", i)
        if j < 0:
            break
        raw = blob[i:j]
        va = off2va(oa + i)
        if len(raw) >= 2:
            try:
                t = raw.decode("big5")
            except Exception:
                t = raw.decode("big5", "replace")
            if all(ord(c) >= 32 for c in t):
                line = "%08X  %s" % (va, t)
                if out:
                    out.write(line + "\n")
        i = j + 1
    if out:
        out.close()


main()
