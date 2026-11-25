# -*- coding: utf-8 -*-
import sys, os, re, collections
sys.path.insert(0, r"F:\sanguo\extract\pak")
sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile, write_text
mi = IniFile.load(r"F:\sanguo\extract\pak\MESSAGE.INI")
s = mi.sections[0]
d = {k:(v,ln) for k,v,ln in s.fields}
blocks = collections.defaultdict(list)
for k,v,ln in s.fields:
    n=int(k[3:]); blocks[n//100].append((k,v))
for b in sorted(blocks):
    items=blocks[b]
    print(f"=== {b}00s  n={len(items)}")
    for k,v in items[:2]:
        print(f"    {k} = {v}")
    if len(items)>2:
        k,v=items[len(items)//2]; print(f"    ..{k} = {v}")
        k,v=items[-1]; print(f"    last {k} = {v}")
# tail-pattern stats
pat = collections.Counter()
for k,v,ln in s.fields:
    m=re.search(r"(%[kK]%%[leE]%)$", v)
    if m: pat[m.group(1)]+=1
    elif v: pat["OTHER:"+repr(v[-8:]) if len(v)>0 else "empty"]+=1
print("tail patterns:", pat.most_common(12))
# %S codes position
for k,v,ln in s.fields:
    if "%S1%" in v and k in ("MSG800","MSG812","MSG890"):
        print("S1 sample",k,v)
