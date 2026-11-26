# Cocos 側「內政／大地圖 P1」移植報告（F4/F7/F10/F16/F19，F28 不適用）

任務：把 `internal-p1` 只改在 web 的 P1 六項，補到 Cocos 原生包（`game/cocos/assets/scripts/**`）。
本輪**沒有**跑 Cocos 構建、沒有起瀏覽器、**沒有 git 操作**；改動全部留在工作樹。

## 一句話結論

**F4、F7、F10、F16、F19 五項都已接進 Cocos 並可進包**（`tsc` exit 0、全量 `node --test` 1785 綠 / 0 紅、新契約測試 12/12 綠、編碼掃描 0 BAD）；**還差的兩點**：① F7 只做了「7 主令 + 2 副令、每令每月一次」的配額口徑，**沒有**移植 web 的 F2 逐將年令（`acted` + 選將抽屜）；② F14「守軍每月白補 2%」Cocos 仍保留（web 已刪，不在本次六項內）。F28 城旗在 Cocos 不存在（大地圖畫的是城點），色板已由 `MonarchModel` 對齊，**不適用**。

## 總覽

| 項 | web 真源 | Cocos 改點 | 語義一致？ | 驗證 |
|---|---|---|---|---|
| F4 內政終了＝一年 | `game/web/campaign.html:2517-2533` `endMonth()`、`5389-5558` `advanceMonth(n)` 循環 | `GameState.ts:803-821`（月數公式/單月開關）、`CampaignRoot.ts:2095-2140`（`endInterior()` 逐月循環）、`2147`（`doAction` 轉接）、`1900/1908/1969/1983/1998`（五處標題）、`income()` 年稅 | 是（逐月 12 次，非跳月份） | tsc + 契約測試 4 條 |
| F7 月令口徑 | `game/web/city_model.js:36-68`、`game/web/city.html:754-759`、`1217-1218` | `CityModel.ts:232/238`（7+2 命令表）、`1985-2016`（逐令配額）、`CityPanel.ts:187`（九宮）、`1328`（逐令閘門）、`1161-1240`（HUD/tips/hint） | 口徑一致；**少 F2 逐將年令** | tsc + 契約測試 3 條 |
| F10 自治施行 | `game/web/city_model.js:1655-1707` `runAutonomy()` | `CityModel.ts:1642-1652`（quiet+free 搜索）、`CityModel.ts` `cityMoneyOf/nationalGoldOf/addCityMoney` + `runAutonomy` 退款/國庫 | 是（只出人才日誌、不耗金不耗令） | tsc + 契約測試 1 條 |
| F16 國庫統一 | `game/web/city_model.js:786-894`、`campaign.html:5424-5426` | `GameState.ts:114-117/485/534-619`（`goldMigrated`、`migrateGoldInPlace`、`nationalGold/cityMoney/spendCityMoney/addCityMoney`）、`advanceMonth` 刪 `save.gold += income`、`recruit/develop` 扣本城 money；`CityPanel.ts:1172/1240`、`CampaignRoot.ts:2067/2462/3115/3528` 讀國庫 | 是（另含舊檔遷移） | tsc + 契約測試 2 條 |
| F19 武將上限 10 | `game/web/city_model.js:197-214`、`game/web/city.html:645-704` | `CityModel.ts:270-285`（`CITY_OFFICER_CAP`/`officerCapState`）、`CityPanel.ts:1163-1171`（`n / 10` 超編標紅、不裁切） | 是 | tsc + 契約測試 1 條 |
| F28 城旗/色板 | `game/web/campaign.html` `cityFlag()`/`FLAGS`/`FORCE_*` | **無改動**（Cocos 地圖畫城點，無城旗） | 不適用 | 契約測試 1 條（斷言 Cocos 無 `cityFlag(`） |

## 逐項

### F4 內政終了＝推進一年（用戶直接抱怨的那項）

- **web 真源**：`game/web/campaign.html:2517-2533` `endMonth()`：前置檢查（已開局／必須正月／本月未收束）→ `CM.markMonthActed(save, UNLIMITED)` → 兩行 pushLog（「內 政 終 了：本年內政窗口收束（原作 0x427FE0 → 0x41BBF5）」「大 地 圖：結束內政 → 跑完一年（…）」）→ `advanceMonth(12)`。`advanceMonth(n)` 在 `5389-5558`，`for (let i = 0; i < n; i++)` 逐月跑：月 +1、清月鎖、正月結年稅（進每城 `money`）、自治 tick、`advanceArmies`、`runAiMonth`、抵達/來攻事件，**不是**把月份直接 +12。
- **Cocos 改點**：
  - `GameState.ts:803-806` `monthsToNextJanuary(month)` = `12 - ((m - 1) % 12)`（正月→12、2 月→11、12 月→1）；`:810-816` `advSingleMonth()` 讀 localStorage 鍵 `sanguo_adv_single`（對照 web `?adv=1`，原生包沒有 URL 參數）；`:819-821` `advanceSteps(month)` 合流。
  - `CampaignRoot.ts:2095-2140` 新增 `private endInterior()`：`steps = GameState.advanceSteps(from)`，`for (let i = 0; i < steps; i += 1)` 每月依序 `GameState.advanceMonth(this.cities)` → `this.advanceArmiesMonth()` → `this.runMapAi()`（`spawnRaid` 兜底、`loadSave`、`recordAiBattleLog`、行軍日誌），循環後把逐月的 arrived/still/incoming 拼成 notes，push 兩行與 web 同文案的日誌，`hintText` 寫「跑完 N 個月（a 月 → b 月）· 稅入 +X 金」，再 refresh + `checkMonarchDeath()`。
  - `CampaignRoot.ts:2147`：`doAction('advance')` 整段舊單月邏輯（含 `ADVANCE_NOTICE` 提示）換成 `this.endInterior(); return;`。
  - `CampaignRoot.ts:1900/1908/1969/1983/1998`：五處行動標題由「推進一月」改「內 政 終 了」（caption「結束內政 · 跑完一年」／「結束內政 · 稅入 +N」）。
  - `income()`：由 `floor(pop/5000)*4` 改成與 web 年稅同口徑 `floor(pop*75/10000)+2250`，並用 `GameState.isGateCity(def)` 跳過關城（`isGateCity` 由私有改 export）。
- **語義**：逐字一致（同一個 12 次循環、同樣兩行日誌、同樣只進每城 money 不進單一錢包）。差異：web 在單月/`adv` 模式下有「第一場来攻就跳轉防守頁」的互動分支，Cocos 的 `endInterior()` 一律批量結算（與 web `batch` 路徑一致）。
- **驗證**：契約測試 4 條（web 真源仍含 `advanceMonth(12)`；`monthsToNextJanuary()` **被真的抽出來執行**，1→12、2→11、12→1、13→12、0/負數/NaN→12；`doAction` 走 `endInterior` 且循環內順序 advanceMonth→advanceArmiesMonth→runMapAi；`income()` 年稅公式）。

### F7 月令口徑（主令 7 + 副令 2）

- **web 真源**：`game/web/city_model.js:36-68`：`CMD_ORDER = ['搜索','開發','徵兵','任命','武將資料','自治','出征']`、`CMD_SECONDARY = ['情報','移動']`（副令不占月令）、`CMD_EXTRA = []`、`CMD_META` 9 條（`物品` 併進 `武將資料`）。`city.html:754-759` 七令進 `#grid`、副令進 `#subgrid`；`1217-1218` 出征會 `markMonthActed` 收束窗口。
- **Cocos 改點**：
  - `CityModel.ts:232` `CMD_ORDER` 改成 web 順序 7 條（原為 8 條九宮，把 移動/情報/物品 當主令）；`:238` 新增 `CMD_SECONDARY`；`CMD_EXTRA` 保留為空陣列；`CMD_META` 重寫 9 條、刪掉 `物品`。
  - `CityModel.ts:1985-2016`：`cmdOrderUsed(save, cmd)`（`cmdOrders[cmd] === save.month`）、`markCmdOrder`（副令不記、已記過回 false）、`ordersUsedCount`（數 `CMD_ORDER` 已用條數）、`clearCmdOrders`（換月清位，`ensureExtras` 每次載入都跑）。
  - `CityPanel.ts:187` `cmdList()` = `CMD_ORDER + CMD_SECONDARY`（7+2 = 正好九宮）；`:1328` `runCommand` 閘門從「整頁 `monthLocked`」改成「逐令」：`windowClosed || (!secondary && cmdOrderUsed(save, cmd))`；`:974/1201` 用過的令單獨變灰；`consume(cmd)` 改 `markCmdOrder`，`acted(cmd)` 傳命令名。
  - 副令不占月令：`cmdIntel()` 刪掉 `this.consume()`；`moveTo()` 成功只 persist+refresh；`appointTo()` 同（任命免費）。
  - 出征/自治仍會收束內政窗口（`markMonthActed`），照 web `1217-1218`。
  - HUD：`CityPanel.ts:1184` 「月令 n／7」、`:1233` hint、`:1240` band note。
- **語義**：口徑一致（主令每項每月一次、情報/移動不占）。**已知差異**：web 真源在 F7 之外還有 F2 逐將年令（`acted[名]=年序`，每將每年只能搜索/開發一次）+ 選將抽屜（`pickExec` free/used），本輪**未移植**（超出用戶指定的六項），Cocos 現在同一個將可在同月分別做搜索與開發。已在此報告標明，建議下一輪補。
- **驗證**：契約測試 3 條（命令表 deepEqual、配額 helper、CityPanel 九宮/閘門/情報不吃令/移動任命不吃令）。

### F10 自治施行

- **web 真源**：`game/web/city_model.js:1655-1707` `runAutonomy()`：對每座設定自治的城先 `search(..., { quiet:true })`（只寫人才日誌、不扣錢、不耗月令），再 `develop`（重擲至多 8 次讓 pop/def 都有進帳），退款進本城 money；回 `{ok, ran, skipped, gold: nationalGold, cost, text}`。
- **Cocos 改點**：`CityCtx` 加 `quiet?: boolean; free?: boolean;`；`CityModel.ts:1642` 每個自治城先 `search(save, def, Object.assign({}, ctx ?? {}, { quiet: true, free: true }))`，`:1644-1652` 只有 `kind === 'talent'` 時寫「自治搜索：X加入我方。」日誌；`search()` 內 free 時跳過金閘與扣款（cost 0）、quiet 時跳過普通搜索日誌但仍 bump 序列；重擲退款改 `addCityMoney`（進本城 money）；`gold` 回傳改 `nationalGoldOf`。
- **語義**：一致（不耗金、不耗月令、只出人才日誌）。Cocos 的自治城名單、`autoMonth` 會月推進邏輯沿用原有（`autonomyTick`）。
- **驗證**：契約測試 1 條。

### F16 國庫統一

- **web 真源**：`game/web/city_model.js:786-894`：`cityMoneyOf / nationalGold / spendCityMoney / migrateGold`；`campaign.html:5424-5426` 註明「國庫 = Σ 每城 money，舊碼 `save.gold += income` 已刪」。
- **Cocos 改點**：
  - `GameState.ts:114-117` `CampaignSave.goldMigrated?: boolean`；`:485` `normalize` 落 `goldMigrated: obj.goldMigrated === true`；`:547-568` `migrateGoldInPlace()`（已遷移直接回 `{moved:0}`；否則把舊錢包倒進第一座我方城 `money`，最後 `gold=0; goldMigrated=true`）；`:534` `loadSave()` 讀檔即遷移（舊檔自動無痛升級）；`:571-577` `migrateGold()`（冪等）；`:579-583` `cityMoney(name)`；`:586-592` `nationalGold()`（未遷移→舊錢包，已遷移→Σ 每城 money）；`:595-613` `spendCityMoney(name, cost)`（不夠回 false、不動欄位）；`:615-619` `addCityMoney`。
  - `advanceMonth()`：刪掉 `save.gold += income;`（年稅只進每城 `money`）。
  - `recruit(name)/develop(name)`（大地圖行動）：改扣本城 money，文案帶「本城 N 金」。
  - `CityModel.ts:2050/2061/2082/2106`：`cityMoneyOf / nationalGoldOf / spendCityMoney / addCityMoney`；`develop/recruit/search` 的金閘與扣款都改成本城 money。
  - UI：`CityPanel.ts:1172` 金格讀 `GameState.nationalGold()`、`:1240` band note 讀國庫；`CampaignRoot.ts:2462` 頂欄加「國庫 N 金」、`:2067` 城內頁關閉提示、`:3115` 兵團面板、`:3528` 君主視圖；大地圖的徵兵/開發按鈕改成「本城金」判定（`:1925/1926/1935/1936`）。
  - 存檔往返：`CityPanel.mergeSave()/persist()` 透傳並回寫 `goldMigrated`，`persist` 一律 `gs.gold = 0`。
- **語義**：一致（國庫＝Σ 每城 money、舊檔遷移一次、二次遷移 moved=0）。差異：web 是「第一次需要時才遷移」（`cityMoneyOf` lazy），Cocos 在 `loadSave()` 立即遷移——結果相同，但 Cocos 的 `CityModel.migrateGold` 保留給 parity 對拍用。
- **驗證**：契約測試 2 條（GameState 遷移/國庫/扣款/advanceMonth 不再寫 gold/recruit、develop 扣本城；CityPanel+CampaignRoot 存檔往返與 UI 讀國庫）。

### F19 武將上限

- **web 真源**：`game/web/city_model.js:197-214`：`CITY_OFFICER_CAP = 10`、`officerCapState(count) → {n, cap, over}`；`city.html:645-704` HUD 顯示 `13/10` 超編標紅、**不裁切**（劇本本身有 15/17 人的城）。
- **Cocos 改點**：`CityModel.ts:270-285` 新增常數與 `officerCapState`；`CityPanel.ts:1163-1171` 武將格 `n / cap`、`over` 用 `COLORS.danger`，**沒有**任何 `slice` 裁切。
- **語義**：一致。
- **驗證**：契約測試 1 條（`officerCapState()` **被真的執行**：9/10/13/-2 的回傳值逐個比對；含斷言無 `roster.slice(0, M.CITY_OFFICER_CAP)`）。

### F28 城旗／色板

- Cocos 大地圖**沒有城旗**：畫的是帶勢力色的城點（`cityTintOf`/`forceColorOf`），`armyFlagInk` 是**部隊**旗。web 的 `FLAGS` 4=方/2=三角、空城不插，在 Cocos 沒有對應物件。
- 色板（29 家固定色）已由 `MonarchModel` 的 `FORCE_*` 常量提供，與 web `Saves.FORCE_PALETTE` 同源。
- **結論：不適用**，未硬造城旗。契約測試 1 條守住「Cocos 不出現 `cityFlag(`/`FLAGS`、有 `cityTintOf`、MonarchModel 有 `FORCE_`」。

## 驗證結果

1. **tsc**：`cd F:\sanguo\game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` → **exit 0**（每階段都跑，最後一次在報告前）。
2. **node --test**：
   - 新檔 `game/tests/cocos_p1_port.test.ts`：**12 個 test 全綠**（F4×4、F7×3、F10×1、F16×2、F19×1、F28×1）。形式是「讀 Cocos 源碼做契約斷言」+ 「用 `evalFn()` 把純函數抽出來真的跑」（`monthsToNextJanuary`、`officerCapState`），不 import `cocos/**`（避 TS1287）。
   - 全量 `node --test tests/*.test.ts`：**tests 1786、pass 1785、fail 0、skipped 0、todo 1**（既有 web 側測試全數未破壞）。
3. **編碼**：`node work\enc\scan_utf8.mjs GameState.ts CityModel.ts CityPanel.ts CampaignRoot.ts tests/cocos_p1_port.test.ts` → `5 files, 0 BAD, 0 WARN, 5 clean -> OK`。

## 改了哪些檔

- `game/cocos/assets/scripts/GameState.ts`：F4 月數公式/單月開關、`isGateCity` export、F16 `goldMigrated`+遷移+四個錢口函式、`advanceMonth` 去 `gold`、`recruit/develop` 扣本城 money。
- `game/cocos/assets/scripts/CityModel.ts`：F7 命令表/配額、F16 錢口、F10 quiet/free 搜索、F19 上限常量。
- `game/cocos/assets/scripts/CityPanel.ts`：F7 九宮/逐令閘門/HUD、F16 國庫與存檔往返、F19 `n/10` 標紅、F10 自治文案。
- `game/cocos/assets/scripts/CampaignRoot.ts`：F4 `endInterior()` + 五處標題 + 年稅、F16 頂欄/城內頁/兵團/君主視圖/按鈕改讀國庫與本城金。
- `game/tests/cocos_p1_port.test.ts`（新增）：12 條 Cocos→web 契約測試。

## 沒做的項與已知差異

1. **F2 逐將年令 + 選將抽屜**（web `city_model.js:679-716`、`city.html:812-813`）：不在本次六項，未移植；Cocos 目前是「逐令」配額，同將同月可做不同主令。
2. **F14 守軍每月白補 2%**：web `campaign.html:5431-5435` 已刪（原作換月不補守軍），Cocos `advanceMonth` 仍保留該段（程式碼內註明已知差異），不在本次六項。
3. **F4 單月調試**：Cocos 用 localStorage `sanguo_adv_single=1` 代替 web 的 `?adv=1`（原生包無 URL）；web 的「第一場來攻跳防守頁」互動分支在 Cocos 批量路徑中不適用。
4. **Cocos 構建未跑**（依指示由 lead 跑）、未起瀏覽器/模擬器驗證；視覺層（月令灰格、`13/10` 紅字）只有源碼契約測試覆蓋。
