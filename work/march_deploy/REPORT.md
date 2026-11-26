# 出征編成 → 攻城戰 兩個原生包實機 bug 修復報告

- 任務：Cocos 原生包（MuMu `127.0.0.1:16384`，`com.sanguo.sango2`，正式版）實機發現的兩個 bug
- 復現路徑：`開始新局 → 討伐董卓 → 劉備 → 內政頁 → 出 征 → 選 樂陵 → 推進一月 → 攻 城 戰`
- 改動文件（只改這些）：
  - `game/cocos/assets/scripts/DeployRoot.ts`（Bug A）
  - `game/cocos/assets/scripts/CampaignRoot.ts`（Bug B）
  - `game/tests/march_deploy_ctx.test.ts`（新增，Bug A 契約）
  - `game/tests/march_troops.test.ts`（新增，Bug B 契約）
  - 未碰 `GameState.ts`、`core/**`、`web/**`、`SaveSlots.ts`、`BattleRoot.ts`；全程未用 git
- 結論：兩個 bug 都已修；新增測試 12/12 綠；相關既有測試 91/91 綠；全量 `node --test "tests/*.test.ts"` = **1886 tests / 1885 pass / 0 fail / 1 todo**（任務給的基線 1865/1864/1，多出來的是並行 agent 新增的測試，本次新增 12）；`tsc --noEmit`、`tsc -p cocos/tsconfig.check.json` 都 EXIT=0；`scan_utf8` = `4 files, 0 BAD, 0 WARN, 4 clean -> OK`。

---

## Bug A：出征編成屏主將/將列變成守方（張角 · 黃巾 · 守軍 110 兵）

### 症状

從平原出征打樂陵，進「出征編成」後：

- 主將卡 = `張角 · 黃巾 · 守軍 110 兵`
- 我方將列 = 張角 / 廖化 / 管輅 / 裴元紹 / 蔣義渠 / 杜遠（剛好是**守方**那組）
- 期望：主將與我方將列來自**出發城 平原**（存檔運行時名單，主將應是太守劉備）；敵方守軍/守將/關卡資訊才來自**目標城 樂陵**

### 根因（兩層）

**① 歷史層（直接原因）：DeployRoot 曾恆取 `scenarios[0]`**

P0-2 之前的 `DeployRoot.start()` 寫死 `data.scenarios[0]`，所以《討伐董卓》（劇本 index 1）讀到的是「黃巾之亂」劇本 0 的城市/守將。劇本 0 的平原守將正是 **張角/廖化/管輅/裴元紹/蔣義渠/杜遠**（`garrison.json` 劇本 0 平原，`garrison:232`），與實機截圖逐字吻合；連排序都吻合（STR+INT 降序：張角 151 > 廖化 144 > 管輅 128 > 裴元紹 113 = 蔣義渠 113 > 杜遠 101）。

- 證據 A1：從實機（r221 包，`lastUpdateTime=2026-11-26 12:14:13`）拉出的 APK 反編譯 `main-index.js:30005-30100` 已有 `this.scenIdx = scenarioIndex()`（P0-2 已進 r221 的編譯產物）；反編譯的 `generals.json` 資料也正確（劉備 `city_by_times[1]='平原'`）。→ 實機上「劇本 0 名單」的截圖是 **P0-2 之前的包（r219/r220 或更早）** 拍到的。
- 證據 A2：實機存檔（`adb run-as` 抽 `jsb.sqlite`）`sanguo_run_v1 = {"scenarioIndex":1,"playerForce":"劉備"}`，平原 `troops=244`（= `min(600, floor(335000/2500)+110)`；劇本 0 會是 232）→ 用存檔本身就能確定這局是劇本 1。

**② 現存殘留（本次修掉的）：就算 scenIdx 對了，我方池/主將排序還是會取錯**

- 我方候選池用 `generals.json` 的**靜態 `CITY` 欄位**（= 第 1 劇本快照）+ `save.owned` 做 fallback：
  `owned = rows.filter(gen => typeof gen.CITY === 'string' && save.owned.includes(gen.CITY))`。
  靜態 `CITY==='平原'` 的正是黃巾那組；只要前面 `atHome`（按 `city_by_times[scenIdx]` 過濾）拿到空集合，就會退回這組守方名單。
- 主將優先級 `majorOf()` 讀的是**目標城**（`scenario?.cities?.[this.targetCity.NAME]`）而不是出發城。樂陵是關卡、`major:''` ⇒ 太守優先整條失效，主將退化成 STR+INT 最高的人（劉備組裡是關羽 184；黃巾組裡就是張角 151）。這就是「主將不是劉備」的第二個根因。
- 這兩個問題與 `work/items_scenidx/REPORT.md` 是同一類 bug（面板吃 `generals.json` 靜態 `CITY`，物品頁也出現過張角），當時已建立唯一入口 `OfficersOfCity.ts`，但那張報告 §7 明確標注 **「DeployRoot.ts:397/399 `scenarios[0]`：戰場側（出陣部署），屬禁區，本次未動」**。本任務把它補上。

### 修法（行號為修完後的當前文件行號）

`game/cocos/assets/scripts/DeployRoot.ts`

| 位置 | 內容 |
| --- | --- |
| `:50` | 新增 `import { garrisonOf } from './core/garrison';`（出發城 garrison.json 名單作最後 fallback） |
| `:77` | 新增 `import * as O from './OfficersOfCity';` |
| `:88` | RunSetup 改 `{ playerForce as runPlayerForce, scenarioIndex as runScenarioIndex }`（拿玩家勢力給 `OfficersOfCity` 播種判斷） |
| `:515-517` | `const from = GameState.takeDeployFrom(); this.home = from ?? save.owned[0] ?? targetName;`（與 web `HOME = qs.from || save.owned[0] || target` 同口徑） |
| `:519-571` | **我方候選池重寫**：`OfficersOfCity.officerNamesOfCity(save, this.home, ctx)`（存檔運行時人事，與物品頁/內政頁同一入口）→ 退回「分劇本城市表 `city_by_times[scenIdx]===home`」→ 退回「garrison.json 出發城出戰名單」；**刪掉**靜態 `gen.CITY ∈ save.owned` 那條 fallback；`const major = this.majorOf(data, save, ctx)` 用出發城太守，太守優先、再 STR+INT 降序取 12 |
| `:932-951` | `majorOf(data, save, ctx)` 重寫：先 `O.cityMajorNameOf(save, this.home, ctx)`（存檔 runtime major，與物品頁/內政頁一致），再 `garrison.json` 的 `scenario?.cities?.[this.home]`；不再引用 `this.targetCity` |
| `:916` | `levelOf()` 註釋補明「generals.json 無 level 欄位，走分劇本起始等級表」（行為同 web） |

**不變的部分（敵方仍取目標城）**：

- `:480` 守軍 = `cityGarrisonTroops(data, this.scenIdx, this.targetCity.NAME)`（樂陵 110）
- `:505` 敵情 = `resolveEnemyIntel(data, this.scenIdx, this.targetCity.NAME, 100)`（沒人 setDeployEnemy 時）
- `:475-478` `targetCity` 仍是目標城；守城戰語義（`defenseArmyId`/`defenseFrom`）未動

`CampaignRoot` 的 march 分支本來就正確（本次未改，只由測試釘死）：

- `:2662` `GameState.setDeployArmy(null)`（進攻不能走 setDeployArmy，否則 DeployRoot 當守城戰）
- `:2666` **`GameState.setDeployFrom(siege.from)`（出發城）**
- `:2667` `GameState.setDeployTarget(selected)`（目標城）
- `:2675` `director.loadScene('Deploy')`

### 修好後的行為

平原（出發城，存檔 runtime roster = 關羽/劉備/張角/張飛/簡雍，major=劉備）→ 樂陵（目標城，關卡，守軍 110）：

- 主將卡：**劉備**（太守優先；不再是張角，也不是 STR+INT 最高的關羽）
- 我方將列：出發城平原的存檔運行時名單（黃巾那組廖化/裴元紹/杜遠不會出現）
- 敵方資訊：樂陵守軍 110、樂陵守將/關卡（守備隊）—— 仍是目標城
- `目標 樂陵 · 從 平原 出征 · 守軍 110 兵 · 上陣 N 兵` 這行本來就對，保留

---

## Bug B：城 244 兵，出征只有 5 兵

### 症状

平原城內 244 兵，出征後兵團只有 **5 兵**（實機戰報「我 軍 出 征：平原 → 樂陵（5 兵，…）」）。

### 根因

`Core` 的等級取值鏈路對**沒有 `level` 欄位**的武將一律回 1：

1. `game/cocos/assets/scripts/core/wises.ts:561-565`
   ```ts
   export function generalLevel(general: General): number {
     const lv = (general as General & { level?: number }).level;
     return typeof lv === 'number' && Number.isFinite(lv) && lv > 0 ? Math.floor(lv) : 1;
   }
   ```
2. `game/data`、`cocos assets/bundles/res/data` 的 `generals.json` **401 條全部沒有 `level` 欄位**（已用腳本核對）→ `generalLevel()` 恆回 1。
3. `CampaignRoot.armyGeneralLevel()` 走 `generalLevel(gen)` → 1。
4. `MonarchModel.troopCapOf(1)` = `max(1, min(1×5, 100))` = **5** → `dispatchArmyTo()` 的 `cap` 恆為 5。

原作/web 口徑（`game/web/campaign.html`）：`dispatchCapOf(name)` = `MM.troopCapOf(generalLevelOf(name))`，而 `generalLevelOf()` 先看存檔 override，再走 **`scenarioLevelOf()` 分劇本起始等級表**（`data/levels_by_scenario.json`，由 TIMES1..5 的 BaseEXP 反推）。劇本 1 的劉備 = **Lv2** → 上限 = `min(2×5,100)` = **10 兵**。5 這個數字是「等級被當成 1」的產物，不是設計常數。

### 修法（`game/cocos/assets/scripts/CampaignRoot.ts`）

| 位置 | 內容 |
| --- | --- |
| `:96` | 新增 `import { scenarioLevelOf } from './ScenarioLevels';`（分劇本起始等級，與 DeployRoot / web 同一份口徑） |
| `:3507-3526` | `armyGeneralLevel()` 重寫：`const own = generalLevel(gen); return scenarioLevelOf(gen.NAME, Math.max(1, own));`（表沒載入時退回舊行為 1，退化但不崩）；同時修正兵團面板顯示等級（`:3570`）與遭遇戰等級（`:3889`） |
| `:3770-3834` | `dispatchArmyTo()` 重寫出兵數：`const taken = Math.min(cap, Math.max(0, Math.round(garrison)))`；`troops: taken`；扣兵 `state.troops -= taken`；戰報/提示顯示 `taken`（不再顯示上限 `cap`）；只有 `taken < 1` 才提示「沒有兵可出征，先徵兵」 |

行為變化（有意為之）：

- 城兵 **≥** 上限：帶上限（與 web 一致）
- 城兵 **<** 上限：**全帶**（web 是「城兵 < 上限就禁用出征」；本作改成寬容版，手機上小城也能出征）
- 城兵 = 0：仍然拒絕（提示先徵兵）

### 修好後的數值

- 實機案例：城 244 兵 + 劉備 Lv2 ⇒ **10 兵**（不再是 5）
- 等級 L ⇒ 上限 `min(5L, 100)`，帶兵 = `min(上限, 城兵)`
- 等級 20 以上 ⇒ 上限 100；城兵不足上限 ⇒ 全帶
- **預備兵不計入出征池**：web 出征 `troopsOf(name)` 只讀 `save.cities[name].troops`（`campaign.html:1504`），本作 `dispatchArmyTo()` 同樣只讀 `this.troopsOf(from)`；預備兵是徵兵面板的池子，不是出征池

---

## 測試（常駐倉庫）

### `game/tests/march_deploy_ctx.test.ts`（Bug A，6 個 test，全綠）

源碼契約 + 純資料行為雙層（CampaignRoot/DeployRoot import `cc`，node 載不進來，沿用 `panels_roster_source.test.ts` / `march_arrival_contract.test.ts` 的既有做法；資料層直接跑 `OfficersOfCity.ts` 這支零依賴純模組 = 實機同一支程式）：

1. 實機存檔前提：劇本 1 平原 KING/MAJOR=劉備、244 兵；樂陵是關卡、守軍 110、MAJOR 空串
2. `CampaignRoot` march 分支：`setDeployFrom(siege.from)`（出發城）+ `setDeployTarget(selected)`（目標城）+ 敵情 `enemyIntelOf(selected)`，且都在 `loadScene('Deploy')` 之前；`setDeployArmy(null)` 防守城戰語義
3. `DeployRoot`：讀 `takeDeployFrom()` → `home`；我方池走 `O.officerNamesOfCity(save, this.home, ctx)`；不再有靜態 `gen.CITY ∈ save.owned` fallback；敵方仍 `cityGarrisonTroops/resolveEnemyIntel(..., targetCity.NAME)`
4. `majorOf`：用 `O.cityMajorNameOf(save, this.home, ctx)` 與 `scenario?.cities?.[this.home]`，不再引用 `this.targetCity`
5. 資料層行為：存檔 owned=['平原']、roster=平原 → 名單含劉備/關羽/張飛、不含廖化/裴元紹/杜遠；major=劉備；主將（太守優先）=劉備（反證：major 丟空會變關羽）；目標城樂陵名單為空、major 為空
6. 舊檔沒有 roster：按劇本 1 播種劉備組（劉備/關羽/張飛），不播劇本 0 的黃巾將

### `game/tests/march_troops.test.ts`（Bug B，6 個 test，全綠）

1. 根因：401 條 generals 沒有任何 `level` 欄位；`core/wises.generalLevel()` 的 fallback 回 1（讀源碼契約，因該檔 import 沒帶 `.ts` node ESM 載不進）；`troopCapOf(1)=5`
2. 分劇本起始等級：`levels_by_scenario` 劇本 1 預設 Lv2、劉備 Lv2（`deployed:true`） → `troopCapOf(2)=10`（≠5）
3. `armyGeneralLevel` 源碼改用 `scenarioLevelOf(gen.NAME, Math.max(1, own))`，不再直接回 `generalLevel(gen)`
4. `dispatchArmyTo` 源碼：`taken = min(cap, 城兵)`、`troops: taken`、只有 `taken < 1` 才拒絕、扣兵/戰報都用 `taken`；回歸檢查：不允許再出現 `troops: cap`、`if (garrison < cap)`、`守軍不足 ${cap} 兵`
5. 數字口徑：244 兵+Lv2 ⇒ 10（不是 5）；Lv10 ⇒ 50；Lv20/99 ⇒ 100；城 7 兵 ⇒ 全帶 7；城 0 ⇒ 0（拒絕）；不變量：帶兵 ≤ 城兵 且 ≤ 上限
6. 預備兵不計入：web `campaign.html:1504` `troopsOf()` 只讀 `city.troops`；Cocos 出征只讀 `this.troopsOf(from)`、源碼無 `prep`；web 上限口徑 `dispatchCapOf` = `MM.troopCapOf`

### 驗證結果

| 命令 | 結果 |
| --- | --- |
| `node --test tests/march_deploy_ctx.test.ts tests/march_troops.test.ts` | 12 tests / 12 pass / 0 fail |
| 既有相關測試 8 檔（`encounter_battle`、`deploy_cols_cocos`、`gate_target`、`cocos_p1_port`、`city_rules`、`troop_cap`、`affairs_f1f8`、`march_arrival_contract`） | 91 tests / 91 pass |
| `node --test "tests/*.test.ts"`（全量） | **1886 tests / 1885 pass / 0 fail / 1 todo**（基線 1865/1864/1，本次 +12 個新測試） |
| `tsc --noEmit` | EXIT=0 |
| `tsc -p cocos/tsconfig.check.json` | EXIT=0（首次曾因 `CampaignSave` 型別沒列 `roster` 報 TS2339，已用與 `rosterCtx()` 同款 cast 修掉） |
| `node work\enc\scan_utf8.mjs …4 個檔` | `scan: 4 files, 0 BAD, 0 WARN, 4 clean -> OK` |

---

## 真機復驗步驟（必須在裝置上跑一次）

環境：MuMu `127.0.0.1:16384`，包 `com.sanguo.sango2`，adb = `F:\devtools\android\sdk\platform-tools\adb.exe`。

1. **core 同步檢查（本次沒動 core，應無 stale）**
   `cd F:\sanguo; node work\cocos_sync\sync_core3.mjs --diff-only`
2. **重打原生包**
   `powershell -ExecutionPolicy Bypass -File F:\sanguo\tools\build_native.ps1`
   產物：`F:\sanguo\dist\android\sanguo-native.apk`；Cocos 打包會把 `assets/bundles/res/data/*.json` 一起帶進去
3. **安裝到 MuMu**
   `adb -s 127.0.0.1:16384 install -r F:\sanguo\dist\android\sanguo-native.apk`
4. **清存檔重來（要乾淨的開局才符合復現路徑）**
   `adb -s 127.0.0.1:16384 shell pm clear com.sanguo.sango2`（清 localStorage；不跑這步請確認裝置上的局是「討伐董卓/劉備」）
5. **操作**：`開始新局 → 討伐董卓 → 劉備 → 內政頁 → 出 征 → 選樂陵 → 推進一月 → 攻 城 戰`
6. **驗收 Bug A**（出征編成屏）：
   - 頂部：`目標 樂陵 · 從 平原 出征 · 守軍 110 兵`
   - 主將卡：`劉備`（不是 `張角 · 黃巾`），武/智/節操/等級 = 劉備資料、Lv2
   - 我方將列：平原存檔運行時名單（關羽/劉備/張角/張飛/簡雍；太守劉備排第一）；**不應出現**廖化/裴元紹/杜遠（劇本 0 平原守將）
   - 敵方卡：樂陵（關卡）守軍 110、無守將時走「守備隊/關卡」文案
7. **驗收 Bug B**（大地圖出征）：
   - 出征後兵團兵力 = **10 兵**（Lv2 劉備上限），不是 5、也不是全城 244
   - 戰報：`我 軍 出 征：平原 → 樂陵（10 兵，N 個月）`
   - 平原城兵 244 → 234（扣的是實際帶走的 10）
8. **存證（可選）**：
   - `node work\march_deploy\probe_device.mjs` → 讀裝置 `jsb.sqlite` 印出存檔；出征後看 `armies[0].troops === 10`、`cities.平原.troops === 234`
   - `adb logcat -v time | Select-String "R214|我 軍 出 征|DeployRoot"`

若主將卡仍顯示張角那組，排查順序：① 裝置上的包是否真是本次新包（`adb shell dumpsys package com.sanguo.sango2 | Select-String lastUpdateTime`）；② 存檔 `roster['平原']` 是否被舊資料污染（`probe_device.mjs` 可直接看）；③ 該局 `scenarioIndex` 是否為 1。

---

## 證據與附件（work/march_deploy/）

| 檔案 | 用途 |
| --- | --- |
| `probe_device.mjs` | 用 adb `run-as` 抽裝置 `databases/jsb.sqlite`，用 `node:sqlite` 解析，印 localStorage 存檔（本次核對 scenarioIndex/平原 244 兵/roster 就靠它） |
| `jsb.sqlite` | 實機存檔快照（含 `sanguo_run_v1`、`sanguo_campaign_v1`、`sanguo_monarch_seat_v1`） |
| `apk/installed-base.apk` | 從裝置拉下的 r221 安裝包（57,482,510 B） |
| `apk/main-index.js` | 反編譯/解壓出的 Cocos 主 JS bundle（62,366 行；`CampaignRoot`/`DeployRoot` 編譯後程式碼在 20674-20743 / 30005-30100 行） |
| `apk/imports-all/` | APK 內打包的資料資產（generals/scenarios/garrison/levels_by_scenario，Cocos import JSON 解包後） |
| `probe_levels.mjs` | 檢查 `levels_by_scenario.json` 結構（劇本 1 劉備 `{level:2, deployed:true}` 由此確認） |

## 本輪沒動 / 已知遺留（避免誤判）

- `GameState.ts` 的 `CampaignSave` 型別沒有 `roster` 鍵（實際存檔有，`normalize()` 白名單之外的鍵）；本次沿用 `CampaignRoot.rosterCtx()` 既有的 cast，不動 GameState。
- 平原 runtime roster 裡仍有「張角（未）」：這是 `work/items_scenidx/REPORT.md §6.2` 已記錄的遺留（張角 `city_by_times[1]===''` 會回落靜態 `CITY='平原'`），屬「劇本 0 殘留」的另一層；本次不擴大處理（不是本 bug 的觸發點），但用 `OfficersOfCity` 之後主將排序已由太守劉備釘住。
- `web/**` 未動；web 出征「城兵 < 上限就禁用」與本作「全帶」是有意分歧，測試註釋已寫明。
