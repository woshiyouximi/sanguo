import json,sys
sys.stdout.reconfigure(encoding="utf-8")
s=json.load(open(r"F:\sanguo\extract\json\times5.json",encoding="utf-8"))
g=[x for x in s["generals"] if x["name"] in ("司馬昭","司馬師")]
for x in g: print(x["name"], x["pos"], x["city"], x["status"])
s=json.load(open(r"F:\sanguo\extract\json\summary.json",encoding="utf-8"))
print(json.dumps(s["cross_checks"]["city_pos_rule"]["rows"][4], ensure_ascii=False, indent=1)[:900])
