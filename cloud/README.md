# cloud/ — 把本机的 Qwen / Wan 出图搬到云 GPU

目标：**同一套 ComfyUI 工作流、同一批 prompt、同一批 seed**，在云上多卡并行跑完，结果回传本地。
本目录是"可搬运的完整出图环境"，不含业务数据（prompt 清单由 `make_jobs.py` 从 `project/art_ref/` 生成）。

## 三步

```bash
# 1) 云机（AutoDL / 腾讯 / 阿里，Ubuntu 22.04 + CUDA 12.1 镜像）
bash setup_cloud.sh                 # 装 ComfyUI 0.43.0 + ComfyUI-GGUF + 目录

# 2) 把模型放进去（二选一）
#    a. 本机跑 upload.ps1（分卷 + scp/rsync，35.8 GB）
#    b. 云上从 ModelScope/HF 拉（见 setup_cloud.sh --pull）
python models_check.py              # 校验 6 个文件的 size 与 sha256 前缀

# 3) 起服务 + 跑批
python ComfyUI/main.py --listen 0.0.0.0 --port 8188 &
python run_batch.py --jobs jobs_v0.csv --workers 4 --out ./out
```

结果在 `./out/<id>.png|.webm` + `./out/_manifest.json`，用 `pull_results.ps1` 拿回本地。

## 文件

| 文件 | 作用 |
|---|---|
| `setup_cloud.sh` | 装环境（torch 2.9 cu126、ComfyUI 0.43.0、ComfyUI-GGUF、目录骨架） |
| `models_manifest.json` | 6 个必需模型的 size（+可选 sha256 前缀），`models_check.py` 用它校验 |
| `models_check.py` | 缺哪个报哪个，不静默 |
| `upload.ps1` | 本机→云：`tar` 分卷 + `scp`/`rsync`，可断点续传 |
| `pull_results.ps1` | 云→本机：拉 `out/` 与 `_manifest.json` |
| `run_batch.py` | CSV 驱动的批处理：断点续跑、并发 worker、失败重试、逐条 manifest |
| `make_jobs.py` | 从 `project/art_ref/角色卡_40将.md` 等生成 jobs CSV |
| `jobs_v0.csv` | V0 验证包（2 兵种双视角 + 8 将 + 4 特效 + 背景 + UI）样例 |
| `workflows/qwen_t2i.json` | 本机验证过的 API 格式工作流（Qwen-Image 2.1） |
| `workflows/wan_i2v.json` | 本机验证过的 Wan 2.2 TI2V 5B 图生视频工作流 |

## 与主项目的关系

- 主项目文档在 `../project/`；云方案说明见 `../project/07_云GPU提速与快速验证方案.md`。
- 工作流与参数口径以 `../project/03_美术风格与资源规范.md` 为准（尺寸、帧数、seed 族）。
- 这里只做"出图/出视频"，**不做精修**（精修仍是人的活，见 `03 §3.13.1`）。
