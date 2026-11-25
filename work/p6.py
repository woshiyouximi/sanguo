# -*- coding: utf-8 -*-
import sys, os, re, collections
sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile, write_text
PAK = r"F:\sanguo\extract\pak"; W=r"F:\sanguo\work"
mi = IniFile.load(os.path.join(PAK,"MESSAGE.INI"))
s = mi.sections[0]
keys = [k for k,v,ln in s.fields]
print("entries", len(keys))
num = [int(k[3:]) for k in keys if re.match(r"^MSG\d+$",k)]
print("key pattern ok:", len(num), "min",min(num),"max",max(num))
blocks = collections.Counter((n//100) for n in num)
print("hundred-blocks:", sorted(blocks.items()))
blocks10 = collections.Counter((n//10) for n in num)
print("ten-blocks:", sorted(blocks10.items()))
# gaps
missing=[]
for b in range(0,10):
    lo,hi=b*100,b*100+99
    have={n for n in num if lo<=n<=hi}
    if have:
        miss=[x for x in range(lo,hi+1) if x not in have]
        print(f"  {lo:03d}-{hi:03d}: have {len(have)}  missing {len(miss)}: {miss if len(miss)<40 else str(miss[:40])+'...'}")
# format codes
codes = collections.Counter()
for k,v,ln in s.fields:
    for m in re.finditer(r"%[A-Za-z%][0-9]?%?", v):
        codes[m.group(0)]+=1
print("format codes:", codes.most_common())
# quirks
q = [ (k,v) for k,v,ln in s.fields if v.endswith('"') ]
print("values ending with quote:", len(q), q[:5])
e = [ (k) for k,v,ln in s.fields if v=="" ]
print("empty values:", len(e), e)
bs = [(k,v) for k,v,ln in s.fields if v.startswith("\\n")]
print("leading \\n :", len(bs))
# dump full TSV
lines=["idx\tkey\tlineno\tlen\tvalue"]
for i,(k,v,ln) in enumerate(s.fields,1):
    lines.append(f"{i}\t{k}\t{ln}\t{len(v)}\t{v}")
write_text(os.path.join(W,"d_message.tsv"), "\n".join(lines))
