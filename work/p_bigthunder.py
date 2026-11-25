# -*- coding: utf-8 -*-
import sys, struct, bisect
sys.path.insert(0, r'F:\sanguo\tools')
import smartscript as SS
so = SS.SOFile(r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO')
d = so.data; OPS = SS.OPS
offs = sorted(f['off'] for f in so.funcs if f['off'] < so.code_end)
byoff = {f['off']: f for f in so.funcs}


def body(off, maxn=400):
    i = bisect.bisect_right(offs, off)
    end = offs[i] if i < len(offs) else so.code_end
    pc = off
    seq = []
    while pc + 4 <= end and len(seq) < maxn:
        op = struct.unpack_from('<i', d, pc)[0]
        if op not in OPS:
            pc += 4; continue
        nm, kinds, _ = OPS[op]
        sz = 4 + 4 * (2 if kinds in ('YF', 'CO') else (1 if kinds else 0))
        arg = None
        if nm in ('PUSHS',):
            v = struct.unpack_from('<i', d, pc + 4)[0]
            arg = 'STR[%d]=%s' % (v, so.names[v])
        elif nm == 'PUSHI':
            arg = struct.unpack_from('<i', d, pc + 4)[0]
        elif nm == 'CALL':
            t = struct.unpack_from('<i', d, pc + 4)[0]
            arg = byoff[t]['name'] if t in byoff else hex(t)
        elif nm == 'SYSCALL':
            a, b = struct.unpack_from('<2i', d, pc + 4)
            arg = 'sc0x%X argc=%d' % (a, b & 0xffff)
        seq.append((pc, nm, arg))
        pc += sz
    return seq, end


seq, end = body(0x96F8)
print('BigThunder 0x96F8..0x%X 指令数=%d' % (end, len(seq)))
for pc, nm, arg in seq:
    print('  %06X %-8s %s' % (pc, nm, arg))
