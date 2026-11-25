import re
p = r"F:\sanguo\tools\cocos\cc388\resources\app.asar"
data = open(p, "rb").read()
for pat in [b".assets.server", b"serverAddress", b"remoteServer"]:
    idxs = [m.start() for m in re.finditer(re.escape(pat), data)]
    print(f"\n===== {pat.decode()} hits {len(idxs)} =====")
    for i in idxs[:6]:
        seg = data[max(0,i-300):i+300]
        txt = "".join(chr(c) if 32 <= c < 127 else "." for c in seg)
        print("---", i, "---"); print(txt)
