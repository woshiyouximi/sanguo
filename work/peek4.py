import json,sys
sys.stdout.reconfigure(encoding="utf-8")
t=json.load(open(r"F:\sanguo\extract\json\things.json",encoding="utf-8"))
obs=t["objects"]
for want in (1,31,32,64,95,96,99,100,101,220,221,254,255,262,263,267,268,620):
    o=next((x for x in obs if x["obj"]==want),None)
    print(want, "->", (o["name"], o["sequence"], o["category"], o["section_index"]) if o else None)
print("last:", obs[-1]["obj"], obs[-1]["name"])
print("bands:", t["counts"]["by_band"])
