import json

p = r"F:\sanguo\game\cocos\assets\bundles\res\anim\general\index.json"
d = json.load(open(p, encoding="utf8"))
pages = d["pages"]
groups = d["groups"]

for k in ["H", "L2", "L5", "R2", "R9", "W:A"]:
    print(k, "sprites:", len(pages[k]["sprites"]), "file:", pages[k]["file"], pages[k]["w"], pages[k]["h"])

# 每个 page 的 sprite 名集合 vs 该 shape 的 4 个 group 需要的名字
for shape in ["2", "5", "9"]:
    for letter in ["L", "R"]:
        page = pages[letter + shape]
        names = set(s["name"] for s in page["sprites"])
        need = []
        for g in [f"{letter}{shape}:Wait:1", f"{letter}{shape}:Attack:1", f"{letter}{shape}:Walk", f"{letter}{shape}:Death"]:
            if g in groups:
                miss = [n for n in groups[g] if n not in names]
                need.append((g, len(groups[g]), len(miss), miss[:3]))
            else:
                need.append((g, "MISSING GROUP", 0, []))
        print(letter + shape, need)

# spot check anchors for one walk frame
sp = {s["name"]: s for s in pages["L5"]["sprites"]}
for n in list(sp)[:3]:
    print("meta", n, sp[n])
