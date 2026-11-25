import re
p = r"F:\sanguo\tools\cocos\cc388\resources\app.asar"
data = open(p, "rb").read()
for pat in [b"bundleName", b"BundleConfigProperty", b"isBundle"]:
    idxs = [m.start() for m in re.finditer(pat, data)]
    print(f"\n===== {pat.decode()} hits {len(idxs)} =====")
    seen = set()
    for i in idxs:
        seg = data[max(0,i-260):i+260]
        txt = "".join(chr(c) if 32 <= c < 127 else "." for c in seg)
        # 只打印含 isRemote 的片段，避免重复
        if "isRemote" in txt and txt[:120] not in seen:
            seen.add(txt[:120])
            print("---", i, "---"); print(txt)
        if len(seen) >= 4:
            break
