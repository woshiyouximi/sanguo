import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
out=[]
for a,sz,mn,ops,kind,mem,imm,tgt in ins:
    if mn not in ("mov","add","or","and","xor","sub","inc","dec","shl","shr"): continue
    d=ops.split(",")[0]
    if "ptr [" not in d: continue
    if not mem: continue
    base,index,disp,scale=mem[0]
    if disp==0x94 and base!=20:
        out.append((hex(a),mn,ops,[base,index,disp,scale]))
print(len(out))
for o in out: print(o)
