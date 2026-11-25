import json,sys,os
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0,r"F:\sanguo\tools")
from parse_ini import IniFile
tot={}
for i in range(1,6):
    ini=IniFile.load(rf"F:\sanguo\extract\pak\TIMES{i}.INI")
    gs=[s for s in ini.sections if s.name.upper()=="GENERAL"]
    m={}
    for s in gs:
        m.setdefault(s.get("NAME"),[]).append(len(s.getall("WISESKILL")))
    tot[i]=m
    print(f"T{i}: generals={len(gs)} wise_rows={sum(sum(v) for v in m.values())}")
names=list(tot[1])
un=sum(max(len(tot[i].get(n,[0])) for i in range(1,6)) for n in names)
s1=sum(tot[1][n][0] for n in names)
print("per-file rows:", s1)
# union by pairwise value
def rows(i,n):
    ini=None
    return tot[i][n]
import itertools
u=0
for n in names:
    sets=[set() for _ in range(5)]
    u+=max(tot[i][n][0] for i in range(1,6))
print("max-over-files total:", u)
# how many generals differ in wise row count across files?
diff=[n for n in names if len(set(tot[i][n][0] for i in range(1,6)))>1]
print("generals with differing wise counts:", len(diff), diff[:10])
for n in diff[:3]:
    print(" ",n,[tot[i][n][0] for i in range(1,6)])
