"""Callgraph summarizer: for a function VA, list its calls (mapped to callee's strings) and string refs."""
import sys, io, re, os
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = os.path.join(os.environ.get('SANGO_DIR', r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+'), 'Sango2.exe')
pe = pefile.PE(EXE)
IB = pe.OPTIONAL_HEADER.ImageBase
text = next(s for s in pe.sections if s.Name.startswith(b'.text'))
TB, TVA, TRP = text.get_data(), IB + text.VirtualAddress, text.VirtualAddress
md = Cs(CS_ARCH_X86, CS_MODE_32); md.detail = True

IAT = {}
for e in pe.DIRECTORY_ENTRY_IMPORT:
    for imp in e.imports:
        IAT[imp.address] = (imp.name or b'').decode('ascii', 'replace')

sects = [(IB + s.VirtualAddress, IB + s.VirtualAddress + max(s.Misc_VirtualSize, s.SizeOfRawData), s) for s in pe.sections]

def cstr(va):
    for a, b, s in sects:
        if a <= va < b:
            d = s.get_data()[va - a: va - a + 256]
            e = d.find(b'\x00')
            if e < 3:
                return None
            try:
                return d[:e].decode('gbk')
            except Exception:
                return None
    return None

MAP = os.environ.get('FUNCMAP', r'F:\sanguo\work\funcmap3.tsv')
rows = [r.split('\t') for r in io.open(MAP, encoding='utf-8').read().splitlines() if re.match(r'^[0-9A-F]{8}\t', r)]
FUNCS = {}
for p in rows:
    if len(p) < 2 or not p[1].strip():
        continue
    FUNCS[int(p[0], 16)] = (int(p[1]), p[2] if len(p) > 2 else '', p[3] if len(p) > 3 else '')

def owner(va):
    for f, (sz, st, im) in FUNCS.items():
        if f <= va < f + sz:
            return (f, sz, st, im)
    return None

va = int(sys.argv[1], 16)
if va < IB:
    va += IB
sz = FUNCS.get(va, (400, '', ''))[0]
code = TB[va - TVA: va - TVA + sz]
tag = sys.argv[2] if len(sys.argv) > 2 else ''
print(';; func %08X size=%d %s self-strings: %s' % (va, sz, tag, FUNCS.get(va, (0, '', ''))[1][:300]))
for ins in md.disasm(code, va):
    d = None
    if ins.mnemonic in ('call', 'jmp') and ins.operands and ins.operands[0].type == 2 and ins.operands[0].imm > 0x400000:
        t = ins.operands[0].imm
        o = owner(t)
        d = 'TARGET %08X  %s' % (t, ('%08X %s' % (o[0], o[2][:120])) if o else '?')
    if ins.mnemonic == 'call' and ins.operands and ins.operands[0].type == 3:
        a = ins.operands[0].mem.disp
        if a in IAT:
            d = 'IAT %s' % IAT[a]
    if d:
        print('%08X  %-30s ; %s' % (ins.address, ins.mnemonic + ' ' + ins.op_str, d))
