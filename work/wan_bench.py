"""基准测试：本机 Wan 2.2 TI2V 5B 图生视频的速度（用于云算力预算）。

跑法：python F:\\sanguo\\work\\wan_bench.py
产出：控制台打印每条视频的耗时；视频落在 F:\\AI\\ComfyUI\\output\\sg_wan_bench\\
"""
import json
import mimetypes
import os
import time
import urllib.request
import uuid
from pathlib import Path

HOST = "http://127.0.0.1:8188"
SRC = Path(os.environ.get("WAN_SRC", r"F:\sanguo\project\art_ref\hero_general.png"))

UNET = "wan2.2_ti2v_5B_fp16.safetensors"
CLIP = "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
VAE = "wan2.2_vae.safetensors"

PROMPT = (
    "a Chinese general in heavy bronze-trimmed armor, standing at rest, breathing lightly, "
    "sash and cape stirring in a light wind. "
    "painterly semi-realistic game sprite, muted palette, warm light from upper right, "
    "plain flat grey studio background, full body, facing camera."
)
NEG = (
    "camera movement, zoom, pan, cuts, scene change, cropped limbs, extra limbs, deformed hands, "
    "text, watermark, cartoon, cel shading, oversaturated, background scenery, other characters"
)


def post(path, payload):
    req = urllib.request.Request(HOST + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def get(path):
    with urllib.request.urlopen(HOST + path, timeout=60) as r:
        return json.loads(r.read().decode())


def upload(path):
    boundary = "----wan" + uuid.uuid4().hex
    data = path.read_bytes()
    ctype = mimetypes.guess_type(path.name)[0] or "image/png"
    body = b"".join([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="image"; filename="{path.name}"\r\n'.encode(),
        f"Content-Type: {ctype}\r\n\r\n".encode(),
        data, b"\r\n",
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n',
        f"--{boundary}--\r\n".encode(),
    ])
    req = urllib.request.Request(HOST + "/upload/image", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=180) as r:
        info = json.loads(r.read().decode())
    sub = info.get("subfolder") or ""
    return f"{sub}/{info['name']}" if sub else info["name"]


def graph(img, w, h, length, steps, cfg, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
        "3": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "wan", "device": "default"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": PROMPT}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": NEG}},
        "6": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "7": {"class_type": "LoadImage", "inputs": {"image": img}},
        "8": {"class_type": "Wan22ImageToVideoLatent", "inputs": {
            "vae": ["6", 0], "width": w, "height": h, "length": length,
            "batch_size": 1, "start_image": ["7", 0]}},
        "9": {"class_type": "KSampler", "inputs": {
            "model": ["2", 0], "seed": seed, "steps": steps, "cfg": cfg,
            "sampler_name": "euler", "scheduler": "simple",
            "positive": ["4", 0], "negative": ["5", 0],
            "latent_image": ["8", 0], "denoise": 1.0}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["6", 0]}},
        "11": {"class_type": "SaveWEBM", "inputs": {
            "images": ["10", 0], "filename_prefix": "sg_wan_bench/b", "codec": "vp9",
            "fps": 16.0, "crf": 18.0}},
    }


def run(tag, w, h, length, steps, cfg=5.0, seed=777):
    img = upload(SRC)
    t0 = time.time()
    r = post("/prompt", {"prompt": graph(img, w, h, length, steps, cfg, seed),
                         "client_id": uuid.uuid4().hex})
    pid = r["prompt_id"]
    while time.time() - t0 < 3600:
        time.sleep(3)
        hst = get("/history/" + pid)
        if pid in hst:
            st = hst[pid].get("status", {})
            if st.get("status_str") == "error":
                print(tag, "ERROR", json.dumps(st, ensure_ascii=False)[:400], flush=True)
                return
            files = [it for o in hst[pid].get("outputs", {}).values()
                     for v in o.values() if isinstance(v, list) for it in v
                     if isinstance(it, dict) and it.get("filename")]
            print("%-22s %4dx%-4d len=%-3d steps=%-2d -> %.0fs  (%s)" % (
                tag, w, h, length, steps, time.time() - t0,
                ", ".join(f["filename"] for f in files)), flush=True)
            return
    print(tag, "TIMEOUT", flush=True)


if __name__ == "__main__":
    run("5B_480p_2s", 832, 480, 33, 30)
    run("5B_480p_4s", 832, 480, 65, 30)
