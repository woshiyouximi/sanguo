import io, re
P = r"F:\sanguo\project\02_战斗重构设计.md"
lines = io.open(P, encoding="utf-8").read().split("\n")
out = []
i = 0
removed = 0
while i < len(lines):
    l = lines[i]
    out.append(l)
    if re.match(r"^#{1,3} ", l) and i+2 < len(lines) and lines[i+1].strip() == "":
        nxt = lines[i+2]
        ns = nxt.strip()
        if not ns.startswith(("|", "```", ">")):
            out.append(nxt)
            removed += 1
            i += 3
            continue
    i += 1
s = "\n".join(out)
io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("removed_blank_after_heading:", removed, "lines:", s.count("\n"))
