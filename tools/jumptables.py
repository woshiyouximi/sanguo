"""Find all jump tables: `jmp dword ptr [reg*4 + imm32]` in .text, plus table size.

Usage: jumptables.py
"""
import struct
import pefile
from capstone import *

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
d = open(EXE, 'rb').read()
SEC = [(s.Name.rstrip(b'\0').decode(), s.VirtualAddress, s.Misc_VirtualSize,
        s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]


def va2off(va):
    rva = va - IB
    for n, v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


T = [s for s in SEC if s[0] == '.text'][0]
tstart = IB + T[1]
code = d[T[3]:T[3] + T[2]]
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True
res = []
for ins in md.disasm(code, tstart):
    if ins.mnemonic not in ('jmp','call'):
        continue
    if 'dword ptr [' not in ins.op_str or '*4' not in ins.op_str:
        continue
    try:
        tbl = int(ins.op_str.split('+')[-1].rstrip(']').strip(), 16)
    except ValueError:
        continue
    o = va2off(tbl)
    if o is None:
        continue
    n = 0
    while True:
        v = struct.unpack_from('<I', d, o + n * 4)[0]
        if not (tstart <= v < tstart + T[2]):
            break
        n += 1
        if n > 600:
            break
    if n >= 8:
        res.append((ins.address, tbl, n, ins.op_str))
for a, t, n, s in res:
    print('%08X  table=%08X  entries=%3d   %s' % (a, t, n, s))
print('; %d tables' % len(res))

