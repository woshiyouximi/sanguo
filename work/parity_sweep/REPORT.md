# Cocos ↔ web 逐對分叉矩陣（只讀對拍）

- 生成時間：2026-11-26 11:45（Asia/Shanghai）
- 對拍依據：**當前工作區代碼**（web `game/web/**`；Cocos `game/cocos/assets/scripts/**`；單源 `game/src/core/**`）。已含另一會話對戰場的改動與今天 11:25 落地的 Cocos 內政 P0 修復。
- 方法：逐對讀實作 → `work/check_parity.mjs` → `work/parity_num/run_all.mjs`（數值對拍）→ 交叉核對 `work/affairs_audit`、`work/internal_affairs`、`work/flow_audit`、`work/cocos_affairs_fix` 四份舊報告（過時處已按當前代碼重判）。
- 硬約束遵守：**未修改 `game/**` 任何文件、未 git、未起瀏覽器、未跑 Cocos 構建/模擬器**。所有產出只寫 `work/parity_sweep/`。
- 判定：`✓` 同口徑 / `⚠` 有差異但用戶不易察覺 / `✗` 明顯分叉（用戶會遇到）。
- 輔助腳本：`work/parity_sweep/scan_defs.mjs`（雙端定義名→行號，產 `defs.json`/`defs.txt`）、`work/parity_sweep/scan_storage.mjs`（localStorage 鍵掃描，產 `storage.json`）。

## 0. 摘要

- **✗ 共 14 條**（§2），⚠ 18 條。`game/src/core/**` 單源本身無分叉（check_parity core ✓ 23 文件一致）；**全部分叉都在「頁面/面板層」與「缺一整塊功能」**。
- 系統性根因只有 5 個，其餘都是它們的表現：
  1. **劇本號硬編碼 0**：Cocos 面板層 8 處 `garrisonOf(data, 0, …)`，同屏與內政頁/敵情數字自相矛盾（F-02）。
  2. **月推進流水線缺步驟**：Cocos 的 `GameState.advanceMonth` 只做「月份+1+年稅+2% 白補」，缺 `autonomyTick`（金→預備兵/自治）、`annualSettle`、`monthlyLearn`、`recordDrift`（F-03/F-04/F-14）。
  3. **「頁面層規則」雙抄**：站位、裝備加成、遭遇戰、俘虜勝者門 — core 已單源的部分 Cocos UI 沒接，core 沒收的部分各自發明（F-01/F-05/F-06/F-07/F-12）。
  4. **存檔容器/版本分裂**：web 單容器 v3 快照 vs Cocos 索引+per-slot 原始鍵組，無遷移（F-09/F-10）。
  5. **整塊功能缺席**：結局面板（web 缺）、大地圖/內政/編成/道具 BGM 與鍵盤（Cocos 缺）（F-08/F-11/F-13）。
- **最該先做的 3 件事**（詳見 §6）：①先修 F-02（一個 `scenIdx` 穿透改動，覆蓋 8 處，修完 2/3 劇本才可玩）；②把月推進流水線收成一支共享函數並雙端接線（F-03/F-04/F-14 一次清 3 條）；③把「俘虜處置門 + 裝備加成」收進 core 並讓 UI 只調用（F-01/F-05，兩者都是「core 有、UI 沒接」型，改動風險低、用戶體感強）。

## 1. 總表（16 對）

> 每對下列出功能點；`證據` 均為「當前代碼」行號。web 路徑省略 `game/web/` 前綴，Cocos 省略 `game/cocos/assets/scripts/` 前綴。

### 1.1 Pair 1 — `CampaignRoot.ts` + `CityListPanel.ts` + `ForcesPanel.ts` ↔ `campaign.html`

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 地圖/城節點渲染與點擊 | drawMap@3598、cell@2848 | drawMap@2670、drawFrame@2567 | ✓ | — |
| 我方城動作集（內政/徵兵/開發/出征/推進一月） | render@2789-2824（徵兵/開發已改「進城走內政頁」，舊 500 金/400 金口徑已刪） | actions@1904-1960、doAction@2156-2262（註解@2168-2181 同步） | ✓ | — |
| 敵城動作（出征/情報） | render@2804-2814、cityInfoOf@1582 | actions 敵城分支、defaultHint@2501-2525 | ✓ | — |
| 城市信息卡（勢力/太守/守將） | cityInfoOf@1582-1594 + 卡 | cityCard@2534-2554 | ✗ | 非黃巾劇本顯示別劇本的守將/勢力（F-02） |
| 敵情/守軍估算 | enemySetup@4229、defenderOf@4204 | enemyIntelOf@2009-2026 | ✓ | —（同一屏內與城市卡矛盾，見 F-02） |
| 兵團指令 5 項（武將/改道/駐紮/軍師/入城） | renderArmySheet@3124-3165 | openArmyMenu@3114-3144、runArmyCommand@3152-3172 | ✓ | — |
| 兵團行軍/遭遇 | advanceArmies@1213、handleMarchEvents@4578 | advanceArmiesMonth@3402-3469 | ⚠ | 遭遇戰處理方式完全不同（F-06） |
| 勢力一覽/明細 | renderForceSheet@2366-2382 | ForcesPanel.ts（forceListRows@349、drawMap@929） | ⚠ | Cocos 有地圖高亮/篩選，web 只有抽屜列表 |
| 城市列表面板 | 無（只在大地圖格上瀏覽） | CityListPanel.ts（setFilter@498、setSort@504、翻頁@510-516） | ⚠ | Cocos 多一個篩選/排序/翻頁面板，web 無 |
| 頂欄（紀年/國庫/戰績/勢力） | render@2751-2770 + era.js eraText | refresh@2457-2489 + SaveSlots.adYearOfMonth@528 | ✓ | — |
| 戰報 | renderLog@2874、pushLog@4031 | storeBattleLog@3849、drawBattleLog@3939、翻頁@3984 | ✓ | — |
| 存/讀檔入口 | openSaveSheet@2103 | openSaveSlots@3724 | ⚠ | 槽語義相反（F-10） |
| 勢力滅亡/結局 | forceExtinct@2540-2558（只提示、繼續玩） | checkMonarchDeath@4094、EndingPanel | ✗ | web 滅國無收尾（F-08） |
| 月推進 | advanceMonth@5389-5558 | endInterior@2110 + GameState.advanceMonth@831 | ✗ | 少補兵/自治/年結算/補學（F-03/F-04/F-14） |

### 1.2 Pair 2 — `CityPanel.ts` + `CityModel.ts` ↔ `city.html` + `city_model.js`

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 命令集 7+2 | city_model.js:47/53/56 CMD_ORDER/CMD_SECONDARY | CityModel.ts:244/250/256 同值；CityPanel.cmdList@186 | ✓ | — |
| 正月窗口/只讀門 | readOnly@545-549、hint@550-553 | CityModel.readOnly@2195、isAffairsMonth@2183 | ✓ | 文案略異 |
| 月令鎖 | monthLocked@1967/markMonthActed@1974/clearMonthLock@1981 | CityModel.ts:2052/2059/2066（逐字相同） | ✓ | — |
| 逐將年令 actedLocked | actedLocked@659/markActed@665 | CityModel.ts:2109/2115 | ✓ | — |
| 搜索（執行將/種子/兩段式/行囊） | doSearch@1006、search@1358、withBagItem@1866 | CityPanel cmdSearch + CityModel.search（同式）、bagAdd@1360-1367 | ✓ | — |
| 開發（執行將/公式/不耗金） | doDevelop@847（無太守拒）、develop@1290 | cmdDevelop + CityModel.develop@1230-1260 | ✓ | 順序差（先加值 vs 先扣金）在 COST=0 時無感 |
| 徵兵/預備兵/金→兵 | doRecruit@881、enlist@994、prepFromMoney@973 | CityModel.prepFromMoney@939、enlist@994 | ✓ | — |
| 裝備/物品 | 武將資料→「使用物品」→items.html | cmdItems 直開 ItemsPanel | ⚠ | Cocos 少「武將數值總覽」一屏 |
| 自治/進頁補跑 | city.html:576 autonomyTick | CityPanel.ts:691-692 autonomyTick | ✓ | — |
| 武將上限（F19） | officerCapState@211 | CityModel.ts:277-291 | ✓ | 兩端都是軟限制（只標紅） |
| 移動/任命/情報/出征 | openMove@1036、openAppoint@1093、openIntel@1133、openDeploy@1199 | cmd*Sheet（CityPanel） | ✓ | — |
| 裝備加成顯示 | 名冊/卡加 eqb | 不顯示 | ✗ | F-05 |

### 1.3 Pair 3 — `DeployRoot.ts` ↔ `deploy.html`

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 編成隊列/武將/兵種/陣形 | deploy.html render@657、queue 邏輯 | DeployRoot refresh@940、drawQueue@1353 | ✓ | — |
| 等級上限/步騎拆兵 | applyMarchCap@469、rerollCaps@487 | DeployRoot.ts:479-480、totalToColumns@899 | ✓ | — |
| **前/中/後列站位** | COL_KEY@548、loadCols@552、applyCols@568、saveCols@563、colOf@566；出征 URL `?cols=`@916/950；`main.js:564` 解析、`main.js:680` `col: cfg.cols[name] \|\| 'mid'` | **無**（全庫無站位欄位/鍵；grep 只命中 grid 欄數） | ✗ | web 可把武將放前/中/後排決定挨打順序，Cocos 沒有（F-07） |
| 軍師選擇 | 編成頁選 + 出征 URL `?wise=`（encounterUrl@4521） | 可選，但不隨 URL 傳（只提示玩家在編成屏選） | ⚠ | 契約不同，行為大致等價 |
| 出征落庫（扣城兵/建軍團） | commitMarchTroops@632 → writeSaveBoth@597 | DeployRoot.march@1572 → persistQueue@1334 → GameState.addArmy | ✓ | — |
| 站位記憶持久化鍵 | `sanguo_deploy_cols_v1`（deploy.html:548/554/564） | 無 | ✗ | 同 F-07 |
| 頁面 BGM | deploy.html:1001 `bgm('map')` | 無 | ✗ | 靜音（F-11） |

### 1.4 Pair 4 — `ItemsPanel.ts` ↔ `items.html` + `items_model.js`

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 存檔鍵與 schema | items_model.js:275 `EQUIP_KEY='sanguo_items_v1'`，註解@266-272 `{equip:{將:{槽:seq}}, bag:[seq]}` | ItemsPanel.ts:92 `ITEM_SAVE_KEY='sanguo_items_v1'`、readItemsSave@346、writeItemsSave@381（同 shape） | ✓ | 存儲層相容 |
| 背包/裝備/卸下 | setEquip@599、toggleEquip@616 | ItemsPanel setEquip@1183、toggleEquip@1215 | ✓ | — |
| 可裝備武將池/過濾 | campaignOwned@317、renderGen@395 | pickPool@390-402（排除盜賊/只在 owned 城/STR+INT 前 12） | ✓ | — |
| **裝備加成進入屬性** | equipNamesOf@1731、equipBonusOf@1750-1756、statsOf@1762-1770、syncEquipFromBag@1779-1797 | **無**（GameState 只聲明/正規化 equip 欄位，全庫無消費點；GeneralBook.mergeRow@399-429 用 rec 原值） | ✗ | 穿了武器數值不變（F-05） |
| **裝備加成進入戰場參數** | encounterUrl@4521-4524 astr/aint、enemySetup@4806-4807 | BattleLoadout 只從 generals 表查（DeployRoot@1586-1607、GameState.startBattle@961-971） | ✗ | 同 F-05 |
| 兵種/陣形解鎖（core） | core unlock 單源 | 同 core | ✓ | — |
| 頁面 BGM | items.html:667 | 無 | ✗ | 靜音（F-11） |

### 1.5 Pair 5 — `GeneralBookPanel.ts` + `GeneralBook.ts` ↔ campaign.html「武將資料」

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 名冊來源/排序 | generalRowsAll@2424-2451（本勢力優先→城→勢力） | GeneralBook.buildBook@439、mergeRow@362-430、sortBook@464 | ⚠ | 分組/排序規則不同（Cocos 未登場/俘虜/在野分組） |
| 欄位集合 | 武/智/忠/士氣/疲勞/裝備加成/城/勢力 | 武/智/級/忠/氣/疲/城/勢力/勢力旗色/技能/體技兵/兵種馬書 | ⚠ | 各有一半對方沒有的欄位 |
| 裝備加成 | 有（+eqb.STR/INT） | 無 | ✗ | F-05 的顯示面 |
| 分頁/篩選/分組 | 無分頁（直接長列表） | setGroup@733/setForceFilter@743/pageCount@820 | ⚠ | Cocos 瀏覽體驗更好 |
| 單將卡入口（兵團指令→武將資料） | openGeneralSheetOf@2499（單將卡） | runArmyCommand 'general'→openGeneralBook（打開名冊） | ⚠ | Cocos 多一次翻頁 |
| 未登場武將可見性 | 不列（只列 garrison 在城者） | 列（含未登場） | ⚠ | 兩端名冊總數不同 |

### 1.6 Pair 6 — `SurrenderPanel.ts` + `SurrenderModel.ts` + `core/capture` ↔ campaign.html `settleBattleReturn`/`aiDisposeCaptives`

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| core 候選/擲骰 | core/capture.ts resolvePostBattle@397 單源 | 同 core | ✓ | — |
| **勝者門（戰敗不得處置）** | core/roster.ts `surrenderCandidates` 首行 `if (opts.won === false) return []`；`campaign.html:4892 if (!won) return aiDisposeCaptives(...)` | SurrenderModel.ts:286-317 `contextOf/stateOf` 調 `surrenderCandidates(...,{atCity,mine,king})` **不傳 won**；`needSurrenderPanel(cards)` 也無 won；CampaignRoot.ts:1445-1458 只 `if (hasPendingCaptures)` 即彈窗 | ✗ | 打輸也可處置俘虜（F-01） |
| **敗方（我方戰敗）AI 處置+戰報** | aiDisposeCaptives@4935-4960（planAiDisposal→applyAiDisposal→逐將戰報/noteGeneralResult） | **無**（grep `planAiDisposal\|applyAiDisposal` 在 Cocos 0 命中） | ✗ | 我方被俘將領不會被敵軍處理/無戰報（F-01） |
| 冪等門（同一戰不重複彈） | campaign.html:4888-4889 `save.lastPost.ai===true && lastPost.battleTs===outcome.ts` | lastPost 無 ai/battleTs 欄位（SurrenderModel.finishOf@561-615 只寫 city/joined/dead/…/ts） | ✗ | 重進大地圖可能重複彈處置（F-01） |
| 空卡不彈 | needSurrenderPanel(cards,{won}) | stateOf 空卡回 null、hasPending@672 | ✓ | — |
| 面板分頁/單卡/整批 | renderSurrender@5239、openSurrenderSheet@5254、bulk@5272、finish@5286 | SurrenderPanel pageCount@554/onDecide@763/onBulk@776/finish@784 | ✓ | — |
| 招降落庫/戰報五行 | finishSurrender@5286、noteGeneralResult | finishOf@561-615（applySurrender + noteGeneralResult(false) + logsOf@510） | ✓ | — |
| 君主逃走卡 | core kingCardOf | 同 core | ✓ | — |
| atCity 劇本號 | `garrisonNames(home)` 走 currentScenarioIdx | CampaignRoot.ts:1446 用 `sci`（正確），但 SurrenderModel.ts:297 缺省 `?? 0` | ⚠ | 主路徑正確，缺省是潛在雷 |

### 1.7 Pair 7 — `SaveSlots.ts` ↔ `saves.js` + 各頁存讀檔 UI

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 槽數/名稱長度/meta | SLOT_COUNT=10@45、SLOT_NAME_MAX | SaveSlots.ts:50/52、SlotMeta@87-104 | ✓ | — |
| 手動存檔語義 | saveToSlot@1990-2008：**不改自動存檔目標**（註解@2000-2001，project/89 4b） | saveToSlot@394-425：存完把 `index.active` 指到該槽（註解@390-392 自認與 web 相反） | ✗ | 手動存到槽 5 後，下月自動存檔也跑到槽 5（F-10） |
| 自動存檔目標 | writeSlotAuto(store, n-1) 每次寫「當前槽」+ legacy 鏡像 | 只寫單一 `sanguo_campaign_v1`，槽不自動更新 | ✗ | Cocos 槽越放越舊（F-10） |
| 讀檔 | loadSlot@2010-2039 原地換 save | loadFromSlot@433-458 換 live 鍵 + `GameState.resetCache()` + 整場景重載（openSaveSlots@3724-3739） | ⚠ | Cocos 較慢但一致 |
| 刪槽/改名 | clearSlot@1053 / renameSlot@1065（UI 刪除被 SLOT_DELETE_UI=false 藏起） | deleteSlot@461 / renameSlot@483（**無改名輸入 UI**，SaveSlots.ts:13 自述） | ⚠ | Cocos 不能給存檔改名 |
| 戰鬥結果寫回 | main.js writeBackCampaign@1050-1160 直寫 `sanguo_campaign_v1`，啟動時與槽 snapshot 比 ts 後 sync（campaign.html:1848-1860） | BattleRoot.ts:313-326 `recordBattleResult`+`persistSave`（單鍵即主檔，無需 sync） | ✓ | 機制不同、結果一致（但存檔格式見 Pair 16） |

### 1.8 Pair 8 — `MonarchPanel.ts` + `MonarchModel.ts` ↔ `monarch_model.js`

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 模型函數集 | monarch_model.js 34 exports | MonarchModel.ts 45 exports＝web 全含＋旗色/測試種子 | ✓ | — |
| 繼承評分 | successionScore@246 `blood*10000+loyal*100+str+int` | @399 逐字相同 | ✓ | — |
| 讓位候選/落庫 | openThroneSheet@2334、doAbdicate@2354 | MonarchPanel openAbdicate@514、pickAbdicate@704、commitMonarch（CampaignRoot@3585） | ✓ | — |
| 君主卡 12 格 | openMonarchSheet@2320、monarchCardHtml@2287 | MonarchPanel.applyCard@431 | ✓ | — |
| 勢力一覽/明細 | renderForceSheet@2366、renderForceDetail@2385 | forceRoster/forceDetail@496、openForces@500 | ⚠ | Cocos 有地圖高亮 |
| 君主死亡/繼承 | forceExtinct@2540-2558（只提示） | detectMonarchDeath@4052、commitSuccession@4137、繼承窗 + EndingPanel | ✗ | web 無滿屏結局/繼承重開（F-08） |
| 忠誠漂移摘要 | AI.monthlyDrift + MM.recordDrift@5500 + driftText 頂欄 | `recordDrift` 在 MonarchModel 存在但**月推進不呼叫** | ⚠ | Cocos 無「本月忠誠漂移」摘要（F-14 子項） |
| 存儲位置 | 進 save.factions/monarch | 另存 `sanguo_monarch_v1`（MonarchPanel.ts:56） | ⚠ | 雙端存檔格式不同（F-09） |

### 1.9 Pair 9 — `AiModel.ts` + `AiRunner.ts` ↔ `ai_model.js`

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 模型導出集 | ai_model.js 89 exports | AiModel.ts 89 exports，零差異 | ✓ | — |
| 月流水 7 步 | campaign.html runAiMonth@4097-4182（buildWorld→planMonth→executeMonth→resolveBattle→checkForceDeaths→applyWorld） | AiRunner.runMonth@426-619（檔頭@4-14 自述一一對應） | ✓ | — |
| 數值對拍 | work/parity_num unit2：2258 條/296742 字段 0 不一致 | 同 | ✓ | — |
| RNG 來源 | executeMonth@4127、resolveBattle@4152 用 `Math.random` | seedRng((month+1)*7919)（AiRunner.ts:465），決定性 | ⚠ | Cocos 同存檔同結果、web 每次不同（不可復現） |
| AI 守軍/勢力初值 | garrisonIn→currentScenarioIdx（campaign.html:924） | runMapAi@2330 `garrisonOf(data, 0, …)` | ✗ | AI 打的是劇本 0 的城防（F-02） |
| incoming 敵襲→守城戰 | @4145-4150 收 incoming | @2357-2373 建 side:'B' Army | ✓ | — |
| 勢力滅亡檢測 | checkForceDeaths→forceExtinct@4172 | checkForceDeaths→applyWorld→storeMonarchExtinct | ✓ | — |
| 除錯口子（?kinds/?maxacts/?forceatk） | 有 | 無 | ⚠ | 只影響除錯 |

### 1.10 Pair 10 — `ScenarioSelect.ts` + `TitlePanel.ts` + `EndingPanel.ts` ↔ campaign.html 開局/結局

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 主標題/存檔清單首頁 | 無（首訪直接 `Saves.newCampaign(SCEN[0])`@1873-1878） | TitlePanel.show@111、buildTitle@288、buildSaves@344 | ⚠ | web 開機就進大地圖，沒有標題頁 |
| 劇本/勢力選擇 | showPicker('scenario'/'king')@2561/2578、pendingScenario@987 | ScenarioSelect.show@135、buildScenarioPage@355、buildForcePage@435 | ✓ | 入口不同、功能對等 |
| 起始年（F5） | startNewGame@2652 `Era.setAnchor(Saves.startYearOf(save))` | startYearOfScenario@1141 | ✓ | — |
| **結局判定+畫面** | **無**（grep `結局\|ending\|統一\|gameover` 在 web 0 命中） | EndingModel.endingOf@446-470、EndingPanel.show@222 | ✗ | web 一統天下/滅國都沒有結尾（F-08） |
| 統一勝利判定 | 無 | `ownedCount>=TOTAL_CITIES`→'unify' | ✗ | 同 F-08 |
| 滅國處理 | forceExtinct@2540-2558 只 notice、遊戲繼續 | EndingPanel（fall/monarch、fall/no-city） | ✗ | 同 F-08 |
| 結局重開 | 無 | EndingPanel.restart@611 | ✗ | 同 F-08 |
| 截圖 demo 槽 | `?demo=1` seedDemoSlots@2678 | 無 | ⚠ | 僅截圖用 |

### 1.11 Pair 11 — `AudioHost.ts` ↔ `audio.js`

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 大地圖 BGM | campaign.html:5575 `bgm('map')` | 無（AudioHost 只被 BattleRoot.ts:32 import） | ✗ | Cocos 大地圖全程靜音（F-11） |
| 內政 BGM（按城數 5 檔） | city.html:1289 `bgm('domestic:'+owned)` + audio.js:196/221 | 無 | ✗ | 同 F-11 |
| 菜單/編成/道具 BGM | deploy.html:1001、items.html:667 | 無 | ✗ | 同 F-11 |
| 戰鬥 BGM/地形底噪/技能音 | audio.js battleAmbience@3-20、magic(seq) | AudioHost playBattleAmbience@269/playMagic@321、BattleRoot pump@346-352 | ✓ | — |
| 音效節流/預算 | audio.js SFX 併發控制 | AudioHost SFX_PER_TICK=2、stats.throttled | ✓ | — |
| 靜音/手勢解鎖 | audio.js mute/unlock@633-641 | AudioHost.setMuted@381（僅戰鬥） | ⚠ | Cocos 無全局靜音入口 |
| 資產清單 | assets/audio/index.json | AudioHost AUDIO_MANIFEST@12（10 曲、內嵌 11.56MB、TERRAIN_TRACK@100 對齊 web audio.js:38） | ✓ | — |

### 1.12 Pair 12 — `GameState.ts` ↔ `era.js` + `saves.js` + campaign.html

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 月+1/年稅 | advanceMonth@5389-5416（pop*75/10000+2250，關隘跳過） | GameState.advanceMonth@831-848（同式） | ✓ | — |
| **金→預備兵（F13）** | advanceMonth@5444 autonomyTick（每月無條件） | autonomyTick 只在進內政頁時跑（CityPanel.ts:691-692） | ✗ | 不進內政頁就不會把金轉成預備兵（F-03） |
| **自治開發（F10）** | 同上（每月） | 同上 | ✗ | 自治城不發展（F-03） |
| **守軍每月白補 2%（F14）** | 已刪（campaign.html:5431-5435 註解） | GameState.ts:854-862 仍在（不分敵我、全劇本城） | ✗ | 攻城越拖守軍越多（F-04） |
| 疲勞/士氣月度漂移 | tireMonthly@5462、moraleMonthly@5465 | AiModel.monthlyDrift（AiRunner 第 7 步）照顧 AI 側 | ⚠ | 覆蓋範圍不同（我方將疲勞是否漂移待核） |
| 忠誠漂移摘要 | recordDrift@5500 + driftText log | 不呼叫 | ⚠ | 同 Pair 8 |
| 補學 monthlyLearn | @5512 寫 save.learned | 無（CampaignRoot.ts:3092 註解自認） | ⚠ | 少數學技能少一條養成路徑/日誌 |
| 年度結算 annualSettle/ledger | annualYearRollover@4833-4843 → saves.js:1690 | 無 | ✗ | Cocos 存檔無 ledger/年度摘要（F-14） |
| 月份鎖 clear | clearMonthLock@5398 | 不呼（month+1 後 self-stale） | ✓ | 等價 |
| 紀年顯示 | era.js eraText@150 `西元 X年 Y月` | CampaignRoot.refresh@2457 + adYearOfMonth@528 同格式 | ✓ | — |
| 時間錨點 | Era.setAnchor(Saves.startYearOf)@1897/2652 | startYearOfScenario@1141 + this.startYear | ✓ | — |

### 1.13 Pair 13 — 出征經濟（`CampaignRoot` march/dispatch） ↔ `march_flow.js` + `deploy.html` + campaign.html 抵達分支

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 兵力池口徑 | cityPoolOf@59-68（troops+prep）+ fieldCapOf@74-78 | dispatchArmyTo@3338-3389 只取 `troopsOf(from)`，cap=troopCapOf(level) | ✗ | 預備兵不能隨出征帶走（F-12） |
| 出征扣城兵 | takeFromCity@89-112（先 troops 後 prep、不足拒） | @3375-3377 `troops=max(0,round(troops-cap))`（只 troops） | ⚠ | 扣法不同（同 F-12） |
| **路上遭遇戰** | startEncounter@4544-4558 開真戰鬥頁（encounterUrl@4507-4536）；batch 才 resolveEncounter@4563 | advanceArmiesMonth@3402-3469：`Math.random()` 自動結算（勝方留一半），註解@3391-3401 標 [新設計] | ✗ | Cocos 沒有路上野戰體驗（F-06） |
| 駐紮/阻擋 | toggleStation@3264、planArmyMoves@1391 | toggleStation@3246、stationStandoff@3402-3469 | ✓ | — |
| 抵達城下→攻城/守城 | handleMarchEvents@4578、defendUrl@4300 | doAction defend/march + loadScene('Deploy')（@2186-2260） | ✓ | — |
| 兵團改道/入城/回城 | applyRetarget@3324、enterCity@3107 | applyRetarget@3205、enterCityForArmy@3303 | ✓ | — |
| 主將選擇 | commander@4211 | leaderOf@3472（`garrisonOf(data, 0, city)`） | ✗ | 非黃巾劇本主將選錯（F-02） |
| 軍師 URL 契約 | encounterUrl 帶 `?wise=<seq>` | 只提示玩家在編成屏選 | ⚠ | 行為等價、契約不同 |
| 戰後兵力回寫 | main.js writeBackCampaign 回寫 troops + casualtySplitOf@139 | recordBattleResult@1140-1172 只寫勝敗/城/軍團移除 | ⚠ 待核 | 若 Cocos 不回寫，戰損不生效（§7.2 T-1） |

### 1.14 Pair 14 — 觸屏/按鍵輸入 ↔ web 鍵盤 `1-8/A-H` 與點擊

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 大地圖/內政/編成 點擊 | 全 DOM onclick | 各面板 hit 測試 | ✓ | — |
| 戰鬥點擊/選技能/選目標 | main.js 點擊處理 | BattleInput TOUCH_END@679/TOUCH_MOVE@835 | ✓ | — |
| **戰鬥鍵盤快捷鍵** | main.js:1564-1605：1-8 選技、A/S/D/F/G/H 命令、Shift+1-6 兵團令、Space 開戰、R 重開、Esc 取消 | **無任何鍵盤事件**（只有 CampaignRoot.ts:3054 註解提到 web 的 keydown） | ✗ | Cocos 桌面端無快捷鍵（F-13） |
| 大地圖 Esc 退出選點 | campaign.html:3810-3812、右鍵@3645 | 面板取消按鈕 | ⚠ | 鍵位不同 |

### 1.15 Pair 15 — 字體/佈局/縮放（750×1334 豎屏） ↔ 瀏覽器 CSS

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 設計尺寸/縮放 | `#stage` 750×1334@campaign.html:17、fit()@563-575 scale+置中 | DESIGN_W/H=750/1334（SaveSlots.ts:38-41 等各面板） | ✓ | — |
| 地圖區高度 | 地圖 canvas 750×900@293 | drawFrame@2567 底圖適配 | ⚠ | 比例略有差（待核） |
| 頂欄/命令卡/內政 12 格 | campaign.html 頂欄、city.html:317-341 chips | refresh@2457、CityPanel R_HUD@123-126 註解@117-118 逐項對齊 | ✓ | — |
| 字體 | CSS font stack + 自繪字 | Cocos FONT_FAMILY + Label | ⚠ | 字形/字距不同（不易察覺） |
| 安全區/瀏海 | fit() 置中 | Widget/Canvas 適配 | ⚠ | 端機差異 |

### 1.16 Pair 16 — 存檔遷移/版本號 ↔ 同

| 功能點 | web 實現 | Cocos 實現 | 判定 | 用戶可見影響 |
|---|---|---|---|---|
| 快照版本 | `SNAPSHOT_VERSION=3`@saves.js:56、snapshotVersionOf@227、snapshotIsCurrent@263、upgradeSnapshot@277-279 | **無版本號/無遷移**（SaveSlots.ts:13 自述「不做 web 的 v3 快照結構、不做存檔格式遷移」） | ✗ | 舊槽不能升級（F-09） |
| legacy 遷移 | readLegacy@1081、writeLegacy@1091、migrateLegacy@1111（舊 `sanguo_campaign_v1`→槽 1） | 無（只認自己的 payload） | ✗ | 同 F-09 |
| 跨端互通 | 容器 `sanguo_saves_v1 = {v,last,slots[10]}` | `sanguo_slots_v1` 索引 + `sanguo_slot_payload_v1_<n>` 原始鍵組 | ✗ | web 存檔 Cocos 讀不到、反之亦然（F-09） |
| 槽 payload 鍵集 | snapshot 自帶全部欄位 | CAMPAIGN_KEYS@60-68 缺 `sanguo_run_v1`/`_fresh`/`_adv_single` | ⚠ | 讀檔不換 run 狀態（新局標記） |
| 舊鍵鏡像 | persist@1966 只鏡像 legacy（供 main.js 戰鬥寫回） | persistSave 直接寫主檔 | ✓ | 機制不同結果一致 |
| 清檔（結局/新局） | run-scoped 清理在 core/run_scoped + normalizeCampaign | EndingModel RUN_SAVE_KEYS@36-46，其中 5 個鍵**無寫方**（sanguo_saves_v1/deploy_v1/battle_v1/runsetup_v1/setup_v1） | ⚠ | 清不到不存在的東西（無害但清單失真） |

## 2. ✗ 清單（按嚴重度排序）

> 每條：復現路徑（玩家視角）→ 期望 → 現狀 → 證據 → 修法建議。

### F-01 [P0] 戰後處置缺「勝者門」與敗方 AI 處置（Cocos）
- 復現：Cocos 任一守城戰/攻城戰打輸 → 戰鬥結算 → 回大地圖 → 立即彈「俘虜處置」面板（我方是敗方卻在處置敵將）；同場景 web 打完輸，處置面板不彈，改由 AI 自動處理我方被俘將並寫戰報。
- 期望：只有勝者有處置權（core `roster.ts` 的 `won === false` 門）；敗方走 `planAiDisposal/applyAiDisposal` 並逐將寫戰報；同一場戰鬥不重複彈（`lastPost.ai && battleTs`）。
- 現狀：Cocos `BattleRoot.ts:325` 無條件 `queuePostBattle`；`CampaignRoot.ts:1445-1458` 只按 `hasPendingCaptures` 彈 `SurrenderPanel.showIfNeeded`（無 won）；`SurrenderModel.ts:286-317` 調 `surrenderCandidates` 不傳 won、無 AI 處置分支；`lastPost` 無 ai/battleTs 欄位。`work/check_parity.mjs` 的 capture ✗ 只是 marker 失配（`hasPendingCaptures|won` 已不存在），但真缺口獨立存在。
- 證據：`game/src/core/roster.ts` surrenderCandidates 首行；`campaign.html:4892/4935-4960/4888-4889`；`SurrenderModel.ts:286-317/561-615`；`CampaignRoot.ts:1445-1458`；`BattleRoot.ts:313-326`。
- 修法：`SurrenderModel.contextOf/stateOf` 加 `won`；`CampaignRoot` 的彈窗入口改「傳 won 的單一 core 函數」；把 `planAiDisposal/applyAiDisposal` 搬 core 並在 Cocos 接上；`lastPost` 加 ai/battleTs。

### F-02 [P0] 劇本號硬編碼 0（Cocos 面板層 8 處）
- 復現：Cocos 開「討伐董卓」或第三劇本 → 點我方城/敵城看城市卡（太守/守將/勢力）、點兵團看主將、AI 回合打城、勢力面板看城市明細、君主死亡判定 → 全部用「黃巾之亂」劇本的守軍/將領資料；但進同一座城的內政頁、或看攻打敵城的敵情，數字又是對的 ⇒ 同屏兩套數據。
- 期望：所有面板讀 garrison.json 都按 `this.scenIdx`（本局劇本號）；web 用 `currentScenarioIdx()`（campaign.html:924-931）。
- 現狀：`garrisonOf(data, 0, …)` 8 處：`CampaignRoot.ts:2330`（runMapAi）、`2540`+`2541`（cityCard/defendersOf）、`3473`+`3484`（dispatchArmyTo 的 leaderOf/armyRosterFor）、`3613`（officersByCity）、`4067`（君主死亡判定）；`ForcesPanel.ts:542`；`SurrenderModel.ts:297` 缺省 `opts.scenIdx ?? 0`。正確站點：`CampaignRoot.ts:1446/2012/2073`。
- 證據：見上；`game/src/core` 無此問題（core 的 garrison 讀取都吃傳入 scenIdx）。
- 修法：把 「scenIdx」收成 `CampaignRoot` 的單一 getter（如 `this.sci`）並傳進所有面板（ForcesPanel/SurrenderModel 構造參數已有先例），grep 清零 `garrisonOf\([^,]+,\s*0\s*,`。

### F-03 [P0] 月推進缺 autonomyTick：金→預備兵、自治開發不發生（Cocos）
- 復現：Cocos 在大地圖連按「推進一月」數月 → 城裡金很多但預備兵不動；掛了「自治」的城不發展。web 同樣操作每月自動金→預備兵、自治城自動開發。
- 期望：每次月推進逐月跑 `autonomyTick`（web `campaign.html:5444`）。
- 現狀：Cocos `autonomyTick` 唯一呼叫點是進內政頁時（`CityPanel.ts:691-692`）；`GameState.advanceMonth`（GameState.ts:831-865）不呼叫；`endInterior` 月圈只 advanceMonth→advanceArmiesMonth→runMapAi。
- 證據：`CityModel.ts:1769` autonomyTick、`CityPanel.ts:691`、`city.html:576`（web 進頁也會補跑）、`campaign.html:5444`（web 每月）。
- 修法：`GameState.advanceMonth`（或 core 的月流水）內呼叫 autonomyTick；Cocos 內政頁的進頁 tick 保留為冪等補跑。

### F-04 [P0] 守軍每月白補 2% 仍在（Cocos）
- 復現：Cocos 圍一座城幾個月不打 → 再打時守軍變多（每月 +2% 上限），敵我所有城都吃。
- 期望：無白補（原作守軍=城內預備兵池轉換；web 已刪，`campaign.html:5431-5435`）。
- 現狀：`GameState.ts:854-862`：`cap=min(600,floor(pop/2500)+110)`、`step=max(1,ceil(cap*0.02))`、`troops=min(cap,cur+step)`，不分敵我全劇本城；註解@849-853 自認是已知差異。
- 證據：同上；`game/src/core` 無此段。
- 修法：刪該段（先確認沒有 UI 依賴「守軍會自動回補」的文案）。

### F-05 [P0] 裝備加成不生效（Cocos）
- 復現：Cocos 在道具頁給關羽裝上武器/馬/書 → 回武將資料/名冊數值不變 → 出征戰鬥傷害也不變。web 同樣操作武/智立刻 +N 並帶進戰鬥。
- 期望：`equipBonusOf/statsOf` 口徑（web `campaign.html:1731/1750-1770`）在名冊、單將卡、`startBattle` 參數都生效。
- 現狀：Cocos `GameState.ts:140-142/370/423-432/501` 只聲明/正規化 equip 欄位，無消費點；`GeneralBook.mergeRow@399-429` 用 rec 原值；`DeployRoot.ts:1586-1607` 的 BattleLoadout 只查 generals 表；`GameState.startBattle@961-971` 不讀 equip。`syncEquipFromBag` 在 Cocos 也不存在。
- 證據：同上；web `items_model.js:316 bonusOfNames`、`campaign.html:1779-1797 syncEquipFromBag`。
- 修法：把「裝備→屬性加成」搬 `game/src/core/equip.ts`（或現有 items core），Cocos 名冊/loadout/startBattle 三處接。

### F-06 [P1] 路上遭遇戰被自動擲骰（Cocos）
- 復現：Cocos 兩支敵對部隊在道上相遇 → 只看到一行「遭 遇 戰」戰報，一方消失、另一方剩一半兵；沒有戰鬥畫面、不能操作。web 同樣場景會彈確認框並進真實戰鬥頁。
- 期望：interactive 推進時開戰鬥（web `startEncounter@4544` + `encounterUrl@4507`）；只有 batch/auto 才自動結算。
- 現狀：`CampaignRoot.ts:3402-3469` `Math.random()` 直接結算（註解@3391-3401 自認 [新設計]：Cocos 沒有路上野戰場景）。
- 證據：同上；web `handleMarchEvents@4578` 按 batch 分流。
- 修法：Cocos 需要「遭遇戰」戰鬥入口（Battle 場景目前錨在城上，可先傳 encounter=1 的敵將/兵參數），或至少把擲骰改成可復現（seedRng）並在 UI 明示「自動結算」。

### F-07 [P1] 編成缺前/中/後列（Cocos）
- 復現：Cocos 編成屏只能排武將順序/兵種/陣形，不能把武將放前/中/後排；web 可拖/點站位並記憶，戰鬥中前排先挨打。
- 期望：`col ∈ front/mid/back`，進 `?cols=` 契約、戰場讀 `cfg.cols`。
- 現狀：Cocos 全庫無站位欄位（只有 grid 欄數 `GEN_COLS` 等）；無 `sanguo_deploy_cols_v1`；web `deploy.html:548-571/899`、`main.js:564/680`。
- 證據：同上。
- 修法：DeployRoot 加 col 欄位 + 隊列序列化 + 出征負載傳 cols；Battle 端 core 已有 `parseCols`（web main.js:564 用 core），Cocos 接同一 core 函數。

### F-08 [P1] web 無結局面板/統一判定/重開入口
- 復現：web 玩到佔全 60 城 → 什麼都不發生，繼續玩；我方君主陣亡/城丟光 → 只有一條 notice+戰報，遊戲繼續且沒有重開按鈕。
- 期望：滿屏結局（統一/滅亡兩類三種台詞）+ 重新開始/讀檔（Cocos `EndingPanel.ts:222/restart@611`、`EndingModel.endingOf@446-470`）。
- 現狀：web grep `結局|ending|統一|gameover` 0 命中；只有 `forceExtinct@2540-2558`。
- 證據：同上；core 沒有結局模型（`EndingModel.ts` 只在 Cocos）。
- 修法：把 `EndingModel.ts` 搬 `game/src/core/ending.ts`，web 加一層全屏浮層 + restart（startNewGame 即可）。

### F-09 [P1] 存檔容器/格式分裂且無版本遷移（Cocos）
- 復現：web 存 10 槽 → 換 Cocos 端（或反之）讀不到；Cocos 舊版存檔沒有升版邏輯，格式一改就直接壞。
- 期望：統一 snapshot schema + 版本號 + upgrade 鏈（web `saves.js:56/227/263/277`）；跨端至少能讀 raw 鍵組。
- 現狀：web 單容器 `sanguo_saves_v1`（v3 快照）；Cocos `sanguo_slots_v1` 索引 + `sanguo_slot_payload_v1_<n>`（原始 `sanguo_*_v1` 字串組）；`SaveSlots.ts:13` 明寫不做 v3 結構/不做遷移。
- 證據：同上；鍵表見 §3。
- 修法：抽 `game/src/core/snapshot.ts`（version/serialize/upgrade），Cocos payload 改存 snapshot JSON（保留 raw fallback 一版）。

### F-10 [P1] 手動存檔語義相反（Cocos 改自動存檔目標）
- 復現：Cocos 手動存到槽 5 → 之後每月自動存檔全寫進槽 5，槽 1-4 停更，玩家以為「自動存」還在工作。
- 期望：手動存檔不移動自動存檔目標（web 註解@2000-2001，project/89 4b 明確卡點）。
- 現狀：`SaveSlots.saveToSlot@394-425` 存完 `index.active=n`；`SaveSlots.ts:390-392` 註解自認與 web 相反。
- 證據：同上。
- 修法：Cocos 要有「自動存檔槽」概念（active 由 writeSlotAuto 管），手動 saveToSlot 不動 active。

### F-11 [P1] 大地圖/內政/編成/道具 BGM 全缺（Cocos）
- 復現：Cocos 只有戰鬥有聲音；大地圖/內政/編成/道具頁全程靜音。web 每頁都切對應 BGM（內政還按城數 5 檔）。
- 期望：`AudioHost` 在 Campaign/City/Deploy/Items 場景播 `bgm('map'|'domestic:N')`。
- 現狀：AudioHost 只被 `BattleRoot.ts:32/672` 使用。
- 證據：web `campaign.html:5575`、`city.html:1289`、`deploy.html:1001`、`items.html:667`；Cocos 各面板 0 呼叫。
- 修法：各 Root 的 onLoad 起 bgm、onDestroy 處理由 AudioBus 統一（需要一個常駐 AudioHost，目前每場景自建會斷）。

### F-12 [P2] 出征兵力池口徑不同（Cocos 不帶預備兵）
- 復現：Cocos 城裡有 500 兵+3000 預備兵，出征只能帶 troopCapOf 上限的「兵」，預備兵留在城；web 出兵上限吃 `troops+prep` 池，超額自動從預備兵補。
- 期望：`march_flow.cityPoolOf/takeFromCity` 口徑（web deploy/main 共用）。
- 現狀：`CampaignRoot.dispatchArmyTo@3338-3389` 只讀 `troopsOf(from)`、cap=troopCapOf(level)、扣也只扣 troops。
- 證據：`game/web/march_flow.js:59-112`；Cocos 無對應檔（只有 core/march.ts 的純行軍）。
- 修法：`march_flow.js` 搬 core 並雙端共用；Cocos dispatch 改 pool 口徑。

### F-13 [P2] 無鍵盤輸入（Cocos）
- 復現：Cocos 桌面端不能按 1-8 放技能、A-H 給命令、Space 開戰、R 重開、Esc 取消；只能鼠標/觸屏點。
- 期望：與 web 同一套鍵位（`main.js:1564-1605`）。
- 現狀：Cocos 全庫無鍵盤事件（`BattleInput.ts` 只有 touch）。
- 證據：同上。
- 修法：BattleInput 加 keyboard 監聽映射同一 `armyCommand/pickSkill/cmd6Act`；面板層加 Esc 關浮層。

### F-14 [P2] 月推進缺年度結算/帳本/補學（Cocos）
- 復現：Cocos 看不出「年度復核/歲入帳」，也沒有「補學技能」的日誌；存檔裡沒有 ledger/learned 欄位。
- 期望：`annualSettle`（saves.js:1690）+ ledger + monthlyLearn（campaign.html:5512）。
- 現狀：`GameState.advanceMonth` 只有年稅；無 annualSettle/ledger/monthlyLearn。
- 證據：同上。
- 修法：與 F-03 同一批：月流水收進 core，年結算作為流水的一步。

## 3. localStorage 鍵表

> 由 `work/parity_sweep/scan_storage.mjs --json`（`storage.json`，18 鍵）+ 常量解析交叉核對。`web` 指 `game/web/**`，`Cocos` 指 `game/cocos/assets/scripts/**`（不含 core 鏡像）。

| 鍵 | 寫入方 | 讀取方 | 雙端一致 | 備註 |
|---|---|---|---|---|
| `sanguo_campaign_v1` | web：campaign.html persist@1966 / autosave@1973 / writeLegacy（saves.js:1095）、city.html persist 三段（writeSlot@592 / saveStore@593 / writeLegacy@594）、deploy.html writeSaveBoth@597、items.html、main.js writeBackCampaign@1154；Cocos：GameState.persistSave@628 | web：saves.js:1082 readLegacy、main.js:1055、deploy.html:280、items.html:275；Cocos：GameState.ts:526 | ⚠ | 兩端都寫但語義不同：web 是「戰鬥寫回通道的 legacy 鏡像」，Cocos 是唯一主檔；schema 都含 save 主體 |
| `sanguo_saves_v1` | web：saves.js:541 writeRaw（容器） | web：saves.js:527 readRaw | ✗ | Cocos 只在 EndingModel.ts:36-46 清檔名單出現，**無寫方** |
| `sanguo_slots_v1` | Cocos：SaveSlots.writeIndex@290 | Cocos：readIndex@260 | ✗ | web 無 |
| `sanguo_slot_payload_v1_<n>` | Cocos：writePayload@321（SaveSlots.ts:54 前綴、197 拼鍵） | Cocos：readPayload@307 | ✗ | web 無；整組 `sanguo_*_v1` 字串 |
| `sanguo_items_v1` | web：city.html:617（bagAdd）、items_model.js 存裝備；Cocos：ItemsPanel.writeItemsSave@383、CityPanel.ts:1367 | web：city.html:604/615、campaign.html:1721；Cocos：ItemsPanel.readItemsSave@350、CityModel.ts:444、CityPanel.ts:743/1365 | ✓ | **schema 兩端一致** `{equip,bag,gen}`，本輪唯一真正互通的存檔鍵 |
| `sanguo_city_v1` | Cocos：CityPanel.ts:885（內政附加欄位） | Cocos：CityPanel.ts:753 | ✗ | web 無（web 內政欄位直接進主檔） |
| `sanguo_monarch_v1` | Cocos：CampaignRoot.writeMonarchExtras@3578 | Cocos：readMonarchExtras@3560、SaveSlots.ts:340 | ✗ | 君主/即位月等附加欄位 |
| `sanguo_battlelog_v1` | Cocos：CampaignRoot.storeBattleLog@3851 | Cocos：loadBattleLog@3860 | ✗ | web 戰報只存主檔（renderLog） |
| `sanguo_monarch_seat_v1` | Cocos：storeMonarchSeat@4032（rem@4033） | Cocos：loadMonarchSeat@4006 | ✗ | 王座/都城 |
| `sanguo_monarch_extinct_v1` | Cocos：storeMonarchExtinct@4041（rem@4042/4019-4020） | Cocos：loadMonarchSeat@4007 | ✗ | 滅亡名單 |
| `sanguo_run_v1` | Cocos：RunSetup.writeRun@106（rem@163） | Cocos：readRun@83 | ✗ | 本局 run 參數（`CAMPAIGN_KEYS` 未含 → 讀槽不換） |
| `sanguo_run_fresh` | Cocos：RunSetup.ts:130（rem@141） | RunSetup.ts:140 | ✗ | 「新局」旗標 |
| `sanguo_adv_single` | 只讀不寫（Cocos：GameState.ts:812） | Cocos：GameState.ts:812 | ✗ | 單月調試開關（web 用 `?auto=`） |
| `sanguo_deploy_cols_v1` | web：deploy.html:564 saveCols | web：deploy.html:554 loadCols | ✗ | Cocos 無（F-07） |
| `sanguo_deploy_v1` | 無（只在 EndingModel.ts:36-46） | 無 | ✗ | **死鍵** |
| `sanguo_battle_v1` | 無（同上） | 無 | ✗ | **死鍵** |
| `sanguo_runsetup_v1` | 無（同上） | 無 | ✗ | **死鍵** |
| `sanguo_setup_v1` | 無（同上） | 無 | ✗ | **死鍵** |

小結：web 4 鍵 / Cocos 13 鍵（+4 死鍵 +1 共同鍵）；**真正雙端同 schema 的只有 `sanguo_items_v1`**。存檔互通需按 F-09 收斂。

## 4. 硬編碼/默認值表

| 位置 | 默認值 | 是否該按存檔/劇本走 | 影響 |
|---|---|---|---|
| `CampaignRoot.ts:2330` `garrisonOf(data, 0, name)` | 劇本 0 | 應＝本局 `scenIdx` | AI 打城用錯守軍（F-02） |
| `CampaignRoot.ts:2540/2541` cityCard `garrisonOf(…,0,…)` / `defendersOf(…,0,…)` | 0 | 應＝`this.scenIdx` | 城市卡錯（F-02） |
| `CampaignRoot.ts:3473/3484` `leaderOf`/`armyRosterFor` 內 `garrisonOf(…,0,…)` | 0 | 應＝`this.scenIdx` | 出征主將錯（F-02） |
| `CampaignRoot.ts:3613` `officersByCity` | 0 | 應＝`this.scenIdx` | 武將按城分組錯（F-02） |
| `CampaignRoot.ts:4067` 君主死亡判定 | 0 | 應＝`this.scenIdx` | 繼承/滅國誤判（F-02） |
| `ForcesPanel.ts:542` 勢力明細 | 0 | 應＝傳入 `scenIdx` | 勢力面板錯（F-02） |
| `SurrenderModel.ts:297` `opts.scenIdx ?? 0` | 0 | 應必傳 | 潛在雷（主路徑已傳） |
| `CampaignRoot.ts:1260` `private scenIdx = 0` | 0 | start@1370 會賦值，安全 | — |
| `GameState.ts:26/812` `sanguo_adv_single` | 單月開關 | 除錯用，web 無 | 除錯口徑不一致 |
| `GameState.ts:714` `garrisonOf(city)`＝`min(pop/2500+110,600)` | 估算值 | 應只當「無 garrison.json 時兜底」，且不該當情報 | 提示/`capOf` 用到 |
| `CityModel.ts:701-719` `GATE_TROOPS_FALLBACK=110`（garrison.json 缺關卡時） | 110 | 與 web `city_model.js:490-508` 一致 | ✓ |
| `SaveSlots.ts:50` `SLOT_COUNT=10` / `SLOT_NAME_MAX=20` | 10/20 | 與 web `saves.js:45` 一致 | ✓ |
| `EndingModel.ts:36-46` RUN_SAVE_KEYS 5 個無寫方鍵 | 死鍵 | 應刪或補寫方 | 清檔失真 |
| `RunSetup.ts:150` `scenarioIndex` 默認 0 | 0 | 應由選劇本寫入（web `pendingScenario`） | 若缺寫入會默認黃巾 |
| `DeployRoot` 無 `col` 默認 | — | 應有 `mid` 默認（web `main.js:680`） | F-07 |
| `CampaignRoot` 遭遇戰 `Math.random()` | 無種子 | 應 seedRng 可復現 | F-06 |

## 5. 風險熱區 Top 10（用戶遇到概率 × 影響）

1. **F-02 劇本號硬編碼 0** — 3 個劇本有 2 個直接踩；且同屏自相矛盾，玩家會立刻不信任數字。
2. **F-03 月推進不補兵/不自治** — 每局每回合都發生，屬「玩法核心被拿掉」，且玩家最終會發現金沒用。
3. **F-04 守軍 2% 白補** — 每場攻城都可能踩；越圍越強，直接破壞攻城節奏。
4. **F-01 俘虜勝者門** — 打輸卻能處置敵將，規則倒錯；且重進大地圖可能重複彈。
5. **F-05 裝備加成不生效** — 玩家在道具頁投入資源零回報，最容易被當成 bug 回報。
6. **F-06 遭遇戰自動擲骰** — 行軍是主玩法，路遇不可操作且不可復現，體感像「丟硬幣」。
7. **F-07 無前/中/後列** — 編成深度少一層，戰鬥結果與 web 不一致但玩家说不清。
8. **F-08 web 無結局** — 通關/滅國都沒有收尾，長線玩家必遇，且沒有重開引導。
9. **F-09/F-10 存檔分裂與槽語義相反** — 換端=丟檔、手動存檔後自動存檔失聯，屬「資料丟失」級。
10. **F-11 音效缺失（+F-13 無鍵盤）** — 不影響規則但影響「像不像同一個遊戲」，且橫跨全部非戰鬥頁。

## 6. 防復發建議

### 6.1 應該搬共享 model / core 的規則

| 規則 | 現況 | 建議落點 |
|---|---|---|
| 劇本索引穿透（garrison/officers/scenario 全部讀取） | 兩端各有 8+ 處硬編碼/傳參 | `game/src/core/scenario.ts`：`runScenarioIndex(save)` + `dataFor(scenIdx)`，面板只能拿 `sci` |
| 月推進流水線（月份/年稅/autonomy/年結算/漂移/補學） | web 在 campaign.html、Cocos 在 GameState+AiRunner 各半 | `game/src/core/month.ts` 一支 `advanceOneMonth(save,data,ctx)`，雙端只調它 |
| 出征兵力池/扣除/回城分帳 | web march_flow.js、Cocos dispatch 各一套 | `game/src/core/march_flow.ts`（直接把 march_flow.js 移入 core 再鏡像） |
| 裝備→屬性加成 | web campaign.html 頁內函數、Cocos 無 | `game/src/core/equip.ts`：`effectiveStats(general, equip)` |
| 俘虜處置門/敗方 AI 處置 | core roster 有 `won` 門、UI 各接一半 | `game/src/core/captives.ts`：`openCaptiveFlow(save,data,{won,...})`，UI 只調 |
| 結局判定 | Cocos 有 EndingModel、web 無 | 搬 `game/src/core/ending.ts`（+ web 全屏結局層） |
| 存檔快照/版本/遷移 | web saves.js、Cocos SaveSlots 各一套 | `game/src/core/snapshot.ts`：`SNAPSHOT_VERSION` + `serialize/upgrade` |
| 編成站位 | web deploy.html 頁內 | `game/src/core/formation.ts`（parse/serialize cols） |

### 6.2 `check_parity` 該加的 marker

> 現有 features.json 4 條都是「一端有字串」單向匹配，`capture` 就是因 marker 失配誤報 ✗。建議每條標註 `expect: 'present' | 'absent'` 並允許「雙端都必須命中」的 `both` 語義。

| marker | 檢查 | 期望 |
|---|---|---|
| `capture-won-gate` | Cocos `SurrenderModel.ts` 出現 `won` 參數、`planAiDisposal\|applyAiDisposal`；web `settleBattleReturn` + `aiDisposeCaptives` | both present |
| `no-hardcoded-scen0` | 雙端 grep `garrisonOf\([^,]+,\s*0\s*,` | both **absent** |
| `month-autonomy` | 雙端月推進路徑出現 `autonomyTick`（web campaign.html、Cocos GameState.advanceMonth 或 core month） | both present |
| `no-guard-regen` | 雙端 grep 2% 白補（`ceil\([^)]*0\.02` / `PREP_GAIN` 旁的守軍段） | both **absent** |
| `equip-effective` | 雙端 `bonusOfNames\|equipBonus` 被 `statsOf\|startBattle\|BattleLoadout` 使用 | both present |
| `deploy-columns` | 雙端 `sanguo_deploy_cols_v1\|COL_BY_NAME\|applyCols` | both present |
| `ending-panel` | 雙端 `EndingPanel\|endingOf\|unify` | both present |
| `bgm-scenes` | 雙端 `bgm\('map'\)\|domestic:` | both present |
| `keyboard` | 雙端 `onKeyDown\|keydown` | both present（或白名單記錄 Cocos 桌面不支援） |
| `snapshot-version` | 雙端 `SNAPSHOT_VERSION\|snapshotVersionOf\|upgradeSnapshot` | both present |
| `scenIdx-passed` | Cocos `openCityPanel` / `CityPanel` 選項出現 `scenIdx` | present |
| `save-keys-parity` | 雙端 localStorage 鍵清單 diff（`scan_storage.mjs` 已有能力） | 允許差集白名單，新增鍵要登記 |

### 6.3 每個面板該補的斷言

- **CampaignRoot/CityPanel**：以 `scenIdx=1` 的 fixture 斷言城市卡/主將/AI meta 用的是劇本 1 的 garrison（現在會抓到劇本 0，等於直接鎖死 F-02）。
- **GameState.advanceMonth**：mock autonomyTick/annualSettle 斷言月推進有呼叫（鎖 F-03/F-04/F-14）。
- **SurrenderPanel/SurrenderModel**：`won:false` → 不彈窗、走 AI 處置；`won:true` → 彈窗；`lastPost.ai+battleTs` 冪等（鎖 F-01）。
- **DeployRoot**：站位序列化往返（含缺省 `mid`）+ 出征負載含 cols（鎖 F-07）。
- **ItemsPanel/GeneralBook/BattleLoadout**：裝備後 `statsOf`/`startBattle` 參數 +STR/+INT（鎖 F-05）。
- **SaveSlots/saves.js**：同一個 snapshot 兩端 `upgradeSnapshot` 後逐字段相等 + 槽寫入不動自動存檔目標（鎖 F-09/F-10）。
- **AudioHost**：場景 onLoad 斷言 `bgm('map'|'domestic:N')` 被呼叫（鎖 F-11）。
- **BattleInput**：鍵位映射表（鎖 F-13）。
- **EndingModel**：三種 ending 的 label/台詞/統計（web 接上後共用同一 model 測試）。

## 7. 附錄

### 7.1 `work/parity_num` unit3 13650 差異的定性（勿當成城市玩法分叉）

- 今天 11:32 我復跑 `node work/parity_num/run_all.mjs`：unit1/2/4 仍 0；**unit3 city 13650**（首個 seed=11 rot=0 `ensureExtras goldMigrated` web=undefined vs Cocos=false）。
- 已核實成因：①Cocos `ensureExtras` 總是寫 `goldMigrated` 鍵（CityModel.ts:828）、web 不寫 → 純 schema 鍵集差；②`搜索.*/徵兵.recruit money` 是**回傳物件欄位**差：web 搜索 return 帶 `money`（city_model.js:1364）、Cocos 不帶（CityModel.ts:1313）；web 成功 `cost:SEARCH.COST`、Cocos `free?0:COST`（@1310）；③`tick.gained/prep` 數值差需另查 refill 段；④unit3 的 `COCOS_PATCHES`（C1-C5）锚點是舊版 CityModel 字串，對拍 harness 本身要更新。
- 結論：**13650 不能直接寫成「城市玩法分叉」**；若要復用該套件，需先把 harness 更新到當前 CityModel 介面（建議另開任務，不在本報告範圍）。

### 7.2 待核項（本輪未完全證實，建議派單驗證）

- **T-1 Cocos 戰後兵損/回城兵力是否回寫**：`GameState.recordBattleResult@1140-1172` 只寫勝敗/城/軍團，未見兵損回寫；BattleRoot.ts:313-318 只傳 `settlement.record`。web 由 `main.js writeBackCampaign` + `march_flow.casualtySplitOf` 回寫。**需實機打一場核對**（若是真的，升級為 P0 ✗）。
- **T-2 Cocos 疲勞/士氣月度漂移覆蓋範圍**：Cocos 走 `AiRunner` 的 `monthlyDrift`（疑似只澤及 AI 側），我方將領的 tire/morale 是否每月漂移未證。
- **T-3 地圖區比例/字體**：Pair 15 的 ⚠ 需截圖目視（本次禁起瀏覽器/Cocos 預覽，未做）。
- **T-4 web 「姓」/「字」顯示**：兩端名冊顯示欄位差异未逐一列舉（不影響規則）。
- **T-5 Cocos `endInterior` 的 `spawnRaid` 條件**（無 AI 時）：與 web `spawnAiArmy` 時機是否等價，未逐條比。

### 7.3 方法與可復現命令

- 定義掃描：`node work/parity_sweep/scan_defs.mjs`（輸出 `defs.txt`/`defs.json`，13 組雙端對照）。
- 存檔鍵掃描：`node work/parity_sweep/scan_storage.mjs --json`（輸出 `storage.json`）。
- 單源檢查：`node work/check_parity.mjs`（當前：core ✓ 23；F4 ✓、F16 ✓、capture ✗（marker 失配，真缺口見 F-01）、taunt ✓）。
- 數值對拍：`node work/parity_num/run_all.mjs`（unit1/2/4 0 不一致；unit3 見 §7.1）。
- 本輪限制：只讀、未起瀏覽器、未跑 Cocos 預覽/構建；所有「用戶可見」都是代碼推演 + 舊報告實機結論交叉驗證。

### 7.4 複用的既有基線（避免重複勞動）

- `work/affairs_audit/REPORT.md`（內政九項深審計；其中 P0-1..P0-5 已被 2026-11-26 修復，按當前代碼重判後不再列入 ✗）。
- `work/internal_affairs/REPORT.md`（web 側 F1-F19 修復清單）。
- `work/flow_audit/内政大地图_差异.md`（F1-F30 原作差異表，本報告 F 編號引用其語義）。
- `work/cocos_affairs_fix/REPORT.md`（Cocos 側 P0 修復；其「P1-4 attachGeneral 未修」已過時，現已修）。
- `work/parity_num/`（unit1-4 數值對拍套件）、`work/flow_capture/REPORT.md`、`work/march_flow/REPORT.md`、`work/jili/REPORT.md`、`work/battle_end/REPORT.md`。
