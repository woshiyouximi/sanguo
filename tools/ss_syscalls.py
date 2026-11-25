# -*- coding: utf-8 -*-
"""Emulate the syscall registration function at 0x420D52 to recover id->handler map."""
import json, os
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

PE = pefile.PE(r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe", fast_load=True)
IMAGE = PE.get_memory_mapped_image()
IB = PE.OPTIONAL_HEADER.ImageBase
TABLE = 0x4A69B0
md = Cs(CS_ARCH_X86, CS_MODE_32)


def imm(s):
    s = s.strip()
    try:
        return int(s, 0)
    except ValueError:
        return None


def emulate(start):
    ea = start
    regs = {'eax': 0, 'ecx': 0}
    table = {}
    steps = 0
    while steps < 30000:
        steps += 1
        ins = next(md.disasm(bytes(IMAGE[ea-IB:ea-IB+16]), ea), None)
        if ins is None:
            print('bad insn at', hex(ea))
            return table
        m, ops = ins.mnemonic, ins.op_str
        if m in ('ret', 'leave'):
            break
        parts = [p.strip() for p in ops.split(',')] if ops else []
        if m == 'mov' and len(parts) == 2:
            dst, src = parts
            v = imm(src)
            if dst in regs:
                if src in regs:
                    regs[dst] = regs[src]
                elif v is not None:
                    regs[dst] = v & 0xffffffff
                else:
                    print('mov?', dst, src, hex(ea))
            elif dst.startswith('dword ptr [eax'):
                if dst == 'dword ptr [eax]':
                    if src in regs:
                        table[regs['eax']] = regs[src]
                    else:
                        print('store?', src, hex(ea))
                else:
                    print('odd store', dst, hex(ea))
        elif m == 'add' and len(parts) == 2:
            dst, src = parts
            v = imm(src)
            if dst == 'eax' and v is not None:
                regs['eax'] = (regs['eax'] + v) & 0xffffffff
            elif dst in regs and v is not None:
                regs[dst] = (regs[dst] + v) & 0xffffffff
        elif m == 'lea' and len(parts) == 2:
            dst, src = parts
            inner = src.strip('[]')
            val = 0
            for p in [x.strip() for x in inner.split('+')]:
                if p in regs:
                    val += regs[p]
                elif imm(p) is not None:
                    val += imm(p)
                else:
                    print('lea?', src, hex(ea))
            regs[dst] = val & 0xffffffff
        elif m == 'call':
            pass
        elif m == 'jmp':
            ea = imm(ops)
            continue
        elif m in ('push', 'pop', 'xor', 'cmp', 'test', 'jne', 'je', 'inc', 'dec',
                   'sub', 'and', 'or', 'shl', 'shr', 'neg', 'not', 'nop', 'cdq', 'movzx', 'movsx'):
            pass
        else:
            print('unhandled', m, ops, 'at', hex(ea))
        ea += ins.size
    res = {}
    for addr, fn in table.items():
        if TABLE <= addr < TABLE + 0x400 * 4:
            res[(addr - TABLE) // 4] = fn
    return res


if __name__ == '__main__':
    res = emulate(0x420D52)
    ids = sorted(res)
    print('registered', len(res))
    if not ids:
        raise SystemExit
    print('min id', hex(min(ids)), 'max id', hex(max(ids)))
    runs = []
    s = prev = None
    for i in ids:
        if s is None:
            s = prev = i
            continue
        if i == prev + 1:
            prev = i
        else:
            runs.append((s, prev))
            s = prev = i
    runs.append((s, prev))
    print('ranges:', [(hex(a), hex(b), b - a + 1) for a, b in runs])
    out = r'F:\sanguo\export\script'
    os.makedirs(out, exist_ok=True)
    json.dump({str(k): v for k, v in res.items()}, open(os.path.join(out, 'syscall_table.json'), 'w'), indent=0)
    for i in ids:
        print(hex(i), hex(res[i]))
