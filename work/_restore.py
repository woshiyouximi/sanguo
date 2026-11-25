import json, io
p = r"F:\sanguo\game\cocos\temp\programming\packer-driver\targets\preview\chunks\5b\5bda65b40e7b771dec9f876a6a93c93313b12a1a.js.map"
m = json.load(open(p, "r", encoding="utf-8"))
src = m["sourcesContent"][0]
dst = r"F:\sanguo\game\cocos\assets\scripts\DeployRoot.ts"
open(dst, "wb").write(src.encode("utf-8"))
b = open(dst, "rb").read()
print("written", len(b), "bom", b[:3] == b"\xef\xbb\xbf")
print("has mojibake chars:", any(ch in src for ch in "\u951b\u9428\u6fd2"))
print("line count", src.count("\n") + 1)
