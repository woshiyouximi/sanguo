# -*- coding: utf-8 -*-
"""生成 9..32 行的概览表（markdown）。"""
import struct
import sys

import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData)
       for s in pe.sections]
D = open(EXE, 'rb').read()


def off(va):
    r = va - IB
    for v, vs, p, rs in SEC:
        if v <= r < v + max(vs, rs):
            return p + (r - v)
    raise ValueError(hex(va))


def w(a):
    return struct.unpack_from('<6h', D, off(0x485DA8 + a * 0x0C))


def ptrs(a):
    return [struct.unpack_from('<I', D, off(0x485B10 + a * 0x14 + m * 4))[0]
            for m in range(5)]


def main():
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 9
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else 33
    for a in range(lo, hi):
        ww = w(a)
        ps = ptrs(a)
        parts = []
        for m in range(5):
            p = ps[m]
            if ww[m] <= 0:
                continue
            o = off(p)
            xs = []
            ys = []
            for i in range(ww[m]):
                x, y = struct.unpack_from('<hh', D, o + i * 4)
                xs.append(x)
                ys.append(y)
            parts.append('m%d `0x%06X` x%d..%d y%d..%d (%d)' %
                         (m + 1, p, min(xs), max(xs), min(ys), max(ys), ww[m]))
        print('| %d | %s | %d | %s |' % (
            a, '/'.join(str(x) for x in ww[:5]), ww[5], '<br>'.join(parts)))


if __name__ == '__main__':
    main()
