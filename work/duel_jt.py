# -*- coding: utf-8 -*-
# decode absolute-dword jump table(s)
# usage: python work\duel_jt.py <tableVA> <count> [labelbase]
import sys, pefile, struct

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def rd(va, n):
    off = va2off(va)
    if off is None:
        raise SystemExit("VA 0x%X not mapped" % va)
    return data[off:off + n]


if __name__ == "__main__":
    t = int(sys.argv[1], 16)
    n = int(sys.argv[2])
    base = int(sys.argv[3], 16) if len(sys.argv) > 3 else 0
    for i in range(n):
        v = struct.unpack("<I", rd(t + i * 4, 4))[0]
        print("idx %3d  val 0x%08X -> 0x%08X" % (i, base + i, v))
