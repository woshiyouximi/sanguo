# -*- coding: utf-8 -*-
"""只读：手工核对个别 call 的字节与目标（防止反汇编器/工具解析偏差）。"""
import struct
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


for va in (0x4448F6, 0x4448E8, 0x444926):
    off = va2off(va)
    b = data[off:off + 8]
    print("%08X  bytes=%s" % (va, b.hex(" ")))
    if b[0] == 0xE8:
        rel = struct.unpack_from("<i", b, 1)[0]
        print("        call -> %08X" % (va + 5 + rel))
    elif b[0] == 0xE9:
        rel = struct.unpack_from("<i", b, 1)[0]
        print("        jmp  -> %08X" % (va + 5 + rel))
