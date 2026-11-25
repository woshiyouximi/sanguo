import re
p = r"F:\sanguo\tools\cocos\cc388\resources\resources\3d\engine\bin\.cache\dev\editor\bundled\index.js"
d = open(p, "rb").read().decode("utf-8", "replace")
print("size", len(d))
hits = [m.start() for m in re.finditer(r"subpackages", d)]
print("hits", len(hits))
for i in hits[:12]:
    seg = d[max(0,i-300):i+240].replace("\n"," ")
    print("...", seg, "\n---")
