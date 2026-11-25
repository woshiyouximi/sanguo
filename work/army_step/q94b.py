import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
print(type(ins), len(ins))
print(ins[0])
for r in ins:
    if 0x43AE00 <= r[0] <= 0x43AE60: print(r)
