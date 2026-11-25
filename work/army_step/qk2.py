import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
print("== stores to [reg+0x34] in 0x439000-0x43c000 ==")
for r in ins:
    if 0x439000<=r[0]<0x43c000 and r[2] in ("mov","and","or") and r[3].startswith("dword ptr ["):
        mems=r[5]
        if any(m[2]==0x34 for m in mems): print(hex(r[0]),r[2],r[3])
print("== stores to [reg+0x38] ==")
for r in ins:
    if 0x439000<=r[0]<0x43c000 and r[3].startswith("dword ptr ["):
        if any(m[2] in (0x38,0x30) for m in r[5]): print(hex(r[0]),r[2],r[3])
