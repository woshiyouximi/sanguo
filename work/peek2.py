import json,sys
sys.stdout.reconfigure(encoding="utf-8")
t=json.load(open(r"F:\sanguo\extract\json\things.json",encoding="utf-8"))
obs=t["objects"]
print("n objects:", len(obs))
for o in obs[:6]:
    print(o["no"], o["no_canonical"], o["section_index"], o["section"], o["sequence"], o["name"], "|", o["process"], "|", o["process_raw"])
print("---")
for o in obs:
    if o["sequence"] in (53,600):
        print(o["no"], o["no_canonical"], o["section_index"], o["section"], o["sequence"], o["name"], "|", o["process_raw"])
