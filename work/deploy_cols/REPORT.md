# F-07 報告：Cocos 出征編成頁的「前 / 中 / 後列」

- 日期：2026-11-26
- 範圍：`game/cocos/assets/scripts/DeployRoot.ts`、`game/cocos/assets/scripts/BattleRoot.ts`、新增 `game/tests/deploy_cols_cocos.test.ts`
- 紀律：全程未用 git；未跑 Cocos 構建 / 未起瀏覽器 / 未動模擬器；未改 `CampaignRoot.ts` / `CityPanel.ts` / `ItemsPanel.ts` / `GeneralBook*.ts` / `GameState.ts` / `game/src/core/**`。

## 一、改動點（檔案:行，行號為交付時實測）

### 1) `game/cocos/assets/scripts/DeployRoot.ts`（出征編成頁）

| 行 | 改動 |
|---|---|
| 34 | `'cc'` import 加 `sys`（用 `sys.localStorage` 讀寫站位，與 CampaignRoot/GameState 同 API） |
| 48 | `import type { GeneralCol } from './core/battle';`（只借型別，不把 core 打進編成場景） |
| 80 | `import { scenarioIndex as runScenarioIndex } from './RunSetup';`（劇本號來源，見第五節） |
| 121–132 | F-07 常數：`COL_KEY = 'sanguo_deploy_cols_v1'`（130）、`COL_LABEL`（131，front 前 / mid 中 / back 後）、`COL_ORDER`（132，`['front','mid','back']`） |
| 192–195 | `ButtonKind` 追加 `'qcol' \| 'mcol'`（隊列每槽三檔 / 主將區三檔） |
| 214 | `type BattleLoadoutWithCols = BattleLoadout & { cols: Record<string, GeneralCol> };`（出征 payload 型別，`BattleLoadout` 本體在 GameState.ts 不改） |
| 298 | `private scenIdx = 0;`（本局劇本號） |
| 346–359 | class 欄位：`cols`（353，按武將名存站位）、`genColLabels`（355，12 將卡角標）、`queueColLabels`（357，5 槽×3 檔 = 15）、`mainColLabels`（359，主將區 3 檔） |
| 397–398 / 414 / 443 | `onLoad()` 建三組站位 Label（主將區 70×15、將卡角標 30×12 右對齊、隊列 180×15） |
| 781–783 | `applyRoles()`：`applyTextRoles(genColLabels,'badge',12)`、`(mainColLabels,'body',15)`、`(queueColLabels,'body',15)` |
| 506 | `start()`：`this.loadCols()`（進頁即讀 COL_KEY，默認中列） |
| 1140 / 1159–1177 | `draw()` 先 `drawMainCols(ui)`；`drawMainCols()` 主將區右上角三顆 70×30 按鈕（x=498+index*78、y=138，選中金框），push `{kind:'mcol'}` |
| 1201–1209 | `drawGenGrid()`：每將卡右上角「前/中/後」角標（默認中列 `textFaint`，前/後 `goldLight`，位置 `x+GEN_W-16, y+9`） |
| 1224–1225 | 空格清理時同步清 `genColLabels` |
| 1528 | `drawQueue()`：收起時隱藏 15 個隊列站位 Label |
| 1580–1597 | 隊列面板每槽第二行三顆 180×34 按鈕（前/中/後，`kind:'qcol'`，`index = slot*3 + 檔位`，選中高亮金框） |
| 1624 | 底部提示改為「前 3 槽上陣 · 點兵種循環切換 · ▲▼ 調序 · 前/中/後 定站位」 |
| 1716–1724 | `onTouch()` queueOpen 分支：`qcol` → `slot = queue[floor(index/3)]`、`col = COL_ORDER[index%3]`、`setCol(slot.general, col)`、`refresh()` |
| 1746–1752 | `onTouch()` 非模態分支：`mcol` → 改 `currentGen()` 的站位（與隊列第 1 槽同步） |
| 1816–1818 | `march()`：`const payload: BattleLoadoutWithCols = { ...loadout, cols: this.deployCols() };` → `GameState.startBattle(this.targetCity?.NAME ?? '南皮', payload)` |
| 1451–1522 | 新增 F-07 方法區：`colOf(name)`（1455，默認 mid）、`loadCols()`（1464，只收三值、壞 JSON 不拋）、`saveCols()`（1484，`setItem(COL_KEY, JSON.stringify(this.cols))`）、`setCol(name,col)`（1493）、`deployCols()`（1503，隊列 5 將 name→rank） |

### 2) `game/cocos/assets/scripts/BattleRoot.ts`（戰鬥場景）

| 行 | 改動 |
|---|---|
| 35 | core import 加 `normalizeCol`（已 import `./core/battle`，不新增模組） |
| 88–92 | 新增 `type BattleLaunchWithCols = BattleLaunch & { cols?: Record<string, unknown> };`（`GameState.BattleLoadout` 無 col 欄位，不改它） |
| 405–407 | boot()：`const launchCols: Record<string, unknown> = (launch as BattleLaunchWithCols \| null)?.cols ?? {};` 與 `const colOf = (name) => normalizeCol(name ? launchCols[name] : undefined);` |
| 428 | `createWorld({... a: { ..., col: colOf(launch?.gen), ... } })`：主將站位真的進世界 |
| 441 | `b: { ..., col: 'mid', ... }`：敵方本輪不開放（劇本/敵將無欄位）→ 固定中列，與 web 一致 |

### 3) `game/tests/deploy_cols_cocos.test.ts`（新增，8 tests）

源碼契約（`readFileSync`+regex，沿用 `cocos_p1_port.test.ts` 風格，因 Cocos scripts 不能直接 import）+ core 行為：

1. DeployRoot：COL_KEY 與 web 同鍵、COL_LABEL/COL_ORDER 三檔次序
2. DeployRoot：站位按武將名讀寫 COL_KEY（只收三值、默認中列、不塞 deployQueue）
3. DeployRoot：出征 payload 帶 `cols: this.deployCols()`、沿用 `startBattle` 既有通道
4. DeployRoot：12 將角標 + 主將區/隊列面板三檔按鈕與點擊分發
5. BattleRoot：`payload.cols` → createWorld 的 `a.col`、b 固定 `'mid'`（並檢查只有 a/b 兩條 col）
6. core `parseCols`：`front/mid/back`、全形符號、未知值回 mid、壞輸入
7. core 落位行為：A 側 front = mid−1、back = mid+1，不帶 col == mid（既有落位），B 側鏡像；主將單位帶 `col`
8. web↔Cocos 對齊：同 COL_KEY、同 payload 鍵名 `cols`

## 二、Payload 字段名

**`cols`**：`Record<string, 'front' | 'mid' | 'back'>`，按**武將名**存。

- DeployRoot 端：`BattleLoadoutWithCols = BattleLoadout & { cols: Record<string, GeneralCol> }`，`march()` 以 `{ ...loadout, cols: this.deployCols() }` 交給 `GameState.startBattle()`；
- 傳遞：`GameState.startBattle()` 是 `{ ...loadout, city, seed, from }` 展開，額外屬性原樣進 `BattleLaunch`（`GameState.ts` 不需改；契約上它是 `BattleLaunch` 的運行時擴展）；
- BattleRoot 端：以 `BattleLaunch & { cols?: Record<string, unknown> }` 接回，`normalizeCol()` 兜底（沒帶 / 名對不上 / 值不認識 → `mid`）；
- 名字來源：`deployCols()` 遍歷 `this.queue` 5 槽（與 web `deployColsParam()` 同一份出陣名單）；BattleRoot 只取主將名 `launch.gen`。
- 與 web 的 `cols=` URL 參數同鍵，Cocos 只是不走字串 URL 而是走既有 deploy payload 機制。

## 三、測試計數（實測）

| 項目 | 結果 |
|---|---|
| 新增 `tests/deploy_cols_cocos.test.ts` | tests 8 / pass 8 / fail 0 |
| 全量 `node --test "tests/*.test.ts"`（改檔前基線） | tests 1814 / pass 1813 / fail 0 / todo 1 |
| 全量（改檔後） | **tests 1822 / suites 89 / pass 1821 / fail 0 / todo 1**（+8 = 本輪新測試；其餘與基線一致） |
| `node node_modules/typescript/bin/tsc -p cocos/tsconfig.check.json` | exit 0（無輸出） |
| `node work/enc/scan_utf8.mjs <3 個改動檔>` | `3 files, 0 BAD, 0 WARN, 3 clean -> OK` |

## 四、web ↔ Cocos 對齊表

| 項目 | web | Cocos |
|---|---|---|
| 儲存鍵 | `deploy.html:548` `COL_KEY = 'sanguo_deploy_cols_v1'` | `DeployRoot.ts:130` 同鍵 |
| 三檔字面 | `deploy.html:549` `COL_LABEL = { front:'前', mid:'中', back:'後' }` | `DeployRoot.ts:131` 同字 |
| 格式 | `{ 武將名: 'front'\|'mid'\|'back' }`（JSON） | 同（`saveCols()` 1464–1490） |
| 三檔 UI | `deploy.html:786` `<button data-qcol="${i}:${c}">`；`:893-897` 點擊 | 隊列面板 `drawQueue()` 1580–1597（qcol）、主將區 `drawMainCols()` 1159–1177（mcol） |
| 逐將角標 | web 版 UI 無獨立角標（按鈕在隊列行內） | 將卡右上角「前/中/後」角標 1201–1209（Cocos 額外顯示，默認中列） |
| 持久化 | `deploy.html:564` `localStorage.setItem(COL_KEY, JSON.stringify(...))` | `saveCols()` 1484–1490（`sys.localStorage`，語義同） |
| 傳給戰鬥 | `deploy.html:920` `deployColsParam()` + `:952` `cols: deployColsParam()`（出征 URL）；`main.js:566` `cols: parseCols(q.get('cols'))` | `DeployRoot.ts:1816` payload `cols: this.deployCols()`；`BattleRoot.ts:406-407` 接收 |
| 主將落位傳參 | `main.js:680` `col: (cfg.aGeneral.name && cfg.cols[cfg.aGeneral.name]) \|\| 'mid'` | `BattleRoot.ts:428` `col: colOf(launch?.gen)`（`normalizeCol()` 同兜底） |
| 敵方 | web 不給 B 側 col（既有落位） | `BattleRoot.ts:441` `col: 'mid'`（同語義） |
| 默認 | 沒存過 → mid | `colOf()` 1455 → mid |

## 五、追加：DeployRoot 劇本號 2 處已改

- 來源 = **`RunSetup.scenarioIndex()`**（`DeployRoot.ts:80` 以 `runScenarioIndex` 別名 import，`:462` `this.scenIdx = runScenarioIndex();`），與 `CampaignRoot.scenIdx` 同源。
- 2 處 `scenarios[0]` 硬編碼：
  1. `start()` 劇本表：`(data.scenarios[this.scenIdx] ?? data.scenarios[0])`（:463），錯誤訊息改模板字串 `scenarios[${this.scenIdx}]…`（:465）；
  2. `majorOf()` 取 garrison.json 太守列：`scenario === this.scenIdx`（:891）。
- 同時把同函式內 5 處「恆 0 的劇本科目參數」接上（否則只改 `scenarios[0]` 仍會讀第 1 劇本的守軍/敵情）：
  `cityGarrisonTroops(data, this.scenIdx, …)`（:472）、`resolveEnemyIntel(data, this.scenIdx, …)`（:497、:958）、`timeAt(gen.city_by_times, this.scenIdx)` / `timeAt(gen.status_by_times, this.scenIdx)`（:515–516）。
- 結論：**DeployRoot 剧本号 2 处已改（另同函数 5 处恒 0 参数一并接上），来源 = RunSetup.scenarioIndex()。**

## 六、遺留

1. **敵方 / AI 側站位**：本輪 B 側固定中列（web 也未開放）。若日後劇本要敵將前/後列，需在劇本表或 `BattleLoadout` 加欄位（`GameState.ts` 屬本輪禁區，未動）。
2. **多將落位**：core 目前只給「主將」算站位（F-26 範圍）；payload 已帶 5 將站位，但非主將的隊伍落位不在本輪範圍。
3. **編成頁布局**：主將區三檔在右上角（x=498+index*78, y=138）、隊列面板在每槽第二行；若設計稿要求別的位置，只改 `drawMainCols()` / `drawQueue()` 座標即可。12 將卡角標 12px（設計座標 750×1334 下 30×12），真機小字可讀性未做可視校驗。
4. **未做可視驗證**：紀律要求不跑 Cocos 構建/模擬器/瀏覽器，故「點三檔 → 高亮/角標變化 → 出征落位」鏈路由源碼契約 + core 行為測試保證，未截圖驗證。
5. **兩端 localStorage 不共享**：web 是瀏覽器域、Cocos 是原生 `sys.localStorage`；鍵與 JSON 格式相同是為了「同一端口徑一致」，不是跨端同步。
6. **web 端顯示**：web 出征頁沒有「逐將卡角標」，只有隊列行內三檔按鈕；Cocos 多做了角標（本任務要求 ③），兩端 UI 不完全對稱但數據語義一致。

## 結論

F-07 完成：Cocos 出征編成頁可逐將選「前/中/後」（主將區三檔 + 隊列每槽三檔 + 卡面角標，默認中列），按武將名持久化到與 web 同名的 `sanguo_deploy_cols_v1`，並經既有 deploy payload 的 `cols` 字段傳入 `createWorld` 的 `a.col` 真正改變戰場落位（A 側 front=mid−1、back=mid+1，B 側鏡像，落位差已由 8 條新測試釘住），全量 1822 tests / 0 fail、tsc 0、enc scan 0 BAD。
