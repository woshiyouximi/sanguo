#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Scan a VA range for word/dword decrements  sub [reg+disp], ...  to locate
HP / troop-count subtraction sites (damage application points).

Usage: find_dec.py <startVA> <endVA> [--min 1]
"""
import sys, struct

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"

def load():
    data = open(EXE, 'rb').read()
    pe = struct.unpack_from('<I', data, 0x3C)[0]
    nsec = struct.unpack_from('<H', data, pe + 6)[0]
    opt = struct.unpack_from('<H', data, pe + 20)[0]
    base = struct.unpack_from('<I', data, pe + 24 + 28)[0]
    secs = []
    off = pe + 24 + opt
    for i in range(nsec):
        s = data[off + i * 40: off + (i + 1) * 40]
        name = s[:8].rstrip(b'\0').decode('latin1')
        vsz, va, rsz, raw = struct.unpack_from('<IIII', s, 8)
        secs.append((name, base + va, vsz, raw, rsz))
    return data, secs

DATA, SECS = load()

def va2off(va):
    for name, sva, vsz, raw, rsz in SECS:
        if sva <= va < sva + max(vsz, rsz):
            return raw + (va - sva)
    return None

def off2va(off):
    for name, sva, vsz, raw, rsz in SECS:
        if raw <= off < raw + rsz:
            return sva + (off - raw)
    return None

def main():
    sa = int(sys.argv[1], 16) if sys.argv[1].startswith('0x') else int(sys.argv[1], 16)
    ea = int(sys.argv[2], 16) if sys.argv[2].startswith('0x') else int(sys.argv[2], 16)
    o1, o2 = va2off(sa), va2off(ea)
    data = DATA[o1:o2]
    hits = []
    # 66 2B /modrm/ : sub r/m16, r16   81 /5 : sub r/m16, imm16  81 /5 with 66
    i = 0
    n = len(data)
    while i < n - 8:
        b = data[i]
        # 66 2B modrm disp8/32   -> sub r/m16, r16
        if b == 0x66 and data[i+1] in (0x2B, 0x29):
            modrm = data[i+2]
            if (modrm & 0xC0) == 0x40:
                disp = struct.unpack_from('<b', data, i+3)[0]
                va = off2va(o1 + i)
                hits.append((va, 'sub16', disp, data[i+4:i+7].hex()))
                i += 1
                continue
            if (modrm & 0xC0) == 0x80:
                disp = struct.unpack_from('<i', data, i+3)[0]
                va = off2va(o1 + i)
                hits.append((va, 'sub16', disp, data[i+7:i+10].hex()))
                i += 1
                continue
        # 66 81 /5 imm16  -> sub word ptr, imm16
        if b == 0x66 and data[i+1] == 0x81 and (data[i+2] & 0x38) == 0x28:
            modrm = data[i+2]
            if (modrm & 0xC0) == 0x40:
                disp = struct.unpack_from('<b', data, i+3)[0]
                imm = struct.unpack_from('<H', data, i+4)[0]
                va = off2va(o1 + i)
                hits.append((va, 'subw', disp, 'imm=%d' % imm))
                i += 1
                continue
            if (modrm & 0xC0) == 0x80:
                disp = struct.unpack_from('<i', data, i+3)[0]
                imm = struct.unpack_from('<H', data, i+7)[0]
                va = off2va(o1 + i)
                hits.append((va, 'subw', disp, 'imm=%d' % imm))
                i += 1
                continue
        i += 1
    for va, kind, disp, extra in hits:
        print('0x%08X %-5s [reg+0x%X] %s' % (va, kind, disp & 0xFFFFFFFF, extra))
    print('total', len(hits))

main()
