import json,sys
from collections import Counter
sys.stdout.reconfigure(encoding="utf-8")
for i in range(1,6):
    t=json.load(open(rf"F:\sanguo\extract\json\times{i}.json",encoding="utf-8"))
    ks=t["kings"]
    print("T%d"%i, "n=%d"%len(ks),
          "SELECT",dict(Counter(k["select"] for k in ks)),
          "Type",dict(Counter(k["type"] for k in ks)),
          "FLAGNUM range",min(k["flag_num"] for k in ks),max(k["flag_num"] for k in ks))
t=json.load(open(r"F:\sanguo\extract\json\times1.json",encoding="utf-8"))
print("T1 kings:", [(k["name"],k["flag_num"],k["select"],k["type"]) for k in t["kings"]])
print("T2 kings:", [(k["name"],k["flag_num"],k["select"],k["type"]) for k in json.load(open(r"F:\sanguo\extract\json\times2.json",encoding="utf-8"))["kings"]])
