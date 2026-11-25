# -*- coding: utf-8 -*-
import sys, collections
sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile, write_text
mi = IniFile.load(r"F:\sanguo\extract\pak\MAGIC.INI")
mg = mi.all("MAGIC"); ws = mi.all("WISE")
print("MAGIC",len(mg),"WISE",len(ws))
out=[]
ks=set()
for s in mi.sections: ks.update(s.items.keys())
print("all keys:", sorted(ks))
print("--- MAGIC rows")
for i,s in enumerate(mg,1):
    out.append(f"{i:3d}|{s.lineno:5d}|" + "|".join(str(s.get(k,"")) for k in
        ["SEQUENCE","NAME","MP","POWER","ATTACK","SCRIPT","ATTRIB","TITLE","NOTE","ACTIVE"]))
print("\n".join(out[:60]))
print("--- WISE rows")
out2=[]
for i,s in enumerate(ws,1):
    out2.append(f"{i:3d}|{s.lineno:5d}|" + "|".join(str(s.get(k,"")) for k in
        ["SEQUENCE","NAME","Level","WiseLevel","Execute","ATTRIB","ACTIVE"]))
print("\n".join(out2[:40]))
for key in ["ATTRIB","TITLE","ACTIVE","Execute","Level","WiseLevel"]:
    c=collections.Counter(s.get(key) for s in mi.sections)
    print(f"### {key}:", c.most_common(30))
write_text(r"F:\sanguo\work\d_magic.txt", "\n".join(["### MAGIC"]+out+["","### WISE"]+out2))
