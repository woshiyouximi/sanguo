# -*- coding: utf-8 -*-
"""三个待定问题一次问清，结果写 probe3.txt（控制台中文会乱码）。"""
import hashlib
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(r"F:\sanguo")
GEN = ROOT / "work" / "soldier_gen"
PNG = ROOT / "export" / "png" / "SHAPE" / "FORCE"
MAN = json.loads((ROOT / "export" / "manifest_art.json").read_text(encoding="utf-8"))
FORCE = {m["path"].replace("\\", "/").split("/")[-1].rsplit(".", 1)[0].upper(): m
         for m in MAN if m["path"].replace("\\", "/").upper().startswith("SHAPE/FORCE/")}
SOL = json.loads((GEN / "soldiers_raw.json").read_text(encoding="utf-8"))
out = []


def open_any(stem):
    p = PNG / (stem + ".png")
    if not p.exists():
        for q in PNG.glob("*.png"):
            if q.stem.upper() == stem.upper():
                p = q
                break
    return Image.open(p).convert("RGBA")


def probe(stem):
    md = FORCE[stem.upper()]
    im = open_any(stem)
    a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    bb = a.getbbox()
    return md, im, a, bb


# ---- 1) M / N 是否同姿势（alpha 掩码哈希）----
out.append("== 1) M vs N 姿势比对（alpha 掩码哈希 + bbox + 尺寸） ==")
blue = {o["obj"]: o for o in SOL if o["obj"] <= 44}
red = {o["obj"]: o for o in SOL if 45 <= o["obj"] <= 57}
for b_obj, r_obj in zip(sorted(blue), sorted(red)):
    same = 0
    tot = 0
    for act in ("Walk", "Attack"):
        for s1, s2 in zip(blue[b_obj]["anims"][act], red[r_obj]["anims"][act]):
            md1, im1, a1, bb1 = probe(s1)
            md2, im2, a2, bb2 = probe(s2)
            h1 = hashlib.md5(a1.tobytes()).hexdigest()[:8]
            h2 = hashlib.md5(a2.tobytes()).hexdigest()[:8]
            tot += 1
            same += 1 if (h1 == h2 and im1.size == im2.size) else 0
    out.append("%s: %s vs %s  同姿势 %d/%d" % (blue[b_obj]["anims"]["Walk"][0][1], blue[b_obj]["name"], red[r_obj]["name"], same, tot))

# ---- 2) M / N 颜色差异（同一帧的平均色）----
out.append("")
out.append("== 2) 同帧平均色（R,G,B）==")
for b_obj, r_obj in list(zip(sorted(blue), sorted(red)))[:4]:
    s1 = blue[b_obj]["anims"]["Walk"][0]
    s2 = red[r_obj]["anims"]["Walk"][0]
    for s in (s1, s2):
        im = open_any(s).convert("RGB")
        m = open_any(s).getchannel("A").point(lambda v: 255 if v >= 128 else 0)
        px = [p for p, k in zip(im.getdata(), m.getdata()) if k]
        n = len(px)
        avg = tuple(sum(c[i] for c in px) // max(1, n) for i in range(3))
        out.append("%-12s avg=%s ink=%d" % (s, avg, n))

# ---- 3) 長槍兵 C 各动作的左右极值（决定画布宽）----
out.append("")
out.append("== 3) 每兵种 各动作 相对锚点左右极值 (left, right) ==")
for o in SOL:
    if o["obj"] > 44:
        continue
    first = o["anims"]["Walk"][0]
    if not isinstance(first, str):
        first = (first.get("shape") or first.get("name") or "")
    letter = first[1]
    rows = []
    for act in ("Wait", "Walk", "Attack", "Pain", "Death", "Win", "Defense"):
        seq = o["anims"].get(act) or []
        ml = mr = 0
        for s in seq:
            md = FORCE[s.upper()]
            ml = max(ml, md["offx"])
            mr = max(mr, md["width"] - md["offx"])
        rows.append("%s[%d]=%d/%d" % (act, len(seq), ml, mr))
    out.append("%s %-6s %s" % (letter, o["name"], "  ".join(rows)))

# ---- 4) TIMES*.INI 里与士兵动画相关的行 ----
out.append("")
out.append("== 4) TIMES1-5.INI / SANGO.INI 里 soldier/force 相关 ==")
for p in sorted((ROOT / "extract" / "pak").glob("TIMES*.INI")):
    txt = p.read_text(encoding="utf-8", errors="replace")
    hits = [ln for ln in txt.splitlines() if re.search(r"(?i)soldier|force|walk|attack|frame|speed", ln)]
    out.append("-- %s (%d 行, 命中 %d)" % (p.name, len(txt.splitlines()), len(hits)))
    for ln in hits[:25]:
        out.append("   " + ln.strip()[:120])

(GEN / "probe3.txt").write_text("\n".join(out), encoding="utf-8")
print("ok", len(out), "lines")
