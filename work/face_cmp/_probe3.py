# -*- coding: utf-8 -*-
import json, collections, io
G = r"F:\sanguo\game\data\generals.json"
raw = open(G, "rb").read()
print("bytes:", len(raw))
print("head hex:", raw[:160].hex(" "))
print("BOM:", raw[:3] == b"\xef\xbb\xbf")
for enc in ("utf-8", "gb18030"):
    try:
        t = raw.decode(enc)
        print(enc, "decode OK")
    except Exception as ex:
        print(enc, "decode FAIL:", ex)
t = raw.decode("utf-8")
i = t.find('"NAME": "') + len('"NAME": "')
print("first NAME chars:", [hex(ord(c)) for c in t[i:i+6]])
print("first NAME raw slice:", repr(t[i:i+6]))
print("has U+FFFD in file:", t.count("\ufffd"))

data = json.loads(t)
print("\nlist len:", len(data))
schemas = collections.Counter()
for r in data:
    key = ("SEQUENCE" in r, "NAME" in r, "Skill" in r, "Loyal" in r)
    schemas[key] += 1
print("schema variants (SEQUENCE,NAME,Skill,Loyal):", schemas)
print("has SEQUENCE:", sum("SEQUENCE" in r for r in data))
print("id 0 rec NAME:", repr(data[0].get("NAME")))
seqs = [r.get("SEQUENCE") for r in data if "SEQUENCE" in r]
print("SEQUENCE min/max/uniq:", min(seqs), max(seqs), len(set(seqs)))
ids = [r.get("id") for r in data]
print("id min/max/uniq:", min(ids), max(ids), len(set(ids)))
# FACE coverage
faces = [r.get("FACE") for r in data]
print("FACE present:", sum(f is not None for f in faces))
pref = collections.Counter((f or "")[:5] for f in faces)
print("FACE prefixes:", pref)
nums = []
for f in faces:
    if f: nums.append(f.replace("\\", "/").split("/")[-1])
print("parsed FACE nums:", len(nums), "uniq:", len(set(nums)))
