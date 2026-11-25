# -*- coding: utf-8 -*-
import json
idx = json.load(open(r"F:\sanguo\game\web\assets\fx\index.json", encoding="utf-8"))
print("keys:", list(idx.keys()))
print("mode", idx.get("mode"), "tickLife", idx.get("tickLife"), "dirCount", idx.get("dirCount"), "mapN", len(idx["map"]))
d = idx["dirs"]
print("dirs:", " ".join("%s:%d" % (k, v["frames"]) for k, v in sorted(d.items())))
print("map:", json.dumps(idx["map"], ensure_ascii=False, sort_keys=True))
mg = json.load(open(r"F:\sanguo\game\data\magics.json", encoding="utf-8"))
print("type", type(mg), len(mg))
multi = [m for m in mg if (m.get("fx_dir") or []) and len(m["fx_dir"]) > 1]
print("multi", len(multi))
for m in multi:
    print(m["SEQUENCE"], m.get("NAME"), m.get("fx_dir"), "frames", m.get("fx_frames"), "prim", m.get("fx_dir_primary"))
