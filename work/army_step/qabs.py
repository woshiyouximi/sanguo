import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
res=[]
for r in ins:
    for m in r[5]:
        base,index,disp,scale=m
        if 0x4a8160 <= disp <= 0x4a8c00 and base==0:
            res.append((hex(r[0]),r[2],r[3]))
print(len(res))
for x in res: print(x)
