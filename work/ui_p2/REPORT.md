# ui_p2 — Cocos 正式版 UI「開發痕跡」清理報告

- 日期：2026-11-26
- 範圍：`game\cocos\assets\scripts\**` 下面板／工具檔（**不含** `CampaignRoot.ts`、`game/web/**`、`game/src/core/**`）
- 約束：不改 git、不構建、不過模擬器；已裝包是 3.5，本輪只落源碼，出包由 lead 統一處理
- 對照清單：`F:\sanguo\work\ui_sweep\REPORT.md` 的 P2（第 2 節 7 條）
- 截圖證據：`F:\sanguo\work\ui_sweep\64_items_open.png`（2.9 原生包：右側「原作欄位」12 行 + 底欄中間無字空白按鈕位）

## 總覽

| # | 條目 | 狀態 | 主要檔案 |
|---|------|------|----------|
| 1 | `[新設計]` 標注泄漏 | ✅ 已修 | CityListPanel.ts / EndingPanel.ts |
| 2 | 物品頁「原作欄位」除錯區 | ✅ 已修（devTools 門控） | ItemsPanel.ts |
| 3 | 界面文案暴露 `garrison.json` | ✅ 已修 | DeployRoot.ts |
| 4 | 說明頁開發者口吻 + 大片空白 | ✅ 已重寫 | TitlePanel.ts |
| 5 | 物品底欄空按鈕位 | ✅ 已修（同 2 的底板門控） | ItemsPanel.ts |
| 6 | 戰報年份標錯 | ⏸ 無可改點（CampaignRoot.ts 禁改；見下） | CampaignRoot.ts（未動） |
| 7 | 名冊淳于瓊「在職」但 garrison 是野將 | ✅ 已修（改讀劇本口徑） | GeneralBook.ts |

額外同類清理（同一檔案、同類泄漏，順手做掉）：標題頁資訊卡暴露內部存檔鍵名 `sanguo_*_v1`、副標「直屏 750×1334」、提示「戰鬥 60Hz 邏輯」（對應 ui_sweep P2-1 / P2-2）。

## 逐條明細

### 1. `[新設計]` 設計標注泄漏

- **現象**：城池一覽底部「點一行選城 · 回大地圖即可查看　[新設計]」、結局頁底部「此局已結 · 重新開始將清除本局進度　[新設計]」。正式版把 web 的設計標注直接印給玩家。
- **位置 / 改法**：
  - `game\cocos\assets\scripts\CityListPanel.ts:443` → `'點一行選城 · 回大地圖即可查看'`（刪「　[新設計]」）
  - `game\cocos\assets\scripts\EndingPanel.ts:467` → `'此局已結 · 重新開始將清除本局進度'`
- **複跑**：`node --test tests/ui_no_dev_leaks.test.ts` 斷言六檔源碼已無「新設計」；items/book headless 全綠（見門禁）。

### 2. 物品頁「原作欄位」除錯區（正式版隱藏）

- **現象**：2.9 原生包右側詳情卡無條件列出 12 行原作欄位（`編號 Sequence 23 / 原作 TYPE JEWEL_WEAPON / 使用等級 Level 15 / 排序 Sort 10 / 兵器型 WeaponType 0 / 外形 WeaponObject 702 / 搜索型 SearchType 1 / 出現率 Rate 200 / Force 位 / Battle 位 / 圖示 Sprite WEAPONA3`）與註記「原作欄位為資料表原文 · 唯讀…」。
- **位置 / 改法**（沿用同檔既有的 `devToolsOn()`：原生 `cc.sys.isNative` 或 `?rel=1` ⇒ false）：
  - `ItemsPanel.ts:536-549` `devToolsOn()`（既有，未改）→ `build()` 812 行 `this.devTools = devToolsOn();`
  - `ItemsPanel.ts:821-824` 新增四支調試 Label 一起收：`if (this.labelSectField) this.labelSectField.node.active = this.devTools;`，同構 `labelFieldKeys` / `labelFieldVals` / `labelDetNote`。
  - `ItemsPanel.ts:1757` 無選中態副文：`this.devTools ? '選中後顯示加成與原作欄位' : '選中後顯示加成與說明'`
  - `ItemsPanel.ts:1759-1762` 描述文案：devTools 版含「原作欄位（唯讀）」；正式版只到「裝上後差異。」
  - `ItemsPanel.ts:2106-2108` 原作欄位標題下分隔線包 `if (this.devTools)`。
  - `ItemsPanel.ts:2132-2143` 原作欄位表底下的註記帶（`noteRect` 帶底 + 雙線 + 三條分隔）整塊包 `if (this.devTools)`。
  - **headless 不受影響**：headless 沒有 `cc.sys.isNative`、也沒有 `?rel=1`，`devToolsOn()` 仍回 true → `panel_headless.mjs` 的「原作欄位 12 行」斷言照舊。
- **複跑**：`work\cocos_items; node panel_headless.mjs` → 143 斷言 / 0 失敗 / ALL PASS（仍打印原作欄位 12 行，屬預覽行為）。

### 3. 界面文案暴露 `garrison.json`

- **現象**：出征編成副標「守將 無（關卡：garrison.json 沒有守將）· 守軍 N 兵」。
- **位置 / 改法**：
  - `game\cocos\assets\scripts\DeployRoot.ts:1147` → `` `守 將 無（此關卡未配置守將）· 守軍 ${troops} 兵` ``
  - `DeployRoot.ts:976` 的 `console.warn` 文案同步去掉檔名（`'…退回劇本表'`），避免源碼字符串再出現該檔名。
- **複跑**：契約測試「玩家可見文本不再出現 garrison.json（去註釋後）」通過；DeployRoot 其餘 `garrison.json` 只在註釋裡（開發資料、不進包，見「未做/說明」）。

### 4. 說明頁：開發者口吻 + 大片空白

- **現象**：說明頁寫「750×1334 直屏，左上原點；頁頭 0–124、按鈕區底邊 1248（距底 86）」「所有面板共用 26 張九宮圖元…」「存檔 10 槽，鍵名 sanguo_*_v1…」；面板 670×880 只寫到上半，下半近 300px 純色空白。
- **位置 / 改法**：`game\cocos\assets\scripts\TitlePanel.ts:371-405` 重寫 `buildHelp()`
  - 副標 `'豎版重製 · 操作與資料來源'` → `'玩法與資料來源'`（376 行）
  - 面板改 `670×640 @ (40,260)`（377-379 行），10 行玩家說明：
    - 【入 門】開始新局 → 選劇本 → 選君主 → 大地圖。
    - 【節 奏】大地圖以「月」推進：內政 → 出征 → 月結；戰鬥即時進行。
    - 【操 作】點城池看詳情；己方城池可進內政，敵方城池可出征。
    - 【存 檔】10 個存檔位 · 讀檔會替換目前進度。
    - 【資 料】劇本、城池、武將、兵種、法術皆取自原作；素材與數值版權歸原權利人，本版僅供研究、移植。（保留資料來源署名）
  - 排版 `cursor = 270` 起、標題行 −50 / 文句行 −70（395-401 行），內容鋪滿 640 高卡片，消除下半空白。
  - 同檔標題頁同步清理（P2-2）：296 行副標改 `${firstYear} — ${lastYear} · ${cards.length || 5} 套劇本`（去「直屏 750×1334」）；313 行提示改「戰鬥即時進行」（去 60Hz）；322 行存檔卡改「10 槽 · 讀檔會替換目前進度」（去 `sanguo_*_v1`）。
- **複跑**：契約測試「說明頁 / 標題頁不再暴露內部鍵名、畫面規格與開發口吻」通過；標題頁不在本輪 headless 覆蓋範圍（沒有現成腳本），需出包後截圖複核。

### 5. 物品底欄空按鈕位

- **現象**：截圖底欄「裝備」與「返回」之間有一顆**沒有字的按鈕底板**（原 web「全部解鎖」位置 430..576）。2.9 包裡文字/Skin 已按 devTools 藏掉，但 `drawFrame()` 仍無條件畫底板 → 空按鈕位。
- **位置 / 改法**：`ItemsPanel.ts:2145-2174` 底欄繪製
  - `unlockBtn` 底板三段（`paintBands` + `topSheen` + `strokeRect`）整塊包 `if (this.devTools)`（2167-2174 行）
  - 命中區原本已受控：`if (this.devTools) this.addHit(LAYOUT.unlockBtn, …)`（1907 行）
  - 註釋更新為「正式包以前連底板都畫（Label/Skin 已藏 → 留下一個沒有字的空按鈕位），現在底板與命中一起收」（2149-2150 行）
- **複跑**：items headless 全綠（預覽/調試台仍顯示「全部解鎖」）。
- **遗留**：正式包底欄只剩「裝備」「返回」兩顆，中間留 170px 間隔；詳情卡下半（原作欄位原位置，826..1140 開發區）也成為空白。屬刻意收起，未在本輪重排（見「未做/說明」）。

### 6. 戰報年份（未改，CampaignRoot.ts 禁改）

- **現象**：ui_sweep P1-5 記錄戰報新事件標成「1 年 1 月」（實際 2 年 1 月），與頁頭「西元 2 年 1 月」口徑不一致。
- **取證**：
  - 2.9 真機存檔 `F:\sanguo\work\ui_sweep\save_after_p11.json`：`sanguo_campaign_v1` month=13、year=2；`sanguo_battlelog_v1` 40 條，最後兩條 `t='1年1月'`（`內 政 終 了：本年內政窗口收束…`、`大 地 圖：結束內政 → 跑完一年（1 月 → 13 月）`），其餘已到 `2年1月`。→ 舊實現把**年內月號**當絕對月傳給 `monthStamp`。
  - 戰報與月推進全部在 `CampaignRoot.ts`（禁改）：`monthStamp` 564-569 行、`battleLogLine` 634-636 行、頁頭 3090 行 `西元 ${adYearOfMonth(save.month, this.startYear)}年 ${month}月`；所有 `battleLogLine` 調用點傳 `this.save.month`。
  - 該檔 mtime 16:58（晚於 ui_sweep REPORT 14:22 與 2.9 存檔 13:58），已重寫為 R225 時鐘制：舊的「內政窗口收束 / 跑完一年（1 月 → 13 月）」兩行在現源碼已不存在；`enterInterior` / `endInterior`（2688-2715 行）改用 `battleLogLine(this.save.month, …)`，與頁頭同源同一 `save.month` → 口徑自洽。
- **結論**：**本輪不改**。舊 bug 已被 R225 時鐘重構消解，且任何殘留都只能改 `CampaignRoot.ts`（禁改）。建議 lead 用 3.5 正式包真機複核戰報首行年份。
- **另需 lead 決策**：現源碼戰報/hint 文案仍帶開發口吻（`原作 T=0 · 0x41B6CF`、`0x41BBF5 → T=3600`、`原作一年 = 3600 tick`、`一年 ≈ 60 秒，一月 ≈ 5 秒`），全在 `CampaignRoot.ts`，本輪按約束未動。

### 7. 名冊淳于瓊「在職」但 garrison 是野將

- **根因**：`GeneralBook.ts` 的 `mergeRow()` 狀態兜底用靜態 `rec.Status`（劇本 0 的狀態）。`generals.json` 淳于瓊靜態 `Status='登'`，而 `status_by_times[1]='野'`、`city_by_times[1]='平原'` → 《討伐董卓》（劇本 index 1）名冊把它算成在職，與 `OfficersOfCity.ts` 運行時 `statusOfGeneral()`（讀 `status_by_times[scenIdx]`）不一致；且 `save.generalStatus` 在 Cocos 存檔裡沒有寫入者（恆空），舊兜底必然吃靜態值。
- **位置 / 改法**：`game\cocos\assets\scripts\GeneralBook.ts`
  - `:56` import 補 `statusOf`（與既有 `cityOf` 同源，`CityModel.ts:649-668`，無新依賴、無循環引用）
  - `:466-474` 狀態兜底改 `statusOf(rec as unknown as CityGeneral, intOr(ctx.scenIdx, 0, 0))`，優先序保持：存檔 `generalStatus`（web 檔兼容）→ 城內守將運行時 `officer.rec.status` → 劇本 `status_by_times[scenIdx]`。
- **驗證**（自建 `work\ui_p2\verify` 用**改後的** GeneralBook 現編 CommonJS，不是 work\cocos_book 的舊 `_sim`）：
  - `cd work\ui_p2\verify; $env:NODE_PATH='F:\sanguo\work\cocos_book\_sim\node_modules'; node item7_verify.mjs` → **11 斷言 / 0 失敗**
  - 劇本 index 1：淳于瓊 `status='野' / statusText='在野' / city='平原'`；舊靜態 `Status='登'`、`status_by_times[1]='野'`（證明舊兜底確實錯）
  - 401 將逐將比對「名冊狀態 == 運行時口徑」全一致
  - 平原 7 守將：4 在職（關羽/劉備/張飛/簡雍）+ 3 在野（淳于瓊/蔣義渠/管輅），與 garrison.json 一致
- **副作用檢查**：`work\cocos_book; node model_assert.mjs` → 277/277（劇本 0 的 `status_by_times[0]` 與靜態 Status 一致，故基線不變）。注意該腳本用的是 `work\cocos_book\_sim`（mtime 12:37，早於本輪改動），277 綠**不代表** item 7 已回歸，item 7 的證據以上面自建 sim 為準。

## 新增契約測試

`game\tests\ui_no_dev_leaks.test.ts`（8 個 test，全過）：

1. `[新設計]` 不再出現在 CityListPanel / EndingPanel / DeployRoot / TitlePanel / ItemsPanel / GeneralBook（含註釋）。
2. 去註釋後的源碼不得再出現 `garrison.json`，並斷言 DeployRoot 已用「此關卡未配置守將」玩家口吻。
3. `原作欄位` 除 ItemsPanel 外不得出現；ItemsPanel 內每一處都必須在同/前一行 `devTools` 三元內，或在受 devTools 門控的 `labelDetNote` 文本塊裡。
4. ItemsPanel 的 `devToolsOn()` 判定（`isNative` / `rel=1`）、`this.devTools = devToolsOn()`、四支調試 Label 的 `node.active = this.devTools`、解鎖主/副文本與 `addHit(LAYOUT.unlockBtn)` 門控齊全。
5. ItemsPanel 三處除錯繪製（原作欄位分隔線 / `noteRect` 註記帶 / `unlockBtn` 底板）都在 `if (this.devTools)` 內。
6. TitlePanel 玩家可見文本不得出現 `sanguo_`、`750×1334`、`頁頭 0`、`九宮`、`60Hz`；保留「玩法與資料來源」與「版權歸原權利人」署名。
7. 城池一覽 / 結局頁底部提示已改玩家口吻。
8. `stripComments()` 自身行為（字符串裡的 `//` 不誤剝）。

> 說明：契約對「玩家可見文本」做斷言，因此先剝 `//` / `/* */` 註釋——註釋是開發資料、不進正式包；代碼裡的字符串字面量與文案全部受約束。ItemsPanel 註釋中的 `garrison.json` / `原作欄位`（開發說明）按此口徑保留。

## 門禁與複跑結果（實測）

| 檢查 | 命令 | 結果 |
|------|------|------|
| 全倉型別 | `cd F:\sanguo\game; node node_modules\typescript\bin\tsc --noEmit` | **EXIT=0** |
| Cocos 型別 | `cd F:\sanguo\game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **EXIT=0** |
| 全倉測試 | `cd F:\sanguo\game; node --test "tests/*.test.ts"` | **1903 tests / 1902 pass / 0 fail / 1 todo**（基線 1894 pass + 新增 8 = 1902，無新增失敗） |
| 物品面板 headless | `cd F:\sanguo\work\cocos_items; node panel_headless.mjs` | **143 斷言 / 0 失敗 / ALL PASS** |
| 名冊面板 headless | `cd F:\sanguo\work\cocos_book; node panel_headless.mjs` | **161/161 通過 ✅** |
| 名冊 model 斷言 | `cd F:\sanguo\work\cocos_book; node model_assert.mjs` | **277/277 通過**（用舊 `_sim`，不含 item 7 改動） |
| item 7 專項 | `cd F:\sanguo\work\ui_p2\verify; $env:NODE_PATH=…; node item7_verify.mjs` | **11/11 通過 ✅**（用改後源碼現編 `_sim`） |
| 新契約測試 | `cd F:\sanguo\game; node --test tests\ui_no_dev_leaks.test.ts` | **8 pass / 0 fail** |

## 未做項 / 風險 / 給 lead

1. **item 6 未改**：見上，`CampaignRoot.ts` 禁改且 R225 重構已改回與頁頭同源口徑。另 CampaignRoot 戰報文案仍含「原作 0x…」開發口吻與 `T=3600` 時鐘細節，需 lead 決定是否另派（本輪不可動）。
2. **物品詳情卡下半留白**：正式包收起原作欄位後，詳情卡 826..1140（原 12 行表格與註記帶位置）成為空白；底欄中間留 170px 間隔。屬「隱藏除錯區」的必然結果，本輪未重排 LAYOUT（避免動座標影響 headless 與其他面板）。可後續把「描述/預覽」下移或擴高詳情卡。
3. **`work\cocos_book\_sim` 是舊編譯產物**（mtime 12:37 < GeneralBook.ts 17:06）：該目錄屬 cocos_book 線程（另有同事在修面板），本輪未覆蓋；建議出包前重建 `_sim` 再跑一次 277/161 作最終回歸。
4. **未做真機驗證**（約束禁模擬器）：所有面板行為靠 headless + 源碼契約驗證。出 3.5 包後建議用原生（`isNative`）與 `?rel=1` 各截一張物品頁 / 說明頁 / 標題頁，確認除錯區確實收起、無空按鈕位。
5. **TitlePanel.ts 文件頭註釋**仍寫「750×1334、頁頭 0–124」等開發版式說明——屬代碼註釋，不顯示給玩家，未動。
6. `DeployRoot.ts` 等檔註釋中的 `garrison.json` 保留（開發資料）；契約測試按「去註釋」口徑斷言，若要求連註釋也清零需另定口徑。

## 修改文件清單

- `game\cocos\assets\scripts\CityListPanel.ts`（443）
- `game\cocos\assets\scripts\EndingPanel.ts`（467）
- `game\cocos\assets\scripts\DeployRoot.ts`（976、1147）
- `game\cocos\assets\scripts\ItemsPanel.ts`（821-824、1757、1759-1762、2106-2108、2132-2143、2145-2174）
- `game\cocos\assets\scripts\TitlePanel.ts`（296、313、322、371-405）
- `game\cocos\assets\scripts\GeneralBook.ts`（56、466-474）
- `game\tests\ui_no_dev_leaks.test.ts`（新增）
- `work\ui_p2\verify\tsconfig.sim.json`、`work\ui_p2\verify\item7_verify.mjs`（item 7 驗證腳本，非產品代碼）
- `work\ui_p2\REPORT.md`（本報告）

未動：`CampaignRoot.ts`、`game\web\**`、`game\src\core\**`；無 `git add/commit`；無構建。
