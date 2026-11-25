import json
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
targets={"tbl878":0x48e878,"fn_allrush":0x444b0f,"fn_allwait":0x444acb,"ourArmy":0x4a8a60,"tbl_ed98":0x48ed98,"armyA":0x4a8160,"armyB":0x4a85c0}
for name,t in targets.items():
    hits=[(hex(r[0]),r[2],r[3]) for r in ins if t in r[6]]
    print(name,hex(t),len(hits))
    for h in hits[:10]: print("   ",h)
