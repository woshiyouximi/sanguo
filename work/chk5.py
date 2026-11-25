import pathlib
p = pathlib.Path(r'F:\sanguo\project\31_还原清单.md')
t = p.read_text(encoding='utf-8')
anchor = "| 13 | 战力基准 | `150`（推断值，`battle.ts` 常量）"
i = t.index(anchor)
end = t.index("\n", i) + 1
add = """| 14 | 守将属性→战斗参数 | `bstr/bint` 直接塞守将的 STR/INT，没有原作那层"武力→兵种强度、智力→技力"换算 | 原作 `0x43xxxx` 把武将属性折算成队伍战力，映射公式未定位 | ⚠️ 待反汇编（`32` 文档已记） |
| 15 | 守军兵力 | `bsoldiers = 守军/6` 估 | `battleSetup().enemyTroops`（已实现，未接） | 🔧 一行可接 |
| 16 | AI 强度评估 | `rollAI` 仍用 `DEFENSE` 算强度 | 用城内真实守军+守将 | 🔧 只在 AI 决策里，玩家看不到 |
| 17 | 空城出兵的将名 | `spawnAiArmy` 从空城取将会 `undefined` | 空城不出兵或出"无名将" | ⚠️ 小概率 |
| 18 | 月末俸禄 | 武将数 × 3 金 `[新设计]` | 原作**无粮草/无俸禄**（`04c` 搜「糧」0 命中），月末只有钱粮/人口/忠诚/疲劳逐项变化 | ⚠️ 明确标 `[新设计]`，不是还原 |
"""
t = t[:end] + add + t[end:]
p.write_text(t, encoding='utf-8')
print('rows 14-18 added')
