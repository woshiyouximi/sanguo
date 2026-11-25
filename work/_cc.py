import re
p = r"F:\sanguo\game\cocos-build\wechatgame\cocos-js\cc.705f1.js"
d = open(p, "rb").read().decode("utf-8", "replace")
print("size", len(d))
for pat in ["subpackages", "loadSubpackage", "subpackage"]:
    idxs = [m.start() for m in re.finditer(pat, d)]
    print(f"\n== {pat} hits {len(idxs)}")
    for i in idxs[:4]:
        print("...", d[max(0,i-260):i+200].replace("\n", " "), "...")
        print("---")
