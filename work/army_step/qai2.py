import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
tgt={"0x4448b2","0x44493d","0x44497f"}
print("== AI cmd call sites ==")
for i,r in enumerate(ins):
    if r[2]=="call" and r[3] in tgt and 0x402ea5<=r[0]<0x403d10:
        print("---- at",hex(r[0]),r[3])
        for p in ins[max(0,i-10):i+1]:
            print("   ",hex(p[0]),p[2],p[3])
print("== writers of 0x4b041c / 0x4a8adc ==")
for r in ins:
    if r[2] in ("mov","or","and","add","sub") and r[3].split(",")[0].find("ptr [")>=0:
        for m in r[5]:
            if m[2] in (0x4b041c,0x4a8adc): print(hex(r[0]),r[2],r[3])
