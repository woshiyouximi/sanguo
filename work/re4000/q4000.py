# -*- coding: utf-8 -*-
"""R160 只读考古：状态位 0x4000（撤退/溃退态）的置位点上下文、清除点、可见行为。

复用 work/re_speed/rs.py 的 PE 映射 + .text 全量指令索引。
所有产物用 utf-8 写盘（禁用 PowerShell 重定向，避免 GBK/BOM）。
"""
import contextlib
import io
import os
import sys

sys.path.insert(0, r"F:\sanguo\work\re_speed")
import rs  # noqa: E402

OUT = r"F:\sanguo\work\re4000"


def cap(va, n=40, title=None):
    b = io.StringIO()
    with contextlib.redirect_stdout(b):
        if title:
            print("=== %s ===" % title)
        rs.dis(va, n)
    return b.getvalue()


def cap_until_ret(va, maxn=400):
    """从 va 反汇编到第一个 ret（含），最多 maxn 条。"""
    o = rs.va2off(va)
    if o is None:
        return "bad va %08X\n" % va
    lines = []
    n = 0
    for ins in rs.md.disasm(rs.data[o:o + maxn * 16], va):
        note = ""
        for op in ins.operands:
            if op.type == 8 or op.type == 2:  # IMM
                s = rs._cstr(getattr(op, "imm", 0))
                if s:
                    note += '   ; "%s"' % s
        lines.append("  %08X  %-22s %-7s %-44s%s" % (
            ins.address, ins.bytes.hex(" "), ins.mnemonic, ins.op_str, note))
        n += 1
        if ins.mnemonic in ("ret", "retn") or n >= maxn:
            break
    return "\n".join(lines) + "\n"


def save(name, text):
    p = os.path.join(OUT, name)
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("  wrote %-34s %6d bytes" % (name, len(text)))


def xref(va):
    b = io.StringIO()
    with contextlib.redirect_stdout(b):
        print("callers/jmps of %08X:" % va)
        recs = [r for r in rs.I() if r[7] == va]
        if not recs:
            print("  (none)")
        for r in recs:
            print("  %08X  %-7s %s" % (r[0], r[2], r[3]))
    return b.getvalue()


def owners(va):
    """这个地址所在的函数（用 funcmap.tsv 的起点/长度）。"""
    import io as _io
    rows = []
    for r in _io.open(r"F:\sanguo\work\funcmap.tsv", encoding="utf-8").read().splitlines():
        p = r.split("\t")
        if len(p) < 2:
            continue
        rows.append((int(p[0], 16), int(p[1])))
    rows.sort()
    best = None
    for s, n in rows:
        if s <= va < s + n and (best is None or s > best[0]):
            best = (s, n)
    if best:
        return "%08X(sz=%d)+0x%X" % (best[0], best[1], va - best[0])
    return "?%08X" % va


def around(va, before=40, after=40):
    """打印 va 前后各 N 条指令（以 va 为锚，向上走 before 条）。"""
    # 用索引取最近 before 条
    recs = rs.I()
    idx = None
    for i, r in enumerate(recs):
        if r[0] >= va:
            idx = i
            break
    if idx is None:
        return ""
    lo = max(0, idx - before)
    hi = min(len(recs), idx + after)
    out = ["  ... context around %08X (%s) ..." % (va, owners(va))]
    for r in recs[lo:hi]:
        mark = " <<<" if r[0] == va else ""
        out.append("  %08X  %-7s %s%s" % (r[0], r[2], r[3], mark))
    return "\n".join(out) + "\n"


def find_imm(imm, mn=None, lo=0, hi=0xFFFFFFFF):
    out = []
    for r in rs.I():
        if mn and r[2] not in mn:
            continue
        if not (lo <= r[0] <= hi):
            continue
        if imm in r[6]:
            out.append(r)
    return out


def show(recs, limit=400):
    s = []
    for r in recs[:limit]:
        s.append("  %08X  %-7s %s" % (r[0], r[2], r[3]))
    if len(recs) > limit:
        s.append("  ... %d more" % (len(recs) - limit))
    return "\n".join(s) + "\n"


if __name__ == "__main__":
    print("index:", len(rs.I()), "insns")
    t = sys.argv[1] if len(sys.argv) > 1 else "help"
    if t == "x":
        print(cap(int(sys.argv[2], 16), int(sys.argv[3])))
    elif t == "c":
        print(xref(int(sys.argv[2], 16)))
    elif t == "a":
        print(around(int(sys.argv[2], 16), int(sys.argv[3]) if len(sys.argv) > 3 else 40))
    elif t == "i":
        print(show(find_imm(int(sys.argv[2], 16))))
    elif t == "own":
        print(owners(int(sys.argv[2], 16)))
