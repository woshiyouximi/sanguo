import io
p = r"F:\sanguo\project\31_还原清单.md"
add = """
### §一之補 19（R179 玩家可见文案与军师技保留）

| # | 项 | 现象 | 修法 |
|---|---|---|---|
| 214 | 战报露内部名 | 月报出现 `韓馥·攻擊ai` | `campaign.html` 月报标签改用 `ACT_LABEL`（攻擊我方/攻擊他勢力/…），`ai_model.js` 的 `ACT_NAMES` 一字未改（测试钉死） |
| 215 | 界面露交办标记 | `[新設計]`/`[推測]` 出现在出征页与内政页的可见提示里 | 4 处可见文案去掉方括号标记，保留说明本身（如「原作只上陣 1 名主將 · 此處決定名冊順序」）；代码注释里的标记保留 |
| 216 | 军师技被出征页清掉 | `deploy.html` 用主将的 `listWisdomChoices` 重算，来自军师的 seq 不在表里 → `wise=0` | `?advisor=` 时不清；补一个已选中的格子（`軍師 X 的軍師技`），hint 前缀「軍師 嚴綱 · …」；实测 `?wise=32&advisor=嚴綱` → 提示「軍師 嚴綱 · 勸降：敵將忠誠 −15」、格子选中 |
"""
s = io.open(p, encoding="utf-8").read()
io.open(p, "w", encoding="utf-8", newline="\n").write(s + add)
print("ok")
