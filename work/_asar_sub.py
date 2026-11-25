import re
p = r"F:\sanguo\tools\cocos\cc388\resources\app.asar"
d = open(p, "rb").read()
print("asar", len(d)//1024//1024, "MB")
pat = b"subpackages"
idxs = [m.start() for m in re.finditer(pat, d)]
print("hits", len(idxs))
seen = 0
for i in idxs:
    seg = d[max(0, i-400):i+300].decode("utf-8", "replace").replace("\n", " ")
    if "root" in seg or "game.json" in seg or "subpackage" in seg.lower():
        print("...", seg[-560:], "\n---")
        seen += 1
        if seen >= 6:
            break
