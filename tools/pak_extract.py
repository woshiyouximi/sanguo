import struct, os, sys, json

PAK = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.PAK"
OUT = r"F:\sanguo\extract\pak"

os.makedirs(OUT, exist_ok=True)
with open(PAK, "rb") as f:
    data = f.read()

idx_off, count = struct.unpack_from("<II", data, 8)
region = data[idx_off:]

entries = []
for pos in range(0, len(region), 64):
    size, off = struct.unpack_from("<II", region, pos)
    raw = region[pos + 24: pos + 40]
    name = raw.split(b"\0")[0].decode("latin1")
    entries.append({"pos": pos, "size": size, "offset": off, "name": name})

if not os.path.exists(os.path.join(OUT, "_manifest.json")):
    pass

manifest = []
used = set()
for e in entries:
    name = e["name"]
    # sanitize
    safe = name.replace("\\", "/")
    safe = "".join(c if (32 <= ord(c) < 127 and c not in '<>:"|?*') else "_" for c in safe)
    if safe.endswith("/") or safe == "":
        safe = safe + f"_nameless_{e['pos']:06d}"
    # dedupe (truncated names may collide)
    base = safe
    n = 1
    while safe.lower() in used:
        n += 1
        safe = f"{base}~{n}"
    used.add(safe.lower())
    path = os.path.join(OUT, safe)
    os.makedirs(os.path.dirname(path) or OUT, exist_ok=True)
    blob = data[e["offset"]: e["offset"] + e["size"]]
    with open(path, "wb") as fo:
        fo.write(blob)
    manifest.append({"name": name, "path": safe, "size": e["size"], "offset": e["offset"],
                     "magic": blob[:16].hex(" ")})

with open(os.path.join(OUT, "_manifest.json"), "w", encoding="utf-8") as fo:
    json.dump(manifest, fo, ensure_ascii=False, indent=1)

print("extracted", len(manifest), "files")
tot = sum(m["size"] for m in manifest)
print("total bytes", tot)
# Report by top dir
from collections import Counter, defaultdict
c = Counter()
sz = defaultdict(int)
for m in manifest:
    top = m["path"].split("/")[0] if "/" in m["path"] else "(root)"
    c[top] += 1
    sz[top] += m["size"]
for k, v in c.most_common():
    print(f"{k:24s} {v:6d} files  {sz[k]:12,d} bytes")
