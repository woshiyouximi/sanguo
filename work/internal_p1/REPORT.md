# 內政 / 大地圖 P1 批次報告（F4 / F5 / F7 / F10 / F16 / F19 / F28）

- 執行者：internal-p1（lead 委派的並行智能體）
- 工作目錄：`F:\sanguo`
- 差異清單：`F:\sanguo\work\flow_audit\内政大地图_差异.md`（下稱「差異」）
- 原作指南：`F:\sanguo\work\ref_pdf\sanguo2_guide.txt`（下稱「指南」）
- 驗收環境：`node web/serve.mjs 5173`（已在跑，pid 6816；5174 亦已在跑，兩者服務同一工作目錄），CDP `PORT=9361 / PROFILE=work\.edgeprof_internalp1 / MATCH=127.0.0.1:5173`
- **調試驗收必須帶 `&dev=1`**：`campaign.html:591-606` 的 `DEV_QUERY_KEYS` + `gateQuery()` 在 `SGDev.DEV` 為假時會把 `v1check/probe/armyui/panel/...` 從 `qs` 刪掉，`window.__v1 / __r7 / __armyUi` 都不會掛上（第一輪踩過）。

## 總驗收數字

| 項目 | 結果 |
| --- | --- |
| `cd F:\sanguo\game; npm.cmd exec -- tsc --noEmit` | **exit 0**（無輸出） |
| `node --test "tests/*.test.ts"` | **tests 1764 / pass 1763 / fail 0 / todo 1 / suites 88**（基線 1690 pass） |
| 新增測試檔 | `game/tests/affairs_p1.test.ts`（380 行，26 條，全綠） |
| 既有測試更新 | `affairs_f1f8.test.ts`（八命令→七命令）、`era_save.test.ts`（civic 標籤 金錢→國庫 + 本城金 chip + subgrid）、`saves_r70.test.ts`（色板 14→29） |
| 測試輸出 | `F:\sanguo\work\internal_p1\test_out.txt` |
| 遺留驗證瀏覽器進程 | 0（見文末） |

改動行數（無 git 基線，按檔案行數差 + 編輯塊計）：

| 檔案 | 改前 | 改後 | 淨增 |
| --- | --- | --- | --- |
| `game/web/city_model.js` | 1809 行 / 90,149 B | 1989 行 / 100,205 B | **+180** |
| `game/web/campaign.html` | 6021 行 / 311,162 B | 6102 行 / 317,081 B | **+81** |
| `game/web/city.html` | 1270 行 / 69,380 B | 1373 行 / 76,220 B | **+103** |
| `game/web/saves.js` | 1685 行 / 80,938 B | 1744 行 / 84,775 B | **+59** |
| `game/tests/affairs_p1.test.ts` | 新增 | 380 行 / 20,876 B | **+380** |
| 既有測試 3 檔 | — | `saves_r70` 771 行、`era_save` 305 行、`affairs_f1f8` 86 行 | 約 +35 |

---

## F4 「內政終了」＝結束本年窗口 → 跑完一年

**原作依據**：指南 L114-116「內政點『結束內政』就進來了」＝結束內政即進大地圖跑時間；指南 L21-23/L39-41「每年 1 月內政，其餘 11 個月大地圖」。差異 F4（差異行 57）：「『結束內政 → 跑一年』缺位：『內政終了』只鎖月令；推進時間的動作是『推進一月』，一次 1 個月」。

**改法**（`game/web/campaign.html`）
- `:2517 function endMonth()`：保留 `gameStarted` 守衛、非正月拒絕、`CM.monthLocked(save, UNLIMITED)` 拒絕、`CM.markMonthActed(save, UNLIMITED);`（後兩者被 `tests/affairs_f1f8.test.ts:41-45`、`tests/rows85.test.ts:499-500` 釘死），末尾 `:2532 advanceMonth(12);`，並補兩行戰報 `內 政 終 了：本年內政窗口收束（原作 0x427FE0 → 0x41BBF5）` / `大 地 圖：結束內政 → 跑完一年（… → 次年 1 月）`。
- 單月調試路徑保留：`advanceMonth(1)` 的「推進一月」按鈕不動；`?adv=N` 入口改名為 `const bootAdv`（`campaign.html:5795-5796` 區），避免 `rows85` 的 TDZ 掃描把註釋裡的 `?adv=` 當成引用後文 `const adv`。
- `advanceMonth(n)` 語義核對（`:5321-5489`）：`const batch = n > 1 || fast;`、`const marchMode = MARCH_ON && !fast;` ⇒ `n=12` 時 batch=true 但**仍走行軍模式**（只有 `?auto=1` 才關），12 個月照常行軍、AI 每月行動、敵軍來攻在 `handleMarchEvents(batch)` 就地結算，不跳守城頁；`?adv=1` 仍走單月分支。

**驗證**
- 測試（`tests/affairs_p1.test.ts`）：`內政終了：結束窗口後一次 advanceMonth(12)，不是只鎖月令`、`保留單月調試路徑`、`年推進的月份算術`。
- 實機（董卓局，劇本 189）：點頁頭 `#btnEndMonth` → `ym` 由 `西元 189年 1月` 變 **`西元 190年 1月`**、`window.__r7.state().month` 由 1 變 **13**（`p1_map_after_endmonth.png`）。
- 實機（袁紹局）：`PRE_END {"ym":"西元 189年 1月","month":1}` → `POST_END {"ym":"西元 190年 1月","month":13}`（`p1_map_endmonth_yuanshao.png`，日誌尾部已是「2年1月」的 AI 月報）。

---

## F5 劇本起始年份入時間軸

**原作依據**：差異 F5（差異行 58）：「劇本起始年份不進時間軸：選『討伐董卓(189)』開局頂欄卻是『西元 184年 1月』」→「`save.startYear`（189/200/208/219）入檔，顯示用 `startYear + year - 1`；`saves.js yearOf` 只做年內換算」。

**改法**
- `game/web/saves.js`
  - `:1576 START_YEAR_FALLBACK = 184`；`:1582 startYearFrom(scenario)`（依序讀 `sc.system.YEAR / sc.year / sc.YEAR`，非法回 184）；`:1595 startYearOf(save)`（讀 `save.startYear`，缺失／非法回 184，**不做年內換算**）。
  - `:353 ensureSnapshotShape()` 加 `intAt('startYear', 1, START_YEAR_FALLBACK);`；`:1304 newCampaign()` 寫 `startYear: startYearFrom(sc),`。
  - 存檔列表的 adYear 改由每格自己的 `startYear + yearOf(month) - 1` 現算（`metaFromSnapshot`），讀不到才退回 `era.adYearOfMonth`（`slotLineParts`）。
  - `yearOf(month)`（`:1542-1545` 區）**一行未動**。
- `game/web/campaign.html`
  - `:5913`（`normalizeCampaign` 內）補 `startYear` 正規化：有合法值就用，否則按 `save.scenario` 找 `SCEN[i].year`，再否則 184。
  - 三個入口掛錨點：boot `:1897`、`loadSlot` `:2025`、`startNewGame` `:2659`，皆 `Era.setAnchor(Saves.startYearOf(save));`（`era.js` 不改：`toADYear(y)=anchor+(y-1)`，`eraTextOfMonth` 自動給 `startYear + yearOf - 1`）。
- `game/web/city.html`：`:500` `era.setAnchor(Saves.startYearOf(save));`（頁內 `時間 209年` / `headSub` 跟著對）。

**驗證**
- 測試：`startYearFrom 5 劇本 = [184,189,200,208,219]`、`newCampaign 每劇本 startYear`、`era anchor 顯示算術（189→西元190年1月；219→244年3月；resetAnchor 回 184）`、`兩個頁面 boot 設錨`。
- 實機：新局「討伐董卓」頂欄 **`討伐董卓 · 西元 189年 1月`**（不是 184）；跑完一年 **`西元 190年 1月`**；city.html `headSub=討伐董卓 · 西元 189年 1月`、civic `時間 189年`。
- 截圖：`p1_map_189_year1.png`、`p1_map_after_endmonth.png`、`p1_city_main.png`。

---

## F7 內政指令集按原作 7 項重排

**原作依據**：指南 L96-105 五大核心指令表實為 7 項：搜索 / 開發 / 部隊徵兵 / 任命（太守·軍師）/ 武將資料（含使用物品）/ 內政自治 / 部隊出征；差異 F7（差異行 88）：「按原作 7 項重排…移動併入兵團指令，情報降為二級」。

**改法**
- `game/web/city_model.js`
  - `:47 CMD_ORDER = ['搜索','開發','徵兵','任命','武將資料','自治','出征']`（恰好 7 條）。
  - `:53 CMD_SECONDARY = ['情報','移動']`；`CMD_EXTRA = []`（保留空陣列給舊遍歷）；`CMD_META` 9 鍵（新增 `武將資料`「數值／裝備／使用物品」，`情報` 標只讀、`移動` 標兵團層）。
- `game/web/city.html`
  - `:361` 指令區 hint 改「七條」；`:373` 新增 `<div class="grid subgrid" id="subgrid">`；`renderGrid()` 主表走 `CMD_ORDER`、副表 `for (const cmd of M.CMD_SECONDARY || [])` 進 `#subgrid`（`:759`）。
  - `:1157 function openGeneralData()`：武將資料面板（武將/等級/武/智/裝備/忠/疲）＋底部「使用物品」按鈕 `#goItems` → `M.itemsUrl(...)`，`body.__noOk = true`、`afterCommand(false)`（不占令）。`onCmd` 的 `'物品'`/`'武將資料'` 都進這個面板（原「物品」直接跳 items.html 的分支刪除）。
  - 情報仍走 `openIntel()`，只讀（`body.__noOk = true`）；移動仍在城頁但降為副令（不占令，`afterCommand(false)`）——兵團 sheet 本來就有「變更目的 / 部隊駐紮 / 進入城內 / 武將資料 / 任命軍師」（`campaign.html:3145-3160`），所以「移動」的**行軍層**語義在兵團指令、**調兵層**語義留作城頁副令，兩處都不占令。
- `game/web/campaign.html`：`:2796` 內政鍵副標題 `正月 · 內政八命令` → `正月 · 內政七命令`。

**驗證**
- 測試：`CMD_ORDER/CMD_SECONDARY/CMD_EXTRA`、`CMD_META 9 條且無『物品』鍵`、`city.html 七令+副令 DOM`、`openGeneralData 含 itemsUrl`、`campaign 內政七命令`。
- 實機 city.html：`grid` 7 條 = 搜索 / 開發 / 徵兵 / 任命 / 武將資料 / 自治 / 出征；`subgrid` 2 條 = 情報（副令 · 本城/鄰城（只讀））/ 移動（副令 · 調將調兵）；武將資料 sheet 有「使用物品」按鈕；情報 sheet 無 OK 鍵。
- 截圖：`p1_city_main.png`、`p1_city_generaldata.png`、`p1_city_intel.png`。

---

## F10 自治只代行開發 → 改為每城代行一次搜索（只播人才）

**原作依據**：指南 L103-104「內政自治…自動模式找到的寶物不顯示，除非搜到人」；差異 F10（差異行 91）：「`runAutonomy()` 只調 `develop()` → 每城加一次 search，kind==='talent' 才出日誌/入庫」。

**改法**（`game/web/city_model.js`）
- `:1673`：每城在開發之前先 `const found = search(save, def, Object.assign({}, ctx, { quiet: true, free: true }));`，只有 `found.ok && found.kind === 'talent'` 才 `logAdd(... cmd:AUTONOMY.CMD, kind:'talent', text:\`自治搜索：${found.text}\`)`；`treasure/talisman/none` 一律不寫日誌、不進 `foundItems`。
- `search()` 支援兩個自治專用旗標：`:1362 const free = ctx?.free === true;`（免費：城金不足也照搜，末尾不扣金）、`:1365 const quiet = ctx?.quiet === true;`（不寫日誌）。
- 理由：指南只規定「寶物不顯示」，沒說自治搜索要扣金；且 `tests/city_rules.test.ts:322` 釘死「自治代行不扣金」、`:340` 釘「金 0 也照跑」。

**驗證**
- 測試（3 條）：`自治每城擲一次搜索`（`searchCount('襄平')` +1、`'代縣'` 不變，日誌不含 `找到物品|寶物|獲得`）；`只有搜到人才補日誌`（20 個月迭代，talent ≥1，talent 日誌 `/^自治搜索：.+加入我方。/`，其餘只匹配 `^襄平城自治：開墾 +N 人口、+N 防禦。$`）；`自治搜索免費`（金 0 仍 `ok === true`）。
- 實機：無專屬截圖（純模型層），由單測覆蓋。

---

## F16 錢的口徑統一（國庫 = Σ 每城 money）

**原作依據**：指南 L88-93 面板「金錢」是每城欄位；指南 L122-124「城裡每 100 金錢 = 1 個預備兵」；差異 F16（差異行 125）：「`save.gold` 單錢包 vs 每城 `money`，同屏兩個數（頂欄金 1,200 / 列表行 $3,941）看不出區別」→「統一每城 money，國庫 = Σ」。

**改法**（`game/web/city_model.js` §3b，`:811-900` 區）
- `cityMoneyOf(save, cityDef)` / `nationalGold(save, cityDefs)` / `spendCityMoney(save, cityDef, cost)` / `migrateGold(save, cityDefs)`，用 `save.goldMigrated` 做模式開關：
  - **遷移前**：`save.gold` 就是唯一錢包（舊檔相容讀，不是第二套並行扣款）；
  - **遷移後**：只看對應城實例的 `money`；`nationalGold` = Σ `save.owned` 每城 money（只讀，不實體化城態，保住 `civicFields` 的只讀釘子）；
  - `migrateGold` 一次性把 `save.gold` 併進首城（「該城實例本來沒有 money 才回填」），然後 `save.gold = 0; save.goldMigrated = true;`。
- 花錢全落當前城：`develop()`（DEV.COST=0，留價位）、`recruit()`、`search()` 全改 `spendCityMoney(...)`；`recruit/search` 的「金不足」判斷也改讀本城 money。
- `civicFields().gold = nationalGold(...)`（鍵集合不變）。
- `game/web/campaign.html`
  - `:2763` 頂欄 `$('gold').textContent = CM.nationalGold(save, scenario?.cities || ALL).toLocaleString();`
  - `:2782` 城市列表行 `${pop} 人 · <span class="dim">本城金</span> $${st.money}`；`:2829` hint 行「本城金 X（國庫 Y）」。
  - `advanceMonth` 的歲入**刪掉 `save.gold += income`**（`campaign.html:5425` 附近只留註釋說明），稅收只進各城 `st.money`。
  - `:3079` 兵團軍情「金錢」格改 `CM.nationalGold(...)`，副標 `· 國庫（Σ 每城金）`。
  - boot `:1900`、`loadSlot` `:2027`、`startNewGame` `:2661`：`CM.migrateGold(save, scenario.cities)`。
- `game/web/city.html`：`:331` HUD chip 標籤 `金` → **本城金**（值 `st.money`）；`:362` civic 欄 chip `金錢` → **國庫**（值 `nationalGold`）；`:510` boot 也跑 `migrateGold`；`?gold=N` 調試口改寫本城 money。

**驗證**
- 測試（4 條）：`migrateGold 遷移與國庫合計`、`未遷移舊檔只認 save.gold`、`遷移後花錢只落當前城`、`搜索扣當前城`、`源碼不再有 save.gold +=`。
- 實機（袁紹局，2 城）：頂欄 **`金 8,343`**；city.html 南皮 **`本城金 4826` / `國庫 8343`**；`window.__r7.state().gold === 0`（舊錢包已歸零）；hint `內政：南皮 兵 247 · 民 343,500 · 本城金 4,826（國庫 8,343）`；大地圖城市卡「金錢 本城金 $4,826」。
- 實機（董卓局，1 城）：`本城金 6652`＝`國庫 6652`（單城時應相等，對照組）。
- 一年後國庫 8,343 → **16,686**（正月歲入進的是各城 money，頂欄合計同步成長）。
- 截圖：`p1_city_nanpi_over.png`、`p1_map_card_overcap.png`、`p1_city_main.png`。

---

## F19 武將數上限（N / 10，超編標紅不裁切）

**原作依據**：指南 L92「武將數（如 13/10）當前武將數 / 上限」；差異 F19（差異行 156）：「沒有『武將數 當前/上限』」→「加 `CITY_OFFICER_CAP`（原作 10，待證）+ 顯示 `N/10`；劇本本身超編（濮陽 15）需載入時標紅」。

**改法**
- `game/web/city_model.js:208 export const CITY_OFFICER_CAP = 10;`（註釋標「數值 [待證]」）＋ `:211 officerCapState(count)` → `{ n, cap, over }`；**只判定不裁切**（`rosterOf` 不動）。
- `game/web/campaign.html:2851` 城市卡武將格改用 `CM.officerCapState(gens.length)`，`over` 時 `<span style="color:#E2554B">N / CAP<span class="dim"> · 超編</span></span>`。
- `game/web/city.html:668` HUD 武將 chip 改 `${cap.n} / ${cap.cap}`，`classList.toggle('hot', cap.over)`（`.v.hot` 紅色）＋ `title="超編：劇本原始武將 N 名 > 上限 10（不裁切，只標紅）"`。

**驗證**
- 測試（3 條）：`CITY_OFFICER_CAP === 10` / `officerCapState` 邊界 9/10/11；`劇本超編城不裁切`（掃 5 劇本 × 60 城，最大 **18 名**（赤壁劇本 西涼），`over === true` 且 roster 長度保持 18）；`兩頁顯示 N/CAP`（campaign 含 `CM.officerCapState(` / `超編` / `E2554B`，且不再有 `gens.length} / 10` 硬編碼）。
- 實機 city.html：南皮 **`武將 13 / 10`**，`#vGens` class = `v hot`，title 為超編說明；civic「武將數 17人」（全勢力合計，另一個口徑）。
- 實機大地圖城市卡（合成 click 選中自家南皮）：`武將 13 / 10 · 超編`，紅色 span 命中 `red: ["13 / 10 · 超編"]`。
- 截圖：`p1_city_nanpi_over.png`、`p1_map_card_overcap.png`。

---

## F28 城上插旗 + 29 家固定色板

**原作依據**：差異 F28（差異行 229）：「城不插旗，勢力靠一圈色環；14 色板對 18 家不夠用 → 撞色（`#8A5FA0 = 曹操/王朗`、`#A0603A = 馬騰/袁術`…）」→「城上畫小旗（旗形取 `FLAGS`，旗色取勢力色）；色板擴到 ≥28 家全部固定（按劇本勢力表逐家定色，禁止哈希）」。

**改法**
- `game/web/saves.js:131 FORCE_PALETTE` 由 14 家擴到 **29 家**（前 14 家沿用舊色，新增 15 家：袁紹/曹操/劉備/孔融/喬瑁/馬騰/袁術/劉表/王朗/孫權/張魯/劉璋/金旋/孟獲/徹里吉；5 劇本 KING 文字并集恰好 29 家）。`FORCE_RESERVE` 14 備色只給表外勢力用（`forceColorIndex` 仍是 `PALETTE.length + hash % RESERVE.length`，固定表內**不走哈希**）。
  - 為了「29 色兩兩 RGB 曼哈頓距離 ≥ 40」，微調 3 個色值（註釋標 F28 微調）：孫堅 `#E07C30`、劉繇 `#7560C4`、喬瑁 `#8C8C2C`；最小距離從 32 提到 40。
- `game/web/campaign.html:3647 const cityFlag = (x, y, color, flags)`：`const pennant = Number(flags) === 2;`（關＝三角旗）否則方旗；旗桿深色、旗面 `withAlpha(color, .96)`、描邊 `FORCE_EDGE`。`:3711` 城循環內 `if (force) cityFlag(sx - (ready ? 25 : 18), sy, color, c.FLAGS);` —— **空城不插旗**。
- `:3762` 圖例標題 `● 金環＝我方 · 小旗＝勢力`，說明 `色＝勢力（N 家 · 固定 29 家色板）`。

**驗證**
- 測試（4 條）：`色板 ≥ 28`（29 家全在固定表、`forceColorIndex < 29`、29 色互不相同）；`色值差距`（兩兩距離最小 ≥ 40）；`城上插旗`（`cityFlag`、`pennant = Number(flags) === 2`、`cityFlag(sx - (ready ? 25 : 18), sy, color, c.FLAGS)`、`if (force) cityFlag(`；劇本 FLAGS 集合 = {2,4}）；`圖例`。
- 實機像素取樣（canvas 750×726，`await import('./saves.js')` 取 29 色板）：`palette=29`、**25 座有主城在「城左側 -21..-27px / 上方 -9..-15px」採到勢力色**，樣本 `公孫瓚 #6E8FBF / 袁紹 #C25B6E / 孔融 #3FA8B5 / 董卓 #6B6F76 / 馬騰 #C98F5A`（各 4 hit）。
- 實機像素遮罩（南皮，dx -32..-2 / dy -20..+2）：方旗為 10×7 的實心塊（`##########` × 7 行）＋下方旗桿；**關城界橋（同區域）只有零星 terrain 噪點，沒有旗** —— 因為劇本 1-5 的 12 座關 `KING` 全為空字串、`garrison.json` 也沒有 gate 的 owner（`forceAt` 為空）⇒ 按「空城不插旗」設計不畫；`FLAGS=2 → 三角旗` 這條分支由原始碼 + 單測釘死，實機在開局無主關城上拍不到。
- 截圖：`p1_map_189_year1.png`（全圖，圖例「固定 29 家色板」）、`p1_map_flags_dev.png`、`p1_map_flags_zoom.png`、`crop_flags.png` / `crop_city.png` / `crop_gate.png`（放大裁切）。

---

## 未做 / 限制（誠實清單）

1. **F28 三角旗（FLAGS=2）沒有實機截圖**：12 座關城在 5 個劇本裡 `KING` 都空、`garrison.json` 也無 owner，開局即「無主 → 不插旗」，只有被玩家/ AI 佔領後才會出現三角旗。分支已在 `campaign.html:3647-3660` 實裝並由單測釘死，但無法在開局實機取證。建議 P2 加一個「佔領關城後截圖」的驗收步驟。
2. **大地圖城市卡只對自家城渲染**（`campaign.html:2843` `if (def && st)` 用 `isMine` 判斷），敵城（如濮陽 15）點上去不出卡；F19 的「超編紅字」實機證據用自家南皮 13/10 取得，濮陽 15 只在單測（掃全劇本最大 18）覆蓋。
3. **F7「移動」的歸屬**：原作 7 項裡沒有「移動」，本作把「移動（城→城調兵/調將）」放進城頁副令（不占令），而兵團 sheet 的「變更目的/部隊駐紮/進入城內」承擔行軍層操作；沒有把 `M.move` 整個搬進兵團 sheet（會動到兵團 sheet 的既有回歸與 UX），若 lead 要求「移動只能從兵團進」再補。
4. **大地圖時間條 / 年進度條（F6）** 屬 P2，未動。
5. 併發提醒：本輪期間 `game/tests/retreat.test.ts` 等檔案被其他智能體改過（8:36），最終 `node --test` 全綠是在含那些改動的樹上跑的。

---

## 產物清單（`F:\sanguo\work\internal_p1\`）

- `test_out.txt`：最終 `node --test` 全量輸出（tests 1764 / pass 1763 / fail 0）
- `p1_map_189_year1.png`：189 年新局大地圖（城旗 + 圖例「固定 29 家色板」）
- `p1_map_after_endmonth.png`：內政終了後（190 年 1 月）
- `p1_map_endmonth_yuanshao.png`：袁紹局內政終了後
- `p1_map_card_overcap.png`：大地圖城市卡「武將 13 / 10 · 超編」紅字
- `p1_city_main.png`：city.html 七主令 + 二副令、本城金/國庫 chip
- `p1_city_generaldata.png`：武將資料面板（含「使用物品」）
- `p1_city_intel.png`：情報面板（只讀、無 OK）
- `p1_city_nanpi_over.png`：南皮 13/10 超編標紅 + 本城金 4826 / 國庫 8343
- `p1_map_flags_dev.png` / `p1_map_flags_zoom.png` / `crop_*.png`：城旗取樣與放大
- `steps_p1*.mjs`：可重跑的 CDP 驗收腳本（需 `PORT=9361 PROFILE=work\.edgeprof_internalp1 MATCH=127.0.0.1:5173 OUTDIR=work\internal_p1`）
- `p1d_out.txt` / `p1e_out.txt` / `p1f_out.txt` / `p1g_out.txt` / `p1h_out.txt` / `p1i_out.txt`：各輪實機日誌

## 收尾

- `node work\cocos_verify\cdpweb.mjs close` ＋ `node work\cocos_verify\reap.mjs --kill --match=edgeprof_internalp1`
- **遺留驗證瀏覽器進程: 0**
