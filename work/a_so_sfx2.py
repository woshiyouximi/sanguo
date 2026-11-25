# -*- coding: utf-8 -*-
"""Map every sound-like string in MAGIC.SO / SYSTEM.SO to the syscall site that plays it.

Syscalls: 0x300 -> host 0x420B26 (positional, takes object), 0x301 -> host 0x420B77 (ui/flat).
Strategy: linear decode; when PUSHS emits a sound-like name, remember (pc, idx, name);
when a SYSCALL 0x300/0x301 is met, attribute the most recent pending PUSHS name(s).
"""
import io, re, struct, sys
sys.path.insert(0, r'F:\sanguo\tools')
from smartscript import SOFile, OPS

SOUNDISH = re.compile(r'^(m\d{3}snd\d{2}|m\d{3}a|hit\d{2}|defense\d?|death\d?|horse\d{2}|att\d{2}|yell\d{2}|bg\d{2}a|rush\d{2}|victory|success|failure\d?|flaysword|arrow|accept|silence)$', re.I)


def scan(path):
    so = SOFile(path)
    d = so.data
    cur = None
    pend = []
    out = []
    pc = so.code_start
    while pc + 4 <= so.code_end:
        op = struct.unpack_from('<i', d, pc)[0]
        if op not in OPS:
            pc += 4
            continue
        if pc in so.by_off:
            cur = so.by_off[pc]['name']
        if op == 0x07:
            idx = struct.unpack_from('<i', d, pc + 4)[0]
            nm = so.names[idx] if 0 <= idx < len(so.names) else '?'
            if SOUNDISH.match(nm):
                pend.append((pc, nm))
            pc += 8
            continue
        if op == 0x05:
            sid, flags = struct.unpack_from('<2i', d, pc + 4)
            if sid in (0x300, 0x301):
                argc = flags & 0xffff
                names = [nm for _, nm in pend[-max(argc, 1):]]
                out.append((pc, sid, cur, names))
            pend = []
            pc += 12
            continue
        kinds = OPS[op][1]
        if kinds in ('YF', 'CO'):
            pc += 12
        elif kinds:
            pc += 8
        else:
            pc += 4
    return so, out


for tag, path in (('MAGIC', r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO'),
                  ('SYSTEM', r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO')):
    so, out = scan(path)
    print('### %s sites=%d' % (tag, len(out)))
    names = {}
    for pc, sid, fn, nm in out:
        print('%06X  syscall 0x%X  %-26s %s' % (pc, sid, fn, nm))
        for n in nm:
            names.setdefault(n.lower(), set()).add(fn or '?')
    print('# distinct names=%d' % len(names))
    for n in sorted(names):
        print('   %-12s <- %s' % (n, ','.join(sorted(names[n]))))
    print()
