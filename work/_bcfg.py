import json, glob
p = glob.glob(r"F:\sanguo\dist\wechat-upload\subpackages\res\config.*.json")[0]
j = json.load(open(p, encoding="utf-8"))
print("keys:", list(j.keys()))
for k in ("base","importBase","nativeBase","name","deps","versions"):
    if k in j:
        v = j[k]
        print(f"  {k} = {json.dumps(v, ensure_ascii=False)[:200]}")
