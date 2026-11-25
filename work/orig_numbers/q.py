# -*- coding: utf-8 -*-
"""Query helpers over the pre-built text_dis.tsv."""
import re, sys, collections

ROWS = []
for ln in open('text_dis.tsv', encoding='utf-8'):
    p = ln.rstrip('\n').split('\t')
    if len(p) == 5:
        ROWS.append((int(p[0], 16), p[1], p[2], p[3], p[4]))
BY = {r[0]: i for i, r in enumerate(ROWS)}


def idx(va):
    return BY.get(va)


def calls_to(tgt):
    return [r[0] for r in ROWS if r[4] == '0x%X' % tgt]


def around(va, back=6, fwd=14, mark=True):
    i = idx(va)
    if i is None:
        return ['(no insn at %X)' % va]
    out = []
    for r in ROWS[max(0, i - back):i + fwd]:
        m = '>>' if (mark and r[0] == va) else '  '
        out.append('%s %08X  %-30s %s' % (m, r[0], r[2] + ' ' + r[3], r[4]))
    return out


def grep(pat, field='op', limit=200):
    """field: op | mn | bytes | all"""
    rx = re.compile(pat)
    out = []
    for r in ROWS:
        s = {'op': r[3], 'mn': r[2], 'bytes': r[1], 'all': ' '.join(r[2:])}[field]
        if rx.search(s):
            out.append(r)
            if len(out) >= limit:
                break
    return out


def p(rows, n=200):
    for r in rows[:n]:
        print('%08X  %-32s %s' % (r[0], r[2] + ' ' + r[3], r[4]))


def funcs_calling(tgt):
    return calls_to(tgt)
