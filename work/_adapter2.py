import re, json, glob
root = r"F:\sanguo\dist\wechat-upload"
for name in ["engine-adapter.js", "game.js", "first-screen.js"]:
    try:
        d = open(root + "\\" + name, "rb").read().decode("utf-8", "replace")
    except OSError:
        continue
    hits = {p: len(re.findall(p, d)) for p in ["subpackages", "loadSubpackage", "loadBundle", "bundleVers"]}
    print(f"\n### {name} ({len(d)} chars) {hits}")
    for p in ["subpackages", "loadBundle"]:
        for m in list(re.finditer(p, d))[:3]:
            print(f"  [{p}] ...", d[max(0,m.start()-200):m.start()+220].replace("\n"," "))
s = glob.glob(root + r"\src\settings*.json")[0]
j = json.load(open(s, encoding="utf-8"))
print("\n### settings.assets =", json.dumps(j["assets"], ensure_ascii=False)[:900])
print("### launch =", json.dumps(j.get("launch"), ensure_ascii=False))
