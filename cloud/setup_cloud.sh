#!/usr/bin/env bash
# 云 GPU 一键装环境：ComfyUI 0.43.0 + ComfyUI-GGUF（UnetLoaderGGUF 依赖它）
# 目标系统：Ubuntu 22.04 + NVIDIA 驱动 + CUDA 12.x（AutoDL / 腾讯 / 阿里 的 torch 镜像均可）
#
# 用法：
#   bash setup_cloud.sh              # 装环境
#   bash setup_cloud.sh --pull       # 额外从 ModelScope 拉公开权重（Qwen-Image / Wan2.2 官方版）
#   ROOT=/root/autodl-tmp bash setup_cloud.sh   # 换根目录（数据盘更划算）
set -euo pipefail

ROOT="${ROOT:-$HOME/sango_ai}"
VERSION="0.43.0"
PY="${PY:-python3}"

echo "==> ROOT=$ROOT  ComfyUI=$VERSION"

mkdir -p "$ROOT"/{ComfyUI,cache,out,logs}
cd "$ROOT"

# ---------- 1. 系统依赖 ----------
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -qq || apt-get update -qq || true
  sudo apt-get install -y -qq git wget curl ffmpeg libgl1 libglib2.0-0 rsync || true
fi

# ---------- 2. Python 依赖 ----------
# torch 版本与本机一致（2.9.1 + cu126）；云镜像若已装好 torch 会跳过
$PY -m pip install --upgrade pip -q
$PY - <<'PY'
import importlib, sys
need = []
for m in ("torch", "torchvision", "torchaudio"):
    try:
        importlib.import_module(m)
    except Exception:
        need.append(m)
if need:
    print("installing:", need)
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install",
                           "--index-url", "https://download.pytorch.org/whl/cu126"] + need)
else:
    import torch; print("torch ok:", torch.__version__, "cuda:", torch.cuda.is_available())
PY

# ---------- 3. ComfyUI ----------
if [ ! -d ComfyUI/.git ]; then
  git clone --depth 1 --branch "v${VERSION}" https://github.com/comfyanonymous/ComfyUI.git
else
  echo "ComfyUI 已存在，跳过 clone"
fi
$PY -m pip install -r ComfyUI/requirements.txt -q

# ---------- 4. 自定义节点（本机用到 GGUF 加载器） ----------
mkdir -p ComfyUI/custom_nodes
if [ ! -d ComfyUI/custom_nodes/ComfyUI-GGUF ]; then
  git clone --depth 1 https://github.com/city96/ComfyUI-GGUF.git ComfyUI/custom_nodes/ComfyUI-GGUF
  $PY -m pip install -r ComfyUI/custom_nodes/ComfyUI-GGUF/requirements.txt -q
fi

# ---------- 5. 模型目录骨架 ----------
mkdir -p ComfyUI/models/{diffusion_models,text_encoders,vae,loras}
mkdir -p ComfyUI/input ComfyUI/output

# ---------- 6. 可选：从 ModelScope 拉公开权重 ----------
if [ "${1:-}" = "--pull" ]; then
  $PY -m pip install -q modelscope
  # 注意：这两个是**公开官方仓库**；本机用的 int8_convrot 量化版若拉不到，
  # 用 upload.ps1 把本机文件传上来（见 models_manifest.json 的 fallback 字段）。
  $PY - <<'PY'
from modelscope import snapshot_download
import os
targets = [
    ("Qwen/Qwen-Image", "qwen_image_2.1_vae_bf16.safetensors", "vae"),
    ("Wan-AI/Wan2.2-TI2V-5B", "wan2.2_vae.safetensors", "vae"),
]
for repo, fn, sub in targets:
    try:
        p = snapshot_download(repo, allow_file_pattern=fn, cache_dir=os.path.expanduser("~/sango_ai/cache"))
        print("OK", repo, fn, p)
    except Exception as e:
        print("SKIP", repo, fn, type(e).__name__, e)
PY
fi

# ---------- 7. 启动提示 ----------
cat <<EOF

环境就绪：$ROOT/ComfyUI
  1) 放模型（models_check.py 校验）：
       python models_check.py --root $ROOT
  2) 起服务：
       cd $ROOT && python ComfyUI/main.py --listen 0.0.0.0 --port 8188 &
  3) 跑批：
       cd $ROOT && python ../run_batch.py --jobs jobs_v0.csv --workers 4 --out out
  4) 注意：**不要把 8188 直接暴露到公网**，用 SSH 隧道（本机 pull_results.ps1 里有 ssh -L 示例）。
EOF
