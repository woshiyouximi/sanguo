# -*- coding: utf-8 -*-
"""Scan Sango2.exe for sound-name strings in .data and their code refs."""
import re, struct, io, json, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

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
    return '%08X+0x%X' % (best[0], va - best[0]) if best else '?%08X' % va


SFX = re.compile(r'^(m\d{3}snd\d{2}|hit\d{2}|defense\d?|death\d?|horse\d{2}|att\d{2}|yell\d{2}|'
                 r'bg\d{2}a|rush\d{2}|victory|success|failure\d?|flaysword|arrow|accept|silence)$', re.I)

# all C strings in .rdata/.data with VA
found = {}
for vaddr, vsize, ptr, rsize, nm in SEC:
    if nm == '.text':
        continue
    blk = data[ptr:ptr + rsize]
    for m in re.finditer(rb'[\x20-\x7e]{2,40}', blk):
        s = m.group().decode('latin1')
        if SFX.match(s):
            va = IB + vaddr + m.start()
            found.setdefault(va, s)

print('sound-name strings in image:', len(found))
refs = {}
for va, s in found.items():
    pat = struct.pack('<I', va)
    for m in re.finditer(re.escape(pat), data[TP:TP + TR]):
        o = TP + m.start()
        cva = IB + TV + (o - TP)
        refs.setdefault(s.upper(), []).append((cva, owner(cva)))

with open(r'F:\sanguo\work\a_exe_sfx.tsv', 'w', encoding='utf-8') as f:
    for s in sorted(refs):
        for cva, ow in refs[s]:
            f.write('%s\t%08X\t%s\n' % (s, cva, ow))

print('referenced distinct names:', len(refs))
for s in sorted(refs):
    print('%-12s %d refs: %s' % (s, len(refs[s]),
          ', '.join('%08X(%s)' % (a, b) for a, b in refs[s][:4])))
print('--- unreferenced sound strings in exe data ---')
print(', '.join(sorted(set(found.values()) - set(refs))))
