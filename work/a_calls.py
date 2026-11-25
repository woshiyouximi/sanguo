# -*- coding: utf-8 -*-
"""List all code call sites of the sound-play API and the pushed string.
usage: a_calls.py <targetVA> [--back N]
"""
import sys, io, struct, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()
T = [s for s in SEC if s[4] == '.text'][0]
TV, TP, TR = T[0], T[2], T[3]


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def cstr(va):
    o = va2off(va)
    if o is None:
        return None
    e = data.find(b'\0', o, o + 64)
    if e < 0:
        return None
    b = data[o:e]
    if len(b) >= 2 and all(0x20 <= c < 0x7f for c in b):
        return b.decode('latin1')
    return None


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
    if best:
        return '%08X+0x%X' % (best[0], va - best[0])
    return '?%08X' % va


md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = False

tgt = int(sys.argv[1], 16)
print('=== callers of %08X' % tgt)
sites = []
for i in range(TP, TP + TR - 5):
    if data[i] == 0xE8:
        rel = struct.unpack_from('<i', data, i + 1)[0]
        iva = IB + TV + (i - TP)
        if iva + 5 + rel == tgt:
            sites.append(iva)
print('total', len(sites))
for va in sites:
    # disassemble from 80 bytes before to call
    start = va - 80
    o = va2off(start)
    ins_list = list(md.disasm(data[o:o + 80], start))
    # keep instructions ending at <= va
    ins_list = [x for x in ins_list if x.address + x.size <= va + 1]
    pushes = []
    k = len(ins_list) - 1
    while k >= 0 and ins_list[k].address + ins_list[k].size > va:
        k -= 1
    # gather up to 6 preceding push imm
    j = k
    while j >= 0 and len(pushes) < 6:
        ins = ins_list[j]
        if ins.mnemonic == 'push':
            op = ins.op_str
            if op.startswith('0x'):
                v = int(op, 16)
                s = cstr(v)
                pushes.append(('%s' % hex(v), s))
            else:
                pushes.append((op, None))
        elif ins.mnemonic in ('add', 'lea', 'mov'):
            break
        j -= 1
    print('@%08X owner=%s' % (va, owner(va)))
    for p, s in pushes:
        print('     push %-12s %s' % (p, ('"%s"' % s) if s else ''))
