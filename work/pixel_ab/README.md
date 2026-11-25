# work\pixel_ab —— 像素化 A/B 产物（2026-11-25）

对应文档：`project\43_像素化实验.md`（本目录的完整说明）、`project\37b_美术对照.md` §6。
原件 `game\web\**` 一个字节都没动。

## 能直接拿来用的（推荐）

| 文件 | 说明 |
|---|---|
| `units_00.px.png` | 兵种 59 帧 · 32 色板 · 1px 外侧描边 · 已清接地光斑 · **尺寸/帧矩形与原件完全一致** |
| `atlas_00.png` 对应 `atlas_00.px.png` | 攻击/受击 51 帧，同上 |
| `actions_00.png` 对应 `actions_00.px.png` | 动作集 44 帧，同上 |
| `png8\units_00.px.png` 等 3 张 | 上表同图的 8bit 索引色版：**像素逐点一致**，体积再降 3–4 倍（58.7 / 57.8 / 39.7 KB） |

json（`units.json` / `atlas.json` / `actions.json`）**不用改**：输出尺寸恒定、帧矩形未变，
把加载路径指向 `*.px.png` 即可（这是 `main.js` 里的一处路径改动，本轮不改 main.js）。
切回原版 = 不引用本目录。

## 证据 / 参考

| 路径 | 内容 |
|---|---|
| `report.json` | 交付版逐帧统计（帧名、矩形、色数前/后、不透明像素、色板、描边 px） |
| `report_default.json` | 纯默认链（**不带** `--kill-glint`）的同口径统计，用于文档里的对照列 |
| `_alt_default\*.px.png` | 纯默认链产物（脚下留白斑的版本） |
| `_groups\*.before.png` / `*.after.png` | 3 组代表（archer_back / archer_front / walk_side）各 4 帧的条图，透明底，可直接叠任何背景看 |
| `_hero\guanyu_32.png` / `guanyu_32px2.png` | 立绘 32 色 / 32 色 + 2× 像素化（480×701 原尺寸） |
| `_bg\terrain_04.q32n.png` | 对比图用的 32 色地形底图（`q32d` 是 bayer4 抖动版） |
| `_var\` | 参数扫描产物：`c16` / `c24`（色数）、`32ogp2`（+2× 像素化）、`32d`（bayer4）… |
| `_probe\` | 证据图与脚本：`sweep.png`（5 变体）、`colors_test.png`（16/24/32 对比）、`glint.png`（清亮斑前后）、`zoom1.png`（7× 细节）、`make_sheets.py`（两张对比图的生成脚本） |
| `batch\` | `tools\apply_pixel_post.py` 的实测产物（anim 3 张 + fx 42 张 + 改写过的 `fx\index.json` + `manifest.json`） |

## 复现命令

```powershell
$py = "C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
cd F:\sanguo
# 交付版（RGBA）
& $py tools\pixel_post.py game\web\anim\units_00.png game\web\anim\atlas_00.png game\web\anim\actions_00.png `
    -o work\pixel_ab --suffix .px --kill-glint --report work\pixel_ab\report.json
# 同像素的 8bit 索引版
& $py tools\pixel_post.py game\web\anim\units_00.png game\web\anim\atlas_00.png game\web\anim\actions_00.png `
    -o work\pixel_ab\png8 --suffix .px --kill-glint --png8
# 对比图
& $py work\pixel_ab\_probe\make_sheets.py
```
