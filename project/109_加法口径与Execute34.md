# R33 加法口径与 Execute 34

- 任务：`r33-battle-add`
- 结论：① 军师技战力加成已按原作从 **乘算** 改为 **纯加法**；② `Execute 34 / 3 後選出陣` 的语义已查清，但在本轮授权文件内**无法实现**，按任务书 fallback 交付带证据的 `[阻塞]`，并用证据测试钉死「不是第 3 回合补兵」。

---

## 一、原作依据

### 1. 战力是 150 起步的和，五段全加法

`docs\04b5_战力基准与疲劳反汇编.md`：

- §1.2：`unit+0x70`（战力）初值硬编码 150 —— `0x43A3AD` / `0x43A3B7` 两条 `mov dword [slot], 0x96`；A 侧槽位 `0x4A8A60+0x70 = 0x4A8AD0`，B 侧 `0x4B03A0+0x70 = 0x4B0410`。
- §1.3：B 侧 `0x442EFA`（A 侧 `0x443498` 镜像）五段全部是 `add`，没有乘法：
  - 兵种相克 `0x430766`
  - 地形 `0x4307AE`
  - 阵法 `0x4307E5`
  - 全局修正 `(unit+0x30+50)/100`
  - 士气 `(士气−50)/5`
  - `idiv` 向 0 截断 ⇒ JS `Math.trunc`（本作 `moraleTerm()` 已是）。
- §4.1：旧实现 `powerOf` 末尾的 `(1 + wiseBonus/100)` 在 `0x442EFA` / `0x443498` 里**没有对应指令**；原作是纯加法。
- `docs\04b_战斗系统.md` §2.5（:620）同口径：「战力 = 150 + 兵种相克 + 地形 + 阵形 + (士气−50)/5」，「相克不做乘数，做加数」。

### 2. 军师技的 +10/20/30 是直接加到 `army+0x70` 的**点数**

`work\dis_battle_B_44D450.txt`（`0x44D450` 派发器，分支号 = `wises.json` 的 `Execute`）：

| Execute | 地址 | 指令 | 含义 |
|---|---|---|---|
| 21 | `0x44DAF4` | `add dword [eax+0x70], 0xa`（`:505-509`） | 我方士兵攻击 +10 |
| 22 | `0x44DB1B` | `add dword [ecx+0x70], 0x14`（`:517-521`） | +20 |
| 23 | `0x44DB42` | `add dword [edx+0x70], 0x1e`（`:529-533`） | +30 |
| 24 | `0x44DB69` | `sub dword [eax+0x70], 0xa`（`:541-545`） | 敌方士兵攻击 −10 |
| 25 | `0x44DB90` | `sub dword [ecx+0x70], 0x14`（`:553-557`） | −20 |
| 26 | `0x44DBB7` | `sub dword [edx+0x70], 0x1e`（`:565-569`） | −30 |

`army+0x70` 与 `unit+0x70` 是同一个战力槽（见 04b5 §1.2 的绝对地址），所以落点就是 `powerOf` 的 `base`，量纲是**点**，不是百分比。这比 §4.1 的负证据更直接：原作自己就把「士兵攻擊力上昇」写成 `+=` 点数。

`work\dis_form_init_43A1C4.txt:149/156`：战斗初始化 `0x43A1C4` 在建好两侧单位后调 `0x44D450(side=0, unitA, unitB)`（`0x43A3E5`）与 `0x44D450(side=1, unitB, unitA)`（`0x43A3F7`），即军师技是**开战瞬间一次性结算**，与本作 `applyWiseOnBattleStart` 的时序一致。

### 3. 为什么同一批 MOD 里 3 条乘算、1 条加法

只有 `troop_atk → powerOf` 应该加法；另外三条原作确有乘算证据，**保持不动**：

- `qi_regen` / `qi_cost`：`0x43E72E` 的跳表（130/150/200/76/66/50%），本作 `tickSkills` / `qiCostMul` 用 `(1 + bonus/100)`。
- `exp_bonus`：`0x4103DE(base, pct)` 是真正百分比；`unit+0x3C` 是经验倍率，本作 `settle` 用 `(1 + bonus/100)`。

因此这不是「口径不一致」，而是按每个消费点的原作指令分别对齐。

---

## 二、改动 file:line

> 行号为改后；未改 `game\web\**`、`game\src\core\smartscript\**`、`game\cocos\**`、`project\37a|31|44` 与 `wises.json`。

| 文件 | 行 | 改动 |
|---|---|---|
| `game\src\core\battle.ts` | `1337-1343` | `powerOf` 去掉 `Math.round(base * (1 + bonus/100))`，改为 `return base + wiseBonus(world, side, 'troop_atk');`；注释引 `0x44D450` exec 21-26、`army+0x70`、`0x442EFA` 与 project/109。`strategyAtk` 仍在 `base` 里。 |
| `game\src\core\wises.ts` | `33-34` | 头部量表：我軍 +10/20/30 點、敵軍 −10/20/30 點。 |
| `game\src\core\wises.ts` | `45-61` | R84 三分法里 seq 3 改成 `[阻塞]` + 证据链（地址、ATTRIB、缺队列、测试锁）。 |
| `game\src\core\wises.ts` | `67-81` | `mod` 说明按通道分量纲；写明「3 乘 1 加」的原作理由。 |
| `game\src\core\wises.ts` | `131` | `WiseChannel`：`troop_atk` = 点，其余 = 百分比。 |
| `game\src\core\wises.ts` | `202-209` | SPECS：17/46/64 = self +10/+20/+30；16/45/63 = enemy −10/−20/−30（`target:'enemy'`）。 |
| `game\src\core\wises.ts` | `227-237` | `WISE_UNIMPLEMENTED` 注释：seq 3 仍占位，标 `[阻塞]`。 |
| `game\src\core\wises.ts` | `246-271` | `WiseModifier.value` / `wiseBonus()` 注释：量纲按通道分。 |
| `game\src\core\wises_effects.ts` | `146-167` | `WISE_SYSO_UNSUPPORTED[3]` 与档头注释改成带 `0x44DE44`、`ATTRIB=1`、缺 Obj3 队列、三处测试锁的 TODO，标 `[阻塞]`。 |
| `game\src\core\strategy.ts` | `498-504` | `case 'reserve'`：注释改为「`0x44DE44` 只有 push `0x491900("成功")` + 消息栏、无状态改动；3 是 SEQUENCE 不是回合；不造第 3 回合补兵」。行为仍只 `ops.push({op:'note'})`。 |

### 旧测试期望值（lead m00242 裁决 A 授权）

| 文件 | 行 | 改动 |
|---|---|---|
| `game\tests\wises.test.ts` | `12-14` | 加 R33 说明。 |
| `game\tests\wises.test.ts` | `255` | 用例标题改为「增強攻擊 10 點 + 20 點 = 30 點」。 |
| `game\tests\wises.test.ts` | `386-396` | `expectedValue`：`troop_atk` 走 `base + delta`，其余通道保持原乘算/原值。 |
| `game\tests\wises.test.ts` | `406-429` | `MOD_CASES`：16/45/63 量 B 侧、delta −10/−20/−30；17/46/64 量 A 侧、delta +10/+20/+30。 |
| `game\tests\smartscript.session.test.ts` | `224-229` | 改用 seq 17，断言 `powerOf === p0 + 10`（原 `round(p0*1.08)` 已推翻）。 |

---

## 三、差分量测表

同一局面、同一 seed（42，`createWorld` 预设两侧配置），军师技开/关：

| 技 | seq | 测量侧 | base | 旧乘算 `round(base*(1+δ/100))` | 新加法 `base+δ` | 差（新−旧） |
|---|---|---:|---:|---:|---:|---:|
| 增強攻擊 L1 | 17 | A | 220 | 242 | 230 | −12 |
| 增強攻擊 L2 | 46 | A | 220 | 264 | 240 | −24 |
| 增強攻擊 L3 | 64 | A | 220 | 286 | 250 | −36 |
| 強化士兵 L1 | 16 | B | 84 | 76 | 74 | −2 |
| 強化士兵 L2 | 45 | B | 84 | 67 | 64 | −3 |
| 強化士兵 L3 | 63 | B | 84 | 59 | 54 | −5 |

同一 seed 的命中与普攻伤害（兵→兵、晴、目标未移动，`p = 战力`，伤害 `trunc(p*4/0xC0)`，步兵）：

| 技 | 战力 | 旧命中/伤害 | 新命中/伤害 |
|---|---:|---:|---:|
| 增強攻擊 L1 | 220 → 230 | 242 / 5 | 230 / 4 |
| 增強攻擊 L2 | 220 → 240 | 264 / 5 | 240 / 5 |
| 增強攻擊 L3 | 220 → 250 | 286 / 5 | 250 / 5 |

> `base` 220 / 84 是含兵种相克、地形、阵形、士气、`strategyAtk` 的实际和；`strategyAtk` 仍是加法，不参与乘算。
> 数字由 `game\tests\r33add.test.ts` 的 `t.diagnostic` 打印并断言；不是手填。

---

## 四、测试

### 新增（10 条）

- `game\tests\r33add.test.ts`（4 条）
  1. 6 条 `troop_atk` 逐档差分：`p1 === p0 + delta` 且 `p1 !== oldP`。
  2. 命中/伤害差分：`hitChance === p0 + delta`、`basicDamage === trunc(p1*4/0xC0)`。
  3. 边界：`qi_regen` 仍 ×1.25、`qi_cost` 仍 0.8、`exp_bonus` 仍 ×1.15。
  4. 叠加：`army.A.atkMod = 30` → +30；再 +10 → +40；`atkMod = −10` → 净 0；全加法不互乘。
- `game\tests\exec34.test.ts`（6 条，证据/反例，不是实作）
  1. `wises.json` 第 3 条：`Execute=34 / ATTRIB=1 / ACTIVE=8`。
  2. 策略表 `reserve`、文字「成功」、占位表含 `0x44DE44` 与 `[阻塞]`。
  3. 派发只回 1 个 `note`，战力与部队快照不变。
  4. 跑满 1200 tick：unit 集合只减不增，第 3 回合也不多兵；且本局确实派发过 Execute 34。
  5. `applyWise(3)` 仍 `ok:false`（占位契约；实作前必改）。
  6. `tickStrategy` 派发同样只有一句 `note`。

### 定向结果

- `node --test tests/r33add.test.ts` → **4 pass / 0 fail**
- `node --test tests/exec34.test.ts` → **6 pass / 0 fail**
- `node --test tests/r33add.test.ts tests/wises.test.ts tests/smartscript.session.test.ts` → **61 pass / 0 fail**

### 变异验证（改坏 → 红，已全部还原）

| # | 变异 | 结果 |
|---|---|---|
| 1 | `battle.ts:1343` 改回 `Math.round(base*(1 + bonus/100))` | `r33add` **3 fail / 1 pass**；失败点「新口徑必須是 base + 點數」「命中值也是加法」「疊加不互乘」 |
| 2 | `wises.ts:207` 把 seq 16 的 `target:'enemy'` 改成 `'self'` | `r33add` 1 fail + `wises.test.ts` 1 fail（R69 消費點 #16） |
| 3 | `strategy.ts:503` 的 reserve 额外 `world.army[side].atkMod += 5` | `exec34` 1 fail（「後選出陣在戰場內核不該改任何數值/部隊」） |

### 全量

- `tsc -p tsconfig.build.json` → exit 0
- `tsc --noEmit` → exit 0
- `node --test tests/*.test.ts`（最终一次）→ tests **942** / suites **49** / pass **942** / fail **0**
  - 本轮改动相关：`r33add` 4、`exec34` 6、`wises` / `smartscript.session` / `strategy` 全过；合并跑 **100 pass / 0 fail**。
  - 说明：中途有一次全量曾出现 3 条失败（`skill_sfx` 期望分布在同一次运行中从 `A=70…X=3` 变成 `A=73…X=0`、`weather` 并行时 `雪 258` 比 `雾 259` 少 1、`battle` 冷却常量），均为仓库被其他 agent 并发编辑/CPU 争用所致；单独复跑 `weather` 为 **17 pass / 0 fail**，等编辑稳定后最终全量 **0 fail**。

---

## 五、Execute 34「3 後選出陣」最终状态：`[阻塞]`

### 语义已查清，不是「第 3 回合补兵」

- `3` 是 `game\data\wises.json` 的 `SEQUENCE`；`Execute=34` 才是 `0x44D450` 的分支号。任务书原假设「3 回合后从预备池补 1 支部队」**没有任何原作地址支持**。
- 分支 `0x44DE44` 全文（`work\dis_battle_B_44D450.txt:763-768`）：
  ```
  0044DE44  push 0x491900
  0044DE49  mov eax, [ebp-0x1c]
  0044DE4C  push eax
  0044DE4D  call 0x46dae0      ; 战场消息栏
  0044DE52  add esp, 8
  0044DE55  jmp 0x44e6c7
  ```
  `0x491900` = `成功`（`work\str_big5.tsv`）。**零状态写入，没有生成/换人调用。**
- `ATTRIB=1` = 战前选择：`docs\03a-武将技表MAGIC.md:297` 第 3 条 `後選出陣|130|13|0|34|ATTRIB=1|敌方主将`；`project\26_军师技系统.md:11` 明确「ATTRIB 1 = 战前选择（後選出陣 3 / 勸降 32）」。
- 多源攻略一致：使用方在敌方之后选择出阵武将/兵种，针对敌方主将/兵种克制；要求我方军师智力 ≥ 敌方；被「化解计策」破。参考：
  - https://www.9game.cn/sanguoqunyingchuan21/9019143.html
  - https://www.925g.com/jxgl/288450.html
  - https://tieba.baidu.com/p/6119250547
  - https://www.bilibili.com/opus/292576191567130996
- `project\52_武将技与军师技.md:172` 已明确：「本作没有出阵队列；需要先在 campaign 编成层加队列，再在开战前重排 units」。`docs\07b_存档字段详解.md` §6 的 Obj3 部队池（128×0x6C，每队 5 个武将槽）是大地图军团，战场内核没有消费它。

### 为什么本轮不做

1. 战场内核没有「出阵队列」：`game\src\core\battle.ts` 的 `createWorld` 在 `:677-711` 一次性铺满两侧 `units`（含主将），没有换将/换兵种接口；`strategy.ts` 的 `spawnReinforce` 只加「士兵」，不能换将/换兵种，语义不对。
2. 三处**不在本轮可改清单**的测试把现状钉死：
   - `game\tests\wises_r84.test.ts:84-114`：`implemented.length === 54`、`missing.length === 13`、`WISE_STRATEGY_ONLY.length === 12`、`WISE_SYSO_UNSUPPORTED` 只有 `[3]`、`WISE_SPECS[3] === undefined`；
   - `game\tests\wises_r84.test.ts:134-135`：`wiseEffectOf(data,3) === null`、`wiseHintOf(3) === null`；
   - `game\tests\strategy.test.ts:363-370`：`reserve` 只 1 个 `note`、战力不变。
   - 另有 `game\tests\wises.test.ts:291` 断言 `applyWise(3).ok === false`（该文件虽获授权改数值/注释，但裁决只覆盖 R33 的 6 条期望值，不能删这条）。
3. 若强行实现，必炸上述用例；而修它们又超出授权文件。按任务书约定，不瞎做，升级为带证据 TODO + `[阻塞]`。

### 缺什么（后续解阻塞条件）

- 战役编成层的「出阵队列」：Obj3 部队池（`docs\07b` §6）的 5 个武将槽 + 兵种选择，需要先在 campaign 层可读写。
- 开战前的部署重排接口：能在 `tick === 0` 之前按玩家选择重铺该侧 `units`（换将/换兵种），再进入战斗。
- 这三处测试锁的所有者同意改契约（`wises_r84.test.ts`、`strategy.test.ts`，以及 `wises.test.ts:286-290`）。
- 智力和「化解计策」的判定点：原作在战前流程，不在 `0x44D450` 分支；需要另找战前函数地址（目前只有 §4.1 的负证据与 `ATTRIB=1` 的字段证据）。

### 本轮已做的对齐

- `strategy.ts` 的 `reserve` 保持「只打一句日志」，注释写明不造第 3 回合补兵；`exec34.test.ts` 用反例测试钉死这个结论。
- `wises_effects.ts` 的 `WISE_SYSO_UNSUPPORTED[3]` 与 `wises.ts` 的三分法注释都升级为带地址/字段/缺口的 `[阻塞]` TODO。
- `wises.json` 本身**不改**：JSON 没有注释字段，第 3 条数据 `{SEQUENCE:3, Execute:34, ATTRIB:1, ACTIVE:8}` 正确；口径写在 TS 注释与本报告。

---

## 六、标注汇总

- `[原作]`：战力纯加法（04b5 §1.2/§1.3/§4.1；`0x44D450` exec 21-26 的 `add/sub [reg+0x70]`；`0x43A3AD/0x43A3B7` 初值 150）。
- `[原作]`：`Execute 34` 分支只有一条「成功」日志（`0x44DE44`，`work\dis_battle_B_44D450.txt:763`）。
- `[推测]`：`ATTRIB=1` + 攻略所述「后选出阵」= 战前选将流程；`0x44D450` 里没有对应写状态指令，故效果发生在别的战前函数。
- `[新设计]`：把 `troop_atk` 的字段名保留、语义改「点」，以减少对 `wises.test.ts` / view 的波及。
- `[新设计]`：`exec34.test.ts` 作为「反例/证据测试」而不是实作。
- `[阻塞]`：Execute 34 需要战役编成层队列 + 开战前重排 + 三处测试契约修改，本轮授权范围内不可完成。

---

## 七、未改与风险

- 未改 `game\web\**`、`game\src\core\smartscript\**`、`game\cocos\**`、`project\37a|31|44`。
- `strategy.ts` 的 `atkMod` 本来就是加法，未动；它与 `wiseBonus('troop_atk')` 现在同为加法，二者叠加是 `base + atkMod + wiseBonus`。
- 视图若直接读 `wiseBonus(...)/100` 展示「+8%」之类文案，会显示成旧口径；本轮未动 view，留给 lead 统一接线（`game\web\main.js` 只调用 `applyWise`，不直接读通道值）。
