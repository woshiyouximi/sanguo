# -*- coding: utf-8 -*-
import sys, os, collections
sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile
P=r"F:\sanguo\extract\pak"
data={}
for i in range(1,6):
    ti=IniFile.load(os.path.join(P,f"TIMES{i}.INI"))
    sysd={k:v for k,v,ln in ti.get("SYSTEM").fields}
    gens=ti.all("GENERAL")
    m={}
    for s in gens[1:]:
        m[s.get("NAME")]=(s.get("POS"),s.get("Status"),s.get("CITY"),s.get("Loyal"),s.get("STR"),s.get("INT"),s.get("FLAGS"))
    data[i]=(sysd,m)
    print(f"TIMES{i}: SYSTEM={sysd} generals={len(gens)}")
for nm in ("曹操","劉備","孫堅","董卓","呂布","張角"):
    print("###",nm)
    for i in range(1,6):
        pos,st,city,loy,st_,it,fl = data[i][1].get(nm,("?","?","?","?","?","?","?"))
        print(f"   T{i}: POS={pos!r} Status={st!r} CITY={city!r} Loyal={loy} STR={st_} INT={it} FLAGS={fl!r}")
# status distribution
for i in range(1,6):
    c=collections.Counter(v[1] for v in data[i][1].values())
    print(f"T{i} Status dist:", c.most_common(8))
