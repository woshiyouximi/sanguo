# -*- coding: utf-8 -*-
"""Statistics + structural verification for Smart Script .SO files.

Computes per-function size, max operand-stack depth (abstract interpretation over
the CFG), opcode histogram, syscall histogram. Verifies function boundaries.
"""
import json
import struct
import sys
from collections import Counter, deque

sys.path.insert(0, r'F:\sanguo\tools')
from smartscript import SOFile, OPS, load_syscalls, SYSCALLS


def decode_function(so, start, end):
    """Linear decode a function body; returns {off: (op, size, delta, extra)}."""
    ins = {}
    pc = start
    data = so.data
    while pc + 4 <= end:
        op = struct.unpack_from('<i', data, pc)[0]
        if op not in OPS:
            pc += 4
            continue
        name, kinds, delta = OPS[op]
        nops = 2 if kinds in ('YF', 'CO') else (1 if kinds else 0)
        extra = ()
        if op == 0x03:
            delta = struct.unpack_from('<i', data, pc + 4)[0]
        elif op == 0x05:
            sid, flags = struct.unpack_from('<2i', data, pc + 4)
            argc, ret = flags & 0xffff, (flags >> 16) & 0xffff
            delta = -argc + (1 if ret else 0)
            extra = (sid, argc, ret)
        elif op == 0x40:
            extra = (struct.unpack_from('<i', data, pc + 4)[0],
                     struct.unpack_from('<i', data, pc + 8)[0])
        elif op in (0x04, 0x3B, 0x3C, 0x3D):
            extra = (struct.unpack_from('<i', data, pc + 4)[0],)
        ins[pc] = (op, 4 + 4 * nops, delta, extra)
        pc += 4 + 4 * nops
    return ins


def returns_value(ins):
    return any(v[0] == 0x01 for v in ins.values())


def max_depth(so, ins, entry, retval_map):
    """Abstract interpretation: track operand-stack depth per instruction."""
    depth = {entry: 0}
    maxd = 0
    work = deque([entry])
    seen_edges = set()
    while work:
        pc = work.popleft()
        if pc not in ins:
            continue
        op, size, delta, extra = ins[pc]
        d = depth.get(pc, 0)
        maxd = max(maxd, d)
        succ = []
        if op in (0x01, 0x02):
            pass
        elif op == 0x3B:
            succ.append((extra[0], d + delta))
        elif op in (0x3C, 0x3D):
            succ.append((extra[0], d + delta))
            succ.append((pc + size, d + delta))
        elif op == 0x40:
            succ.append((extra[1], d + delta))
            succ.append((pc + size, d))     # value pushed back on mismatch
        elif op == 0x04:
            tgt = extra[0]
            rf = retval_map.get(tgt, 0)
            argc = 0
            f = so.by_off.get(tgt)
            if f:
                argc = f['argc']
            succ.append((pc + size, d + 2 - argc + rf))
        else:
            succ.append((pc + size, d + delta))
        for nx, nd in succ:
            if nx is None:
                continue
            if nd > 400:
                continue
            if (pc, nx) in seen_edges:
                continue
            seen_edges.add((pc, nx))
            old = depth.get(nx)
            if old is None or nd > old:
                depth[nx] = nd
                work.append(nx)
    return maxd


def main(path):
    so = SOFile(path)
    load_syscalls(r'F:\sanguo\export\script\syscall_table.json')
    starts = sorted(f['off'] for f in so.funcs) + [so.code_end]
    allops = Counter()
    sysc = Counter()
    total_ins = 0
    unknown = 0
    funcs = []
    retval_map = {}
    decoded = {}
    for i, f in enumerate(so.funcs):
        end = starts[i + 1] if i + 1 < len(starts) else so.code_end
        ins = decode_function(so, f['off'], end)
        decoded[f['off']] = ins
        retval_map[f['off']] = 1 if returns_value(ins) else 0
    for i, f in enumerate(so.funcs):
        end = starts[i + 1] if i + 1 < len(starts) else so.code_end
        ins = decoded[f['off']]
        for pc, (op, size, delta, extra) in ins.items():
            allops[OPS[op][0]] += 1
            if op == 0x05:
                sysc[extra[0]] += 1
        total_ins += len(ins)
        md = max_depth(so, ins, f['off'], retval_map)
        funcs.append((f['name'], f['num'], f['argc'], md, len(ins), end - f['off']))
    print('== %s' % path)
    print('functions %d  instructions %d  code bytes %d' % (len(so.funcs), total_ins, so.code_end - 0x40))
    top = sorted(funcs, key=lambda x: -x[3])[:8]
    print('max stack depth: %d  (%s)' % (top[0][3], top[0][0]))
    print('deepest funcs:', ', '.join('%s:%d' % (x[0], x[3]) for x in top))
    print('opcodes used: %d/90' % len(allops))
    print('histogram:')
    for k, v in allops.most_common():
        print('   %-10s %6d  %5.2f%%' % (k, v, 100.0 * v / total_ins))
    print('syscalls: %d distinct, %d calls' % (len(sysc), sum(sysc.values())))
    print('top syscalls:', ', '.join('0x%X:%d' % kv for kv in sysc.most_common(30)))
    print('largest funcs:', ', '.join('%s:%d ins' % (x[0], x[4]) for x in sorted(funcs, key=lambda x: -x[4])[:8]))


if __name__ == '__main__':
    for p in sys.argv[1:]:
        main(p)
