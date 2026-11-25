import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
T={0x444B0F:"allRush",0x444ACB:"allWait",0x4449A9:"frontFwd",0x444A35:"spread",0x444A80:"center",0x44554A:"retreat",0x444E36:"allBack",0x444CCF:"leftFwd",0x4447B7:"writer100"}
for a,sz,mn,ops,kind,mem,imm,tgt in ins:
    if tgt in T:
        print("0x%06X %-6s %-40s -> %s"%(a,mn,ops,T[tgt]))
