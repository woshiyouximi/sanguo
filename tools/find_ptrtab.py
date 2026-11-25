# -*- coding: utf-8 -*-
"""扫描 .data/.rdata 里的函数指针表（连续 >= minrun 个 dword 落在 .text 且是函数首字节）。

用法: python find_ptrtab.py [--min 8] [--sec .data]
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

FM = set()
for r in io.open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8').read().splitlines():
    p = r.split('\t')
    FM.add(int(p[0], 16))


def va_of(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def is_func(va):
    return va in FM


if __name__ == '__main__':
    minrun = 8
    if '--min' in sys.argv:
        minrun = int(sys.argv[sys.argv.index('--min') + 1])
    want = None
    if '--sec' in sys.argv:
        want = sys.argv[sys.argv.index('--sec') + 1]
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if nm not in ('.data', '.rdata'):
            continue
        if want and nm != want:
            continue
        i = ptr
        end = ptr + rsize - 4
        run = []
        while i <= end:
            v = struct.unpack_from('<I', data, i)[0]
            if is_func(v):
                run.append((i, v))
                i += 4
            else:
                if len(run) >= minrun:
                    print('TABLE at VA=0x%08X  len=%d  sec=%s' % (va_of(run[0][0]), len(run), nm))
                    for k, (o, v) in enumerate(run):
                        print('   [%2d] %08X' % (k, v))
                run = []
                i += 4
        if len(run) >= minrun:
            print('TABLE at VA=0x%08X len=%d sec=%s' % (va_of(run[0][0]), len(run), nm))
            for k, (o, v) in enumerate(run):
                print('   [%2d] %08X' % (k, v))
