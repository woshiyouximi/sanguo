import io, re

src = r"F:\sanguo\work\fidelity\gen_expect.repair2.mjs"
dst = r"F:\sanguo\work\fidelity\gen_expect.fixed2.mjs"

t = io.open(src, encoding="utf-8").read()

pairs = [
    ("xls_武将", "xls_武将技"),
    ("xls_军师", "xls_军师技"),
    ("xls_兵", "xls_兵种"),
    ("xls_跾", "xls_路径"),
]
for bad, good in pairs:
    t = re.sub(bad + "\ufffd+\\.json", good + ".json", t)
    t = re.sub(bad + "\ufffd+", good, t)

left = t.count("\ufffd")
io.open(dst, "w", encoding="utf-8", newline="\n").write(t)
print("written", dst, "remaining_ufffd", left)
