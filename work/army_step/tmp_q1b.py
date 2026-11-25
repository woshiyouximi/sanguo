import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
for a,sz,mn,ops,kind,mem,imm,tgt in ins:
    if not (0x43A000<=a<0x445600): continue
    if not mem: continue
    for base,index,disp,scale in mem:
        if 0x94<=disp<=0xB0 and base not in ("ebp","esp"):
            print("0x%06X %-6s %s"%(a,mn,ops)); break
