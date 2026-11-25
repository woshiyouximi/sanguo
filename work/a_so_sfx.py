# -*- coding: utf-8 -*-
"""Walk MAGIC.SO / SYSTEM.SO and list which function plays which sound (PUSHS + SYSCALL 0x301)."""
import io, json, struct, sys, os
sys.path.insert(0, r'F:\sanguo\tools')
from smartscript import SOFile, OPS

MAGIC = r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO'
SYSTEM = r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO'


def walk(path, want=0x301):
    so = SOFile(path)
    d = so.data
    # linear decode; track function starts
    starts = sorted(so.by_off)
    cur = None
    stack = []          # simulated pushed strings since last syscall
    out = {}
    pc = so.code_start
    guard = 0
    while pc + 4 <= so.code_end:
        guard += 1
        if guard > 200000:
            break
        op = struct.unpack_from('<i', d, pc)[0]
        if op not in OPS:
            pc += 4
            continue
        if pc in so.by_off:
            cur = so.by_off[pc]['name']
        kinds = OPS[op][1]
        if op == 0x07:  # PUSHS
            idx = struct.unpack_from('<i', d, pc + 4)[0]
            stack.append(so.names[idx] if 0 <= idx < len(so.names) else '?')
            pc += 8
            continue
        if op == 0x05:  # SYSCALL
            sid, flags = struct.unpack_from('<2i', d, pc + 4)
            argc = flags & 0xffff
            if sid == want:
                names = stack[-argc:] if argc <= len(stack) else stack[:]
                out.setdefault(cur or ('@%X' % pc), []).append(list(names))
            stack = []
            pc += 12
            continue
        if op == 0x06:  # PUSHI
            pc += 8
            continue
        if kinds in ('YF', 'CO'):
            pc += 12
        elif kinds:
            pc += 8
        else:
            pc += 4
    return so, out


for tag, path in (('MAGIC', MAGIC), ('SYSTEM', SYSTEM)):
    so, out = walk(path)
    print('### %s  funcs=%d strings=%d' % (tag, len(so.funcs), len(so.names)))
    nd = 0
    allnames = set()
    for fn in sorted(out):
        for args in out[fn]:
            nm = [a for a in args if isinstance(a, str) and ('.' not in a)]
            allnames.update(nm)
            print('%-28s %s' % (fn, args))
            nd += 1
    print('# %s sound-play sites=%d distinct=%d' % (tag, nd, len(allnames)))
    print()
