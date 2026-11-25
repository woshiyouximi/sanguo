# REPORT_impl · R194 落地记录（改前 / 改后）

作者：anim　时间：本轮
范围：**view 层 + core 两行抖动 + 测试**。`game/src/core/battle.ts` 只动了 `commitStep()` 的 `jx/jy` 两个模数（lead 2026-11-26 07:32 放行），已同步 Cocos 镜像。

---

## 0. R194-core（第二轮，lead 放行后）

### 0.1 改了什么

| 文件 | 改动 | 位置 |
|---|---|---|
| `game/src/core/battle.ts` | 抖动砍半：`Math.floor(rng() * 0x18) - 0xc`（−12..+11）/ `Math.floor(rng() * 0x12) - 0x9`（−9..+8）；`commitStep()` 文档注释加「R194 刻意偏离原作」 | `:2141-2142` |
| `game/src/view/battleView.ts` | 新增 `spreadSlidingActors()`（6 轮横向松弛、`MIN_BODY_GAP=22`、`MAX_SPREAD=20`、主将只被让路）；`actors` 增 `sx0` 记原始投影 | `:1213` 一带，调用点 `:1187` |
| `game/tests/anim_view.test.ts` | 新增 2 条断言（抖动幅度、滑行对穿），共 **9 条** | 见 §5 |

`clampPx` 的两处限值（`0x780000/0x10000` = ±120px、`0x5a0000/0x10000` = ±90px）**一个字节没动** —— 那是防跳格闸门，不是抖动幅度。

### 0.2 重叠量化（`probe_jitter.mjs`，100v100 / seed 7 / 900 tick / 300 帧，同代码对照）

| 变体 | >20% | >35% | >50% | >75% | 最小中心距 | 最糟 |
|---|---|---|---|---|---|---|
| `orig` 改前（±24/±18，无松弛） | 105.34 | 43.93 | 10.30 | 1.20 | **0 px** | ar 1.000 @tick412 |
| `half` 只砍半 | 104.04 | 45.26 | 6.37 | 1.23 | 0 px | ar 1.000 @tick25 |
| `offset` 只松弛 | 105.24 | 45.59 | 5.94 | 0.06 | 12.17 px | ar 0.924 @tick796 |
| `now` 现在（砍半 + 松弛） | 105.23 | 45.59 | **5.95** | **0.07** | **12.17 px** | ar 0.924 @tick796 |

三条读法（都是给决策用的，不是辩解）：

1. **松弛是 >75% 档的唯一解**（1.20 → 0.06，−95%），抖动砍半对它零作用（1.20 → 1.23）；最小中心距 **0 → 12.17px**。
2. **砍半单独能压 >50% 档**（10.30 → 6.37，−38%），但两者一起上只剩 6% 边际收益 —— 松弛已经把「叠死」摊成「肩并肩」。砍半真正买到的是「静止阵型别抖那么狠」。
3. **>35% 从 43.93 涨到 45.59（+4%）是可解释的交换**：一个 75% 的重叠拆成两个 35% 的重叠。>20% 档不动（105.34 → 105.23）—— 那一档的主因是贴图宽 72px vs 车道节距 43.59px，属结构性（§3.2.4 三项），两条补丁都治不到。

### 0.3 这轮的完整验证

| 项 | 结果 |
|---|---|
| `npm.cmd run typecheck` | 通过（零输出） |
| `node --test tests/anim_view.test.ts` | **9 pass / 0 fail** |
| `node --test "tests/battle_*.test.ts"` | **101 pass / 0 fail** |
| 全量 `node --test "tests/**/*.test.ts"` | **1685 pass / 0 fail**（基线 1677 + 新增 2 条 + 同批其它人的增量，本机实测 1685） |
| 挥砍帧与出手对齐（`probe_r194.mjs`） | 攻击帧 **1393 == 1393**、尸体 **624 == 624**、白闪 **52 == 52**，450 采样 0 失配（抖动改后 rng 抽取次数不变，战斗结果逐 tick 一致） |
| `node work\cocos_sync\sync_core3.mjs` | 只有 `battle.ts` 有差异 → 已写入（+7/−2 行，3568→3573 行），其余 21 个文件 same |
| `node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **exit 0** |

### 0.4 叫阵 / 冻结期间会不会「假挥砍」

`?taunt=1` 的開場叫陣是 `main.js:905/1695` 的**开局**流程：`state.taunt` 非空时 `frame()` 直接 return（不 `step()`、`tick` 恒为 0），而挥砍判据是 `world.tick - u.lastAttackTick < 24`。实测（`probe_taunt.mjs`）：

- 开局 tick 0：122 个单位里 `withLastAttack = 0`、`swinging = 0` ⇒ **叫阵画面里不会出现假挥砍**（本来就没有人出过手）。
- 附带发现：胜负已分后 `state.mode` 切走、tick 也冻结，此时会剩下 **8 个（74 个存活单位中）** 卡在挥砍帧上。属观感小瑕疵，要修就在 `drawActors` 里把 `allowSwing` 传成 `!world.over`（一行），本轮不动。

---

## 1. 一句话结论

用户说的两个毛病，根子分别是：

1. **「攻击只是站着掉血」** —— 挥砍帧**由 `u.cd` 驱动而不是「真出手」**：`cd` 在移动/待機分支也被重置（`core/battle.ts:2534`），于是每个兵每个周期 24/40 tick 都在挥空刀（改前待機局 240 tick 里画出 **235** 个攻击帧、出手 0 次）；真打的那一刀反而没有任何额外表现。同时士兵**一击必死**（`battle.ts:2584`），`hit_back` 那条「活着且刚挨打」的分支在士兵身上根本不可能成立 ⇒ 受击 0 帧；敵方连阵亡都没有（`ACTION_SIDES` 只含 `'A'`，`drawActors` 把死人整条跳过）⇒ 原地消失。
2. **「叠在一起」** —— 不是逻辑同格（实测 300 帧里逻辑同格 **0 对**），是**渲染几何**：贴图绘制宽 `75×0.96 ≈ 72px` 远大于车道节距 `43.59px`（相邻车道固定重叠 39.6%），再叠上 `±24/±18px` 的永久落点抖动与滑行对穿（最小中心距 **0.14px**）。

本轮把 ①修掉，②的补丁也已在 lead 放行后落地（`PATCH_jitter.md` / `PATCH_slide_offset.md`，数字见 §0）。

## 2. 改了什么

| 文件 | 改动 | 关键行 |
|---|---|---|
| `game/src/view/animSelect.ts` | 新增 `attackAgeOf()` / `deathAgeOf()` / `hitAgeOf()` / `usesDeathFrames()` / `HIT_FLASH_TICKS` / `DEATH_FRAME_TROOPS`；`isDying()` 改为委托 `deathAgeOf()`（两侧通用）；`pickActionFrame()` 阵亡分支加兵种白名单 | `:66` `:175` `:197` 一带 |
| `game/src/view/battleView.ts` | `pushSpriteFrames()` 挥砍判据改读 `lastAttackTick`；`drawActors()` 放行两侧尸体并对齐 `animTick`；新增 `pushHitFlash()`（后仰 3px + 2 tick 白闪 + 冲击星）与 `toppleCorpse()`（程序化放倒 + 淡出） | `:1207` `:1273` `:1382` `:1412` |
| `game/tests/anim_view.test.ts` | 新增 7 条断言 | 见 §5 |

行为变化，按用户能看见的顺序：

- **行军/待機不再挥空刀**，只有真出手才播 10 帧挥砍（24 tick ≈ 0.4s ≈ 25fps），A/B 两侧都生效（B 用 `front` + `attackEnemy`）。
- **命中瞬间**：挨打单位整体后仰 3px、头 2 tick 叠一层 `lighter` 白闪、胸口画一个金色「米」字冲击星，6 tick 内衰减。
- **阵亡**：不再原地消失。朴刀兵（兵种 0）用自带的 `death_back` 17 帧；其余兵种（含全部敵兵）冻结当时那一帧 + 程序化倒地旋转（`0.10 → 1.35 rad`）+ 后半程淡出，24 tick 后移除。
- **主将**：仍走 `drawGeneral`，不受影响（`deathAgeOf` 显式排除主将）。

## 3. 改前 / 改后（全部可复跑）

| 指标 | 改前 | 改后 | 出处 |
|---|---|---|---|
| 待機 240 tick 画出的攻击帧 | **235** | **0** | `probe_r194.json` Case 1 |
| 待機 240 tick 的出手次数 | 0 | 0 | 同上 |
| 接战 900 tick 攻击帧 vs 出手窗口 | 无关联 | **1393 == 1393**，450 采样 0 失配 | Case 2 |
| 受击反馈 sprite 层 | **0** | **52**（= 命中 35+17，逐 tick 对账 0 失配） | Case 2 |
| 敵方阵亡画出的帧 | **0**（原地消失） | **624 个倒地帧**，0 失配 | Case 2 |
| 我方骑兵阵亡用的素材 | 朴刀兵的 `death_back`（张冠李戴） | 程序化倒地（`DEATH_FRAME_TROOPS=[0]` 白名单） | Case 3 |
| 朴刀兵阵亡 | `death_back` | `death_back`（19 帧，不重复放倒） | Case 3 |
| 全量测试 | 1624 pass | **1631 pass / 0 fail**（10.3s） | `node --test tests/*.test.ts` |
| `tsc --noEmit` | — | **零输出** | `npx tsc --noEmit -p tsconfig.json` |

复现：
```powershell
cd F:\sanguo
node work\anim_fix\probe_r194.mjs                      # → work\anim_fix\probe_r194.json
cd game; node --test tests/anim_view.test.ts           # 7 条
node --test tests/*.test.ts                            # 全量
npx tsc --noEmit -p tsconfig.json
```

## 4. 没做 / 记 TODO

1. **`walk_v2` hold 5（3.1.4）** —— `unitFrames.ts:89 UNIT_HOLD = 5`，但 `units.json` 每组显式 `hold:4` 优先（`unitFrames.ts:155`），所以实际是 4（15fps 走 12 帧）。改 5 会撞三处既有断言：`tests/soldiers.test.ts:146`（`assert.equal(g.hold, 4)`）、`tests/units.test.ts:122-123`、`:183`。**本轮按指示不动**；真要改，先决定是改数据（`units.json` 的 hold）还是改断言，二者必须同步，否则测试红。
2. **骑兵/其余兵种的倒地素材** —— `actions.json` 只有一套（朴刀兵造型背视），`DEATH_FRAME_TROOPS` 因此只放 `[0]`。要按兵种倒地得补 13 套 death 帧，属于美术工作。
3. **`hit_back` 帧仍然用不上** —— 士兵一击必死，「活着且刚挨打」不存在；主将才有 HP，但主将走 `generalAtlas`。程序化白闪就是为了绕开这个素材缺口。
4. **Cocos 侧**（一处即可）：`game/cocos/assets/scripts/GeneralArt.ts:191 const attack = !dead && (u.cd ?? 0) > SWING_FROM;`（`SWING_FROM=96`，`:27`）—— 和 web 改前是**同一个 cd 门**，而 `ACTION_INTERVAL_TICKS=40`，所以这个条件恒假、Cocos 主将永远不挥砍；Cocos 侧也**没有** `animSelect` 镜像（`pickActionFrame|ACTION_SIDES|isDying` 全空）。等 web 定稿后同步过去。
5. **抖动砍半 / 滑行错位** —— 已在 lead 放行后**落地**（见 §0），数字：>50% 档 10.30 → 5.95 对/帧、>75% 档 1.20 → 0.07、最小中心距 0 → 12.17px。
6. **胜负已分后的挥砍冻结** —— tick 冻结时若某单位刚出手，会停在中途挥砍帧（实测 74 个存活里 8 个）。要修就在 `drawActors` 把 `allowSwing` 传成 `!world.over`（一行），本轮未动。

## 5. 验收断言清单（`game/tests/anim_view.test.ts`，9 条全绿）

1. `attackAgeOf` 只认 `lastAttackTick`：没出手 → null；出手当 tick → 0；默认窗口 20 的最后一 tick 19 有效、20 无效；显式 24 窗口 23 有效、24 无效。
2. `deathAgeOf` / `hitAgeOf`：**敵兵也有死亡窗口**（改前只有 `'A'`）；`hitAgeOf` 窗口 6；主将不进士兵尸体逻辑。
3. **待機 240 tick 一个攻击帧都不许画**（改前 235 个）。
4. **接战后逐 tick 攻击帧数 == 出手窗口内的可见单位数**（不变量对账，画多画少都红）。
5. **受击反馈层数 == 受击年龄 ≤1 的单位数**。
6. **两侧都留尸体**：`deathsA>0 && deathsB>0`，放倒帧数逐 tick 对账 0 失配，且不许出现朴刀的 `death_back`。
7. **兵种白名单**：朴刀（兵种 0）用自带 `death_back` 且不被程序化放倒。
8. **抖动幅度**：落格单位与格心偏移 ≤ ±12px 纵深 / ±9px 车道（改前 ±24/±18）。
9. **滑行不叠死**：任何两个 sprite 中心距 ≥ 8px（改前两个骑兵能重合到 0px，本轮实测最小 12.17px）。

断言口径上踩过的两个坑（写下来免得后人重踩）：
- `actions.json` 在内存里是 `Record<'attack_back'|'hit_back'|'death_back', Rect[]>`（**数组**，按 y/x 排序），不是 name→rect；
- 白闪是「同一帧再叠一层」，统计时先 `if (c.comp === 'lighter') continue;`，否则每 tick 多算 1–2 个；按锚点找尸体时容差要给后仰的 3px 留余量（≥5px）。

## 6. 视觉证据（不开浏览器）

`hits_seq.png`（3120×1144，8 个面板：t749 / t753 / **t757 命中** / t759 / t763 / t769 / t775 / t783，以受害者为中心裁切并放大 2.6×）：

![命中前后 8 帧](hits_seq.png)

同一个受害兵（离 `focus` 最近的 sprite）在这 8 个 tick 的实测参数：

| tick | 距 focus | `rot` | `alpha` | 说明 |
|---|---|---|---|---|
| 749 | 17.4px | 0.00 | 1.00 | 还站着（walk 帧） |
| 753 | 11.2px | 0.00 | 1.00 | 还站着 |
| **757** | 1.1px | **0.10** | 1.00 | **命中**：同时叠了一条 `comp='lighter'`、`alpha=0.55` 的复制帧（白闪）+ 金色「米」字冲击星 |
| 759 | 1.9px | 0.21 | 1.00 | 开始倒 |
| 763 | 6.1px | 0.43 | 1.00 | 倾斜变大 |
| 769 | 16.3px | 0.75 | 1.00 | 明显侧倒 |
| 775 | 27.5px | **1.08** | **0.48** | 只剩半透明（`age>13` 后开始淡出） |
| 783 | — | — | — | 已移除（`DEATH_TICKS=24`，757+24=781） |

- 面板 3（t757）：被击中的黄巾兵整条被提亮、身体开始前倾，旁边有金色冲击星 —— 3.1.2 的受击反馈。
- 面板 7（t775）：同一位置变成一条半透明、明显侧倒的躯体 —— 3.1.3 的程序化倒地 + 淡出，不是「原地消失」。
- 整张图里**没有**「所有人都在挥刀」的画面：行军时清一色是 walk 帧（挥砍只在 `lastAttackTick` 之后 24 tick 内出现）。

生成方式（不依赖浏览器/dev 服务器）：
```powershell
cd F:\sanguo
node work\anim_fix\dump_hits.mjs          # → work\anim_fix\hits_dump.json（sprite 指令 + 命中点）
cd work\anim_fix
& "C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" render_hits.py   # → hits_seq.png
```
`render_hits.py` 只是把 `buildFrame()` 吐出的 sprite 指令（含 `rot` / `alpha` / `lighter`）按 Pillow 重放一遍，等价于 `battleView.render()` 里 `ctx.drawImage` 那一层，因此能当「没有 GPU 的截图」用。

## 7. 浏览器

本轮**没有重跑浏览器**（含 R194-core 这一轮）：页面加载的是 `game/dist`，而 `src` 正被并行改写（build 会覆盖别人的产物）。证据全部来自 Node 侧真实 `buildFrame()` 输出（同一份 `battleView.ts`，只是 canvas 换成了指令数组），可复现、无时钟依赖。
清理纪律：只用 `node work\cocos_verify\reap.mjs --kill --match=edgeprof_anim`，收尾输出「遗留验证浏览器进程: 0」；9342 端口无监听。
