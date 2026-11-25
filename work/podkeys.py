import sys, json
sys.path.insert(0, r'F:\sanguo\work')
import compshare as cs
h = cs.instances()[0]
print('KEYS:', sorted(h.keys()))
for k in sorted(h.keys()):
    v = h[k]
    if isinstance(v, (list, dict)) or 'ort' in k or 'ssh' in k.lower() or 'Ingress' in k:
        print(k, '=', json.dumps(v, ensure_ascii=False)[:300])
