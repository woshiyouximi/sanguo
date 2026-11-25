# -*- coding: utf-8 -*-
"""把 SYSTEM.SO 的 39 个函数逐个打印成紧凑伪汇编（供 R79 语义分析用）。
输出：work/system_so/funcs.txt （UTF-8）
"""
import struct, sys, io
sys.path.insert(0, r'F:\sanguo\tools')
from smartscript import SOFile, OPS, slot_name, load_syscalls

SO = r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO'
so = SOFile(SO)
load_syscalls(r'F:\sanguo\export\script\syscall_table.json')

# 函数边界：按地址排序，下一函数起点或 code_end
funcs = sorted(so.funcs, key=lambda f: f['off'])
bounds = {}
for i, f in enumerate(funcs):
    end = funcs[i + 1]['off'] if i + 1 < len(funcs) else so.code_end
    bounds[f['off']] = end

out = io.StringIO()
def w(s=''):
    out.write(s + '\n')

for f in funcs:
    start, end = f['off'], bounds[f['off']]
    pc = start
    ins = []
    calls, strs, sysc = [], [], []
    while pc < end:
        op = struct.unpack_from('<i', so.data, pc)[0]
        if op not in OPS:
            ins.append('%06X  .dword %d' % (pc, op))
            pc += 4
            continue
        name, kinds, delta = OPS[op]
        p = pc + 4
        args = ''
        if kinds == 'I':
            v = struct.unpack_from('<i', so.data, p)[0]; p += 4
            args = str(v)
        elif kinds == 'O':
            t = struct.unpack_from('<i', so.data, p)[0]; p += 4
            tf = so.by_off.get(t)
            args = (tf['name'] if tf and op == 0x04 else 'L%05X' % t)
            if op == 0x04 and tf:
                calls.append(tf['name'])
        elif kinds == 'YF':
            sid, flags = struct.unpack_from('<2i', so.data, p); p += 8
            argc, ret = flags & 0xffff, (flags >> 16) & 0xffff
            args = '0x%X argc=%d ret=%d' % (sid, argc, ret)
            sysc.append('0x%X' % sid)
        elif kinds == 'S':
            sidx = struct.unpack_from('<i', so.data, p)[0]; p += 4
            s = so.names[sidx] if 0 <= sidx < len(so.names) else '?'
            args = '"%s"' % s
            strs.append(s)
        elif kinds == 'X':
            v = struct.unpack_from('<i', so.data, p)[0]; p += 4
            args = slot_name(op, v)
        elif kinds == 'CO':
            cv, t = struct.unpack_from('<2i', so.data, p)
            p += 8
            args = '%d, L%05X' % (cv, t)
        ins.append('%06X  %-8s %s' % (pc, name, args))
        pc = p
    w('=== #%d %s  argc=%d  @0x%X..0x%X  %dB  %d ins' %
      (f['idx'], f['name'], f['argc'], start, end, end - start, len(ins)))
    if calls:
        w('  CALLS: ' + ', '.join(dict.fromkeys(calls)))
    if sysc:
        w('  SYSCALLS: ' + ', '.join(sysc))
    if strs:
        w('  STRINGS: ' + ' | '.join(dict.fromkeys(strs)))
    for line in ins:
        w('    ' + line)
    w()

txt = out.getvalue()
open(r'F:\sanguo\work\system_so\funcs.txt', 'w', encoding='utf-8').write(txt)
print('wrote %d chars, %d funcs' % (len(txt), len(funcs)))
