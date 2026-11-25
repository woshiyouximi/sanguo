import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
for r in ins:
    if 0x4a8a60 in r[6]:
        d=r[3].split(",")[0]
        if "ptr [" in d and r[2].startswith("mov"):
            print(hex(r[0]), r[2], r[3], r[5])
