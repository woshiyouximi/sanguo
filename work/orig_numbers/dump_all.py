# -*- coding: utf-8 -*-
"""Linear-disassemble the whole .text of Sango2.exe into a TSV, resyncing past undecodable bytes.

Columns: va  bytes  mnemonic  op_str  tgt(resolved call/jmp target)
"""
import rd, io

lo, hi = rd.text_range()
o1, o2 = rd.va2off(lo), rd.va2off(hi)
buf = rd.data[o1:o2]
out = io.StringIO()
w = out.write
n = 0
pos = 0
gaps = []
JCC = ('call', 'jmp', 'jz', 'jnz', 'je', 'jne', 'jb', 'jae', 'jbe', 'ja',
       'jl', 'jge', 'jle', 'jg', 'js', 'jns', 'jo', 'jno', 'jp', 'jnp',
       'loop', 'jecxz')
while pos < len(buf):
    got = 0
    for ins in rd.md.disasm(buf[pos:pos + 200], lo + pos):
        raw = ins.bytes.hex()
        tgt = ''
        if ins.mnemonic in JCC and ins.operands and ins.operands[0].type == 2:
            tgt = '0x%X' % ins.operands[0].imm
        w('%08X\t%s\t%s\t%s\t%s\n' % (ins.address, raw, ins.mnemonic, ins.op_str, tgt))
        n += 1
        got += 1
        pos = ins.address - lo + ins.size
    if got == 0:
        gaps.append(lo + pos)
        pos += 1
open('text_dis.tsv', 'w', encoding='utf-8').write(out.getvalue())
print('insns', n, 'end', hex(lo + pos), 'gap_bytes', len(gaps))
if gaps:
    # compress gap list into ranges
    rng = []
    s = gaps[0]
    p = gaps[0]
    for g in gaps[1:]:
        if g == p + 1:
            p = g
            continue
        rng.append((s, p + 1))
        s = p = g
    rng.append((s, p + 1))
    print('gap ranges', len(rng), [('%X-%X' % (a, b)) for a, b in rng[:20]])

