# -*- coding: utf-8 -*-
"""Extract all C strings (>=3 printable) with VA, decode Big5.
usage: strings_va.py [out.tsv]
"""
import sys, struct

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
d = open(EXE, 'rb').read()
lf = struct.unpack_from('<I', d, 0x3C)[0]
ns = struct.unpack_from('<H', d, lf + 6)[0]
osz = struct.unpack_from('<H', d, lf + 20)[0]
base = struct.unpack_from('<I', d, lf + 24 + 28)[0]
secs = []
for i in range(ns):
    o = lf + 24 + osz + i * 40
    nm = d[o:o + 8].rstrip(b'\x00').decode('latin1')
    vs, va, rs, rp = struct.unpack_from('<IIII', d, o + 8)
    secs.append((nm, va, max(vs, rs), rp))


def off2va(off):
    for nm, sva, ssz, rp in secs:
        if rp <= off < rp + ssz:
            return base + sva + (off - rp)
    return None


out = []
n = len(d)
i = 0
while i < n:
    c = d[i]
    if 0x20 <= c < 0x7F or c >= 0xA1:
        j = i
        while j < n and (0x20 <= d[j] < 0x7F or d[j] >= 0xA1):
            j += 1
        if j - i >= 3:
            b = d[i:j]
            try:
                s = b.decode('big5')
            except Exception:
                try:
                    s = b.decode('latin1')
                except Exception:
                    s = ''
            if s and '\\x00' not in s:
                va = off2va(i)
                out.append((va, i, s))
        i = j
    else:
        i += 1

path = sys.argv[1] if len(sys.argv) > 1 else r'F:\sanguo\work\strings_va.tsv'
with open(path, 'w', encoding='utf-8') as f:
    for va, off, s in out:
        if va is None:
            continue
        f.write('%08X\t%06X\t%s\n' % (va, off, s.replace('\t', ' ')))
print('wrote %d strings -> %s' % (len(out), path))
