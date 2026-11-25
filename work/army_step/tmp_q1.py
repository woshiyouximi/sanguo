import json,sys
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
print("total",len(ins))
out=[]
for a,sz,mn,ops,kind,mem,imm,tgt in ins:
    if not mem: continue
    for base,index,disp,scale in mem:
        if 0x94<=disp<=0xB4 and mn in ("mov","and","or"):
            out.append("0x%06X %-6s %s"%(a,mn,ops))
            break
print(len(out))
open(r"F:\sanguo\work\orig_battle_behavior\09_writes_cmdarray.txt","w",encoding="utf-8").write("\n".join(out))
for l in out[:80]: print(l)
