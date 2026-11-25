# -*- coding: utf-8 -*-
"""原型：解析 MAGIC.SO，把 MagicN 的代码走一遍，收集 PUSHS 字符串与 CALL。"""
import struct, sys, collections, json
sys.path.insert(0, r'F:\sanguo\tools')
import smartscript as SS

SO = r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO'
so = SS.SOFile(SO)
d = so.data
OPS = SS.OPS

func_of_off = {f['off']: f for f in so.funcs}
func_of_num = {}
for f in so.funcs:
    if f['num']:
        func_of_num[f['num']] = f

# 代码区域边界：每个 func 到下一个 func 起点（或 code_end）
offs = sorted(f['off'] for f in so.funcs)


def next_off(off):
    import bisect
    i = bisect.bisect_right(offs, off)
    return offs[i] if i < len(offs) else so.code_end


def walk(start, seen, out, depth=0):
    """从 start 起解码到 RET，返回 (strings, calls)。"""
    pc = start
    end = next_off(start)
    while pc + 4 <= end:
        op = struct.unpack_from('<i', d, pc)[0]
        if op not in OPS:
            pc += 4
            continue
        kinds = OPS[op][1]
        name = OPS[op][0]
        nops = 2 if kinds in ('YF', 'CO') else (1 if kinds else 0)
        if name == 'PUSHS':
            idx = struct.unpack_from('<i', d, pc + 4)[0]
            out['strings'].append(idx)
        elif name == 'CALL':
            tgt = struct.unpack_from('<i', d, pc + 4)[0]
            f = func_of_off.get(tgt)
            out['calls'].append((tgt, f['name'] if f else '0x%X' % tgt, f['num'] if f else 0))
        elif name in ('RET', 'RETV'):
            pc += 4
            return
        pc += 4 + 4 * nops
    return


def closure(f0):
    """返回可达的 (strings, calls) 及自身。"""
    strings, calls = [], []
    stack = [f0]
    seen = set()
    while stack:
        f = stack.pop()
        if f['off'] in seen:
            continue
        seen.add(f['off'])
        out = {'strings': [], 'calls': []}
        walk(f['off'], seen, out)
        strings += [(s, f['name']) for s in out['strings']]
        for tgt, nm, num in out['calls']:
            calls.append((f['name'], nm, num))
            g = func_of_off.get(tgt)
            if g and g['off'] not in seen:
                stack.append(g)
    return strings, calls, seen


if __name__ == '__main__':
    for n in (1, 2, 3, 4, 5, 6, 7, 8):
        f = func_of_num.get(500 + n)
        if not f:
            print('Magic%d 缺失' % n)
            continue
        strs, calls, seen = closure(f)
        shapes = sorted({so.names[s] for s, _ in strs if so.names[s].lower().startswith('magic\\')})
        print('Magic%-3d num=%d off=0x%X  strings=%d calls=%d funcs=%d' % (n, f['num'], f['off'], len(strs), len(calls), len(seen)))
        print('   shapes:', shapes[:6])
        print('   calls :', [c[1] for c in calls][:8])
