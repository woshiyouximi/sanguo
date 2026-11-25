# -*- coding: utf-8 -*-
# search raw dword constants in .text, report VA + containing function
# usage: python work\duel_imm.py 0x10004 0x10007 ...
import sys, struct, pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
FUNC = r"F:\sanguo\work\funcmap3.tsv"

pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b"\0").decode("latin1")) for s in pe.sections]


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


funcs = []
for line in open(FUNC, encoding="utf-8"):
    p = line.split("\t")
    if len(p) < 2 or not p[0].startswith("004"):
        continue
    va = int(p[0], 16)
    funcs.append((va, va + int(p[1])))
funcs.sort()


def owner(va):
    best = None
    for a, b in funcs:
        if a <= va < b:
            return a, va - a
        if a > va:
            break
    return None, 0


if __name__ == "__main__":
    for s in sys.argv[1:]:
        v = int(s, 16)
        pat = struct.pack("<I", v)
        print("=== dword 0x%08X" % v)
        hits = 0
        i = data.find(pat)
        while i >= 0:
            va = off2va(i)
            i = data.find(pat, i + 1)
            if va is None or va < 0x401000 or va > 0x4C0000:
                continue
            f, d = owner(va)
            if f is None:
                continue
            hits += 1
            print("  imm @ VA=0x%08X  in %08X+0x%X" % (va, f, d))
        print("  hits=%d" % hits)
