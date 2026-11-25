# -*- coding: utf-8 -*-
"""Find callers of a VA and disassemble a window before each call (linear, with capstone)."""
import sys, struct
import capstone

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
raw = open(EXE, 'rb').read()
# PE: find image base and section table
import pefile
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
secs = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]


def va2off(va):
    r = va - IB
    for v, vs, p, rs in secs:
        if v <= r < v + max(vs, rs):
            return p + (r - v)
    return None


def off2va(off):
    for v, vs, p, rs in secs:
        if p <= off < p + rs:
            return IB + v + (off - p)
    return None


md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = False

target = int(sys.argv[1], 16)
before = int(sys.argv[2]) if len(sys.argv) > 2 else 24
pat = struct.pack('<I', target)
calls = []
i = raw.find(pat)
while i != -1:
    va = off2va(i)
    if va is not None and 4 <= i:
        b = raw[i - 1]
        if b in (0xE8, 0xE9):
            calls.append(off2va(i - 1))
    i = raw.find(pat, i + 1)
print('callers of 0x%X: %d' % (target, len(calls)))
for c in calls:
    st = max(0, (va2off(c) or 0) - before * 7)
    start_va = off2va(st)
    code = raw[st:st + (va2off(c) - st) + 5]
    print('--- call at 0x%X  (window from 0x%X)' % (c, start_va))
    ins = list(md.disasm(code, start_va))
    for k in ins[-before:]:
        print('   %08X  %-22s %s %s' % (k.address, k.bytes.hex(), k.mnemonic, k.op_str))
