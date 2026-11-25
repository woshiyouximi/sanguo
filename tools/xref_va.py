# -*- coding: utf-8 -*-
"""在 .text 里搜索对某个 VA 的直接/间接引用（imm32 立即数、以及 disp32 形式）。

用法: python xref_va.py 0x48CD88 [0x48D2A0 ...]
"""
import struct
import sys

import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()
TEXT = [s for s in SEC if s[4] == '.text'][0]


def off2va(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def funcmap():
    rows = []
    import io
    for r in io.open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8').read().splitlines():
        p = r.split('\t')
        rows.append((int(p[0], 16), int(p[1])))
    return rows


FM = funcmap()


def fname(va):
    for s, n in FM:
        if s <= va < s + n:
            return '%08X+0x%X' % (s, va - s)
    return '?'


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        va = int(arg, 16)
        if va < IB:
            va += IB
        pat = struct.pack('<I', va)
        print('=== target VA %08X' % va)
        tstart = TEXT[2]
        tend = TEXT[2] + TEXT[3]
        i = data.find(pat, tstart, tend)
        n = 0
        while i >= 0:
            v = off2va(i)
            print('  imm @ off=0x%06X VA=0x%08X   in %s' % (i, v, fname(v)))
            n += 1
            i = data.find(pat, i + 1, tend)
        print('  hits=%d' % n)
