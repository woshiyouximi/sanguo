# 127 Cocos 結局與城池列表

> 任務：Cocos 3.8.8 補「結局畫面」（c5）與「城池列表視圖」（c4）。
> 範圍：新建 4 個 TS 檔 + 2 個斷言腳本；**未改** `game\web\**`、`game\src\**`、`game\tests\**`、`project\37a|31|44`、`CampaignRoot.ts`、`CityPanel.ts`、`ItemsPanel.ts`、`DeployRoot.ts`、`BattleRoot.ts`、`BattleHud.ts`、`GameState.ts`、`UiSkin.ts`、`MonarchModel.ts`、`SurrenderPanel.ts`、`SaveSlots.ts`。
> 未建 `.scene`；面板掛現有場景 Canvas，`destroy()` 收尾。

## 0. 結論

| 驗收 | 結果 |
| --- | --- |
| `tsc -p tsconfig.check.json --noEmit` | **EXIT=0**（09:44 最終複查，全倉 0 error） |
| `work\cocos_endlist\model_assert.mjs` | **PASS 141 / 141** |
| `work\cocos_endlist\panel_headless.mjs` | **PASS 121 / 121** |
| 待 lead 接線 | 結局入口 1 處、列表 tab 1 處、`onPick`/`onRestart` 各 1 個回調（見 §6） |

**tsc 時序註（重要）**：09:36 與 09:44 兩次全倉 `tsconfig.check.json` 都是 **EXIT=0**（0 error）。中間 09:41–09:42 並行 agent 的 `GameState.ts:357/363`（`runKey` 不在 `CampaignSave` 上）與 `ForcesPanel.ts:781`（`rowNodes` 不存在）曾短暫把全倉 tsc 打成 EXIT=2——**這兩處都不是本 agent 的檔案，也未被我修改**，現已由對應 agent 修好。本 agent 的 4 個檔用 `work\cocos_endlist\tsconfig.mine.json` 單獨 tsc 亦為 **EXIT=0**。

## 1. 交付物

| 檔案 | 行數/大小 | 內容 |
| --- | --- | --- |
| `game\cocos\assets\scripts\EndingModel.ts` | 521 行 / 17.1 KB | 純邏輯：判定、統計、文案、簽名、清存檔；**不 import cc** |
| `game\cocos\assets\scripts\EndingPanel.ts` | 753 行 / 25.5 KB | 結局面板：背景三級降級、標題 40、正文、四格統計、印章、重開 |
| `game\cocos\assets\scripts\CityList.ts` | 502 行 / 15.0 KB | 純邏輯：60 城列、關係、篩選、排序、分頁、選中；**不 import cc** |
| `game\cocos\assets\scripts\CityListPanel.ts` | 815 行 / 27.6 KB | 列表面板：7 欄 × 15 行、4 篩選 tab、2 排序鍵、分頁、返回 |
| `work\cocos_endlist\model_assert.mjs` | 454 行 / 18.9 KB | 純邏輯斷言 141 條（mock `cc` 都不需要） |
| `work\cocos_endlist\panel_headless.mjs` | 406 行 / 17.1 KB | 真節點樹走查 121 條（mock `cc`） |
| `work\cocos_endlist\tsconfig.sim.json` | — | 把 4 檔編到 `_sim\` 給 node 跑 |
| `work\cocos_endlist\_sim\` | — | 從 `work\cocos_surrender\_sim` 複製的 mock `cc`（補了 `Color.fromHEX`） |

執行方式：

```powershell
cd F:\sanguo
node work\cocos_endlist\model_assert.mjs
node work\cocos_endlist\panel_headless.mjs
cd game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
```

## 2. 結局

### 2.1 判定：`EndingModel.ts:446 endingOf(save, cities, generals)`

純函式，回 `EndingState | null`；**不改 save**。優先級嚴格按任務書：

| 順位 | 條件 | kind | reason | label | title |
| --- | --- | --- | --- | --- | --- |
| ① | `validOwnedOf(save).length >= 60` | `unify` | `unify` | `統一` | 天下統一 |
| ② | 君主陣亡且無繼承（`isMonarchLost`） | `fall` | `monarch` | `滅亡` | 勢力滅亡 |
| ③ | 玩家城數 = 0 | `fall` | `no-city` | `滅亡` | 勢力滅亡 |
| ④ | 其餘 | `null` | — | — | — |

- `validOwnedOf`（`EndingModel.ts:326`）只算劇本 `cities[].NAME` 真正存在的城名，存檔裡的重複/未知城名不計；`owned` 去重後才計數。
- `isMonarchLost`（`EndingModel.ts:198`）依序看 `monarchExtinct === true`、`monarchDead === true`、`kingDead === true`、`forces[force || playerForce || king || monarch].alive === false`。**注意**：`MonarchModel.extinguish` 會把 `monarch/force/king` 清空（見 `MonarchModel.ts` 的 `extinguish`），所以 lead 必須把 `monarchExtinct` 一起併進傳給 `endingOf` 的 save，否則「君主亡」會被誤判成「0 城」。`EndingPanel.showIfEnded` 的 hook 已示範 `{ ...this.syncMonarchState(), monarchExtinct: this.monarchExtinct }`。
- 統計 `endingStatsOf`（`:343`）：
  - `cityCount` = 去重且存在的 owned 數；
  - `generalCount` = `save.roster` 去重武將數，沒有 roster 時 fallback `generals[].CITY ∈ owned`；
  - `startForces` = 城池 `KING` 非純數字去重 + 玩家勢力；`aliveForces` = 非玩家城 owner/KING 去重 + 玩家（若有城）；`brokenForces = max(0, startForces - aliveForces)`；
  - `month` 1 起算，`elapsedMonths = max(0, month - 1)`；`durationTextOf`（`:307`）輸出「不足一月 / 1 個月 / 1 年 3 月」。
- `endingSignature`（`:474`）把 kind/reason/owned 數/月/統計拼成穩定字串，面板用它避免同一局重複彈。

### 2.2 文案（`[新設計]`）

**依據**：原作結局台詞在倉庫裡找不到——`docs\04c_世界与内政.md:23-26` 只證明原作有 `0x4A6440` 階段機（1/2/3 結局分支）與結局處打印 `0x4898E4 "%3d年%2d月%2d日"`，全 docs 無結局字串；web `campaign.html` 也沒有「統一/滅亡」結局文案；`docs\02-美术资源与格式.md:45,433` 提到原作 `SHAPE\END1-3` 結局圖，但明說不建議複用、倉庫未導出。因此：

- 標題/印章保留原作的兩類詞：`統一` / `滅亡`；
- 三段正文、kicker、epithet、coda、foot 均為 `[新設計]`（`EndingModel.ts:386-411`）。

統一（`EndingModel.ts:387-394`）：

```text
天下統一
群雄割據 · 終章
　　烽煙起於州郡，豪傑並起；十餘年間，城頭旗號幾度易主。{君主} 自一隅起兵，終於盡取天下 60 城。
　　自起兵至今日，凡 {用時}；麾下 {武將} 將，破 {擊破} 家諸侯。山河歸一，刀兵入庫。
　　（第三段由 endingOf 的固定段落補齊）
四海歸一 · 天下太平
```

滅亡分兩套段落：`reason === 'monarch'`（君主亡）與 `reason === 'no-city'`（0 城），見 `EndingModel.ts:396-411`。`label` 欄位精確只有 `'統一' | '滅亡'` 兩值（`:110`），方便日後若找到原作文案只換正文。

### 2.3 畫面

`EndingPanel.ts:62 ENDING_LAYOUT`（750×1334，左上原點；頁頭 0–124；按鈕底邊 1248 = 1334 − 86）：

| 區塊 | rect | 說明 |
| --- | --- | --- |
| header | `0,0,750,124` | 深底 + 金線（`drawFrame`），與大地圖頁頭一致 |
| kicker | `55,52,640,28` | 22 字，`COLORS.gold` |
| title | `45,82,660,60` | **40 字**，`goldLight`，粗 |
| rule | `315,152,120,2` | 金線 |
| bodyPanel | `55,176,640,300` | `frame_panel` 九宮 + 深底 214 alpha |
| body | `77,196,596,260` | **18 字**，行高 32，3 段各加「　　」縮排 |
| 統計四格 | `17,516`，`170×96`，gap 12 | `plate_sq`；標題 **22 字**、數值 **20 字** |
| 印章 | `309,640,132,132` | `plate_sel`；大字 40、兩行（統一/滅亡） |
| epithet | `55,790,640,34` | 22 字 |
| coda | `95,930,560,96` | 18 字，兩行 |
| endMark | `255,1050,240,44` | 「— 終 —」 |
| 重開 | `195,1184,360,64` | `plate_btn`，22 字；底邊 1248 |
| foot | `75,1262,600,24` | 16 字 `[新設計]` 提示 |

結構樹（headless 實際 dump，`dump_tree.mjs`）：

```text
EndingPanel
  EndingBg                 ← ArtBg cover；bg/map_bg → map/chinamap → Graphics 剪影
  EndingFrame              ← Graphics：剪影/漸層/裂痕/光暈/金線
  EndingVeil               ← 全屏 {0,0,750,1334} 196 alpha（addVeil 雙重偏移 bug 的不動點）
  EndingBodyPanel
    Frame_frame_panel
  EndingKicker  «群雄割據 · 終章»
  EndingTitle   «天下統一»
  EndingBody    «　　烽煙…⏎　　自起兵…⏎　　…»
  EndingEpithet «四海歸一 · 天下太平»
  EndingCoda    «後世修史…⏎{君主} 之名，遂列於本紀。»
  EndingEndMark «— 終 —»
  EndingFoot    «此局已結 · 重新開始將清除本局進度　[新設計]»
  EndingStatCell0..3
    EndingStatHead0..3  «用時/城數/武將/擊破勢力»
    EndingStatValue0..3 «2 年 3 月 / 60 / 60 / 20 / 2»
  EndingSeal
    EndingSealText «統⏎一»
  EndingRestart
    EndingRestartLabel «重新開始»
```

**無資源降級**（任務硬約束）：

1. `ArtBg` 先載 `bg/map_bg`；失敗自動改載 `map/chinamap`；兩者都失敗 → `drawSilhouette`（`EndingPanel.ts:557`）用 Graphics 畫 3 塊中國地圖剪影 + 經緯線 + 10 個城點 + 金線邊框，**不白屏**。
2. `UiSkin.makeNineSlice/makeBtn/makePanel` 在 `ui/*.png` 缺失時自帶 Graphics 深底 + 金線描邊（`UiSkin.ts` 的 `drawFallback`），headless 已驗證整屏仍成立。
3. 全屏暗幕 `EndingVeil` 永遠存在；即使背景全失敗，文字仍有深色底。

入口（`EndingPanel.ts`）：

- `static show(parent, state, options)`（`:189`）：同一父節點下只建一個 `EndingPanel`，重複呼叫重用並刷新。
- `static showIfEnded(parent, save, cities, generals, options)`（`:204`）：內部呼叫 `endingOf`，未結束回 `null` 且**不建節點**；同簽名已開著則直接回舊 panel。
- `isOpen`（`:231`）、`currentState`（`:235`）、`signature`（`:239`）、`build()`（`:247`，冪等）、`open()`（`:399`）、`close()`（`:415`）、`restart()`（`:611`）、`tap(x,y)`（`:624`）、`debug()`（`:648`）、`onDestroy` 解監聽。
- `restart()`：`clearRunStorage(this.storage ?? sys.localStorage)`（`EndingModel.ts:486`，先 `length/key` 枚舉刪所有 `sanguo_*`，沒有枚舉能力時刪已知鍵清單）→ `restarts++` → `onRestart()`；沒有回調則 `close()`。**不清 `RunSetup` 以外的玩法資料**（RunSetup 在倉庫中不存在，見 §7）。

## 3. 城池列表

### 3.1 列定義（`CityListPanel.ts:106 CITY_LIST_COLUMNS`）

| 欄 | x / w | 對齊 | 來源 |
| --- | --- | --- | --- |
| 城名 | 26 / 150 | left | `city.NAME` |
| 勢力 | 180 / 150 | left | 己方=玩家；敵方=owner/KING；無主=`無主` |
| 太守 | 334 / 88 | left | `appointed[name].major || city.MAJOR || '—'` |
| 守軍 | 426 / 74 | right | `runtime.troops`，缺省 `min(floor(POP/2500)+110,600)` |
| 預備 | 504 / 74 | right | `runtime.prep`，缺省同上 cap |
| 金錢 | 582 / 72 | right | `runtime.money`，缺省 `city.MONEY` |
| 關係 | 660 / 70 | center | 己方/敵方/無主（`ok`/`enemyLight`/`textFaint`） |

字級：標題 **40**、副標/表頭/tab **18**、頁碼 **20**、提示 16；全部 750×1334 設計座標。

### 3.2 分頁 / 篩選 / 排序

- **分頁**：`CITY_PAGE_SIZE = 15`（`CityList.ts:17`）、`CITY_TOTAL = 60`（`:18`）→ 固定 4 頁；面板 always 建 15 組行節點（`CityListPanel.ts` 的 `rowCells`），翻頁只改文字，**不重建節點**。末頁 60 剛好 15 行。
- **篩選**：`all / ours / enemy / neutral` 四 tab；`counts()`（`CityList.ts:237`）的 `ours + enemy + neutral === total === 60`。篩選改變時 `page` 自動夾到有效範圍。
- **排序**：單一排序鍵 `name | force`，再點同鍵切 `dir` 1/-1；`compareText`（`CityList.ts:146`）用 **code-point** 比較，**不用** `localeCompare`/ICU 拼音——跨 Windows/Android/iOS 與 node 結果完全一致。`force` 鍵同勢力時以**城名 code-point** 作 tie-break，所以排序穩定可重現。
  - **取捨**：只做單鍵是因為任務書明說「單一排序鍵即可」；雙鍵（例如先勢力再守軍）會讓 UI 需要兩個 chip 的組合狀態，且 60 行資料量下收益低。代價是無法按守軍/金錢排序，已在 §7 列為未做。
- 選中：`setSelected` 只存名字；面板在當前頁畫 30 alpha 金色行底 + 左側 3px 金條，並在表頭左側加小三角提示（`drawStatic`，`CityListPanel.ts:632`）。

### 3.3 畫面

`CityListPanel.ts:70 CITY_LIST_LAYOUT`：

| 區塊 | rect | 說明 |
| --- | --- | --- |
| header | `0,0,750,124` | 標題「城池一覽」40；副標 18；右上「關 閉」 |
| 篩選帶 | `0,124,750,104` | 4 tab：`x = 18 + i*174`，`164×44`，y 136；`plate_sq` + `plate_sel` 活動牌 |
| 排序列 | `474,184,100,36` / `584,184,100,36` | 「城名」「勢力」chip，活動鍵顯示 ↑/↓ |
| 表格 | `14,228,722,884` | `frame_panel`；表頭 44；行 `y = 272 + i*56`，高 56 |
| 分頁 | `18,1120,110,44` / `150,1120,450,44` / `622,1120,110,44` | 上頁 / 「第 x / y 頁 · a–b 筆」/ 下頁 |
| 返回 | `195,1184,360,64` | 底邊 1248 = 1334 − 86 |
| 提示 | `75,1262,600,24` | 16 字 |

結構樹（headless 實際 dump，節錄）：

```text
CityListPanel
  CityListBg                 ← 全屏 {0,0,750,1334} 不透明深底
  CityListTableFrame
  CityListFrame              ← Graphics：頁頭金線/表頭底/行底/選中高亮/分隔線
  CityListTitle  «城池一覽»
  CityListSub    «共 60 城 · 己方 20 · 敵方 30 · 無主 10»
  CityListClose
    Label_關 閉
  CityListFilterPlate0..3
  CityListFilterActive       ← 當前 tab 的 plate_sel
  CityListFilterLabel0..3    «全部/己方/敵方/無主»
  CityListSortCaption «排序»
  CityListSortPlate_name / _force
  CityListSortActive
  CityListSortLabel_name  «城名 ↑»
  CityListSortLabel_force «勢力»
  CityListHead_name/force/major/troops/prep/money/relation
  CityListRow0_name..relation   ← 15 組，固定複用
  …
  CityListRow14_name..relation
  CityListPage   «第 1 / 4 頁 · 1–15 筆»
  CityListPrev / CityListNext
  CityListBack
  CityListFoot   «點一行選城 · 回大地圖即可查看　[新設計]»
```

### 3.4 互動

- `tap(x,y)`（`CityListPanel.ts:706`）用設計座標命中 hits：4 個 `filter:*`、2 個 `sort:*`、`row:<城名>`（當前頁 15 行）、`prev`/`next`、`close`/`back`。
- 點行 → `pick(name)`（`:522`）→ `model.pick`（`CityList.ts:322`，無效城名/空白回 `null` 且不改 selected）→ `refresh()` → `onPick(cityName)`；**不自動關閉**，讓 lead 決定是切回地圖還是留著。
- `setFilter`（`:498`）、`setSort`（`:504`，同鍵切方向）、`nextPage`（`:510`）、`prevPage`（`:516`）都是公開方法，headless 直接呼叫；`debug()`（`:730`）回 opened/filter/sort/dir/page/pages/total/counts/pageRows/selected/sub/pageText/tabLabels/sortLabels/rowTexts/visibleRows/hitNames/nodeCount/childCount。
- `close()`（`:478`）`input.off` + `node.active=false`；`onDestroy` 同樣解監聽。

## 4. 斷言

### 4.1 `model_assert.mjs`：141 / 141

分 8 組：

1. **四種結局 × 邊界（每種 ≥3 樣本）**：統一（60 城 / 重複城名 / 含未知城名）、君主亡（`monarchExtinct` / `forces.alive=false` / `monarchDead` / `kingDead`）、0 城（空 owned / 只有未知城名 / 無城池資料）、未結束（1 / 20 / 59 城、null/undefined 存檔）。
2. **優先級**：60 城 + 君主亡 → 統一；60 城 + `forces.alive=false` → 統一；0 城 + 君主亡 → 君主亡；0 城無旗標 → 0 城。
3. **統計**：duration 1/2/13/14/28 月、`validOwnedOf` 過濾未知城、roster fallback、`isMonarchLost`、`endingOf` 不就地改存檔。
4. **60 城 4 頁、每頁 15、末頁 15**：逐頁驗證 + 越界夾頁 + next/prev 邊界。
5. **篩選**：`ours=20 / enemy=30 / neutral=10 / total=60`，三者之和 = 60；**排序穩定**：城名 code-point 遞增、勢力遞增且同勢力按城名、翻轉後完全鏡像。
6. **onPick**：回傳城名在 60 城內；無效/空字串回 null 且不改 selected。
7. **列內容**：己方/敵方/無主的 relation/force/major/數字欄位；runtime 缺值時用劇本補。
8. **重開**：`clearRunStorage` 枚舉刪 `sanguo_*`、保留非 `sanguo_`、無 length/key 時刪已知鍵、null storage 回空陣列。

### 4.2 `panel_headless.mjs`：121 / 121

結局屏（真節點樹 + mock `cc`）：

- 未結束時 `showIfEnded` 回 `null` 且不建節點。
- 統一：kind/reason/label/title/印章、正文 3 段且每段「　　」開頭、4 個統計標題與值（城數 `60 / 60`、擊破 `1`——此 fixture 的城池 KING 只有劉備/曹操）、`hitNames=['restart']`、`nodeCount > 25`、節點樹文字 ≥10 且含「終」「重新開始」。
- 無圖時 `mapState='failed'`（剪影路徑）；`cc.__setAsset('bg/map_bg')` 後 `mapState='ready'` 且 `__loadLog` 確實有載入記錄。
- 點重開：`tap(205,1194)` 命中、`onRestart` 1 次、`clearRunStorage` 清 3 個 `sanguo_*`、保留無關鍵、重開後仍開著（等 lead 換場景）。
- 重複 `showIfEnded` 重用同一面板、不重複節點；`close()` 後 `opened=false`。
- 滅亡：`reason='no-city'`、title「勢力滅亡」、印章「滅亡」、stats 0 城。

列表頁：

- 60 城 / 4 頁 / 第 0 頁 / 15 行可見 / 15×7 格全非空 / 副標「共 60 城 · 己方 20 · 敵方 30 · 無主 10」/ 頁碼「第 1 / 4 頁」/ 4 個 tab / 2 個排序 chip / 節點數 > 120 / 所有 hit 名稱齊全。
- 下一頁 → 第 2 頁首行 = 排序後第 16 城；上一頁回首頁。
- 點三個篩選 tab：己方 20（2 頁）、敵方 30（2 頁）、無主 10（1 頁、10 行可見、頁碼 1/1）。
- 點行：`onPick` 收到當前頁首行城名、selected 落地、hit 名字正確；點第 4 行同理；無效 `pick` 不改 selected、不觸發回調。
- 點「勢力」排序：`sort=force`、`dir` 1 → -1、標籤變「勢力 ↑/↓」、換方向首行改變。
- 末頁 next 夾住、prev 回第 3 頁；close 後 `opened=false`、節點隱藏、`input` 監聽歸零；15 組行節點固定複用。

## 5. 版式與降級核對

- 750×1334 豎屏：`SCREEN = {0,0,750,1334}`（兩面板各自常數）；頁頭 **0–124**；按鈕底邊 **1248 = 1334 − 86**。
- 字級：結局 title **40**、kicker/epithet/seal-head **22**、正文/foot **18/16**、統計值 **20**；列表 title **40**、表頭/tab/副標 **18**、頁碼 **20**。
- 九宮：`frame_panel`（正文/表格）、`plate_btn`（重開/返回）、`plate_sel`（印章/活動 tab）、`plate_sq`（統計格/tab 底）。
- 降級：`UiSkin` 失敗 → Graphics 深底 + 金線；無立繪/地圖 → 地圖剪影；列表無九宮仍可用 Graphics 畫框與行底。headless 全程無 `ui/*.png`，兩個面板仍完整成立。

## 6. 給 lead 的接線 hook

### 6.1 結局：`CampaignRoot.start()` 末尾判一次

位置：`game\cocos\assets\scripts\CampaignRoot.ts:1087 start()`，插在 `SurrenderPanel.showIfNeeded(...)`（:1116-1121）之後、`} catch`（:1122）之前：

```ts
// import { EndingPanel } from './EndingPanel';
EndingPanel.showIfEnded(this.node, { ...this.syncMonarchState(), monarchExtinct: this.monarchExtinct },
  this.cities, this.generals, {
    onRestart: () => { GameState.resetCache(); director.loadScene('Boot'); },
  });
```

- `syncMonarchState()` 在 `CampaignRoot.ts:2416`，回傳本局合併視圖；`monarchExtinct` 在 `:1008`，來自 `sanguo_monarch_extinct_v1`（`:2581-2617`）。兩者一起傳，君主亡才不會被 `extinguish` 清空欄位掩蓋。
- `director` 已在 `CampaignRoot.ts:17` import；`GameState` 已 import（`:40`）。`GameState.resetCache()` 清記憶體快取，`Boot` 是倉庫唯一的前置場景（**沒有 Title.scene**）。
- 回調可換成 lead 自己的「清 RunSetup + 回標題」流程；面板只負責清 `sanguo_*` 與通知。

### 6.2 列表：頂欄加 tab

位置：`CampaignRoot.onLoad()`（`:1026`）建 label、`onTouch`（`:2301`）加命中。頁頭第一列標題右側有空位（標題 Label 25–355，但文字只佔左半）：

```ts
// onLoad：頁頭第一列，標題文字右側
const LIST_TAB = { x: 220, y: 16, w: 120, h: 48 };
this.labelList = this.makeLabel('列 表', 280, 42, 120, 20, COLORS.goldLight, 'center');

// onTouch 最前面：
if (x >= 220 && x <= 340 && y >= 16 && y <= 64) {
  CityListPanel.show(this.node, { save: this.save, cities: this.cities, generals: this.generals,
    selected: this.selected, onPick: (n) => { this.selected = n; this.refresh(); } });
  return;
}
```

- 需要 import `CityListPanel`。
- `onPick` 只改 `selected`，由 lead 決定是否 `this.select(n)` / 關面板 / 把地圖鏡頭移過去；面板本身不自動關。
- 若嫌 220–340 與標題字重疊，可把 `labelTitle` 寬度縮到 300、把 `FORCES_BUTTON`/`ITEMS_BUTTON` 各左移 20，再把 tab 放 355–475；這屬於 lead 的頁頭重排，我未改。

## 7. 沒做到 / 待接 / `[推測]`

1. **`RunSetup` 在整個倉庫不存在**（`game\web`、`game\src`、`game\cocos`、`project`、`docs` 全 grep 0 命中）。重開只做了「清 `sanguo_*` 存檔 + `onRestart` 回調」；`RunSetup` 的清理請 lead 在回調裡補。
2. **回標題頁未接**：倉庫只有 `Boot/Campaign/Battle/Deploy` 四個 scene，**沒有 Title.scene**；hook 用 `director.loadScene('Boot')`，是否正確的「標題頁」由 lead 確認。
3. **列表 tab 未接**：`CampaignRoot.ts` 是禁改檔，只給 §6.2 的 6 行 hook；頂欄 tab 的選中態（地圖/列表二選一）也未做。
4. **`onPick` 未接大地圖**：只回傳城名；`this.selected`/`select()`/鏡頭移動由 lead 接。
5. **沒有真機/真資源截圖**：headless 全程 mock，九宮與立繪走的是「缺圖降級」路徑；真資源成功路徑只驗了 `loadSkinFrame`/`ArtBg` 的回調與 `__loadLog`，沒有在 Cocos 編輯器或微信裡看過實際像素。[推測] 真機上 `frame_panel` 的 8px insets 在 640×300 下會被拉伸，視覺上可能比 mock 更「薄」，但幾何與文字框不受影響。
6. **結局立繪**：原作 `SHAPE\END1-3` 未導出，倉庫沒有結局圖；現在用 `bg/map_bg` → `map/chinamap` → Graphics 剪影三級。若美術日後給 `END1-3`，把 `EndingPanel.build()` 的 `bg.load('bg/map_bg')` 改路徑即可，其餘不動。
7. **結局文案是 `[新設計]`**：docs/04c 只有階段機、web 版無文字、原作 END 圖未導出；若之後找到原作台詞，只換 `EndingModel.ts:386-411` 的 `title/kicker/paragraphs/epithet/coda`，判定與統計不動。
8. **列表沒有滾動**：Cocos 端沒用 `ScrollView`，以「15 行/頁 + 上下一頁」代替；60 城共 4 頁。若日後城數 > 60，改 `CITY_TOTAL`/`CITY_PAGE_SIZE` 與 `TOTAL_CITIES` 三處即可，但「4 頁」的文案與測試要同步。
9. **擊破勢力數的來源**：目前以「城池 `KING` 去重 + 玩家」為開局勢力、以 runtime owner/KING 為現勢；若存檔的 `save.forces` 比城池表更全（例如已滅勢力不在任何城的 KING 裡），數字可能偏低。`[推測]` 對當前 60 城劇本（魏蜀吳 + 無主）等價；若 lead 的 `forces` 權威，可把 `forceStatsOf`（`EndingModel.ts:223`）改成優先讀 `save.forces`。
10. **只做單一排序鍵**：無法按守軍/金錢/太守排序；任務書允許，已在 §3.2 說明取捨。
11. **沒有音效/BGM**：`audio.js` 的結局曲（`game\web\audio.js:215-216` 註釋「結局要的是 18 號」）未接；Cocos 端也沒有 AudioSource。
12. **沒有做 `SaveSlots` 整合**：重開只清 `sanguo_*`，沒有刪 web 版 `sanguo_saves_v1` 的槽內容之外的其他槽（它前綴也是 `sanguo_`，實際會被 `clearRunStorage` 一併清掉——這是刻意的「重新開始＝清本局」語義，若 lead 想保留手動存檔槽，需把 `RUN_SAVE_KEYS` 收窄）。

## 8. 決策記錄

- **純邏輯與面板分離**：`EndingModel.ts` / `CityList.ts` 不 import `cc`，所以 `model_assert.mjs` 不需要 mock，跑得比 headless 快，也讓 lead 可在任何地方重用判定。
- **判定用 `validOwnedOf` 而非直接 `owned.length`**：避免存檔裡殘留舊劇本城名把「未結束」誤判成「統一」；同時 `TOTAL_CITIES = 60` 是常數，與 `CityList.CITY_TOTAL` 對齊。
- **優先級先統一後滅亡**：任務書明確要求；實作上 `endingOf` 先算 `cityCount`，只有 `< 60` 才看君主亡，再看 0 城。
- **結局背景三級降級**：`bg/map_bg` 是 832×1216 的舊地圖底，`cover` 鋪滿 750×1334 視覺最穩；`chinamap` 1280×960 是全國圖，作為第二選擇；兩者都缺才畫剪影。暗幕固定 196 alpha，保證文字對比度。
- **列表排序用 code-point**：`localeCompare('zh')` 在 node/Windows/Android 的 ICU 版本不同會給不同結果，headless 與真機就無法共用同一組斷言；code-point 雖然不是拼音序，但穩定、可測、與 web 版「按城名」的粗略行為一致。
- **列表固定 15 組行節點**：翻頁只改 `Label.string` 與 `active`，避免每頁重建 105 個 Label；`debug().rowTexts` 永遠 15×7，方便斷言「複用」。
- **面板不自動關閉**：`onPick` 交給 lead，因為「點列表→跳地圖」與「點列表→留在列表看詳情」兩種產品決策都合理；面板只保證 selected 高亮。

## 9. 變更清單（本 agent 實際寫入）

```text
game\cocos\assets\scripts\EndingModel.ts     新增
game\cocos\assets\scripts\EndingPanel.ts     新增
game\cocos\assets\scripts\CityList.ts        新增
game\cocos\assets\scripts\CityListPanel.ts   新增
work\cocos_endlist\model_assert.mjs          新增
work\cocos_endlist\panel_headless.mjs        新增
work\cocos_endlist\tsconfig.sim.json         新增
work\cocos_endlist\_sim\**                   新增（mock cc + 編譯產物）
work\cocos_endlist\dump_tree.mjs             新增（臨時，報告用）
project\127_Cocos结局与列表.md               新增
```

未觸碰任何禁改檔；`game\web\**`、`game\src\**`、`game\tests\**` 零改動。
