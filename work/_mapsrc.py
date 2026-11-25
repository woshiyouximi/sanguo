import json
p = r"F:\sanguo\game\cocos\temp\programming\packer-driver\targets\preview\chunks\5b\5bda65b40e7b771dec9f876a6a93c93313b12a1a.js.map"
m = json.load(open(p, "r", encoding="utf-8"))
print("keys:", list(m.keys()))
print("sources:", m.get("sources"))
sc = m.get("sourcesContent") or []
print("sourcesContent count:", len(sc))
for i, s in enumerate(sc):
    print(i, m["sources"][i], "len", len(s) if s else 0)
