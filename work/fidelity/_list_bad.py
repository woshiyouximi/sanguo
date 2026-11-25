import io, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
p = r"F:\sanguo\work\fidelity\gen_expect.repair2.mjs"
lines = io.open(p, encoding="utf-8").read().split("\n")
n = 0
out = []
for i, l in enumerate(lines, 1):
    if "\ufffd" in l and ("'" in l) and ("/" in l or ".json" in l or ".txt" in l):
        n += 1
        out.append(f"{i} | {l.strip()[:170]}")
io.open(r"F:\sanguo\work\fidelity\_bad_lines.txt", "w", encoding="utf-8", newline="\n").write("\n".join(out) + f"\ntotal {n}\n")
print("done", n)
