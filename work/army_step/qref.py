import json,collections
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
c=collections.defaultdict(list)
for r in ins:
    for m in r[5]:
        base,index,disp,scale=m
        if 0x48e000 <= disp <= 0x48f400 and base==0:
            c[disp].append(hex(r[0]))
for d in sorted(c):
    print(hex(d), len(c[d]), c[d][:6])
