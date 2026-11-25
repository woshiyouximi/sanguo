"""Find call/jmp rel32 sites targeting a VA, plus absolute imm32 refs.

Usage: xref_call.py <VA> [VA...]
"""
import struct
import sys

import pefile
from capstone import *

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
d = open(EXE, 'rb').read()
T = [s for s in pe.sections if s.Name.rstrip(b'\0') == b'.text'][0]
tstart = IB + T.VirtualAddress
code = d[T.PointerToRawData:T.PointerToRawData + T.Misc_VirtualSize]
md = Cs(CS_ARCH_X86, CS_MODE_32)

targets = set(int(a, 16) for a in sys.argv[1:])
hits = {}
for ins in md.disasm(code, tstart):
    if ins.mnemonic in ('call', 'jmp'):
        try:
            t = int(ins.op_str, 16)
        except ValueError:
            continue
        if t in targets:
            hits.setdefault(t, []).append((ins.address, ins.mnemonic))
for t in sorted(targets):
    h = hits.get(t, [])
    print('%08X : %d caller(s)' % (t, len(h)))
    for a, m in h[:20]:
        print('    %08X  %s' % (a, m))
