# A1 · 战斗内核补齐（battle.ts）

你是《三国群英传2》竖版重制项目的战斗内核 agent。目标（用户原话）：「完全还原单机的游戏逻辑和流程，不取巧、不省略，有代码有流程就按原作还原」。

## 环境（照做）
- 仓库根 `F:\sanguo`。web 服务已在跑：`http://127.0.0.1:5173/web/campaign.html`（别另起端口）。
- 改 `game/src/**` 后必须：`cd F:\sanguo\game; npm.cmd exec -- tsc -p tsconfig.build.json`（浏览器读 `dist/`），再 `npm.cmd exec -- tsc --noEmit`。
- 测试：`cd F:\sanguo\game; node --test tests/battle.test.ts tests/stepcav.test.ts tests/postbattle.test.ts tests/morale.test.ts tests/fatigue.test.ts`。全量 204 条约 3.5 分钟，**收工前必须跑一次全量并报 pass/fail**。
- 截图模板：`F:\sanguo\work\shots.ps1`（Edge headless，`--virtual-time-budget=4000`）。战斗页必须 `?sim=N&freeze=1`（briefing 坑 #2）。
- 没有 git，不要删别人的文件。

## 你拥有的文件（其他一律不改）
- `game/src/core/battle.ts`
- `game/src/core/weather.ts`（新建，可选）
- `game/tests/battle_r81.test.ts`（新建）
- 现有测试只在"公式改了必须同步"时改，改哪条要在报告里点名
- 报告：`project/46_战斗内核补齐.md`（新建）
**不要改** `game/web/**`、`project/37a|31|44`、其他 agent 的文件。需要 web 联动就把"要加什么、加在哪一行"写进报告。

## 先做 10 分钟的事实核对
`project/37a_逻辑对照.md` 是 01:36 的快照，可能已过期：每条先读现在的 `battle.ts` 确认是否已经做了，做过的直接标"已实现，证据 file:line"。原作依据在 `docs/04b_*.md`、`docs/04d_*.md`、`docs/04b5_*.md`（自己 grep 定位，不要凭印象）。

## 任务（逐条，能定就按原作，不能定就标 [推测] 并把手上的证据写清）
1. **R23 体力/技力上限**：原作 `0x40A020` 最大体力 `BaseHP + level*2*STR/100`、`0x40A098` 最大技力 `BaseMP + level*2*INT/100`（以 docs 原文为准）。现在 `battle.ts` 用 `hp=100+STR` / `mp=60+INT/2` 的 `[新设计]`。改成原式；`generals.json` 里 `BASEHP/BASEMP` 齐全则直接用。注意 `game/web/main.js` 里有关羽 43 点 BaseMP 的覆盖，**不要动 main.js**，在报告里说明新公式下这些覆盖是否还必要。
2. **R38 撤退/逃跑**：原作 ACT=2（`docs/04d §2.7`）+ `BattleYield` 脚本。加"单方撤退"能力：core 暴露 `requestRetreat(world, side)`，撤退后本场结束并按原作判胜负/结算；AI 在兵力劣势时也会撤（阈值要给出处，没有就 `[推测]`）。面板文案走 settle 的 `report`。
3. **R39 天气**：`SYSTEM.SO` 的 `ProduceRain/Snow/Fog`。加 `world.weather`（0 无 /1 雨 /2 雪 /3 雾），按月/地形给概率（有据写据，没据 `[推测]`），并让它参与一个**原作有据**的量（找不到就只做表现位并在报告里写"未定位到影响量"）。`battleView` 不归你——只把 `world.weather` 暴露出来，报告里写清 view 该怎么读。
4. **R41 士气项**：`powerOf` 里 `moraleTerm` 被 `MORALE_DAMP=2` 减半（±5），原作是 `(士气-50)/5`（±10）。去掉阻尼，改测试。
5. **R44 二次补判**：原作命中后 `attacker+0x2C & 4` 再给一次 2/3 补判（`docs/04b §3.4`）。先读原文确认语义；若位语义仍是推测，做成"只有该位被置位才生效"的形式（不写死随机），并在报告里写清在哪一版能定。
6. **R46 主将扣血**：现在 `12/6 + rand()%6` 是自定。读 `0x43EC54`（`docs/04b`/`04b4`）能定就定，定不了把现有式标清楚。
7. **R47 气力**：`docs/04b` 一处 `60000`（§2.2 `+0x4C`）一处 `POWER×1200`=120000 自相矛盾（37a §四.1 已标）。按文档复核 `0x43BAE3`，给出唯一结论 + 依据；`QI_MAX`/`POWER*120` 按结论改，测试同步。
8. **R59 战功"带兵差"项**：原作 `(带兵差×6 + 骑兵差×12)`（`0x41048D`），现在只有"步兵击杀×6 + 骑兵击杀×12"。补带兵差项（口径：开局带兵 − 结束存活？以 docs 为准），战功总数不许倒退。
9. **R63 战绩**：`0x4084C9` 胜/败累加、连胜 +1、最高连胜取 max、败则连胜清 0。core 给出纯函数 `updateRecord(rec, won)` + 测试（不碰存档 UI，saves 归别人）。
10. **R64 额外经验**：`Σ敌等级*32 ÷ 我方人数`（`0x410989`），现在是近似式，改精确。

## 验收（缺一不可）
- `node --test tests/*.test.ts` 全量 pass，条数 ≥ 204（新增的算进去），报准确数字。
- `tsc --noEmit` exit 0；`tsc -p tsconfig.build.json` exit 0。
- 第 1/4/7/8/9/10 条各至少 1 条新测试，测试名写进报告。
- 报告里每条一张小表：`改动 file:line` / `原作依据` / `测试名` / `等级（✅/🟡/⚠️）`。
- 不许写"已完成"了事：没把握的写"没做，因为 X"。
