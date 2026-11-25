# -*- coding: utf-8 -*-
"""Step 1: coverage analysis. Read-only over game/**."""
import json, os, collections
from urllib.parse import unquote, quote

G = r"F:\sanguo\game\data\generals.json"
HERO = r"F:\sanguo\game\web\assets\hero"
FPNG = r"F:\sanguo\export\png\SHAPE\FACE"
OUT = r"F:\sanguo\work\face_cmp"

data = json.load(open(G, encoding="utf-8"))
recs = []
for r in data:
    if "SEQUENCE" not in r:
        continue
    face = r.get("FACE") or ""
    num = face.replace("\\", "/").split("/")[-1]
    recs.append({
        "id": r["id"], "seq": r["SEQUENCE"], "name": r["NAME"],
        "face": face, "face_num": num,
        "str": r.get("STR"), "int": r.get("INT"), "type": r.get("TYPE"),
    })
print("general records:", len(recs))

# --- duplicates in json
by_name = collections.Counter(r["name"] for r in recs)
dup_names = {n: c for n, c in by_name.items() if c > 1}
print("duplicate NAME in json:", len(dup_names), dup_names)
by_face = collections.Counter(r["face_num"] for r in recs)
dup_faces = {n: c for n, c in by_face.items() if c > 1}
print("FACE num used twice:", dup_faces)
for r in recs:
    if r["face_num"] in dup_faces:
        print("   ", r["id"], r["name"], r["face_num"])

# --- FACE png availability
pngs = {os.path.splitext(f)[0] for f in os.listdir(FPNG) if f.lower().endswith(".png")}
print("FACE png unique stems:", len(pngs))
nofile = [r["face_num"] for r in recs if r["face_num"] not in pngs]
print("generals whose FACE png missing:", len(nofile), nofile)
imgs_never_used = sorted(pngs - {r["face_num"] for r in recs})
print("FACE pngs not referenced by any general:", len(imgs_never_used), imgs_never_used[:10])

# --- hero assets
hero_files = [f for f in os.listdir(HERO) if os.path.splitext(f)[1].lower() == ".webp"]
print("\nhero webp:", len(hero_files))
other_ext = collections.Counter(os.path.splitext(f)[1].lower() for f in os.listdir(HERO) if os.path.splitext(f)[1].lower() != ".webp")
print("non-webp files in hero dir:", other_ext)

stem2file = {}
for f in hero_files:
    stem2file[os.path.splitext(f)[0]] = f
dec = {}
coll = []
for stem, f in stem2file.items():
    d = unquote(stem)
    if d in dec:
        coll.append((d, dec[d], f))
    dec.setdefault(d, f)
print("decoded distinct:", len(dec), "| decode collisions:", len(coll), coll[:5])

# round-trip check: what main.js would request
def want(name):
    return quote(name, safe="!*'()")  # approx encodeURIComponent

rt = sum(1 for n in dec if unquote(quote(n, safe="!*'()")) == n)
print("names that survive encodeURIComponent round-trip:", rt, "/", len(dec))

hit = [r for r in recs if r["name"] in dec]
miss = [r for r in recs if r["name"] not in dec]
print("\nHEO COVERAGE: hit %d / %d = %.2f%%" % (len(hit), len(recs), 100.0*len(hit)/len(recs)))
print("missing:", len(miss))
for r in miss[:50]:
    print("   ", r["id"], r["name"], r["face_num"], "| encoded:", quote(r["name"], safe="!*'()"))
gen_names = {r["name"] for r in recs}
extra = sorted(d for d in dec if d not in gen_names)
print("\nhero files with no matching general name:", len(extra))
print("  ", extra[:40])

# sizes of FACE pngs + hero webp
from PIL import Image
sz = collections.Counter()
for r in recs:
    p = os.path.join(FPNG, r["face_num"] + ".png")
    if os.path.exists(p):
        with Image.open(p) as im:
            sz[im.size] += 1
print("\nFACE png sizes:", sz)
hsz = collections.Counter()
for f in hero_files:
    with Image.open(os.path.join(HERO, f)) as im:
        hsz[im.size] += 1
print("hero webp sizes:", hsz.most_common(8))
fmts = collections.Counter()
for f in hero_files[:]:
    with Image.open(os.path.join(HERO, f)) as im:
        fmts[(im.format, im.mode)] += 1
print("hero formats/modes:", fmts)

json.dump({"hit": len(hit), "miss": [r["name"] for r in miss], "extra": extra,
           "recs": recs}, open(os.path.join(OUT, "_cov.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("\nwrote _cov.json")
