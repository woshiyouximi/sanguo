import json
m = json.load(open(r"F:\sanguo\extract\json\magic.json", encoding="utf-8"))
w = [e for e in m["entries"] if e["kind"] == "wise"]
ex = sorted(e["execute"] for e in w)
print("execute sorted == range(1,68)?", ex == list(range(1, 68)))
print("first 10:", ex[:10], "last 10:", ex[-10:])
sc = sorted(e["sequence"] for e in w)
print("seq == 1..67?", sc == list(range(1, 68)))
# 是否 execute 与 sequence 有规律
print([(e["sequence"], e["execute"]) for e in w[:8]])
