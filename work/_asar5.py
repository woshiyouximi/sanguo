import re
p = r"F:\sanguo\tools\cocos\cc388\resources\app.asar"
data = open(p, "rb").read()
idxs = [m.start() for m in re.finditer(b"bundleConfigs", data)]
print("hits", len(idxs))
shown = 0
for i in idxs:
    seg = data[max(0,i-420):i+420]
    txt = "".join(chr(c) if 32 <= c < 127 else "." for c in seg)
    if "isRemote" in txt or "bundleName" in txt or "priority" in txt:
        print("---", i, "---"); print(txt); print()
        shown += 1
    if shown >= 5: break
