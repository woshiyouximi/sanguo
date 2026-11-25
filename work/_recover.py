p = r"F:\sanguo\game\cocos\assets\scripts\DeployRoot.ts"
s = open(p, "rb").read().decode("utf-8-sig")
out = bytearray()
bad = []
for i, ch in enumerate(s):
    try:
        out += ch.encode("cp936")
    except UnicodeEncodeError:
        if ch == "\u20ac":
            out.append(0x80)
        else:
            bad.append((i, ch, hex(ord(ch))))
            out += b"?"
print("unmappable chars:", len(bad), bad[:10])
try:
    rec = out.decode("utf-8")
    print("DECODED OK chars", len(rec))
except UnicodeDecodeError as e:
    print("decode fail:", e)
    rec = out.decode("utf-8", "replace")
print("---- 解析后前 12 行 ----")
print("\n".join(rec.split("\n")[:12]))
print("---- 545 附近 ----")
print("\n".join(rec.split("\n")[543:548]))
open(r"F:\sanguo\work\_deployroot_recovered.ts", "wb").write(rec.encode("utf-8"))
