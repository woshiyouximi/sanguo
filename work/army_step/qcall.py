import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
idx={r[0]:i for i,r in enumerate(ins)}
res=[]
for i,r in enumerate(ins):
    if r[2]=="call" and r[3]=="0x43aded":
        back=[]
        j=i-1
        while len(back)<3 and j>=0:
            p=ins[j]
            if p[2]=="push":
                back.append(p[3])
                if len(back)==3: break
            elif p[2] in ("add","pop","call","mov"):
                pass
            j-=1
        res.append((hex(r[0]),back))
for a,b in res: print(a,b)
print("total",len(res))
