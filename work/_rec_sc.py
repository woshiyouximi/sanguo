import io
src = r"F:\sanguo\game\tests\stepcav.test.ts"
raw = io.open(src, "rb").read()
txt = raw.decode("utf-8", "surrogateescape")
out = None
for enc in ("cp936", "gb18030", "big5"):
    try:
        b = txt.encode(enc)
    except Exception as e:
        print(enc, "encode-fail", e)
        continue
    try:
        t = b.decode("utf-8")
        out = (enc, t)
        print(enc, "OK len", len(t))
        break
    except Exception as e:
        print(enc, "decode-fail", e)
if out:
    io.open(r"F:\sanguo\work\stepcav.recovered.ts", "w", encoding="utf-8", newline="\n").write(out[1])
    print("wrote recovered from", out[0])
