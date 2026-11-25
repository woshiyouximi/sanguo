# -*- coding: utf-8 -*-
import sys, struct, bisect
sys.path.insert(0, r'F:\sanguo\tools')
import smartscript as SS
so = SS.SOFile(r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO')
d = so.data; OPS = SS.OPS
offs = sorted(f['off'] for f in so.funcs if f['off'] < so.code_end)
byoff = {f['off']: f for f in so.funcs}
byname = {}
for f in so.funcs:
    if f['off'] < so.code_end:
        byname.setdefault(f['name'], []).append(f)


def body(f, maxn=200):
    off = f['off']
    i = bisect.bisect_right(offs, off)
    end = offs[i] if i < len(offs) else so.code_end
    pc = off; seq = []
    while pc + 4 <= end and len(seq) < maxn:
        op = struct.unpack_from('<i', d, pc)[0]
        if op not in OPS:
            pc += 4; continue
        nm, kinds, _ = OPS[op]
        sz = 4 + 4 * (2 if kinds in ('YF', 'CO') else (1 if kinds else 0))
        arg = None
        if nm == 'PUSHS':
            v = struct.unpack_from('<i', d, pc + 4)[0]; arg = 'STR=%s' % so.names[v]
        elif nm == 'PUSHI':
            arg = struct.unpack_from('<i', d, pc + 4)[0]
        elif nm == 'CALL':
            t = struct.unpack_from('<i', d, pc + 4)[0]; arg = byoff[t]['name'] if t in byoff else hex(t)
        elif nm == 'SYSCALL':
            a, b = struct.unpack_from('<2i', d, pc + 4); arg = 'sc0x%X argc=%d' % (a, b & 0xffff)
        seq.append((pc, nm, arg)); pc += sz
    return seq, end


for nm in ('LockTargetTime3', 'LockTargetTime2'):
    for f in byname.get(nm, []):
        seq, end = body(f)
        print('=== %s @0x%X argc=%d  0x%X..0x%X 指令 %d ===' % (nm, f['off'], f['argc'], f['off'], end, len(seq)))
        for pc, o, a in seq:
            print('  %06X %-8s %s' % (pc, o, a))
