# -*- coding: utf-8 -*-
"""找 call/jmp 某函数的所有调用点（E8/E9 rel32），并给出调用者函数。

用法: python callers.py 0x430766 [0x4307E5 ...]
"""
import io
import struct
import sys

import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()
T = [s for s in SEC if s[4] == '.text'][0]
TV, TP, TR = T[0], T[2], T[3]

FM = []
for r in io.open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8').read().splitlines():
    p = r.split('\t')
    FM.append((int(p[0], 16), int(p[1])))
FM.sort()


def owner(va):
    best = None
    for s, n in FM:
        if s <= va < s + n:
            if best is None or s > best[0]:
                best = (s, n)
    if best:
        return '%08X(sz=%d)+0x%X' % (best[0], best[1], va - best[0])
    return '?%08X' % va


def va_of(off):
    return IB + TV + (off - TP)


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        tgt = int(arg, 16)
        if tgt < IB:
            tgt += IB
        print('=== callers of %08X' % tgt)
        n = 0
        for i in range(TP, TP + TR - 5):
            if data[i] in (0xE8, 0xE9):
                rel = struct.unpack_from('<i', data, i + 1)[0]
                iva = va_of(i)
                if iva + 5 + rel == tgt:
                    print('  %-30s @VA=%08X op=%02X' % (owner(iva), iva, data[i]))
                    n += 1
        print('  total=%d' % n)
