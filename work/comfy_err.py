import json, urllib.request
B='http://127.0.0.1:8188'
pid='4298db4d-c61e-4128-8384-5ab62e35b339'
with urllib.request.urlopen(B+'/history/'+pid, timeout=30) as r:
    h=json.loads(r.read().decode('utf-8'))
if pid in h:
    st=h[pid].get('status',{})
    print(json.dumps(st, ensure_ascii=False, indent=1)[:4000])
else:
    print('not in history')
