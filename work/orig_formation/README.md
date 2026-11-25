# work/orig_formation — 原作开局布阵 vs 我们的 createWorld（只读产物）

配套文档：`F:\sanguo\project\174_原作开局布阵.md`

## 一句话结论

- 原作场地 71×14 格、96×72 像素/格；开局 `gx = 表内x + anchorX + (200-N)/25`，`gy = 表内y`，A 侧 `gx = 71 - gx`。
- 方形 N=100：B 侧 x 10..20、A 侧 x 51..61、主将 (13,6)/(58,6)、两军最近 **31 格**。
- 我们：B 侧逐格相同；A 侧因为镜像写死 70（`battle.ts:689`）整体左移 1 格，最近 30 格；主将退到阵后 2 格。

## 图例

```
o / x  = B / A 侧士兵      O / X = B / A 侧骑兵（仅 cav 用例）
B / A  = B / A 侧主将      .     = 空格
列号 0..70 = 战场 x，行号 0..13 = 战场 y（与原作同一套格坐标）
```

## 文件

| 文件 | 内容 |
|---|---|
| `compare_N100.txt` | **主对照**：方形/錐形/箭矢 的原作 vs 我们（上下两幅同坐标 ASCII）；开头 9 行是 9 阵的 bbox/diff/最近距离/主将汇总 |
| `orig_all_N100.txt` | 9 个阵形 N=100 的原作 ASCII（全 14 行 × 71 列） |
| `orig_3form_N200.txt` | 3 个阵形 N=200 的原作 ASCII |
| `coords3.txt` | 方形/圓形/錐形/箭矢 × N=100/200：逐行 x 列表、mode 人数、最近对 |
| `orig_metrics.txt` | 9 阵 × N=100/200 的 bbox 与最近距离原始表 |
| `ours_initial.txt` | 我们 `createWorld()` 的初始格位（多组配置，含主将与兵种） |
| `ours_units.json` | 探针原始数据：`cells['f:100:side']` 100 格 × 18 组；`worlds` 各配置的 `[x,y,cd,kind]` |
| `data_map.txt` | `formations.json` 字段 → EXE 地址的映射 |
| `verify.py` | 生成 `compare_N100.txt` / `coords3.txt`（读 formations.json + ours_units.json） |
| `render.py` | 生成 `orig_all_N100.txt` / `orig_3form_N200.txt` / `orig_metrics.txt` |
| `probe_ours.ts` | `node` 直接跑：调 `createWorld()` 导出格位 → `ours_units.json` |
| `analyze.py` | 早期数据勘察脚本（字段统计） |
| `run1.txt` | 早期一次运行的输出留存（可删） |

## 复现

```powershell
# Python 用 bundle（裸 python 不存在）
$py='C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$env:PYTHONIOENCODING='utf-8'

& $py F:\sanguo\work\orig_formation\verify.py     # compare_N100.txt + coords3.txt
& $py F:\sanguo\work\orig_formation\render.py     # orig_* 三件

# 我们的现状（需先构建 game 的 dist 或在仓库根跑）
node F:\sanguo\work\orig_formation\probe_ours.ts  # ours_units.json
```

## 两个前提纠正

1. `formations.json` 里**没有 13×13 布阵表**。11×11 那张是阵形**相克**表（`0x48D2A0`，-25..+25）；布阵是 33 行坐标数组 + 权重/锚点表（`0x485B10` / `0x485DA8`）。ASCII 按真实网格 71×14 打印，行数 14（y0..13）。
2. 原作 A 侧镜像是 `71 - x`（`0x442D1B` 的 `0x47`），不是 70；`formations.json.slot_rule.formula` 和 `battle.ts:689` 都写成了 70。
