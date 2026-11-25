# PATCH · 滑行对穿「错位」（渲染层最小间距松弛）—— 已落地

状态：**已落地**（lead 2026-11-26 07:32 放行 `battleView.ts`；纯 view，`core/battle.ts` 未为此改动）
作者：anim（R194）　取证脚本：`F:\sanguo\work\anim_fix\probe_jitter.mjs`（`VARIANT=orig|half|offset|now`）

---

## 1. 问题（不是「禁止穿过去」，而是「穿过去的时候别叠在同一个像素上」）

`core/battle.ts` 的 `commitStep()` 给每个单位一个 40 tick 的线性滑行（`ACTION_SLIDE_TICKS`）。
占位表 `occ` 只校验**落点格**，两个单位沿同一条车道对穿时，中途会经过几乎同一个点：

- 实测（`probe_overlap.mjs`）：tick 325，两个 B 骑兵在 `(20.54, 5.46)` 与 `(20.53, 5.46)`，**屏幕中心距 0.14px**，双方 `slide` 都在进行中；
- 改前基线（`probe_jitter.mjs`，`VARIANT=orig`）：最小 sprite 中心距 **0px**，300 帧里有 **1.20 对/帧** 的矩形 >75% 重合、最糟一对 **ar = 1.000**。

纯逻辑层禁止对穿不是好方案：会让行军/包抄卡住，而且原作本来就允许换位（`0x43BCA7` 攻击前也是先滑到邻格）。

## 2. 落地代码（`game/src/view/battleView.ts`）

`drawActors()` 里 `actors.sort(...)` 之后、`for (const a of actors)` 之前调用 `spreadSlidingActors(actors);`。

```ts
const MIN_BODY_GAP = 22; // 躯干宽 28px 的一半，够把「叠死」压成「肩并肩」
const MAX_SPREAD = 20;   // 单个演员最多被推开 20px（≈半条车道）

type Actor = { u: Unit; p: UnitProjection; dyingAge: number | null; sx0: number };

function spreadSlidingActors(actors: Actor[]): void {
  for (let iter = 0; iter < 6; iter += 1) {
    for (let i = 0; i < actors.length; i += 1) {
      const a = actors[i]!;
      for (let j = i + 1; j < actors.length; j += 1) {
        const b = actors[j]!;
        if (Math.abs(a.p.sy - b.p.sy) > 24) continue;          // 不同排，各画各的
        const dx = b.p.sx - a.p.sx;
        const need = MIN_BODY_GAP - Math.abs(dx);
        if (need <= 0) continue;
        const slideA = a.u.slide != null && !uGeneral(a.u);    // 主将只被让路，自己不位移
        const slideB = b.u.slide != null && !uGeneral(b.u);
        if (!slideA && !slideB) continue;                      // 静止阵型一个像素都不动
        const dir = dx >= 0 ? 1 : -1;
        const push = slideA && slideB ? Math.min(need / 2, 6) : Math.min(need, 12);
        if (slideA) a.p.sx -= dir * push;
        if (slideB) b.p.sx += dir * push;
      }
    }
    // 密集人堆里松弛可能把人越推越远，夹住上限
    for (const a of actors) {
      a.p.sx = Math.max(a.sx0 - MAX_SPREAD, Math.min(a.sx0 + MAX_SPREAD, a.p.sx));
    }
  }
}
```

`a.p` 是 `projectUnit()` 每帧现算出来的新对象，改 `p.sx` 不污染世界状态；`drawSoldier` / `drawGeneral` / `pushHitFlash`（冲击星用 `p.sx`）都会自然跟着走。
复杂度：n≈200 ⇒ 2 万次比较 × 6 轮 ≈ 12 万次/帧，实测可忽略。

### 为什么必须迭代（实测证据）

tick 763 两个 B 骑兵**已经互相穿过去**（sprite 画在 596 / 595，锚点都是 `gx 33.45, gy 12.58`）。
1 轮对称推 6px 只把它们从「重叠 11px」推到「相距 1px」。实测收敛：

| 迭代轮数 | 全局最小 sprite 中心距 |
|---|---|
| 1 轮 | 2.26 px |
| 3 轮 | 10.20 px |
| 6 轮 | 20.23 px |
| 6 轮 + `MAX_SPREAD=20` | **12.17 px**（夹取是防「人堆把人推飞」，正常只偏 6~9px） |

## 3. 收益（`probe_jitter.mjs`，100v100 / seed 7 / 900 tick / 每 3 tick 采样 = 300 帧）

判据：「交叠面积 / 较小矩形面积」≥ 阈值的对数（对/帧），矩形 = `buildFrame` 真正输出的 sprite。

| 变体 | >20% | >35% | >50% | >75% | 最小中心距 | 最糟一对 |
|---|---|---|---|---|---|---|
| `orig` 改前（±24/±18，无松弛） | 105.34 | 43.93 | 10.30 | 1.20 | **0 px** | ar 1.000 @tick412 |
| `half` 只砍半（±12/±9） | 104.04 | 45.26 | 6.37 | 1.23 | 0 px | ar 1.000 @tick25 |
| `offset` 只松弛（±24/±18） | 105.24 | 45.59 | 5.94 | **0.06** | **12.17 px** | ar 0.924 @tick796 |
| `now` 现在（±12/±9 + 松弛） | 105.23 | 45.59 | **5.95** | **0.07** | **12.17 px** | ar 0.924 @tick796 |

读法：

- **松弛是 >75% 档的主力**：1.20 → 0.06（−95%），最小中心距 0 → 12.2px，「两个兵画成一个兵」这一档基本清掉。
- **抖动砍半单独能压 >50% 档**（10.30 → 6.37）；但两个一起上时 >50% 停在 5.95 —— 说明松弛已经把「叠死」摊成「肩并肩」，砍半的边际收益只有 6%。
- **>35% 档从 43.93 涨到 45.59（+4%）是可解释的交换**：把 75% 的重叠拆成两个 35% 的重叠。>20% 档基本不动（105.34 → 105.23），因为那一档的主因是贴图绘制宽 `75×0.9625 = 72.2px` 远大于车道节距 `43.59px`（相邻车道固定重叠 39.6%），不是抖动也不是松弛。

## 4. 风险

- 滑行中的单位会画到离真实格位最多 20px（0.46 车道），滑完自然归位；**静止时不位移**，所以不会常驻「站位对不上格子」。
- 与点选单位有 ≤20px 的瞬时偏差（只在 40 tick 滑行内）；`screenToUnit()` 判的是逻辑格位，最坏是点在正在滑过的兵身上却选中隔壁。
- 主将不吃推、只被别人让开，点将手感不变。

## 5. 验收断言（已落地，`game/tests/anim_view.test.ts`）

```ts
test('滑行对穿：任意两个 sprite 中心距 ≥ 8px（改前两个骑兵能重合到 0px）', ...)
test('抖动幅度：落格偏移不超过 ±12px 纵深 / ±9px 车道（原作 ±24/±18，R194 砍半）', ...)
```

复跑：`$env:VARIANT='orig'; node work\anim_fix\probe_jitter.mjs` vs `VARIANT='now'`。
`anim_view.test.ts` 全 9 条通过；全量 `node --test "tests/**/*.test.ts"` = **1685/1685**。
