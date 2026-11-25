import json, urllib.request
B='http://127.0.0.1:8188'
def get(p):
    with urllib.request.urlopen(B+p, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))
oi = get('/object_info')
for n in ('TextEncodeQwenImage21','TextEncodeQwenImageEditPlus','EmptySD3LatentImage','KSampler','ModelSamplingAuraFlow','UnetLoaderGGUF','CLIPLoader','VAELoader','VAEDecode','SaveImage','QwenImage21Cache'):
    print('==', n, 'present' if n in oi else 'MISSING')
    if n in oi:
        d = oi[n]
        req = d.get('input',{}).get('required',{})
        for k,v in req.items():
            if isinstance(v,list) and v and isinstance(v[0],list):
                print('   ', k, '=', v[0][:12], ('...' if len(v[0])>12 else ''))
            else:
                print('   ', k, '=', str(v)[:120])
