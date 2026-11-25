import struct, os, json, shutil

PAK = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.PAK"
OUT = r"F:\sanguo\extract\pak"
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT, exist_ok=True)

data = open(PAK, "rb").read()
idx_off, count = struct.unpack_from("<II", data, 8)
region = data[idx_off:]

entries = []
for pos in range(0, len(region) - 63, 64):
    size, off = struct.unpack_from("<II", region, pos)
    nm = region[pos + 24: pos + 64].split(b"\0")[0].decode("latin1")
    if not nm:
        continue
    entries.append({"name": nm, "size": size, "offset": off})

print("entries:", len(entries))
# verify contiguity
prev_end = 24
ok = True
for e in entries:
    if e["offset"] != prev_end:
        print("gap!", e["name"], e["offset"], prev_end)
        ok = False
    prev_end = e["offset"] + e["size"]
print("contiguous:", ok, "final end", prev_end, "idx_off", idx_off)

manifest = []
used = set()
for e in entries:
    rel = e["name"].replace("\\", "/")
    assert rel not in used, rel
    used.add(rel)
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data[e["offset"]: e["offset"] + e["size"]])
    manifest.append({"name": e["name"], "size": e["size"], "offset": e["offset"]})

json.dump(manifest, open(os.path.join(OUT, "_manifest.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("extracted ok")

from collections import Counter, defaultdict
c = Counter(); sz = defaultdict(int)
ext = Counter()
for m in manifest:
    parts = m["name"].split("\\")
    top = "\\".join(parts[:2]) if len(parts) > 2 else "\\".join(parts[:-1]) or "(root)"
    c[top] += 1; sz[top] += m["size"]
    ext[os.path.splitext(m["name"])[1].upper()] += 1
for k, v in sorted(c.items()):
    print(f"{k:32s} {v:6d}  {sz[k]:12,d}")
print("extensions:", ext.most_common(20))
