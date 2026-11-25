# -*- coding: utf-8 -*-
"""Extract per-skill FX evidence for the 29 multi-dir magics."""
import io, re, sys

SKILLS = [12, 27, 40, 43, 44, 46, 49, 51, 54, 62, 63, 70, 75, 76, 77, 85, 86, 88,
          89, 92, 95, 97, 100, 102, 103, 104, 108, 109, 110]

path = r"F:\sanguo\work\dis_magicmap_skills.txt"
txt = open(path, encoding="utf-8").read()
blocks = re.split(r"={70,}\n", txt)
want = {}
for b in blocks:
    m = re.match(r"#(\d+)\s", b)
    if not m:
        continue
    n = int(m.group(1))
    # SEQUENCE is likely index-1? print header line for check
    want[n] = b
for s in SKILLS:
    b = want.get(s)
    if b is None:
        print("missing", s)
        continue
    head = b.splitlines()[0]
    print("=" * 70)
    print("SKILL_INDEX", s, head)
    for line in b.splitlines()[1:]:
        if re.search(r"magic\\\d{3}|ThingID|PUSHS|PUSHI|目录|鍙揪|可达", line):
            print("   ", line)
