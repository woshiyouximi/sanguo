# Cocos 內政頁（CityPanel）移植報告

> 任務：把 web 內政頁 `game/web/city.html` + `city_model.js` 移植進 Cocos，補 `project/66_原版對照複查.md` 的 **C4「無 CityRoot」** 缺口。
> 執行者：w3-cocos-city。日期：2026-11-25。
> 產出檔案：
> - `game/cocos/assets/scripts/CityModel.ts`（**1467 行**，新建）
> - `game/cocos/assets/scripts/CityPanel.ts`（**1142 行**，新建）
> - `game/cocos/assets/scripts/CampaignRoot.ts`（970 行，**+91 行**，只加入口與返回）
> - `work/cocos_city/parity.mjs`（對拍腳本）+ `work/cocos_city/parity_out.txt`（輸出留檔）
> - `work/cocos_city/panel_layout.md`（節點樹/尺寸/錨點/與 web 對應）

---

## §0 結論摘要

| 項目 | 結果 |
| --- | --- |
| 移植函數 | **61 個導出函數**（web 導出 58 個全部 1:1 + 從 `saves.js` 內聯的 `num/intOr/monthLabel`）+ **5 個同檔內部函數** + **20 個常量表** |
| parity 斷言 | **14988 條**，逐條 `JSON.stringify` 逐字節比對，**不一致 0**，`PARITY PASS`（30 個腳本輪次） |
| `tsc -p tsconfig.check.json --noEmit` | **EXIT=0**（`F:\sanguo\game\cocos`，含 `CityPanel.ts` 與 w4 的 `ItemsPanel.ts`） |
| 面板節點數 | **64 個**（1 根 + 1 背景 Graphics + 61 Label + 1 抽屜 Graphics） |
| **沒做到的** | **沒在 Cocos Creator 里跑過**（無實機、無截圖）；徵兵/移動/任命只有「快捷選項」沒有 web 那套數值分配；`?unlimited=1` 未搬；疲勞/士氣只讀默認值 → 詳見 §5 |

---

## §1 移植對照表（web 導出 → CityModel 導出）

### 1.1 兩個「檔案級」差異

| web | Cocos | 處理 |
| --- | --- | --- |
| `import { intOr, monthLabel, num } from './saves.js'` | Cocos 沒有 `saves.js` | 三個純函數**原樣內聯**進 `CityModel.ts` §0 並導出（`saves.js:31/37/57` 逐行照抄） |
| `import.meta.url` / `export default` | — | 沒有用到，無需適配 |
| `[...new Set(x)]` | `es2022` 目標本身支持 | 保留（K1/K6 的適配是 core 那邊的，與本檔無關） |

### 1.2 常量表（20 個，鍵序與 web 一致）

| web 導出 | CityModel.ts | 說明 |
| --- | --- | --- |
| `CMD_ORDER` | ✅ `const CMD_ORDER` | 8 條：開發/徵兵/搜索/移動/任命/物品/情報/出征 |
| `CMD_EXTRA` | ✅ | `['自治']` |
| `CMD_META` | ✅ | 9 鍵 `{tag, sub, cost}`，`tag` 用全角空格（開　發） |
| `INCR_GRADES` | ✅ | `['依據','推測','新設計']` |
| `INCR` | ✅ | 22 條增量（devGold 400 … effMax 0.25），每條 `{v, grade, src}` |
| `DEV` | ✅ | `{COST, POP, DEF, POP_CAP, DEF_CAP}` |
| `RECRUIT` | ✅ | `{COST, TROOPS, PREP_DIV 2500, PREP_BASE 110, CAP 600, PREP_GAIN_PCT 0.10, PREP_PER_TROOP 1}` |
| `ARMS` / `ARM_NAMES` | ✅ | `['inf','cav']` / `{inf:'步兵', cav:'騎兵'}` |
| `SEARCH` | ✅ | `{COST 200, MAX_LOG 60, WEIGHTS:{talent 30, treasure 25, talisman 20, none 25}}` |
| `MOVE` / `APPOINT` | ✅ | `{COST:0}` / `{COST:0}` |
| `EFF` | ✅ | `{DIV 400, MAX_BONUS 0.25}` |
| `PATH_SENTINEL` / `FLAG_GATE` | ✅ | `30000` / `1` |
| `BAG_KEY` / `DEFAULT_BAG` | ✅ | `'sanguo_items_v1'` / 12 件初始背包 |
| `AUTONOMY` | ✅ | `{CMD, TITLE, NO_CITY, DONE, ROW()}`，`ROW` 是函數 |
| `LOCK_HINT` / `UNLIMITED_HINT` | ✅ | `'本月已行動'` / 除錯提示 |

### 1.3 函數（web 導出 58 個 → Cocos 同簽名）

| 分組 | web 導出 → CityModel 導出 | 備註 |
| --- | --- | --- |
| 內聯工具 | （`saves.js`）→ `num` `intOr` `monthLabel` | **新增導出 3 個**；語義逐行照抄 |
| 增量表 | `incrVal` `incrRows` | |
| 隨機 | `hashSeed` `mulberry32` `searchSeed` | FNV-1a 32 位 + mulberry32，種子 `'search'|城|月|次數` |
| 兵額 | `troopCapOf` `prepCapOf` `levelOf` `troopMaxOf` `cavalryCapOf` `armCaps` | `prepCapOf === troopCapOf` |
| 城池資料 | `cityOf` `statusOf` `generalOf` `neighboursOf` `cityDefOf` `isGate` | `neighboursOf` 只認 `Length < 30000`、雙向去重 |
| 宮殿圖 | `hallIndexOf` `hallImageOf` | `pop >= 300000 → 6`，否則 `RATE` |
| 存檔整理 | `ensureExtras` `ensureCityState` | `ensureExtras` 就地洗 `roster/appointed/searchLog/foundItems/auto/lastActionMonth` |
| 預備兵 | `prepStateOf` `refillPrep` `enlist` | R12：步/騎分列，`n = min(want, armLeft, troopLeft, prep)` |
| 武將 | `cityStateOf` `rosterOf` `stationedNames` `wildPool` `majorOf` `wiseOf` `efficiencyOf` `wiseSkillsOf` `addToRoster` | `rosterOf` 按 STR+INT 降序、跳過盜賊、`_moved` 優先 |
| 日誌 | `logAdd` `recentLog` | 上限 60 條（`SEARCH.MAX_LOG`），`t` 缺省 `monthLabel(month)` |
| 命令 | `develop` `recruit` `search` `searchCount` `move` `deployTargets` `intel` `appoint` | `search` 自己寫日誌並回 `logged=true`；`move` 先走步兵再騎兵 |
| 自治 | `setAuto` `autoCities` `isAuto` `runAutonomy` `autonomyTick` | R10；`autonomyTick` 只在 `month > autoMonth` 時跑，順帶全城補預備兵 |
| 物品 | `searchPools` `ownedItemSeqs` `rememberFound` `parseItemsSave` `withBagItem` `itemsUrl` `deployUrl` | `ONLYONE` 已持有則跳過；`Force>0 && group===0 → talisman` |
| 月令 | `monthLocked` `markMonthActed` `clearMonthLock` | R8：一月一令；`unlimited` 只作除錯 |

**內部函數（同檔私有、不導出，web 也未導出）5 個**：
`cityRow`（情報行）、`detachGeneral`、`attachGeneral`（調將）、`pickWeightedKey`、`pickWeightedItem`（加權抽）。

**合計**：導出函數 61（58 + 3）+ 常量 20 + 內部函數 5 = **86 個頂層符號**。
web 導出 78 個 runtime key；TS 導出 81 個（+3 工具），parity 的 `ONLY_WEB` 檢查為空 —— **web 的每個導出都在**。

### 1.4 型別層（web 是 JS，Cocos 是 strict TS）

新增（只為型別，不改語義）：`CitySave` `CityState` `CityDef` `CityScenario` `CityCtx` `CityGeneral` `CityItem` `CityWise` `LogEntry` `Roster` `Appointed` `MoveOpts` `EnlistOpts` `DeployResult` 等。
`blankCityState()` 用 `NaN` 佔位，保證 `ensureCityState` 補默認值時**鍵序與 web 一致**
（`troops, pop, money, def, cav, inf, prep, prepMonth`）—— 鍵序會影響 `JSON.stringify` 的逐字節比對，所以這是刻意設計。

---

## §2 parity 輸出

腳本：`work/cocos_city/parity.mjs`（用 `tsc` 把 `CityModel.ts` 編成 CommonJS 到 `work/cocos_city/sim/`，
再用 node 同時 `import()` web 的 ESM 真源 `game/web/city_model.js` 與編出的 `sim/CityModel.js`）。

命令：`cd F:\sanguo; node work\cocos_city\parity.mjs`

```
[parity] 編譯完成：work\cocos_city\sim\CityModel.js

=== CityModel parity (web city_model.js vs Cocos CityModel.ts) ===
剧本：1，城 60 座，取样 10 座 × 3 种子 × 10 轮
命令覆盖：開發 / 徵兵 / 搜索 / 移動 / 任命 / 物品 / 情報 / 出征 + 自治 / 情報 / 月令 / 換月補兵
脚本轮次：30
断言数（每条都做 JSON.stringify 逐字节比对）：14988
不一致：0
耗时：219 ms

PARITY PASS — 全部逐字节一致
EXIT=0
```

覆蓋率（節選，全表在 `work/cocos_city/parity_out.txt`，共 128 類操作）：

```
開發                  300 次   成功    70
開發.again            300 次   成功    60
徵兵.enlist.inf       137 次   成功   137
徵兵.enlist.cav       163 次   成功    39
徵兵.recruit          300 次   成功    60
搜索.1                300 次   成功    60
移動→北平              60 次   成功     6
任命.major            159 次   成功   159
任命.wise             159 次   成功   159
auto.run               30 次   成功    30
auto.runAll            30 次   成功    30
tick.1                 30 次   成功    30
tick.prep.0            30 次   成功    30
```

**四道防線**：
1. **輸入同一份**：同一 `scenario.json`（劇本 1、60 城）＋ 同一 `ctx`（generals/items/wises 真資料）。
2. **亂數同一顆**：`search` 的結果依賴 `mulberry32(searchSeed(...))`，兩邊只要差一個 `Math.imul` 就會岔開 —— 30 輪 × 10 城都過，等於把 FNV-1a + mulberry32 的位運算全部驗過。
3. **`undefined` 不吞**：`JSON.stringify(undefined)` 是 `undefined`、`JSON.parse` 會炸，第一版就死在這裡；現在用 `ser()` 把 `undefined` 換成 `'\u0000undefined\u0000'` 占位，web 回 `undefined` 而 TS 回 `null` 也會被抓出來。
4. **成功分支也對拍**：覆蓋率表的「成功」列是 `{ok:true}` 的次數，避免只比到「金不足」這種失敗分支造成假綠燈。

---

## §3 面板節點樹與尺寸

完整表（含每個矩形的 x/y/w/h、節點局部座標、與 web DOM 的對應、兄弟序陷阱）在
**`work/cocos_city/panel_layout.md`**。這裡只列骨架：

```
CampaignRoot              750×1334  ← 場景原有
└── CityPanel             750×1334  anchor(.5,.5) pos(0,0)   [CityPanel 組件]
    ├── [0]  CityPanelBg      Graphics 750×1334   全屏底 / 標題帶 / HUD / 9 鈕 / 日誌區
    ├── [1..3]   CityPanelLbl  返回 / 城名 / 月份
    ├── [4..27]  CityPanelLbl  HUD 名 ×12 + 值 ×12
    ├── [28..45] CityPanelLbl  命令主標 ×9 + 副標 ×9
    ├── [46..47] CityPanelLbl  紀錄標題 / 月令態
    ├── [48..53] CityPanelLbl  日誌行 ×6
    ├── [54]     CityPanelLbl  底部提示
    ├── [55]     CityPanelSheet Graphics 750×1334  抽屜底板
    ├── [56]     CityPanelLbl  抽屜標題
    └── [57..62] CityPanelLbl  抽屜行 ×6（第 6 行固定「取　消」）
```

**共 64 個節點**＝1 根 + 1 Bg + 61 Label + 1 Sheet。

版面（設計座標 750×1334、左上原點、y 向下，全部經 `toLocal()` 落 `(x-375, 667-y)`）：

| 區塊 | 矩形 |
| --- | --- |
| 標題帶 | `{0,0,750,118}`；返回 `{18,26,104,64}`；城名 `{136,22,330,46}`；月份 `{470,26,262,42}` |
| 城池屬性 | `{18,126,714,340}`，2 列 × 6 行，行高 56、列寬 348 |
| 九個命令 | `{18,478,714,312}`，3×3，鈕 230×96，間距 12 |
| 結果日誌 | `{18,798,714,416}`，6 行 × 60 |
| 底部提示 | `{18,1222,714,56}` |
| 抽屜 | `{18,772,714,442}`，6 行 × 64 |

**零圖片**：面板全部用 `Graphics` 的 `rect/fill/stroke`（`cc.d.ts` stub 沒有 `roundRect`，所以是直角矩形 + 描邊），
顏色取自 `view/theme.ts` 的 `COLORS`（`panel/panelHi/bgDeep/gold/text/textDim/textFaint/oursLight/ok/danger`），
字體 `FONT_FAMILY` + `addOutline()`。
> 原本最適合當內政頁朝堂底圖的 `bundles/res/bg/policy/palais_01..05 + palais_yield`（2.12 MB）已被 lead 移到
> `game/cocos-park/res/` 以保住 20 MB 包體預算，所以**沒有用**。要恢復的話路徑是 `bundles/res/bg/policy/palais_03`（需 lead 先搬回）。

---

## §4 接線改動（file:line）

### 4.1 `game/cocos/assets/scripts/CampaignRoot.ts`（970 行，+91）

| file:line | 改動 |
| --- | --- |
| `CampaignRoot.ts:29` | `import { CityPanel } from './CityPanel';` |
| `CampaignRoot.ts:127-128` | 新欄位 `private cityPanel: CityPanel \| null = null;`（延遲建立，顯示/隱藏當頁面切換） |
| `CampaignRoot.ts:428-437` `select(name)` | 點到**自己的城**（`this.save.owned.includes(name)`）→ `this.openCityPanel(name); return;`，其餘照舊 `refresh()` |
| `CampaignRoot.ts:439-472` `openCityPanel(cityName)` | 首次 `new Node('CityPanel')`（`parent=this.node`、`layer=Layers.Enum.UI_2D`、`UITransform 750×1334`）→ `addComponent(CityPanel)`；`open({cityName, data, scenario: this.scenarioLike(), onClose, onDeploy})` |
| `CampaignRoot.ts:457-463` `onClose` | `this.save = GameState.loadSave()` → `cityPanel.hide()` → 提示「<城>：內政已更新（金 N）」→ `refresh()` **刷新大地圖** |
| `CampaignRoot.ts:464-470` `onDeploy` | 出征：`hide()` → `selected = target` → `doAction('march')`，沿用大地圖既有的敵情/出發城邏輯 |
| `CampaignRoot.ts:894-897` `onTouch` | 頂部 `if (this.cityPanel?.isOpen()) return;`（面板全屏，大地圖不吃點擊，防穿透） |

### 4.2 存檔分層（**重要工程決策**）

`GameState.ts:183-211 normalize()` 是**白名單**：城市只保留 `troops/pop/money`，未知頂層鍵一律丟掉。
所以 CityModel 需要的 `def/cav/inf/prep/prepMonth/roster/appointed/searchLog/foundItems/auto/autoMonth/lastActionMonth`
**不能**寫進 `sanguo_campaign_v1`（讀檔會消失）。

**處理**：不動 `GameState.ts`（不在我的所有權內），面板自己用第二個 key：

- `sanguo_campaign_v1`（GameState 真源）：`gold` `month` `owned` + 每城 `troops/pop/money` 三欄。
- `sanguo_city_v1`（`CityPanel.CITY_EXTRAS_KEY`）：`cities(def,cav,inf,prep,prepMonth)` + 上述內政欄位。

`mergeSave()`（`CityPanel.ts:428-467`）用 GameState 覆蓋同名欄合成 `CitySave`；
`persist()`（`CityPanel.ts:470-508`）反向寫回 GameState（`gold/month/owned/troops/pop/money`）→ `GameState.persistSave()` → 再寫 `sanguo_city_v1`。
好處：內政頁的改動在大地圖上**立刻可見**（兵/民/金同一份），而 `def/prep` 不會被 `normalize()` 清掉。

### 4.3 九條命令都真的走 CityModel（日誌是真實數字）

| 命令 | 走哪個 | 日誌文案（照抄 web） |
| --- | --- | --- |
| 開發 | `M.develop` | `人口增加 X 人，防禦力增加 Y。（金 -400）` / `金不足（需 N）。` / `人口飽和、防禦力最高了。` |
| 徵兵 | 抽屜 → `M.enlist({arm,n})` | `步兵 +N（預備兵 -N）。步 X／騎 Y，共 Z/600。` |
| 搜索 | `M.search`（自己寫日誌） | `找到物品X。` / `X將軍加入我方。` / `搜索一無所獲。` |
| 移動 | 抽屜（相鄰我方城）→ `M.move` | `→ 城：兵 N、將 K。` + `MOVE_REASON` 失敗映射 |
| 任命 | 兩層抽屜（太守/軍師 → 選將）→ `M.appoint` | `太守 X、軍師 Y。` |
| 物品 | 只讀抽屜（`M.parseItemsSave` 讀 `sanguo_items_v1`） | 背包 12 件列表；**不吃月令** |
| 情報 | `M.intel` 只讀抽屜，關掉才吃月令 | 本城/鄰城 12 行 |
| 出征 | `M.deployTargets` 抽屜 → `opts.onDeploy()` 交回大地圖 | `沒有可出征的鄰城。` |
| 自治 | 抽屜勾選 → `M.setAuto`；`▶ 施行自治` → `M.runAutonomy` | `${DONE}（N 城，-M 金）` |

月令（R8）：`runCommand` 入口先 `M.monthLocked(save,false)`，鎖住就寫
`本月已行動：一個月只能下一條命令，回大地圖「推進一月」再下達。` 並 return（**不吃**第二次月令）。
成功才 `M.markMonthActed` + `persist()` + `refresh()`；失敗只寫日誌，不吃月令（與 web `afterCommand(acted)` 一致）。
進面板先 `M.autonomyTick()`（換月補預備兵 + 自治代行），與 web `city.html` 開頁順序一致。

---

## §5 沒做到的（含風險）

1. **沒在 Cocos Creator 里跑過** —— 這是最大的一條。整個面板只有 `tsc --noEmit EXIT=0` 與 node 對拍兩種靜態證據：
   沒有啟動過 Creator、沒有進過 `campaign` 場景、沒有截圖、沒有真機/模擬器。
   風險點：中文字體（`FONT_FAMILY` 在 Creator 里若缺字會顯示方塊）、`Label.Overflow.SHRINK` 的實際縮放、
   `Graphics` 大量 `rect/fill` 的批次與幀率、`sanguo_city_v1` 首次建立時的舊檔相容。
2. **徵兵沒有 web 的數值分配**：web 是滑桿/輸入框分配步／騎（互斥上限 `maxOf(arm)`），
   Cocos 版只給「步兵 +maxInf」「騎兵 +maxCav」兩個快捷項（都按上限徵滿）。
   語義與數值都走 `M.enlist`，只是少了「徵一半」這種操作。
3. **移動/任命只有快捷選項**：移動固定「兵力帶一半」（`floor(troops/2)`）＋ 全部可調武將；任命是「先選職位再選將」的兩層抽屜，
   沒有 web 那種逐項勾選/複選框。抽屜最多 5 行（多的截斷），
   所以**城裡武將超過 4 人時，第 5 人起在任命抽屜裡看不到**（web 是滾動列表）。
4. **標題只顯示月份**：web 的 `#headSub` 是「劇本名 · 第x年x月」，Cocos 的 `CampaignScenario` 沒有 `system` 欄位，只顯示 `第1年1月`。
5. **疲勞/士氣是只讀默認值**：`save.tire` 缺省 0、`save.morale` 缺省 60，Cocos 側目前沒有任何邏輯產出這兩個數（web 也是顯示層默認），
   面板只做顯示與顏色閾值（≥60 hot、<30 cold），不會變。
6. **`?unlimited=1` 除錯開關沒搬**：面板固定 `monthLocked(save,false)`。
7. **沒有用朝堂背景圖**：`bg/policy`（PALAIS01..05 + YIELD，2.12 MB）被 lead 移到 `game/cocos-park/res/` 讓包體進 20 MB，
   面板走純 `Graphics`。要恢復需 lead 搬回 `bundles/res/bg/policy/`，路徑寫 `bundles/res/bg/policy/palais_03`。
8. **出征只做「選目標 → 交回大地圖」**：不直接 `startBattle` / 進 `Deploy` 場景，沿用 `CampaignRoot.doAction('march')`。
9. **物品命令是只讀**：只列背包（`parseItemsSave` + `items.json` 名稱），裝備/背包的寫入在外面的物品頁（w4 的 `ItemsPanel`，`sanguo_items_v1`）。
   兩邊寫同一把 key，若同幀都開著可能互相覆蓋 —— 但面板是全屏獨佔，實務上不會同時開。
10. **沒做舊檔遷移測試**：老存檔沒有 `sanguo_city_v1`，第一次進面板時 `def/prep/cav` 會用 `cityDef` 的
    `DEFENSE/POPULATION` 與 `troopCapOf(pop)` 初始化（`ensureCityState` 的默認路徑）；這條路徑在 parity 裡驗過語義，
    但**沒在真存檔上跑過**。
11. **`CampaignRoot.ts` 有併發編輯**：另一名 agent（w4-cocos-items）在同一支檔案裡加了 `ItemsPanel` 入口
    （`:38` import、`:112` 欄位、`:896` 穿透攔截、`:948` `openItems()`、`ITEMS_BUTTON`）。
    我的三處改動與它共存，`tsc EXIT=0` 是在**兩邊都改完之後**跑的；但這意味著這支檔案之後若被誰整檔覆寫，兩邊的入口都會丟。

---

## §6 復現方式

```powershell
# 1) 型別檢查
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit     # → EXIT=0

# 2) 對拍（會自動編譯 CityModel.ts 到 work/cocos_city/sim/）
cd F:\sanguo
node work\cocos_city\parity.mjs                                            # → PARITY PASS，14988 條
```

`tsconfig.check.json` 用「手寫 stub `types/cc.d.ts` + 引擎 `types/cc.engine.d.ts`」合併，
所以 `CityPanel.ts` 也能在沒有 Creator 的機器上跑 tsc —— 但這只證明型別，**不證明能渲染**。
