# -*- coding: utf-8 -*-
"""扫 .text 中"写 [reg+0x10] = 1"或"or [reg+0x10], imm"的字节，映射到 funcmap 函数。"""
import sys

import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData, s.Name)
       for s in pe.sections]
D = open(EXE, 'rb').read()


def va2off(va):
    r = va - IB
    for v, vs, p, rs, nm in SEC:
        if v <= r < v + max(vs, rs):
            return p + (r - v)
    return None


def load_funcs():
    out = []
    for line in open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8', errors='replace'):
        f = line.rstrip('\n').split('\t')
        if len(f) < 2:
            continue
        try:
            va = int(f[0], 16)
        except ValueError:
            continue
        s = f[1].strip()
        size = int(s) if s.isdigit() else 0
        out.append((va, size))
    out.sort()
    return out


def owner(funcs, va):
    lo, hi = 0, len(funcs) - 1
    best = None
    while lo <= hi:
        mid = (lo + hi) // 2
        if funcs[mid][0] <= va:
            best = funcs[mid]
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def main():
    funcs = load_funcs()
    pats = [
        (b'\xc7\x40\x10\x01\x00\x00\x00', 'mov dword [eax+0x10],1'),
        (b'\xc7\x41\x10\x01\x00\x00\x00', 'mov dword [ecx+0x10],1'),
        (b'\xc7\x42\x10\x01\x00\x00\x00', 'mov dword [edx+0x10],1'),
        (b'\xc7\x43\x10\x01\x00\x00\x00', 'mov dword [ebx+0x10],1'),
        (b'\x83\x48\x10\x01', 'or dword [eax+0x10],1'),
        (b'\x83\x49\x10\x01', 'or dword [ecx+0x10],1'),
        (b'\x83\x4a\x10\x01', 'or dword [edx+0x10],1'),
        (b'\x83\x4b\x10\x01', 'or dword [ebx+0x10],1'),
        (b'\xc7\x40\x10\x02\x00\x00\x00', 'mov dword [eax+0x10],2'),
        (b'\x83\x48\x10\x02', 'or dword [eax+0x10],2'),
        (b'\x83\x49\x10\x02', 'or dword [ecx+0x10],2'),
    ]
    for pat, desc in pats:
        i = 0
        while True:
            i = D.find(pat, i)
            if i < 0:
                break
            rva = None
            for v, vs, p, rs, nm in SEC:
                if p <= i < p + rs:
                    rva = v + (i - p)
                    secname = nm.rstrip(b'\0').decode('latin1')
                    break
            if rva is not None and secname == '.text':
                va = rva + IB
                ow = owner(funcs, va)
                print('%-26s VA=0x%06X  func=0x%06X (size=%s)'
                      % (desc, va, ow[0] if ow else 0, ow[1] if ow else '?'))
            i += 1


if __name__ == '__main__':
    main()
