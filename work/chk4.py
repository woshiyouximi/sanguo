import pathlib, subprocess, datetime
p = pathlib.Path(r'F:\sanguo\project\31_还原清单.md')
t = p.read_text(encoding='utf-8')
add = """
## 三、轮次对比（每轮汇总必更新，按用户 2026-11-24 22:0x 的要求）

| 轮次 | 本轮消掉的缺口 | 本轮新发现的问题 | 仍缺 |
|---|---|---|---|
| R1（11-24 21:43 前） | — | 13 处取巧被逐条列出 | 全部 |
| R2 | 内政 8 命令、行军实体、地形进战力、招降入城、兵种/阵形白名单、兵力上限、BaseMP、军师技 67 条分类、真实守将 300 城 | `deploy.html` 的主将候选错取了**目标城**武将（打南皮时弹出沮授/颜良） | 军师技 18 条消费点、脚本逐帧 |
| R3 | 脚本 VM 接进 `cast()`（109/110 技能可跑）；修掉 `node:fs` 导致整页白屏；`main.js` 预加载 + 同步 XHR 兜底 | 636 死循环（`劍輪舞`）；`WAIT` 不真挂起 | 逐帧驱动、骑兵/弓兵美术、Cocos 未吃新逻辑 |

> 规矩：**每轮汇总必须回看上表最后一行**，把"仍缺"里的项逐条对照，做到就填证据、做不到就写明原因与计划。不许把没做的从表里悄悄划掉。
"""
if '## 三、轮次对比' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('section 3 added')
