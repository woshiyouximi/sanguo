# pullInStep 落地方案（lead m00696 已批「方案 ②」）

> 等 lead 放行后再动 `game/src/core/battle.ts`（当前被 camera 补丁占用）。
> 插入点：`step()` 里 `if (!plan || plan.kind === 'hold') continue;`（现行 `battle.ts:2535`）之后、
> `const pick = chooseStepCell(...)`（`:2536`）之前。

## 1. 新函数（放在 `passBlocked()` 之后、`chooseStepCell()` 之前）

```ts
/**
 * 贴住就插进去（`[新设计]`，R190 v3，与 `passBlocked` 同一组规则）。
 *
 * 起因：`0x43BBE6` 只沿 ±x 扫同排 ⇒ 站在**相邻车道**的敌人既不挡路也进不了攻击扫描，
 * `passBlocked` 只能拦住「纵深推进」，拦不住「斜着绕开」。这里补的是接敌那一步：
 * 正前 / 斜前格站着敌人、且我方横移一格能落进**敌人那条车道**（落点空格）时，本 tick 横移过去；
 * 下一手与敌人同排相邻 ⇒ `adjacentEnemy()` 必中（`0x43BBE6`），观感从「擦着敌人跑过去」
 * 变成「贴上去打」。
 *
 * 触发条件（写死，不抽样）：
 *  1. 斜前格 `(from.gx+f, from.gy±1)` 有敌人（正前有敌时本来就打得到，不需要插）；
 *  2. 横移落点 `(from.gx, 敌人车道)` 界内且**空**；
 *  3. `passBlocked` 不否认（不往两敌夹缝里钻）。
 * 不消耗 rng、不碰 `chooseStepCell` 的候选顺序与权重表（`project/173` §7 复刻度保持）。
 */
function pullInStep(world: World, u: Unit, occ: Occ): { gx: number; gy: number } | null {
  if (world.blockPass === false) return null;
  if (u.flee) return null;
  const from = unitCell(u);
  const f = u.side === 'A' ? -1 : 1; // 前进方向，与 `army_cmd.ts:673` 同源
  for (const dy of [-1, 1]) {
    const gy = from.gy + dy;
    if (!inGrid(from.gx + f, gy)) continue;
    const foe = occ.get(cellKey(from.gx + f, gy));
    if (!foe || foe.side === u.side) continue; // 斜前没有敌人 ⇒ 不触发
    if (occ.has(cellKey(from.gx, gy))) continue; // 落点必须空格
    if (passBlocked(world, u, from, from.gx, gy, occ)) continue;
    return { gx: from.gx, gy };
  }
  return null;
}
```

## 2. `step()` 插桩

```ts
    if (!plan || plan.kind === 'hold') continue;
    // R190 v3：贴住就插进去 —— 斜前的邻道敌人先横移进它那条车道，下一手同排打得到。
    // 後退（back）/ 撤退（retreat）不抢：那两种语义是「离开」，插上去等于抗令。
    if (plan.kind !== 'back' && plan.kind !== 'retreat') {
      const pull = pullInStep(world, u, occ);
      if (pull) {
        commitStep(u, pull, occ, world.rng);
        continue;
      }
    }
    const pick = chooseStepCell(world, u, plan, occ);
```

## 3. 待加的 4 条测试（`game/tests/battle_block.test.ts`）

1. **斜前单敌 ⇒ 下一手同排相邻并出手**：A 兵 `(50,6)`、B 兵 `(49,5)`（钉住 `cd=1e9`），
   `driveOnly(A, straightAt(-1,0))`；`step` 一次 ⇒ A 在 `(50,5)`；再跑 41 tick ⇒
   `w.stats.attacksA ≥ 1` 且 A 仍在 `(50,5)`（同排相邻）。
2. **正前空格 + 侧敌 = 触发**（就是反馈②的字面场景）：同上但断言第一步落 `(50,5)` 而不是 `(49,6)`。
3. **横移落点被友军占 ⇒ 不插**：A 兵 `(50,6)`、A 兵 `(50,5)`、B 兵 `(49,5)` ⇒ 第一步落 `(49,6)`（走原 plan）。
4. **`blockPass=false` 对照组**：同上场景①，关掉后第一步落 `(49,6)`，且 A 走到 `(40,7)` 那条旧路线。

## 4. 复跑清单（给 lead 的数）

- `probe_pass2.mjs` 场景②：旧 `终点 (40,7) / 越过目标列 YES` → 新期望 `停在 (50,5) 或 (49,5) 附近并开打`。
- `probe_rush.mjs`：60v60 / 100v100 总 tick（基线 1069 / 1066，别把 R80 的 2052 拖长）。
- `node --test tests/battle_block.test.ts`、`tsc --noEmit`、全量 `suite_pullin.log`（基线 1624/1624）。
