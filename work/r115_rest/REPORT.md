# R115 收尾：最后两处 rand 消费点接原作乱数流

日期：2026-11-26
执行：r115-rest（子智能体）
状态：完成，全部验收通过。

## 结论数字

| 项 | 结果 |
|---|---|
| `tsc --noEmit` | exit 0 |
| `node --test "tests/*.test.ts"` | **1704 pass / 0 fail**（基线 1690 + 本文件 14 条） |
| `tests/roll_consumers.test.ts` | 14/14 pass |
| `node work\fidelity\check.mjs`（F:\sanguo 根） | **PASS 459 / FAIL 0 / SKIP 3 / WARN 0**（mode=dist） |
| 缺省行为（无 `roll`） | 逐字节不变；显式 `null` 与省略同值（已用旧金标准 ④ 与同 seed 两次比对钉住） |

## 一、`game/src/core/capture.ts`（556 → 587 行）

| 位置 | 改动 |
|---|---|
| :22 | `import type { SangoRng } from './sango_rng.ts'` |
| :16-21 | 文件头补 R115 说明：`roll` 给了走原作流，缺省/null 逐字节旧行为 |
| `PostBattleState` :57 | 新增可选 `roll?: SangoRng \| null` |
| `rollRecruit()` :231-242 | 新增第 4 参 `roll?`；内部 `draw(n) = roll ? roll.int(n) : Math.floor(rng()*n)`。t<0 两次 `draw(100)`；t=0 一次；t≥1 先 `draw(100)`，通过再 `draw(3)`（短路顺序不变） |
| `canRecruit()` :287 | 改为 `rollRecruit(t, loyal, state.rng, state.roll)` |
| `rollDrop()` :343-349 | 新增第 5 参 `roll?` |
| `rollDrop()` :360 | `let r = roll ? roll.int(total) : rng() * total;`（`0x408EE2` 轮盘 = `rand()%total`；`int` 先 trunc，权重为整数时等价） |
| `resolvePostBattle()` :390-396 | 新增第 5 参 `roll?: SangoRng \| null` |
| `resolvePostBattle()` :407 | `state.roll = roll ?? null`，后续 `canRecruit` 自动继承 |
| `resolvePostBattle()` :454 | 被俘判定 `if ((roll ? roll.float() : rng()) >= captureChance(...)) continue;` |
| `resolvePostBattle()` :472 | 斩首判定 `else if ((roll ? roll.int(100) : Math.floor(rng()*100)) < 50)` |

**抽取次数对账（单败将、t=-1、被俘+招降失败+斩首）**

| 步骤 | 原作 | 有 roll | 无 roll |
|---|---|---|---|
| 被俘 `0x40ED3A` | 公式未解 | 1 × `float()` | 1 × `rng()` |
| 招降 `t<0` | 最多 2 × `rand()%100`，成功即短路 | 1–2 × `int(100)` | 1–2 × `floor(rng()*100)` |
| 招降 `t=0` | 1 × `rand()%100` | 1 × `int(100)` | 1 × `floor(rng()*100)` |
| 招降 `t≥1` | `rand()%100`，通过后 `rand()%3` | 1–2 × `int(100)`/`int(3)` | 同左，旧口径 |
| 斩首 `0x40EF9A` | `rand()%100 < 50` | 1 × `int(100)`（仅招降失败） | 1 × `floor(rng()*100)` |
| 掉落 `0x408EE2` | `rand()%total` | 1 × `int(total)` | 1 × `rng()*total` |

说明：`0x40ED3A` 的被俘公式仍未解（`captureChance` 是最小模型），所以这里不能声称复刻某个 `%100`，改用 `roll.float()` 保持与旧 `rng()` 相同的 `[0,1)` 分布；`rollDrop` 的 `total` 若为小数，`int` 会先 trunc（权重表为整数时完全等价），已在注释写明。

## 二、`game/src/core/smartscript/runtime.ts`（2586 → 2612 行）

| 位置 | 改动 |
|---|---|
| 文件头 :22-24 | 补充：开 `world.roll` 时脚本 rand / 命中概率走 `0x450132`；否则旧 `world.rng` |
| 新增 `scriptRand()` :429-441 | 导出纯函数：整数分支 `lo + roll.int(hi-lo+1)`，非整数分支 `lo + roll.float()*(hi-lo)`；无 roll 时与旧 `rand()` 公式逐字相同 |
| 新增 `scriptChance()` :448-451 | 导出纯函数：`roll ? roll.float() : world.rng()`，一次抽 |
| `SkillRun.applyCollateral()` :1803 | `if (this.world.rng() < rate)` → `if (scriptChance(this.world) < rate)` |
| `SkillRun.rand()` :1972-1975 | 改委托 `scriptRand(this.world, min, max)`；`0x303` 经 `SysoHost({ rand: ... })` 同一个入口 |
| `SkillRun.applyHits()` :2282 | `else if (this.world.rng() < rate)` → `else if (scriptChance(this.world) < rate)` |

**抽取次数对账（`0x303 rand(min,max)` = `min + rand()%(max-min+1)`）**

- 整数参数：每次 **恰好 1 抽** `int(max-min+1)`；上下界自动交换；`min==max` 时也抽 `int(1)`（原作 `0x450117(1)` 同样消费一次 `rand()`）。
- 非整数参数：每次 1 抽 `float()`（原作只有整数，这是本作旧扩展，保持同分布）。
- 非有限参数：返回 0，**0 抽**（旧行为不变）。
- 两处命中概率：每个非主将候选 **恰好 1 抽** `float()`（有 roll）或 `rng()`（无 roll）；主将仍不掷骰。

证据对齐：`project/155_部队指令语义.md:207-216` 的 `0x450117(n)` 语义 + `0x420BAA` 反汇编（比较/交换上下界 → `n=max-min+1` → `call 0x450117` → `+min`）→ `min + rand()%(max-min+1)`。

## 三、`game/src/core/battle.ts`（唯一一处，任务允许的第 5 参接线）

- :3447-3449 注释更新：开后战后处置走 `world.roll`，否则走 `world.rng`，两种模式同 seed 均可复现。
- :3462 在 `resolvePostBattle(..., world.data, world.rng, [], world.roll)` 传入 `world.roll`。

理由：`settle()` 是战后处置的唯一生产调用点，不传第 5 参则 capture 的 roll 接线永远不会在真实战斗里生效；本次只新增一个实参，没有改任何战斗逻辑/随机分支。已按纪律在报告中单列。

## 四、新增测试 `game/tests/roll_consumers.test.ts`（14 条）

1. 招降 `t=-1` 两抽都失败 → 恰好 `int(100)`×2（state 对账）。
2. 招降 `t=-1` 首抽成功 → 只 1 抽。
3. 招降 `t=0` → 无论成败都只 1 抽（5 个 seed）。
4. 招降 `t=1` 首抽失败 1 抽；首抽成功后 `int(3)` 第 2 抽，成功条件 `v1>=39 && v3===0`。
5. `rollDrop`：权重 10+20=30，`int(30)` 落甲/乙各验一次，state 恰好 1 抽；无 roll 时 `rng()*total` 旧口径。
6. 无 roll：`resolvePostBattle` 显式 `null` 与省略 deepEqual，并复验旧金标准（loyal 39 / 斩首 / exp 160 / merit 10）；同 mulberry seed 两次一致。
7. 无 roll：只消费 rng，不碰旁边的 `SangoRng`（snapshot 不变）。
8. 有 roll：`rng` 用“一碰就 throw”的哨兵，证明零消费；并逐抽对账被俘 `float` + 招降 `int(100)`×2 + 斩首 `int(100)` = 4 抽。
9. `scriptRand` 整数边界：`[1,6]/[6,1]/[-2,2]/[3,3]/[10,20]` 各 200 抽，值域/整数性/每抽 `ref.int(n)` 对账；`n<=6` 时覆盖全部档位。
10. `scriptRand` 非整数 `(2.5,1.5)`：100 抽，`[1.5,2.5)` 且等于 `1.5+ref.float()`。
11. `scriptRand` 非有限参数：返回 0 且 snapshot 不变（0 抽）。
12. `scriptRand` 无 roll：整数/非整数各只消费 1 次 rng，公式与旧实现同值。
13. `scriptChance`：有 roll = 1 次 `float()`；无 roll = 1 次 `rng()`。
14. 真实 `settle()`：`engage(createWorld({seed:7, roll:sangoRng(11), A troop 4 / B troop 12}))`，同 roll seed 两次 post deepEqual + roll 终态一致；roll seed 12–16 至少一次 post 分叉；处置名单非空。

## 五、验证过程与备注

- `cd F:\sanguo\game; npm.cmd exec -- tsc --noEmit` → exit 0（最终一次在测试文件定稿后跑）。
- `node --test "tests/*.test.ts"` → 1704 pass / 0 fail（87 suites，10.6s）。
- `node work\fidelity\check.mjs` 首次跑出现 `WARN env.dist.stale`（dist 落后于 src，PASS 458）。按提示执行 `cd game; npm.cmd exec -- tsc -p tsconfig.build.json`（exit 0）刷新 `game/dist` 后复跑 → **PASS 459 / FAIL 0 / SKIP 3 / WARN 0**。`dist` 不在禁止改动清单内。
- 未改 `sango_rng.ts` / `battle_ai.ts` / `game/cocos/**` / `game/web/**` / `project/**` / `apk/**`，未使用 git。
- 未做：`0x40ED3A` 被俘公式仍未解（沿用 `captureChance` 最小模型，只用 `float()` 接流）；`0x408EE2` 小数权重的 `rand()%total` 精确口径未反解（整数权重下与旧轮盘完全一致）。这两项属于后续原作公式研究，不影响本轮接线与回归。
