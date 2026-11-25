# -*- coding: utf-8 -*-
"""Dump disassembly of every registered syscall handler + string/number hints."""
import json, os, re
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32
import sango_dis as d

OUT = r'F:\sanguo\export\script'
T = json.load(open(os.path.join(OUT, 'syscall_table.json')))
PE = pefile.PE(r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe", fast_load=True)
IMG = PE.get_memory_mapped_image()
IB = PE.OPTIONAL_HEADER.ImageBase
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True


def read_cstr(va, maxlen=120):
    off = va - IB
    if off < 0 or off >= len(IMG):
        return None
    end = IMG.find(b'\0', off, off + maxlen)
    if end < 0:
        return None
    raw = IMG[off:end]
    try:
        s = raw.decode('gbk')
    except Exception:
        return None
    if all(32 <= ord(c) < 127 or c in '\r\n\t' for c in s) and len(s) >= 2:
        return s
    return None


lines = []
report = []
for k in sorted(T, key=int):
    va = T[k]
    report.append('=== syscall 0x%03X (dec %d) @ 0x%08X' % (int(k), int(k), va))
    cnt = 0
    ea = va
    while cnt < 60:
        ins = next(md.disasm(bytes(IMG[ea-IB:ea-IB+16]), ea), None)
        if ins is None:
            break
        line = '  %08X  %-24s %s' % (ins.address, ins.bytes.hex(), ins.mnemonic + ' ' + ins.op_str)
        # annotate string refs
        notes = []
        for op in ins.operands:
            if op.type == 2 and 0x470000 <= (op.imm & 0xffffffff) < 0x4D4000:
                s = read_cstr(op.imm & 0xffffffff)
                if s:
                    notes.append('"%s"' % s.replace('\n', '\\n').replace('\r', '\\r'))
        if notes:
            line += '   ; ' + ' / '.join(notes)
        report.append(line)
        if ins.mnemonic == 'ret' or ins.mnemonic == 'jmp' and cnt > 3:
            break
        ea += ins.size
        cnt += 1
    report.append('')

open(os.path.join(OUT, 'syscall_handlers.asm.txt'), 'w', encoding='utf-8').write('\n'.join(report))
print('wrote', len(report), 'lines')
