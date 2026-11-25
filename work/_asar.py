import re
p = r"F:\sanguo\tools\cocos\cc388\resources\app.asar"
data = open(p, "rb").read()
print("size", len(data))
for pat in [b"isRemote", b"remoteServerAddress", b"remoteBundles"]:
    idxs = [m.start() for m in re.finditer(pat, data)][:8]
    print(f"\n===== {pat.decode()} hits: {len(idxs)} (first {len(idxs)}) =====")
    for i in idxs[:4]:
        seg = data[max(0,i-160):i+160]
        txt = "".join(chr(c) if 32 <= c < 127 else "." for c in seg)
        print("---", i, "---")
        print(txt)
