import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
for a,sz,mn,ops,kind,mem,imm,tgt in ins:
    hit=False
    if imm:
        for v in imm:
            if 0x48E800<=v<=0x48F000: hit=True
    if not hit and mem:
        for base,index,disp,scale in mem:
            if 0x48E800<=disp<=0x48F000: hit=True
    if hit: print("0x%06X %-6s %s"%(a,mn,ops))
