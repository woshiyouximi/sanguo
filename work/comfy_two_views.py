"""双视角验证：同一名士兵的背视图 / 正视图（方案 A 的核心美术代价）。"""
import json, os, shutil, time, urllib.request, uuid
B = 'http://127.0.0.1:8188'
OUT_SRC = r'F:\AI\ComfyUI\output'
OUT_DST = r'F:\sanguo\project\art_ref'

STYLE = '新国风厚涂风格，厚实可见的笔触，电影感侧逆光，高级灰调，浅灰纯色背景，全身站姿，单人，无文字'
BASE = '三国时期士兵全身概念图，手持长枪，蓝色阵营布甲配皮护腕，头戴斗笠，草鞋，'

JOBS = [
    ('soldier_back', BASE + '背视图：从正后方看，看不见脸，只能看见后脑、斗笠背面、背甲与肩甲，长枪斜扛在右肩。' + STYLE, 901),
    ('soldier_front', BASE + '正视图：从正前方看，能看见脸与胸前甲片，长枪竖直立于右手旁。' + STYLE, 901),
]

def post(path, obj):
    req = urllib.request.Request(B + path, data=json.dumps(obj).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))

def get(path):
    with urllib.request.urlopen(B + path, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))

def build(w, h, pos, neg, seed):
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "qwen_image_2.1_Q8_0.gguf"}},
        "2": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.1}},
        "3": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_8b_int8_convrot.safetensors", "type": "qwen_image", "device": "default"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "5": {"class_type": "TextEncodeQwenImage21", "inputs": {"clip": ["3", 0], "prompt": pos, "negative_prompt": neg, "resolution": 1024, "images": []}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["2", 0], "seed": seed, "steps": 24, "cfg": 3.0, "sampler_name": "euler", "scheduler": "simple", "positive": ["5", 0], "negative": ["5", 1], "latent_image": ["6", 0], "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["4", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "sg"}},
    }

NEG = '低质量，模糊，多余人物，畸变肢体，文字，水印，多人，侧视，45度角'
for name, pos, seed in JOBS:
    t0 = time.time()
    r = post('/prompt', {"prompt": build(512, 768, pos, NEG, seed), "client_id": str(uuid.uuid4())})
    pid = r['prompt_id']
    while time.time() - t0 < 900:
        hist = get('/history/' + pid)
        if pid in hist:
            st = hist[pid].get('status', {})
            if st.get('status_str') != 'success':
                print('FAIL', name, st.get('status_str'))
                for m in st.get('messages', []):
                    if m[0] == 'execution_error':
                        print('  ', m[1].get('exception_message', '')[:300])
                break
            for _, o in hist[pid].get('outputs', {}).items():
                for im in o.get('images', []):
                    src = os.path.join(OUT_SRC, im.get('subfolder', ''), im['filename'])
                    dst = os.path.join(OUT_DST, name + '.png')
                    shutil.copyfile(src, dst)
                    print('OK  %-14s %.1fs' % (name, time.time() - t0))
            break
        time.sleep(3)
    else:
        print('TIMEOUT', name)
