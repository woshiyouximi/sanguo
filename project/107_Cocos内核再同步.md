# 107 Cocos 内核再同步（v3 / R84）

> 范围：`game/src/core/**` → `game/cocos/assets/scripts/core/**`。
> 脚本：`work/cocos_sync/sync_core3.mjs`；验证：`work/cocos_sync/verify_core3.cjs`；机读报告：`work/cocos_sync/sync3_report.txt`。
> 本轮**只写** `game/cocos/assets/scripts/core/**`、`work/cocos_sync/**`、本报告。`game/src/**`、`game/web/**`、`game/tests/**` 一行未改；未跑 `tools/build_wechat.ps1`，未启动 CocosCreator。
> 所有行号都是**同步后**的目标文件行号（与 web 源同号，KEEP 补丁额外插行的地方除外）。

## 0. 结论摘要

| 项 | 结果 |
|---|---|
| web 源文件 | 17 个 `.ts`（v10 时 16 个，本轮新增 `levels.ts`） |
| 本次实际写盘 | 9 个文件 + `levels.ts.meta`（另重写报告/清单各 1 次） |
| 未变（字节相同） | 8 个：`audio_bus`、`strategy`、`syso_host`、`weather`、`wises_effects`、`smartscript/{so,syscalls,vm}` |
| 实质 web 新行为 | ① `battle.ts` 的 R84 战斗反馈与节奏；② `garrison.ts` + 新增 `levels.ts` 的 R84 等级/帶兵上限 |
| 其余 6 个文件的 DIFF | 不是 web 新功能，是补 KEEP_PATCHES（K7–K19）造成的「Cocos 相对 web 的合法偏离」 |
| KEEP_PATCHES | K1–K19（K7 拆 a–d）共 **22 条补丁**，全部「锚点命中 = 1」 |
| Babel 静态陷阱 | for-of 逻辑/三元头 0 处、危险 Set/Map spread 0 处、`import.meta` 0 处、`.ts` 相对导入 0 处 |
| web `tsc --noEmit` | **EXIT=0** |
| Cocos `tsc -p tsconfig.check.json --noEmit` | **EXIT=0** |
| `_sim3` 编译 | **EXIT=0**（19 个 js：17 core + `AudioBus` + `types`） |
| `verify_core3.cjs` | **EXIT=0，断言 165/165 pass**（v10 基线 118 + levels 2 + 新增 45） |
| 幂等 | 连跑两次：第一次「写入 1 个」（仅报告），第二次「写入 0 个」 |

## 1. 背景与目标

- v10（`project/100_Cocos内核再同步.md`）把当时 16 个 core 文件同步到 Cocos，并保住 6 条 KEEP_PATCHES，验证脚本 `verify_core2.cjs` 118 条断言。
- 之后 web 侧又落了两批 R84 改动：
  1. `battle.ts`：`ACTION_INTERVAL_TICKS=40`、`skillMarks`、`CastResult.damage/hits/hit`、`cast()` 重写、`advanceSessions()` 逐帧对账（`project/105_战斗反馈与节奏.md`）。
  2. `garrison.ts` + 新增 `levels.ts`：守将等级不再用 `BaseEXP` 反推（`generals.json` 的 `BaseEXP` 全 200，反推一律 Lv2 ⇒ 10 兵），改用 `levelOf()`/`startLevelOf()`，帶兵/騎兵上限改 `troopCapOf()`/`cavalryCapOf()`（`project/104_等级与带兵上限.md`）。
- `game/src/types.ts` 的 `SKILL` 已放宽为 `Array<[number, number] | string>`，但 Cocos 的 `assets/scripts/types.ts:80` 属 core 外，**本轮不许改**。核对过 core 内唯一消费点 `unlock.ts:298` 用 `raw as unknown[]` 收口，故不需要改它；Cocos tsc 全绿。
- 目标：幂等重新同步、保住全部 KEEP 补丁、把「for-of 头是逻辑/三元式」这类只在 Creator Babel 里炸的坑静态清零，并把新行为写进断言。

## 2. 同步清单

### 2.1 总表（行数与「写了几行」）

| 文件 | web 行 | v10→v3 行 | 净增 | 本轮补丁 | 说明 |
|---|---:|---:|---:|---|---|
| `battle.ts` | 2356 | 2136→2356 | +220 | — | R84 反馈/节奏（本轮唯一大改） |
| `garrison.ts` | 559 | 546→559 | +13 | — | 接 `levels.ts`，等级/上限换口径 |
| `levels.ts` | 140 | 新增→140 | +140 | — | 新文件 + 新 `.meta` |
| `roster.ts` | 688 | 688→695 | +7 | K8;K9;K10;K11 | 4 处 for-of 落常量 |
| `smartscript/runtime.ts` | 1289 | 1293→1297 | +4 | K1;K2;K3;K7a–d | Cocos 音频/`import.meta`/spread 适配 |
| `unlock.ts` | 438 | 442→447 | +5 | K4;K15–K19 | `Array.from` + 5 处 for-of 落常量 |
| `capture.ts` | 556 | 556→558 | +2 | K12;K13 | 2 处 for-of 落常量 |
| `march.ts` | 176 | 176→177 | +1 | K14 | 1 处三元式 for-of 落常量 |
| `wises.ts` | 542 | 559→559 | ±0 | K5;K6 | 字符串 WISESKILL / `Array.from` |
| `audio_bus.ts` | 769 | 769→769 | 0 | — | 未变 |
| `strategy.ts` | 1044 | 1044→1044 | 0 | — | 未变 |
| `syso_host.ts` | 1753 | 1753→1753 | 0 | — | 未变 |
| `weather.ts` | 85 | 85→85 | 0 | — | 未变 |
| `wises_effects.ts` | 154 | 154→154 | 0 | — | 未变 |
| `smartscript/so.ts` | 251 | 251→251 | 0 | — | 未变 |
| `smartscript/syscalls.ts` | 437 | 437→437 | 0 | — | 未变 |
| `smartscript/vm.ts` | 861 | 861→861 | 0 | — | 未变 |

> 「v10→v3」取自 `work/cocos_sync/core2/manifest.csv`；`roster.ts` 的 688 是 v10 manifest 值，本轮同步前 cocos 实际已是 692 行（v10 之后被并发手改过），所以 +7 里含那部分手改，不代表脚本单独改的行数。报告 `sync3_report.txt` §5 对此有说明。

### 2.2 `battle.ts`：R84 反馈与节奏

**(a) 行动间隔：主将 40 tick，士兵仍 120 tick**

- `battle.ts:61` `export const ACTION_INTERVAL_TICKS = 40;`
- `battle.ts:72` `export const ATTACK_COOLDOWN = 120;`（保留）
- `battle.ts:74-75` `export function actionIntervalOf(u: Unit): number { return u.isGeneral ? ACTION_INTERVAL_TICKS : ATTACK_COOLDOWN; }`
- `battle.ts:1528` `u.cd = actionIntervalOf(u);`（行动开始时按单位类型重置冷却）

为什么：原作 `0x43B574` 给主将写 `+0x34 = 0x28`（40 帧）；web 旧值 120 是纯手感值，导致「双方各剩 1 兵后主将互磨」被拉长（105 报告的 129 秒）。士兵的 120 未动，保持原节奏。

**(b) 技能战果标记 `skillMarks`**

- `battle.ts:401` `skillMarks: SkillMark[];`（`World` 字段，注释从 :393 起解释「为什么内核要记账」）
- `battle.ts:641` `skillMarks: [],`（`createWorld` 初始化）
- `battle.ts:457-474` `SkillMark`：`tick:459`、`side:460`、`x:462`、`y:463`、`kills:465`、`damage:467`、`healed:469`、`summoned:471`、`miss?:473`
- `battle.ts:1232` `export function skillMarksOf(world: World): readonly SkillMark[]`（只读视图）
- `battle.ts:1851` `export const SKILL_MARK_TTL = 45;`
- `battle.ts:1853` `const SKILL_MARK_KEEP = 24;`（只保留最近 24 条，视图每帧重画够用）
- `battle.ts:1859` `const EFFECT_WINDOW_MIN = 240;`（会话死等窗口下限）
- `battle.ts:1885-1887` `pushSkillMark()`：push 后超 24 条 `shift()`
- `battle.ts:1899-1926` `recordEffect()`：法术结算前后对账
  - `:1907` `kills: Math.max(0, killsAfter - killsBefore)`
  - `:1908` `damage: Math.max(0, hpAfter - hpBefore)`（主将体力差）
  - `:1909` `healed`、`:1911` `summoned` 同理
  - `:1912` 四项全 0 才不记账；`:1915-1921` 累加 `spellKillsA/DamageA/HealedA`；`:1923` push mark
- `battle.ts:1929-1949` `finishSession()`：会话结束仍未生效、且不是治疗技 ⇒ 补一条 `miss: true`

为什么：`CastResult.killed` 的语义是「打死多少敌兵」（原作结算只按兵计战功），法术打主将恒 0；web 的 `doCast()` 把 `killed > 0` 当命中，于是打中敌将也飘 `MISS`/「擊殺 0 名敵兵」。`game/web/**` 冻结，所以由内核记账、视图消费。

**(c) `CastResult` 新增 `damage / hits / hit`**

- `battle.ts:429-448`：
  - `:430` `ok`、`:431` `reason`、`:433` `killed?`、`:435` `healed?`
  - `:437` `damage?: number;`（打掉的敌将体力）
  - `:439` `hits?: number;`（脚本这一发结算到的命中单位数）
  - `:445` `hit?: boolean;`（是否真的产生效果）
  - `:446-447` `mp`/`qi`

**(d) `cast()` 重写 + `advanceSessions()` 逐帧记账**

- `battle.ts:1951-2015` `cast()`：
  - `:1984` 结算前快照（`effectSnapOf`）
  - `:1989` `startSkill(...)`；`:1991` 治疗技立即 drain；`:1994` `recordEffect(...)`
  - `:1996` push session（多帧技留给 `advanceSessions`）
  - `:2005-2014` 返回 `{ ok, killed, healed, damage, hits: session.hits, hit: info.effected, mp, qi }`
- `battle.ts:2027-2048` `advanceSessions()`：
  - `:2034` before 快照、`:2035` `s.advance()`、`:2036` `recordEffect()`
  - `:2042` 超过 `Math.max(info.life + SKILL_MARK_TTL, EFFECT_WINDOW_MIN)` 强制 `done`
  - `:2047` 过滤已结束会话
- `battle.ts:2050` `tickSkills()` 先 `advanceSessions()` 再推进其它技能逻辑
- `battle.ts:2336` `settle()` 里 `spellKills: world.stats.spellKillsA`（现在来自真实对账，不再恒 0）

为什么：旧实现 `cast()` 只回第 0 帧战果，多帧技（半月斬/神鬼亂舞）在同步模型下可能永不 `done`，法术击杀恒 0；`advanceSessions()` 每帧对账后 `spellKills/spellDamage/spellHealed` 才有真值。

### 2.3 `garrison.ts` + `levels.ts`：R84 等级与帶兵上限

`levels.ts`（新文件，140 行；同时建 `levels.ts.meta`，uuid `7f3a2c58-9d41-4b6e-8c0a-2e5b7d9f1a34`）：

| 行 | 符号 |
|---|---|
| `levels.ts:32/34/36` | `START_LEVEL_MIN=6`、`START_LEVEL_MAX=20`、`START_LEVEL_DIV=40` |
| `levels.ts:39/41` | `LEVEL_MIN=1`、`LEVEL_MAX=99` |
| `levels.ts:44/46` | `TROOP_PER_LEVEL=5`、`TROOP_CAP_MAX=100` |
| `levels.ts:49/51/53` | `CAVALRY_LV_BASE=20`、`CAVALRY_PER_LEVEL=5`、`CAVALRY_CAP_MAX=100` |
| `levels.ts:59` | `LevelRow` |
| `levels.ts:91/106` | `startLevelOf()`、`levelOf()` |
| `levels.ts:119/130` | `troopCapOf()`、`cavalryCapOf()` |
| `levels.ts:140` | `export { levelFromExp };`（从 `battle.ts` 转出，供 `garrison.ts` 旧导出保留） |

`garrison.ts`：

- `:25` `import { cavalryCapOf, levelOf, troopCapOf } from './levels';`
- `:113` `levelBasis: 'exe' | 'start';`（旧值 `default` 删除；`startLevelOf()` 下限 6，不再出现 1 级守将）
- `:450` `export function defenderBattleParams(...)`
- `:454` `const level = levelOf({ STR: str, INT: int }, runtimeLevel);`
- `:455` `const levelBasis: ... = runtimeLevel >= 1 ? 'exe' : 'start';`
- `:457` `const troopsMax = troopCapOf(level); // 0x409FB6`
- `:458` `const cavalryMax = cavalryCapOf(level); // 0x409FD8`
- `:532` basis 字符串 `'estimate:帶兵數@起始等級'`（原 `'estimate:帶兵數缺等級'`）

为什么：`generals.json` 的 `BaseEXP` 全 200 ⇒ 经验表反推一律 Lv2 ⇒ 10 兵，出征滑杆只能拉到 10（R84 头号卡点）。改成运行时等级优先、否则起始等级（6–20 按武力/智力分档），上限与网页端同式。`garrison.ts:25` 的 import 也决定了 `levels.ts` **必须**一起同步，否则 Cocos tsc 直接炸。

### 2.4 其余 6 个文件：没有新的 web 行为，只补 KEEP

| 文件 | 最终行 | 改动性质 |
|---|---|---|
| `roster.ts` | `:410` `const rows = ...`；`:411` `for (const sc of rows)`；`:413` `for (const k of kings)`；`:557` `for (const raw of atCity)`；`:609` `for (const card of cardList)` | K8–K11：for-of 落常量 |
| `capture.ts` | `:153` `for (const sc of scenarios)`；`:155` `for (const k of kings)` | K12/K13 |
| `march.ts` | `:137` `for (const raw of points)` | K14：三元式落常量 |
| `unlock.ts` | `:112` `return Array.from(out).sort(...)`；`:77/82/94/104/267` 5 处 for-of 落常量 | K4、K15–K19 |
| `wises.ts` | `:408` `? raw.split(/[,\s]+/)...`；`:472` `return Array.from(best.values())...` | K5/K6 |
| `smartscript/runtime.ts` | `:57` `DATA_URL`；`:29` `../../AudioBus`；`:901` `emitSfx`；`:582/594/604/1152` 4 处 `Array.from` | K1–K3、K7a–d |

## 3. KEEP_PATCHES 逐条证据

> 判定口径：同步脚本对每条补丁的 `from` 在最终目标文本上要求**恰好命中 1 次**；`sync3_report.txt` 的「锚点命中=1 OK」由脚本实跑输出，不是人工勾选。

| ID | file:line | 代码（证据行） | 为什么必须保 |
|---|---|---|---|
| K1 | `smartscript/runtime.ts:57` | `const DATA_URL = new URL('data/', 'https://cocos.local/');` | Creator 产物是 `System.register` 函数体，`import.meta` 不是合法语法（rollup 直接判死）。Cocos 走 `assets/scripts/shim/host.ts` 预加载，这个常量只给同步 XHR / `node:fs` 兜底用。 |
| K2 | `smartscript/runtime.ts:29` | `import { callSystemSo, emitBrightness, emitFlash, emitSfx } from '../../AudioBus';` | Cocos 的音频总线是 `assets/scripts/AudioBus.ts`（`AudioHost` 只认这个实例）。指回 `../audio_bus` 会建第二个模块实例，脚本音效听不见。 |
| K3 | `smartscript/runtime.ts:901` | `emitSfx({ name, volume, source: 'script' });` | `AudioBus.SfxInput.unit` 只收 `Unit` 对象（3D 定位用），脚本的 `unit` 是槽位序号；`source/clock` 也只有 web 版 `audio_bus` 认。 |
| K4 | `unlock.ts:112` | `return Array.from(out).sort((a, b) => a - b);` | Creator Babel（`plugin-transform-spread` loose）把 `[...set]` 编成 `[].concat(set)`，得到 `[Set]` 而不是 `number[]`；兵符/阵法白名单会整排误判「未学」。 |
| K5 | `wises.ts:408` | `? raw.split(/[,\s]+/).filter((s) => s.length > 0)` | Cocos 的 `generals.json` 里 `WISESKILL` 是整串 `"34, 47"`（web 的 deploy 页自己 split，走不到这里）；web 版 `if (!Array.isArray(raw)) return []` 会让军师技列表全空。 |
| K6 | `wises.ts:472` | `return Array.from(best.values()).sort((a, b) => a.learn - b.learn).map((v) => v.seq);` | 同 K4：loose spread 把 `Map.values()` 编成 `[].concat(iterator)`，迭代器不展开，军师技列表显示成「技 undefined」。 |
| K7a | `smartscript/runtime.ts:582` | `unimplemented: Array.from(this.unimplemented).sort((a, b) => a - b),` | `Set` 不能用 `[...]`（loose spread 不展开），`unimplemented` 统计会变成 `[Set]`。 |
| K7b | `smartscript/runtime.ts:594` | `if (this.healTargets.size) this.log.push(\`治疗目标 ${Array.from(this.healTargets).join(',')}\`);` | 模板字符串里 `[...this.healTargets]` 会打出一整个 Set 的默认字符串。 |
| K7c | `smartscript/runtime.ts:604` | `return Array.from(this.objects.values())` | `Map.values()` 迭代器在 loose spread 下不展开，`objectSummaries()` 会回传空/错值。 |
| K7d | `smartscript/runtime.ts:1152` | `const arr = Array.from(this.objects.values()).slice(0, 12);` | 同上，`dumpObjects()` 的 `Map.values()` 展开。 |
| K8 | `roster.ts:411` | `for (const sc of rows) {`（`:410` 先落 `const rows = ((data?.scenarios ?? []) as unknown as KingsRow[]) || [];`） | v10 实际崩过的那一处：`for (const sc of (cast) \|\| [])` 触发 Babel 类型推断崩溃。 |
| K9 | `roster.ts:413` | `for (const k of kings) {`（`:412` `const kings = sc?.kings ?? [];`） | for-of 头是逻辑表达式 `sc?.kings ?? []`。 |
| K10 | `roster.ts:557` | `for (const raw of atCity) {`（`:556` `const atCity = opts.atCity ?? [];`） | for-of 头是 `opts.atCity ?? []`。 |
| K11 | `roster.ts:609` | `for (const card of cardList) {`（`:608` `const cardList = cards ?? [];`） | for-of 头是 `cards ?? []`。 |
| K12 | `capture.ts:153` | `for (const sc of scenarios) {`（`:152` `const scenarios = data.scenarios ?? [];`） | for-of 头是 `data.scenarios ?? []`。 |
| K13 | `capture.ts:155` | `for (const k of kings) {`（`:154` `const kings = sc?.kings ?? [];`） | for-of 头是 `sc?.kings ?? []`。 |
| K14 | `march.ts:137` | `for (const raw of points) {`（`:136` `const points = Array.isArray(path.points) ? path.points : [];`） | for-of 头是三元式 `Array.isArray(...) ? ... : []`。 |
| K15 | `unlock.ts:77` | `for (const tok of useForce) {`（`:76` `const useForce = general.UseForce ?? [];`） | for-of 头是 `general.UseForce ?? []`。 |
| K16 | `unlock.ts:82` | `for (const tok of force) {`（`:80` `const force = general.Force ?? [];`） | for-of 头是 `general.Force ?? []`。 |
| K17 | `unlock.ts:94` | `for (const tok of battleArray) {`（`:91` `const battleArray = general.BattleArray ?? [];`） | for-of 头是 `general.BattleArray ?? []`。 |
| K18 | `unlock.ts:104` | `for (const tok of list) {`（`:100` `const list = tokens ?? [];`） | for-of 头是 `tokens ?? []`。 |
| K19 | `unlock.ts:267` | `for (const v of seqs) {`（`:258` `const seqs = list ?? [];`） | for-of 头是 `list ?? []`。 |

> K1–K6 是 v10 原样保留；K7a–d 是本轮新补的 4 处 `[...Set/Map]`；K8–K19 是本轮 AST 扫描出来的 12 处「for-of 头是逻辑/三元式」。

## 4. Babel 陷阱检查结果

**方法**：`sync_core3.mjs` 在**最终目标文本**上用 TypeScript AST 跑四项静态检查，任一非 0 直接 `throw`，不落盘：

1. `findForOfTraps()`：`ForOfStatement.expression` 是 `||`/`??`/`&&`/`?:` 的，报错。
2. `findIterableSpreads()`：`[...x]` 且 `x` 是 `.values()/.keys()/.entries()` 或 `new Set(...)` 的，报错。
3. `countImportMeta()`：`ts.isMetaProperty` + `ImportKeyword`（忽略注释里的字样）。
4. `remainingTsImports()`：相对导入仍带 `.ts` 的，报错。

**结果（最终 17 个文件）**：

| 检查 | 结果 |
|---|---|
| for-of 头逻辑/三元式 | **0 处**（12 处已按 K8–K19 落常量） |
| 危险 Set/Map 迭代器 spread | **0 处**（K4/K6/K7a–d 已改 `Array.from`） |
| `import.meta` | **0 处**（K1 已替换） |
| 带 `.ts` 的相对导入 | **0 处**（`stripImportExtensions` 统一去掉） |

12 处落常量清单：`capture.ts:152/153`、`march.ts:136`、`roster.ts:407/408/551/602`、`unlock.ts:76/80/91/100/258`（这些是 **web 源行号**；最终目标行号见 §3 的 K8–K19）。语义等价：`for-of` 右侧本来就只求值一次，先落 `const` 不改变行为。

**局限（标 `[推测]`）**：本机没有 `@babel/core`（root/game/cocos 三处 `node_modules` 都没有），无法在本地复现 Creator 的 Babel 编译。以上只是静态保证；v10 的实证是 `roster.ts:407` 崩过，报错原文：

```
Property types[1] of TSUnionType expected node to be of a type ["TSType"]
but instead got "GenericTypeAnnotation"
```

且 `tsc` 全绿、构建 8 秒静默失败。本轮未启动 Creator，`[推测]` 这 12 处落常量后不会再触发同类崩溃，但需要 lead 在真机/构建流水线里复核。

## 5. 验证

### 5.1 命令与退出码

| 命令 | 退出码 |
|---|---|
| `cd F:\sanguo\game; npm.cmd exec -- tsc --noEmit` | **0** |
| `cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit` | **0** |
| `node game\node_modules\typescript\bin\tsc -p work\cocos_sync\tsconfig.sim3.json` | **0** |
| `node work\cocos_sync\verify_core3.cjs` | **0**（`断言 165/165 pass`） |

### 5.2 `verify_core3.cjs`：165/165

- v10 基线 12 组 118 条全部保留并通过；
- 新增 `levels.ts` 编译产物存在 + 导出面 2 条；
- 新增第 13–16 组共 45 条：
  - **13 行动节奏**：`ACTION_INTERVAL_TICKS===40`、`ATTACK_COOLDOWN===120`、`actionIntervalOf(主将)===40`、`actionIntervalOf(士兵)===120`、主将 < 士兵、贴脸主将 `cd` 峰值 40、士兵接战 `cd` 峰值 120（8 条）。
  - **14 `CastResult`**：命療術 `damage===0`（number）、`hits` number、`hit===true`；seq104 第 0 帧 `damage===0`、`hits` number、`hit===false`（8 条）。
  - **15 `skillMarksOf()`**：seq104 神鬼亂舞贴脸 200 tick ⇒ `lost=38`，`damage>0` 标记合计 38、无 miss、`stats.spellDamageA=38`、`SkillMark` 字段类型正确；`settle().spellKills=11 ⊆ kills=12`；seq50 打兵堆 ⇒ `kills` 标记合计 = `stats.spellKillsA=1`；seq2 落月弓打空 ⇒ 只有 `miss`、`spellDamageA=0`（20 条）。
  - **16 TTL/上限**：`SKILL_MARK_TTL===45`；25 次治疗 ⇒ 只留 24 条（`SKILL_MARK_KEEP`）；50 tick 后 `age=50>45`、按视图 fresh 过滤后 0/24、内核不按 age 删；seq50 向空地 `ttl=10` ⇒ 240 tick 会话被截断、`sessions=0` 且补 `miss`（9 条）。

### 5.3 幂等

- 第一次跑 `sync_core3.mjs`：写 9 文件 + `levels.ts.meta` + 报告/清单；
- 第二次跑：最初因报告里 `metaStatus` 从「新建」变「已存在」而写 1 次；把 `metaStatus` 改成稳定字符串后，再跑两次均为「**写入 0 个**」。

## 6. 没做到 / 风险 / 说明

1. **未跑 Creator 实机、未跑 `tools/build_wechat.ps1`**（任务禁止）。Babel 陷阱只有静态 AST 证据 + v10 历史证据，`[推测]` 结论未在 Creator 里实跑。
2. **未改 Cocos 的 `assets/scripts/types.ts:80`**（core 外，禁止改）。它仍是 `SKILL?: Array<[number, number]>`，而 web `types.ts` 已放宽为 `Array<[number, number] | string>`。core 内唯一消费点 `unlock.ts:298` 用 `raw as unknown[]` 收口，cocos tsc 全绿；`[推测]` 若 core 外还有按旧类型消费 `SKILL` 的代码，未来可能需要别人放宽这个声明。
3. **视图层的 `SKILL_MARK_TTL` 过期过滤没有同步**：`game/src/view/battleView.ts:1123/1146/1165` 用 `world.tick - k.tick > SKILL_MARK_TTL` 过滤；view 不在 core 范围，本轮未碰。内核侧只保证：常量 45、最近 24 条上限、会话死等 240 tick 截断。
4. **全量 919 条测试未重跑**：本轮没有改 `game/src/**`、`game/tests/**`，同步只写 Cocos 目标目录；105 报告的基线是 919 pass / 0 fail。若 lead 要求端到端复验，可另跑 `node --test tests/*.test.ts`（约 70–90 s）。
5. **v10 manifest 的 `roster.ts` 688 行与实际 692 行不一致**：v10 之后 cocos 侧被并发手改过（`roster.ts` 在同步前已是 692 行）。`sync3_report.txt` §5 已注明「±v10」含并发改动，不代表脚本单独改的行数。
6. **并发改动**：cocos `assets/scripts/` 下 core 外文件（AiModel/AiRunner/CampaignRoot/MonarchModel/GameState 等）在 7:0x–7:2x 有其他 agent 的改动，本轮**没有触碰**任何 core 外文件。
7. **`levels.ts.meta` 的 uuid 是新造的固定值**（`7f3a2c58-9d41-4b6e-8c0a-2e5b7d9f1a34`），格式仿现有 `wises_effects.ts.meta`；`[推测]` Creator 首次导入会沿用，若引擎侧要求重新生成，需要 lead 在编辑器里确认。
8. **临时产物**：`work/cocos_sync/scan3.mjs`（AST 侦察）、`_sim3/`（sim 编译）、`verify_core3_stdout.txt`（pwsh 重定向，可能 UTF-16）留在 `work/cocos_sync/`，未清理；`core3/` 是脚本的 diff/manifest 输出目录。

## 7. 交付物

| 路径 | 内容 |
|---|---|
| `F:\sanguo\work\cocos_sync\sync_core3.mjs` | 幂等同步脚本（K1–K19、AST 静态检查、报告生成） |
| `F:\sanguo\work\cocos_sync\sync3_report.txt` | 机读报告：逐文件行数、KEEP 逐条命中、Babel 检查、幂等说明 |
| `F:\sanguo\work\cocos_sync\verify_core3.cjs` | 165 条断言（v10 118 + levels 2 + 新增 45） |
| `F:\sanguo\work\cocos_sync\verify_core3.log` | 实跑日志（末行 `断言 165/165 pass`） |
| `F:\sanguo\project\107_Cocos内核再同步.md` | 本报告 |
