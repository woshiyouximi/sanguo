"""Better function map: linear sweep .text, collect call/jmp targets + prologues as function starts."""
import io, sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE)
IB = pe.OPTIONAL_HEADER.ImageBase
text = next(s for s in pe.sections if s.Name.startswith(b'.text'))
TB = text.get_data()
TVA = IB + text.VirtualAddress
TEND = TVA + len(TB)
sects = [(IB + s.VirtualAddress, IB + s.VirtualAddress + max(s.Misc_VirtualSize, s.SizeOfRawData), s) for s in pe.sections]

IAT = {}
for e in pe.DIRECTORY_ENTRY_IMPORT:
    for imp in e.imports:
        IAT[imp.address] = (imp.name or b'').decode('ascii', 'replace')

def cstr(va):
    for a, b, s in sects:
        if a <= va < b:
            d = s.get_data()[va - a: va - a + 256]
            e = d.find(b'\x00')
            if e < 3:
                return None
            try:
                t = d[:e].decode('gbk')
            except Exception:
                return None
            if all(32 <= ord(c) < 127 or ord(c) > 127 for c in t):
                return t
    return None

md = Cs(CS_ARCH_X86, CS_MODE_32); md.detail = True
insns = list(md.disasm(TB, TVA))
print('insns', len(insns), file=sys.stderr)

starts = set([TVA])
JUMPS = {'jmp', 'je', 'jne', 'jz', 'jnz', 'ja', 'jae', 'jb', 'jbe', 'jg', 'jge', 'jl', 'jle',
          'js', 'jns', 'jo', 'jno', 'jp', 'jnp', 'jecxz', 'loop', 'loope', 'loopne'}
callers = {}
prev = None
for i, ins in enumerate(insns):
    if ins.mnemonic in ('call',) or ins.mnemonic in JUMPS:
        if ins.operands and ins.operands[0].type == 2:
            t = ins.operands[0].imm
            if TVA <= t < TEND:
                starts.add(t)
                if ins.mnemonic == 'call':
                    callers.setdefault(t, []).append(ins.address)
    if ins.mnemonic in ('ret', 'retn', 'iret', 'iretd') and i + 1 < len(insns):
        starts.add(insns[i + 1].address)
    if ins.mnemonic == 'push' and ins.op_str == 'ebp' and i + 1 < len(insns) and insns[i + 1].mnemonic == 'mov' and insns[i + 1].op_str == 'ebp, esp':
        starts.add(ins.address)
    if ins.mnemonic == 'int3' and i + 1 < len(insns):
        starts.add(insns[i + 1].address)

# only keep starts that are instruction-aligned
aligned = set(i.address for i in insns)
starts = sorted(s for s in starts if s in aligned)
print('starts', len(starts), file=sys.stderr)

rows = []
for idx, s in enumerate(starts):
    e = starts[idx + 1] if idx + 1 < len(starts) else TEND
    strs, imps = [], []
    for ins in insns:
        if ins.address < s:
            continue
        if ins.address >= e:
            break
        if ins.operands:
            if ins.mnemonic in ('push', 'mov', 'cmp') and ins.operands[-1].type == 2:
                v = ins.operands[-1].imm
                t = cstr(v) if 0x400000 < v < 0x4E0000 else None
                if t and len(t) >= 3:
                    strs.append(t)
            if ins.mnemonic == 'call' and ins.operands[0].type == 3:
                a = ins.operands[0].mem.disp
                if a in IAT:
                    imps.append(IAT[a])
    seen = set()
    strs = [x for x in strs if not (x in seen or seen.add(x))]
    seen = set()
    imps = [x for x in imps if not (x in seen or seen.add(x))]
    rows.append('%08X\t%d\t%s\t%s' % (s, e - s, '|'.join(strs)[:400], '|'.join(imps)[:400]))

with io.open(r'F:\sanguo\work\funcmap2.tsv', 'w', encoding='utf-8') as f:
    f.write('\n'.join(rows))
print('wrote', len(rows), file=sys.stderr)
