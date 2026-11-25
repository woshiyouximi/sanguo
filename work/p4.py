# -*- coding: utf-8 -*-
import sys, os, re, collections
sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile
PAK = r"F:\sanguo\extract\pak"
ini = IniFile.load(os.path.join(PAK,"THINGS.INI"))
objs = ini.all("OBJECT")
ANIM = ["First","Wait","Walk","Attack","Attack2","Attack3","Attack4","Attack5","Attack6","Attack7","Attack8",
        "Spell1","Spell2","Shot1","Shot2","Shot3","Defense","Pain","Death","Win","Lose","Life"]
kind = collections.Counter(); tokprefix = collections.Counter(); bang = []
allsyms = collections.Counter()
frame_len = collections.Counter()
for i,s in enumerate(objs,1):
    for key in ANIM:
        for v in s.getall(key):
            for t in [x.strip() for x in v.split(",") if x.strip()]:
                if t.startswith("#"): kind["#delay"]+=1; tokprefix["#"+str(len(t)-1)]+=1
                elif t.startswith("@"): kind["@action"]+=1; allsyms[t]+=1
                elif t.startswith("$"): kind["$sound"]+=1; allsyms[t]+=1
                elif t.startswith("!"):
                    kind["!script"]+=1; bang.append((i,key,t,s.get("Name")))
                elif t in ("SCROVER","NULSHAPE"): kind["kw:"+t]+=1; allsyms[t]+=1
                else:
                    kind["shape"]+=1
                    m=re.match(r"^([A-Za-z]+)(.*)$",t)
                    if m: tokprefix[m.group(1)[:4]]+=1
print("token kinds:",dict(kind))
print("bang count:",len(bang))
for b in bang[:40]: print("   ",b)
print("symbols(@/$/kw):")
for k,c in allsyms.most_common(40): print(f"   {k:20s} {c}")
print("shape letter-prefix (first4):",tokprefix.most_common(30))
