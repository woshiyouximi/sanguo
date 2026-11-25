# -*- coding: utf-8 -*-
"""宽松搜索：给定整数序列，尝试 1/2/4 字节、正负号、无符号(+128) 编码，
在 EXE 全文中找出所有命中（用于定位数值表，允许表头/转置误差）。

用法:
  python find_seq.py 0,7,-18,19,13,-6,23,-23,-15 [--minlen 6]
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


def off2va(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def sec_of(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return nm
    return '?'


def encs(seq, w, mode):
    fmts = {1: 'b', 2: 'h', 4: 'i'}
    out = b''
    for v in seq:
        if mode == 'neg':
            v = -v
        elif mode == 'u8':
            v = v + 128
        try:
            out += struct.pack('<' + fmts[w], v)
        except struct.error:
            return None
    return out


if __name__ == '__main__':
    seq = [int(x) for x in sys.argv[1].split(',') if x.strip()]
    minlen = len(seq)
    if '--minlen' in sys.argv:
        minlen = int(sys.argv[sys.argv.index('--minlen') + 1])
    seen = set()
    total = 0
    for w in (1, 2, 4):
        for mode in ('pos', 'neg', 'u8'):
            for L in range(len(seq), max(minlen, len(seq)) + 1):
                pass
            for L in range(minlen, len(seq) + 1):
                pat = encs(seq[:L], w, mode)
                if not pat:
                    continue
                i = data.find(pat)
                while i >= 0:
                    va = off2va(i)
                    key = (i, w, mode)
                    if key not in seen:
                        seen.add(key)
                        total += 1
                        print('off=0x%06X VA=0x%08X sec=%-6s w=%d mode=%-4s len=%d' %
                              (i, va or 0, sec_of(i), w, mode, L))
                    i = data.find(pat, i + 1)
    print('total hits', total)
