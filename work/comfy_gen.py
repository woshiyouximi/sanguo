import json, urllib.request, time, uuid, os
B='http://127.0.0.1:8188'
def post(p, obj):
    data = json.dumps(obj).encode('utf-8')
    req = urllib.request.Request(B+p, data=data, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))
def get(p):
    with urllib.request.urlopen(B+p, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))

W,H = 512, 768
wf = {
 "1": {"class_type":"UnetLoaderGGUF","inputs":{"unet_name":"qwen_image_2.1_Q8_0.gguf"}},
 "2": {"class_type":"ModelSamplingAuraFlow","inputs":{"model":["1",0],"shift":3.1}},
 "3": {"class_type":"CLIPLoader","inputs":{"clip_name":"qwen_2.5_vl_7b_fp8_scaled.safetensors","type":"qwen_image","device":"default"}},
 "4": {"class_type":"VAELoader","inputs":{"vae_name":"qwen_image_2.1_vae_bf16.safetensors"}},
 "5": {"class_type":"TextEncodeQwenImage21","inputs":{"clip":["3",0],
        "prompt":"一幅新国风厚涂风格的三国武将半身像，竖构图，深色背景，金属铠甲反光，笔触厚实，电影感打光",
        "negative_prompt":"低质量，模糊，多余手指，文字，水印","resolution":1024,"images":[]}},
 "6": {"class_type":"EmptySD3LatentImage","inputs":{"width":W,"height":H,"batch_size":1}},
 "7": {"class_type":"KSampler","inputs":{"model":["2",0],"seed":12345,"steps":16,"cfg":3.0,
        "sampler_name":"euler","scheduler":"simple","positive":["5",0],"negative":["5",1],
        "latent_image":["6",0],"denoise":1.0}},
 "8": {"class_type":"VAEDecode","inputs":{"samples":["7",0],"vae":["4",0]}},
 "9": {"class_type":"SaveImage","inputs":{"images":["8",0],"filename_prefix":"sgtest"}},
}
cid = str(uuid.uuid4())
r = post('/prompt', {"prompt": wf, "client_id": cid})
print('queued', r.get('prompt_id'), 'number', r.get('number'))
pid = r['prompt_id']
t0=time.time()
while time.time()-t0 < 600:
    h = get('/history/'+pid)
    if pid in h:
        st = h[pid].get('status',{})
        print('status', st.get('status_str'), 'completed', st.get('completed'), 'elapsed %.1fs'%(time.time()-t0))
        outs = h[pid].get('outputs',{})
        for nid, o in outs.items():
            for im in o.get('images', []):
                print('IMAGE', im.get('filename'), im.get('subfolder'), im.get('type'))
        break
    time.sleep(3)
else:
    print('TIMEOUT')
