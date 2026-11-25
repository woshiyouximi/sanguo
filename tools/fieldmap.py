"""Map struct field offsets: for a code range, print stores to [reg+disp]
annotated with the nearest preceding pushed string/constant.

Usage: fieldmap.py <VA_lo> <VA_hi>
"""
import sys
import pefile
from capstone import *

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, 'rb').read()
SEC = [(s.Name.rstrip(b'\0').decode(), s.VirtualAddress, s.Misc_VirtualSize,
        s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]


def va2off(va):
    rva = va - IB
    for n, v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


def read_str(va):
    o = va2off(va)
    if o is None:
        return None
    e = data.find(b'\0', o, o + 200)
    if e < 0:
        return None
    b = data[o:e]
    for enc in ('big5', 'gbk'):
        try:
            t = b.decode(enc)
            if all(ord(c) >= 32 or c in '\n\t' for c in t):
                return t
        except Exception:
            pass
    return None


lo = int(sys.argv[1], 16)
hi = int(sys.argv[2], 16)
o1, o2 = va2off(lo), va2off(hi)
code = data[o1:o2]
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = False
laststr = ''
for ins in md.disasm(code, lo):
    op = ins.op_str
    if ins.mnemonic == 'push':
        try:
            v = int(op, 16)
        except ValueError:
            v = None
        if v is not None and 0x470000 <= v < 0x500000:
            s = read_str(v)
            if s:
                laststr = s
                print('  ; PUSH STR %08X %r' % (v, s))
            else:
                laststr = ''
        elif v is not None:
            print('  ; push %s' % op)
    elif ins.mnemonic in ('mov', 'movzx', 'movsx') and '[e' in op and '],' in op:
        dst = op.split('],')[0] + ']'
        src = op.split('],')[1]
        print('  %08X  %-28s <- %-6s   %s' % (ins.address, dst, src, ('# ' + laststr) if laststr else ''))
    elif ins.mnemonic in ('call', 'ret', 'jmp') or ins.mnemonic.startswith('j'):
        if ins.mnemonic == 'ret':
            print('  %08X  ret' % ins.address)
            laststr = ''
