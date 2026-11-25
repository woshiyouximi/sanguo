import struct, os, sys

PAK = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.PAK"
with open(PAK, "rb") as f:
    data = f.read()

idx_off, count = struct.unpack_from("<II", data, 8)
end = len(data)
region = data[idx_off:end]

# Walk the chain: sizes at pos, offsets at pos+4 ; file data starts at 24
off = 24
recs = []
pos = 0
while pos + 8 <= len(region):
    size, o = struct.unpack_from("<II", region, pos)
    if o == off and size > 0 and size < 64 * 1024 * 1024:
        # candidate record: name at pos+24
        name = region[pos + 24: pos + 40].split(b"\0")[0]
        recs.append((pos, size, o, name))
        off += size
        pos += 64
    else:
        # try to find next match
        nxt = region.find(struct.pack("<I", off), pos)
        if nxt < 0:
            print("chain broken at pos", pos, "expected offset", off, hex(off))
            break
        pos = nxt - 4
        continue

print("records found:", len(recs))
print("last rec pos:", recs[-1][0], "ends at", recs[-1][0] + 64, "region len", len(region))
print("final data end:", off, hex(off))
for r in recs[:10]:
    print(r)
print("...")
for r in recs[-10:]:
    print(r)
# Check all strides
strides = set(b[0] - a[0] for a, b in zip(recs, recs[1:]))
print("distinct strides:", sorted(strides)[:20], "count", len(strides))
# names with bad chars
bad = [r for r in recs if not all(32 <= c < 127 for c in r[3]) or len(r[3]) == 0]
print("bad names:", len(bad))
for b in bad[:20]:
    print(b)
