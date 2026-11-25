| SEQUENCE | 條目 | Execute | 檔 | 狀態 | 消費點 / 缺什麼 |
| ---: | --- | ---: | :--: | --- | --- |
| 2 | 降敵士氣 | 1 | 1 | 生效 · 戰前 | `sides[x].morale` → `powerOf()` 士气项（R69 量测） |
| 19 | 降敵士氣 | 2 | 2 | 生效 · 戰前 | `sides[x].morale` → `powerOf()` 士气项（R69 量测） |
| 39 | 降敵士氣 | 3 | 3 | 生效 · 戰前 | `sides[x].morale` → `powerOf()` 士气项（R69 量测） |
| 1 | 鼓舞士氣 | 4 | 1 | 生效 · 戰前 | `sides[x].morale` → `powerOf()` 士气项（R69 量测） |
| 18 | 鼓舞士氣 | 5 | 2 | 生效 · 戰前 | `sides[x].morale` → `powerOf()` 士气项（R69 量测） |
| 38 | 鼓舞士氣 | 6 | 3 | 生效 · 戰前 | `sides[x].morale` → `powerOf()` 士气项（R69 量测） |
| 28 | 亂陣 | 7 | 獨有 | 生效 · 戰中 | 我軍 x/y 散開 + `rt.formation`（battle.ts:1536） |
| 29 | 太公陣 | 8 | 獨有 | 生效 · 戰中 | 我軍 x/y 回陣 + `rt.formation`（battle.ts:1536） |
| 4 | 擾亂敵將 | 9 | 1 | 生效 · 戰前 | `settle().tire.{A,B}.before` ← `general.tire`（battle.ts:2065，R84 量测） |
| 25 | 擾亂敵將 | 10 | 2 | 生效 · 戰前 | `settle().tire.{A,B}.before` ← `general.tire`（battle.ts:2065，R84 量测） |
| 51 | 擾亂敵將 | 11 | 3 | 生效 · 戰前 | `settle().tire.{A,B}.before` ← `general.tire`（battle.ts:2065，R84 量测） |
| 5 | 減少疲勞 | 12 | 1 | 生效 · 戰前 | `settle().tire.{A,B}.before` ← `general.tire`（battle.ts:2065，R84 量测） |
| 27 | 減少疲勞 | 13 | 2 | 生效 · 戰前 | `settle().tire.{A,B}.before` ← `general.tire`（battle.ts:2065，R84 量测） |
| 50 | 減少疲勞 | 14 | 3 | 生效 · 戰前 | `settle().tire.{A,B}.before` ← `general.tire`（battle.ts:2065，R84 量测） |
| 14 | 增加體力 | 15 | 1 | 生效 · 戰前 | `general.maxHp` ↑ + 同额補满 → 存活/受击（R69 量测） |
| 43 | 增加體力 | 16 | 2 | 生效 · 戰前 | `general.maxHp` ↑ + 同额補满 → 存活/受击（R69 量测） |
| 61 | 增加體力 | 17 | 3 | 生效 · 戰前 | `general.maxHp` ↑ + 同额補满 → 存活/受击（R69 量测） |
| 13 | 增加技力 | 18 | 1 | 生效 · 戰前 | `general.mpMax` ↑ + 同额補满 → `cast()` 的技力闸 / HUD（R69 量测） |
| 42 | 增加技力 | 19 | 2 | 生效 · 戰前 | `general.mpMax` ↑ + 同额補满 → `cast()` 的技力闸 / HUD（R69 量测） |
| 60 | 增加技力 | 20 | 3 | 生效 · 戰前 | `general.mpMax` ↑ + 同额補满 → `cast()` 的技力闸 / HUD（R69 量测） |
| 17 | 增強攻擊 | 21 | 1 | 生效 · 戰前 | `powerOf()` 兵攻乘数（R69 量测） |
| 46 | 增強攻擊 | 22 | 2 | 生效 · 戰前 | `powerOf()` 兵攻乘数（R69 量测） |
| 64 | 增強攻擊 | 23 | 3 | 生效 · 戰前 | `powerOf()` 兵攻乘数（R69 量测） |
| 16 | 強化士兵 | 24 | 1 | 生效 · 戰前 | `powerOf()` 兵攻乘数（R69 量测） |
| 45 | 強化士兵 | 25 | 2 | 生效 · 戰前 | `powerOf()` 兵攻乘数（R69 量测） |
| 63 | 強化士兵 | 26 | 3 | 生效 · 戰前 | `powerOf()` 兵攻乘数（R69 量测） |
| 15 | 混亂敵軍 | 27 | 1 | 生效 · 戰中 | `atkMod` 我 +5 / 敵 −5（battle.ts:1233） |
| 44 | 混亂敵軍 | 28 | 2 | 生效 · 戰中 | `atkMod` 我 +10 / 敵 −10（battle.ts:1233） |
| 62 | 混亂敵軍 | 29 | 3 | 生效 · 戰中 | `atkMod` 我 +15 / 敵 −15（battle.ts:1233） |
| 6 | 離間計 | 30 | 1 | 生效 · 戰前 | `settle().loyalty.{A,B}.before` ← `general.loyal`（battle.ts:2062，R84 量测） |
| 34 | 離間計 | 31 | 2 | 生效 · 戰前 | `settle().loyalty.{A,B}.before` ← `general.loyal`（battle.ts:2062，R84 量测） |
| 55 | 離間計 | 32 | 3 | 生效 · 戰前 | `settle().loyalty.{A,B}.before` ← `general.loyal`（battle.ts:2062，R84 量测） |
| 32 | 勸降 | 33 | 獨有 | 生效 · 戰前 | `settle().loyalty.B.before`（帶忠誠>90 / 節操>5 雙閘，battle.ts:2062，R84 量测） |
| 3 | 後選出陣 | 34 | 獨有 | **SYSO_UNSUPPORTED** | 本作沒有「出陣隊列」→ 需要 SSAV 預備兵欄位或 EVENT 表事件（見 §5） |
| 11 | 恢復體力 | 35 | 1 | 生效 · 戰前 | `general.hp` ↑ → 存活/受击（R69 量测） |
| 40 | 恢復體力 | 36 | 2 | 生效 · 戰前 | `general.hp` ↑ → 存活/受击（R69 量测） |
| 57 | 恢復體力 | 37 | 3 | 生效 · 戰前 | `general.hp` ↑ → 存活/受击（R69 量测） |
| 12 | 恢復技力 | 38 | 1 | 生效 · 戰前 | `general.mp` ↑ → 下一發 `cast()`（R69 量测） |
| 41 | 恢復技力 | 39 | 2 | 生效 · 戰前 | `general.mp` ↑ → 下一發 `cast()`（R69 量测） |
| 58 | 恢復技力 | 40 | 3 | 生效 · 戰前 | `general.mp` ↑ → 下一發 `cast()`（R69 量测） |
| 22 | 強化武將 | 41 | 1 | 生效 · 戰前 | `general.str` → `hitChance()` / `basicDamage()`（R69 量测） |
| 49 | 強化武將 | 42 | 2 | 生效 · 戰前 | `general.str` → `hitChance()` / `basicDamage()`（R69 量测） |
| 67 | 強化武將 | 43 | 3 | 生效 · 戰前 | `general.str` → `hitChance()` / `basicDamage()`（R69 量测） |
| 54 | 十面埋伏 | 44 | 獨有 | 生效 · 戰前 | `world.units` 後排伏兵 → `aliveCount` / 战功（R69 量测） |
| 10 | 詐敗 | 45 | 獨有 | 生效 · 戰中 | `flags|mayRetreat` → 撤退率 0.5（battle.ts:1607） |
| 31 | 保護主將 | 46 | 獨有 | 生效 · 戰中 | `flags|guardGeneral` + `takenMul` 0.75（battle.ts:1461） |
| 26 | 包圍敵軍 | 47 | 獨有 | 生效 · 戰中 | `moveMul` 1.15 / 敵 0.9 + `formation`（battle.ts:1407/1536） |
| 30 | 偷襲敵軍 | 48 | 獨有 | 生效 · 戰中 | `moveMul` 1.2（battle.ts:1407） |
| 23 | 逼近敵軍 | 49 | 獨有 | 生效 · 戰中 | `moveMul` 1.1（battle.ts:1407） |
| 9 | 快速集氣 | 50 | 1 | 生效 · 戰前 | `tickSkills()` 集氣 `(1 + wiseBonus/100)`（R69 量测） |
| 37 | 快速集氣 | 51 | 2 | 生效 · 戰前 | `tickSkills()` 集氣 `(1 + wiseBonus/100)`（R69 量测） |
| 52 | 快速集氣 | 52 | 3 | 生效 · 戰前 | `tickSkills()` 集氣 `(1 + wiseBonus/100)`（R69 量测） |
| 21 | 增加經驗 | 53 | 1 | 生效 · 戰前 | `settle().expGain` 戰後經驗（R69 量测） |
| 47 | 增加經驗 | 54 | 2 | 生效 · 戰前 | `settle().expGain` 戰後經驗（R69 量测） |
| 65 | 增加經驗 | 55 | 3 | 生效 · 戰前 | `settle().expGain` 戰後經驗（R69 量测） |
| 33 | 金蟬脫殼 | 56 | 獨有 | 生效 · 戰中 | `flags|fleeAnytime` → 撤退率 1（battle.ts:1607） |
| 24 | 化解計策 | 57 | 獨有 | 生效 · 戰前 | `army[敵].seq` 清空 → 敵方整場不派發（strategy.ts:779，R84 量测） |
| 20 | 喝阻敵軍 | 58 | 1 | 生效 · 戰前 | `sides[x].morale` → `powerOf()` 士气项（R69 量测） |
| 48 | 喝阻敵軍 | 59 | 2 | 生效 · 戰前 | `sides[x].morale` → `powerOf()` 士气项（R69 量测） |
| 66 | 喝阻敵軍 | 60 | 3 | 生效 · 戰前 | `sides[x].morale` → `powerOf()` 士气项（R69 量测） |
| 8 | 保留氣力 | 61 | 1 | 生效 · 戰前 | `qiCostMul()` 技能氣力消耗（R69 量测） |
| 36 | 保留氣力 | 62 | 2 | 生效 · 戰前 | `qiCostMul()` 技能氣力消耗（R69 量测） |
| 56 | 保留氣力 | 63 | 3 | 生效 · 戰前 | `qiCostMul()` 技能氣力消耗（R69 量测） |
| 59 | 封武將技 | 64 | 獨有 | 生效 · 戰中 | 敵 `flags|sealMagic` → `cast()` 被拒（battle.ts:1762） |
| 7 | 減緩集氣 | 65 | 1 | 生效 · 戰前 | `tickSkills()` 集氣 `(1 + wiseBonus/100)`（R69 量测） |
| 35 | 減緩集氣 | 66 | 2 | 生效 · 戰前 | `tickSkills()` 集氣 `(1 + wiseBonus/100)`（R69 量测） |
| 53 | 減緩集氣 | 67 | 3 | 生效 · 戰前 | `tickSkills()` 集氣 `(1 + wiseBonus/100)`（R69 量测） |
<!-- 統計：生效·戰前 54 / 生效·戰中 12 / 佔位 1 / 合計 67 -->

合計 **54 + 12 + 1 = 67** 條（新表 67 條）。
