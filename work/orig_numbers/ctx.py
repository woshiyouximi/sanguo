# -*- coding: utf-8 -*-
"""ctx(va, back, fwd) -> print linear-disassembly window with jump targets."""
import q


def ctx(va, back=20, fwd=8):
    i = q.idx(va)
    if i is None:
        print('(no insn at %X)' % va)
        return
    for r in q.ROWS[max(0, i - back):i + fwd]:
        mark = '>>' if r[0] == va else '  '
        tg = ('  --> ' + r[4]) if r[4] else ''
        print('%s %08X  %-8s %-34s%s' % (mark, r[0], r[2], r[3], tg))
