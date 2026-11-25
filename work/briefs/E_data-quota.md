# E · 数据与配额（守军兵力 / 阵形亂陣 / 斩首池）

目标：补 `project/31_还原清单.md` 剩下的数据口径缺口和 `37a` 的 R28/R56。用户口径：「不取巧、不省略，有代码有流程就按原作还原」。

## 环境
- 根 `F:\sanguo`。服务已跑 `http://127.0.0.1:5173/web/campaign.html`。
- 改 `game/src/**` 后：`cd F:\sanguo\game; npm.cmd exec -- tsc -p tsconfig.build.json`，再 `npm.cmd exec -- tsc --noEmit`。
- 测试：`cd F:\sanguo\game; node --test tests/garrison.test.ts tests/capture.test.ts tests/roster.test.ts tests/formation11.test.ts`；收工前跑全量（3.5 分钟）。
- 没有 git。

## 你拥有的文件
`game/src/core/garrison.ts`、`game/src/core/capture.ts`、`game/src/core/roster.ts`、`game/data/formations.json`、`game/data/garrison.json`（只在有据时改）、`game/tests/garrison.test.ts`、`game/tests/capture.test.ts`、`game/tests/roster.test.ts`、`game/tests/formation11.test.ts`、`game/tests/data_r82.test.ts`（新建）、`work\data_*/**`、报告 `project/53_数据与配额.md`（新建）。
**不要改** `battle.ts`、`unlock.ts`、`wises.ts`、`game/web/**`、`project/37a|31|44`。

## 任务
1. **守军兵力接入（`31` 未修项）**：现在 `bsoldiers = 守军/6` 是估值，`battleSetup().enemyTroops` 已实现但没接上。找到原作守城战"守军总兵 → 战场敌人兵力"的口径（`docs/04b*`、`docs/04c*`，grep `garrison`/`守軍`/`+0x8A`），接上并加测试；定不了就把两条口径都实现并**用参数开关 + 报告里写清楚哪条是哪条**，不许静默估。
2. **守将属性 → 战斗参数换算**：`31` 记"映射公式未定位"。在 `garrison.json`/`docs` 里找证据（守将 15 字段 → 战场 STR/INT/等级/兵种）；找到就实现纯函数 `defenderBattleParams(defender)`，找不到就输出一张"已确认字段 / 未知字段"清单，并把现在 web 里用的兜底公式标 `[新设计]`。
3. **R28 阵形缺亂陣**：`formations.json` 是 9×9（或 9 种），原作有亂陣（10 种？以 `docs/04b` 阵形章为准）。确认原作阵形数、补数据、补相克矩阵、加测试（相克值要用 docs 的表，不许拍）。
4. **R56 斩首不从池移除**：`capture.ts`/`roster.ts` 里被斩/被俘的武将没从可招募池/势力将池移除。补齐（含君主不可俘的既有规则不能破），加测试。
5. **数据一致性自检**：新写 `game/tests/data_r82.test.ts`，对 `formations`/`garrison`/`generals`/`terrains` 做结构断言（键数、矩阵维度、越界值、引用完整性），防止以后改数据时悄悄坏掉。

## 验收
- 上述测试全 pass（报条数）；全量一次报数字；`tsc --noEmit` exit 0。
- 报告：每条 `改动 file:line` / 原作依据（地址或 docs 行号）/ 测试名 / 等级；估值必须标 `[推测]` 或 `[新设计]`；没定位到的写"没定位到，证据是 X 处没有"。
- 数据改了要写清"生成器是什么、怎么重新生成"（`tools/` 里有对应脚本就点名）。
