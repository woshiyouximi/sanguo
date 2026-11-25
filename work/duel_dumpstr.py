# -*- coding: utf-8 -*-
"""转储指定 VA 区间的所有 C 字符串（cp950）。
用法: python duel_dumpstr.py <startVA> <endVA>
"""
import sys, struct
import pefile

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
secs = []
for s in pe.sections:
    secs.append((s.VirtualAddress + IB, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
                 s.Name.rstrip(b'\x00').decode('latin1')))
raw = open(EXE, 'rb').read()

def va2off(va):
    for v, vsz, off, rsz, nm in secs:
        if v <= va < v + max(vsz, rsz):
            return off + (va - v)
    return None

start = int(sys.argv[1], 16)
end = int(sys.argv[2], 16)
o = va2off(start)
data = raw[o:o + (end - start)]
i = 0
n = 0
while i < len(data):
    # 跳过 0
    if data[i] == 0:
        i += 1
        continue
    j = data.find(b'\x00', i)
    if j < 0:
        break
    s = data[i:j]
    if len(s) >= 2:
        try:
            txt = s.decode('cp950')
            printable = all(ord(c) >= 0x20 for c in txt)
        except Exception:
            printable = False
            txt = ''
        if printable:
            print('%08X  %s' % (start + i, txt))
            n += 1
    i = j + 1
print('# %d strings' % n)
