"""用本机 ComfyUI + Qwen-Image 2.1 批量出概念图（竖屏项目美术参考）。

跑法：python F:\\sanguo\\work\\comfy_batch.py
产物：F:\\AI\\ComfyUI\\output\\sg_*.png  （再拷到 F:\\sanguo\\project\\art_ref\\）
"""
import json, os, shutil, time, urllib.request, uuid

B = 'http://127.0.0.1:8188'
OUT_SRC = r'F:\AI\ComfyUI\output'
OUT_DST = r'F:\sanguo\project\art_ref'

STYLE = '新国风厚涂风格，厚实可见的笔触，电影感侧逆光，高级灰调，暗色背景，高细节，画面干净'

JOBS = [
    # (文件名, 宽, 高, 正面提示词, 负面提示词, seed)
    ('hero_general', 832, 1216,
     '三国时期男性武将半身立绘，竖构图，身披兽面吞头连环铠，头戴束发金冠，一手按剑，神情坚毅，'
     '背景是深色虚化的军帐帷幕。' + STYLE,
     '低质量，模糊，多余手指，畸形手，文字，水印，logo，多人', 101),

    ('soldier_sheet', 1024, 1024,
     '游戏角色设定图，同一名士兵的正面/侧面/背面三视图并排排列，全身站姿，手持朴刀，'
     '蓝色阵营布甲配皮护腕，头戴笠帽，纯浅灰背景，无阴影投射。' + STYLE,
     '文字，水印，多余人物，畸变肢体，透视畸变', 202),

    ('battlefield', 832, 1216,
     '竖屏手机游戏战场背景，俯视 45 度，秋季草原，远处黄土城墙与烽火台，近处车辙与残旗，'
     '无人物，光照从右上方来，空间层次分明。' + STYLE,
     '人物，士兵，文字，水印，UI 元素', 303),

    ('ui_panel', 832, 1216,
     '竖屏手游 UI 界面设计稿，古风竹简与青铜包边的半透明面板，纵向排列，顶部标题栏、中部信息区、底部三枚圆形按钮，'
     '配色为墨黑、朱红、古铜金。' + STYLE,
     '文字，乱码字符，按钮错位，现代塑料质感', 404),

    ('worldmap', 832, 1216,
     '三国题材战略游戏大地图，竖构图俯视，山川河流与城池关隘，水墨渲染叠加厚涂，'
     '路径用淡金细线连接城池，标注点用朱红小旗，无文字。' + STYLE,
     '文字，字符，现代地图元素，卫星照片', 505),
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
        "3": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen3vl_8b_int8_convrot.safetensors", "type": "qwen_image", "device": "default"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "5": {"class_type": "TextEncodeQwenImage21", "inputs": {
            "clip": ["3", 0], "prompt": pos, "negative_prompt": neg, "resolution": 1024, "images": []}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {
            "model": ["2", 0], "seed": seed, "steps": 20, "cfg": 3.0, "sampler_name": "euler",
            "scheduler": "simple", "positive": ["5", 0], "negative": ["5", 1],
            "latent_image": ["6", 0], "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["4", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "sg"}},
    }


def main():
    os.makedirs(OUT_DST, exist_ok=True)
    for name, w, h, pos, neg, seed in JOBS:
        t0 = time.time()
        r = post('/prompt', {"prompt": build(w, h, pos, neg, seed), "client_id": str(uuid.uuid4())})
        pid = r['prompt_id']
        while time.time() - t0 < 1200:
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
                        src = os.path.join(OUT_SRC, im['subfolder'], im['filename'])
                        dst = os.path.join(OUT_DST, name + '.png')
                        shutil.copyfile(src, dst)
                        print('OK  %-16s %s  %.1fs' % (name, dst, time.time() - t0))
                break
            time.sleep(3)
        else:
            print('TIMEOUT', name)


if __name__ == '__main__':
    main()
