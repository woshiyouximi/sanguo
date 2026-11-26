# roster.ts 单源收编报告（R224）

**状态：全部完成。** 2026-11-26 13:44 获 lead 批准后执行写盘（只改 1 个文件：Cocos 镜像 `core/roster.ts`），
写盘后复跑链全绿，数字见 ④ 节「写盘后实测」。过程记录：写盘前刻意等原生包 2.8 构建收工、避开 hitfix 的输入坐标修复构建，以免抢文件。

口径依据：`project/215_双端口径与调试开关.md`（Cocos 是正式版、web 是调试台，逻辑单源放 `game/src/core/**`）、
`project/44_交接简报.md` §216.4（SKIP_FILES 假绿欠项）、`work/cocos_sync/sync_core3.mjs`。

---

## ① 差异考古表（按导出符号）

方法：写脚本 `work/roster_unify/symbol_compare.mjs` 抽出两端 **75 个顶层符号**（函数/常量/类型），
函数按函数体、类型按成员、常量按值归一化比较；辅以
`git diff --no-index --histogram game/src/core/roster.ts game/cocos/assets/scripts/core/roster.ts`
存档 `work/roster_unify/roster.diff.txt`（929 行）。完整 75 行机器表见 `work/roster_unify/symbols_table.md`。

**汇总：实现相同 24 · 实现不同 27 · 只 web 有 5 · 只 cocos 有 19。**
改前行数（同步器口径）：web 1014 行 / cocos 1169 行（仅 web 有 172 行，仅 cocos 有 300 行）。

| 符号组 | web | cocos | 实现 | 处理 |
|---|---|---|---|---|
| `DEAD` / `RELEASED` / `ENEMY_HELD` | ✓ | ✓ | 相同 | 保 web |
| `PostBattle` / `ApplyCapturesResult` / `ApplyPostBattleResult`（类型） | ✓ | ✗ | — | 保 web（只 web 用的返回类型） |
| `RawRoster`（web 私有） / `RosterRaw`（cocos 私有） | ✓ | ✓ | 同物异名 | 保 web 名 |
| `KingsRow`（web 私有） / `GeneralRow` | ✓ | ✓ | web 本地行类型；cocos 用 `General & {Thing?}` | 保 web，补 `Weapon?/Thing?` |
| `deadNames` `movedOf` `isDead` `releasedNames` `removeFromPools` `releaseFromPools` `applyCapturesToRoster` `markDefectedCapture` `applyPostBattle` | ✓ | ✓ | 行为相同；签名更宽/更窄（下表） | 保 web |
| `SurrenderTier` `SurrenderDecision` `SurrenderOpts` `SurrenderResult` `TIER_TEXT` | ✓ | ✓ | 同（签名细节不同） | 保 web |
| `SurrenderCard` | ✓ | ✓ | cocos = web 字段 + `extends SurrenderCardExtras` | **合并**：web 改 extends |
| `kingsInScenario` `surrenderCandidates` `needSurrenderPanel` `applySurrender` | ✓ | ✓ | 逻辑相同；cocos 的 for-of 安全形是 K8–K11 产物 | 保 web 源（镜像时 K8–K11 生成） |
| `BattleOutcome` `AiDisposalAction` `AiDisposalEntry` `AiDisposalInput` `AiDisposalResult` | ✓ | ✓ | 相同 | 保 web |
| `readBattleOutcome` `decideBattleWon` `ourForceNames` `markEnemyHeld` `planAiDisposal` `applyAiDisposal` | ✓ | ✓ | 相同 | 保 web（两处 `?? []` 陷阱改提常量） |
| **R197 十栏层（cocos-only，纯逻辑）** | ✗ | ✓ | 只 cocos 有 | **整层并入 web** |
| → `GENERAL_RECORD_MAX` `GeneralRecordRow` `EquipNames` `SurrenderCardExtras`（导出） | ✗ | ✓ | — | 并入 web |
| → `generalRecordOf` `noteGeneralResult` `moraleOf` `tireOf` `equipNamesOf` `generalLevelOf` `surrenderCardExtras`（导出） | ✗ | ✓ | — | 并入 web |
| → `saveBox` `objectAt` `mapAt` `hasKey` `intOrNull` `equipText` `staticEquipOf`（私有） | ✗ | ✓ | — | 并入 web（保持私有） |
| **侵入点** `cardOf(data,name,from)` / `kingCardOf(data,name)` | ✓ | ✓ | cocos 多 `save` 末参 + `...surrenderCardExtras(...)` | 合并：加 `save: CampaignSave` + spread，调用点同步 |
| `R220 mirror` 3 处标记 | — | ✓ | 实为胜者门同一逻辑（web R208/R220 原生已有） | 合并后消失（镜像由 web 生成） |

签名差异明细（都**保 web 版**，Cocos 调用点全部兼容，已逐个核过）：
- `removeFromPools(names: Iterable<string>)` vs cocos `readonly string[]`（超集）
- `markDefectedCapture(post: Pick<PostBattleReport,'captures'>, g: {...})` vs cocos `(post: PostBattleReport, g: Partial<PostGeneral>|null|undefined)`（Cocos 只从 `core/battle.ts:21` 调 `markDefectedCapture`，兼容）
- `needSurrenderPanel(cards: readonly SurrenderCard[] | null | undefined)` vs cocos 无 null（超集；`SurrenderModel.ts:356` 传 cards）
- `applySurrender(decisions: Record<string, SurrenderDecision | undefined>)` vs cocos `Readonly<Record<string, SurrenderDecision>>`（超集；`SurrenderModel.ts:611` 的 `state.picks` 兼容）
- `applySurrender` 内部构造 `post: PostBattle` vs cocos 构造完整 `PostBattleReport`（Cocos 无外部调用者）
- `WINNER = 'A' as unknown as Parameters<typeof canRecruit>[0]` vs cocos `const WINNER: Side = 'A'`
- `NO_ROLL: () => number` vs cocos `(): never`（web 更宽）
- `surrenderCandidates` 的 `save.captured` 读取：web 直接 `save.captured`，cocos 用 `(save as Record<string,unknown>)?.captured`（等价）

---

## ② 归类（纯逻辑 / 胶水 / 双实现）与合并决策

1. **Cocos 多出的 ~293 行 = 纯逻辑，不是胶水。** 整层是 R197「招降面板十栏真值」的存档读取层：
   `generalRecord`（胜/败场）、`generalLevel`、`morale`、`tire`、`equip` 表 → 面板七栏，**零 `cc` 依赖、零 UI/回调/`sys.localStorage`**。
   → 必须收进 web `game/src/core/roster.ts`（导出名与签名不变），**不需要把任何 Cocos 胶水迁到 `SurrenderModel.ts` 等文件**。
2. **其余差异 = 同一逻辑的两种写法（无行为分叉）。** 共享段两边行为一致（胜者门 R208/R220 两边都有；`[R220 mirror]` 只是 Cocos 手写段的注释物证）。
   以 **web 源为准**：web 侧有 `game/tests/*.test.ts` 覆盖、契约注释完整，且同步方向是 web→cocos。
   Cocos 的 for-of 安全写法（`const rows/kings/atCity/cardList = …`）本来就是同步器 KEEP_PATCHES K8–K11 该生成的，不写进 web 源。
3. **合并策略（已执行）**：以 web 源为底，把 R197 层整段插在 `applyPostBattle` 之后、R85 注释之前；`SurrenderCard` 改为 `extends SurrenderCardExtras`；
   `cardOf`/`kingCardOf` 加 `save` 末参并 spread 七栏；`GeneralRow` 补 `Weapon?: unknown; Thing?: unknown;`（web `types.ts` 的 `General` 没有 `Thing`，不在 core 里 import 它）；其余签名保 web。
4. **两处新 Babel 陷阱在 web 源侧解决**：`planAiDisposal` 的 `for (const rawName of list ?? [])`、`applyAiDisposal` 的 `for (const entry of plan ?? [])` 改成先提常量。
   旧 Cocos 镜像也有同款写法，一旦 roster 进入同步 `findForOfTraps` 必 throw，所以不能只靠 K8–K11。
5. **为什么值得合并**：capture 处置双端各一套的问题到此收敛——R221 F-01 那种「只能在 Cocos 副本手写 mirror 段」的处境消失，`check_parity` 的 core 行不再是假绿。

---

## ③ 改动清单（file:line）

**产品代码（web 单源）——`game/src/core/roster.ts`（现 1257 行）：**
- 36 行起：文件头「单源（R224）」段（说明镜像由 `work/cocos_sync/sync_core3.mjs` 生成、K8–K11 是 for-of 提常量补丁、勿手改镜像）。
- **342–554**：R197 十栏真值层新增（简体注释）——353 `GENERAL_RECORD_MAX = 9999`、356 `GeneralRecordRow`、362 `EquipNames`、370-410 私有 `saveBox/objectAt/mapAt/hasKey/intOrNull/equipText`、414 `generalRecordOf`、434 `noteGeneralResult`、453 `moraleOf`、461 `tireOf`、475 `equipNamesOf`、493 `generalLevelOf`、≈503 `staticEquipOf`、513 `SurrenderCardExtras`、536 `surrenderCardExtras`。
- 586-592：`SurrenderCard` doc 改写 + `export interface SurrenderCard extends SurrenderCardExtras`（592）。
- 671-681：`GeneralRow` 补 `Weapon?: unknown;`（679）/ `Thing?: unknown;`（680）。
- 695-704：`kingsInScenario` doc 注明两行 for-of 是 K8/K9 锚点（702）。
- 750：`cardOf(..., save: CampaignSave): SurrenderCard`；788-789：`// [R197] 十栏真值…` + `...surrenderCardExtras(save, data, name),`。
- 794：`kingCardOf(data, name, save: CampaignSave)`；811-812：同款 spread。
- 850：`cards.push(kings.has(name) ? kingCardOf(data, name, save) : cardOf(data, name, from, save));`
- 1205-1209：`planAiDisposal` 陷阱修复（1208 `const names = list ?? [];`、1209 `for (const rawName of names)`）。
- 1236-1240：`applyAiDisposal` 陷阱修复（1239 `const entries = plan ?? [];`、1240 `for (const entry of entries)`）。

**同步器——`work/cocos_sync/sync_core3.mjs`：**
- 722-730：`SKIP_FILES` doc 改写为「R224 收编后为空…机制保留给将来 Cocos-only 文件」，730 `const SKIP_FILES = new Set();`（原 `['roster.ts','field.ts']` 两项删除）。`skipDiffRows()` 与 `--strict-skip` 机制保留。

**工具/证据（不进产品，`work/roster_unify/`）：** `symbol_compare.mjs`、`symbols_table.md`、`roster.diff.txt`（改前差异存档）、`preview_sync.mjs` + `preview/`（写盘前 Cocos tsc 预演副本）、本报告。

**Cocos 镜像（由同步器写盘，非手改）：** `game/cocos/assets/scripts/core/roster.ts` 1168→**1264 行 / 54857 B**，= web 源经 `stripImportExtensions` + KEEP_PATCHES K8–K11 的产物；写后 sha16 `03bf858b35b7595f`（`--diff-only` 已确认与源一致）。

**未改动：** 所有其它 Cocos 文件（`SurrenderModel.ts` / `SurrenderPanel.ts` / `CampaignRoot.ts` 一行未动）、`game/cocos/assets/scripts/core/**` 其余镜像、`game/web/**`、测试文件。`game/dist/` 因 `tsc -p tsconfig.build.json` 刷新（gitignored）。

---

## ④ 验证数字

**写盘前已跑（web 侧 + 预演，全部从 `F:\sanguo\game` 或 `F:\sanguo` 按标注目录执行）：**

| 项 | 命令 | 结果 |
|---|---|---|
| web tsc | `cd F:\sanguo\game; npm.cmd exec -- tsc --noEmit` | **exit 0** |
| dist 构建 | `npm.cmd exec -- tsc -p tsconfig.build.json` | **exit 0**（`game/dist/` 已刷新） |
| Cocos tsc（旧镜像自洽） | `node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **exit 0** |
| web 全量测试 | `cd F:\sanguo\game; node --test "tests/*.test.ts"` | **1886 tests / 1885 pass / 1 todo / 0 fail，EXIT=0**（= 基线） |
| 同步 dry-run | `node work\cocos_sync\sync_core3.mjs --dry-run` | exit 0；`roster.ts 49761→54857 B / 1168→1264 L / +298/-202 / 补丁 K8;K9;K10;K11`；27 文件 = 26 已一致 + 1 待写 |
| 镜像字节预演 | `node work\roster_unify\preview_sync.mjs`（整树拷贝 + 仅改 DST_ROOT 跑真同步） | `preview/scripts/core/roster.ts` sha16 = **03bf858b35b7595f**（= manifest 目标值） |
| 写盘后 Cocos tsc 预演 | `node game\node_modules\typescript\bin\tsc -p work\roster_unify\preview\tsconfig.json` | **exit 0**（含 SurrenderModel/GameState/CampaignRoot/CampaignRoot 全部） |
| 同步器差异状态 | `node work\cocos_sync\sync_core3.mjs --diff-only --strict-skip` | `文件 27：相同 26 / 有差异 1 / cocos 缺 0 / cocos 多出 0`；`SKIP-DIFF 0 个（SKIP 文件内容一致）`；**EXIT=0**（唯一差异就是尚未写盘的 roster.ts；`--strict-skip` 已无 SKIP 可判红） |
| 双端一致性 | `node work\check_parity.mjs` | 失败 1（`core 单源` 行 `✗ Cocos / ✓ web`，即未写盘；`⚠ SKIP 分叉` 行已消失；`capture 俘虏只有胜者能处置` 行 `✓ ✓`） |
| UTF-8 | `node work\enc\scan_utf8.mjs game\src\core\roster.ts work\cocos_sync\sync_core3.mjs work\roster_unify\preview_sync.mjs` | `3 files, 0 BAD, 0 WARN, clean -> OK` |
| Cocos 同步断言 | `node work\cocos_sync\verify_core3.cjs` | **165/165 pass**，EXIT=0 |
| Cocos R197 headless | `node work\cocos_sur\assert_sur.mjs` | **断言 94 条，失败 0 条，全部通过 ✓，EXIT=0** |

**Cocos 旧断言基线（改动前就红，记录用于写盘后对比，非本轮引入）：**
- `work\cocos_surrender\model_assert.mjs`：崩在 §7 `TypeError: Cannot read properties of null (reading 'cards')`（`model_assert.mjs:407`）。
  根因：`SurrenderModel.ts:330` 未显式给 won 时调 `decideBattleWon(save)`；`roster.ts:1122` 兜底第 2 条把「`save.captured` 含 `ourForceNames` 的人」判为我方败；测试 §7.5 的 `captured=['夏侯惇','張遼']` 里夏侯惇在 roster 許昌 → won=false → 胜者门 → `stateOf` 返回 null。
  该测试是 R208/R220 之前的口径（`project/120` 记 168 条全过）。
- `work\cocos_surrender\panel_headless.mjs`：`FAILED 3/103`（2.10 标题「抓 到 敵 將」vs 实际「武 將 招 降」；2.15 子节点数 57 vs 152；3.3 数值行 missing）。
- `work\cocos_surrender\slot_assert.mjs`：`FAILED 15/148`（如 8.10「槽 10」vs「記錄10」，SaveSlots 漂移，与 roster 无关）。

**写盘后实测（2026-11-26，lead 批准后执行；全部通过，EXIT=0）：**

| # | 命令 | 结果 |
|---|---|---|
| 1 | `node work\cocos_sync\sync_core3.mjs` | `update roster.ts 49761→54857B 1168→1264L +298/-202 补丁 K8;K9;K10;K11`；汇总「本次写入 1 个、内容已一致 26 个、cocos 多出 0 个」；EXIT=0。写盘后文件 sha256 前 16 位 = **`03BF858B35B7595F`**（与 manifest 目标一致），`Get-Content` 1264 行。 |
| 2 | `node work\cocos_sync\sync_core3.mjs --diff-only --strict-skip` | `文件 27：相同 27 / 有差异 0 / cocos 缺 0 / cocos 多出 0`、`SKIP-DIFF 0 个（SKIP 文件内容一致）`，**EXIT=0**（本任务硬指标达成）。 |
| 3 | `node work\check_parity.mjs` | `parity: 12 条 · Cocos 缺 0 处 · 调试项 7（不判红） · 失败 0 · OK`，**EXIT=0**；`⚠ SKIP 分叉` 行已不存在，`core 单源` 行恢复 ✓ ✓。 |
| 4 | `cd game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **EXIT=0**（真实镜像，不再只是预演）。 |
| 5 | `cd game; node --test "tests/*.test.ts"` | **tests 1886 / pass 1885 / fail 0 / todo 1**，EXIT=0（= 基线，未少）。 |
| 6 | `node work\cocos_sur\assert_sur.mjs` | `断言 94 条，失败 0 条 · 全部通过 ✓`，EXIT=0（= 基线）。 |
| 7 | `node work\cocos_sync\verify_core3.cjs` | `断言 165/165 pass`，EXIT=0（= 基线）。 |
| 8 | `node work\enc\scan_utf8.mjs`（镜像 roster / web roster / sync 脚本） | `3 files, 0 BAD, 0 WARN, 3 clean -> OK`，EXIT=0。 |
| 9 | `work\cocos_surrender`（旧断言，只验“不长于基线”） | 重编译 `tsc -p tsconfig.sim.json` EXIT=0；`model_assert` 仍崩在同一处 `model_assert.mjs:407`（§7）、`panel_headless` 仍 `FAILED 3/103`、`slot_assert` 仍 `FAILED 15/148` —— **与写盘前基线完全一致，未变差**。（按 lead 指示不修，留给下一轮。） |

---

## ⑤ 仍未解决 / 风险

1. 镜像已写盘（2026-11-26 13:44）：`--diff-only --strict-skip` = `相同 27 / 有差异 0`、EXIT=0；`check_parity` 失败 0、`⚠ SKIP 分叉` 行消失。写盘前的中间态差异已消失，本轮无残留红项。
2. `work\cocos_surrender\` 三个旧断言本来就是红的（R208/R220 胜者门口径 vs R120 测试），本轮**不修**——超出「收编分叉」范围；建议 lead 决定是否另开任务清理或更新这些断言。
3. `work\cocos_hud2\hud_assert.mjs`（招降面板十栏 UI 断言）与 `work\cocos_sur\steps_sur_shots.mjs` 是 CDP/真引擎路径，需要 Cocos web build；本轮写作时原生包构建被占用**未运行**（hitfix 的 2.9 在写盘后开始），建议下轮起 build 时补跑。
4. `field.ts` 已一并移出 SKIP_FILES（两端本就逐字节相同），写盘时不会产生写入。
5. 合并后镜像 1169→1264 行；`GENERAL_RECORD_MAX` 等新导出会同步进镜像，`GameState.ts:14` 的用法不变。
6. 全程无 git 操作（未 add/commit/stash/checkout）；中文均用 write/edit 落盘，未用 PowerShell 写源码。

---

## ⑥ 给 lead 的一句话结论

**roster.ts 已收编为单源：Cocos 多出的 300 行是 R197 招降十栏真值存档读取层（纯逻辑、零 cc），已整层并入 web `game/src/core/roster.ts`（1014→1257 行）并前置解决 4 处 for-of Babel 陷阱；镜像由 `sync_core3.mjs` 生成（54857 B / 1264 行 / sha16 `03bf858b35b7595f`），SKIP_FILES 清空后 `--diff-only --strict-skip` 为「相同 27 / 差异 0 / EXIT 0」、`check_parity` 失败 0 且「⚠ SKIP 分叉」消失、Cocos tsc 0、web 1886 tests 全绿（1885 pass / 1 todo / 0 fail）、assert_sur 94/94、verify_core3 165/165 —— 分叉收编完成，无残留红项，无 Cocos 胶水文件改动。**

---

## 写盘执行记录（已执行）

**已写入（仅 1 个文件，同步器自动完成，2026-11-26 13:44）：**
- `game/cocos/assets/scripts/core/roster.ts`：49761 → **54857 B**，1168 → **1264 行**，`+298 / -202`，KEEP_PATCHES `K8;K9;K10;K11` 生效；写后 sha256 前 16 位 = **`03BF858B35B7595F`**（与 `work/cocos_sync/core3/manifest.csv` 的目标值一致，`Get-Content` 实测 1264 行）。其余 26 个 core 文件内容已一致，未写。
- 已刷新（工具产物）：`work/cocos_sync/core3/` 下 manifest / report / diff_before.txt。

**执行命令（物理目录 `F:\sanguo`）：**
```
node work\cocos_sync\sync_core3.mjs
```
结果为「本次写入 1 个、内容已一致 26 个、cocos 多出 0 个」，EXIT=0；随后 ④ 节「写盘后实测」9 项复跑全过。

**未改动：** 其余任何 Cocos 文件、web 源码、测试、`game/web/**`、`SurrenderModel.ts` / `SurrenderPanel.ts` / `CampaignRoot.ts` 一行未动。

**本轮变更文件（`git status` 口径，未 commit）：**
- 修改：`game/src/core/roster.ts`、`game/cocos/assets/scripts/core/roster.ts`、`work/cocos_sync/sync_core3.mjs`
- 新增：`work/roster_unify/`（`REPORT.md`、`symbol_compare.mjs`、`symbols_table.md`、`roster.diff.txt`、`preview_sync.mjs`、`preview/` 预演副本）
- （`git status` 里其它 M/?? 是并行 agent 的改动——hitfix 的输入坐标修复 / ui_sweep / r221_duel / check_devtools 等，与本轮无关，我没有碰。）
