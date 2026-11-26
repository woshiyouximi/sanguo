# Cocos 側內政：4 個 P0 + 2 個 P1 修復報告

- 日期：2026-11-26
- 範圍：`game/cocos/assets/scripts/` 內政面板與模型（CityModel / CityPanel / CampaignRoot 的最小接線）
- 真源：`work/affairs_audit/REPORT.md`（255 行）+ `work/affairs_audit/probe_*.mjs`；web 對照 `game/web/city_model.js`、`game/web/city.html`
- 紀律：未用 git；未碰 `game/src/core/battle.ts`、`field.ts`、`army_cmd.ts`、`BattleRoot.ts`、`GeneralMarkers.ts`；未跑 Cocos 構建／瀏覽器／模擬器

## 一句話結論

Cocos 內政四項 P0（搜索道具進背包、scenIdx 按劇本、金→預備兵、逐將年令+隨軍+正月門）與兩項 P1（開發用執行將、searchSeq 落盤）已全部按 web 真源對齊，`tsc` exit 0、全量測試 1806 tests / 1805 pass / 0 fail / 1 todo（基線 1797／1796／1 todo，新增 9 條全綠），並新增 `tests/cocos_affairs.test.ts` 九條純邏輯回歸；剩餘僅面板實機視覺與 `garrison.json` 實際載入需 lead 在 Cocos 裡驗。

## 驗證總表

| 檢查 | 命令 | 結果 |
| --- | --- | --- |
| 型別 | `cd F:\sanguo\game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | exit 0 |
| 全量測試 | `cd F:\sanguo\game; node --test "tests/*.test.ts"` | tests 1806 / pass 1805 / fail 0 / todo 1（5.3s） |
| 新增測試 | `node --test tests/cocos_affairs.test.ts` | 9 / 9 pass |
| 舊契約測試 | `node --test tests/cocos_p1_port.test.ts` | 12 / 12 pass（3 條舊 F7 斷言已改寫成 F2/F3 語義） |
| 編碼 | `node work\enc\scan_utf8.mjs <5 個改動檔>` | 5 files, 0 BAD, 0 WARN → OK |
| 探針（改後） | `node work\affairs_audit\probe_develop.mjs` / `probe_scenidx.mjs` | 見各條證據 |

## P0-1 搜索道具不進背包

- 改前行為：`CityModel.search()` 只把道具序號寫進 `save.foundItems`（日誌用）；頁面層 `CityPanel.cmdSearch()` 成功後只 `acted('搜索')`，`withBagItem()` 全倉 0 調用。實測 200 次搜索 Cocos 背包仍 12 件、web 12→55，物品頁看不到新道具。
- 改後行為：
  - `CityModel.ts` §9 新增純輔助 `bagAddRaw(raw, seq)` / `bagSeqsOf(raw)`，與 web `city.html:613-623` 的 `bagAdd` 同鍵同格式：`localStorage['sanguo_items_v1']` 存 `JSON.stringify({equip, bag})`（`M.BAG_KEY` 不變，空存檔沿用 `parseItemsSave` 的 12 件預設）。
  - `CityPanel.ts` 新增 `private bagAdd(seq)`；`searchBy(name)` 在 `r.kind === 'treasure' || 'talisman'` 且 `seq > 0` 時真的寫入 localStorage，並重讀 `this.bag` / `ctx.bag`，物品頁（`cmdItems`）再進即見。`save.foundItems` 保留（日誌/圖鑑口徑與 web 相同，模型層仍只記 foundItems，寫背包是頁面層職責）。
- 驗證方式：`tests/cocos_affairs.test.ts` →「P0-1 搜索命中寶物/兵符 → bagAddRaw 寫出 sanguo_items_v1 同鍵同格式、背包 +1」（含空存檔 12+1、重複不 push、`bagSeqsOf` 讀回、foundItems 仍在）。
- 遺留：物品頁 UI 的即時刷新需實機點開確認（`cmdItems` 每次開頁重讀 bag，`ItemsPanel.onClose` 後 `refresh()`）。

## P0-2 scenIdx 硬編碼 0

- 改前行為：`CityPanel.open()` 的 `ctx = { ..., scenIdx: 0 }`；`CampaignRoot.openCityPanel()` 沒把 `runScenarioIndex()` 傳進來。選《討伐董卓》時平原仍按劇本 0 取人：`張角、廖化、裴元紹`（與現場「平原 3 將」指紋一致），在野池也是劇本 0 的 `杜遠/管輅/蔣義渠`。
- 改後行為：
  - `CampaignRoot.ts` 在 `start()` 記 `this.scenIdx = runScenarioIndex()`；`openCityPanel(cityName, openCmd?)` 傳 `scenIdx: this.scenIdx`、`garrison`（`data.garrison` 是陣列才傳，否則 null，`gateTroopsOf` 回落 110）、`openCmd`；`enemyIntelOf` 的 `resolveEnemyIntel(this.data, 0, ...)` 也改成 `this.scenIdx`。
  - `CityPanel.ts` `CityPanelOptions` 加 `scenIdx?`，`open()` 用 `scenIdx: M.intOr(options.scenIdx, 0, 0)`、`garrison: options.garrison ?? null`；模型側 `cityOf/statusOf/rosterOf/wildPool/gateTroopsOf` 本來就吃 `ctx.scenIdx`，現在一起按劇本取。
- 驗證方式：`tests/cocos_affairs.test.ts` →「P0-2 scenIdx=1（討伐董卓）平原 = 關羽、劉備、張角、張飛、簡雍；scenIdx=0 不是」；探針 `probe_scenidx.mjs` 對照表（scenIdx=0 `張角、廖化、裴元紹` vs scenIdx=1 `關羽、劉備、張角、張飛、簡雍`，wildPool 同理）。
- 遺留：`garrison.json` 是 `DataLoader` 的可選表；若該檔未載入，關卡守軍仍按 `GATE_TROOPS_FALLBACK = 110`，需實機確認資源包有這張表。

## P0-3 無 prepFromMoney（F13 未移植）

- 改前行為：模型只有 `refillPrep()`（每月白補上限 10%），「部隊徵兵」入口也不把金換成預備兵。實測 web 南皮 money 5000 / prep 100（cap 240）換月 → money 0、prep 150；Cocos 同條件 → money 5000、prep 100→124。
- 改後行為：
  - `CityModel.ts` 新增 `export const PREP_PER_GOLD = 100` 與 `prepFromMoney(save, cityDef)`：`n = min(floor(money/100), prepCap - prep)`、`prep += n`、`money -= 100n`（回傳 `{ok, city, n, cost, prep, cap, money}`，與 web `city_model.js:973-984` 同式）。
  - `autonomyTick(save, cityDefs, ctx?, opts?)` 預設每城走 `prepFromMoney`；`opts.loose === true` 才走舊 `refillPrep`（Cocos 沒有 web 的 `?loose=1` URL，只有這個除錯參數）。
  - `CityPanel.cmdEnlistSheet()` 入口先 `M.prepFromMoney(save, def)` 並記一條「金 -n → 預備兵 +n（共 x／cap）」日誌，接著立刻 `persist()`（玩家在抽屜按「取消」也不會丟掉這筆結算），再算步／騎可徵數量。
- 驗證方式：`tests/cocos_affairs.test.ts` →「P0-3 prepFromMoney：250 金 → 2 預備兵（剩 50 金）；上限只扣實際轉換金」與「P0-3 換月結算：autonomyTick 預設走 prepFromMoney（不再白補 10%）；?loose=1 才走舊 refillPrep」。
- 遺留：`?loose=1` 在 Cocos 端沒有 UI/URL 入口，屬除錯參數（web 對等物是 query 參數）。

## P0-4 逐將年令（F2）/ 隨軍過濾（F3）未移植

- 改前行為：Cocos 把 F7 誤讀成「主令每項每月一次」——`save.cmdOrders[cmd] = 本月`，`runCommand` 逐令閘門，平原 3 將可 12 次/年/城；`save.acted` / `save.away` / `syncAway` 全倉不存在；也沒有 web 的正月門（`CampaignRoot.ts` 舊註釋明說「不再有 web 的正月閘門」）。
- 改後行為：
  - `CityModel.ts` §12b 整段換成 F2/F3（舊 `cmdOrderUsed/markCmdOrder/ordersUsedCount/clearCmdOrders` 全部移除）：`yearIndexOf(save)`（11 個月年序）、`actedYearOf/actedLocked`（`save.acted[將] = 年序`，同將同年第二次行動被拒）、`markActed`、`clearActed`、`actedNames`；`awayNameSet(save)`（`save.away` 有部隊 id 的名 ∪ `save.armies` 裡 `side === 'A'` 的 general/officers）、`syncAway(save)`（只用我方部隊重建 `save.away`）；`isAffairsMonth` / `readOnly(save, unlimited)` / `OFF_MONTH_HINT`（非正月只讀，與 web `city.html:543-553` 同口徑）。`rosterOf` 用 `awayNameSet` 剔除隨軍將；`ensureExtras` 每次讀檔規範化 `acted`/`away`。
  - `CityPanel.ts`：`runCommand` 閘門改成 `M.readOnly(save, false)`（非正月→`OFF_MONTH_HINT`；出征/自治收束窗口→`LOCK_HINT`）；開發/搜索先 `pickExec()` 選執行將（列出今年未行動的城內將，`openSheet` 抽屜），成功後 `actedBy(name)` 鎖該將今年；徵兵不吃年令（web `doRecruit` → `afterCommand(false)`），移動/任命/情報是副令/免費；HUD「月令 n/7」改成「年令 n/城內將數」，無可用將時開發/搜索變灰；`lblHint/lblBandNote/tipsOf` 文案同步；`deployTo/runAuto` 保留 `markMonthActed`（出征/自治收束窗口）。
  - `CampaignRoot.ts`：`mergeSave`/`persist` 把 `acted/away` 跨屏帶進 `sanguo_city_v1` extras，開頁時 `armies = gs.armies` + `syncAway(save)`；`endInterior` 舊註釋改成「恢復 web 正月門」。
- 驗證方式：`tests/cocos_affairs.test.ts` 三條——「P0-4/F2 逐將年令：同將同年第二次行動被拒，換將不受影響，新年解鎖」「P0-4 正月門：非正月只讀；正月可下；出征/自治收束窗口後只讀」「P0-4/F3 隨軍（away）將不能內政；syncAway 依我軍部隊重建、回城歸還」；`cocos_p1_port.test.ts` 舊 F7 逐令斷言已改寫為 F2/F3 斷言（12/12 pass）。
- 遺留：`attachGeneral` 回城時「delete `_moved` 且從 roster 移除」的 P1-4 舊 bug 不在本輪清單，未動（現階段隨軍過濾已讓在途將不出現在城內名單，該 bug 影響面變小但仍存在）。

## P1-1 開發公式永遠用太守

- 改前行為：`develop()` 內 `const exec = generalOf(ctx?.generals, majorOf(save, cityDef))`，執行將永遠等於太守；`scaledGain` 也只用太守 INT。web 是「base 用執行將 INT/STR、縮放用太守 INT」。四組對照中兩組錯：太守諸葛亮/執行呂布 web +6840/+55 vs Cocos +13800/+39；太守呂布/執行諸葛亮 web +9354/+27 vs Cocos +4636/+38。
- 改後行為：`develop()` 改成 `const major = generalOf(ctx?.generals, majorOf(save, cityDef)); const exec = generalOf(ctx?.generals, ctx?.exec) || major;`，`intel/str` 取 `exec`、`eff` 與兩次 `scaledGain` 的第 2 參數取 `majorIntel`；`CityCtx` 新增 `exec?: string`；`CityPanel.developBy(name)` 傳 `{...ctx, exec: name}`。
- 驗證方式：`tests/cocos_affairs.test.ts` →「P1-1 開發執行將：太守諸葛亮/執行呂布 與 太守呂布/執行諸葛亮 都與 web 同數字」（Cocos vs web 逐值相等，並硬編碼 web 基準 `6840/55`、`9354/27`；另驗無 exec 時等於太守執行）；探針 `probe_develop.mjs` 改後四組 Cocos 全與 web 相同：`+4636/+38`、`+6840/+55`、`+9354/+27`、`+13800/+39`（探針腳本裡「Cocos 只有太守欄變化」是改前寫死的說明文字，數字表已是對齊後的）。
- 遺留：無。

## P1-2 searchSeq 不落盤

- 改前行為：`CityPanel.mergeSave/persist` 的 `sanguo_city_v1` extras 不含 `searchSeq/searchNonce`；重進內政頁後 `ensureExtras` 只能從 `searchLog`（上限 60 條）重算次數 → count 凍結在 60，第 61 次起搜索種子固定、結果重複（實測重進頁後下一次 seed 1181641053 = 歷史第 61 次）。
- 改後行為：`mergeSave` 讀回 `searchSeq/searchNonce/acted/away/armies`，`persist` 寫回 `searchSeq: save.searchSeq`、`searchNonce: save.searchNonce`（沿用 web 同鍵語義；`CityModel.ensureExtras` 本來就優先信任現存 `searchSeq`，不會被 60 條日誌截斷）。
- 驗證方式：`tests/cocos_affairs.test.ts` →「P1-2 searchSeq 落盤：重進內政頁後第 61 次搜索不再重放舊種子」（連 65 次 → 記憶體 65、日誌仍 60；帶 `searchSeq` 重進 count 仍 65、下一次 seed ≠ 歷史第 61 次；只帶 `searchLog` 重進 count 回落 60、seed 等於舊種子，重現舊 bug 作反例）；JSON roundtrip 不掉精度。
- 遺留：無（鍵用 CityPanel 既有的 `sanguo_city_v1` extras，未另建 `sanguo_searchseq_v1`，避免多一套鍵）。

## 附帶：大地圖 F12/F15 按鈕口徑 + 測試契約更新

- `CampaignRoot.actions()` 敵情分支（敵抵城下／敵在路上）的「徵 兵／開 發」按鈕不再直接走 `GameState.recruit/develop`（500 金→40 兵、400 金→3000 民），改成開內政面板並帶 `openCmd: '徵兵' / '開發'`，caption 改成「進城徵兵 · 金→預備兵→兵」「進城開發 · 選將執行」；`doAction('recruit'/'develop')` 同步改成 `openCityPanel(selected, '徵兵'/'開發')`。`GameState.recruit/develop` 保留（舊契約測試 `[F16]` 仍斷言其扣錢字串，且不再是地圖入口）。
- `tests/cocos_p1_port.test.ts` 三條過時斷言改寫（其餘 9 條不動）：
  - 舊「[F7] 逐令月配額」→「[F2/F3] 逐將年令 + 隨軍過濾 + 正月門」，並斷言四個舊函式/`save.cmdOrders` 已不存在；
  - 舊「CityPanel 逐令閘門」→「正月門 + 逐將年令」，改斷言 `M.readOnly` / `OFF_MONTH_HINT` / `pickExec` / `actedBy` / HUD「年令」；
  - `[F16]` 的 `cmdOrders: save.cmdOrders` → `searchSeq: save.searchSeq`。

## 改了哪些文件

| 文件 | 改動 |
| --- | --- |
| `game/cocos/assets/scripts/CityModel.ts` | P0-3 `PREP_PER_GOLD`/`prepFromMoney`/`autonomyTick` 口徑；P0-4 §12b 換成 F2/F3 + 正月門，`ensureExtras` 規範化 `acted/away`，`rosterOf` 過濾隨軍；P1-1 `develop` 用 `ctx.exec`；P1-2 說明（模型側既有 `searchSeq` 保留）；P0-1 `bagAddRaw`/`bagSeqsOf`；`CitySave` 刪 `cmdOrders`、加 `acted/away/armies`，`CityCtx` 加 `exec` |
| `game/cocos/assets/scripts/CityPanel.ts` | P0-1 `bagAdd` + 搜索成功入包；P0-2 `scenIdx/garrison` 選項與 ctx；P0-3 徵兵入口 `prepFromMoney`；P0-4 正月門 + `pickExec/developBy/searchBy/actedBy` + 年令 HUD/文案 + 移除逐令閘門；P1-2 `searchSeq/searchNonce` 跨屏保存；F12/F15 `openCmd` 進場直開抽屜 |
| `game/cocos/assets/scripts/CampaignRoot.ts` | P0-2 `scenIdx` 記錄與傳遞（`openCityPanel`、`enemyIntelOf`）、`garrison` 傳遞；F12/F15 按鈕改開面板；`endInterior` 註釋改回正月門口徑 |
| `game/tests/cocos_affairs.test.ts` | **新增**（423 行）9 條純邏輯回歸，直接 import `cocos/assets/scripts/CityModel.ts` 與 `web/saves.js`，不依賴 `cc` |
| `game/tests/cocos_p1_port.test.ts` | 3 條舊 F7/F16 接線斷言改寫成 F2/F3 語義（+28 行） |

未改：`GameState.ts`（`CampaignSave.armies` 已存在、可直接用）、`game/web/**`（真源不動）、5 個戰場文件。

## 需要 lead 構建 / 實機驗證的點

1. **編譯**：Cocos Creator 打開工程編譯（本輪只跑 `tsc -p cocos/tsconfig.check.json`，沒跑 Cocos 構建）。
2. **P0-1 背包**：城內「搜索」命中寶物/兵符 → 打開「武將資料 → 物品」頁應看到新道具；`localStorage['sanguo_items_v1']` bag 長度 +1、重複道具不重複。
3. **P0-2 劇本名單**：選《討伐董卓》進「平原」內政，武將欄應為 `關羽、劉備、張角、張飛、簡雍`；在野池應含 `淳于瓊`（不是 `杜遠`）。若關卡（RATE=0）要驗守軍，確認資源包有 `garrison.json`。
4. **P0-3 徵兵**：點「徵兵」時應先看到「金 -n → 預備兵 +n」日誌，金額按 100 金/兵扣、受預備兵上限夾住；不再出現每月白補 10%。
5. **P0-4 年令/正月門**：非正月（大地圖推進到 2-12 月）進城應只讀並提示「非正月」；正月內政時同一名將第二次開發/搜索應被拒（抽屜裡該將消失），HUD 顯示「年令 n / 城內將數」；出征/自治後窗口收束應只讀。出征中的將不應出現在城內名單（回城後恢復）。
6. **P1-2 跨屏**：連做 60+ 次搜索（或用除錯手段），退出再進內政頁，第 61 次以後結果不應再重複；`sanguo_city_v1` extras 內應有 `searchSeq/searchNonce/acted/away`。
7. **F12/F15 大地圖按鈕**：敵情下點「徵 兵／開 發」應進城開對應抽屜（而不是舊的 500 金/400 金一步結算）。
8. **視覺**：HUD 新增「年令」格、抽屜「執行武將（開發/搜索）」、提示文案（正月門/在途）在 750×1334 設計解析度下不溢出。

## 已知遺留與風險

- P1-4 `attachGeneral` 回城 bug（delete `_moved` + 從 roster 移除 → 可被重複搜索）不在本輪清單，未修。
- `garrison.json` 未載入時關卡守軍退回 110（DataLoader 既有 fallback）。
- `GameState.recruit/develop` 舊函式保留（舊測試契約），但已無大地圖入口；若後續清理需同步改 `cocos_p1_port.test.ts` 的 `[F16]` 兩條扣錢斷言。
- 測試輸出有無害警告 `MODULE_TYPELESS_PACKAGE_JSON`（`CityModel.ts` 所在目錄無 `package.json type`，Node 自動按 ESM 重解析，不影響結果）。
