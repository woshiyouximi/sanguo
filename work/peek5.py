import json,sys
from collections import Counter
sys.stdout.reconfigure(encoding="utf-8")
t=json.load(open(r"F:\sanguo\extract\json\things.json",encoding="utf-8"))
obs=t["objects"]
for want in (267,268,269,270,271,272,273,496,497,498,499,500,501,620):
    o=next((x for x in obs if x["obj"]==want),None)
    print(want,"->",(o["name"],o["sequence"],o["category"],o["dir_upper"],o["process"]) if o else None)
print("--- 500+ 分类:", Counter(x["category"] for x in obs if x["obj"] and x["obj"]>=500))
print("--- 100-499 分类:", Counter(x["category"] for x in obs if x["obj"] and 100<=x["obj"]<=499))
print("--- 001-099 分类:", Counter(x["category"] for x in obs if x["obj"] and x["obj"]<=99))
