# -*- coding: utf-8 -*-
import os, json, hashlib, itertools
from PIL import Image

OUT = r"F:\sanguo\work\face_cmp"
HERO = r"F:\sanguo\game\web\assets\hero"
FPNG = r"F:\sanguo\export\png\SHAPE\FACE"
cov = json.load(open(os.path.join(OUT, "_cov.json"), encoding="utf-8"))
recs = cov["recs"]

md5 = {}
for r in recs:
    p = os.path.join(HERO, r["name"] + ".webp")
    md5.setdefault(hashlib.md5(open(p, "rb").read()).hexdigest(), []).append(r["name"])
dups = {k: v for k, v in md5.items() if len(v) > 1}
print("exact-duplicate webp groups:", len(dups))
for k, v in dups.items():
    print("   ", v)


def ah(im):
    g = im.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (1 if px[y * 9 + x] > px[y * 9 + x + 1] else 0)
    return bits


hashes = {r["name"]: ah(Image.open(os.path.join(HERO, r["name"] + ".webp"))) for r in recs}
pairs = []
for a, b in itertools.combinations(hashes, 2):
    d = bin(hashes[a] ^ hashes[b]).count("1")
    if d <= 4:
        pairs.append((d, a, b))
print("\nnear-duplicate pairs (aHash hamming<=4):", len(pairs))
for p in sorted(pairs)[:20]:
    print("   ", p)

# 原作 side: any duplicate faces?
fh = {r["name"]: ah(Image.open(os.path.join(FPNG, r["face_num"] + ".png"))) for r in recs}
fp = [(bin(fh[a] ^ fh[b]).count("1"), a, b) for a, b in itertools.combinations(fh, 2)]
fp = [p for p in fp if p[0] <= 4]
print("\nFACE near-dup pairs:", len(fp), sorted(fp)[:10])

# how much of the 480x701 frame is "background" vs subject? crude: corner patch variance
# skip; instead record headroom: top 14% band mean brightness
