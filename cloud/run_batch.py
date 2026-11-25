#!/usr/bin/env python3
"""CSV 驱动的 ComfyUI 批处理（Qwen-Image 2.1 文生图 / Wan 2.2 TI2V 5B 图生视频）。

设计目标：**断点续跑**。云机被抢占、SSH 掉线、OOM 重启，只要 CSV 不变，
重跑同一条命令就会跳过已完成的 id，从断点继续。

用法：
    python run_batch.py --jobs jobs_v0.csv --workers 4 --out ./out
    python run_batch.py --jobs jobs_v0.csv --dry-run          # 只校验 CSV，不连服务器
    python run_batch.py --jobs jobs_v0.csv --filter kind=t2i  # 只跑文生图
    python run_batch.py --jobs jobs_v0.csv --only hero_001,hero_002

CSV 列（表头必须有，多余列忽略）：
    id,kind,prompt,negative,width,height,seed,steps,cfg,length,image
    kind: t2i | i2v
    length: i2v 的帧数（33 或 65），t2i 留空
    image: i2v 的起始图（相对 ./ComfyUI/input 或绝对路径）
"""
import argparse
import csv
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

HOST = os.environ.get("COMFY_HOST", "http://127.0.0.1:8188")
PRINT_LOCK = threading.Lock()


def log(msg):
    with PRINT_LOCK:
        print(msg, flush=True)


def post(path, obj, timeout=60):
    req = urllib.request.Request(HOST + path, data=json.dumps(obj).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def get(path, timeout=60):
    with urllib.request.urlopen(HOST + path, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


# ---------------------------------------------------------------- 图构建

def build_t2i(p, seed, w, h, steps, cfg, neg=""):
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "qwen_image_2.1_Q8_0.gguf"}},
        "2": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.1}},
        "3": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen3vl_8b_int8_convrot.safetensors", "type": "qwen_image", "device": "default"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "5": {"class_type": "TextEncodeQwenImage21", "inputs": {
            "clip": ["3", 0], "prompt": p, "negative_prompt": neg, "resolution": 1024, "images": []}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {
            "model": ["2", 0], "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "euler",
            "scheduler": "simple", "positive": ["5", 0], "negative": ["5", 1],
            "latent_image": ["6", 0], "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["4", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "sango"}},
    }


def build_i2v(p, n, seed, w, h, steps, cfg, length, image):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
        "3": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": p}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": n}},
        "7": {"class_type": "LoadImage", "inputs": {"image": image, "upload": "image"}},
        "8": {"class_type": "Wan22ImageToVideoLatent", "inputs": {
            "vae": ["4", 0], "width": w, "height": h, "length": length, "batch_size": 1,
            "start_image": ["7", 0]}},
        "9": {"class_type": "KSampler", "inputs": {
            "model": ["2", 0], "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "euler",
            "scheduler": "simple", "positive": ["5", 0], "negative": ["6", 0],
            "latent_image": ["8", 0], "denoise": 1.0}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["4", 0]}},
        # 输出**逐帧 PNG**（不合成视频）：序列帧管线的下一步就是抠像 + 归一，给视频还得再拆一次
        "11": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": "sango_seq"}},
    }


# ---------------------------------------------------------------- 单任务

def run_one(row, out_dir, timeout=1800, retries=2):
    rid = row["id"]
    kind = (row.get("kind") or "t2i").strip().lower()
    ext = ".png"
    done_flag = os.path.join(out_dir, rid + ".done")
    if os.path.exists(done_flag):
        return ("skip", rid, 0.0)

    seed = int(row.get("seed") or 0)
    w = int(row.get("width") or 832)
    h = int(row.get("height") or 1216)
    steps = int(row.get("steps") or 20)
    cfg = float(row.get("cfg") or 3.0)
    prompt = row["prompt"].strip()
    negative = (row.get("negative") or "").strip()

    if kind == "t2i":
        graph = build_t2i(prompt, seed, w, h, steps, cfg, negative)
    elif kind == "i2v":
        length = int(row.get("length") or 33)
        img = (row.get("image") or "").strip()
        if not img:
            return ("error", rid, 0.0, "i2v 缺 image 列")
        graph = build_i2v(prompt, negative, seed, w, h, steps, cfg, length, img)
    else:
        return ("error", rid, 0.0, "未知 kind=%s" % kind)

    last = ""
    for attempt in range(retries + 1):
        t0 = time.time()
        try:
            r = post("/prompt", {"prompt": graph, "client_id": str(uuid.uuid4())})
            pid = r["prompt_id"]
            while time.time() - t0 < timeout:
                hist = get("/history/" + pid)
                if pid in hist:
                    st = hist[pid].get("status", {})
                    if st.get("status_str") != "success":
                        msg = ""
                        for m in st.get("messages", []):
                            if m[0] == "execution_error":
                                msg = (m[1].get("exception_message") or "")[:240]
                        last = "执行失败: " + (msg or st.get("status_str"))
                        break
                    got = 0
                    for _, o in hist[pid].get("outputs", {}).items():
                        for im in o.get("images", []):
                            src = os.path.join(os.environ.get("COMFY_OUTPUT", "ComfyUI/output"),
                                               im.get("subfolder", ""), im["filename"])
                            if os.path.exists(src):
                                dst = os.path.join(out_dir, rid + ("_%02d" % got if got else "") + ext)
                                _link_or_copy(src, dst)
                                got += 1
                    if got == 0:
                        last = "无输出文件"
                        break
                    open(done_flag, "w").write(str(got))
                    return ("ok", rid, time.time() - t0, got)
                time.sleep(2)
            else:
                last = "超时 %.0fs" % timeout
        except urllib.error.HTTPError as e:
            last = "HTTP %s: %s" % (e.code, e.read()[:200])
        except Exception as e:                      # noqa: BLE001
            last = "%s: %s" % (type(e).__name__, e)
        time.sleep(3 * (attempt + 1))
    return ("error", rid, 0.0, last)


def _link_or_copy(src, dst):
    import shutil
    try:
        os.link(src, dst)
    except Exception:
        shutil.copyfile(src, dst)


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--out", default="./out")
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--filter", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--timeout", type=int, default=1800)
    ap.add_argument("--retries", type=int, default=2)
    a = ap.parse_args()

    rows = list(csv.DictReader(open(a.jobs, encoding="utf-8-sig")))
    if a.filter:
        k, _, v = a.filter.partition("=")
        rows = [r for r in rows if (r.get(k) or "").strip() == v]
    if a.only:
        want = set(x.strip() for x in a.only.split(",") if x.strip())
        rows = [r for r in rows if r["id"] in want]
    if not rows:
        print("没有匹配的任务"); return 2
    if a.dry_run:
        for r in rows:
            print("%-24s %-4s %sx%s seed=%s" % (r["id"], r["kind"], r.get("width"), r.get("height"), r.get("seed")))
        print("\n共 %d 条（dry-run，未连服务器）" % len(rows)); return 0

    os.makedirs(a.out, exist_ok=True)
    man_path = os.path.join(a.out, "_manifest.json")
    man_lock = threading.Lock()
    man = {"host": HOST, "jobs": {}, "started": time.strftime("%Y-%m-%dT%H:%M:%S")}

    t_start = time.time()
    q = list(rows)
    qlock = threading.Lock()
    counters = {"ok": 0, "skip": 0, "error": 0}

    def worker():
        while True:
            with qlock:
                if not q:
                    return
                row = q.pop(0)
            res = run_one(row, a.out, a.timeout, a.retries)
            status = res[0]
            with man_lock:
                counters[status] = counters.get(status, 0) + 1
                man["jobs"][row["id"]] = {"status": status, "sec": round(res[2], 1),
                                          "files": res[3] if len(res) > 3 else 0,
                                          "err": res[3] if status == "error" and len(res) > 3 else ""}
                json.dump(man, open(man_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                n = sum(counters.values())
                log("[%d/%d] %-24s %-6s %5.1fs" % (n, len(rows), row["id"], status, res[2]))

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(max(1, a.workers))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    man["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    man["elapsed_sec"] = round(time.time() - t_start, 1)
    man["counters"] = counters
    json.dump(man, open(man_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\n完成 %d / 跳过 %d / 失败 %d，用时 %.1f 分钟" % (
        counters.get("ok", 0), counters.get("skip", 0), counters.get("error", 0),
        (time.time() - t_start) / 60))
    print("manifest:", man_path)
    return 0 if counters.get("error", 0) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
