# 68 · Cocos 逻辑层重同步（core/ → 与 web 真源对齐）

> 任务：w2-cocos-core。目标 `F:\sanguo\game\cocos\assets\scripts\core\**`，真源 `F:\sanguo\game\src\core\**`。
> 本轮只做**源码同步 + 类型检查 + node 侧验证**；不跑 Creator 构建、不在 Creator 里操作（见 §6）。
> 状态：**已完成**（2026-11-25）。同步 15 个文件（旧 5236 行 → 新 9593 行）、6 条 KEEP_PATCHES、
> `tsc --noEmit` EXIT=0、`verify_core.cjs` 36 条断言全过、同步脚本幂等（第二次 0 写入）。
> §0 是**改代码前**的登记表，落地后的实际行号见 §4。

## §0 调用点改动登记（改代码前留档，4.1–4.8）

只动我拥有的 6 个根文件中的 2 个：`GameState.ts`、`BattleRoot.ts`。其余 4 个
（`DeployRoot` / `CampaignRoot` / `BootRoot` / `ArtLayer`）**未改**。

| # | 文件 | 位置（改前） | 改动 | 理由 |
|---|------|--------------|------|------|
| 4.1 | `GameState.ts` | `CampaignSave` :23-35 | 加 `streak: number` / `bestStreak: number` | core 的 `BattleRecord` 有连胜/最高连胜（`battle.ts:242-247`），存档不存就永远是 0；`settle().record` 只能从 0 起算 |
| 4.2 | `GameState.ts` | `normalize()` :177-188 | 两字段 `Math.max(0, Math.floor(numberOr(obj.x, 0)))` | 与既有字段同口径兜脏值；旧存档没有这两键，缺省 0 |
| 4.3 | `GameState.ts` | `BattleLoadout` :70-107 | 加 `weather?: number`、`bwise?: number \| null`、`reinforce?: ReinforceConfig[]` | 这三项要能从出征/大地图传到 `createWorld`；当前 `BattleLoadout` 没有，`BattleRoot` 无从透传。`ReinforceConfig` 用 `import type`（只在类型位，不产生运行期依赖） |
| 4.4 | `GameState.ts` | `recordBattleResult()` :512-530 | 加第 5 个可选参 `record?: BattleRecord`；给了就以它为准（不再 `wins += 1`），没给保持旧语义 | `settle()` 内部已经用 `updateRecord(world.record, …)` 把这一场算进去了（`battle.ts:1636`）。若存档再 `+1` 会把胜场/连胜双计。占城/丢城/撤部队的副作用保持原样 |
| 4.5 | `BattleRoot.ts` | `createWorld({…})` :220-248 | 传 `weather: launch?.weather`、`record`（取自存档）、`reinforce: launch?.reinforce`；`a.strategy: launch?.wise ?? null`、`b.strategy: launch?.bwise ?? null` | 任务书要求 `createWorld` 能收 `terrain/weather/strategy/reinforce`；`strategy` 在 core 里是**每侧**字段（`SideConfig.strategy`，`battle.ts:206`），不是顶层字段 |
| 4.6 | `BattleRoot.ts` | `createWorld` 之后 :249-256 | 保留 `applyWise(world,'A',launch.wise)`，另加 `applyWiseOnBattleStart(world, data)` | 与 web `main.js:651-655` 同款分工：A 侧由玩家挑（`applyWise`），B/AI 侧由 `applyWiseOnBattleStart` 按其 `WISESKILL`+等级自动发动。该函数同 world 幂等、只补「不是玩家自己挑」的侧 |
| 4.7 | `BattleRoot.ts` | 结算 :159-168 | `recordBattleResult(..., this.settlement.record)` | 把 core 算出的战绩（含连胜）落到存档，配合 4.4 不双计 |
| 4.8 | `BattleRoot.ts` | HUD :546-565 | 第二行加「战场消息」（`world.log` 最后一条 + `world.fled` 撤退标记）；结算文案加「連勝 N（最高 M）」 | 任务书要求 `World` 的新字段（`log/fled/record/army/…`）「能被场景读到」——只加类型不加读取点等于没接 |

**不改的**：`DeployRoot` / `CampaignRoot` / `BootRoot` / `ArtLayer`；`shim/host.ts`；`AudioBus.ts` /
`AudioHost.ts`（不在我的文件范围，见 §6 遗留 2）。

> 以下是同步完成后的回填；§0 是改代码前的登记，落地行号见 §4。

## §1 差异清单与判定

生成方式：`node work\cocos_core\sync_core.mjs --diff-only` —— 右侧是 web 原文**只做导入去 `.ts`
+ LF 归一**、**不打补丁**，所以 Cocos 的适配差异会原样出现在 diff 里，便于逐条判「web 新功能」
还是「cocos 适配」。产物 `work\cocos_core\diff_before.txt`（142477 B / 2955 行，末尾自带汇总段），
另按文件切了 `work\cocos_core\diff_parts\`（15 个 `.diff`）方便逐条读。

diff 汇总（原样）：

```
web 源文件 15 个；cocos 已存在 12 个；cocos 缺 3 个：audio_bus.ts, strategy.ts, syso_host.ts
内容相同 3 个：march.ts, smartscript/so.ts, smartscript/vm.ts
cocos 多出（web 已无）0 个：无
带 KEEP_PATCHES 的文件：smartscript/runtime.ts, unlock.ts, wises.ts
```

逐文件判定：

| 文件 | hunk | 差异是什么 | 判定 |
|------|------|-----------|------|
| `battle.ts` | 28 | 旧 fork 的常量/字段/流程被删：`MORALE_DAMP=2`、`QI_REGEN_PER_TICK=200`、`QI_COST_SCALE=120`、`endReason`、`mode:1\|2`、`record:{wins,losses}`、`import { resolvePostBattle } from './capture'`、旧 `createWorld`/`powerOf`/`hitChance`/`step`/`settle` 主体 | **web 新功能**为主（新常量 `QI_START=60000`/`QI_COST_SCALE=1200`/`MORALE_DAMP=1`、`hpCapOf/mpCapOf/cavalryCapOf/basicDamage/warMeritOf/extraExpOf/updateRecord/requestRetreat/settleMode/settleReport`）+ 旧 fork 残留整段丢弃 → 全量覆盖，**无补丁** |
| `capture.ts` | 9 | 旧 `PostGeneral{name,str,int,level,alive}`、旧 `resolvePostBattle` 自动流、忠诚惩罚 `-=(10-节操)*2`、`captureChance` 最小模型被删 | web 重写了招降/斩首/释放/掉落 → 覆盖，**无补丁** |
| `garrison.ts` | 3 | 旧 `enemyTroops = min(100,max(60,round(garrison/6)))` 与兜底守将被删 | web 新算法 → 覆盖，**无补丁** |
| `roster.ts` | 1 | 旧 `save.roster` 读写被删（web 改了函数签名） | web 新功能 → 覆盖，**无补丁**（Cocos 侧无调用点，tsc 已确认） |
| `smartscript/runtime.ts` | 9 | 3 处真适配（见 §2 K1/K2/K3）；其余是 web 新功能：`readonly syso: SysoHost` + 构造时 `new SysoHost`（rand/spawn/setObjectPx/loadResource/sound/applyHpDelta/global/callScript/text/trace 端口，store 越界落 `engineOverflow`）、`globalValue()`、`brightness()` 发 `emitBrightness`、新增 `brightnessOf()`、`screenFlash()` 发 `emitFlash`、`callScript()` 三级分派（`callSystemSo` → `syso.has/call` → `vm.invokeByName`）、`SkillSession.syso` getter | 3 条补丁 + 其余覆盖 |
| `smartscript/syscalls.ts` | 3 | `VmHost` 加 `brightnessOf()`；`0x110` 加 `ctx.screenFlash(false)`；`0x130` 由 `r(16)` 改 `r(ctx.brightnessOf())` | 全 web 新功能 → 覆盖，**无补丁** |
| `unlock.ts` | 3 | import 扩到 `GameData/Magic/Wise`；`[...out]` vs `Array.from(out)`；+274 行学习门槛 API（`canLearn/learnable/learnableWise/pendingLearn/applyLearn/onLevelUp/monthlyLearnCheck`…） | K4 保留 + 其余覆盖 |
| `weather.ts` | 2 | 只剩注释差异（Cocos 头注释「本文件是 Cocos 侧独立副本」已过期）+ `normMonth` 括号风格 `(((m-1)%12)+12)%12+1` vs `((m-1)%12+12)%12+1` | **代码等价**（`%` 与 `+` 同级左结合），不是适配 → 覆盖，**无补丁** |
| `wises.ts` | 5 | 注释改「消费点」口径；`parseWiseSkill` 数据类型差异（K5）；`[...best.values()]`（K6）；+83 行 `applyWiseOnBattleStart/BattleStartWise/autoWiseOf` | K5/K6 保留 + 其余覆盖 |

判定原则（写进脚本的白名单只收第 2 类）：

1. **能改回 web 语义的**（注释、括号、纯风格）→ 一律覆盖，不许拿「以前就是这样」当适配；
2. **Cocos 运行期/数据格式限制**：`import.meta` 非法、音频总线必须是同一个模块实例、
   Creator Babel 的 loose spread 不展开 Set/迭代器、`generals.json` 的 `WISESKILL` 是整串
   `"39, 54"` 而不是数组 → 才进 `KEEP_PATCHES`，且每条必须带「删掉会怎样」。

## §2 保留的 Cocos 适配（6 条，白名单在 `work\cocos_core\sync_core.mjs` 的 `KEEP_PATCHES`）

脚本对每条补丁的 `from` 做**恰好命中 1 次**校验（命中 0 次或多次直接抛错并打印锚点首行），
所以 web 侧一旦改了这 6 处的原文，同步会失败而不是静默丢补丁。

| # | 位置 | web 原文 | Cocos 保留 | 理由（删掉会怎样） |
|---|------|----------|------------|--------------------|
| K1 | `core\smartscript\runtime.ts:52-57` | `const DATA_URL = new URL('../../../data/', import.meta.url);` | 一段说明 + `const DATA_URL = new URL('data/', 'https://cocos.local/');` | Creator 产物是 `System.register` 包起来的函数体，**`import.meta` 不是合法语法**，rollup 直接判死整包构建。Cocos 走预加载（`assets\scripts\shim\host.ts` 已装好数据），这个常量只给同步 XHR / `node:fs` 兜底分支用，指哪都无所谓 |
| K2 | `core\smartscript\runtime.ts:27-29` | `import { callSystemSo, emitBrightness, emitFlash, emitSfx } from '../audio_bus';` | `import { … } from '../../AudioBus';`（带两行注释） | Cocos 的音频总线实例在 `assets\scripts\AudioBus.ts`，`AudioHost.ts` 只认它。改成 `../audio_bus` 会**另建一个模块实例**：脚本音效进了 A 实例、AudioHost 从 B 实例取，声音永远不响（`core/audio_bus.ts` 是 web 真源副本，见 §6-2） |
| K3 | `core\smartscript\runtime.ts:895-898` | `emitSfx({ name, volume, unit, source: unit===undefined?'syscall:0x301':'syscall:0x300', clock: this.clockValue })` | `emitSfx({ name, volume, source: 'script' });`（保留 `this.soundsEmitted++`） | Cocos `AudioBus.SfxInput.unit` 是 **`Unit` 对象**（用于定位），脚本里的 `unit` 是**槽位序号**，硬塞会把事件打歪；`source/clock` 也只有 web 版 bus 认 |
| K4 | `core\unlock.ts:103-108` | `return [...out].sort((a, b) => a - b);` | `return Array.from(out).sort((a, b) => a - b);` | Creator 的 Babel（`plugin-transform-spread` loose）把 `[...set]` 编成 `[].concat(set)`，Set 不展开 → 运行期拿到 `[Set]`，兵种/阵形白名单整排误判成「未学」 |
| K5 | `core\wises.ts:355-377` | `const raw = general.WISESKILL; if (!Array.isArray(raw)) return [];` | 先按 `unknown` 取出，字符串按 `[,\s]+` 切 token 再两两配对（保留「第 4 处偏离」注释） | Cocos 的 `generals.json` 里 `WISESKILL` 是整串 `"39, 54"`，web 版的 `!Array.isArray` 会直接返回 `[]` → **军师技列表整排消失**（本文件 §5 验证时 `pickStrategySeq('關羽',60)` 就是靠这条才拿到 `seq=54`） |
| K6 | `core\wises.ts:424-427` | `return [...best.values()].sort(…).map((v) => v.seq);` | `return Array.from(best.values()).sort(…).map((v) => v.seq);` | 同 K4 的 Babel 原因：`[...iterator]` 编成 `[].concat(iterator)` 不展开，`sort/map` 落在迭代器上，UI 显示「技 undefined」 |

## §3 同步后文件/行数对照表

`sync_core.mjs` 首跑结果：**写入 12 个 / 内容已一致 3 个 / cocos 多出 0 个**；第二次、第三次
再跑都是 **0 写入、15 个一致**（幂等，日志见 §5）。

| 文件（`core\` 下） | 旧行数 | 新行数 | web 行数 | 新字节 | 动作 | 补丁 | EOL |
|---|---:|------:|------:|---:|------|------|-----|
| `audio_bus.ts` | 0 | 592 | 592 | 22010 | 新建 | — | LF |
| `battle.ts` | 910 | 1648 | 1648 | 72419 | 覆盖 | — | CRLF |
| `capture.ts` | 363 | 556 | 556 | 21483 | 覆盖 | — | LF |
| `garrison.ts` | 352 | 546 | 546 | 21560 | 覆盖 | — | LF |
| `march.ts` | 176 | 176 | 176 | 6687 | 未变 | — | LF |
| `roster.ts` | 47 | 201 | 201 | 8447 | 覆盖 | — | LF |
| `smartscript\runtime.ts` | 1178 | 1293 | 1289 | 51052 | 覆盖 | K1;K2;K3 | CRLF |
| `smartscript\so.ts` | 251 | 251 | 251 | 7472 | 未变 | — | LF |
| `smartscript\syscalls.ts` | 417 | 424 | 424 | 15775 | 覆盖 | — | CRLF |
| `smartscript\vm.ts` | 861 | 861 | 861 | 30450 | 未变 | — | LF |
| `strategy.ts` | 0 | 1044 | 1044 | 41529 | 新建 | — | LF |
| `syso_host.ts` | 0 | 960 | 960 | 41207 | 新建 | — | LF |
| `unlock.ts` | 173 | 442 | 438 | 20085 | 覆盖 | K4 | LF |
| `weather.ts` | 86 | 85 | 85 | 4258 | 覆盖 | — | LF |
| `wises.ts` | 422 | 514 | 497 | 26024 | 覆盖 | K5;K6 | LF |
| **合计 15 个** | **5236** | **9593** | **9568** | — | 12 写 / 3 未变 | 6 条（25 行） | — |

新行数 = web 行数 + 补丁注释行（runtime +4、unlock +4、wises +17 = 25）。逐文件明细在
`work\cocos_core\manifest.csv`（列：`file,src_bytes,src_lines,src_sha16,dst_before_bytes,
dst_before_lines,action,dst_after_bytes,dst_after_lines,dst_sha16,keep_patches,src_eol`）。

同步后复核（`work\cocos_core\check_after.py` → `diff_after.txt`）：**web 15 个文件里 12 个与
Cocos 现文件逐字节一致**（仅导入扩展名不同），残留差异只有 3 个文件、且**恰好就是 K1–K6 六段**，
没有第七处漏改或多改。

## §4 调用点改动

登记表见本文件上半部分（4.1–4.8）。实际落地行号（改后）：

- `GameState.ts:13-14` 新增 `import type { BattleRecord } from './core/battle'`、
  `import type { ReinforceConfig } from './core/strategy'`；
- `GameState.ts:34-35` `CampaignSave` 加 `streak/bestStreak`，`GameState.ts:202-203` `normalize()` 兜底；
- `GameState.ts:120/122/127` `BattleLoadout` 加 `weather?/bwise?/reinforce?`；
- `GameState.ts:539-570` `recordBattleResult(..., record?: BattleRecord)`：第 5 参给了就整组采信
  （`if (record)`，:549），不再 `wins += 1`，避免与 `settle()` 里的 `updateRecord` 双计；
- `BattleRoot.ts:35` import `applyWiseOnBattleStart`；`:226` 从存档取战绩基线；
  `:238/:242` 透传 `weather/reinforce`；`:249/:260` 传 `a.strategy/b.strategy`；
  `:281` createWorld 之后 `applyWiseOnBattleStart(world, data)`；
  `:164-169` 结算时把 `this.settlement.record` 交给 `recordBattleResult`；
  `:567` HUD 显示 `world.fled/status`（撤退/被俘标记）；`:585` 显示 `world.record` 连胜；
  `:599-605` 结算文案加连胜；`world.log` 最后一条也在 `:585` 那行显示。
- 未改：`DeployRoot` / `CampaignRoot` / `BootRoot` / `ArtLayer`、`shim/host.ts`、`AudioBus.ts` / `AudioHost.ts`。

## §5 验证输出

**幂等**（`work\cocos_core\run2_idempotent.log`、`run3_idempotent.log`，两次都是）：

```
[sync] 已写入
汇总：web 源 15 个文件；本次写入 0 个、内容已一致 15 个、cocos 多出 0 个
manifest → F:\sanguo\work\cocos_core\manifest.csv
```

**类型检查**（`F:\sanguo\game\cocos\` 下）：`node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit`
→ `EXIT=0`（`--listFiles` 共 91 个文件，含 `core/battle.ts`、`core/strategy.ts`、`core/syso_host.ts`、
`core/audio_bus.ts`、`BattleRoot.ts`、`GameState.ts`）。

**运行时验证**（`work\cocos_core\verify_core.cjs`，先 `tsc -p tsconfig.sim.json` 把 `core/**` + `AudioBus.ts`
编成 CommonJS 到 `_sim/`，再用 node 24 跑；完整输出存 `work\cocos_core\verify_core.log`）：

```
0. 同步后的导出面（旧 fork 里没有的这几项必须在）
  [PASS] battle.requestRetreat 存在 — typeof = function
  [PASS] battle.settle 存在
  [PASS] strategy.planStrategy 存在
  [PASS] strategy.tickStrategy 存在（step() 里会调）

1. requestRetreat() 存在且可用
  [PASS] requestRetreat(world, "A") 第一次返回 true
  [PASS] world.fled.A 变成 true
  [PASS] world.status.A = 2（撤退中，docs/04b:530）
  [PASS] 重复下达撤退令返回 false（幂等）
  [PASS] 该侧所有存活单位都拿到了 flee 标记

2. World.fled 有值
  [PASS] 未撤退时 fled = {A:false, B:false}
  [PASS] 未撤退时 status = {A:0, B:0}
  [PASS] A 撤退不影响 B 的 fled
  [PASS] 撤退单位全部离场后判定结束 — endReason=retreat winner=B ticks=193
  [PASS] 结束状态仍是撤退/被俘码 — status.A=2

3. World.stats.blocks 有值（格挡声 defense 的数据源）
  [PASS] stats.blocks 是 number 字段 — 初值=0
  [PASS] 一场对砍下来 blocks 累加了 — blocks=96 hitsA=64 hitsB=8

3b. AudioBus 端到端：格挡声 defense 真的会产出
  [PASS] AudioBus 产出 defense（格挡声） — hit01=59 defense=69 death=68 ...
  [PASS] 同一场里 hit01 也在（证明不是只靠 blocks 判定）

4. settle().record 带连胜（存档战绩基线 → updateRecord）
  [PASS] createWorld 接受存档战绩基线 — record={"wins":2,"losses":1,"streak":2,"bestStreak":2}
  [PASS] 碾压局由 A 取胜 — winner=A ticks=181
  [PASS] record.wins 累加到 3 — wins=3
  [PASS] record.losses 保持 1
  [PASS] record.streak 累加到 3（连胜） — streak=3
  [PASS] record.bestStreak 跟着刷新
  [PASS] settle() 幂等（第二次返回同一对象，连胜不会再加）
  [PASS] SettleResult.status 透传（场景可读战果码）

5. strategy.ts 的 planStrategy() 能返回一条
  [PASS] pickStrategySeq(關羽, lv60) 取到一条军师技 — seq=54
  [PASS] createWorld 把 SideConfig.strategy 写进 world.army.A.seq — army.A.seq=54
  [PASS] planStrategy(world, "A", unit) 返回了一条 — seq=54 kind=ambush
  [PASS] 返回的 StrategyPick 是我方刚配的那条
  [PASS] runStrategy() 产出了可播报的文本 — text=敵將騎黃鬃馬，破解我方埋伏。
  [PASS] strategyUsed.A 记账（view 层据此判「已放过」）
  [PASS] world.log 里有这条战场消息（场景 HUD 读它） — log=1 条：…

5b. step() 内自动派发军师技（tickStrategy 接线）
  [PASS] 不打手动 API，靠 step() 也派发了一次 — events=2 ticks=123

6. AudioBus 端到端：撤退声 yell03
  [PASS] fled false→true 那一帧产出 yell03（撤退喊声） — events=yell03,horse02
  [PASS] 同一帧还有 horse02（马嘶/离场）

断言 36 条全过
```

这 36 条里，直接对应 project/67 §「没做到」第 4 条的是第 3/3b（`stats.blocks` → `defense`）与
第 6 组（`fled` → `yell03`）：**两条音效的触发条件在同步后都真实成立了**，不是只多了个字段声明。

## §6 没做到的

1. **没跑 CocosCreator 构建、也没在 Creator 里点过一局**。所以「bundle 里的 `core` 是否真的是
   新版、scene 是否真的读到新字段」**未知**：本轮只证明了 `tsc` 全绿 + node 侧逻辑全绿。
   要在 Creator 里真打一场出征/守城，看 HUD 有没有「連勝/戰場：…」、撤退时有没有 `yell03`、
   格挡有没有 `defense`，才算端到端闭环。
2. **两份音频总线并存**（结构遗留，需 lead 决策）：`core\audio_bus.ts`（本轮新建的 web 真源副本）
   与 `assets\scripts\AudioBus.ts`（Cocos 手工移植，547 行级）同时存在。`runtime.ts` 按 K2 走后者，
   所以 `core\audio_bus.ts` 目前是**没有被任何文件引用的真源副本**。统一要改 `AudioBus.ts` /
   `AudioHost.ts`（不在我的文件范围，我没动）。风险：以后 web 侧修 `audio_bus.ts` 不会自动生效到 Cocos，
   两份实现会继续漂移。
3. **发现 AudioBus.ts 的一个既有 bug（不是本轮引入）**：`assets\scripts\AudioBus.ts:394`
   `const name = \`yell0${1 + (Math.abs(u.x * 7 + u.y * 13) % 4)}\`` —— `%` 前没有取整，会生成
   `yell02.5788526702366426` 这种音效名（§5 第 3b 组的实测输出里就能看到），该名字查不到资源；
   web `core\audio_bus.ts:413` 是 `1 + (Math.abs(...) | 0) % 4`。建议 lead 一行修（加 `| 0`）。
   我没改，因为 `AudioBus.ts` 不在我的文件范围内。
4. **新增的 `BattleLoadout.weather/bwise/reinforce` 目前没有生产者**：`DeployRoot` / `CampaignRoot`
   里还没有对应入口（本轮不许改它们的 UI）。也就是说正常玩法下天气仍由 `month+terrain` 推、援军恒为
   空、敌方军师技只能靠 `applyWiseOnBattleStart` 自动挑。要真用上得在编成/出征界面加控件。
5. **HUD 只显示 `world.log` 最后一条**（没有滚动战场消息栏），`world.army` / `strategyEvents` /
   `strategyUsed` 只在「军师技 note / 连胜」上间接可见，没有专门的兵力/援军面板。
6. **连胜的完整链路没在 Creator 里跑过**：`recordBattleResult` 仍是 `if (!city) return`，直接打开
   Battle 场景的默认局（没有 city）不落战绩；「打完回大地图 → 再打一场 → 连胜累加」需要走一遍战役
   流程才能验，本轮只在 node 侧验了 `settle()` 的 `updateRecord` 行为。
7. **3 个新文件没有 `.meta`**：`audio_bus.ts` / `strategy.ts` / `syso_host.ts` 的 `.meta`（uuid）要等下次
   打开 Creator 由 asset-db 生成（沿用 `work\cocos_sync\sync_assets.mjs` 的约定：uuid 不能手写）。
   导入是相对路径，按理不影响编译；但在 Creator 首次导入前，资源面板里看不到这三个脚本。
8. **验证跑的是 `_sim`（tsc CommonJS 产物），不是 Creator 的 System.register 产物**。K4/K6 针对的
   「Babel loose spread 不展开 Set/迭代器」只在 Creator 编译期出现，node 侧无法复现 —— 只能靠保留
   `Array.from` 规避，无法在本轮自动证明。
9. 没跑构建 ⇒ 没有产物体积、编译告警、真机帧率数据。

