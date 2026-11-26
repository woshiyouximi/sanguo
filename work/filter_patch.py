import re
src = open(r"F:\sanguo\work\tmp_all.patch", encoding="utf-8").read().splitlines(True)
head = []
i = 0
while i < len(src) and not src[i].startswith("@@"):
    head.append(src[i]); i += 1
hunks = []
cur = None
for line in src[i:]:
    if line.startswith("@@"):
        if cur: hunks.append(cur)
        cur = [line]
    elif cur is not None:
        cur.append(line)
if cur: hunks.append(cur)
keep = []
for h in hunks:
    m = re.match(r"@@ -(\d+)", h[0])
    if m and int(m.group(1)) >= 2780:
        keep.append(h)
out = "".join(head) + "".join("".join(h) for h in keep)
open(r"F:\sanguo\work\tmp_mine.patch", "w", encoding="utf-8", newline="").write(out)
print("hunks", len(hunks), "kept", len(keep), "hdr", "".join(head[:4])[:80])
