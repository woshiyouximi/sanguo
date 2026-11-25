# D · 武将技学习 + 军师技消费点（R68 / R69）

目标：`project/37a` 记 R68「武将技学习门槛无运行期流程」❌、R69「军师技 25 生效 / 18 待消费点 / 24 未实作」🟡。把它们做成"有流程、能测、按原作表"。

## 环境
- 根 `F:\sanguo`。服务已跑 `http://127.0.0.1:5173/web/campaign.html`。
- 改 `game/src/**` 后：`cd F:\sanguo\game; npm.cmd exec -- tsc -p tsconfig.build.json`，再 `npm.cmd exec -- tsc --noEmit`。
- 测试：`cd F:\sanguo\game; node --test tests/unlock.test.ts tests/wises.test.ts`；收工前跑一次全量（3.5 分钟）。
- 没有 git。

## 你拥有的文件
`game/src/core/unlock.ts`、`game/src/core/wises.ts`、`game/data/wises.json`（只有在有据可依时才改，改了什么写报告）、`game/tests/unlock.test.ts`、`game/tests/wises.test.ts`、`game/tests/skills_r68.test.ts`（新建）、`work\skills_*/**`、报告 `project/52_武将技与军师技.md`（新建）。
**不要改** `battle.ts`、`main.js`、`campaign.html`、`game/web/**`、`project/37a|31|44`。需要战场侧开钩子（谁在什么时候调 `wises`）就写进报告的"接线说明"，写清文件:行与建议片段。

## 任务
1. **R68 学习流程**：原作武将技有"可学等级 + 智力/武力门槛 + 学习时机（升级/月末/事件）"，`game/data/magics.json`（39 KB）与 `generals.json` 里应该已有门槛字段。先读 `docs`（grep `武將技`/`學習`/`magic` 相关章节）+ json 字段，确认规则，然后实现**纯函数**：
   - `learnable(state, magic, level)` / `applyLearn(state, ...)` / `pendingLearn(state)`；
   - 触发点：`level` 变化时（升级）与月度检查各一次，返回"待学列表"，谁去弹窗不归你（写进接线说明）。
   - 原作 `0x40xxxx` 有门槛表就给地址；没有就 `[推测]`。
2. **R69 消费点**：`wises.json` 现在 25 条生效、18 条登记了但没人调用、24 条占位。把 18 条里**能在纯逻辑层判定**的（提高计略成功率、降低敌士气、增加移动力、战场先手之类）实现成"消费点函数"，每条一个测试。判不出的（要画面/要网络/AI 专属）留在占位并写清缺什么。
3. **军师技与战场的接口**：`wises` 现在的 API 可能只被 `battle.ts` 用。别改 `battle.ts`；把你的新函数设计成 `battle.ts` 一行能接上的形状（例如 `applyWiseOnBattleStart(world, data)`），在报告里给出确切片段。
4. **别动数据口径**：`magics.json`/`wises.json` 是导出产物，有 `tools/` 里的生成脚本。改 json 前先看有没有生成器；能改生成器就别手改 json（生成器归你，但只许加你自己那部分逻辑）。

## 验收
- 三个测试文件全 pass，条数报数；全量跑一次报数字；`tsc --noEmit` exit 0。
- 报告：R68/R69 各一张表（条目 / 原作依据 / 实现与否 / 测试名 / 等级），"18 条消费点"要逐条列，不许只写"已补 18 条"。
- 需要别人接线的地方，写"改哪个文件、在哪一行、加什么"，能让下一个 agent 直接照抄。
