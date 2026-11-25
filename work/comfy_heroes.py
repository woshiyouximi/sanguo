import json, os, shutil, time, urllib.request, uuid
B='http://127.0.0.1:8188'
OUT_SRC = r'F:\AI\ComfyUI\output'
DST = r'F:\sanguo\project\art_ref\heroes'
os.makedirs(DST, exist_ok=True)

STYLE = '新国风厚涂风格，厚实可见的笔触，电影感侧逆光，高级灰调，暗色背景，高细节，画面干净'
NEG = '低质量，模糊，多余手指，畸形手，文字，水印，logo，多人，二次元大眼，赛璐璐平涂'

CHARS = [
 ('guanyu',   '关羽',   '四十岁，沉稳内敛，丹凤眼长须，青绿战袍外罩铁灰重甲，手扶青龙偃月刀', '铁灰 #3A3F4A', 1101),
 ('zhangliao','张辽',   '三十岁，精悍沉着，短须，铁灰鱼鳞甲配暗红披风，腰悬环首刀', '铁灰 #3A3F4A', 1102),
 ('sunjian',  '孙坚',   '三十多岁，英武果决，络腮短须，赤红战袍配古铜兽面胸甲，手握长枪', '赤褐 #8C2B1E', 1103),
 ('caocao',   '曹操',   '四十岁，深沉锐利，短须，玄黑锦袍外披细鳞甲，手按剑柄', '玄青 #2E3A45', 1104),
 ('liubei',   '刘备',   '三十多岁，温和坚毅，长须，素白内衬配土黄皮甲，双股剑', '土褐 #4A3B2A', 1105),
 ('zhangjiao', '张角',  '六十岁，枯瘦神秘，白须长发，黄麻道袍配骨饰，手持九节杖，背景有薄雾', '土黄 #8A6B2F', 1106),
]

def build(pos, seed):
    return {
     "1": {"class_type":"UnetLoaderGGUF","inputs":{"unet_name":"qwen_image_2.1_Q8_0.gguf"}},
     "2": {"class_type":"ModelSamplingAuraFlow","inputs":{"model":["1",0],"shift":3.1}},
     "3": {"class_type":"CLIPLoader","inputs":{"clip_name":"qwen3vl_8b_int8_convrot.safetensors","type":"qwen_image","device":"default"}},
     "4": {"class_type":"VAELoader","inputs":{"vae_name":"qwen_image_2.1_vae_bf16.safetensors"}},
     "5": {"class_type":"TextEncodeQwenImage21","inputs":{"clip":["3",0],"prompt":pos,"negative_prompt":NEG,"resolution":1024,"images":[]}},
     "6": {"class_type":"EmptySD3LatentImage","inputs":{"width":832,"height":1216,"batch_size":1}},
     "7": {"class_type":"KSampler","inputs":{"model":["2",0],"seed":seed,"steps":20,"cfg":3.0,"sampler_name":"euler","scheduler":"simple","positive":["5",0],"negative":["5",1],"latent_image":["6",0],"denoise":1.0}},
     "8": {"class_type":"VAEDecode","inputs":{"samples":["7",0],"vae":["4",0]}},
     "9": {"class_type":"SaveImage","inputs":{"images":["8",0],"filename_prefix":"hero"}},
    }

def post(p,o):
    req=urllib.request.Request(B+p,data=json.dumps(o).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=60) as r: return json.loads(r.read().decode())
def get(p):
    with urllib.request.urlopen(B+p,timeout=60) as r: return json.loads(r.read().decode())

meta=[]
for name, cn, desc, color, seed in CHARS:
    pos = ('三国时期男性武将半身立绘，竖构图，%s，主色 %s。' % (desc, color)) + STYLE
    t0=time.time()
    r = post('/prompt', {"prompt": build(pos, seed), "client_id": str(uuid.uuid4())})
    pid = r['prompt_id']
    while time.time()-t0 < 900:
        hh = get('/history/'+pid)
        if pid in hh:
            st = hh[pid].get('status',{})
            if st.get('status_str')=='success':
                for _,o in hh[pid].get('outputs',{}).items():
                    for im in o.get('images',[]):
                        src=os.path.join(OUT_SRC, im['subfolder'], im['filename'])
                        shutil.copyfile(src, os.path.join(DST, name+'.png'))
                        print('OK', name, cn, '%.1fs'%(time.time()-t0))
                        meta.append({'file':name+'.png','name':cn,'seed':seed,'prompt':pos,'neg':NEG,
                                     'model':'qwen_image_2.1_Q8_0.gguf','clip':'qwen3vl_8b_int8_convrot',
                                     'steps':20,'cfg':3.0,'sampler':'euler','scheduler':'simple','shift':3.1,
                                     'size':'832x1216','seconds':round(time.time()-t0,1)})
            else:
                print('FAIL', name, st.get('status_str'))
            break
        time.sleep(3)
json.dump(meta, open(os.path.join(DST,'_meta.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('done', len(meta))
