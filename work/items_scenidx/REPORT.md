# 物品頁武將卡「張角」bug：數據源由劇本表切到存檔運行時

- 日期：2026-11-26
- 範圍：Cocos 戰役側面板（`game/cocos/assets/scripts/**`）+ 一個新測試檔
- 狀態：**已修完、tsc 0 錯、全量測試 0 紅**（未跑 Cocos 構建/瀏覽器/模擬器，依紀律請 lead 實機驗）

## 一、用戶反饋與根因

實機：《討伐董卓》選劉備，平原內政頁「武將 8/10」正常；點「物品 裝備」，上方武將卡是**張角**
（武 56/智 95），將列 `張角、廖化、管輅、裴元紹、蔣義渠、杜遠`——正好是**劇本 0（黃巾之亂）平原 garrison**。

根因不是「劇本號缺省 0」這麼表面，而是**面板取武將名單的數據源是靜態劇本表**：

1. `ItemsPanel.pickPool()` 用 `general.CITY` 過濾 `save.owned` —— `CITY` 是 `generals.json` 的靜態欄位
   （= 劇本 0 的所屬城）。劉備/關羽的 `CITY` 是「代縣」，所以自己的武將全被濾掉；
   張角/廖化/裴元紹/管輅/蔣義渠/杜遠的 `CITY` 是「平原」，全被留下；再按 STR+INT 降序取前列，
   **張角（56+95=151）成了第一個**，於是默認卡片就是他。
2. `CampaignRoot` / `ForcesPanel` / `GeneralBookPanel` 另有一批 `garrisonOf(data, 0, 城)` /
   `defendersOf(data, 0, 城)` / `scenarios[0]`——劇本號寫死 0。劇本 1 開局、或勢力易手之後，
   這些面板仍按 184 年黃巾之亂的靜態表算。

Lead 轉述的用戶原話（方向修正）：「这个和当前剧本有什么关系，不应该是当前选择势力吗？
难道我不是刘备，曹操占领了这里，就变成看刘备的武将吗？」——正確口徑是
**城市駐將 = 存檔運行時狀態**（這座城現在歸誰、駐著誰），劇本表只是開局快照/播種用。

## 二、數據源：劇本表 → 存檔（本次核心）

新增 `game/cocos/assets/scripts/OfficersOfCity.ts`（**675 行、零 import 純邏輯**，面板與
`node --test` 都能直接吃）作「這座城現在有誰」的唯一讀取口：

| 情境 | 舊（本次之前） | 新（唯一口徑） |
| --- | --- | --- |
| 我方城的駐將 | `garrisonOf(data, 0, 城)` 或 `general.CITY` | ① `save.roster[城]`（+ `_moved` 調動、剔除 `away` 隨軍）→ ② 名單空 **且這座城劇本開局屬玩家** 才按 `city_by_times[scenIdx]` 播種（排除「野」）→ ③ 占領來的城名單空＝真空，**不**拿原守將冒充 |
| 敵方/中立城 | `garrisonOf(data, 0, 城)` | ① `save.cities[城].officers`（AI 月結/佔領寫入，**是陣列就權威、含空陣列**）→ ② 劇本表（不排除野，對齊 `garrison.json`） |
| `scenIdx` 的作用 | 恆 0 | **只影響「還沒有任何人事紀錄的城」的播種**；存檔裡有人事紀錄後，換劇本/換勢力都不再看劇本表 |
| 寫入路徑 | 面板只讀不寫 | `seedCityOfficers()` 把我方城名單寫回 `save.roster[城]` **與** `save.cities[城].officers`（兩份都同步，內政/物品/名冊同源）；敵城只補空的；歸屬寫 `cities[城].owner/major` |

`OfficersOfCity.ts` 對外 API（給測試與面板）：

- 讀：`officersOfCity(save, city, ctx)`、`officerNamesOfCity`、`officersByCity(save, cities, ctx)`、
  `ownedOfficerPool(save, owned, ctx, cap)`（物品頁武將池）、`pickDefaultIndex(names, candidates)`（默認選將）、
  `cityOwnerOf`、`cityMajorNameOf`、`cityOfGeneral`、`isScenarioHome`、`mergeRosters`。
- 寫：`seedCityOfficers`、`writeCityOfficers`、`writeRosterNames`、`writeCityOwner`。
- `ctx = { generals, scenIdx, roster, playerForce, scenarioCities }`；排序 `STR+INT` 降序、同分名字碼位升序
  （與 `core/garrison.ts` 同一順序）；算法逐條對齊 `CityModel.cityOf/statusOf/rosterOf/awayNameSet`。

**舊檔遷移**：`CampaignRoot.seedRuntimeOfficers()` 在「開局 / 招降處置完成 / 內政關閉 / 從戰鬥回大地圖」
各跑一次；舊檔（無 `roster`、無 `cities[*].officers`）第一次跑時按劇本表播種並寫回存檔，之後就是運行時數據。

## 三、改動檔案與行（改動後行號）

### 1. 新增 `game/cocos/assets/scripts/OfficersOfCity.ts`
零 import。關鍵導出：`ownedOfficerPool` L506、`pickDefaultIndex` L543、`officersOfCity` L458、
`officersByCity` L492、`cityMajorNameOf` L567、`seedCityOfficers` L642、`mergeRosters` L168、
`isScenarioHome` L311、`cityOfGeneral` L273。檔頭 L1-42 寫明用戶反饋與三條口徑。

### 2. `game/cocos/assets/scripts/ItemsPanel.ts`
| 位置 | 改動 |
| --- | --- |
| L70-71 | `import * as O from './OfficersOfCity';` |
| L231-232 | `PanelDebug` 增 `generalCity: string`（測試釘「不是劇本 0 靜態 CITY」用） |
| L394-411 | 舊 `pickPool()`（`general.CITY` 口徑）**保留作兜底**，加註釋說明只在無存檔時用 |
| L416-460 | 新增 `pickRuntimePool()`：`O.ownedOfficerPool(save, owned, {generals, scenIdx, roster, playerForce, scenarioCities}, POOL_SIZE+32)` → 名字映射回 `generals` 表 → 前 12 名 + 每名所在城 |
| L474-497 | 新增 `export interface ItemsOpenOptions { save, generals, scenIdx, cityName, king, preferName, roster, playerForce, scenarioCities }` |
| L607-611 | 新增 `ctx` / `poolCities` / `poolRows` 欄位 |
| L905-930 | `open(generals, items, owned, opts: ItemsOpenOptions = {})` 第 4 參數；池子改用 `pickRuntimePool`；默認索引改用 `O.pickDefaultIndex(poolNames, [上次選的將, 當前城太守(preferName), 君主(king)])`（**不再是「列表第一位」**） |
| L1203-1211 | 新增 `currentGeneralCity()`：運行時所在城（`poolCities` → `city_by_times[scenIdx]`） |
| L978 | `debug()` 回傳 `generalCity` |
| L1506-1511 | 武將卡「所在 X · 忠誠 Y」改用運行時所在城 + 運行時忠誠（不再印靜態 `general.CITY`） |

### 3. `game/cocos/assets/scripts/CampaignRoot.ts`
| 位置 | 改動 |
| --- | --- |
| L35 | `import { CityPanel, CITY_EXTRAS_KEY } from './CityPanel';`（讀內政 extras roster 用） |
| L49 | `import * as O from './OfficersOfCity';` |
| L1402-1403 | `start()` 在 `initCampaign` 後調 `this.seedRuntimeOfficers()`（開局播種/舊檔遷移） |
| L1467 | `SurrenderPanel.showIfNeeded(... onDone:)` → `seedRuntimeOfficers(); refresh();`（招降處置寫完 roster 後同步） |
| L2085, L2094 | `openCityPanel` 的 `onClose`：重載存檔後 `seedRuntimeOfficers()`（內政改完人事同步回存檔） |
| L2348-2359 | `runMapAi().garrisonOfCity`：先 `O.officersOfCity(save, name, ctx)`，owner/major 用運行時，劇本表 fallback 改用 `this.scenIdx` |
| L2562-2575 | `cityCard()`：守將/太守/歸屬先運行時（`O.officersOfCity/cityOwnerOf/cityMajorNameOf`），fallback `garrisonOf/defendersOf(..., this.scenIdx, ...)` |
| L3503-3510 | `leaderOf(city)`：運行時太守 → 劇本表（`this.scenIdx`） |
| L3516-3526 | `armyRosterFor(city, leader)`：先 `O.officerNamesOfCity`，空才劇本表（`this.scenIdx`） |
| L3549-3566 | `openItems()`：`GameState.loadSave()` 重載 → 傳整份 `ItemsOpenOptions`（save/generals/scenIdx/cityName/king/preferName/roster/playerForce/scenarioCities）給物品頁 |
| L3659-3676 | 新增 `readExtrasRoster()`：讀 `localStorage['sanguo_city_v1'].roster`（內政頁那份 roster） |
| L3679-3695 | 新增 `rosterCtx()`：`{generals, scenIdx, roster: mergeRosters(存檔 roster, extras roster), playerForce: runPlayerForce(), scenarioCities: this.cities}` |
| L3697-3705 | 新增 `seedRuntimeOfficers()`：`O.seedCityOfficers(...)` + `GameState.persistSave()` + `[ROSTER_SRC]` log |
| L3707-3713 | `officersByCity()` 改 `O.officersByCity(this.save, this.cities, this.rosterCtx())`（**去掉 `officerMap` 舊緩存**；該緩存原本就是 `garrisonOf(data,0,城)` 填的） |
| L3774-3785 | `openForcesPanel()` 傳 `officersByCity`（運行時）+ `paths` + `scenIdx` |
| L3803-3812 | `openGeneralBook()` 傳 `scenIdx: this.scenIdx`（`officersByCity` 原本就有，現在是運行時） |
| L4168-4176 | `detectMonarchDeath()`：用 `O.cityMajorNameOf(save, name, ctx) === monarch`（不再 `garrisonOf(data,0,name)`） |

### 4. `game/cocos/assets/scripts/CityPanel.ts`
| 位置 | 改動 |
| --- | --- |
| L49 | `import * as O from './OfficersOfCity';` |
| L1710-1730 | `cmdItems()` 開物品頁時傳 `ItemsOpenOptions`：`save: GameState.loadSave()`、`scenIdx: this.opts.scenIdx`、`cityName`、`preferName: M.majorOf(內政 save, 城)`、`king`、`roster: mergeRosters(內政 roster, 存檔 roster)`、`playerForce`、`scenarioCities`。（這是用戶那張「張角卡」的第二個入口） |

### 5. `game/cocos/assets/scripts/GeneralBook.ts`（名冊純邏輯）
| 位置 | 改動 |
| --- | --- |
| L15 | 檔頭「所屬城」口徑改：`officersByCity` 反查（存檔運行時）→ `city_by_times[scenIdx]` → `generals.CITY` → `''` |
| L171-175 | `BookOptions.scenIdx?: unknown` |
| L377-378 | `mergeRow` ctx 增 `scenIdx` |
| L389-391 | 所屬城 fallback：`str(cityOf(rec, intOr(ctx.scenIdx, 0, 0)))`（不再直接 `rec.CITY`） |
| L466 | `buildBook` 把 `opts.scenIdx` 傳進 `mergeRow` |

### 6. `game/cocos/assets/scripts/GeneralBookPanel.ts`
| 位置 | 改動 |
| --- | --- |
| L281-287 | options 增 `scenIdx?: number`；`cities` 缺省改從 `data.scenarios[scenIdx]` 取 |
| L317-323 | `scenarioOf(data, scenIdx = 0)`：`scenarios[scenIdx] ?? scenarios[0]` |
| L613, L626 | `open()` 用 `scenarioOf(data, options.scenIdx ?? 0)`；`buildBook({..., scenIdx: options.scenIdx})` |

### 7. `game/cocos/assets/scripts/ForcesPanel.ts`
| 位置 | 改動 |
| --- | --- |
| L504-516 | options 增 `scenIdx?: number`；`cities/paths` 缺省註釋改 `data.scenarios[scenIdx]` |
| L533-539 | `scenarioOf(data, scenIdx = 0)`：`scenarios[scenIdx] ?? scenarios[0]` |
| L541-550 | `officersByCityOf(data, cities, scenIdx = 0)`：劇本表兜底用 `garrisonOf(data, scenIdx, name)` |
| L732, L741 | `open()` 傳 `options.scenIdx` 給 `scenarioOf` 與 `officersByCityOf` |

### 8. 新增測試 `game/tests/panels_roster_source.test.ts`
8 個 case（純邏輯，node:test + assert/strict，讀 `data/generals.json`、`data/scenarios.json`）：

1. 劇本 1 平原：物品頁武將池含 關羽/劉備/張飛/簡雍，不含 廖化/裴元紹/管輅/蔣義渠/杜遠；
   且與內政頁真源 `CityModel.rosterOf()` 同一個集合。
2. 默認選中將 = 當前城太守劉備，**不是列表第一個（關羽）也不是張角**；無資料時仍回合法索引 0。
3. GeneralBookPanel 口徑：名冊平原名單 = 內政同批；`mergeRow` 的所屬城 fallback 用 `city_of[scenIdx]`；
   張角在劇本 1 的狀態是「未」、不是平原太守。
4. 舊檔播種：`seedCityOfficers` 寫回 `roster` 與 `cities.officers`、寫入 owner/major；
   之後 `scenIdx` 換成 0 名單也不變。
5. **模擬「曹操占平原」**：改存檔歸屬/名單後，物品頁池/名冊/太守全部變曹操的人，看不到劉備/關羽/張角。
6. 占領城名單空 → 空城，不拿劇本表原守將冒充。
7. 敵城 `cities[城].officers` 權威（含空陣列）。
8. 完全沒有存檔人事紀錄的舊檔才回落劇本表，且按 `scenIdx` 取（劇本 0 ≠ 劇本 1）。

跑法：`cd game && node --test tests/panels_roster_source.test.ts`。

## 四、每個面板的「默認 0 → 傳參/存檔」對照表

| 面板/入口 | 舊 | 新 |
| --- | --- | --- |
| **ItemsPanel 物品頁**（`CampaignRoot.openItems`、`CityPanel.cmdItems` 兩個入口） | `pickPool()` 過濾 `general.CITY`（劇本 0 靜態）＋ 默認選列表第一個（張角） | `O.ownedOfficerPool(存檔, save.owned, ctx)`；默認 `pickDefaultIndex([上次選的將, 當前城太守, 君主])`；卡片「所在城」用運行時 |
| **GeneralBookPanel 武將名冊** | `scenarioOf(data)` = `scenarios[0]`；`officersByCity` = `CampaignRoot.officersByCity()`（內部 `garrisonOf(data,0,城)` + 緩存） | 傳 `scenIdx`（城/路網按本局劇本）；`officersByCity` = 存檔運行時；`mergeRow` 城 fallback 用 `city_by_times[scenIdx]` |
| **ForcesPanel 勢力** | `scenarioOf(data)` = `scenarios[0]`；`officersByCityOf(data,cities)` 內 `garrisonOf(...,0,...)` | 傳 `scenIdx` + 運行時 `officersByCity` + `paths` |
| **MonarchPanel 君主** | 面板自己不吃 garrison；吃 `CampaignRoot.officersByCity()`（舊 = `garrisonOf(data,0,城)`） | 同一個回調，現在回存檔運行時（**面板文件未改**） |
| **CityListPanel / CityList 城池列表** | `save.cities[*].owner/major` + `save.owned`（本來就是運行時） | 未改；播種後 `owner/major` 也由存檔寫入，顯示更穩 |
| **CityPanel 內政** | 名單走 `M.rosterOf(save, 城, {scenIdx})` ✓（已是運行時）；但開物品頁時沒傳資料源 | `cmdItems()` 傳整份存檔 `ItemsOpenOptions`（這是張角卡入口之一） |
| **SaveSlots 存檔槽** | `metaOfSave` 用 `owned` 城的 `major/officers` 計數（本來就是運行時） | **未改**（`AD_ANCHOR` 是紀年錨點，非武將來源，不存在默認 0 問題） |
| **CampaignRoot 城市卡 / 君主座位 / AI 月結** | `garrisonOf(data,0,城)` ×6 + `defendersOf(...,0,...)` ×1 | 先存檔運行時，劇本表 fallback 用 `this.scenIdx` |

## 五、驗證

| 項目 | 指令 | 結果 |
| --- | --- | --- |
| Cocos tsc | `cd F:\sanguo\game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **EXIT=0**（首輪 2 個型別錯已修：`GeneralBook.ts` 的 `Record→CityGeneral` cast、`OfficersOfCity.ts` readonly 陣列賦值） |
| 新測試 | `node --test tests/panels_roster_source.test.ts` | **8 tests / 8 pass / 0 fail** |
| 全量測試 | `cd F:\sanguo\game; node --test "tests/*.test.ts"` | **1814 tests / 1813 pass / 0 fail / 0 skipped / 1 todo**（基準 1806/1805/1 + 新增 8） |
| UTF-8 掃描 | `cd F:\sanguo; node work\enc\scan_utf8.mjs <8 個改動/新增檔>` | `scan: 8 files, 0 BAD, 0 WARN, 8 clean -> OK` |

未跑（依紀律）：Cocos 構建、瀏覽器、模擬器。

> 註：本任務執行期間，工作區同時有其他 agent 在改戰場側檔案
> （`BattleHud.ts` / `BattleInput.ts` / `DeployRoot.ts` / `army_cmd.test.ts`，非本任務檔案、本任務未碰）。
> 上表全量測試與 tsc 都是在這批並行改動之下跑出的結果（最後一次復跑仍為 1814/1813/0 fail/1 todo）；
> 若 lead 之後復跑看到戰場側測試紅，屬另一條線，不是本任務造成的。

## 六、需要 lead 驗機的點

1. **主訴回歸**：新局《討伐董卓》劉備 → 平原 → 物品 裝備。默認武將卡應是 **劉備（太守）**，
   將列應與內政頁「武將」同一批人（關羽/劉備/張角/張飛/簡雍）。
   - 若卡片仍是張角：先看 localStorage `sanguo_items_v1` 裡的 `gen` 是不是舊的「張角」
     （默認選將第一優先「上次選的將」，黏性設計）；清掉該鍵或手選一次劉備即可。
   - 張角仍會出現在**名單**裡：`generals.json` 的 `city_by_times[1]` 是空字串，
     `cityOf()` 會回退靜態 `CITY='平原'`（web 真源同款行為，內政頁也是這樣算）。
     本次修的是「名單來源與默認卡」；是否要把空字串視為「本劇本未登場」屬另一議題（未動）。
2. **換城**：打開平原以外的城 → 物品頁/名冊的武將卡與所在城應跟著當前城變。
3. **勢力易手**：模擬曹操占平原（或打下一座敵城）→ 回大地圖後物品頁/名冊名單應變占領者的人，
   不應再回退劇本 0/劇本表原守將。觀察 console `[ROSTER_SRC] seed officers: owned=… seeded=…`。
4. **舊檔遷移**：拿舊存檔（無 `roster`/`cities[*].officers`）開局 → 內政武將數不變、物品頁不是劇本 0 名單；
   `sanguo_campaign_v1` 內應出現 `roster` 與 `cities[*].officers`。
5. **名冊/勢力頁**：武將的「所屬城 / 勢力」欄應與大地圖當前歸屬一致（易手後會變）。
6. **AI 月結**：過一個月後再看物品頁/名冊/AI 敵情，不應出現劇本 0 的守將（`runMapAi` 的 garrisonOf 已切運行時 + `this.scenIdx`）。
7. 邊界：`ItemsOpenOptions.save` 為空（例如無存檔直接開面板）時，池子會回落舊 `pickPool()`，不應崩。

## 七、未修 / 有意保留

- **DeployRoot.ts:397/399 `scenarios[0]`**：戰場側（出陣部署），屬禁區，本次未動。
- **SurrenderModel.officersAt(data, city, scenIdx = 0) / `opts.scenIdx ?? 0`**：R214b 已由 `CampaignRoot`
  顯式傳 `atCity`（按 `sci` 算）與 `scenIdx`，本次未改它的預設值。
- **CityModel.rosterOf / wildPool 的 `scenIdx = 0` 預設**：通用純函式，所有內政呼叫端都傳；
  屬「參數化」而非寫死靜態 0。
- **GameState.garrisonOf(city): number**：同名不同物（守軍數公式），與劇本無關。
- **ItemsPanel.pickPool()**：保留作「沒有存檔/沒有 generals 表」的兜底，正常路徑不走。
- **GameState.recordBattleResult**：仍只改 `owned`，不直接寫 roster/officers（避免改到禁區的
  `BattleRoot` 結算路徑）；回到大地圖 `start()` 或開該城內政時由 `seedRuntimeOfficers()` 補齊。

**最後一句結論：共盤出 12 處「劇本號缺省 0 / 靜態劇本表兜底」現場（ItemsPanel 1、CampaignRoot 7、
ForcesPanel 2、GeneralBookPanel 1、GeneralBook 1），12 處全部修掉；剩下未動的是戰場側
`DeployRoot.ts` 的 `scenarios[0]`（禁區）與幾個通用純函式的「scenIdx 參數預設 0」（呼叫端都已傳值，非 bug）。**
