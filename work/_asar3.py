import re
p = r"F:\sanguo\tools\cocos\cc388\resources\app.asar"
data = open(p, "rb").read()
for pat in [b"configPath", b"buildConfigPath", b"--build", b"overrideSettings"]:
    idxs = [m.start() for m in re.finditer(re.escape(pat), data)]
    print(f"\n===== {pat.decode()} hits {len(idxs)} =====")
    shown = 0
    for i in idxs:
        seg = data[max(0,i-220):i+260]
        txt = "".join(chr(c) if 32 <= c < 127 else "." for c in seg)
        if any(k in txt for k in ("build", "Build", "options", "Options")):
            print("---", i, "---"); print(txt); shown += 1
        if shown >= 3: break
