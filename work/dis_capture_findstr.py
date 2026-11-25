# -*- coding: utf-8 -*-
"""在 Sango2.exe 里按 ASCII / cp950 搜索子串，输出 VA。用法: findstr.py <子串> [...]"""
import sys, pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, 'rb').read()

def off2va(off):
    for s in pe.sections:
        if s.PointerToRawData <= off < s.PointerToRawData + s.SizeOfRawData:
            return IB + s.VirtualAddress + (off - s.PointerToRawData)
    return None

for arg in sys.argv[1:]:
    for enc in ('ascii', 'cp950'):
        try:
            pat = arg.encode(enc)
        except Exception:
            continue
        start = 0
        hits = []
        while True:
            i = data.find(pat, start)
            if i < 0:
                break
            hits.append(i)
            start = i + 1
        if hits:
            print('=== %s (%s) hits=%d' % (arg, enc, len(hits)))
            for i in hits[:20]:
                print('  VA %08X off=%x' % (off2va(i) or 0, i))
            break
    else:
        print('=== %s : no hit' % arg)
