import json
import collections

p = r"F:\sanguo\game\cocos\assets\bundles\res\anim\general\index.json"
d = json.load(open(p, encoding="utf8"))
print("pages:", (list(d["pages"].keys())))
print("frames:", d["meta"].get("frames"))
groups = d["groups"]
print("n groups:", len(groups))
kinds = collections.Counter()
for k in groups:
    parts = k.split(":")
    kinds[parts[0][0] + " / " + (parts[1] if len(parts) > 1 else "?")] += 1
for k, v in sorted(kinds.items()):
    print("  ", k, v)
print("--- 样本键 ---")
sample = [k for k in groups if k.startswith("L5")][:40]
print(sample)
print("--- H / W 键 ---")
print([k for k in groups if k.startswith("H900")][:20])
print([k for k in groups if k.startswith("W700")][:20])
print("--- actions 样本 ---")
acts = d.get("actions", {})
for k in list(acts.keys())[:8]:
    print("  ", k, acts[k])
print("resolve:", d["meta"].get("resolve") if isinstance(d["meta"], dict) else None)
