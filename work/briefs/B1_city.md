# B1 · 内政面（city.html + city_model.js）

目标：把内政这块从"能点"做到"按原作规则"。用户口径：「完全还原单机的游戏逻辑和流程，不取巧、不省略」。

## 环境
- 根 `F:\sanguo`。服务已跑：`http://127.0.0.1:5173/web/campaign.html` → 点城进 `city.html`。
- 内政是纯前端 JS（非 TS），改完不用编译；改动后刷新页面即可，**但要跑自测**：`node F:\sanguo\game\web\city_selftest.mjs`（先看它现在怎么跑）。
- 新增测试放 `game/tests/city_rules.test.ts`（node --test 直接 import `../web/city_model.js`，该文件无 DOM/localStorage，可测）。
- 截图：`F:\sanguo\work\shots.ps1` 模板（Edge headless）。
- 没有 git。

## 你拥有的文件（其他一律不改）
`game/web/city_model.js`、`game/web/city.html`、`game/tests/city_rules.test.ts`（新建）、`work\city_*/**`（截图）、报告 `project/49_内政与征兵.md`（新建）。
**不要改** `campaign.html`、`saves.js`、`main.js`、`game/src/**`、`project/37a|31|44`。（`city.html` 引用的数据接口签名要给别的 agent 留着，改了就在报告里写明。）

## 先核对（10 分钟，别重做已有的）
`project/37a_逻辑对照.md` 是 01:36 快照，已经过期好几条，尤其：
- **R8「本月已下过内政令」闸门**：`city_model.js` 里已有 `save.lastActionMonth` / `clearMonthLock()` / `LOCK_HINT` / `UNLIMITED_HINT`——先确认 city.html 的 UI 是否真的用了它（按钮禁用 + 提示），把结论写进报告（✅ 带 file:line 证据，或修）。
- R65 月度士气/忠诚漂移：可能已在 campaign，不归你。

## 任务
1. **R8 执行闸门**：确认/补齐"一月一令"。原作 `0x4A64BC` 计数器（`docs/04c §2.3` 一带，自己 grep 确认键名与清零时机）。`?unlimited=1` 调试口保留且不明显。
2. **R10 自治（AI 代行内政）**：原作每月 AI 势力按 `Rate` 自行下发内政令。玩家城也应有"委任/自治"开关（原作是太守自动？以 docs/04c 为准），开了就按月自动执行并给一条"某城自治：开垦 +N 人口"式日志。定不了原作口径就做最小可信版并标 `[推测]`。
3. **R12 预备兵池 + 步/骑分列**：
   - 城有 `当前兵` 与 `兵上限`（原作 `city+0x86` / `+0x82`，`docs/04c`）；
   - 征兵面板现在是"花金换兵"，原作是**消耗预备兵 → 补部队**；确认现在实现属于哪种，按原作改：预备兵池按民忠/人口每月自然增长（公式有据写据，无据 `[推测]` 标清）；
   - 步/骑两列（R22 已做战斗侧分列，内政侧要能分别招募/补员）。
4. **R18 ONLYONE 物品**：搜索出物品时，唯一物品（ONLYONE=1）一旦已被搜出/已持有就不能再出；改判定并加测试（构造两次搜索）。
5. **R9 增量公式**：开垦/征兵/搜索的增量现在是 `[新设计]` 常量。在 `docs/04c §7` 找"未定位"清单，能定的定，定不了的把常量收进一个 `INCR` 表并注明出处状态（便于以后一处改）。
6. **hall_01..06.jpg 接进内政页**：`game/web/assets/bg/env/` 里 6 张殿内图（90–128 KB）已入库未用。按城规模/势力给 6 选 1 当背景，别盖住面板（CSS `background` + 半透明面板即可）；13 个 `ui_*.png`（`panel_bamboo`、`btn_wood_*`、`frame_bronze`、`scroll_head/tail`、`divider_orn`、`icon_plate`、`orb_button`、`popup_frame`、`portrait_frame`、`bar_slot`）**挑 3–5 个真正合适的**替换现有 CSS 木框/按钮，别全糊上去。给 before/after 两张截图。
7. **测试**：`city_rules.test.ts` 至少覆盖 1/3/4：闸门、预备兵池、ONLYONE。

## 验收
- `node --test game/tests/city_rules.test.ts` pass，条数报数；`node game/web/city_selftest.mjs` 仍 pass。
- 截图：内政页 750×1334（before/after 各一张 + 6 张殿内各一张，`work\city_bg\hall_N.png`）。
- 报告：每条 `改动 file:line` / `原作依据` / `测试名` / `等级`；`[推测]`/`[新设计]` 清楚标注；没做的写"没做，因为 X"。
- 不许把 `city.html` 的内联逻辑复制一份到别处；所有规则进 `city_model.js` 以便测试。
