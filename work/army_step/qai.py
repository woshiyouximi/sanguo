import json,collections
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
c=collections.Counter()
for r in ins:
    if 0x402ea5 <= r[0] < 0x403d10 and r[2]=="call":
        c[r[3]]+=1
for k,v in c.most_common(): print(k,v)
