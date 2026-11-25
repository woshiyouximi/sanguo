import json,struct
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
print("== writes to 0x4c6bc0..0x4c6be0 ==")
for r in ins:
    if r[2] in ("mov","add","sub","imul","or","and") and r[3].split(",")[0].find("ptr [")>=0:
        for m in r[5]:
            if 0x4c6bc0 <= m[2] <= 0x4c6be0: print(hex(r[0]),r[2],r[3])
print("== reads ==")
for r in ins:
    for m in r[5]:
        if 0x4c6bc0 <= m[2] <= 0x4c6be0 and r[3].split(",")[0].find("ptr [")<0:
            print(hex(r[0]),r[2],r[3])
