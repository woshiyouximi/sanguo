# 三国群英传2（修正版 1.05+）完整拆解工程

本目录是对 `C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\` 下
`Sango2.exe` + `Sango2.PAK` 的**全量逆向与资源导出**，目的是给"参考它做新游戏"提供事实依据。

## 从哪开始看

| 目标 | 入口 |
|---|---|
| 先看全局 | [`docs/00_项目总览与文档索引.md`](docs/00_项目总览与文档索引.md) |
| 要设计新游戏（策划） | [`docs/08_新游戏设计参考.md`](docs/08_新游戏设计参考.md) |
| 要看代码逻辑（程序） | [`docs/04_引擎架构与代码逻辑总览.md`](docs/04_引擎架构与代码逻辑总览.md) → [`04b_战斗系统`](docs/04b_战斗系统.md) → [`04-脚本引擎SmartScript`](docs/04-脚本引擎SmartScript.md) |
| 要看战斗细节 | [`04b1_阵形站位表`](docs/04b1_阵形站位表.md) / [`04b2_招降斩首与战后结算`](docs/04b2_招降斩首与战后结算.md) / [`04b3_单挑流程`](docs/04b3_单挑流程.md) / [`04b4_普攻伤害与Process`](docs/04b4_普攻伤害与Process.md) |
| 要看技能特效 | [`docs/05c_MAGIC特效映射.md`](docs/05c_MAGIC特效映射.md)（110 技 → `SHAPE\MAGIC\` 目录） |
| 要改存档 | [`docs/07_存档格式.md`](docs/07_存档格式.md) → [`07b_存档字段详解`](docs/07b_存档字段详解.md) + `tools/save_layout.py` |
| 要看数值（策划） | [`docs/03b_XLS宝典数值分析.md`](docs/03b_XLS宝典数值分析.md) + [`03a-武将技表MAGIC`](docs/03a-武将技表MAGIC.md) |
| 要看美术 | [`docs/02-美术资源与格式.md`](docs/02-美术资源与格式.md) + `export/png/`（10,969 张 PNG） |
| **字段偏移有冲突时** | 以 [`docs/00`](docs/00_项目总览与文档索引.md) **§9「跨文档一致性修正」为准** |

## 目录

| 目录 | 内容 |
|---|---|
| `extract/pak/` | PAK 解包出的 11,110 个原始文件（含全部 INI / SO / SHP / WAV） |
| `extract/json/` | 31 个 JSON：INI 与 Excel 宝典解析后的结构化数据 + 统计 |
| `export/png/SHAPE/` | 10,969 张解码后的精灵 PNG（目录结构与原 PAK 一致） |
| `export/png/tex/`、`export/png/tga/` | 整屏图 7 张、512×512 地面材质 12 张（正确解码） |
| `export/png/msk/` | 4 张地形编号图 + 与地图的叠加验证图 |
| `export/sheets/` | 22 张 contact sheet（按目录总览，找素材用这个最快） |
| `export/script/` | `MAGIC.SO` / `SYSTEM.SO` 反汇编（2.37 MB + 184 KB） |
| `export/manifest_art.json` | 11,113 条资源清单（尺寸 / 色键 / 偏移 / 用途） |
| `docs/` | 文档集 24 篇（850 KB） |
| `docs/img/` | 文档配图（大地图 / 40 张头像 / 标题 / 12 地形 / 12 地面） |
| `tools/` | 全部可运行的 Python 工具（解包 / 解码 / 反汇编 / 导出 / 统计） |
| `work/` | 中间产物：反汇编 dump、函数地图、验证脚本、`BRIEF.md`（协作简报） |

## 环境

本机无系统 Python，统一使用：

```
C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe
```

已安装：`capstone`、`pefile`、`Pillow`、`xlrd`、`pandas`。
控制台中文输出前先设 `$env:PYTHONIOENCODING='utf-8'` 并把 `[Console]::OutputEncoding` 设为 UTF-8。

## 三个最容易踩的坑

1. **PAK 索引项的名字字段是 40 字节**（不是 16），且头部 `count` 字段不可信（写 16447，实际 11110）——必须按 offset 链遍历。
2. **PAK 内所有 INI 是 cp950（Big5 繁体）**，不是 GBK；外层目录的 `.txt` 说明才是 GBK。
3. **判断未知图形格式要看引擎怎么读它**（反汇编 20 行），别用"图像相似度"反推位布局——本项目在 `.TEX` 上因此判错过两次。

## 版权

仅用于架构与设计研究，**不要直接复用原作的美术/音乐/文本素材**（1999 年 Odin Soft / 宇峻 版权作品）。
