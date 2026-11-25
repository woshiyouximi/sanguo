# -*- coding: utf-8 -*-
"""查看几个效果函数体内 PUSHS/PUSHI 的地址（做证据引用）。"""
import sys, struct
sys.path.insert(0, r'F:\sanguo\tools')
import smartscript as SS

so = SS.SOFile(r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO')
d = so.data
OPS = SS.OPS
byoff = {f['off']: f for f in so.funcs}
offs = sorted(f['off'] for f in so.funcs if f['off'] < so.code_end)


def nxt(off):
    import bisect
    i = bisect.bisect_right(offs, off)
    return offs[i] if i < len(offs) else so.code_end


def dump(name, limit=40):
    fs = [f for f in so.funcs if f['name'] == name and f['off'] < so.code_end]
    for f in fs:
        print('=== %s @0x%X argc=%d ===' % (name, f['off'], f['argc']))
        pc = f['off']
        end = nxt(pc)
        n = 0
        while pc + 4 <= end and n < limit:
            op = struct.unpack_from('<i', d, pc)[0]
            if op not in OPS:
                pc += 4
                continue
            nm, kinds, _ = OPS[op]
            sz = 4 + 4 * (2 if kinds in ('YF', 'CO') else (1 if kinds else 0))
            extra = ''
            if nm == 'PUSHS':
                idx = struct.unpack_from('<i', d, pc + 4)[0]
                extra = '"%s"' % (so.names[idx] if 0 <= idx < len(so.names) else '?')
            elif nm == 'PUSHI':
                extra = str(struct.unpack_from('<i', d, pc + 4)[0])
            elif nm == 'CALL':
                t = struct.unpack_from('<i', d, pc + 4)[0]
                extra = byoff[t]['name'] if t in byoff else '0x%X' % t
            elif nm == 'SYSCALL':
                a, b = struct.unpack_from('<2i', d, pc + 4)
                extra = '0x%X argc=%d' % (a, b & 0xffff)
            print('  %06X %-8s %s' % (pc, nm, extra))
            pc += sz
            n += 1


for nm in ('Heal', 'Spout', 'BigThunder'):
    dump(nm)
