# -*- coding: utf-8 -*-
"""Slice helper over work/orig_numbers/text_dis.tsv (columns: va, bytes, mn, op, target).

Usage:
  python dis.py range 0x43D5BF 0x43D640      # linear slice [start,end)
  python dis.py func  0x43D5BF               # from start until a ret that closes depth 0
  python dis.py callers 0x43D5BF             # all call/jmp sites whose target column == addr
  python dis.py grep OPREGEX                 # regex over "mn op"
"""
import re
import sys

TSV = r"F:\sanguo\work\orig_numbers\text_dis.tsv"

ROWS = []
for ln in open(TSV, encoding="utf-8"):
    p = ln.rstrip("\n").split("\t")
    if len(p) >= 5:
        ROWS.append((int(p[0], 16), p[1], p[2], p[3], p[4]))

BY = {r[0]: i for i, r in enumerate(ROWS)}


def fmt(r, mark=False):
    va, by, mn, op, tg = r
    s = "%s %08X  %-8s %-34s" % (">>" if mark else "  ", va, mn, op)
    if tg and tg.startswith("0x"):
        s += "  -> " + tg
    return s


def range_(start, end, mark=None):
    out = []
    for r in ROWS:
        if start <= r[0] < end:
            out.append(fmt(r, r[0] == mark))
    print("\n".join(out))


def func(start):
    i = BY.get(start)
    if i is None:
        print("(no insn at %X)" % start)
        return
    depth = 0
    for r in ROWS[i:]:
        print(fmt(r))
        mn, op = r[2], r[3]
        if mn == "ret":
            if depth == 0:
                break
            depth -= 1
        elif mn == "jmp" and not op.startswith(("dword", "eax", "ecx", "edx", "ebx", "esi", "edi")):
            # unconditional tail jump: end of function body
            break


def callers(tgt):
    s = "0x%X" % tgt
    for r in ROWS:
        if r[4].lower() == s.lower():
            print("%08X  %-8s %-34s" % (r[0], r[2], r[3]))


def grepm(pat):
    rx = re.compile(pat)
    for r in ROWS:
        if rx.search(r[2] + " " + r[3]):
            print(fmt(r))


def markers(start, end):
    """Print prologue (push ebp), ret, and calls in [start,end) to map function bodies."""
    for r in ROWS:
        if not (start <= r[0] < end):
            continue
        va, by, mn, op, tg = r
        if mn == "push" and op == "ebp":
            print("%08X  <== prologue" % va)
        elif mn == "ret":
            print("%08X  ret" % va)
        elif mn in ("call", "jmp") and tg and tg.startswith("0x"):
            print("%08X  %-5s %s" % (va, mn, tg))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "range":
        range_(int(sys.argv[2], 16), int(sys.argv[3], 16))
    elif cmd == "func":
        func(int(sys.argv[2], 16))
    elif cmd == "callers":
        callers(int(sys.argv[2], 16))
    elif cmd == "grep":
        grepm(sys.argv[2])
    elif cmd == "markers":
        markers(int(sys.argv[2], 16), int(sys.argv[3], 16))
