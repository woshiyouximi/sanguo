# -*- coding: utf-8 -*-
"""Probe generals.json + hero assets + FACE pngs. Read-only."""
import json, os, sys, collections
from urllib.parse import quote

G = r"F:\sanguo\game\data\generals.json"
HERO = r"F:\sanguo\game\web\assets\hero"
FACE = r"F:\sanguo\export\png\SHAPE\FACE"

with open(G, "r", encoding="utf-8") as f:
    data = json.load(f)

print("json type:", type(data).__name__, "len:", len(data))
names = list(data.keys())
print("first 8 keys:", names[:8])
print("last 3 keys:", names[-3:])

# sample record
k = names[0]
print("\n--- sample record key:", k)
rec = data[k]
for kk in ("id", "SEQUENCE", "NAME", "FACE", "STR", "INT"):
    print("  ", kk, "=", repr(rec.get(kk)))

# FACE field stats
missing_face = [n for n in names if "FACE" not in data[n]]
print("\nrecords without FACE key:", len(missing_face))
vals = collections.Counter()
bad = []
nums = {}
for n, r in data.items():
    v = r.get("FACE")
    vals[repr(v)] += 1
    if not isinstance(v, str):
        bad.append((n, v)); continue
    p = v.replace("\\", "/").split("/")
    if len(p) != 2:
        bad.append((n, v)); continue
    nums[n] = p[1]
print("distinct FACE prefix values (top5):", vals.most_common(5))
print("unparseable FACE:", len(bad), bad[:10])

pref = collections.Counter("FACE\\" in (r.get("FACE") or "") for r in data.values())
print("prefix 'FACE\\' present:", pref)

fnum = collections.Counter(nums.values())
print("distinct FACE numbers:", len(fnum))
dup = {k2: c for k2, c in fnum.items() if c > 1}
print("FACE numbers shared by >1 general:", len(dup))
print("  sample dups:", list(dup.items())[:8])
missing_nums = [f"FACE{i:03d}" for i in range(1, 401) if f"FACE{i:03d}" not in fnum]
print("FACE001-400 never referenced:", len(missing_nums), missing_nums[:20])
print("max numeric:", max(int(v[4:]) for v in fnum if v[4:].isdigit()))

# pngs
pngs = sorted(os.listdir(FACE))
print("\nFACE png count:", len(pngs), "| first:", pngs[:2], "| last:", pngs[-2:])

# hero assets
hero_files = sorted(os.listdir(HERO))
print("\nhero file count:", len(hero_files))
exts = collections.Counter(os.path.splitext(x)[1].lower() for x in hero_files)
print("  extensions:", exts)
stems = {os.path.splitext(x)[0]: x for x in hero_files}
from urllib.parse import unquote
decoded = {}
collide = 0
for stem, fn in stems.items():
    d = unquote(stem)
    if d in decoded:
        collide += 1
    decoded[d] = fn
print("  decoded distinct names:", len(decoded), "| collisions:", collide)
print("  sample stems:", [s for s in list(stems)[:5]])
print("  sample decoded:", list(decoded)[:5])

gen_names = set(names)
hit = [n for n in names if n in decoded]
miss = [n for n in names if n not in decoded]
print("\ngenerals:", len(names), "| hero hit:", len(hit), "| hero miss:", len(miss))
print("  miss sample:", miss[:30])
extra = [d for d in decoded if d not in gen_names]
print("  hero files not matching any general:", len(extra))
print("  extra sample:", extra[:25])
