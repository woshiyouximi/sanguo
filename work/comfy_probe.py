import json, urllib.request
B='http://127.0.0.1:8188'
def get(p):
    with urllib.request.urlopen(B+p, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))

oi = get('/object_info')
print('node count', len(oi))
qwen = [k for k in oi if 'qwen' in k.lower()]
print('QWEN nodes:'); [print('  ', k) for k in qwen]
for n in ('CheckpointLoaderSimple','UNETLoader','CLIPLoader','VAELoader','LoraLoaderModelOnly'):
    if n in oi:
        info = oi[n]['input']['required']
        for k,v in info.items():
            if isinstance(v, list) and v and isinstance(v[0], list):
                print(n, k, v[0][:40])
