import re, json
p = r"F:\sanguo\dist\wechat-upload\web-adapter.js"
d = open(p, "rb").read().decode("utf-8", "replace")
print("web-adapter.js", len(d), "chars")
for pat in ["subpackages", "loadSubpackage", "getFileSystemManager", "readFile"]:
    idxs = [m.start() for m in re.finditer(pat, d)]
    print(f"\n== {pat}: {len(idxs)}")
    for i in idxs[:3]:
        print("   ...", d[max(0,i-160):i+160].replace("\n"," "))
