import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
print("== refs to 0x4a79c8 ==")
for r in ins:
    for m in r[5]:
        if m[2]==0x4a79c8: print(hex(r[0]),r[2],r[3])
print("== callers 0x444385 ==")
for r in ins:
    if r[2]=="call" and r[3]=="0x444385": print(hex(r[0]))
print("== refs 0x4b03a0 ==")
for r in ins:
    if 0x4b03a0 in r[6]: print(hex(r[0]),r[2],r[3])
