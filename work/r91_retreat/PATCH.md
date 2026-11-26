# R91「撤退態 不還手」補丁方案

> 證據見 `F:\sanguo\work\r91_retreat\REPORT.md`。
> **本文件只是方案，不改任何代碼**；`battle.ts` 此刻被另一智能體佔用，由 lead 合併。
> 行號是 2026-11-26 08:2x 對 `F:\sanguo\game\src\core\battle.ts`（3691 行）的快照。**該文件正在被編輯，合併前請用符號名 grep 重新定位。**

---

## 0. 一句話

原作「撤退不還手」的機制不在攻擊函數裡，而在**選目標**：`0x43BCA7` 對 `0x4000` 態把搜敵降級成「**只朝朝向那一側、只 1 格**」。所以補丁**只改 `adjacentEnemy()` 一處**（加 3 行 + 1 個小 helper），攻擊/傷害/結算鏈一行都不用動。

---

## 1. 改動清單

| # | 文件:行（快照） | 符號 | 改動 | 必要性 |
|---|---|---|---|---|
| A | `game\src\core\battle.ts:2580` | `retreatStepPlan` 上方 | **新增** `retreatSx(u)` helper（撤退方向，單一真相源） | 必做 |
| B | `game\src\core\battle.ts:2583` | `retreatStepPlan` | `const sx = u.side === 'A' ? 1 : -1;` → `const sx = retreatSx(u);` | 必做（與 A 配套） |
| C | `game\src\core\battle.ts:2621` | `adjacentEnemy` | 函數開頭加撤退分支：`if (isRetreating(u)) return rowEnemyAt(u, occ, retreatSx(u), 1);` + 更新 doc 註釋 | **P0** |
| D | `game\src\core\battle.ts:2671` | `step` 裡取 `foe` 那行 | 只加一行註釋指向 `0x43BCA7` | 可選 |
| E | `game\tests\retreat.test.ts` 末尾 | — | **新增** 1 個 `describe` + 3 個 `it` | 必做 |
| F | `game\src\core\battle.ts:200-218` | `0x4000` 寫入點註釋 | 修正「`0x4447E2` = 軍團」的表述（見 REPORT §7.2） | 可選 |
| G | — | `actionIntervalOf` | **本輪不做** `46+2Δ`（理由見 §3） | 不做 |

---

## 2. 補丁 A+B+C（可直接貼）

### 2.1 新增 helper（插在 `retreatStepPlan` 的 doc 註釋之前，`battle.ts:2579` 那行 `/** 撤退一步：… */` 上面）

```ts
/**
 * 撤退方向（`0x43CC95` 小队 / `0x43C7E3` 主将：`sx = A?+1:-1`，与敌人位置无关）。
 *
 * 它同时是 `0x43BF26` 每次移动写给 sprite 的**朝向**（`x` 变大写 0、变大写 `0x800000`），
 * 所以 `0x43BCA7` 的撤退分支（`n=1`、`dir = 朝向`）等价于「只朝本方边界那一侧看 1 格」。
 */
function retreatSx(u: Unit): 1 | -1 {
  return u.side === 'A' ? 1 : -1;
}
```

### 2.2 `retreatStepPlan` 改用 helper（`battle.ts:2580-2587`）

```ts
/** 撤退一步：纯 ±x，无 y 分量（`0x43CC95`：`sx=(A?+1:-1), sy=0`，权重 100/0） */
export function retreatStepPlan(u: Unit): StepPlan {
  // `0x43CC95`（小队）/ `0x43C7E3`（主将）：sx = A?+1:-1、sy = 0，方向朝本方边界、与敌人位置无关。
  // 权重：小队 `0x48E8E0` = 80/10/10（各 10% 走一次 ±45°），主将 `0x48E658` = 100/0（纯直线）。
  const sx = retreatSx(u);
  return u.isGeneral
    ? planDirected(sx, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'retreat')
    : planDirected(sx, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'retreat');
}
```

（唯一差異：`const sx = u.side === 'A' ? 1 : -1;` → `const sx = retreatSx(u);`。行為等價，只是讓「撤退方向」只有一個定義。）

### 2.3 `adjacentEnemy`（`battle.ts:2613-2631`，含 doc 註釋整塊替換）

```ts
/**
 * 能打就不走（`0x43BCA7` → `0x43BBE6`）：**同一车道**、只沿 ±x 找射程内的敌人。
 *
 * 普通态（`0x43BD06`）：`n = 2`，先随机一个首扫方向（`dir0`），命中就返回；没命中再反方向扫一次。
 * 这里等价地「两侧都扫、只有两侧都有敌人才抽一次 rng」，避免每周期给全场随机流白插一路消耗。
 * 接线了 `world.roll`（R115）时这一步走 `roll.bit()` = 原作 `rand() & 1`，
 * 保证「先看哪一侧」的**流消耗**与原作同源（结果仍是二选一，不影响伤害）。
 *
 * **撤退态**（`0x43BCD8` 的 `and eax,0x4000`）：原作把搜索降级成「**只朝当前朝向那一侧、只 1 格**」
 * （`n=1` @0x43BCE1；`dir` 取 sprite 朝向 @0x43BCEE，不掷骰）。于是撤退者**背后的敌人永远选不到** ——
 * 这就是「撤退不还手」的正证（`0x43D686`/`0x43D400` 那条攻击链本身一道状态门都没有）。
 * 本作没有 facing 字段，而 `0x43BF26` 每次移动都把朝向写成「走的那一边」、撤退只朝本方边界走，
 * 所以这里用 `retreatSx(u)` 代替朝向。第二道门 `0x43BD64`（撤退态 + 攻击方向与朝向相反 → 跳过）
 * 已被这条单向扫描涵盖；将来若补 facing 字段，两道门应分开实现。
 */
function adjacentEnemy(world: World, u: Unit, occ: Occ): Unit | null {
  // `0x43BCA7` 撤退分支：只朝朝向那一侧探 1 格（`0x43BCE1` n=1）。
  if (isRetreating(u)) return rowEnemyAt(u, occ, retreatSx(u), 1);
  const range = attackRangeOf(u);
  const left = rowEnemyAt(u, occ, -1, range);
  const right = rowEnemyAt(u, occ, +1, range);
  if (!left && !right) return null;
  if (left && !right) return left;
  if (right && !left) return right;
  const roll = world.roll;
  if (roll) return roll.bit() === 1 ? right : left;
  return world.rng() < 0.5 ? left : right;
}
```

> 實質改動只有一行：`if (isRetreating(u)) return rowEnemyAt(u, occ, retreatSx(u), 1);`
> 其餘是 doc 註釋。

### 2.4 （可選）`step()` 裡補一行註釋（`battle.ts:2671`）

```ts
    // 撤退态的搜敌在 adjacentEnemy 里就被降级成「朝向那一侧 1 格」（`0x43BCA7`/`0x43BCD8`），
    // 所以这里不需要再判一次 flee —— 原作也是先搜敌、搜不到才执行命令（`0x43D247`）。
    const foe = u.atkLock > 0 ? null : adjacentEnemy(world, u, occ);
```

---

## 3. 為什麼本輪**不**做 `46+2Δ`（補丁 G）

`0x43B574` 的撤退間隔是「常量 `0x2E`(46) + 條件追加 `2Δ`」：

```asm
0043B5F1  and      eax, 0x4000        ; 撤退态
0043B5FD  mov      dword ptr [eax + 0x34], 0x2e
0043B606  call     0x43b6a8           ; GetState(u) & 1 ← 條件位，語義未證
0043B641  mov      edx, [ebp - 0x10]  ; X_对手
0043B644  sub      edx, [ebp - 0xc]   ; Δ = X_对手 − X_自己
0043B64A  lea      edx, [ecx + edx*2] ; 46 + 2Δ
```

兩個阻礙：

1. **`GetState&1` 是什麼位沒證**（現有線索都指向「武將」，但 `0x43B6A8` 沒有寫入點可交叉驗證）。猜錯會讓所有小兵/主將的節奏一起錯。
2. **`actionIntervalOf(u)` 拿不到 `world`**，取不到「對手 X」。要實現得改簽名，而 `tests\hud_slots.test.ts:316` 直接 `actionGaugeOf({ cd: 23, isGeneral: true, status: 0x4000 })`、`tests\retreat.test.ts:91/100` 直接 `actionIntervalOf(u)`，簽名一動要連帶改測試。

建議：**先只合 A+B+C**（把「不還手」這個玩家最易察覺的差補上），`46+2Δ` 另開一條，等 `GetState&1` 的語義從別的路徑（`0x43B961` 的射程表 / `0x43D76C` 的隔格追打）交叉證實後再做。

若將來要做，形狀是：

```ts
export function actionIntervalOf(u: Unit, world?: World): number {
  if (!isRetreating(u)) return u.isGeneral ? ACTION_INTERVAL_TICKS : ATTACK_COOLDOWN;
  let n = GENERAL_SLOW_INTERVAL; // 0x2E
  if (((u.status ?? 0) & 0x1) !== 0 && world) {
    const foe = /* 同军团对手 X */;
    n += 2 * (foe.gx - unitCell(u).gx); // 0x43B647
  }
  return Math.max(1, n);
}
```

（`Math.max(1, …)` 是必要的：Δ 可為負且 |Δ| 大時會算出 ≤0。）

---

## 4. 測試（`game\tests\retreat.test.ts` 末尾追加）

現有 18 條 `it` **一條都不用改**（沒有哪條斷言「撤退單位會還手」；第 232 行的 `attacksB === 0` 是遠距離場景，補丁後仍成立）。

追加一個 `describe` + 3 個 `it`（直接用文件裡已有的 `makeWorld` / `place` / `step` / `requestRetreat` / `GRID_H`）：

```ts
describe('R91 撤退態不還手：選目標降級（0x43BCA7）+ 回頭門（0x43BD64）', () => {
  /** 把两侧拉到远处排开，只留 bait(B) 与 enemy(A) 在中路第 6 行相邻。 */
  function lineUp(w: World, bait: Unit, enemy: Unit, enemyGx: number): void {
    let row = 0;
    for (const u of w.units) {
      if (u === bait || u === enemy || !u.alive) continue;
      place(u, u.side === 'B' ? 5 : 65, row % GRID_H);
      row++;
    }
    place(bait, 30, 6);
    place(enemy, enemyGx, 6);
  }

  it('撤退单位背后（逃跑方向反面）贴身的敌人不会被选为目标，本 tick 一次也不还手', () => {
    const w = makeWorld({ seed: 11 });
    const bait = w.units.find((u) => u.side === 'B' && !u.isGeneral)!;
    const enemy = w.units.find((u) => u.side === 'A' && !u.isGeneral)!;
    assert.equal(requestRetreat(w, 'B'), true);
    lineUp(w, bait, enemy, 31); // B 往 −x 逃；+x 一侧 = 背后
    const before = bait.lastAttackTick;
    step(w);
    // `0x43BCA7` 撤退分支：n=1、dir=朝向（`0x43BCE1`/`0x43BCEE`）⇒ 背后的敌人选不到。
    assert.equal(w.stats.attacksB, 0, '撤退者背后的敌人不应被选为目标');
    assert.equal(bait.lastAttackTick, before, '撤退者本 tick 不应有出手记录');
    assert.equal(enemy.alive, true, '背后的敌人不应被撤退者打掉');
  });

  it('对照：逃跑方向正前方一格的敌人仍会被打（不是「完全禁攻」）', () => {
    const w = makeWorld({ seed: 12 });
    const bait = w.units.find((u) => u.side === 'B' && !u.isGeneral)!;
    const enemy = w.units.find((u) => u.side === 'A' && !u.isGeneral)!;
    assert.equal(requestRetreat(w, 'B'), true);
    lineUp(w, bait, enemy, 29); // −x 一侧 = 逃跑方向正前方
    step(w);
    // 原作撤退态仍然朝朝向那一侧扫，命中就出手（`0x43D2FE` 的 `0x43BD64(u,r)!=1`）。
    assert.equal(w.stats.attacksB, 1, '正前方一格的敌人应被撤退者反击');
  });

  it('撤退态射程被压到 1 格：正前方 2 格有敌也不还手（0x43BCE1 n=1）', () => {
    const w = makeWorld({ seed: 13 });
    const bait = w.units.find((u) => u.side === 'B' && !u.isGeneral)!;
    const enemy = w.units.find((u) => u.side === 'A' && !u.isGeneral)!;
    bait.atkRange = 3; // 模拟弓兵：非撤退时能打 3 格
    assert.equal(requestRetreat(w, 'B'), true);
    lineUp(w, bait, enemy, 28); // 正前方 2 格
    step(w);
    assert.equal(w.stats.attacksB, 0, '撤退态射程应压到 1 格（0x43BCE1 把 n 写成 1）');
  });
});
```

斷言與彙編的對應：

| 斷言 | 對應指令 | 補丁前 | 補丁後 |
|---|---|---|---|
| 第 1 條 `attacksB === 0` | `0x43BCD8` `and eax,0x4000` → `0x43BCE1` `n=1` | **FAIL**（會兩側都掃、會還手） | PASS |
| 第 2 條 `attacksB === 1` | 同上但 `dir` = 朝向那一側 | PASS | PASS（防「一刀切禁攻」的回歸） |
| 第 3 條 `attacksB === 0` | `n=1` 抹掉弓兵射程 | **FAIL** | PASS |

---

## 5. 回歸風險

**影響面**：改動只命中 `isRetreating(u) === true` 的單位；非撤退單位在 `adjacentEnemy` 裡走的是原封不動的代碼路徑。`adjacentEnemy` 全文件**只有一個呼叫點**（`step()` 裡取 `foe`），所以小兵與主將同時覆蓋，不會漏。

**可能被影響的既有測試**：

| 測試 | 為什麼可能受影響 | 預期 |
|---|---|---|
| `tests\retreat.test.ts:211`（一 tick 走一格 / `attacksB===0`） | 斷言了 `attacksB === 0`，但原本兩側相距很遠 | 不受影響 |
| `tests\retreat.test.ts:135/165`（全軍離場、擊殺 0） | 撤退方原本就沒打過人 | 不受影響 |
| `tests\retreat.test.ts:331/348`（`0x4000` 只置不清） | 只看 `status` | 不受影響 |
| `tests\battle_block.test.ts:20`（溃逃豁免 `passBlocked`） | 只管移動讓位，不看攻擊 | 不受影響 |
| `tests\battle_r81.test.ts:340`、`tests\army_cmd.test.ts:681/731` | 只斷言 `flee`/`status`/返回值 | 不受影響 |
| **任何「打完整場、斷言最終兵力/擊殺/回合數」的測試** | 撤退方不再反擊 ⇒ 追擊方傷亡變少、戰鬥可能更早結束或擊殺更多 | **唯一真正的風險區**：跑 `npm test` 看有沒有整體漂移；若有，優先檢查 `battle_*.test.ts` 裡對 `stats.kills*` / `world.tick` 的硬斷言 |

**風險等級**：低（行為變更方向單一、只作用於撤退態）。但因為它會改變整場戰鬥的**統計分佈**，仍建議合併後跑全量 `npm test` 對比。

---

## 6. 驗收步驟

```powershell
cd F:\sanguo\game
npm run typecheck      # tsc --noEmit
npm test               # node --test tests/*.test.ts
```

合併順序建議：

1. 先合併補丁 A+B（純重構，零行為變化）→ 跑一次 `npm test` 確認綠。
2. 再合併補丁 C（P0 行為變化）→ 跑 `npm test`，重點看 `retreat`、`battle_*`。
3. 最後補測試 E → 三條新 `it` 必須全綠；若第 1/3 條在合併 C 之前跑，應該是**紅的**（可拿來驗證測試本身有鑑別力）。
4. 補丁 D/F 純註釋，隨便什麼時候。

---

## 7. 合併後應更新的文檔（本智能體不改 `project\**`，交給 lead）

- `project\199_对照表刷新R193.md` 第 149/224/245 行：R91 從「缺正證」→「已證（`0x43BCA7` `0x43BCD8` + `0x43BD64`）」；剩餘缺口改成「`46+2Δ` 的 `GetState&1` 語義」。
- `project\160_撤退态0x4000.md` §5 第 3 條「撤退單位挨打時是否還手」→ 結案，附本報告 §4 Q1 的兩段彙編。
- `project\37a_逻辑对照.md:614/675`、`project\165_打包前原作对比门禁.md:45`：`0x43D5BF`/`0x43DA1A` 已讀，非攻擊判定。
- `project\160` §5「氣力 −0x32 兩種搜法 0 命中」→ 已找到：`0x43E995` `sub eax,0x32`（REPORT §7.1）。
