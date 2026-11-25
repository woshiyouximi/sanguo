# B2 · 大地图 AI 与势力（campaign.html + saves.js）

目标：AI 从"只会打"补到"按原作那张 ACT 表动"，并补上势力归属/灭亡/继承。用户口径：「完全还原单机的游戏逻辑和流程，不取巧、不省略」。

## 环境
- 根 `F:\sanguo`。服务已跑：`http://127.0.0.1:5173/web/campaign.html`。
- 纯前端 JS，改完刷新即可。新增测试放 `game/tests/campaign_ai.test.ts`（只 import `saves.js` 那类纯逻辑；`campaign.html` 里的函数若不可 import，就先把纯函数搬到 `saves.js` 或新建 `game/web/ai_model.js`，**不要**在测试里 mock DOM）。
- 截图 `F:\sanguo\work\shots.ps1` 模板；没有 git。

## 你拥有的文件
`game/web/campaign.html`、`game/web/saves.js`、`game/web/ai_model.js`（新建，若需要）、`game/tests/campaign_ai.test.ts`（新建）、`work\campaign_*/**`、报告 `project/50_AI与势力.md`（新建）。
**不要改** `city.html`、`city_model.js`、`main.js`、`deploy.html`、`game/src/**`、`project/37a|31|44`。

## 先核对
`project/37a_逻辑对照.md`（01:36 快照）里 R73/R74/R75/R76/R78/R63/R65 的现状可能已变，逐条先读现在的 `campaign.html` 确认，做了的给 file:line。

## 任务
1. **R73 月度 AI 规划**（原作 `0x487248[3]` + `ArgMaxRate` 哨兵 800，`docs/04c`）：
   依次 `PlanDomestic`（内政）→ `PlanRecruit`（征兵）→ `PlanAttack`（出兵）→ `PlanMoveGeneral`（调将）；每个 AI 势力每月跑一遍，`Rate` 最高者胜出（并列按原作的哨兵规则）。
   现在只有 `rollAI` 一条进攻，改成这套；每步都要能被测试直接调用（纯函数 + 显式 rng 种子）。
2. **R74 ACT 动作表 9 项**：原作战场/大地图动作 `ACT` 9 种（含**联合**、**占空城**、**补金**）。补齐现在缺的，并给每项一条日志文案（照原作字串风格，`docs/04c` 有原文字串就照抄）。
3. **R75 出兵数**：原作 `min(城内兵+rand()%3+1, 出征上限, 5, 自家该将−1)`（`0x408xx`，以 docs 为准）。现在是固定 100，改公式 + 测试（边界：城里 0 兵、将只有 3 兵）。
4. **R76 Rate 权重**：原作 `200 / 100 / 80 / (d+1) / 50–200` 这套（`docs/04c` 有表就照表）。现在是自定值，改成原式并把表写进代码注释（带地址）。
5. **R78 + R4 势力归属**：加 `force.king`（君主）+ `city.owner` 用势力 id（现在玩家 = `save.owned` 列表）。君主阵亡/被俘 → 势力灭亡：城归最近势力或按原作"继承"规则；灭亡要有一条事件日志。**范围控制**：先只做"君主 + 灭亡 + 城归属"，不做 32 势力槽存档（R70 明确不做）。
6. **R63 战绩累加 + R65 月度漂移**：`saves.js` 的 record 现在只写 1/0 → 改成累加胜/败、连胜、最高连胜（与 A1 在 core 里的 `updateRecord` 口径保持一致，签名可不同）；月度按原作给士气/忠诚漂移（有据写据，无据 `[推测]`）。
7. **测试**：`campaign_ai.test.ts` 覆盖 1/3/5 的主路径。

## 验收
- `node --test game/tests/campaign_ai.test.ts` pass；全量测试不许因此变红（跑一次 `cd F:\sanguo\game; node --test tests/*.test.ts`，3.5 分钟）。
- 截图：大地图 750×1334 + 一张"AI 月报/事件日志"的图（`work\campaign_ai\*.png`）。
- 报告每条：`改动 file:line` / `原作依据` / `测试名` / `等级`；近似标 `[推测]`/`[新设计]`；没做的写原因。
- 不许为了通过测试而把断言写松；不许把 AI 逻辑留在 HTML 内联里不可测。
