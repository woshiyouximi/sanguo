# 110 Cocos 人事物件化：跨月人事丢失的根因修复 + 對拍

任务：Cocos 版「跨月人事丢失」——`AiRunner` 每月回寫的 `{name,str,int,loyal,status}` 武將陣列，
被 `GameState.normalize()` 的白名單整批丟掉，於是城裡人事每月退回 `garrison.json`（`project/106 §7.2`）。
本文件是該修復的交付記錄。

負責文件：`GameState.ts`、`AiRunner.ts`、`MonarchModel.ts`、`CityPanel.ts`（僅註釋）、
`work\cocos_officers85\**`、本文檔。**未改** `CampaignRoot.ts`、`ItemsPanel/ItemsModel/Portrait`、
`core\**`、`game\web\**`、`game\tests\**`、`project\37a|31|44`。

## 0. 結論速覽

1. **根因**：`GameState.ts:205`（改前）`if (Array.isArray(c.officers)) city.officers = stringArray(c.officers);`
   —— `stringArray()` 只留 `typeof item === 'string'`，而 `AiRunner.applyWorld()` 回寫的是物件 →
   `loadSave()` 時整批歸零 → 下個月 `prepareMonth()` 又從 `garrison.json` 的 meta 補回來，
   表現就是「人事每月被打回原形」。不是 AI 算錯，是**存檔往返把資料吃掉**。
2. **修法**：`CityRuntime.officers` 從 `string[]` 升為 `CityOfficer[]`（`{name,str,int,loyal,status}`
   + 索引簽名保未知鍵）；`normalize()` 逐項清洗（純字串補預設值相容舊檔），並把**城市層級的未知鍵**
   也照 `[SAVES_V3]` 規則原樣帶回（頂層早就有這條，城市層以前只重建 6 個欄位）。
3. **對拍**：同一份**舊形**存檔（cities 只有 troops/pop/money）跑 3 個月、60 城，
   「每月末每城 officers 的 JSON」在 web 版（`game\web\ai_model.js` + `saves.js`，node 直接 import）
   與 Cocos 版（`AiRunner.runMonth` + `GameState` 存檔往返）之間 **不一致 0**（180 城×月 / 523 條 /
   2615 個欄位）。陰性對照故意改一個 `str` → 紅 1；把 normalize 換回舊的 `stringArray` 白名單 → 紅 631。
   `PARITY OK`。
4. **型別**：`cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit`
   → **EXIT=0**（全套 4 個檔 + 全專案）。**未跑** CocosCreator / `tools\build_wechat.ps1`（構建歸 lead），
   所以「Creator 實機」這一步沒有驗；驗的是 node 直接 import 同一份 TS 編譯產物（`work\cocos_officers85\build\`）。
5. **`CampaignRoot.ts:1631` 那句 `save as unknown as AiSave` 已經可以刪**（結構上 `CampaignSave`
   現在可直接賦給 `AiSave`，證據 `work\cocos_officers85\assign_check.ts` → tsc EXIT=0），
   但該檔不歸我改，留給 lead（見 §8）。

## 1. 根因與修法（before / after）

| 位置 | 改前 | 改後 |
| --- | --- | --- |
| `GameState.ts:27` | `officers?: string[]` | `GameState.ts:53` `officers?: CityOfficer[]` |
| `GameState.ts:205` | `if (Array.isArray(c.officers)) city.officers = stringArray(c.officers);` | `GameState.ts:283-286` `const officers = cityOfficersOf(c.officers); if (officers.length > 0) city.officers = officers;` |
| `GameState.ts:224-230`（頂層未知鍵） | 只保頂層 | 城市層也保：`GameState.ts:288-295` |
| `AiRunner.ts:192-209` | 私有 `normalizeOfficers()`，回寫裸 `sc.officers.map(o => ({...o}))` | `AiRunner.ts:215` `export function toCityOfficers()`；回寫 `AiRunner.ts:346-348` |

為什麼會「整批」丟：`stringArray()`（`GameState.ts:182`）對每個 item 只做 `typeof item === 'string'`
的判斷，物件不是字串 → 一個都不留；而清單長度為 0 時 normalize 連 `officers` 鍵都不寫，
所以存回去的 JSON 裡根本沒有這個欄位（不是空陣列）。`prepareMonth()` 見存檔沒有 officers
就退回 `meta.officers`（`garrison.json`），於是「上月 AI 登用/移將/攻陷的結果」全部作廢。

## 2. 改動清單

| 檔案:行 | 內容 |
| --- | --- |
| `GameState.ts:19-38` | `[OFFICER_OBJ]` 註釋 + `export interface CityOfficer`（5 個已知鍵 + `[key: string]: unknown`） |
| `GameState.ts:48-53` | `CityRuntime.officers?: CityOfficer[]`，註釋寫明舊 bug |
| `GameState.ts:188-192` | `officerStatusOf(value): string \| number`：字串原樣（空字串按 `'登'`）、有限數字原樣、其餘 `'登'` |
| `GameState.ts:200-217` | `export function cityOfficerOf(value): CityOfficer \| null`：字串 → `{name,str:0,int:0,loyal:0,status:'登'}`；物件 → `{...rec}` 起手（**未知鍵自動帶過**）+ `Math.trunc(numberOr(...))` |
| `GameState.ts:219-231` | `export function cityOfficersOf(value): CityOfficer[]`：陣列逐項清洗、丟 null |
| `GameState.ts:234` | `const CITY_KNOWN_KEYS = ['troops','pop','money','owner','major','officers','DEFENSE']` |
| `GameState.ts:283-286` | normalize 城市循環改吃 `cityOfficersOf()`；空清單不寫鍵 |
| `GameState.ts:288-295` | 城市未知鍵原樣搬（`Object.assign(city, extra)`，已知鍵即使值非法也不搬原始值） |
| `AiRunner.ts:193-197` | 本地 `officerStatusOf()`（與 GameState 同規則；**不 import 型別**以保住 node 可載入性） |
| `AiRunner.ts:215-237` | `export function toCityOfficers(list): AiOfficer[]`（字串/物件/`NAME` 別名都認，保未知鍵） |
| `AiRunner.ts:261-262` | `buildMeta()` 兩處 `toCityOfficers`（garrison 與 row） |
| `AiRunner.ts:276-312` | `ensureMeta()` 改 **export**（對拍要用）+ 缺 keys 時寫 `toCityOfficers(m.officers)` |
| `AiRunner.ts:346-348` | `applyWorld()` 的 officers 分支改寫 `toCityOfficers(sc.officers)`（不再裸 spread） |
| `MonarchModel.ts:327-365` | 新增 `export function officerListOf(raw, dedupe = true): Officer[]`（見 §7） |
| `MonarchModel.ts:438/491/589/666/763` | `successionList / abdicateCandidates / kingFell / extinguish / forceRoster` 五處改走它 |
| `MonarchModel.ts:777` | `const list = [...rows.values()]` → `Array.from(rows.values())`（Creator Babel loose 會編成 `[].concat`） |
| `GameState.ts:399-408` / `:437-442` | 兩處既有的 `for (const x of adj.get(n) ?? [])`（`distanceFromOwned` / `nearestOwnedTo`）改成「先落變數再 for-of」——同一個 Babel 崩潰點，行為不變 |
| `CityPanel.ts:513-523` / `CityPanel.ts:577-578` | 只加 `[OFFICER_OBJ]` 註釋（見 §6，無行為改動） |

這個目錄沒有 git（`F:\sanguo` 不是 repo），所以沒有 diff 可貼，以上表格就是完整清單。

## 3. 舊檔兼容策略

`normalize()` 讀到的 `cities[*].officers` 可能有三種歷史形狀，全部收：

| 存檔裡的形狀 | 讀出來 |
| --- | --- |
| `['張飛', '關羽']`（`stringArray()` 時代/更早） | `[{name:'張飛',str:0,int:0,loyal:0,status:'登'}, …]` |
| `[{name,str,int,loyal,status}]`（本版 AiRunner 回寫） | 數值 `Math.trunc`、`status` 保 `string \| number`、其餘鍵原樣 |
| `[{name, ..., skill:'x'}]`（未來/別處多帶擴展鍵） | 5 個已知鍵強型別，`skill` 等**原樣保留**（`CityOfficer` 索引簽名 + `{...rec}`） |
| `[]` 或非陣列 | 不寫 `officers` 鍵（老存檔不會無端多一個空陣列） |
| `'張飛'`（單一字串而非陣列） | 不收（`Array.isArray` 守門；AI/garrison 都是陣列） |

實測（`work\cocos_officers85\` 冒煙）：舊形 `officers:['張飛']` + 城市未知鍵 `foo:'bar'` + 武將未知鍵
`extra:1` → `loadSave()` 後分別是 `[{"name":"張飛","str":0,"int":0,"loyal":0,"status":"登"}]`、
`foo:"bar"` 還在、`extra:1` 還在；`persistSave()` 寫回的 JSON 也帶 officers。

`status` 保留 `string | number` 是**故意偏離 106 §7.2 草案**（草案寫死 `status: string`）：
`garrison.json` 的 status 是 `'野'/'登'`，但 `AiModel.AiOfficer.status` 是 `string | number`
（世界的 `STATUS` 可能是 2/8 這類數字），若硬轉字串，數字碼在存檔往返裡會被改寫成 `'2'/'8'`，
反而製造第二種不一致。`status` 的語意收斂交給 `MonarchModel.normStatus()`（2→俘、8→野）。

## 4. 未知鍵不再被丟

兩層都補齊，規則一致（註釋標 `[SAVES_V3]`）：

- **頂層**：`GameState.ts:313-318` 那段「`for (const key of Object.keys(obj)) if (!(key in out))`」
  是原本就有的（`sanguo_monarch_v1` 就是靠它活下來的），本次未動。
- **城市層**：`GameState.ts:288-295` 新增。以前城市只重建 `troops/pop/money`（+owner/major/officers/DEFENSE），
  任何別的鍵（例如別條線加的 `flags`、`rate`、`wise`）在第一次讀檔就被抹掉。
  現在非 `CITY_KNOWN_KEYS` 的鍵原樣搬；**已知鍵不搬原始值**——即使值非法（`troops:'abc'`），
  也以強型別清洗後的 `0` 為準，否則 normalize 會把壞值又放回去。

## 5. 對拍（`work\cocos_officers85\parity.mjs`）

### 5.1 設計

- **同一份初始存檔**：劇本 1（60 城）+ `garrison.json['0']`；初始 `save` 是**舊形**——cities 只有
  `troops/pop/money`（`troops` 用 `Saves.cityTroops()`，與 `GameState.initCampaign()` 同式），
  沒有 `owner`/`officers`。玩家勢力 = garrison `owner` 城數排第 2 的勢力（`劉表`，3 城；第 1 名留給 AI 打）。
  存檔寫進 `build\_cc.js` 的 `localStorage` store，再 `resetCache()` + `loadSave()` 讀出來。
- **Cocos 側（產品路徑）**：每月 `AiRunner.runMonth(save, cities, generals, {playerId, paths, garrisonOf, capOf, seed:(m+1)*7919})`
  → `GameState.persistSave()` → `GameState.resetCache()` → `loadSave()`（**強制冷啟動**，
  normalize 才是 bug 現場）→ 記錄每城 officers。
- **web 側**：`game\web\ai_model.js` 的 `prepareMonth/planMonth/executeMonth/resolveBattle/captureKingIn/
  checkForceDeaths/buildForces/syncOwned/monthlyDrift/seedRng/forceOf` + `game\web\saves.js` 的
  `num/intOr/cityTroops`，node 直接 `import`（兩個檔都是純 ESM、無 DOM）。
- **兩側共用同一段「一月」序列**（`parity.mjs:149 driverMonth()`，照抄 `AiRunner.runMonth` 的順序：
  buildMeta → ensureMeta → buildForces/syncOwned → prepareMonth → planMonth → executeMonth →
  逐條 resolveBattle/captureKingIn → checkForceDeaths → monthlyDrift），只換 `MOD`。
  這樣 [B] 是「Cocos 移植 vs web 原版」的模型對拍，[C] 是「模型世界 vs 存檔往返」的儲存對拍，
  [A] 才是任務書要的「web 算出來 ↔ Cocos 存回來的」。
- **比較口徑**：每城 officers 正規化成固定鍵序 `{name,str,int,loyal,status}`（其餘鍵排序接在後面），
  逐條逐欄位 diff（`parity.mjs:215 canonOfficers` / `:269 diffOfficers`）；3 個月 × 60 城 = 180 城×月。

### 5.2 數字（`parity-report.json`）

| 指標 | 城×月 | 武將條目 | 欄位檢查 | 不一致 |
| --- | --- | --- | --- | --- |
| [A] web 世界 ↔ Cocos 存檔（任務書那條） | 180 | 523 | 2615 | **0** |
| [B] Cocos 世界 ↔ web 世界 | 180 | 523 | 2615 | **0** |
| [C] Cocos 世界 ↔ Cocos 存檔 | 180 | 523 | 2615 | **0** |
| [N] 陰性對照：故意把一名武將 `str` +1 | 60 | 167 | 835 | **1**（`襄平[0].str: 42 ≠ 43`） |
| [L] 假如還是舊 `stringArray()` 白名單 | 180 | 523 | 2615 | **631** |

每月概況：第 1 月 60 城 / 183 條武將 / 37 城有變動 / executed 19 / incoming 1；
第 2 月 173 條 / 3 城變動 / executed 18；第 3 月 167 條 / 3 城變動 / executed 16。
3 個月合計 43 個「城-月」發生過人事變動（移將、登用、搜索、攻陷清空），所以這不是一個空轉的對拍。
初始存檔 officers 條目 = 0（舊形），第 1 月就長出 183 條並一路保留——正是修復前後行為差異的所在。

- **陰性對照**（任務書要求）：拿最後一月的存檔，把 `襄平/閻圃.str` 從 42 改成 43，再跑同一個 diff →
  紅 1。證明這套 diff 不是「怎麼比都 0」。
- **[L] 舊行為復現**（額外加的）：`parity.mjs:246 legacyOfficersView()` 把存檔 JSON 依「修復前」的
  `stringArray()` 規則再過一次（只留字串 → 物件全丟），跟 web 世界比 → 紅 631。
  這是「這套對拍真的抓得到原 bug」的證據，而不只是「diff 會紅」。

### 5.3 已知偏離（重要，別把這裡的 0 誤讀成「兩版完全等價」）

1. **web 側 meta 的 officers 用 garrison 原始列**（帶 `loyal`、`status` 保 `'野'/'登'`），
   而 `campaign.html:2602-2604` 的 `buildWorld()` 是硬寫 `status:'登'` 並**丟掉 loyal**。
   若照抄 campaign.html，第 1 個月就會因為這條既有移植口徑差異全紅，掩蓋真正要測的「存檔往返」。
   所以對拍把「web 生成的世界」當人事真相、把「Cocos 存檔」當被測物；`loyal`/`status` 的原值
   由兩側同一份 garrison meta 供給。這條差異本身不在本任務範圍（屬 `buildWorld` 的移植口徑），
   已在 106/本文件記錄，留給後續對齊。
2. **`game\web\saves.js#citySummaryOf()`（`saves.js:891/918`）把 `cities[*].officers` 定義成「在城武將數」**
   （`const officers = roster.length`，數字），與 Cocos 同名欄位（物件陣列）**同名不同義**。
   所以 [A] 不能拿 web 的 `save.cities[*].officers` 比，只能拿 web 的 **AI 世界**
   （`world.cities[*].officers`）比。web 自己的持久化人事在 `save.roster`（城→名字陣列），
   AI 完全不讀它——這也是為什麼 web 版沒這個 bug。
3. 只跑了劇本 1（60 城）+ 3 個月 + 一個玩家勢力；沒有 5 個劇本 × 5 勢力的全掃（時間成本）。

### 5.4 重跑

```
node work\cocos_officers85\build.mjs     # tsc → build\*.js，补 .js 后缀、把 'cc' 换成 _cc.js shim
node work\cocos_officers85\parity.mjs    # → PARITY OK / PARITY FAIL（退出码 1）
```

## 6. CityPanel 為什麼只加註釋

`grep -n officers CityPanel.ts` → 改前 **0 處**（改後只有下面兩處註釋）。它顯示的「武將 N」與任命/派遣清單都走
`M.rosterOf(save, city, ctx)`（`:771`、`:1066`），資料源是補丁鍵 `sanguo_city_v1` 的 `roster`，
不是 `GameState.cities[*].officers`。web 版也是同一套分工：`city_model.js:569-602` 的 `rosterOf()`
讀 `save.roster`，AI 只碰世界的 officers。所以：

- 行為不變＝**不改邏輯**（改去讀 officers 會讓「玩家任免」與「AI 人事」兩套資料互相打架，
  反而偏離 web）；
- 但留了兩處 `[OFFICER_OBJ]` 註釋（`CityPanel.ts:513-523`、`CityPanel.ts:577-578`），
  寫明「只回寫 troops/pop/money，`rt.officers` 是 AI 的人事真相，不要整物件覆蓋、也不要用 extras
  的 roster 去寫 officers」——這是這次 bug 的同型陷阱（欄位級白名單），留給下一個改這裡的人。

## 7. MonarchModel 的兼容函式

`forceRoster()`（`:763`）、`abdicateCandidates()`（`:491`）、`successionList()`（`:438`）、
`kingFell()`（`:666`）、`extinguish()`（`:589`）以前各自 `Array.isArray(list)` + `normOfficer()` 手寫一遍。
新增 `officerListOf(raw, dedupe = true)`（`MonarchModel.ts:341`）：

- `raw` 是陣列 → 逐項 `normOfficer()`（字串與物件都吃，`normOfficer` 本來就雙向兼容）；
- `raw` 是記錄（`{城: [武將]}` 整表誤傳）→ 把陣列值拍平（保底）；
- `dedupe` 預設 true（同名留第一次）；繼承/讓位要「同名各看各的」時傳 `false`（五個呼叫點都傳 `false`，
  行為與改前一致）；
- 註釋寫明為什麼有這支：**兩種入參**（`string[]` 舊檔 / `Officer[]` 新檔 / `garrison.json` 物件列）
  ＋ 記錄形誤傳的保底。`MonarchPanel` 傳的 `opts.officersByCity` 是 `Record<string, unknown>`，
  現在不必自己判形狀。

## 8. `CampaignRoot.ts:1631` 的斷言（不在我的檔案範圍）

```ts
const out = runAiMonth(save as unknown as AiSave, this.cities, this.generals, {...});
```
`CityOfficer` 落地後 `CampaignSave` 結構上已可直接賦給 `AiSave`（`AiCity` 全部可選、
`CityOfficer` 與 `AiOfficer` 相容）。證據：`work\cocos_officers85\assign_check.ts` 裡
`const asAiSave: AiSave = save;` → `tsc -p work\cocos_officers85\tsconfig.assign.json` **EXIT=0**。
該檔由另一 agent 負責（且本次執行期間它正在被改），所以那句斷言我沒動：
**建議 lead 把它降級成 `save`（或 `save as AiSave`），並刪掉上面「唯一一處斷言」的註釋。**

## 9. 沒做到的 / 待辦

1. **沒跑 CocosCreator、沒跑 `tools\build_wechat.ps1`**（任務書硬約束）。因此「Creator 的 Babel 能不能
   吃這些新語法」只有靜態保證：新代碼沒有 `for (const x of <a ?? b / a || b / 三元>)`、
   沒有 `[...set]` / `[...map.values()]`（`MonarchModel` 那處已改 `Array.from`）、沒有 `import.meta`、
   沒有帶副檔名的相對導入；`AiRunner` **沒有新增任何 import**（尤其沒引 `CityOfficer` 型別，它必須保持
   node 可直接載入、不碰 `cc`；`AiRunner.ts:47` 那句 `import type` 是既有的，只引 `./AiModel`）。
2. **web 版 `buildWorld()` 的 officers 口徑**（硬寫 `status:'登'`、丟 `loyal`）沒有對齊，見 §5.3-1。
3. **`CampaignRoot.ts` 的斷言**留給 lead，見 §8。
4. **只對拍劇本 1**；5 個劇本全掃、以及「玩家手動任免 vs AI 人事」交叉場景沒測。
5. `game\web\saves.js` 的 `cities[*].officers`（數字）與 Cocos 的同名欄位（物件陣列）**同名不同義**，
   這是跨端資料契約的坑，本次只在文件裡記錄，沒有改 web。
6. **順手發現、但不在我檔案範圍的同類 for-of 寫法**（同一個 Creator Babel 崩潰點，建議各 owner 自查）：
   `MonarchPanel.ts:406 for (const g of this.opts?.generals ?? [])`、
   `CityModel.ts:589 for (const g of rosterOf(save, cityDef?.NAME, ctx))`、
   `CityModel.ts:742 for (const [city, list] of Object.entries(save?.roster || {}))`、
   `AiModel.ts:494/505 for (const p of Array.isArray(paths) ? paths : [])`、
   `AiModel.ts:2307 for (const a of Array.isArray(list) ? list : [])`。
   我只改了自己擁有的 `GameState.ts` 兩處，其餘沒動（改別人的檔會踩到並行編輯）。

## 10. 驗證命令與結果

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit      # EXIT=0
node ..\node_modules\typescript\bin\tsc -p ..\..\work\cocos_officers85\tsconfig.own.json   # EXIT=0（隔離我的 4 個檔）
node ..\node_modules\typescript\bin\tsc -p ..\..\work\cocos_officers85\tsconfig.assign.json # EXIT=0（CampaignSave → AiSave）

cd F:\sanguo
node work\cocos_officers85\build.mjs     # 20 個 js；相对导入补 .js 25 处；'cc' → _cc.js 1 处
node work\cocos_officers85\parity.mjs    # PARITY OK（不一致 0 / 陰性 1 / 舊行為復現 631 / 變動 43）
```
