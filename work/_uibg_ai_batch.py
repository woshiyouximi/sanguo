# -*- coding: utf-8 -*-
"""为 proto/ui 九屏生成底图（本机 ComfyUI + Qwen-Image 2.1 Q8 / AuraFlow 3.1 / qwen3vl_8b）。

只出"底材"，不出带字的成品图：提示词里明确"无文字"，负面词压 logo/汉字/UI。
产物：F:\sanguo\work\_uibg_ai\<name>.png
跑法：python F:\sanguo\work\_uibg_ai_batch.py [name ...]
"""
import json, os, shutil, sys, time, urllib.request, uuid

B = 'http://127.0.0.1:8188'
OUT_SRC = r'F:\AI\ComfyUI\output'
OUT_DST = r'F:\sanguo\work\_uibg_ai'

STYLE = ('新国风厚涂风格，厚实可见的笔触，电影感侧逆光，高级灰调，整体偏暗，高细节，'
         '画面干净，构图留白，适合当手机竖屏界面的背景底图')
NOSIGN = '文字,汉字,字符,书法,题字,印章,水印,logo,标题,UI元素,边框装饰,人物面部特写,多人'

JOBS = [
    # name, w, h, prompt, negative, seed
    ('p1_title', 832, 1216,
     '竖构图游戏启动画面背景：画面下部是黑甲长枪军队的列阵背影与几面残破军旗，枪林直指天空；'
     '上部是黄昏厚重的云层、斜射的耶稣光与远山剪影，地平线上有薄雾；'
     '中间大片空景留白，没有主角特写。' + STYLE,
     NOSIGN + ',现代建筑,卡通,鲜艳糖果色,白天正午', 7101),

    ('m3_deploy', 832, 1216,
     '古代军帐内部，纵深的深色帷幔与木柱，中央一张长木案，案上铺着布阵图、铜兵符、几面小令旗与一盏油灯；'
     '两侧立着甲胄架与弓囊，帐顶透下微弱天光，油灯是主要暖光源；画面无人。' + STYLE,
     NOSIGN + ',室外,雪景,现代家具', 7102),

    ('d1_deploy', 832, 1216,
     '俯视微侧的木质军案桌面，深色老木纹理，桌面上散放竹简、铜虎符、折叠的绢帛地图、'
     '一排小旗与沙盘上的微型城池模型，一盏铜油灯从左上方打亮；背景压暗，无人。' + STYLE,
     NOSIGN + ',平铺图案,对称构图,花纹地毯', 7103),

    ('r1_result', 832, 1216,
     '战后的夜晚军帐，深色木屏风与半垂的粗麻帷幕，案上一盏将熄的油灯，'
     '帐外远处有火光与烟的余晖，地面散落几片甲叶与断箭；空旷、安静、压抑，无人。' + STYLE,
     NOSIGN + ',游戏 UI,胜利横幅,烟花', 7104),

    ('g1_hero', 832, 1216,
     '深色室内背景，左侧是一排立起的竹简与卷起的绢帛，右侧是半卷的竹帘与木屏风，'
     '柔和侧光从竹帘缝隙透入，形成细长光带；大面积留白，无人、无字。' + STYLE,
     NOSIGN + ',书桌,文具特写,花纹繁复', 7105),

    ('s1_settings', 832, 1216,
     '古代书房的木质长案，案上卷起的书卷、笔架与毛笔、铜镇纸、一盏豆灯与一只香炉，'
     '背景是深色书架与垂落的布帘，安静，无人。' + STYLE,
     NOSIGN + ',现代台灯,电脑,玻璃杯', 7106),
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
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "uibg"}},
    }


def main():
    os.makedirs(OUT_DST, exist_ok=True)
    want = set(sys.argv[1:])
    for name, w, h, pos, neg, seed in JOBS:
        if want and name not in want:
            continue
        dst = os.path.join(OUT_DST, name + '.png')
        if os.path.exists(dst) and os.path.getsize(dst) > 100000:
            print('SKIP (exists) %s' % name, flush=True)
            continue
        t0 = time.time()
        r = post('/prompt', {"prompt": build(w, h, pos, neg, seed), "client_id": str(uuid.uuid4())})
        pid = r['prompt_id']
        print('submit %-12s %s' % (name, pid), flush=True)
        while time.time() - t0 < 1500:
            hist = get('/history/' + pid)
            if pid in hist:
                st = hist[pid].get('status', {})
                if st.get('status_str') != 'success':
                    print('FAIL %s %s' % (name, st.get('status_str')), flush=True)
                    for m in st.get('messages', []):
                        if m[0] == 'execution_error':
                            print('   ', m[1].get('exception_message', '')[:300], flush=True)
                    break
                for _, o in hist[pid].get('outputs', {}).items():
                    for im in o.get('images', []):
                        src = os.path.join(OUT_SRC, im['subfolder'], im['filename'])
                        shutil.copyfile(src, dst)
                        print('OK %-12s %s  %.1fs  %d B' % (name, dst, time.time() - t0,
                                                            os.path.getsize(dst)), flush=True)
                break
            time.sleep(2)
        else:
            print('TIMEOUT %s' % name, flush=True)


if __name__ == '__main__':
    main()
