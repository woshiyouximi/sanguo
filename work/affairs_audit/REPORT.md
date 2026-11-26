# 内政九项「是否真接入」审计报告

- 审计人：affairs-audit（子代理）
- 日期：2026-11-26
- 范围：web 侧 `game/web/city_model.js`（1989 行）+ `game/web/city.html` + `game/web/campaign.html`；Cocos 侧 `game/cocos/assets/scripts/CityModel.ts` + `CityPanel.ts` + `CampaignRoot.ts` + `GameState.ts`。
- 方法：**只读代码 + 用 node 直接 import 两端纯逻辑模型跑探针**（不改 `game/**`），探针与报告只在 `work/affairs_audit/`。已确认两端模型都能脱离浏览器/引擎运行：web 导出 113 个符号，Cocos `CityModel.ts` 导出 112 个（Node v24.21.0 类型剥离）。
- 数据：`game/data/{scenarios,generals,items,wises,sango_system}.json`；默认剧本 0《黃巾之亂》（60 城、在野将 63 名、items 77 件）。
- 既有测试：`cd game; node --test tests/affairs_p1.test.ts tests/affairs_f13.test.ts tests/affairs_f14.test.ts tests/affairs_f2f3.test.ts tests/affairs_f1f8.test.ts` → **46/46 通过**（这些测试只覆盖 web 侧；Cocos 无对应测试）。

---

## 结论速览（一句话）

**web 侧九项全部接入（搜索真能搜到武将、真能搜到道具并进背包，其中 2 项有口径瑕疵：执行将不影响搜索结果、在野将回原城会消失）。Cocos 侧只有 3 条完整接入（任命/情報/上限）、5 条半接入（搜索/開發/徵兵/自治/移動各有缺件）、1 条明确分叉（大地图徵兵在敌情时走旧口径）；最重的 4 个 P0 是：搜索道具不进背包、钱→预备兵未移植、逐将年令/随军过滤未移植、换剧本后内政武将清单错位（现场「平原 3 將」= 剧本 0 的張角/廖化/裴元紹）。**

---

## 1. 九项总表

> 「入口」给 web/Cocos 两列；行号以当前仓库为准。✅=接入且与原作一致；⚠️=接入但口径分叉/数字不同；❌=未接入。

| # | 行为 | 入口（web / Cocos） | 实际效果 | web 接入 | Cocos 接入 | 与原作一致 | 缺陷 |
|---|------|--------------------|----------|:--:|:--:|-----------|------|
| 1 | **搜索** | web `city.html:1006 doSearch()` → `city_model.js:1358 search()`；Cocos `CityPanel.ts:1444 cmdSearch()` → `CityModel.ts:1238 search()` | 每次扣 **200 金**（成功才扣）；先掷 **50% 出武将**（本城在野池，抽到即 `save.roster[城]`），否则落**物品轮盘 25/20/25**（宝物/兵符/空手）；道具只写 `save.foundItems`，**web 由页面 `bagAdd()` 写进 localStorage 背包** | ✅ | ⚠️ | 概率表两端逐次相同；第一段 50% 与原作 0x48a260 表头(50,30,20)的 50 一致；第二段比例原作未定位 | **P0-1** Cocos 无 `bagAdd` → 搜到道具**不进背包、物品页看不到**；**P0-2** Cocos 换剧本后武将/在野池用剧本 0 数据；P1-3 执行将不影响结果；P2-1 重复道具日志 |
| 2 | **開發** | web `city.html:847 doDevelop()` → `city_model.js:1290 develop()`；Cocos `CityPanel.ts:1376 cmdDevelop()` → `CityModel.ts:1156 develop()` | **不扣金**（`DEV.COST=0`，金 0 也能成功）；`base=rand%3000+INT*100` 人口、`rand%12+STR*0.4` 防御，再按**太守 INT** `majorFactor` 缩放；夹到人口 100 万 / 防御 999；关城拒绝 | ✅ | ⚠️ | 一致（F12 不耗金、F20 上限已夹；逐将年令在 web UI） | **P1-1** Cocos 永远用太守算基数（无执行将概念）→ 数字不同；F9「无太守禁止开发」只在 web UI 拦 |
| 3 | **徵兵** | 钱→预备兵：web `city_model.js:973 prepFromMoney()`，由换月 `autonomyTick:1719` 调用（`campaign.html:5437` / `city.html:576`）；兵→步/骑：`city.html:881 doRecruit()` → `enlist:994`。Cocos `CityPanel.ts:1393 cmdEnlistSheet()` → `CityModel.ts` enlist，**无 prepFromMoney** | web：换月每城 `n=min(floor(money/100), prepCap−prep)`，`money−=n*100, prep+=n`（100 金 = 1 预备兵）；城内「部隊徵兵」抽屉把预备兵换成步/骑（**不花金**） | ✅ | ⚠️ | 一致（F13 公式、F15 抽屉均按原作） | **P0-3** Cocos 未移植 `prepFromMoney` → 钱永不自动变兵，只剩每月白补 10%（旧设计）+ 守军白补 2%；P2-5 骑兵上限默认 0 |
| 4 | **自治施行** | web `city.html:961 openAuto()` / 换月 `campaign.html:5437` → `city_model.js:1654 runAutonomy`、`1719 autonomyTick`；Cocos `CityPanel.ts:1318 dispatch` → `CityModel.ts:1611 runAutonomy`、`1702 autonomyTick` | 每自治城每月先**免费搜索一次**（`quiet+free`，搜到人才才写日志）、再**免费开发**（最多重掷 8 次避免 0/0）；只对 `save.auto` 里的城；`?loose=1` 才回到旧的 `refillPrep` 白补 10% | ✅ | ⚠️ | 部分：F10「宝物不显示」已按原作；对敌城/关也跑（见 P2-7） | Cocos autonomyTick 无 `prepFromMoney`、无 loose 开关（P0-3）；P2-7 全剧本城（含敌城/关）跑钱与开发 |
| 5 | **移動武將** | web `city.html:1036 openMove()` → `city_model.js:1451 move()`；Cocos `CityPanel.ts:1459 cmdMoveSheet/1485 moveTo` → `CityModel.ts:1345 move()` | 只相邻**我方**城；兵先步后骑、上限 600；调走太守/军师自动卸任；写 `save.roster._moved[将]=目标城`（**不写 `save.away`**；`away` 是 `save.armies` 的镜像，由 `campaign.html` 在出征/回城/退兵时 `syncAway` 重算）；`rosterOf` 同时过滤 `_moved` 与 `away` | ✅ | ⚠️ | 部分：移动是本作新增命令；away/归还在 web 接好 | **P0-5** Cocos 无 away/syncAway（F3 未移植）→ 随军武将仍能内政；**P1-4** 在野招来的将回原城会从 roster 消失且可再被搜到 |
| 6 | **太守·軍師任命** | web `city.html:1093 openAppoint()` → `city_model.js:1584 appoint()`；HUD `city.html:660-662`；Cocos `CityPanel.ts:1502 cmdAppointSheet/1533 appointTo` → `CityModel.ts:1528 appoint()` | 换太守后**立刻**影响开发/自治的缩放（`majorFactor(太守INT)`，实测 0.84/1.0 等）、搜索的**等级窗**（`searchLevelOf` 用太守等级）；军师只显示、**对任何内政公式无效果**；任命不占令 | ✅ | ✅ | 部分：原作军师对城政的作用待证 | **P2-4** 军师任命对开发/搜索/徵兵零加成；`efficiencyOf` 只做 HUD 显示 |
| 7 | **情報** | web `city.html:1133 openIntel()` → `city_model.js:1544 intel()`；Cocos `CityPanel.ts:1577 cmdIntel()` → `CityModel.ts:1470 intel()` | 只读：`self` 本城 8 栏 + `rows` 相邻城（3 条，含敌城/关）；**不写存档任何字段**、不占月令（F7） | ✅ | ✅ | 一致（只读、不占令）；「只有相邻城」待证 | **P2-6** 原作情报范围可能全图（待证） |
| 8 | **部隊徵兵 vs 大地图徵兵** | web 两条入口同一套：大地图按钮 `campaign.html:3854-3870` 非正月拒绝、正月 `location.href='city.html?city=..&cmd=recruit'` → `city.html:1326-1339` 弹 `doRecruit()` 抽屉。Cocos：无敌情时 `CampaignRoot.ts:2152`「內 政」→ CityPanel；**有敌情时 `1925/1935` 返回旧按钮「本城金 500 → 兵 +40 / 金 400 → 民 +3000」→ `2159-2171` `GameState.recruit/develop`** | web：两条入口同一套 P1 口径（城内抽屉、不花金、预备兵→兵）；Cocos：无敌情走城内页，有敌情走旧第三套口径（直接扣钱加数字） | ✅ | ❌ | web 一致（F15）；Cocos 分叉 | **P1-5** Cocos 大地图敌情分支仍是 500金/+40兵、400金/+3000民（F12/F15 未接入该分支） |
| 9 | **武將上限** | web `city_model.js:208 CITY_OFFICER_CAP=10`、`:211 officerCapState()`；HUD `city.html:667-673`、`campaign.html:2851`；Cocos `CityModel.ts:270-281`、`CityPanel.ts:1163` | 只**显示 N/10、超编标红**，**不拒绝、不裁切**；搜索到第 11/12 个照收（实测南皮搜完 9 在野 → 11/10 over:true）；剧本 1 洛陽/濮陽 15/15、剧本 3 江夏 17 等超编照原样载入 | ✅ | ✅ | 待证（原作 10 是差异表推断） | **P2-2** 上限只标红不拦；**P2-3** 关城可搜索（开发/徵兵被拒） |

---

## 2. 搜索专节（最重要）

### 2.1 一次搜索的随机表（代码原文口径，web/Cocos 同一张表）

```
count = save.searchSeq[城]            // 单调计数器；没有则从 searchLog 里数「搜索」条数
seed  = hash32('search', nonce, 城名, save.month, count)
rng   = mulberry32(seed)              // 不是 rand()%N，是「种子 RNG + 权重表」

pool  = wildPool(save, 城)            // 本城 status==='野' 且未在我方 roster/驻守名单里
if (pool.length > 0 && rng() < 0.5) { // ① 第一段：50% 出武将（池空则跳过）
    g = pool[ floor(rng() * pool.length) ]   // ② 池内均匀抽
    addToRoster(save, 城, g.NAME)            // 写 save.roster[城]（不写 captured、不改 generals）
    return { kind:'talent', general:g, text:`${g.NAME}將軍加入我方。` }
}
// ③ 物品轮盘：宝物/兵符/空手 = 25:20:25（对应池为空则该权重归零）
level = searchLevelOf(...)            // ctx.searchLevel → ctx.level → save.generalLevel[太守] → 太守等级 → 0(不套等级窗)
pools = searchPools(items, ctx.bag ∪ save.foundItems, level)  // 按 SearchType/Rate/等级窗/ONLYONE 过滤
kind  = pickWeightedKey({treasure:25, talisman:20, none:25}, rng)
if kind !== 'none':
    it = pickWeightedItem(pools[kind], rng, it => searchItemWeight(it, level))  // 池内按 Rate 加权
    rememberFound(save, it.Sequence)  // 只 push save.foundItems
    return { kind, seq, item, text:`找到物品${it.Name}。` }
return { kind:'none', text:'搜索一無所獲。' }
// 收尾：ctx.free!==true 才 spendCityMoney(200)；bumpSearchSeq；quiet!==true 才写日志
```

要点：
- **是权重表 + 种子 RNG**，不是 `rand()%N`；种子由（城、月、第几次搜、nonce）决定，同一存档同城同月重放结果可复现。
- 扣钱时机：**判定完成后**，`kind` 为 talent/treasure/talisman/none 都扣 200（失败才不扣）；`ctx.free=true` 不扣（自治搜索）。
- 概率出处：`city_model.js:216-241` 注释，原作第一段表 `0x48a260` 表头 `(50,30,20)`；代码解释为「格0 50%=武将分支，格1/2 30+20=50%=物品轮盘」，即**第一段实际 50/50**；物品轮盘第二段（宝物/兵符/空手）原作比例未定位，本作用 25/20/25。

### 2.2 200 次实测（南皮，剧本 0，9 名在野：沮授、郭圖、高覽、許攸、田豐、逢紀、審配、顏良、文醜）

`node work\affairs_audit\probe_search.mjs`

| 统计项 | web 实测 | Cocos 实测 | 说明 |
|---|---:|---:|---|
| talent（武将） | **9 / 200 = 4.5%** | 9 / 200 = 4.5% | 人才池只有 9 人，前 9 次出完后掏空 → 之后 191 次不可能出人 |
| treasure（宝物/马/Unique） | 58 / 200 = 29.0% | 58 / 200 = 29.0% | 含马、Unique 宝物 |
| talisman（兵符） | 62 / 200 = 31.0% | 62 / 200 = 31.0% | `SearchType 0` 且 Force/Battle>0 |
| none（一無所獲） | 71 / 200 = 35.5% | 71 / 200 = 35.5% | |
| fail（金不足等失败） | 0 | 0 | 200 金一次，钱 100000→60000 |
| 逐次判定/seed/人才名单 | — | **200/200 完全相同** | 两端 `SEARCH` 常量、判定顺序、RNG 全部相同 |
| 钱变化 | 100000 → **60000**（200 次 × 200） | 同 | 成功才扣 |
| `save.roster` | 9 人 | 9 人 | 武将进 roster |
| `save.captured` | 不存在 | 不存在 | **搜索不用 captured**（captured 是战后俘虏队列，main.js:1070 / campaign.html:4897） |
| 背包 | 模型层 `ctx.bag` 仍 12 件；页面层 `bagAdd` 后 **55 件** | localStorage 背包仍 **12 件**（13 件都不加） | **P0-1** |

**把人才池每次补满再跑 200 次（恒定池）**：

| 分支 | 实测 | 设计 |
|---|---:|---:|
| talent | 86 / 200 = **43.0%** | 50%（rng()<0.5）；种子序列非独立抽样，2σ 内 |
| treasure | 39 / 200 = 19.5% | 50% × 25/70 = 17.9% |
| talisman | 37 / 200 = 18.5% | 50% × 20/70 = 14.3% |
| none | 38 / 200 = 19.0% | 50% × 25/70 = 17.9% |
| 物品轮盘内部（条件于非人才） | **34.2% / 32.5% / 33.3%** | 35.7% / 28.6% / 35.7%（偏差来自池内 Rate 权重与池大小） |

**零在野城（代縣，100 次）**：talent **0**、treasure 24、talisman 31、none 45 → 无将城只能搜到物品，符合「池空跳过人才分支」的实现。

### 2.3 边界与去向（实测）

- 金边界：钱 199 → `{ok:false, reason:'gold', cost:200, money:199}`（不扣）；钱 200 → ok（扣到 0）。
- `ctx.free=true` 且金 0 → ok、不扣（自治搜索用）。
- **关城也能搜索**：易京（RATE=0）搜索 ok、钱 5000→4800（原是否有此限制未确认，P2-3）。
- 执行将（`ctx.exec`）对结果**零影响**：同一城、同月、同 count 下，`ctx.exec=關羽` 与 `張飛` seed 都是 `1820490841`、结果相同；`searchLevelOf` 只看太守等级。**选将只影响"谁占年令"，不影响搜到什么**（P1-3）。
- 搜到武将：`addToRoster` 只写 `save.roster[城]`；`generals.json` 里该将的 `status_by_times/city_by_times` **不变**；不直接改 `save.cities[*].officers`（web 大地图用 `rosterOf` 展示，Cocos GameState 是另一套数据，见 P2-11）。
- 搜到道具：模型层只写 `save.foundItems`（用于「已搜过」去重 + ONLYONE 过滤）；**web 页面层** `doSearch()` 成功且 `kind` 为 treasure/talisman 时调 `bagAdd(r.seq)`，写 `localStorage['sanguo_items_v1']`（与 `items.html` 同键同形状，物品页可见）；**没有 `save.items` 这个字段（全仓 0 命中）**。Cocos 没有这一步 → 物品页看不到（P0-1）。
- 重复物品：非 `ONLYONE` 物品可被反复搜到；120 次物品事件只有 46 个不同 Sequence（74 次重复）。`withBagItem` 去重 → 背包不变，但日志仍说「找到 X」（P2-1）。

---

## 3. 发现的问题（按严重度）

> 复跑命令一律在 `F:\sanguo` 下执行；`2>$null` 可滤掉 Node 的 `MODULE_TYPELESS_PACKAGE_JSON` warning。

### P0 —— 完全不生效 / 数据错位

**P0-1 Cocos 搜索道具不进背包（F「搜到的东西」未接入）**
- 证据：`CityPanel.ts:1444-1457 cmdSearch()` 只调 `M.search()` + `acted('搜索')`；全仓 `withBagItem` 只有定义（`CityModel.ts:1836-1841`）**0 调用**；`ItemsPanel.ts:92` 用 `ITEM_SAVE_KEY='sanguo_items_v1'`，`CityPanel.mergeSave:766-808` 的 `bag` 是进页旧值、搜索后不更新。
- 实测（模拟 Cocos 路径 200 次）：日志出现「找到物品鳳嘴刀」（鳳嘴刀=Sequence 21，非 ONLYONE），`save.foundItems` 含 21，但 localStorage 背包长度**仍是 12**；同样 200 次走 web 的 `bagAdd` 路径背包 12→55。
- 复跑：`node work\affairs_audit\probe_cocos.mjs`（第 2 节）。

**P0-2 Cocos 内政面板 `ctx.scenIdx` 硬编码 0 —— 换剧本后武将清单/在野池全错**
- 证据：`CityPanel.ts:672` `scenIdx: 0`；`CampaignRoot.ts:1364-1367` 明明有 `runScenarioIndex()`，`:2059-2062` `open` 时却没传；web `city.html:494` 按 `save.scenario` 取 `scenarioIndexOf`。
- 实测（`node work\affairs_audit\probe_scenidx.mjs`）：选《討伐董卓》（剧本 1）时，用同一份平原城態，
  - `scenIdx=0` → `rosterOf(平原) = 張角、廖化、裴元紹`（**正好 3 人 = 现场「平原 3 將」**），`wildPool = 杜遠、管輅、蔣義渠`；
  - 正确 `scenIdx=1` → `rosterOf(平原) = 關羽、劉備、張角、張飛、簡雍`（5 人），`wildPool = 淳于瓊、管輅、蔣義渠`。
- 影响：非剧本 0 的所有内政——武將數 HUD、任命/移動/搜将列表、搜索在野池（会搜到剧本 0 的人才）、`searchLevelOf` 的将等级全部错位；**現場 lead 看到的「平原 3 將」就是本 bug 的指纹**。
- 修法方向（供 lead 转给 cocos 负责人）：`open()` 入参补 `scenIdx`，由 `CampaignRoot.openCityPanel()` 传 `runScenarioIndex()`；或 `CityPanel.open()` 里读 RunSetup。

**P0-3 Cocos 无 `prepFromMoney`（F13 钱→预备兵未移植）**
- 证据：全仓 `prepFromMoney`/`PREP_PER_GOLD` 只在 `game/web/city_model.js:958/973`；Cocos 导出 112 个符号里这两个是 `undefined`；`CityModel.ts:1702-1727 autonomyTick` 逐城只 `refillPrep`（旧设计每月白补 10%，首月只记 prepMonth）。
- 实测：web 南皮 money 5000 / prep 100（cap 240）换月 → money **0**、prep **150**（n=min(50,140)）；Cocos 同条件 → money **5000 不动**、prep 100→**124**（次月起 +10%cap 白补、免费）。
- 复跑：`node work\affairs_audit\probe_cocos.mjs`（第 5 节）+ `node work\affairs_audit\probe_recruit.mjs`。

**P0-4 Cocos 把 F7 误读成「每条主令每月一次」——逐将年令整块未移植**
- lead 现场那句「搜索：本月已下過這條命令（每項每月一次）」出处：`CityPanel.ts:1318-1338 runCommand()` 闸门 `windowClosed || (!secondary && M.cmdOrderUsed(save,cmd))`；文案在 `:1328-1334`。规则注释在 `:973`、`:1297-1310`。
- 溯源：`CityPanel.ts:1300-1301` 自己写「web 是 CMD_ORDER 7 項各每月一次（city.html:754-759）」——**但 `city.html:754-759` 只是把 7 个按钮铺进 #grid**；web 真正的配额在 `city.html:794-803 afterCommand()`：`markActed(save, execName)`（**逐将年令** `save.acted[将]=年序`）或 `markMonthActed`（全局收窗口）。`CityModel.ts:1975-1976` 注释也自认「逐將年令那套……Cocos 這一版沒有移植」。
- 原作口径：`work/ref_pdf/sanguo2_guide.txt` L21-23「每年 1 月停下来管一次内政」、L43-44/L106-107「每个武将每年只能执行一次搜索或开发」；`work/flow_audit/内政大地图_差异.md` L88（F7）原意只是「指令集 9→7、情報/移動 不占月令」，**不是**每令月配额。
- 实测容量：web 平原 3 将 → 1 月最多 **3 次搜索/年**（每将一次，`markActed(張角)` 后另 2 人仍可下；month=13 解锁）；Cocos 同一年 12 个月各进一次内政 → **12 次搜索/年/城**、同一批将无限复用（无 `acted` 状态）。Cocos 还取消了正月门（`CampaignRoot.ts:2092`「所以不再有 web 的正月閘門」），而 `:2154` 注释仍写「逐將年令、正月窗口」自相矛盾。
- 复跑：`node work\affairs_audit\probe_cocos.mjs`（第 3b 节）。

**P0-5 Cocos 无 `save.away`/`syncAway`（F3 随军武将未接入）**
- 证据：Cocos 全仓无 `away/syncAway/armies` 相关实现（grep 0 命中；导出无 `awayNameSet/syncAway`；`CityPanel.mergeSave:766-808` 不含 armies）。web `city_model.js:726/740` `awayNameSet/syncAway` 由 `campaign.html:1466/2753/2971` 在出征/回城/退兵时重算。
- 影响：随军出征的武将仍会出现在城内 `rosterOf`、仍可做内政（原作/ web 都不允许）。

### P1 —— 数字不对 / 口径分叉

**P1-1 Cocos 开发公式永远用太守（无执行将）**
- 证据：`CityModel.ts:1167` `const exec = generalOf(ctx?.generals, majorOf(save, cityDef))`——`intel` 既算基数又做缩放；web `city_model.js:1290+` 是 `exec=ctx.exec||major` 算基数、`majorIntel` 做缩放。
- 实测（rng=0.5，人口/防御）：太守呂布42/執行呂布42 → web +4636/+38 = Cocos +4636/+38；太守諸葛亮100/執行呂布42 → web +6840/+55，**Cocos +13800/+39**；太守呂布42/執行諸葛亮100 → web +9354/+27，**Cocos +4636/+38**。
- 复跑：`node work\affairs_audit\probe_develop.mjs`。

**P1-2 Cocos `searchSeq` 不落盘 → 每城第 60 次后搜索种子冻结**
- 证据：`CityPanel.mergeSave:766-808` 不含 `searchSeq`；`persist:812-856` 也不写；`ensureExtras` 只能从 `searchLog`（`SEARCH.MAX_LOG=60` 截断）重算 → count 永远 =60。
- 实测：连续 65 次后 `searchSeq={南皮:65}`、searchLog 60 条；模拟重进内政页（无 searchSeq）→ `searchSeq={南皮:60}`、`searchCount=60`；重进后下一次 seed `1181641053` 与历史第 61 次 seed 相同 → 之后每次同结果。web 把 `searchSeq` 存进战役档（`city_model.js:1426-1444`）不会冻结。
- 复跑：`node work\affairs_audit\probe_cocos.mjs`（第 4 节）。

**P1-3 web 搜索的执行将不影响结果（选将只占年令）**
- 证据：`search()` 的 RNG 只用（城、月、count、nonce），`searchLevelOf` 用太守等级；`ctx.exec` 只被 `city.html` 用于选将/年令，模型搜人/搜物不引用。
- 实测：`ctx.exec=關羽` 与 `張飛` → seed 同为 `1820490841`、结果相同。
- 影响：玩家「选张飞搜索」与「选诸葛亮搜索」产出完全一样；与「搜索要用武将」的体感不符（原作是否按执行将智力/等级影响概率未定位，但至少 web 注释里 `searchWTalent=30` 已废弃，说明曾设计过）。

**P1-4 在野招来的将「回原城」会从 roster 消失且可再被搜索**
- 证据：`attachGeneral:1896-1913`：`home===city` 时 `delete _moved[name]` **并**从 `roster[city]` 移除 → 该将既不在 roster，也不再是 `_moved`，但 `wildPool` 又把它当在野。
- 实测：南皮招到紀靈 → 移到洛陽 → 移回南皮：`rosterOf(南皮)` 无、`_moved={}`、`save.roster[南皮]=undefined`、`wildPool` 重新出现紀靈 ⇒ 可再被搜到、可重复刷。驻守将（趙弘）往返正常。
- 复跑：`node work\affairs_audit\probe_move_appoint_intel_cap.mjs`。

**P1-5 Cocos 大地图「敌情」分支仍是旧第三套口径**
- 证据：`CampaignRoot.ts:1925/1935`（有敌军抵达/在路上时）返回 `{kind:'recruit', caption:'本城金 500 → 兵 +40'}`、`{kind:'develop', caption:'本城金 400 → 民 +3000'}`；`:2159-2171` 直接走 `GameState.recruit/develop`（`GameState.ts:867-889`）。无敌情时 `:2152-2156` 才进 CityPanel 走 P1 口径。
- 影响：被围/敌在途时，大地图徵兵/开发用的是 F12/F15 明令删除的旧口径（钱直接换数字）。

### P2 —— 表现差异 / 待证

1. **P2-1 重复道具日志**：非 ONLYONE 物品可反复搜到，日志说「找到 X」但 web 背包去重不变、Cocos 背包更不变。
2. **P2-2 武将上限只标红不拦**：`CITY_OFFICER_CAP=10`，`officerCapState` 只返回 `over`；南皮搜完 9 在野 → rosterOf=11、over:true，第 11 个照收；UI 标红（`city.html:667-673`、`campaign.html:2851`、`CityPanel.ts:1163`）。
3. **P2-3 关城可搜索**：易京（RATE=0）搜索 ok 且扣 200；开发被拒（`reason:'gate'`）、徵兵/部队容量也受限。原作是否禁止关城搜索未确认。
4. **P2-4 军师任命对任何内政公式无加成**：开发/搜索/徵兵公式均不引用 `wiseOf`；军师只用于 HUD 显示与兵团 advisor。原作城内政军师作用待证。
5. **P2-5 骑兵默认招不了**：`generals.json` 无 `level` 字段 → `levelOf` 返回 20 → `cavalryCapOf(20)=0` → `armCaps.cav=0`，`enlist('cav')` 返回 `arm-full`。要 `?lv=30+` 或将来做武将升级才有骑兵。另：人口上限 100 万 → `troopCapOf` 最高 `min(1000000/2500+110,600)=510`，600 上限实际不可达。
6. **P2-6 情報只列相邻城**（3 条），原作情报范围是否全图待证；只读、不占令已符合 F7。
7. **P2-7 自治越权/静默**：`runAutonomy`/`autonomyTick` 传全剧本 `scenarios.cities`（含敌城/关），模型层无 `save.owned` 校验（实测 `save.auto={北平:1}` 敌城也能跑 `+9103 人口/+34 防御`）；开发到人口 100 万+防御 999 后每月 `skipped:'saturated'`、0 条日志（`text` 仍「執行城市自治完畢!!（0 城：無可開發）」）。
8. **P2-8 Cocos F14 未删**：`GameState.ts:849-862` 守军每月白补 2%（注释自认是未修差异）；web F14 已删。
9. **P2-9 搜索第二段比例待证**：本作 25/20/25；原作 `0x48a260` 第二段（宝物/兵符/空手）比例未定位；若按 `(50,30,20)` 直读，则本作多了一档「空手」且宝物:兵符被摊平。第一段 50% 武将 = 原作 50 一致。
10. **P2-10 Cocos 无正月门**：`CampaignRoot` 的「內 政」按钮任意月份可进（web `city.html:538-553 readOnly()` 只有 1 月）。
11. **P2-11 搜到的将只进 CityModel 的 roster**：Cocos CityPanel.mergeSave:760-764 注释明说不碰 GameState.cities[*].officers；大地图/出征编成是否能看到这些新将，未见证据，待验证。

---

## 4. Cocos vs web 分叉（含搜索分叉单节）

### 4.1 搜索分叉（lead 三问的正面回答）

**① 规则出处：Cocos「主令每項每月一次」是移植时对 F7 的误读，不是原作规则。**
- 代码：`CityPanel.ts:973/1297-1310/1318-1338`、`CityModel.ts:1970-2032`（`isSecondaryCmd/cmdOrderUsed/markCmdOrder/ordersUsedCount/clearCmdOrders`）。
- 依据链：`CityPanel.ts:1300-1301` 把「`city.html:754-759` 把 7 条主令铺按钮」误当成「7 条主令各每月一次」；web 真正的限制是 `city.html:794-803 afterCommand()` → `markActed`（逐将年令，`save.acted[将]=年序`）+ `readOnly()`（只有正月）。
- 原作：每年只有 1 月内政、每将每年只能搜索或开发一次（guide L21-23、L43-44、L106-107）。F7 本意只是「7 主令 + 2 副令（情報/移動不占令）」。→ **结论：Cocos 这条是误读，且逐将年令整块未移植（`CityModel.ts:1975-1976` 自认）。**

**② 搜到的东西去哪（现场「找到物品鳳嘴刀」的落点）**
- 道具：`save.foundItems` 有（21 在列），**localStorage 背包没有**（仍 12 件）→ **物品页看不到**；Cocos 无 `bagAdd`/`withBagItem` 调用。若走 web 页面路径，`bagAdd(21)` 写 `sanguo_items_v1`，物品页可见（12→13 件起）。
- 武将：进 `save.roster[城]`（南皮 9 名：沮授、郭圖、高覽、許攸、田豐、逢紀、審配、顏良、文醜），`rosterOf=11`、HUD/任命/移動可见；**不进 `save.captured`**（该字段在 web 是战后俘虏队列，与搜索无关）；**不直接改 `generals.json`、不写 `GameState.cities[*].officers`**（Cocos 两套资料各管各的）。
- 附：Cocos 换剧本后连"搜到谁"都是错的（P0-2），现场剧本 1 平原搜到的是剧本 0 的在野将。

**③ 概率表两端对照（200 次双跑，同一城市同一初始状态，统计列）**

| 结果 | web 200 次 | Cocos 200 次 | 逐次是否一致 |
|---|---:|---:|---|
| talent | 9（4.5%） | 9（4.5%） | ✅ 200/200 |
| treasure | 58（29.0%） | 58（29.0%） | ✅ |
| talisman | 62（31.0%） | 62（31.0%） | ✅ |
| none | 71（35.5%） | 71（35.5%） | ✅ |
| 恒定池 talent | 86（43.0%） | 86（43.0%） | ✅ |
| 恒定池 宝/符/空 | 39/37/38 | 39/37/38 | ✅ |
| seed/结果逐次 | — | 与 web 完全相同 | ✅ |

→ **概率与判定两端是同一张表（`SEARCH` 常量逐字段相同、`search()` 逻辑逐行同），没有分叉**；分叉在**可达性**：Cocos 用剧本 0 武将池（P0-2）、Cocos 一年能搜 12 次（P0-4）、Cocos 道具进不了背包（P0-1）、Cocos 60 次后种子冻结（P1-2）。

### 4.2 其余分叉一览

| 项 | web | Cocos | 严重度 |
|---|---|---|---|
| 月令粒度 | 逐将年令 + 只有正月 | 每令每月一次 + 无正月门 | P0-4 |
| 随军过滤 | `away`/`syncAway`（campaign 调用） | 无 | P0-5 |
| 钱→预备兵 | `prepFromMoney`（换月/进页） | 无；每月白补 10% | P0-3 |
| 搜索道具入包 | `city.html:1026 bagAdd` → 物品页可见 | 无 | P0-1 |
| 剧本索引 | `scenarioIndexOf(save.scenario)` | `scenIdx: 0` 硬编码 | P0-2 |
| 开发公式 | 执行将算基数、太守缩放 | 全用太守 | P1-1 |
| 搜索序号 | 存 `save.searchSeq` | 不落盘，60 次后冻结 | P1-2 |
| 大地图徵兵/开发 | 一律跳城内页（F12/F15） | 无敌情时进城内页；**有敌情走 500金/+40兵、400金/+3000民** | P1-5 |
| 守军每月白补 | 已删（F14） | `GameState.advanceMonth:849-862` 仍 2% | P2-8 |
| 搜索概率 | 50% 人才 → 25/20/25 | 同一张表 | 无分叉 |
| 开发/开发上限 | 同参数 | 同参数（仅 base 用谁不同） | P1-1 |
| 武将上限 | 10，标红不拦 | 同 | 无分叉 |

---

## 5. 一句话结论

**内政九项在 web 侧全部真正接入（搜索确实能搜到武将、也能搜到道具并进背包，每次 200 金、概率是「50% 武将 + 物品轮盘 25/20/25」的权重表 + 种子 RNG）；Cocos 侧 3 条完整（任命/情報/上限）、5 条半接入（搜索/開發/徵兵/自治/移動）、1 条分叉（大地图徵兵敌情时走 500金/+40兵、400金/+3000民旧口径）；必须优先修的 4 个 P0：搜索道具不进背包、换月不扣钱不涨预备兵、逐将年令/随军过滤未移植、换剧本后内政武将清单错位（「平原 3 將」= 剧本 0 的張角/廖化/裴元紹）。**

---

## 附录 A：探针清单与复跑方法

全部在 `F:\sanguo` 下跑；`2>$null` 滤 Node warning。

| 探针 | 覆盖 | 命令 |
|---|---|---|
| `probe_search.mjs` | 搜索 200 次抽样、边界金、空池、执行将、seed | `node work\affairs_audit\probe_search.mjs` |
| `probe_develop.mjs` | 开发不扣金、上限夹、执行将/太守公式、关城、无太守 | `node work\affairs_audit\probe_develop.mjs` |
| `probe_recruit.mjs` | prepFromMoney、autonomyTick 换月、loose、enlist 各失败分支 | `node work\affairs_audit\probe_recruit.mjs` |
| `probe_autonomy.mjs` | 每城免费搜索+开发、日志只出人才、8 次重掷、上限静默、敌城 | `node work\affairs_audit\probe_autonomy.mjs` |
| `probe_move_appoint_intel_cap.mjs` | 移动/away/回城、任命 eff、情报只读、武将上限 | `node work\affairs_audit\probe_move_appoint_intel_cap.mjs` |
| `probe_cocos.mjs` | Cocos 月令/背包/概率双跑/种子冻结/F13/开发公式/旧口径 | `node work\affairs_audit\probe_cocos.mjs` |
| `probe_scenidx.mjs` | Cocos `scenIdx:0` 剧本错位（现场「平原 3 將」复现） | `node work\affairs_audit\probe_scenidx.mjs` |
| `lib.mjs` | 公共夹具：载入 data、按 city.html 启动顺序造存档、双端模型 | 被上面引用 |

对照材料：`work/ref_pdf/sanguo2_guide.txt`（L21-23/L43-44/L81/L106-107）、`work/flow_audit/内政大地图_差异.md`（F1–F30）、`game/data/*.json`。

