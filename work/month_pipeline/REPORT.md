# 月推进收进 core 单源（F-03 / F-04 / F-14）

任务来源：`work/parity_sweep/REPORT.md` 的 F-03 / F-04 / F-14 三条 + `work/affairs_audit/REPORT.md` 的内政数值口径。
本轮目标不是「再抄一份」，而是把「一个月的推进」从 web 页面逻辑收进 `game/src/core/advance_month.ts` 这支纯函数，让 web 与 Cocos 调同一个 `advanceOneMonth()`。

改动前两端各有一套月推进：
- web `campaign.html:5392 advanceMonth(n)`：`save.month += 1` → 年度结算 → 年税 → 账本 → 自治代行 `CM.autonomyTick` → 疲劳/士气 → 忠诚漂移 → 补学，共约 160 行。
- Cocos `GameState.advanceMonth()`：只做 `month += 1` + 年税 + **每月给所有城白补守军 2%**；没有年度结算 / ledger / 补学；`autonomyTick` 只在 `CityPanel.ts:694`（进内政页时）补跑。

---

## 1. 三条差异：改前 → 改后 → 验证

### F-03 月推进缺 `autonomyTick`（自治代行 + 金→预备兵）

| | |
|---|---|
| **改前** | Cocos 的 `autonomyTick` 唯一调用点是 `CityPanel.ts:694`（改前 691-692），只有玩家打开内政页才跑一次「补算」；`CampaignRoot.endInterior()` 逐月推进从不跑它。web 则每月在 `campaign.html`（改前 5444）跑 `CM.autonomyTick(save, scenario.cities, {generals: GDATA.generals})`。⇒ 同一个存档，web 每月金→预备兵 + 自治城搜索/开发，Cocos 只有开过内政页才补。 |
| **改后** | 月流水的第 5 步固定跑「自治代行」：`ctx.civic` 适配器优先（web 传 `CM.autonomyTick`；Cocos 由 `CityPanel` 注册），没有适配器时若有 `prep` 字段则跑 core 内置的「金→预备兵」保底（`prepFromMoney` 同 100:1），两者都没有时 `civic.mode='skipped'` 并在 `note` 里写明原因（不静默）。web 页面仍然调**同一支** `CM.autonomyTick`，只是改为经 `ctx.civic` 注入。 |
| **验证** | ① `tests/advance_month.test.ts` 前 3 条：金→预备兵 100:1（250 金→2 兵、剩 50 金）；`builtin` 模式对**每座城**生效（甲 1000 金→10 兵、乙已满上限不动、丙 2500 人口→3 兵，refilled=2）；`adapter` 模式每月只调一次、拿到同一份 state、`auto.text` 进战报。② `work/month_pipeline/verify_web_adapter.mjs` 用构建产物 `dist/core/advance_month.js` + web 原装 `CM.autonomyTick` 跑一个月：`civic.mode='adapter'`、`civic.refilled=60`（web 本来就是对剧本全城跑 prepFromMoney，与改前同口径）、襄平 prep 0→56 / 北平 0→58。③ 缺 bridge 的 Cocos 降级路径由测试 #12 覆盖（`civic.mode='skipped'`、note 含「本月跳過自治代行」、不扣钱）。 |

### F-04 守军每月白补 2%

| | |
|---|---|
| **改前** | `GameState.ts:854-862`：对所有剧本站城 `cap=min(600, floor(pop/2500)+110)`、`step=max(1, ceil(cap*0.02))`、`troops=min(cap, troops+step)`，不分敌我、每月凭空涨兵。web 端 F14 已删（只有注释）。 |
| **改后** | 整段删除。`advanceOneMonth()` 全程不写 `city.troops`（只写 `money`（年税）/`prep`（金→预备兵）/`pop`、`def` 由适配套件的 `autonomyTick` 写）。Cocos `GameState.advanceMonth()` 改为转调 core，因此也一并消失。 |
| **验证** | ① 测试 #4：跑一个月后 `cities[*].troops` 与运行前 `deepEqual`（守军一枚不涨）。② 测试 #14 源码边界：core 里没有 `cap * 0.02` / `Math.ceil(cap` / `city.troops ...=`。③ `tests/cocos_p1_port.test.ts:291` 断言 `GameState.advanceMonth` 体内无 `save.gold += income;` 仍然绿；`GameState.ts` 里已无 `cap * 0.02` / `Math.ceil(cap` 代码（只剩一段 doc 注释说明「已删」，见 886 行上方注释）。 |

### F-14 缺年度结算 / ledger / 补学

| | |
|---|---|
| **改前** | web 有 `annualYearRollover()`（`campaign.html:4836`）+ `annualForceCheck()`（4849，只读巡检）+ `Saves.annualSettle` + `Saves.ledgerAdd` + `monthlyLearn()`（1808）；Cocos `GameState.advanceMonth` 一个都没有（跨年只加钱，没有年度记录/账本/补学）。 |
| **改后** | 月流水第 2 步「年度结算」（仅正月）：`annualSettle()` 照抄 `saves.js:1690-1744`（两道闸 `not-january`/`first-year`、`closed=max(1,year-1)`、上年账本对不上年份时全 0、pop=Σ城 pop、城数=owned 非空条数、武将数=Σ roster 数组长度（跳过 `_moved`）、record 全字段 + 五段 `YEAR_STAGES`、写回 `yearFlag=0; annual=record; ledger={year,months:0,income:0,salary:0}`）；第 3 步年税（逐城 `pop*75/10000+2250` 进本城 `money`，跳过关城）；第 4 步 `ledgerAdd({income, months:1})`；第 7 步补学（`core/unlock.ts` 的 `createLearnState`/`monthlyLearnCheck`，写回 `save.learned`）。Cocos 存档里 core 写的新键能存活：`normalize()` 对白名单外顶层键原样带过（`GameState.ts:508-513`，城市层同规则 470-475），所以 `year/ledger/annual/yearFlag/learned` 下一次读档不会被丢掉。 |
| **验证** | ① 测试 #5：月 12→13 触发 `annual.ok`（record.year=1、intoYear=2、months=12、cities=2、pop=109500、五段），年税进各城金后被「金→预备兵」换走（代县 money 46/prep 28，晋阳 money 75），`income=5321`，`ledger={year:2,months:1,income:5321,salary:0}`，战报顺序「年度结算 → 歲 入」。② 测试 #6：关城免税（RATE=0）。③ 测试 #7：非正月不征税、ledger 仍 +1 个月、`annual=null`。④ 测试 #10/#11：补学写 `learned`，第二次幂等；缺 `data` 时不写。⑤ web 端到端脚本：`annual.record.year=1`、`save.yearFlag=0`、`save.annual.stages.length=5`、ledger 正确。 |

---

## 2. `advanceOneMonth` 接口与流水线

文件：`F:\sanguo\game\src\core\advance_month.ts`（879 行，纯 TS；只 import `../types.ts` 的 `GameData` 类型 + `./unlock.ts` 的补学 API，无 DOM / 无 `cc` / 无 node 内置模块）。

```ts
export function advanceOneMonth(
  state: MonthSaveLike,      // 就地修改：web 的 campaign save / Cocos 的 CampaignSave
  ctx: MonthContext = {},    // 各端把「自己那份数据」用最小接口喂进来
): MonthReport;
```

`MonthContext`（全部可选）：

| 字段 | 用途 |
|---|---|
| `cityDefs?: MonthCityDef[]` | 剧本全城定义（年税判关城；Cocos 传 `CampaignCity[]`） |
| `data?: GameData` | `generals.json` 的 SKILL/WISESKILL 表（月末补学）；缺省跳过补学 |
| `civic?: (state, ctx) => { refilled?, auto?, text? }` | 自治代行适配器（web `CM.autonomyTick`；Cocos 由 `CityPanel` 注册） |
| `officersByCity?: Record<string, string[]>` | 各城在职武将（web 用 `garrisonIn`；缺省从 `state.cities[*].officers` 取） |
| `levelOf?: (name) => number` | 武将等级（web `generalLevelOf`；缺省用 `save.generalLevel[name]` 或 1） |
| `ts?: number` | 年度记录的时间戳；**默认 0 保持可重放**，页面传 `Date.now()` |

`MonthReport`（返回给 UI 写战报）：`{ month, year, yearStart, income, ledger, annual, civic, fatigue, morale, learned, logs }`，`logs` 已按 web `pushLog` 旧顺序排好。

流水线（7 步，顺序照抄 web `campaign.html:5392` 改前实现）：

1. **月推进**：`month = max(1, int(month)) + 1`；`lastActionMonth = 0`（= `CM.clearMonthLock`）。
2. **年度结算**（仅正月）：`yearFlag=1` → `annualSettle(state, {ts})`；失败把 `yearFlag` 收回 0（同 web `annualYearRollover`），成功把 `annual.text` 推进战报。
3. **年税**（仅正月）：逐 `owned` 城 `money += pop*75/10000+2250`，跳过关城（`isGate`，0x405499）；有收入时推「歲 入：+N 金（正月 · N 城 · 每城 人口×75/10000 + 2250）」。
4. **账本**：`ledgerAdd({income, months: 1})`。
5. **自治代行**：适配器优先；否则有 `prep` 字段时跑内置「金→预备兵」（100:1，`n=min(floor(money/100), cap-prep)`）；否则 `skipped` + note。战报只推 `auto.text`（搜索/开发代行结果）。
6. **疲劳 / 士气**：`tireMonthly`（每月 -1、高疲劳 ≥60、城级士气按高疲劳人数扣）→ `moraleMonthly`（高疲劳 → 士气 -1；士气 <30 → 自然 +1），常量与 `[[FATIGUE_CORE]]`/`[[MORALE_CORE]]` 逐字一致。
7. **月末补学**：`monthlyLearnIn`（`createLearnState` + `monthlyLearnCheck`，8 槽，写回 `save.learned`）。

数值公式全部照抄，未自行发明：`city_model.js` 的 `annualTax`/`isGate`/`prepFromMoney`/`troopCapOf`/`runAutonomy`、`saves.js` 的 `yearOf`/`isYearStart`/`ledgerOf`/`ledgerAdd`/`annualSettle`/`annualText`/`YEAR_STAGES`、`campaign.html` 的 `tireMonthly`/`moraleMonthly`/`monthlyLearn`。core 另导出这些函数供两端复用（`annualSettle`/`annualTax`/`troopCapOf`/`ledgerOf`/`tireMonthly`/`moraleMonthly`/`officersByCityOf`/`prepFromMoneyAll` 等）。

**有意的差异**：`annualSettle` 统计武将数时，若存档没有 `roster`（Cocos 的战役存档就没有，在职武将在各城 `officers` 里），退化为数 `cities[*].officers`；web 有 `roster` 时与 `saves.js` 完全同式。

---

## 3. 接入点

### 3.1 web（已完成）

- `campaign.html:538` 新增 `import { advanceOneMonth } from '../dist/core/advance_month.js';`（页面从 `dist/` 取 core 构建产物，故需先跑 `tsc -p tsconfig.build.json`）。
- `campaign.html:5392 advanceMonth(n)` 的逐月循环体（5398 起）改为：

```js
const report = advanceOneMonth(save, {
  cityDefs: scenario.cities,
  data: GDATA,
  civic: () => CM.autonomyTick(save, scenario.cities, { generals: GDATA.generals }),
  officersByCity,
  levelOf: (name) => generalLevelOf(name),
  ts: Date.now(),
});
```

  - `officersByCity` 仍按 `save.owned` + `garrisonIn(name).officers` 在页面组装（garrison.json 是页面数据源）。
  - `if (report.annual && report.annual.ok)` 时页面继续跑段5 `annualForceCheck()`（只读巡检要读 garrison/adj，core 接不了）。
  - 战报：`report.logs` 前半逐行 `pushLog`；R65 忠诚漂移（页面保留）之后再把最后一行（补学）`pushLog`，保持改前「年结算 → 歲入 → 自治 → 疲劳 → 士气 → 忠诚漂移 → 补学」顺序。
  - 12 个月的循环、marchMode/AI 月、守城战跳转、`autosave/render` 全部留在页面。
- 删除的页面旧逻辑：`save.month += 1` / `CM.clearMonthLock` / `annualYearRollover()` 调用 / 年税循环 / `Saves.ledgerAdd` / `CM.autonomyTick` 直调 / 疲劳士气计算 / `monthlyLearn(save)` 调用。
- 保留的页面定义（**不能删**）：`[[FATIGUE_CORE]]`/`[[MORALE_CORE]]` 标记块（`tireMonthly/moraleMonthly`，`tests/fatigue.test.ts`、`tests/morale.test.ts` 会从 campaign.html 与 main.js 抽块对拍）、`monthlyLearn()` 定义（1808）、`annualYearRollover()`/`annualForceCheck()` 定义（后者仍被调用）。

### 3.2 Cocos（`GameState.ts` 已完成，`CampaignRoot`/`CityPanel` 按纪律不动）

`GameState.ts` 新增：
- `import { advanceOneMonth } from './core/advance_month';` + 类型 import。
- `interface CityMonthBridge { data?; civic?; officersByCity? }`（835）。
- `setCityMonthBridge(bridge)` / `clearCityMonthBridge()` / `hasCityMonthBridge()` / `lastMonthReports()` / `lastMonthReport()`（848-870）。
- `advanceMonth(cities, opts: {data?} = {})`（886）：`loadSave()` → 拼 `MonthContext`（`cityDefs: cities`、`data: opts.data ?? bridge.data ?? null`、`civic: bridge.civic ?? null`、`officersByCity: bridge.officersByCity ?? null`、`ts: Date.now()`）→ `advanceOneMonth(save as MonthSaveLike, ctx)` → 记最近 12 份 `MonthReport` → `persistSave()` → `return report.income`（返回值语义与旧版相同：正月税入，其余 0）。
- 旧的「所有城白补守军 2%」（原 854-862）随整段替换删除。
- 缺 bridge 时不报错：降级为「只推月/年结算，跳过自治」（`MonthReport.civic.mode='skipped'`，`note` 写明原因）。

### 3.3 ★ lead 待补（可直接粘贴，本轮按裁决未落地）

**(a) `CampaignRoot.ts` 月推进入口一行**（`endInterior()` 循环内，当前 `CampaignRoot.ts:2153`）：

```ts
      income += GameState.advanceMonth(this.cities, { data: this.data });
```

原行是 `income += GameState.advanceMonth(this.cities);`。传 `this.data` 后，Cocos 的月末补学（F-14）才能拿到 `generals.json` 的 SKILL/WISESKILL；`this.data` 为 null 时 core 自动跳过补学，不报错。

**(b) `CityPanel.open()` 注册内政桥 4 行**（插在 `open()` 里 `this.persist(); this.refresh();` 之后、`openCmd` 分支之前；当前 `CityPanel.ts:698-700` 之间）：

```ts
    // [F-03] 月流水收進 core：把「內政存檔合併器」註冊給 GameState，
    // 讓 CampaignRoot 的每月推進（endInterior）也能跑自治代行 + 金→預備兵，
    // 而不是只有玩家進內政頁時補跑一次。CityPanel 其餘邏輯不動。
    GameState.setCityMonthBridge({
      data: options.data,
      civic: () => {
        // GameState 已換月/徵稅；內政真源在 extras ⇒ 每次先重併，再跑 autonomyTick（內部以
        // autoMonth 做幂等 guard，重跑不會重複發錢），跑完立刻 persist 回寫兩份存檔。
        this.save = this.mergeSave();
        const tick = M.autonomyTick(this.save, this.cities(), this.ctx);
        this.persist();
        return tick;
      },
    });
```

说明：`M.autonomyTick` 的返回 `{month, refilled, auto, first}` 正好是 core `MonthCivicOutcome` 认的形状（`refilled` 数组、`auto.ok`/`auto.text`）。注册放在 `open()` 里，是因为只有 `open()` 才拿到 `options.data`（GameData）和 `this.ctx`（generals/items/wises/garrison/scenario），且 `CityPanel` 实例由 `CampaignRoot` 长期持有，闭包跨月有效；下次开页重新注册（幂等）。`CityPanel` 里原来进页补跑的那次 `M.autonomyTick` 保留即可（幂等，相当于「手动开页补跑」）。

**(c) 建议（可选）**：`CampaignRoot` 在换局/读档时调 `GameState.clearCityMonthBridge()`，避免上一局的面板闭包残留；不调也不会写坏存档（bridge 只影响下一个月推进的自治段）。

---

## 4. 验证与测试计数

改动文件与验证命令（全部在 `F:\sanguo\game` 下执行）：

| 命令 | 结果 |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0（0 error） |
| `node node_modules/typescript/bin/tsc -p cocos/tsconfig.check.json` | exit 0 |
| `node node_modules/typescript/bin/tsc -p tsconfig.build.json` | exit 0；`dist/core/advance_month.js` 存在（页面 import 依赖） |
| `node --test tests/advance_month.test.ts` | 15/15 pass |
| `node --test tests/affairs_f14.test.ts tests/affairs_p1.test.ts tests/rows85.test.ts tests/cocos_p1_port.test.ts` | 61 pass / 0 fail |
| `node --test "tests/*.test.ts"`（全量） | **tests 1843 / pass 1842 / fail 0 / todo 1**（基线 1806/1805/1；本会话新增 15 条，同工作树其它会话同期新增 22 条，0 红） |
| `node work\enc\scan_utf8.mjs <改动文件…>` | `6 files, 0 BAD, 0 WARN, 6 clean -> OK` |
| `node work\cocos_sync\sync_core3.mjs --diff-only` | `文件 24：相同 24 / 有差异 0 / cocos 缺 0 / cocos 多出 0` |
| 页面 `<script type="module">` 抽出后 `node --check` | exit 0（无语法错） |
| `node ..\work\month_pipeline\verify_web_adapter.mjs` | `verify_web_adapter: OK`（month 12→13、income 5763 金、ledger `{year:2,months:1,income:5763}`、prep 56/58、troops 不变） |

新增测试 `game/tests/advance_month.test.ts`（15 条）：
1. F-03 金→预备兵 100:1（builtin 保底）
2. F-03 每座城都生效（不只开面板那座）+ 满上限不再换
3. F-03 适配器模式：每月一次、同一份 state、`auto.text` 进战报
4. F-04 守军不涨（`deepEqual(troops)`）
5. F-14 跨年（12→13）：年度结算 + 年税进本城金 + ledger
6. F-14 关城免税（RATE=0/POPULATION=0）
7. 非正月：不税、ledger 仍 +1、`annual=null`
8. 纯函数可重放：同输入同输出（`ts` 唯一时间注入点）
9. 疲劳/士气：每月 -1、高疲劳扣城士气、低迷自然 +1
10. 补学：写 `learned`、战报 `學 習`；第二次幂等
11. 缺 `data` 不写 `learned`
12. 缺 bridge / 无 prep：`civic.mode='skipped'` + note，不静默
13. `lastActionMonth` 归零、month +1
14. core 源码边界：无 `cc`/DOM/`localStorage`/node 内置；无白补守军痕迹
15. 共用口径：`yearOf`/`monthOfYear`/`isYearStart`/`annualTax`/`troopCapOf(1_000_000)=510`/`officersByCityOf`/`prepFromMoneyAll` 幂等

既有测试只动了一处：`tests/rows85.test.ts` 的 R5/R15 原来扫 `campaign.html` 的 `advanceMonth` 体（`save.month += 1`/`CM.clearMonthLock`/年税公式等），这些行已收进 core ⇒ 扫描目标改为 `src/core/advance_month.ts`，并加注释「月流水收进 core（F-03/F-14）」。其余源码扫描测试（`affairs_f14`、`affairs_p1`、`cocos_p1_port`）未改，全部仍绿（`affairs_f14` 要求的 `/CM\.autonomyTick\(save, scenario\.cities/` 由页面 civic 闭包满足）。

---

## 5. 架构问题（F-09「存档容器分裂」，lead 要求单列）

Cocos 侧同一局存档分散在多个 localStorage 键里：

| 数据 | 存放位置 | 谁能读到 |
|---|---|---|
| 战役主档：`month/owned/cities{troops,pop,money}/gold/armies/morale/tire/generalLevel…` | `GameState` 的 `SAVE_KEY='sanguo_campaign_v1'` | `GameState`（同步） |
| 内政档：`prep/prepMonth/def/cav/inf/auto/autoMonth/roster/appointed/searchLog/searchSeq/searchNonce/foundItems/acted/away/lastActionMonth/bag` | `CityPanel.CITY_EXTRAS_KEY='sanguo_city_v1'`（独立键） | 只有 `CityPanel`（`readExtras/mergeSave/persist`） |
| `generals/items/wises/garrison/scenario` 等只读数据 | `DataLoader.loadGameData()` 的异步 `Promise<GameData>` cache；运行时引用在 `CampaignRoot.this.data` | 只有加载完成后的场景脚本 |

由此产生两个后果：
1. **F-03 的根因**：每月推进发生在 `GameState.advanceMonth()`（同步、没有内政档、没有 GameData），而 `autonomyTick` 必须对着「合并后的 `CitySave`」跑（`mergeSave()` 只有 `CityPanel` 有）⇒ 月推进永远够不到自治代行，只能在 `CityPanel.open()` 里补跑。这也是为什么 web 侧只要把同一支函数调用搬进月循环就修好了，Cocos 侧必须多一个「桥」。
2. **F-14 的补学/年结算是同一类问题**：`annualSettle`/`monthlyLearn` 需要 GameData（技能表）与完整武将名单，Cocos 的 `GameState` 同样拿不到；本轮用 `CityMonthBridge.data`/`ctx.data` 注入，属过渡方案。

**建议（给 F-09 派单）**：把城状态收进 `GameState.save.cities`（`CityState` 含 `prep/prepMonth/def/cav/inf/auto/autoMonth` 等，`roster` 也并入主档），`loadSave()` 时若检测到 `sanguo_city_v1` 就一次性迁移并写 `cityExtrasMigrated:true`，之后只读主档；`CityPanel` 的 `mergeSave()/persist()` 退化为 UI view-model 适配层，不再写第二个键。数据侧再把 `DataLoader` 的 cache 暴露成同步读口（加载完成后 `getLoadedData()`），或在 `CampaignRoot` 数据就绪后 `GameState.setCityMonthBridge({data: this.data})` 常驻注册。这样「每月自治 + 年度结算 + 补学」可以完全在 `GameState.advanceMonth → advanceOneMonth` 里跑，Cocos 不再依赖「玩家打开过内政页」。

---

## 6. 遗留（哪些 web 侧逻辑还没搬进 core）

1. **R65 忠诚漂移**（`AI.monthlyDrift` + `MM.recordDrift`/`MM.driftText`，页面 5454-5486 原样保留）：依赖 `ai_model.js`/`monarch_model.js` 两份浏览器模块，且 `rowOf` 要读 `garrison.json` 的原始 LOYAL。搬 core 需先把「AI 武将忠诚漂移」「君主摘要」core 化（F-05/F-10 方向）；本轮只在 `MonthReport` 里提供 `fatigue`/`morale` 供页面接着算。
2. **段5「勢力存亡復核」`annualForceCheck()`**：只读巡检，要读 garrison/adj 与各势力城数，留在页面；core 的 `MonthSaveLike.forces` 只是占位、不碰。
3. **marchMode/AI 月**（`advanceArmies`、`marchSnapshot`、`handleMarchEvents`、`runAiMonth`、`resolveDefense`/`defendUrl` 守城战跳转）：属战役层/表现层，不在「内政月流水」范围；Cocos 对应 `CampaignRoot.advanceArmiesMonth()/runMapAi()`，同样未搬。
4. **页面壳**：`autosave()`、`render()`、`endMonth()` 包装、`?adv=N`/`?auto=1` 快进入口、按钮文案与战报 UI。
5. **Cocos 每月自治尚未真正启用**：需 lead 补 §3.3 的两段代码（`CityPanel` 注册桥 + `CampaignRoot` 传 `data`）后才会在月推进里跑自治/补学；在此之前 Cocos 月流水会显示 `civic.mode='skipped'`（**不静默**），年税/年结算/账本/疲劳/士气已生效。
6. **页面里 `tireMonthly/moraleMonthly/monthlyLearn/annualYearRollover` 的定义已不再被月流水调用**（保留是因为 `tests/fatigue.test.ts`、`tests/morale.test.ts` 从 campaign.html 抽 `[[FATIGUE_CORE]]`/`[[MORALE_CORE]]` 标记块对拍，且 `annualForceCheck` 仍被用）。等测试改成只锁 core 后可删这三处页面副本。
7. **Cocos 年度记录里的「將」数**：没有 `roster` 时退化数 `cities[*].officers`（web 用 roster），F-09 收档后统一。

---

## 7. 改动文件清单

| 文件 | 变更 |
|---|---|
| `game/src/core/advance_month.ts` | **新增**（879 行）：`advanceOneMonth` 流水线 + 年结算/年税/账本/疲劳/士气/补学/自治适配器 |
| `game/web/campaign.html` | import + `advanceMonth` 循环体改为调 `advanceOneMonth`（12 个月循环与 UI 保留） |
| `game/cocos/assets/scripts/GameState.ts` | `advanceMonth` 换实现（转调 core）+ `CityMonthBridge` 注册机制；删除白补守军 2% 段 |
| `game/cocos/assets/scripts/core/advance_month.ts` | `sync_core3.mjs` 镜像产物（33682 B） |
| `game/cocos/assets/scripts/core/advance_month.ts.meta` | 新增（uuid `9c0ab76b-7111-4825-84cf-5770f5490630`，照 `sango_rng.ts.meta` 格式） |
| `game/tests/advance_month.test.ts` | **新增** 15 条 |
| `game/tests/rows85.test.ts` | R5/R15 扫描目标改为 core 源（其余断言不动） |
| `work/month_pipeline/verify_web_adapter.mjs` | **新增**：用 `dist/core/advance_month.js` + web `CM.autonomyTick` 跑一月的端到端证据脚本 |

未碰（按纪律）：`game/cocos/assets/scripts/CampaignRoot.ts`、`CityPanel.ts`、`ItemsPanel.ts`，以及 `game/src/core/battle.ts`、`field.ts`、`army_cmd.ts`；全程未使用 git。

---

**结论**：`advanceOneMonth()` 已成为 web 与 Cocos 共用的月推进单源（换月 / 年度结算+年税+账本 / 自治代行+金→预备兵 / 疲劳士气 / 补学），F-03 在 web 侧闭环、Cocos 侧只剩 lead 按 §3.3 粘贴两段代码即闭环，F-04 的每月白补守军已两端消失，F-14 的年度结算与补学进入月流水并有测试锁定；Cocos 剩余的「城状态在独立键」由 F-09 收档后即可彻底去掉 `CityMonthBridge` 这层过渡。
