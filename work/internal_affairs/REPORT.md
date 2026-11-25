# 内政 / 经济 P0 修复报告（agent: affairs）

范围：`F:\sanguo\game\web\campaign.html`、`city_model.js`、`city.html`（只动这三个文件 + 新增 `tests/affairs_*.test.ts`）。
目标：把「每个月一条全局令、任何月可内政、无将也能内政、钱不变成兵」改成原作的「每年 1 月内政窗口 × 每将每年 1 令 + 100 金 = 1 预备兵」。

## 0. 结果

| # | 项 | 状态 |
|---|---|---|
| F13 | 钱变兵（100 金 = 1 预备兵，换月自动转，直到钱光或兵满） | ✅ |
| F14 | 删守军每月白补 2% | ✅ |
| F15 | 删大地图「徵兵」第三套口径（500 金 → 40 兵），改开城内同一个徵兵抽屉 | ✅ |
| F1 | 正月内政窗口（非正月「內政」降级为只读「查看」，城内九键全灰） | ✅ |
| F2 | 逐将年令 `save.acted[name] = 年序`；`monthLocked` 退化为「窗口是否已结束」 | ✅ |
| F3 | 在路上的将不能内政（`save.away` + `rosterOf` 过滤，回城/退兵/遭遇自动归还） | ✅ |
| F8 | 搜索必须先选将、写 `ctx.exec`；无将/今年已行动 → 拒绝 | ✅ |
| F9 | 开发同规则；无太守直接拒绝并提示「需先任命太守」，不再用 ×0.53 糊过去 | ✅ |
| F17 | 大地图列表「防」改读 `CM.ensureCityState(save, c).def` | ✅ |
| F18 | 点己城画六项信息卡（人口 / 防御 / 金钱 / 预备兵 / 武将 N/10 / 太守·军师） | ✅ |

验收：`tsc --noEmit` **exit 0**；全量 `node --test "tests/*.test.ts"` **1685 tests / 1685 pass / 0 fail / 87 suites（10.47s）**（改前基线 1631 pass / 0 fail，差 +54 里 20 条是我新增的，其余是并行 agent 同期加的）；CDP 实机：12 个月表、7 月进内政被拒、搜索不选将被拒、重复用将被拒、F3 探针、F17 动态防御、13 张截图，全部在 `work\internal_affairs\`。

## 1. 逐条：位置 / 改前 / 改后 / 验证

### F13 钱变兵（100 金 = 1 预备兵）

- `game\web\city_model.js:815` 新增 `export const PREP_PER_GOLD = 100;`
- `game\web\city_model.js:830-841` 新增 `prepFromMoney(save, cityDef)`：
  ```js
  const cap = prepCapOf(st.pop);
  const room = Math.max(0, cap - st.prep);
  const n = Math.min(Math.floor(Math.max(0, num(st.money)) / PREP_PER_GOLD), room);
  if (n > 0) { st.prep += n; st.money -= n * PREP_PER_GOLD; }
  return { ok: true, city: cityDef.NAME, n, cost: n * PREP_PER_GOLD, prep: st.prep, cap, money: st.money };
  ```
  取整 `floor`（不足 100 的零头留在城里）、上限 `prepCap - prep`（兵满不转、钱不扣）、钱花光 `n=0` 不产生负数。
- `game\web\city_model.js:1539-1562` `autonomyTick(save, cityDefs, ctx, opts = {})`：新增第 4 参，`opts.loose === true` 才走旧的 `refillPrep`（`?loose=1` 对照口），默认逐城 `prepFromMoney`，`refilled.push({ city, gained: n, cost, prep, cap, money, kind: 'money' })`（每城都 push，保持既有测试对 `refilled` 的断言）。
- `game\web\city_model.js:785-800` `refillPrep` **函数体一行未改**（只改注释）：标为「旧设计（已停用，只作 `?loose=1` 对照）」。原因：`tests\city_rules.test.ts:176-192` 把它的首月 0 / 次月 10% / 同月 0 钉死了，直接删会破坏基线。
- `game\web\city.html:539-541` 换月 tick 传 `{ loose: dbg('loose') === '1' }`（`dbg` 只在 `?dev=1` 下生效，生产默认走钱变兵）。

改前：每月每城白补 `max(1, floor(cap*0.10))`，钱不参与；钱永远转不成兵。
改后：`n = min(floor(money/100), prepCap-prep)`，`money -= 100n`，`prep += n`。

实机（代县，`work\internal_affairs\cdp_result.json`，逐月读槽快照）：

| month | gold | cityMoney | prep | prepCap | def | pop | troops |
|---|---|---|---|---|---|---|---|
| 1 | 1200 | 3540 | 0 | 178 | 311 | 172000 | 89 |
| 2 | 1200 | **40** | **35** | 178 | 311 | 172000 | 89 |
| 3–12 | 1200 | 40 | 35 | 178 | 311 | 172000 | 89 |
| 13 | **10503** | **80** | **70** | 178 | 311 | 172000 | 89 |

- 月 2：`floor(3540/100)=35` → 兵 0→35、金 3540→40；月 3–12 金 40 < 100，不再转（零头保留）。
- 月 13 正月歲入 `annualTax(172000) = 1290 + 2250 = 3540` → 金 40+3540=3580 → 再转 35 → prep 70、金 80。公式逐月对得上（首轮看到的「+28 异常」就是歲入被再转了一次，不是 bug）。
- 测试：`tests\affairs_f13.test.ts` 6 条（250 金→2 兵剩 50；只剩 1 格→只转 1 扣 100；0 金/99 金不转；满池金不动；tick 默认 `kind:'money'` 且 500 金→5 兵而不是旧 10%；`loose:true` 走 `refillPrep` 不花金）。

### F14 删守军月白补 2%

- `game\web\campaign.html:5306` `advanceMonth`，删除原 `Math.max(1, Math.ceil(cap * 0.02))` 的 `growCities/growTroops` 整段（含「守 軍 回 補」日志），原位留 `[F14]` 注释（`campaign.html:5347`）。

改前：每城守军每月 `+max(1, ceil(上限*2%))`，不花金不看将。
改后：换月不补守军。兵只有三个来源：城内 `enlist`（预备兵→步/骑）、出征回城/退兵带回、AI 募兵。

实机：代县 troops 89（上限 178）**连续 13 个月纹丝不动**；旧规则下 12 个月应涨到 ≈125+。def 311、pop 172,000 同样 13 个月不变。
测试：`tests\affairs_f14.test.ts` 2 条（`advanceMonth` 函数体不含 `Math.ceil(cap * 0.02)` / `守 軍 回 補` / `st.troops +=`；仍含 `CM.autonomyTick(save, scenario.cities`）。

### F15 删大地图「徵兵」第三套口径

- `game\web\campaign.html:2766` 按钮文案：`金 500 → 兵 +40` → `城內徵兵 · 預備兵 → 兵`。
- `game\web\campaign.html:3786-3791` 点击分支：删 `save.gold -= 500; st.troops = Math.min(600, st.troops + 40)`，改成
  ```js
  if (!Saves.isYearStart(save.month)) return toast('非正月：徵兵屬於內政，只有 1 月能下（原作 1 月內政月）。');
  location.href = './city.html?city=' + encodeURIComponent(selected) + '&cmd=recruit' + (UNLIMITED ? '&unlimited=1' : '');
  ```
- `game\web\city.html:1232-1235` 新增页间协议：`?cmd=recruit` → 只读就拒，否则直接 `doRecruit()`（和城内点「徵兵」是同一个抽屉、同一个 `enlist` 口径）。
- `game\web\campaign.html:3715-3717` 月令锁清单去掉 `'recruit'`（实际行 `campaign.html:3774`：`['develop', 'dispatch', 'march', 'march_direct'].includes(act)`；徵兵本来就不占内政窗口）。

实机：月 7 点「徵 兵」→ `#hint` 显示「非正月：徵兵屬於內政，只有 1 月能下（原作 1 月內政月）。」，金 1,200→1,200 不变，仍在 campaign；月 13 点「徵 兵」→ 跳 `city.html?city=代縣&cmd=recruit&unlimited=1`、抽屉打开、标题「部隊徵兵 · 預備兵 → 步／騎」。截图 `s_07_recruit_rejected.png`、`s_15_recruit_drawer.png`。

### F1 正月内政窗口

- `game\web\campaign.html:2746` `const inAffairs = Saves.monthOfYear(save.month) === 1;`
- `game\web\campaign.html:2770-2771` 按钮：正月 `內 政 / 正月 · 內政八命令`；非正月 `查 看 / 非正月 · 只讀`。
- `game\web\campaign.html:3779-3783` `act==='city'`，非正月 href 追 `&view=1`。
- `game\web\campaign.html:2499-2503` `endMonth()` 加 `if (Saves.monthOfYear(save.month) !== 1) { notice('非正月：內政窗口只在每年 1 月開（原作 1 月內政月）。'); return; }`（`CM.markMonthActed(save, UNLIMITED)` 那行原样保留，rows85 测试要求）。
- `game\web\city.html:519-534`：`VIEW = qs.get('view') === '1'`、`inAffairsMonth()`、`readOnly()`（VIEW / 非正月 / 窗口已终了三选一）、`readOnlyHint()` 两套文案。
- `game\web\city.html:700` 九键 `b.disabled = ro`；`game\web\city.html:1162-1170` `onCmd` 先 readOnly gate（挡键盘与调试路径）。

实机（月 7 是 184 年 7 月）：大地图按钮 `查 看 非正月 · 只讀`；点进去 URL `city.html?city=代縣&view=1&unlimited=1`，`__city.readOnly=true`、`inAffairs=false`、`monthOfYear=7`、九键全灰、hint「非正月：原作內政只在每年 1 月開（大地圖「推進一月」到 1 月再來）」，`onCmd('搜索')` 被拒且 log 有记录；月 13（185 年 1 月）`readOnly=false`、`inAffairs=true`、命令可下。截图 `s_07_campaign_view_btn.png`、`s_07_city_view_readonly.png`、`s_07_city_view_search_rejected.png`。
测试：`tests\affairs_f1f8.test.ts` 前 3 条（render 的 inAffairs 与两种按钮文案、`&view=1`、endMonth 正月门且保留 markMonthActed、city.html 的 VIEW/readOnly/onCmd gate）。

### F2 逐将年令

- `game\web\city_model.js:600-616` `ensureExtras` 规范化 `save.acted`（只留正整数年序）与 `save.away`（值转字符串）。
- `game\web\city_model.js:647` `yearIndexOf(save) = floor((month-1)/12)+1`（与 `Saves.yearOf` 同式）
- `game\web\city_model.js:659` `actedLocked(save, name)`（该将年序 === 今年）
- `game\web\city_model.js:665` `markActed(save, name)`（记过返回 false，幂等）
- `game\web\city_model.js:668` `clearActed`、`:681` `actedNames`
- `game\web\city.html:748-756` `afterCommand(acted, execName)`：带将在场就记 `markActed(save, execName)`，不带将才落到旧的 `markMonthActed`（窗口级）。
- `game\web\city.html:764` `pickExec(title, cb)` 选将抽屉。

**`monthLocked` / `markMonthActed` / `clearMonthLock`（`city_model.js:1636-1651` 区段）一行未改**——测试把它们钉死了；语义上改称「内政窗口是否已结束」：换月 `clearMonthLock`、`endMonth` 收束、城内普通命令不再逐个写它。

实机：185 年 1 月 `acted=[]`；选关羽搜索成功 → `gold 10503→10303`（-200）、`acted=["關羽"]`、`freeExecs` 由 6 人变 5 人；再用关羽 → log「關羽 今年已行動（每將每年只能搜索或開發一次），換一位。」、金不变。
测试：`tests\affairs_f2f3.test.ts` 前 4 条（年序 1/12/13/24/25 与 `Saves.yearOf` 一致；逐将独立、换月不解锁；跨年解锁；`ensureExtras` 清坏值）。

### F3 在路上的将不能内政

- `game\web\city_model.js:693-700` `awayNameSet(save)`：`save.away` 非空键 ∪ `save.armies` 里 `side==='A'` 的主将+officers。
- `game\web\city_model.js:707-718` `syncAway(save)`：由 `save.armies` 重算 `save.away` 并回传。
- `game\web\city_model.js:884/893` `rosterOf` 两个循环都跳过 `away` 里的将。
- `game\web\campaign.html:1463-1466` `removeArmy` 过滤后 `CM.syncAway(save)`（进城的唯一删除咽喉 → 回城/退兵/遭遇取消/全灭都自动归还）。
- `game\web\campaign.html:2728-2729` `render()` 开头重算一次（旧档/中途载入也能对上）。
- `game\web\campaign.html:2919/2939-2940` `dispatchArmy` push 兵团后重算。

实机探针：真存档里 push 一条 `{id:'probe-f3', side:'A', from:代縣, general:關羽, officers:['關羽']}` → `M.syncAway` → `rosterOf` 6→5、`freeExecs` 排除；删掉兵团后 5→6 恢复。`cdp_result.json` 的 `f3 = {ok:true, before:6, mid:5, back:6, excludedOnRoad:true, freeExcludes:true, restoredAfterReturn:true}`。
测试：`tests\affairs_f2f3.test.ts` 后 2 条（syncAway 由 army 重算并让 rosterOf 少 2 人、removeArmy 后归还；老档只写 `save.away` 也挡）。

### F8 搜索必须选将

- `game\web\city.html:960-1000` `doSearch(execName)`：没带 exec → `pickExec('搜索', ...)`；`actedLocked` → 「X 今年已行動…換一位」；`M.search(save, cityDef, { ...ctx, exec: execName })`；成功后 `afterCommand(true, execName)`。
- `game\web\city.html:764-798` `pickExec`：从 `rosterOf`（已过滤 away）再排除今年已行动；无可用将 → 「沒有可用的武將…」；抽屉未选人直接确定 → 「沒選執行武將：命令取消（原作要指定人，不能空手代行）。」并 `afterCommand(false)` 刷画面（不记令）。

实机：抽屉「搜索 · 選執行武將」6 人（武/智）；直接确定 → 拒绝、金 10503 不变、`acted=[]`；选关羽确定 → 金 10303、`acted=["關羽"]`、掉落物入库；同名再搜 → 「今年已行動」拒绝。截图 `s_13_search_sheet.png`、`s_13_search_noselect_rejected.png`、`s_13_search_done.png`。
测试：`tests\affairs_f1f8.test.ts` 第 4 条（doSearch 含 pickExec / actedLocked / `exec: execName` 且不再 `M.search(save, cityDef, ctx)`）。

### F9 开发必须选将 + 无太守直接拒绝

- `game\web\city.html:801-812` `doDevelop(execName)`：第一道 `if (!M.majorOf(save, cityDef))` → 「需先任命太守：沒有太守不能開發（原作不允許無太守代行）。」+ `afterCommand(false)`，**不再进入 develop 让 ×0.53 生效**；之后 `pickExec('開發', ...)`、`actedLocked` 挡、`M.develop(save, cityDef, { ...ctx, exec: execName })`。
- `city_model.js` 的 `develop()` 本体未改（保留 `exec || major` 兼容自测/自治），拒绝发生在 UI 层，既有模型测试不受影响。

测试：`tests\affairs_f1f8.test.ts` 第 5 条（doDevelop 含 majorOf / 需先任命太守 / pickExec / actedLocked / exec，且不再 `M.develop(save, cityDef, ctx)`）。
实机：本次代县有太守（劉焉），未构造无太守城（首个剧本三城都有太守/名册）；这条以源码断言 + 模型行为测试为准，属已知取证缺口。

### F17 列表「防」读动态 state

- `game\web\campaign.html:2755`：`<b>${st.troops}</b> 兵 · 防 ${c.DEFENSE ?? '—'}` → `防 ${CM.ensureCityState(save, c).def}`。

实机补证（`work\internal_affairs\steps_f17.mjs` → `cdp_f17.json`）：代县剧本静态 `DEFENSE=311`；正月开发一次（劉備）→ state `def=311→348`、`pop=172000→182170`；回大地图列表行变成 **`代縣 我方 89 兵 · 防 348 182,170 人 · $80`**（= 槽快照 `def`），六项卡同步 `防禦 348 / 999`、`人口 182,170 / 1,000,000`。旧码永远显示 311。截图 `s_17_campaign_list_def.png`、`s_17_city_dev_before_return.png`。

### F18 己城六项信息卡

- `game\web\campaign.html:94-101` CSS（3 列网格、`[hidden]` 强制隐藏）
- `game\web\campaign.html:299-300` `<div id="cityCard" hidden></div>`（`#actions` 之后、`#hint` 之前）
- `game\web\campaign.html:2813-2815` 选中己城才填：人口 `/1,000,000`、防御 `/999`、金钱、预备兵 `/上限`（`CM.prepStateOf`）、武将 `N/10`、太守·军师；敌城隐藏。

实机首屏：`人口 172,000 / 1,000,000　防禦 311 / 999　金錢 $3,540　預備兵 0 / 178　武將 6 / 10　太守·軍師 劉焉 · 劉焉`。截图 `s_00_campaign_m01_card.png`（同屏可见「內政 正月·內政八命令」「徵兵 城內徵兵·預備兵→兵」）。

## 2. 验收数字

### 2.1 类型

```
cd F:\sanguo\game
npm.cmd exec -- tsc --noEmit      → exit 0
```
（`campaign.html` / `city.html` 是内联 `<script type="module">`，不在 tsc 范围；`node --check` 对 .html 不适用，实际守护靠 `node --test` 里的源码扫描测试 + 浏览器实跑。）

### 2.2 全量测试

```
node --test "tests/*.test.ts"
ℹ tests 1685   ℹ suites 87   ℹ pass 1685   ℹ fail 0   ℹ duration_ms 10468.8
```
- 改前基线：**1631 pass / 0 fail**（实测确认）。
- 差 +54 = 我的 20 条 + 并行 agent 同期新增（他们过程中出现的 takeFromCity / deploy.html import / 地形 / 天气 / main.js 失败与本轮无关，最终都已消失）。
- 我的新增（每条规则至少一条断言）：

| 文件 | 条数 | 覆盖 |
|---|---|---|
| `tests\affairs_f13.test.ts` | 6 | 取整 / 上限 / 清零 / 满池 / tick 默认口径 / `loose` 对照 |
| `tests\affairs_f14.test.ts` | 2 | 2% 白补整段消失、tick 仍在 |
| `tests\affairs_f2f3.test.ts` | 6 | 年序、逐将年令、跨年解锁、ensureExtras 清洗、away 过滤与归还 |
| `tests\affairs_f1f8.test.ts` | 6 | 正月门（campaign+city）、搜索/开发选将、无太守拒绝、pickExec 拒绝路径 |

### 2.3 CDP 实机（端口 9351，profile `work\.edgeprof_affairs`，静态服务器 `work\internal_affairs\serve.mjs` :5173）

- 12 个月表（§F13 表）：月 2 金 3540→40、预备兵 0→35；月 3–12 不再转；月 13 歲入后再转一轮；def/pop/troops 13 个月不变（F14 成立）。
- 7 月：大地图按钮「查 看 非正月 · 只讀」；city 页 `readOnly=true`、九键全灰；`onCmd('搜索')` 被拒；大地图「徵兵」被拒且金不变。
- 正月：搜索不选将 → 拒绝且金不变；选关羽 → -200 金、`acted=["關羽"]`；重复 → 拒绝；F3 探针 6→5→6。
- 截图（`work\internal_affairs\*.png`，13 张）：`s_00_campaign_m01_card`、`s_07_campaign_view_btn`、`s_07_city_view_readonly`、`s_07_city_view_search_rejected`、`s_07_recruit_rejected`、`s_12_campaign_m13`、`s_13_city_january`、`s_13_search_sheet`、`s_13_search_noselect_rejected`、`s_13_search_done`、`s_15_recruit_drawer`、`s_17_campaign_list_def`、`s_17_city_dev_before_return`。
- 原始数据：`cdp_result.json`（主取证）、`cdp_f17.json`（F17 补证）。
- 收尾：`node work\cocos_verify\cdpweb.mjs close` + `node work\cocos_verify\reap.mjs --kill --match=edgeprof_affairs`；**遗留验证浏览器进程: 0**。

## 3. 设计取舍（都有测试或实机兜底）

1. **钱变兵用每城 `st.money`**（原作 +0x92），不是顶栏 `save.gold`。F16「钱的口径分裂」是 P1、不归我；顶栏仍是单钱包，所以实机上看到的是「列表行 $ 和预备兵在动，顶栏金不动」。
2. **`refillPrep` 不删**：保留函数体、改注释，只作 `?loose=1`（dev-only）对照。删它会破坏 `city_rules.test.ts:176-192`。
3. **`monthLocked/markMonthActed/clearMonthLock` 不改实现**：三个测试钉死。语义改为「窗口是否已结束」，城内普通命令改记逐将 `acted`。
4. **情报/物品/移动/任命不再吃窗口**（只读或不消耗资源）；**自治/出征仍吃**（自治不吃就能无限刷免费开发，出征是兵团级动作）。情报这项如 lead 认为仍该占一条令，改 `openIntel` 一行即可。
5. **F9 拒绝放在 UI 层**（`doDevelop` 先查 `majorOf`），不动 `city_model.develop()`，避免连锁改既有模型测试与自治路径。
6. **F15 选「改开城内抽屉」**而不是删按钮：保留入口、口径唯一（`enlist`），非正月由 F1 的月份门挡住。

## 4. 没做完 / 需要 lead 处理

1. **F12 大地图「開發」按钮仍是第三套口径**（`campaign.html:3795` 起：`save.gold -= 400; st.pop += 3000`）。F12 不在我分到的清单里，且与 `city_model.DEV.COST=0`（原作不耗金）直接冲突；本轮未动，已保留原行为。建议 lead 派给 F12 负责人或按 F15 同样方式改成跳城内开发。
2. **marchflow 的 deploy 契约（两处，未做）**：已与 agent marchflow 对齐（`work\march_flow\REPORT.md` §4）：
   - `campaign.html` 的 `dispatchArmy` 玩家路径改开 `deploy.html?city=<to>&from=<from>&a=<leader>&officers=<join(',')>&bsoldiers=<enemySetup(selected).enemyTroops>&lv=<leaderLv>`（不带 troops = 城兵模式，deploy 点出征才 `takeFromCity` 扣兵）；
   - 抵达城下「出戰」URL 补 `troops: String(a.troops)`（可加 `army: a.id`），否则 deploy 按城兵模式再扣一次城兵；
   - deploy 扣兵后会写 legacy + 槽快照，campaign boot 的 `readLegacy` 顺序不要动、别在 boot 前 autosave 旧快照。
   未做原因：跨 `deploy.html`（不归我）且会改 march 语义，排在 P0 验收之后；本轮 P0 已收口，留给 lead/marchflow 排期。
3. **F16 钱包统一（P1）**：F13 只让每城 money 能变兵，`save.gold` 仍是单钱包；顶栏与列表行两个「金」还在。统一到「国库 = Σ 每城 money」需要改 saves.js/campaign 多处，不在本轮。
4. **F19/F20（P1/P2）**：武将数上限字段（现在 F18 卡的 `/10` 是常量）、人口/防御上限后缀只在新卡里显示，chip 未改。
5. **取证缺口**：无太守城未在实机构造（首剧本三城都有太守），F9 由源码断言 + 模型行为测试覆盖。

## 5. 复现命令

```powershell
# 测试 / 类型
cd F:\sanguo\game; node --test "tests/*.test.ts"; npm.cmd exec -- tsc --noEmit

# 实机取证（先起静态服务器 + 浏览器，见 work\internal_affairs\serve.mjs）
$env:PORT='9351'; $env:PROFILE='F:\sanguo\work\.edgeprof_affairs'; $env:MATCH='127.0.0.1:5173'
$env:OUTDIR='F:\sanguo\work\internal_affairs'
node work\cocos_verify\cdpweb.mjs run work\internal_affairs\steps_affairs.mjs
node work\cocos_verify\cdpweb.mjs run work\internal_affairs\steps_f17.mjs

# 收尾
node work\cocos_verify\cdpweb.mjs close
node work\cocos_verify\reap.mjs --kill --match=edgeprof_affairs
```
