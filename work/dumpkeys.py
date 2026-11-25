import json, os
OUT = r"F:\sanguo\extract\json"
def walk(o, prefix="", depth=0):
    if depth > 2: return
    if isinstance(o, dict):
        for k, v in o.items():
            t = type(v).__name__
            extra = ""
            if isinstance(v, list):
                extra = f"[{len(v)}]" + (f" item_keys={sorted(v[0].keys())}" if v and isinstance(v[0], dict) else "")
            elif isinstance(v, dict):
                extra = f"{{{len(v)}}}"
            else:
                extra = repr(v)[:60]
            print(f"{prefix}{k}: {t} {extra}")
            if isinstance(v, dict):
                walk(v, prefix + "  ", depth + 1)
    elif isinstance(o, list):
        print(f"{prefix}[list {len(o)}]")
walk_done = True
files = ["summary.json","magic.json","message.json","sango.json","things.json","times1.json","combine.json"]
for f in files:
    p = os.path.join(OUT, f)
    print("="*20, f, os.path.getsize(p))
    d = json.load(open(p, encoding="utf-8"))
    walk(d, "  ")
