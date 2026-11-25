# -*- coding: utf-8 -*-
"""扫描 .text 里的间接跳转/调用: FF 24 8x (jmp [reg*4+disp32]) 与 FF 14 8x (call [reg*4+disp32])，
列出 disp32（表基址）、命中地址、所属函数。

用法: python find_jumptab.py [--call] [--jmp] [--min 4]
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

FUNCS = []
for r in io.open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8').read().splitlines():
    p = r.split('\t')
    FUNCS.append((int(p[0], 16), int(p[1]) if len(p) > 1 and p[1].isdigit() else 0))
FUNCS.sort()


def owner(va):
    lo, hi = 0, len(FUNCS) - 1
    best = None
    while lo <= hi:
        mid = (lo + hi) // 2
        if FUNCS[mid][0] <= va:
            best = FUNCS[mid]
            lo = mid + 1
        else:
            hi = mid - 1
    return best[0] if best else 0


def va_of(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def off_of(va):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        rva = va - IB
        if vaddr <= rva < vaddr + rsize:
            return ptr + (rva - vaddr)
    return None


if __name__ == '__main__':
    want = set()
    if '--call' in sys.argv:
        want.add(0x14)
    if '--jmp' in sys.argv:
        want.add(0x24)
    if not want:
        want = {0x14, 0x24}
    t = [s for s in SEC if s[4] == '.text'][0]
    ptr, rsize = t[2], t[3]
    res = {}
    for i in range(ptr, ptr + rsize - 7):
        if data[i] != 0xFF:
            continue
        # FF 24 8D disp32 = jmp [reg*4+disp32];  FF 14 8D disp32 = call [reg*4+disp32]
        if data[i + 1] not in want:
            continue
        sib = data[i + 2]
        if (sib & 0xC0) != 0x80:   # scale = *4
            continue
        disp = struct.unpack_from('<I', data, i + 3)[0]
        va = va_of(i)
        res.setdefault(disp, []).append(va)
    for disp in sorted(res):
        hits = res[disp]
        print('TABLE 0x%08X  hits=%d  owner=%08X' % (disp, len(hits), owner(hits[0])))
        for h in hits[:12]:
            print('    at %08X (fn %08X)' % (h, owner(h)))
