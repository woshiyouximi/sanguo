import json,sys
sys.stdout.reconfigure(encoding="utf-8")
G=json.load(open(r"F:\sanguo\data\generals.json",encoding="utf-8"))
def shape(v): return type(v).__name__+"(%d)"%len(v) if isinstance(v,list) else type(v).__name__
keys=["SKILL","WISESKILL","POS","BattleArray","Force","UseForce"]
stat={k:{} for k in keys}
for g in G:
    for k in keys:
        stat[k][shape(g.get(k))]=stat[k].get(shape(g.get(k)),0)+1
for k in keys: print("%-12s %s"%(k,stat[k]))
c=json.load(open(r"F:\sanguo\data\scenarios.json",encoding="utf-8"))[0]["cities"][0]
print("city",c["NAME"],"POS",c["POS"],"FLAGPOS",c["FLAGPOS"],"pos_xy",c["pos_xy"])
p=json.load(open(r"F:\sanguo\data\scenarios.json",encoding="utf-8"))[0]["paths"][0]
print("path Point->points", p.get("points")[:3], "has Point key:", "Point" in p)
print("曹操:",[ (k,json.load(open(r"F:\sanguo\data\generals.json",encoding="utf-8"))[[x["NAME"] for x in G].index("曹操")][k]) for k in ("SKILL","POS","BattleArray","Force","UseForce")][:5])
