"""從 Cocos packer-driver 的 sourcemap 取回 DeployRoot.ts 原文（build 時快照）。

用法：python restore_deploy.py <map> <out.ts>
"""
import json
import sys

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding="utf-8"))
s = d["sourcesContent"][0]
with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write(s)
b = s.encode("utf-8")
print("chars", len(s), "bytes", len(b), "fffd", s.count("\ufffd"), "qmark", s.count("?"), "lines", s.count("\n") + 1)
print("sources", d.get("sources"))
