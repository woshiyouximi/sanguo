import sys, json
sys.path.insert(0, r'F:\sanguo\work')
import compshare as cs
rows = cs.instances()
h = rows[0]
keep = {}
for k, v in h.items():
    if isinstance(v, (str, int, float, bool)) or k in ('IPs',):
        keep[k] = v
print(json.dumps(keep, ensure_ascii=False, indent=1)[:2500])
