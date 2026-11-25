# -*- coding: utf-8 -*-
import json, collections
G = r"F:\sanguo\game\data\generals.json"
with open(G, "r", encoding="utf-8") as f:
    data = json.load(f)
print("top type:", type(data).__name__, "len:", len(data))
print("elem0 type:", type(data[0]).__name__)
e = data[0]
if isinstance(e, dict):
    print("elem0 keys:", list(e.keys()))
    print(json.dumps(e, ensure_ascii=False)[:1200])
print("\nelem1 name-ish:", {k: data[1].get(k) for k in ("id","SEQUENCE","NAME","FACE")} if isinstance(data[1], dict) else data[1])
print("last elem:", json.dumps(data[-1], ensure_ascii=False)[:400])
# any dict-of-dict nested?
print("\ncount dict elems:", sum(isinstance(x, dict) for x in data))
