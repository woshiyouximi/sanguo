# -*- coding: utf-8 -*-
import json, os
OUT = r"F:\sanguo\work\face_cmp"
cov = json.load(open(os.path.join(OUT, "_cov.json"), encoding="utf-8"))
recs = cov["recs"]
names = [r["name"] for r in recs]
print("N=", len(names))
for i in range(0, 400, 10):
    print("%3d-%3d " % (i + 1, i + 10) + " ".join(names[i:i+10]))

HERO = r"F:\sanguo\game\web\assets\hero"
FPNG = r"F:\sanguo\export\png\SHAPE\FACE"
tsz = sum(os.path.getsize(os.path.join(HERO, r["name"] + ".webp")) for r in recs)
psz = sum(os.path.getsize(os.path.join(HERO, r["name"] + ".png")) for r in recs)
fsz = sum(os.path.getsize(os.path.join(FPNG, r["face_num"] + ".png")) for r in recs)
print("\nhero webp total: %.2f MB (avg %.1f KB)" % (tsz/1e6, tsz/len(recs)/1024))
print("hero png  total: %.2f MB (avg %.1f KB)" % (psz/1e6, psz/len(recs)/1024))
print("FACE png  total: %.2f MB (avg %.1f KB)" % (fsz/1e6, fsz/len(recs)/1024))
