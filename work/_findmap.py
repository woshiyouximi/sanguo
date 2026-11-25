import glob, json, os
hits = []
for root in [r"F:\sanguo\game\cocos\temp\programming\packer-driver"]:
    for p in glob.glob(root + r"\**\*.map", recursive=True):
        try:
            raw = open(p, "rb").read()
        except Exception:
            continue
        if b"DeployRoot" in raw:
            hits.append((p, len(raw)))
for h in hits[:10]:
    print(h)
print("total", len(hits))
