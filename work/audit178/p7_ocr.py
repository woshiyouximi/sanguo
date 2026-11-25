import sys, os, numpy as np, pickle
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
BOX = (289, 260, 353, 288)     # countdown numeral box (a bit generous)
G = 16                          # normalised glyph size

# ---------- glyph segmentation ----------
def glyphs(im):
    g = np.asarray(im.convert("L").crop(BOX), dtype=np.uint8)
    m = (g < 100)
    cols = m.any(axis=0)
    runs, s = [], None
    for i, v in enumerate(cols):
        if v and s is None:
            s = i
        elif not v and s is not None:
            runs.append((s, i)); s = None
    if s is not None:
        runs.append((s, len(cols)))
    # merge runs separated by <=1 px
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] <= 1:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(list(r) if False else (r[0], r[1]))
    out = []
    for x0, x1 in merged:
        if x1 - x0 < 3:
            continue
        sub = m[:, x0:x1]
        rows = np.where(sub.any(axis=1))[0]
        if len(rows) < 6:
            continue
        y0, y1 = rows[0], rows[-1] + 1
        patch = (sub[y0:y1, :] * 255).astype(np.uint8)
        pi = Image.fromarray(patch).resize((G, G), Image.NEAREST)
        out.append((x0, x1, y0, y1, (np.asarray(pi) > 127).astype(np.uint8)))
    return out

def sig(gl):
    return gl[4]

# ---------- build templates from known frames ----------
KNOWN = {
    384.80: "八十三", 390.60: "八十二", 385.10: "八十六", 401.10: "七十五",
    404.60: "七十三", 395.90: "七十八", 394.60: "七十九", 392.00: "八十一",
}
CH = "一二三四五六七八九十"
tmpl = {}
for t, s in KNOWN.items():
    p = _mk.grab(t, f"k_{int(t*10):05d}.png", sub="ocr")
    gs = glyphs(Image.open(p))
    if len(gs) != len(s):
        print(f"WARN {t} {s}: segments={len(gs)} expected={len(s)}")
        continue
    for gl, ch in zip(gs, s):
        tmpl.setdefault(ch, []).append(sig(gl))
print("templates:", {k: len(v) for k, v in tmpl.items()})
pickle.dump(tmpl, open(os.path.join(OUT, "ocr_tmpl.pkl"), "wb"))

def classify(s):
    best, bc = 1e9, "?"
    for ch, arrs in tmpl.items():
        for a in arrs:
            d = int((s ^ a).sum())
            if d < best:
                best, bc = d, ch
    return bc, best

# dump a labelled montage of glyph templates for eyeball check
items = []
for ch, arrs in tmpl.items():
    for a in arrs:
        items.append((Image.fromarray((a * 255).astype(np.uint8)).resize((64, 64), Image.NEAREST), f"{ch}"))
_mk.montage(items, os.path.join(OUT, "s08e_glyph_templates.png"), cols=10, title="glyph templates")
print("ok")
