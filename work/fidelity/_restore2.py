import io, os

cands = [
    r"F:\sanguo\work\fidelity\gen_expect.mjs",
    r"F:\sanguo\work\fidelity\gen_expect.recovered.mjs",
    r"F:\sanguo\work\fidelity\gen_expect.fixed.mjs",
]

def try_reverse(text):
    text = text.lstrip("\ufeff")
    buf = bytearray()
    lost = 0
    for ch in text:
        try:
            buf += ch.encode("cp936")
        except UnicodeEncodeError:
            lost += 1
    try:
        out = bytes(buf).decode("utf-8", errors="replace")
    except Exception as e:
        return None, lost, str(e)
    return out, lost, None

for p in cands:
    if not os.path.exists(p):
        continue
    raw = io.open(p, encoding="utf-8", errors="replace").read()
    out, lost, err = try_reverse(raw)
    name = os.path.basename(p)
    if out is None:
        print(name, "FAILED", err)
        continue
    dst = p.replace(".mjs", ".restored.mjs")
    io.open(dst, "w", encoding="utf-8", newline="\n").write(out)
    repl = out.count("\ufffd")
    print(f"{name}: chars={len(out)} lost_chars={lost} replacement={repl} -> {os.path.basename(dst)}")
