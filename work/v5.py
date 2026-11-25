import json,sys,os
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0,r"F:\sanguo\tools")
from parse_ini import IniFile
ini=IniFile.load(r"F:\sanguo\extract\pak\TIMES1.INI")
raw={}
for s in ini.sections:
    if s.name.upper()=="GENERAL":
        raw[s.get("NAME")]=(len(s.getall("SKILL")), len(s.getall("WISESKILL")), s.getall("WISESKILL"))
G=json.load(open(r"F:\sanguo\data\generals.json",encoding="utf-8"))
bad=[]
for g in G:
    n=g["NAME"]; a=(len(g["SKILL"]),len(g["WISESKILL"]))
    if n in raw and a!=raw[n][:2]: bad.append((n,a,raw[n][:2]))
print("mismatched generals:", len(bad))
for b in bad[:10]: print(" ", b[0], "data",b[1], "raw",b[2])
# inspect one
if bad:
    n=bad[0][0]
    g=[x for x in G if x["NAME"]==n][0]
    print(n,"data WISE:",g["WISESKILL"])
    print(n,"raw  WISE:",raw[n][2])
    print(n,"data SKILL:",g["SKILL"])
    print(n,"raw  SKILL:",[ (k,v) for k,v in ini.sections[0].items.items()] if False else "")
