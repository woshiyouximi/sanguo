# -*- coding: utf-8 -*-
"""Finalize: move cards to top level, write face_map.csv + _counts.json."""
import os, json, shutil, collections
from PIL import Image

OUT = r"F:\sanguo\work\face_cmp"
HERO = r"F:\sanguo\game\web\assets\hero"
FPNG = r"F:\sanguo\export\png\SHAPE\FACE"
cov = json.load(open(os.path.join(OUT, "_cov.json"), encoding="utf-8"))
recs = cov["recs"]

# --- move cards to face_cmp\{名字}.png
src = os.path.join(OUT, "cards")
for n in os.listdir(src):
    shutil.copy2(os.path.join(src, n), os.path.join(OUT, n))
print("cards at top level:", len(os.listdir(src)))

FEMALE = ["大喬", "小喬", "貂蟬", "孫尚香", "祝融夫人", "關鳳"]
REVIEWED = {"head": ["關羽", "張飛", "趙雲", "諸葛亮", "曹操", "劉備", "孫權", "呂布",
                     "司馬懿", "周瑜", "張遼", "關平", "黃忠", "馬超", "龐統", "姜維",
                     "陸遜", "呂蒙", "夏侯惇", "張郃", "典韋", "許褚", "孫策", "董卓"],
            "female": FEMALE + ["孟獲", "兀突骨", "孟優"],
            "obscure": ["土安", "孔岫", "王頎", "吳綱", "卓膺", "金環三結", "胡班",
                        "帶來洞主", "張闓", "楊祚", "雷薄", "譚雄", "嚴政", "龔景"]}
seen = set()
for g, ns in REVIEWED.items():
    for n in ns:
        seen.add(n)

rows = []
for r in recs:
    n = r["name"]
    has = os.path.exists(os.path.join(HERO, n + ".webp"))
    has_s = "YES" if has else "NO"
    if n in FEMALE:
        adv = "原作（乙：AI 性别错，禁 AI）"
        note = "目检：AI 图是男性武将（%s）" % ("貂蟬为持大刀男性" if n == "貂蟬" else "男性铠甲形象")
    elif n in seen:
        adv = "原作优先（甲）"
        note = "目检：AI 为 3/4 身构图，同尺寸下脸只有原作一半大"
    else:
        adv = "原作优先（甲，未目检）"
        note = "按抽样规律推定，未逐张目检"
    rows.append((n, r["id"], r["face_num"], has_s, adv, note))

csv = os.path.join(OUT, "face_map.csv")
with open(csv, "w", encoding="utf-8-sig", newline="") as fh:
    fh.write("武将名,id,FACE编号,hero_webp存在?,建议,备注\n")
    for row in rows:
        fh.write(",".join('"%s"' % str(x).replace('"', '""') for x in row) + "\n")
print("csv rows:", len(rows))

# --- colour depth of FACE (+ alpha)
cols = []
alpha_frac = []
for r in recs:
    im = Image.open(os.path.join(FPNG, r["face_num"] + ".png"))
    rgb = im.convert("RGB")
    cs = rgb.getcolors(1 << 20)
    cols.append(len(cs) if cs else -1)
    a = im.split()[-1].histogram()
    alpha_frac.append(a[0] / (im.size[0] * im.size[1]))

counts = {
    "json_bytes": os.path.getsize(r"F:\sanguo\game\data\generals.json"),
    "json_top_type": "list", "json_len": 401,
    "general_records": len(recs),
    "face_present": len(recs), "face_unique": len({r["face_num"] for r in recs}),
    "face_png_count": len([f for f in os.listdir(FPNG) if f.lower().endswith(".png")]),
    "face_png_sizes": "100x120 x400",
    "face_png_total_mb": round(sum(os.path.getsize(os.path.join(FPNG, f))
                                   for f in os.listdir(FPNG) if f.lower().endswith(".png")) / 1e6, 2),
    "face_colors_min": min(cols), "face_colors_mean": round(sum(cols) / len(cols)),
    "face_colors_max": max(cols),
    "face_alpha_transparent_max_pct": round(100 * max(alpha_frac), 3),
    "hero_webp": 400, "hero_png": 400,
    "hero_webp_total_mb": 13.52, "hero_png_total_mb": 188.29,
    "hero_size": "480x701",
    "hero_missing": 0, "hero_extra": 0, "hero_decode_collisions": 0,
    "ai_exact_dupes": 0, "ai_near_dupes": 0, "face_near_dupes": 0,
    "female_with_male_ai": len(FEMALE), "female_total": len(FEMALE),
    "reviewed": len(seen),
}
json.dump(counts, open(os.path.join(OUT, "_counts.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(json.dumps(counts, ensure_ascii=False, indent=1))
