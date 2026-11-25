# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile, read_text, write_text
PAK = r"F:\sanguo\extract\pak"
W = r"F:\sanguo\work"

# ---- COMBINE ----
txt, enc = read_text(os.path.join(PAK,"COMBINE.INI"))
out=[]
out.append(f"### COMBINE.INI enc={enc} bytes={os.path.getsize(os.path.join(PAK,'COMBINE.INI'))}")
for i,line in enumerate(txt.splitlines(),1):
    out.append(f"L{i:3d} |{line.rstrip()}|  len={len(line)}")
ci = IniFile.load(os.path.join(PAK,"COMBINE.INI"))
out.append("--- parsed")
for s in ci.sections:
    out.append(f"[{s.name}] #{s.index} L{s.lineno} fields={len(s.fields)}")
    for k,v,ln in s.fields:
        out.append(f"   L{ln:3d} {k} = {v}   getall={s.getall(k)}")
write_text(os.path.join(W,"d_combine.txt"), "\n".join(out))

# ---- MESSAGE ----
out=[]
mi = IniFile.load(os.path.join(PAK,"MESSAGE.INI"))
st = mi.stats(); out.append(str(st))
for s in mi.sections:
    out.append(f"[{s.name}] #{s.index} L{s.lineno} fields={len(s.fields)}")
    seen=set()
    for k,v,ln in s.fields:
        if k in seen: out.append(f"   (dup) L{ln} {k} = {v}")
        else:
            out.append(f"   L{ln:5d} {k} = {v}")
            seen.add(k)
write_text(os.path.join(W,"d_message.txt"), "\n".join(out))
print("ok")
