import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
hits=[]
for a,sz,mn,ops,kind,mem,imm,tgt in ins:
    if kind not in ("w","rw"): continue
    for m in mem:
        base,index,disp,scale=m
        if disp==0x94:
            hits.append((hex(a),mn,ops))
print(len(hits))
for h in hits[:80]: print(h)
