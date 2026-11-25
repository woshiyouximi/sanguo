import io, sys, os

cands = [
    r"F:\sanguo\work\fidelity\gen_expect.mjs",
    r"F:\sanguo\work\fidelity\gen_expect.recovered.mjs",
    r"F:\sanguo\work\fidelity\gen_expect.fixed.mjs",
]

def score(text):
    # 乱码特征字（UTF-8 被 cp936 解码后常见的开头字）
    bad = sum(text.count(ch) for ch in "锛鐨鏄鏂浠璺鍩鎶鎴锝")
    return bad

for p in cands:
    if not os.path.exists(p):
        print(p, "MISSING")
        continue
    raw = io.open(p, encoding="utf-8", errors="replace").read()
    out = None
    try:
        b = raw.encode("cp936", errors="strict")
        out = b.decode("utf-8", errors="strict")
    except Exception as e:
        print(os.path.basename(p), "reverse FAILED:", type(e).__name__, str(e)[:90])
        continue
    dst = p.replace(".mjs", ".restored.mjs")
    io.open(dst, "w", encoding="utf-8", newline="\n").write(out)
    print(os.path.basename(p), "-> restored", len(out), "chars, bad-score", score(out), "saved", os.path.basename(dst))
