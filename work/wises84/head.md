# 94 軍師技補全（R84）

> **一頁結論**：`game/data/wises.json` 的 67 條軍師技，**54 條在戰前 `applyWise` 有數值落點、12 條在戰中派發器（`strategy.ts`）有落點、1 條真佔位**（`3 後選出陣`）。
>
> 上一輪（`project/52`、`project/37a` R69）記的「24 條還是佔位」**不成立**：這 24 條裡 **23 條本來就有消費點**——其中 12 條的消費點在戰中派發器（`0x44D450` 的 `Execute` 分支）而非 `wises.ts`，另 11 條才是真的缺接線，本輪補上。
>
> 本輪 `battle.ts` **改動 0 行**：11 條新效果全部寫進 `battle.ts` 既有讀取的欄位（`general.tire` / `general.loyal` / `army.seq`）。新增邏輯集中在新檔 `game/src/core/wises_effects.ts`。

## 1 口徑

**「有消費點」的三條路徑**（缺一即不算生效）：

| 路徑 | 入口 | 寫什麼 | 誰讀 |
| --- | --- | --- | --- |
| 戰前 | `applyWise(world, side, seq)`（`wises.ts`，出征/開戰前調用） | `world.sides[x]` 的 `morale/hp/maxHp/mp/mpMax/str`、`world.units`，以及 `world.wises` 修正表（`qi_regen/qi_cost/troop_atk/exp_bonus`，由 `wiseBonus` 讀） | `battle.ts` 的 `powerOf` / `hitChance` / `basicDamage` / `cast` / `tickSkills` / `settle` |
| 戰中 | `planStrategy` → `runStrategy`（`strategy.ts`，`tickStrategy` 每 tick 派發一次） | `world.army[x]` 的 `atkMod/flags/moveMul/takenMul/qiTier/qiParam/expPct`（`posture` 只被記錄，`battle.ts` 無讀取），或 `sides[x].morale/loyal`、`units` 座標 | 同上（`battle.ts:1233/1407/1461/1536/1582/1607/1711/1762/1840`） |
| 無 | 只有日誌/`{op:'note'}` | — | — → 佔位 |

**數據源與依據**
- 條目/檔位：`game/data/wises.json`（`SEQUENCE` / `Execute` / `WiseLevel` / `NAME`）。
- 派發器強度：`game/src/core/strategy.ts` 的 `STRATEGY_TABLE`（67 條，註釋帶 `0x44D450` 分支地址）與 `runStrategy` 的 `ops`。
- 戰前強度：`game/src/core/wises.ts` 的 `SPECS` / `WISE_EXTRA_SPECS`。
- 疲勞語義：`docs/04b5_战力基准与疲劳反汇编.md` §2.2 / §2.5（[确认]：疲勞在戰力與命中判定裡一次都沒被讀）。
- 招降語義：`game/src/core/capture.ts:160-166` 的 `profileOf`（`L`=忠誠、`C`=節操）。

**類數**：`Execute 1..67` = **31 類**，其中 18 類三檔（54 條）+ 13 類獨有（13 條）。與上一輪記的「66 分支 = 22 類 × 3 檔」差 1，以 `wises.json` + `STRATEGY_TABLE`（實測 67 條）為準。

## 2 全表（67 行，按 `Execute` 排序）
