# -*- coding: utf-8 -*-
import sys, collections, os
sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile
P=r"F:\sanguo\extract\pak"
ti = IniFile.load(os.path.join(P,"TIMES1.INI"))
for name in ("SYSTEM",):
    s=ti.get(name); print(f"[{s.name}] L{s.lineno}"); 
    for k,v,ln in s.fields: print(f"   {k} = {v}")
for pfx in ("KING01","CITY01","CITY02","PATH001","PATH002"):
    s=ti.get(pfx)
    print(f"--- [{s.name}] L{s.lineno} keys={len(s.fields)}")
    for k,v,ln in s.fields: print(f"   L{ln:5d} {k:14s} = {v}")
# field signature per section type
for pfx in ("KING","CITY","PATH","GENERAL"):
    sig=collections.Counter()
    for s in ti.sections:
        if s.name.upper().startswith(pfx):
            sig[tuple(sorted(k for k,v,ln in s.fields))]+=1
    print(f"### {pfx} signatures:", len(sig))
    for k,c in sig.most_common(4): print("   ",c,"keys:",k)
# all field names across general sections
allk=collections.Counter()
for s in ti.all("GENERAL"):
    for k,v,ln in s.fields: allk[k]+=1
print("GENERAL keys:", allk.most_common())
