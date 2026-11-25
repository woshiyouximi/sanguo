"""底图批量出图：本地 ComfyUI + Qwen-Image 2.1（GGUF Q8）。

与 comfy_batch.py 同一套模型/采样参数（UnetLoaderGGUF + ModelSamplingAuraFlow 3.1
+ CLIPLoader qwen3vl_8b + euler/simple/cfg3.0/20 步），只是把图换成"界面底图"，
并加了两件 comfy_batch.py 没做的事：
  1) --only 只听名字就重跑某几张（不用整批重来）；
  2) 出图后按"平均亮度"打分并做 gamma 压暗，底图上要压白字，必须整体偏暗。

跑法：
  python F:\\sanguo\\work\\comfy_bg.py                       # 全部
  python F:\\sanguo\\work\\comfy_bg.py --only map_bg --seed 777
  python F:\\sanguo\\work\\comfy_bg.py --only hud_bar,panel_frame --tag r2

产物：
  F:\\sanguo\\work\\bg_raw\\<name>[_tag].png   原始出图（不压暗，留证据）
  F:\\sanguo\\game\\web\\assets\\bg\\<name>.png  压暗后的成品（仅 --tag 为空时覆盖成品）
"""
import argparse, json, os, shutil, sys, time, urllib.request, uuid

B = 'http://127.0.0.1:8188'
OUT_SRC = r'F:\AI\ComfyUI\output'
RAW = r'F:\sanguo\work\bg_raw'
FINAL = r'F:\sanguo\game\web\assets\bg'

# 一张底图要压白字，平均亮度必须明显低于 90/255；压到 66 左右最稳。
TARGET_LUMA = 66.0
LUMA_HARD_MAX = 90.0

# 所有图共用：绝对不能出现文字（上一轮实测 AI 出的汉字全是乱码字形）
NEG_BASE = ('文字，汉字，汉字标注，字符，字母，数字，水印，logo，签名，印章，题跋，'
            '乱码字形，假字，现代元素，UI 界面，按钮，图标，明亮，过曝，纯白背景，高调')

STYLE = '新国风厚涂风格，厚实可见的笔触，电影感侧逆光，高级灰调，暗色背景，高细节'

JOBS = {
    # ---- 大地图：先出一张竖屏"衬底"，山川河流在，但不画城市/文字 ----
    'map_bg': dict(
        w=832, h=1216,
        pos=('竖构图俯视鸟瞰的中国古代全图，水墨渲染叠加厚涂，连绵山脉起伏、两条大河东流、'
             '曲折的海岸线与远处海面清晰可辨，山体用淡墨层层晕开，云气在河谷间流动，'
             '画面整体压得很暗，青灰色调偏冷，四角更暗几乎融入墨色，中部略亮但不刺眼，'
             '不画城市，不画关隘，不画道路，不画旗帜，不画人物，没有任何标注，'
             '像一幅被压在玻璃下的古旧地图，' + STYLE),
        neg='城市，城堡，建筑，关隘，道路，公路，旗帜，人物，动物，船只，' + NEG_BASE,
        seed=401, gamma_color=0.82,
    ),
    # ---- 大地图替换候选 v2：横向 4:3，尺寸接近 CHINAMAP，便于日后整体替换 ----
    'map_bg_v2': dict(
        w=1216, h=896,
        pos=('横向构图的中国古代全图，正射俯视，水墨与厚涂结合，东侧是海、西侧是高原与沙漠、'
             '北面是草原，黄河与长江自西向东贯穿，海岸线轮廓接近真实中国东部海岸，'
             '山脉走向合理，色调青灰偏冷且整体压暗，无城市无文字，古旧绢本质感，' + STYLE),
        neg='城市，城堡，建筑，关隘，道路，旗帜，人物，船只，' + NEG_BASE,
        seed=402, gamma_color=0.82,
    ),
    # ---- 出征编成：军营案几，中上部留暗区放控件 ----
    'deploy_bg': dict(
        w=832, h=1216,
        pos=('竖构图正俯视，古代军营的深色木质大案几，案面木纹粗粝，上面摊开半卷竹简、'
             '压着一枚青铜虎符、两支卷起的暗红令旗、一只青铜酒爵，边缘散落几枚竹签与铜钱，'
             '一盏铜灯的暖光从右下方斜照进来，画面上方三分之二保持大片深暗的阴影，'
             '空旷不抢戏，四周略亮、中心偏暗，烟尘与薄雾质感，无人物，' + STYLE),
        neg='人物，手，人脸，兵器堆叠，' + NEG_BASE,
        seed=403, gamma_color=0.85,
    ),
    # ---- 物品：木架与锦缎上的兵器坐骑陈列 ----
    'items_bg': dict(
        w=832, h=1216,
        pos=('竖构图，古代兵器与马具的陈列架，深色旧木架横梁上下分层，铺着暗红锦缎，'
             '横架上搁着长戟与环首刀，侧边挂着马鞍、马镫与皮鞭，边缘能看出货架的立柱与横梁，'
             '有货架感与纵深，画面上方与左右略被架体压暗，中间偏暗，'
             '薄尘在光柱里浮动，无人物，' + STYLE),
        neg='人物，手，人脸，现代货架，超市，' + NEG_BASE,
        seed=404, gamma_color=0.85,
    ),
    # ---- 战斗页顶部 HUD：横向军旗 + 木纹条，深色低对比 ----
    'hud_bar': dict(
        w=1024, h=256,
        pos=('横向长条构图，一条拼接的横向饰带：左侧是暗红旧军旗的布面纤维，右侧过渡到旧木纹，'
             '两端各嵌一枚青铜兽面扣件，表面有磨损与掉漆，布纹与木纹的细节清晰，'
             '整体极暗、低对比、没有明显主体图案，像一条被用作界面分隔的老旧横幅，' + STYLE),
        neg='对称，图案，纹样主体，纹章，' + NEG_BASE,
        seed=405, gamma_color=0.9,
    ),
    # ---- 九宫格边框底材：四角青铜纹，中间可拉伸 ----
    'panel_frame': dict(
        w=512, h=512,
        pos=('正方形，游戏 UI 面板的边框底材，四条边是暗色木纹包铜条，'
             '四个角各有一枚深青铜饕餮纹护角，纹样只占角部，四条边中段尽量平直均匀，'
             '框内是一片均匀的深灰色空面便于九宫格拉伸，整体很暗、低对比，无文字，' + STYLE),
        neg='中间有图案，中心有物体，错位，不对称，' + NEG_BASE,
        seed=406, gamma_color=0.9,
    ),
}


class Comfy:
    """极简 ComfyUI HTTP 客户端：提交 → 轮询 → 取回文件。"""

    def __init__(self, base=B, out_src=OUT_SRC, timeout=1500):
        self.base = base
        self.out_src = out_src
        self.timeout = timeout

    def _post(self, path, obj):
        req = urllib.request.Request(self.base + path, data=json.dumps(obj).encode('utf-8'),
                                     headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode('utf-8'))

    def _get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=60) as r:
            return json.loads(r.read().decode('utf-8'))

    def build(self, w, h, pos, neg, seed):
        return {
            "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "qwen_image_2.1_Q8_0.gguf"}},
            "2": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.1}},
            "3": {"class_type": "CLIPLoader", "inputs": {
                "clip_name": "qwen3vl_8b_int8_convrot.safetensors", "type": "qwen_image",
                "device": "default"}},
            "4": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
            "5": {"class_type": "TextEncodeQwenImage21", "inputs": {
                "clip": ["3", 0], "prompt": pos, "negative_prompt": neg,
                "resolution": 1024, "images": []}},
            "6": {"class_type": "EmptySD3LatentImage", "inputs": {
                "width": w, "height": h, "batch_size": 1}},
            "7": {"class_type": "KSampler", "inputs": {
                "model": ["2", 0], "seed": seed, "steps": 20, "cfg": 3.0,
                "sampler_name": "euler", "scheduler": "simple",
                "positive": ["5", 0], "negative": ["5", 1],
                "latent_image": ["6", 0], "denoise": 1.0}},
            "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["4", 0]}},
            "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "sgbg"}},
        }

    def run(self, name, job, seed):
        t0 = time.time()
        r = self._post('/prompt', {"prompt": self.build(job['w'], job['h'], job['pos'], job['neg'], seed),
                                   "client_id": str(uuid.uuid4())})
        pid = r['prompt_id']
        while time.time() - t0 < self.timeout:
            hist = self._get('/history/' + pid)
            if pid in hist:
                st = hist[pid].get('status', {})
                if st.get('status_str') != 'success':
                    for m in st.get('messages', []):
                        if m[0] == 'execution_error':
                            print('  ERR', m[1].get('exception_message', '')[:300])
                    return None
                for _, o in hist[pid].get('outputs', {}).items():
                    for im in o.get('images', []):
                        src = os.path.join(self.out_src, im['subfolder'], im['filename'])
                        dst = os.path.join(RAW, name + '.png')
                        shutil.copyfile(src, dst)
                        print('OK  %-12s %5.1fs  %s' % (name, time.time() - t0, dst))
                        return dst
                return None
            time.sleep(3)
        print('TIMEOUT', name)
        return None


def grade(src, dst, gamma_color=1.0):
    """压暗到 TARGET_LUMA 左右：先算当前平均亮度，再用 gamma 拉到目标值。

    gamma 只动中间调（黑场 0 / 白场 255 不动），比"整体乘一个小数"更能保住暗部层次；
    最后做一次柔和的高光压缩，避免有小块高光把 HUD 上压的字吃掉。
    """
    import numpy as np
    from PIL import Image, ImageEnhance

    im = Image.open(src).convert('RGB')
    if gamma_color < 1.0:
        im = ImageEnhance.Color(im).enhance(gamma_color)
    a = np.asarray(im).astype(np.float32)
    luma = float((a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).mean())
    p99 = float(np.percentile(a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32), 99))

    g = 1.0
    if luma > TARGET_LUMA:
        g = float(np.log(TARGET_LUMA / 255.0) / np.log(max(luma, 1.0) / 255.0))
        g = max(1.0, min(2.6, g))
        a = 255.0 * np.power(np.clip(a / 255.0, 0, 1), g)
    # 柔和高光压缩：v' = v * (1 - 0.4*(v/255)^3)
    t = np.clip(a / 255.0, 0, 1)
    a = a * (1.0 - 0.40 * t ** 3)

    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
    out.save(dst, optimize=True)
    b = np.asarray(out).astype(np.float32)
    l2 = float((b @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).mean())
    print('    luma %.1f -> %.1f (gamma %.2f, p99 %.0f->%.0f)  %s' % (
        luma, l2, g, p99, float(np.percentile(
            b @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32), 99)), dst))
    return l2


def main():
    global TARGET_LUMA
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='', help='逗号分隔的图名，只跑这些')
    ap.add_argument('--seed', type=int, default=0, help='覆盖 seed（单张重跑时用）')
    ap.add_argument('--tag', default='', help='产物加后缀，不覆盖 assets/bg 成品')
    ap.add_argument('--service', type=float, default=TARGET_LUMA, help='压暗目标平均亮度')
    args = ap.parse_args()

    TARGET_LUMA = args.service
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(FINAL, exist_ok=True)

    names = [n.strip() for n in args.only.split(',') if n.strip()] or list(JOBS)
    bad = [n for n in names if n not in JOBS]
    if bad:
        sys.exit('unknown job: %s (have: %s)' % (bad, ', '.join(JOBS)))

    c = Comfy()
    report = []
    for n in names:
        job = JOBS[n]
        seed = args.seed if args.seed else job['seed']
        print('--- %s %dx%d seed=%d' % (n, job['w'], job['h'], seed))
        if args.tag:
            src_override = os.path.join(RAW, '%s_%s.png' % (n, args.tag))
            dest = src_override
        else:
            dest = os.path.join(RAW, '%s.png' % n)
        # run() 固定写 RAW\<name>.png；带 tag 时先跑再改名
        got = c.run(n, job, seed)
        if not got:
            report.append((n, 'FAIL'))
            continue
        if args.tag:
            os.replace(got, dest)
        out = os.path.join(FINAL, '%s.png' % n) if not args.tag else \
            os.path.join(RAW, '%s_%s_grade.png' % (n, args.tag))
        l2 = grade(dest, out, job.get('gamma_color', 1.0))
        report.append((n, 'luma %.1f' % l2, 'OK' if l2 <= LUMA_HARD_MAX else 'TOO BRIGHT'))

    print('\n=== summary ===')
    for r in report:
        print('  ', r)


if __name__ == '__main__':
    main()
