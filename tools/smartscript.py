# -*- coding: utf-8 -*-
"""smartscript.py - Smart Script (.SO) bytecode disassembler for 三国群英传2 (Sango2.exe).

Usage:
  python smartscript.py <file.so> [-o out.txt] [--stats] [--limit N]

Encoding facts (Sango2.exe VAs; .SO file offsets):
  * dword opcode stream starting at header[0x14] (0x40).
  * opcode dispatch loop: 0x467F50, jump table 0x4A2A48, 0x5A (90) entries.
  * stack slots are 8 bytes {value:dword, type:dword}; type 0 = int/float, 2 = string.
  * CALL operand = absolute .SO file offset of the callee entry.
  * JMP/JZ/JNZ/CASE operands = absolute .SO file offsets.
  * string literals: PUSHS index selects header string table (relocated at load, 0x468060).
"""
import argparse
import json
import struct
from collections import Counter

# name, operand kinds, stack delta
#   I imm32  O code offset  S string index  X slot index  YF syscall id+flags  CO case value+offset
OPS = {
    0x00: ('NOP',      '',   0),
    0x01: ('RETV',     'I',  0),
    0x02: ('RET',      'I',  0),
    0x03: ('PUSHN',    'I',  0),   # delta = +n
    0x04: ('CALL',     'O',  0),
    0x05: ('SYSCALL',  'YF', 0),
    0x06: ('PUSHI',    'I',  1),
    0x07: ('PUSHS',    'S',  1),
    0x08: ('LDSL',     'X',  1),
    0x09: ('LDSG',     'X',  1),
    0x0A: ('LDG',      'I',  1),
    0x0B: ('STL',      'X', -1),
    0x0C: ('STG',      'X', -1),
    0x0D: ('STE',      'I', -1),
    0x0E: ('POP',      '',  -1),
    0x0F: ('ADD',      '',  -1),
    0x10: ('FADD',     '',  -1),
    0x11: ('OP11',     '',  -1),
    0x12: ('SUB',      '',  -1),
    0x13: ('FSUB',     '',  -1),
    0x14: ('MUL',      '',  -1),
    0x15: ('FMUL',     '',  -1),
    0x16: ('DIV',      '',  -1),
    0x17: ('FDIV',     '',  -1),
    0x18: ('MOD',      '',  -1),
    0x19: ('OP19',     '',  -1),
    0x1A: ('NEG',      '',   0),
    0x1B: ('FNEG',     '',   0),
    0x1C: ('NOT',      '',   0),
    0x1D: ('INCL',     'X',  0),
    0x1E: ('INCG',     'X',  0),
    0x1F: ('INCE',     'I',  0),
    0x20: ('DECL',     'X',  0),
    0x21: ('DECG',     'X',  0),
    0x22: ('DECE',     'I',  0),
    0x23: ('AND',      '',  -1),
    0x24: ('OR',       '',  -1),
    0x25: ('XOR',      '',  -1),
    0x26: ('EQ',       '',  -1),
    0x27: ('EQ',       '',  -1),
    0x28: ('STREQ',    '',  -1),
    0x29: ('NE',       '',  -1),
    0x2A: ('NE',       '',  -1),
    0x2B: ('STRNE',    '',  -1),
    0x2C: ('GT',       '',  -1),
    0x2D: ('FGT',      '',  -1),
    0x2E: ('STRGT',    '',  -1),
    0x2F: ('GE',       '',  -1),
    0x30: ('FGE',      '',  -1),
    0x31: ('STRGE',    '',  -1),
    0x32: ('LT',       '',  -1),
    0x33: ('FLT',      '',  -1),
    0x34: ('STRLT',    '',  -1),
    0x35: ('LE',       '',  -1),
    0x36: ('FLE',      '',  -1),
    0x37: ('STRLE',    '',  -1),
    0x38: ('LNOT',     '',   0),
    0x39: ('LAND',     '',  -1),
    0x3A: ('LOR',      '',  -1),
    0x3B: ('JMP',      'O',  0),
    0x3C: ('JZ',       'O', -1),
    0x3D: ('JNZ',      'O', -1),
    0x3E: ('SHL',      '',  -1),
    0x3F: ('SHR',      '',  -1),
    0x40: ('CASE',     'CO', -1),
    0x41: ('NOP',      '',   0),
    0x42: ('WAIT',     '',  -1),
    0x43: ('NOP',      '',   0),
    0x44: ('NOP',      '',   0),
    0x45: ('WAITFOR',  '',  -1),
    0x46: ('FINDVM',   '',  -1),
    0x47: ('CALLS',    '',  -5),
    0x48: ('I2F',      '',   0),
    0x49: ('I2S',      '',   0),
    0x4A: ('F2I',      '',   0),
    0x4B: ('F2S',      '',   0),
    0x4C: ('OP4C',     '',  -1),
    0x4D: ('OP4D',     '',  -1),
    0x4E: ('LDSLS',    'X',  0),
    0x4F: ('LDSGS',    'X',  0),
    0x50: ('LDGIDX',   'I',  0),
    0x51: ('STLIDX',   'I', -2),
    0x52: ('STGIDX',   'I', -2),
    0x53: ('STEIDX',   'I', -2),
    0x54: ('INCLIDX',  'I', -1),
    0x55: ('INCGIDX',  'I', -1),
    0x56: ('INCEIDX',  'I', -1),
    0x57: ('DECLIDX',  'I', -1),
    0x58: ('DECGIDX',  'I', -1),
    0x59: ('DECEIDX',  'I', -1),
}

SYSCALLS = {}


def load_syscalls(path):
    try:
        raw = json.load(open(path))
        for k, v in raw.items():
            SYSCALLS[int(k)] = v
    except Exception:
        pass


LOC_OPS = (0x08, 0x0B, 0x1D, 0x20, 0x4E, 0x51, 0x54, 0x57)
GLB_OPS = (0x09, 0x0C, 0x1E, 0x21, 0x4F, 0x52, 0x55, 0x58)


def slot_name(op, idx):
    if op in GLB_OPS:
        return 'g%d' % idx
    if op in LOC_OPS:
        return ('arg%d' % (-idx - 1)) if idx < 0 else ('loc%d' % idx)
    return str(idx)


class SOFile:
    def __init__(self, path):
        self.path = path
        self.data = open(path, 'rb').read()
        d = self.data
        if d[:12] != b'Smart Script':
            raise SystemExit('bad magic: %r' % d[:16])
        (self.ver, self.code_start, self.sym_off, self.sym_cnt,
         self.str_off, self.str_cnt) = struct.unpack_from('<6I', d, 0x10)
        self.marker, self.data_end = struct.unpack_from('<2I', d, 0x28)
        self.funcs = []
        for i in range(self.sym_cnt):
            off, argc, name_off, num = struct.unpack_from('<4I', d, self.sym_off + i * 16)
            e = d.find(b'\x00', name_off)
            self.funcs.append({'off': off, 'argc': argc, 'name_off': name_off,
                               'num': num, 'idx': i,
                               'name': d[name_off:e].decode('cp950', 'replace')})
        self.strtab = list(struct.unpack_from('<%dI' % self.str_cnt, d, self.str_off))
        self.names = []
        for o in self.strtab:
            e = d.find(b'\x00', o)
            self.names.append(d[o:e].decode('cp950', 'replace') if 0 <= o < len(d) else '?')
        self.by_off = {f['off']: f for f in self.funcs}
        self.code_end = min([o for o in self.strtab if self.code_start <= o < len(d)] or [self.sym_off])
        self.code_end = min(self.code_end, self.sym_off)


def disassemble(so, limit=None):
    data = so.data
    lines = []
    stats = Counter()
    unknown = 0
    total = 0
    targets = set()

    # pass 1: collect branch targets so labels can be emitted
    pc = so.code_start
    while pc + 4 <= so.code_end:
        op = struct.unpack_from('<i', data, pc)[0]
        if op not in OPS:
            pc += 4
            continue
        kinds = OPS[op][1]
        nops = 2 if kinds in ('YF', 'CO') else (1 if kinds else 0)
        if op in (0x3B, 0x3C, 0x3D):
            targets.add(struct.unpack_from('<i', data, pc + 4)[0])
        elif op == 0x40:
            targets.add(struct.unpack_from('<i', data, pc + 8)[0])
        pc += 4 + 4 * nops

    # pass 2: emit
    pc = so.code_start
    while pc + 4 <= so.code_end:
        if limit and total >= limit:
            break
        f = so.by_off.get(pc)
        if f:
            lines.append('')
            lines.append('; ------------------------------------------------------------')
            lines.append('; func #%-3d %-28s id=0x%X argc=%d  @0x%X'
                         % (f['idx'], f['name'], f['num'], f['argc'], pc))
            lines.append('; ------------------------------------------------------------')
        elif pc in targets:
            lines.append('L%05X:' % pc)
        op = struct.unpack_from('<i', data, pc)[0]
        total += 1
        if op not in OPS:
            lines.append('%06X  %08X  .dword  %-12d ; ??? not an opcode (data?)' % (pc, op & 0xffffffff, op))
            stats['???'] += 1
            unknown += 1
            pc += 4
            continue
        name, kinds, delta = OPS[op]
        stats[name] += 1
        p = pc + 4
        vals, comment = [], ''
        if kinds == 'I':
            v = struct.unpack_from('<i', data, p)[0]
            p += 4
            if op == 0x03:
                vals.append(str(v))
                delta = v
            elif op in (0x1F, 0x22, 0x0A, 0x0D):
                vals.append(str(v))
            else:
                vals.append(str(v))
        elif kinds == 'O':
            tgt = struct.unpack_from('<i', data, p)[0]
            p += 4
            tf = so.by_off.get(tgt)
            vals.append(('L%05X' % tgt) if op != 0x04 else (tf['name'] if tf else '0x%X' % tgt))
        elif kinds == 'YF':
            sid, flags = struct.unpack_from('<2i', data, p)
            p += 8
            argc, ret = flags & 0xffff, (flags >> 16) & 0xffff
            vals = ['0x%X' % sid, '0x%X' % (flags & 0xffffffff)]
            host = SYSCALLS.get(sid)
            comment = 'argc=%d ret=%d host=%s' % (argc, ret, ('0x%X' % host) if host else 'n/a')
            delta = -argc + (1 if ret else 0)
        elif kinds == 'S':
            sidx = struct.unpack_from('<i', data, p)[0]
            p += 4
            vals.append(str(sidx))
            comment = '"%s"' % (so.names[sidx] if 0 <= sidx < len(so.names) else '?')
        elif kinds == 'X':
            v = struct.unpack_from('<i', data, p)[0]
            p += 4
            vals.append(slot_name(op, v))
        elif kinds == 'CO':
            cv, tgt = struct.unpack_from('<2i', data, p)
            p += 8
            vals = ['%d' % cv, 'L%05X' % tgt]
        rawhex = data[pc:p].hex().upper()
        lines.append('%06X  %-12s %-9s %-30s ; %s' % (pc, rawhex, name, ', '.join(vals), comment))
        pc = p
    return lines, stats, unknown, total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sofile')
    ap.add_argument('-o', '--out')
    ap.add_argument('--syscalls', default=r'F:\sanguo\export\script\syscall_table.json')
    ap.add_argument('--limit', type=int)
    a = ap.parse_args()
    load_syscalls(a.syscalls)
    so = SOFile(a.sofile)
    lines, stats, unknown, total = disassemble(so, a.limit)
    print('%s: funcs=%d strings=%d code 0x%X..0x%X insns=%d unknown=%d (%.3f%%)' %
          (a.sofile, len(so.funcs), len(so.names), so.code_start, so.code_end,
           total, unknown, 100.0 * unknown / max(total, 1)))
    print('top ops:', ', '.join('%s=%d' % kv for kv in stats.most_common(20)))
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as fh:
            fh.write('; Smart Script disassembly of %s\n' % a.sofile)
            fh.write('; %d functions, %d string literals, code 0x%X..0x%X\n' %
                     (len(so.funcs), len(so.names), so.code_start, so.code_end))
            fh.write('\n'.join(lines))
            fh.write('\n')
        print('wrote', a.out)


if __name__ == '__main__':
    main()
