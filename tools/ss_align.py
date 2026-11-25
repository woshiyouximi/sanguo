# -*- coding: utf-8 -*-
"""Check per-function decode alignment."""
import struct, sys, collections
sys.path.insert(0, r'F:\sanguo\tools')
from ss_sweep import parse, OPS

def decode_func(b, start, limit):
    pc = start
    n = 0
    while pc + 4 <= limit:
        op = struct.unpack_from('<I', b, pc)[0]
        if op not in OPS:
            return pc, n, op
        name, nops = OPS[op]
        pc += 4 + 4*nops
        n += 1
        if op in (0x01, 0x02):
            return pc, n, op
    return pc, n, None

for path in [r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO', r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO']:
    b, syms, hdr = parse(path)
    syms_sorted = sorted(syms)
    limit = min(s[4] for s in syms)  # first name offset
    print(path, 'code limit', hex(limit))
    bad = 0
    for i, s in enumerate(syms_sorted):
        code = s[0]
        nxt = syms_sorted[i+1][0] if i+1 < len(syms_sorted) else limit
        end, n, last = decode_func(b, code, nxt if nxt > code else limit)
        if last not in (0x01, 0x02):
            bad += 1
            if bad <= 15:
                print('  BAD', s[2], hex(code), '->', hex(end), 'next', hex(nxt), 'last', last if last is None else hex(last), 'insns', n)
    print('  bad funcs', bad, '/', len(syms_sorted))
