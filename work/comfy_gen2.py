import json, urllib.request, time, uuid
B='http://127.0.0.1:8188'
def post(p, obj):
    req = urllib.request.Request(B+p, data=json.dumps(obj).encode('utf-8'), headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read().decode('utf-8'))
def get(p):
    with urllib.request.urlopen(B+p, timeout=60) as r: return json.loads(r.read().decode('utf-8'))

def run(clip_name, w=512, h=768, steps=16, shift=3.1, tag='t2'):
    wf = {
     "1": {"class_type":"UnetLoaderGGUF","inputs":{"unet_name":"qwen_image_2.1_Q8_0.gguf"}},
     "2": {"class_type":"ModelSamplingAuraFlow","inputs":{"model":["1",0],"shift":shift}},
     "3": {"class_type":"CLIPLoader","inputs":{"clip_name":clip_name,"type":"qwen_image","device":"default"}},
     "4": {"class_type":"VAELoader","inputs":{"vae_name":"qwen_image_2.1_vae_bf16.safetensors"}},
     "5": {"class_type":"TextEncodeQwenImage21","inputs":{"clip":["3",0],
            "prompt":"一幅新国风厚涂风格的三国武将半身像，竖构图，深色背景，金属铠甲反光，笔触厚实，电影感打光",
            "negative_prompt":"低质量，模糊，文字，水印","resolution":1024,"images":[]}},
     "6": {"class_type":"EmptySD3LatentImage","inputs":{"width":w,"height":h,"batch_size":1}},
     "7": {"class_type":"KSampler","inputs":{"model":["2",0],"seed":777,"steps":steps,"cfg":3.0,
            "sampler_name":"euler","scheduler":"simple","positive":["5",0],"negative":["5",1],
            "latent_image":["6",0],"denoise":1.0}},
     "8": {"class_type":"VAEDecode","inputs":{"samples":["7",0],"vae":["4",0]}},
     "9": {"class_type":"SaveImage","inputs":{"images":["8",0],"filename_prefix":tag}},
    }
    r = post('/prompt', {"prompt": wf, "client_id": str(uuid.uuid4())})
    pid = r['prompt_id']; t0=time.time()
    while time.time()-t0 < 900:
        hh = get('/history/'+pid)
        if pid in hh:
            st = hh[pid].get('status',{})
            ok = st.get('status_str')
            print(tag, clip_name, '->', ok, '%.1fs'%(time.time()-t0))
            if ok=='error':
                for m in st.get('messages',[]):
                    if m[0]=='execution_error':
                        print('   ERR:', m[1].get('exception_message','')[:200])
            for nid,o in hh[pid].get('outputs',{}).items():
                for im in o.get('images',[]): print('   IMAGE', im)
            return ok
        time.sleep(3)
    print(tag,'TIMEOUT'); return 'timeout'

run('qwen3vl_8b_int8_convrot.safetensors', tag='t3')
