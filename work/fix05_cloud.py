import pathlib
p = pathlib.Path(r'F:\sanguo\project\05_里程碑与任务拆解.md')
t = p.read_text(encoding='utf-8')
pairs = [
("## 1. M0 · 预研与数据管线（2 周）— 决定后面所有产能",
 "## 1. M0 · 预研与数据管线（2 周）— 决定后面所有产能\n\n> **快速验证通道（云已开）**：用户要求「能用云加速就加速」，因此 M0 的第 0 周改为**与云并行**——\n> D1 开云跑 `cloud/jobs_v0.csv`（27 条，6–8 min），D2 出金标准 3 张，同时本地跑 M0-1/M0-2。\n> 10 天冲刺的逐日排期见 `07_云GPU提速与快速验证方案.md` §11。"),
("| M0-6 | 美术金标准 3 张 + 批 1 首批（40 头像 + 15 身体 + 13 兵种） | 2 | 美术 | `art_ref/gold_*` | 制作人签字；`06 §8` 八道闸门全过 |",
 "| M0-6 | 美术金标准 3 张 + 批 1 首批（40 头像 + 双视角兵种底稿） | 2 | 美术 | `art_ref/gold_*` | **云上跑**（`07` §4–§5）：`cloud/jobs_v0.csv` 27 条 6–8 min；`06 §8` 八道闸门全过 |"),
("| M0-7 | Wan 视频转帧链路端到端跑通（一条兵种 walk → 序列帧进游戏） | 2 | 美术+前端 | `tools/anim_pipeline` | 12 帧序列帧在真机播放不抖 |",
 "| M0-7 | Wan 视频转帧链路端到端跑通（一条兵种 walk → 序列帧进游戏） | 2 | 美术+前端 | `tools/anim_pipeline` | 12 帧序列帧在真机播放不抖；**注意 Wan 5B 动作幅度偏小**（`07` §10.1） |"),
]
for a,b in pairs:
    if a not in t: print('MISS:', a[:40])
    t = t.replace(a,b)
p.write_text(t, encoding='utf-8')
print('05 ok')
