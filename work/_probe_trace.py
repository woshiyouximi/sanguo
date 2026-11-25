# -*- coding: utf-8 -*-
"""Phase-trace of MAGIC.SO effect functions: dir loads, spawns, waits, calls, loops."""
import re

PATH = r"F:\sanguo\export\script\magic_so.dis.txt"
EVID = r"F:\sanguo\work\dis_magicmap_skills.txt"

spawn = {}
for line in open(EVID, encoding="utf-8"):
    m = re.match(r"\s+0x([0-9A-Fa-f]+)\s+(\d{5})\s+->", line)
    if m:
        addr = int(m.group(1), 16)
        tid = int(m.group(2))
        spawn[addr] = (tid, "%03d" % ((tid - 10000) // 1000), (tid - 10000) % 1000)

FUNCS = ["Interceptor", "CreateInterceptor", "Sparkle", "CreateSparkle", "FinalX1",
         "RunningBow", "CreateBow", "Slash", "CreateSlash", "Tornado", "CreateDummyRef",
         "FireRing", "CreateFireRing", "FireRingMotion", "Ice", "CreateIce",
         "CreateFogSpeed", "FireCow", "CreateFireCow", "HalfMoonNew", "CreateHalfMoonNew",
         "TwisterSword", "CreateTwisterSword", "FirePillar", "CreateFirePillar",
         "DemonDancing", "CreateLastAttack", "FinalX2"]

hdr = re.compile(r"^; func #(\d+)\s+(\S+)\s+id=(\S+)\s+argc=(\d+)\s+@(0x[0-9A-Fa-f]+)")
cur = None
body = {}
for ln in open(PATH, encoding="utf-8", errors="replace"):
    m = hdr.match(ln)
    if m:
        cur = m.group(2)
        body.setdefault(cur, []).append(("HDR", ln.strip()))
        continue
    if ln.startswith("; ---"):
        continue
    if cur and ln.strip():
        body[cur].append(("OP", ln.rstrip("\n")))

for fn in FUNCS:
    ops = body.get(fn)
    if not ops:
        print("### %s NOT FOUND" % fn)
        continue
    print("=" * 78)
    print(ops[0][1].lstrip("; ").strip(), " ops=%d" % (len(ops) - 1))
    pending = None
    for kind, ln in ops[1:]:
        parts = ln.split(None, 3)
        if len(parts) < 3:
            continue
        addr = int(parts[0], 16)
        op = parts[2]
        rest = (parts[3] if len(parts) > 3 else "").split(";")[0].strip()
        if op == "PUSHS":
            if "magic\\" in ln:
                print("  load  magic\\%s\\*" % ln.split("magic\\")[1].split("\\")[0])
            continue
        if op == "PUSHI":
            pending = rest
            continue
        if op == "WAIT":
            print("  %s WAIT %s" % (parts[0], pending if pending else "?"))
            continue
        if op == "SYSCALL":
            sc = rest.split(",")[0].strip()
            if addr in spawn:
                tid, d, k = spawn[addr]
                print("  %s spawn dir %s #%d (ThingID %d)" % (parts[0], d, k, tid))
            elif sc in ("0x11", "0x120", "0x121", "0x300"):
                print("  %s syscall %s" % (parts[0], sc))
            continue
        if op == "CALL":
            print("  %s call  %s" % (parts[0], rest))
            continue
        if op in ("LOOP", "ENDFOR", "FOR"):
            print("  %s %s" % (parts[0], op))
            continue
