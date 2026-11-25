import json, hashlib
p = r"F:\sanguo\game\cocos\temp\programming\packer-driver\targets\preview\chunks\5b\5bda65b40e7b771dec9f876a6a93c93313b12a1a.js.map"
m = json.load(open(p, "r", encoding="utf-8"))
src = m["sourcesContent"][0]
print("CRLF", src.count("\r\n"), "LF", src.count("\n"), "len", len(src))
lines = src.split("\n")
print("lines", len(lines))
print("--- 1..12 ---"); print("\n".join(lines[:12]))
print("--- 尾部 3 行 ---"); print("\n".join(lines[-3:]))
for i, l in enumerate(lines, 1):
    if "loadGameData" in l or "heroBaseUrl = " in l or "resources" in l:
        print(f"{i:5}: {l.strip()[:110]}")
open(r"F:\sanguo\work\_deployroot_orig.ts", "w", encoding="utf-8", newline="\n").write(src)
