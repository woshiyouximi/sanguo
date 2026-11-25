"""Function map v3: seeds from prologue byte patterns, expanded by call targets, ranges disassembled per seed."""
import io, sys, re
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE)
IB = pe.OPTIONAL_HEADER.ImageBase
text = next(s for s in pe.sections if s.Name.startswith(b'.text'))
TB = text.get_data(); TVA = IB + text.VirtualAddress; TEND = TVA + len(TB)
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
            return t
    return None

# seeds
seeds = set([0x46ED80])
for m in re.finditer(b'\x55\x8b\xec', TB):
    seeds.add(TVA + m.start())
for m in re.finditer(b'\x6a\xff\x68', TB):
    seeds.add(TVA + m.start())
for m in re.finditer(b'\x53\x8b\xdc\x83', TB):
    seeds.add(TVA + m.start())
for m in re.finditer(b'\x8b\xff\x55\x8b\xec', TB):
    seeds.add(TVA + m.start() + 2)
print('seed pass1', len(seeds), file=sys.stderr)

md = Cs(CS_ARCH_X86, CS_MODE_32); md.detail = True

def scan(s, e, discovered, info):
    """disassemble [s,e), record calls/strings/imports, add call targets to discovered."""
    strs, imps = [], []
    for ins in md.disasm(TB[s - TVA: e - TVA], s):
        if ins.mnemonic == 'call' and ins.operands and ins.operands[0].type == 2:
            t = ins.operands[0].imm
            if TVA <= t < TEND:
                discovered.add(t)
        if ins.operands:
            if ins.mnemonic in ('push', 'mov', 'cmp') and ins.operands[-1].type == 2:
                v = ins.operands[-1].imm
                if 0x400000 < v < 0x4E0000:
                    t = cstr(v)
                    if t:
                        strs.append(t)
            if ins.mnemonic == 'call' and ins.operands[0].type == 3:
                a = ins.operands[0].mem.disp
                if a in IAT:
                    imps.append(IAT[a])
    info[s] = (strs, imps)

for it in range(3):
    order = sorted(seeds)
    info = {}
    discovered = set()
    for i, s in enumerate(order):
        e = order[i + 1] if i + 1 < len(order) else TEND
        if e - s > 0x4000:
            e = min(e, s + 0x4000)
        if s in info:
            continue
        try:
            scan(s, e, discovered, info)
        except Exception:
            pass
    new = discovered - seeds
    print('iter', it, 'funcs', len(order), 'new', len(new), file=sys.stderr)
    if not new:
        break
    seeds |= new

order = sorted(seeds)
rows = []
for s in order:
    strs, imps = info.get(s, ([], []))
    seen = set(); strs = [x for x in strs if not (x in seen or seen.add(x))]
    seen = set(); imps = [x for x in imps if not (x in seen or seen.add(x))]
    # size = distance to next seed
    i = order.index(s)
    e = order[i + 1] if i + 1 < len(order) else TEND
    rows.append('%08X\t%d\t%s\t%s' % (s, min(e - s, 0x4000), '|'.join(strs)[:400], '|'.join(imps)[:400]))
with io.open(r'F:\sanguo\work\funcmap3.tsv', 'w', encoding='utf-8') as f:
    f.write('\n'.join(rows))
print('wrote', len(rows), file=sys.stderr)
