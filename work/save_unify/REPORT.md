# F-09/F-10 Cocos 側修復報告（存檔容器/遷移 + 手動存檔語義）

狀態：**完成**。`SaveSlots.ts` 已改、新測試 11 條全綠、四道門禁全綠。
改動檔案只有兩個：`game/cocos/assets/scripts/SaveSlots.ts`（1041 → 1222 行）與新增
`game/tests/save_slots_unify.test.ts`（11 條）。沒有碰 `GameState.ts` / `CampaignRoot.ts` /
`web/**` / `game/src/core/**`。

## 0. 結論摘要

- **F-09**：Cocos 讀檔/開面板時，若盤上只有 web 舊槽容器 `sanguo_saves_v1`（v3 快照），
  由新增的 `migrateLegacySaves()` 一次性遷移成 Cocos 索引 `sanguo_slots_v1` + 每格
  `sanguo_slot_payload_v1_<n>`；舊鍵**只讀不刪**（web 版照常能讀），遷移**冪等**，
  壞 JSON / 意外異常一律吞掉並回退空索引，不崩。
- **F-10**：`saveToSlot()`（手動存檔）不再改 `active`；新增 `saveAutoSlot()` 承擔
  「寫 active 那格、但不改 active」的自動存檔語義。讀檔（`loadFromSlot`）與點槽位列
  （`setActiveSlot`）仍是唯一會移動自動存檔目標的入口 —— 與 web `campaign.html`
  （手動 `Saves.writeSlot` 不動 `last`、`loadSlot` 會把 `last` 指到讀取槽）逐條對齊。
- 驗證：新測試 11/11；`tsc --noEmit` 0；`tsc -p cocos/tsconfig.check.json` 0；
  `scan_utf8` 2 files 0 BAD；全量 `node --test tests/*.test.ts` 1854 tests / 1853 pass / 0 fail / 1 todo。

## 1. 改動內容（SaveSlots.ts）

| 位置 | 改動 |
| --- | --- |
| 頭註解 `:1-24` | 刪掉「不做存檔格式遷移」的自述，改寫 F-09 遷移與 F-10 語義兩段 |
| 常量 `SLOTS_KEY` 後 | 新增 `export const LEGACY_SAVES_KEY = 'sanguo_saves_v1';` |
| 型別區（`SaveSlotOptions` 後） | 新增 `export interface MigrateLegacyResult { migrated; reason; slots; active }`；`reason` 枚舉 `'ok' \| 'has-slots' \| 'no-legacy' \| 'bad-json' \| 'empty' \| 'error'` |
| `readIndex()` `:296` | 開頭先 `migrateLegacySaves(storage)` 再讀（遷移內部直接讀 storage、`writeIndex` 不反調 `readIndex`，**無遞迴**；遷移失敗時照舊回空索引） |
| `saveToSlot()` `:436-466` | **刪除 `index.active = n`**；doc 改寫成「手動存檔只寫該槽、不改自動存檔目標」並註明對齊 web `Saves.writeSlot`（`campaign.html:2003-2004`） |
| 新 `saveAutoSlot()` `:474-481` | `saveToSlot(save, readIndex().active, …)`：自動存檔仍寫 active 槽、但不改 active（對齊 web `Saves.writeSlotAuto`） |
| 新 §5b `:551-660` | `campaignOfWebSnapshot()`（`:567`）、`recordOfWebEntry()`（`:594`）、`migrateLegacySaves()`（`:626`） |
| 面板 `open()` `:939-954` | build 後先遷移；`ok` → 標題下提示「已從 web 舊存檔遷移 N 格（舊鍵保留只讀）」，`bad-json` → 「web 舊存檔已損壞，已回退空檔」 |
| 面板 `act('save')` `:1009-1021` | 存完讀一次 `active`，若 ≠ 所存槽，提示追加「· 自動存檔仍寫槽 N」（避免玩家以為存歪） |
| 面板 `act('save-active')` `:1023-1035` | 改走 `saveAutoSlot()`（原本是讀 active 再 `saveToSlot`，語義等價但意圖更明確） |

對外介面只增不減：新增 `LEGACY_SAVES_KEY` / `MigrateLegacyResult` / `migrateLegacySaves` /
`saveAutoSlot`；`CampaignRoot.ts`（只 import `SaveSlotsPanel`/`adYearOfMonth`/`ADVANCE_NOTICE`/`AD_ANCHOR`）
與 `TitlePanel.ts`（只 import `filledCount`/`loadFromSlot`/`readIndex`/`setActiveSlot`/`slotLines`/`slotRecord`/
`SLOT_COUNT`）的 import 面完全不受影響（已 grep 確認；倉裡除本檔與新測試外沒有別處呼叫 `saveToSlot`）。

## 2. F-10 改前基線（改動前用 probe 記錄）

改動前在空 storage 上呼叫
`saveToSlot({owned:['小沛'],month:3,wins:2,losses:1,roster:{小沛:['關羽','張飛']}}, 2, {now:123}, storage)`
（`work/save_unify/probe2.mjs`，Node 24 + cc 樁），寫出的索引是：

```json
{ "active": 2, "slots": { "2": { "at": 123, "meta": { "monarch": "", "cities": 1, "month": 3,
  "monthText": "第1年3月", "wins": 2, "losses": 1, "generals": 2, "scenario": "", "name": "" } } } }
```

即「手動存檔把自動存檔目標帶到該槽」= F-10 病灶復現。改後同一操作 `active` 保持 `1`
（新測試第 10 條鎖死：連存槽 1/5/9 後仍為 1；`setActiveSlot(3)` 後再存槽 1 仍為 3）。

web 側對照（只讀參考，未改）：`campaign.html` 手動存檔 `saveToSlot()` 用 `Saves.writeSlot`
（`saves.js:1016-1027`，預設不動 `store.last`），自動存檔 `autosave()` 用
`Saves.writeSlotAuto`（`:1033-1035`，寫 `last`）；`loadSlot` 讀檔後把 `last` 指到讀取槽
（`campaign.html:2032-2035`）。Cocos `loadFromSlot` 原本就會 `index.active = n`，與 web 一致，
**本次不動**。

## 3. F-09 遷移策略

觸發點：`readIndex()`（任何列表/槽操作都會先經過它）與面板 `open()`。
只在「盤上已有 Cocos 索引 `sanguo_slots_v1`」時**絕不遷移**——這是冪等的根據，也保證
玩家在 Cocos 玩過之後 web 再寫舊容器不會覆蓋 Cocos 進度。

`migrateLegacySaves(storage)` 決策表：

| 盤上狀態 | 回傳 reason | 寫入？ |
| --- | --- | --- |
| 已有 `sanguo_slots_v1`（內容好壞都算） | `has-slots` | 不寫（權威是 Cocos 索引） |
| 沒有舊鍵 `sanguo_saves_v1` | `no-legacy` | 不寫（正常首次啟動） |
| 舊鍵存在但 JSON 壞 / 非物件 | `bad-json` | 不寫任何鍵，`readIndex` 回空索引（不崩） |
| 舊容器一格有效槽都沒有 | `empty` | 不寫索引（下次開面板還能重試，不把空容器釘死） |
| 遷移 ≥1 格 | `ok` | 每格 payload + 索引（含 `active`） |
| storage 拋錯 / 形狀離譜 | `error` | 吞掉例外，呼叫端照常拿到空索引（可能留下無索引的孤立 payload 鍵，不影響讀取，下次遷移會覆寫） |

規則細節：

- 舊容器 `slots` 是 web 的 **0 起**陣列（10 格）：第 `i` 格 → Cocos **槽 `i+1`**；
  `null` / 沒有 `snapshot` / `snapshot` 非物件 / 空物件跳過；`snapshot` 是字串時先 try-parse。
- 每格寫 `sanguo_slot_payload_v1_<n> = { "sanguo_campaign_v1": <遷移後快照 JSON> }`。
- web 的 `last`（1..10，自動存檔目標）→ Cocos 索引 `active`（非法則回 1）。
- 舊鍵 `sanguo_saves_v1` **從不 removeItem**：遷移後 web 版仍能讀自己的存檔（測試第 3 條：
  遷移後、`deleteSlot()`、`saveToSlot()` 都不動舊鍵一個位元組）。
- 面板提示：遷移成功/舊檔損壞各有文案；`has-slots`/`no-legacy`/`empty` 靜默。

## 4. 跨端欄位映射表（web v3 快照 + 槽 entry → Cocos）

web 快照本身就是 campaign 形狀（`owned` 陣列 / `cities` 城表 / `roster` / `month` …，
`SNAPSHOT_REQUIRED` 見 `saves.js:250-261`），所以遷移是「整檔搬運 + 少量收斂」，
由 `campaignOfWebSnapshot()` 完成：

| web 欄位 | 來源 | Cocos 目標 | 轉換 |
| --- | --- | --- | --- |
| 容器 `sanguo_saves_v1`（`{v,last,slots[10]}`） | `saves.js:465-474` | 索引 `sanguo_slots_v1` `{active,slots}` | `last`→`active`，槽 i→i+1 |
| 槽 `slots[i]`（0 起） | 同上 | payload `sanguo_slot_payload_v1_<i+1>` | 只收 `snapshot` 為物件者 |
| `snapshot.owned`（別名 `owns`） | 快照必填 | `campaign.owned` | 去空、去重、**`owns` 收斂成 `owned` 並刪別名** |
| `snapshot.month` | 快照必填 | `campaign.month` | `max(1, trunc(n))`，字串也吃（測試：`'27'`→27） |
| `snapshot.wins` / `losses` | 快照必填 | `campaign.wins` / `losses` | `max(0, trunc(n))` |
| `snapshot.scenario`（數字） | 快照必填 | `campaign.scenario` | `max(1, trunc(n))` |
| `snapshot.cities`（城摘要表） | 快照必填 | `campaign.cities` | 非物件→`{}`；城明細由 `GameState.normalize` 按 Cocos 已知鍵清洗（troops/pop/money/owner/major/officers/DEFENSE），城層未知鍵原樣保留 |
| `snapshot.roster`（城→武將名陣列） | 快照必填 | `campaign.roster` + `meta.generals` | 非物件→`{}`；`meta.generals` = roster 名字去重數（與 `owned[*].major/officers` 同計） |
| `snapshot.ts`（ms） | 快照必填 | `SlotRecord.at` | 原值（entry.ts 優先），ms 同口徑不換算 |
| —（web 無此欄位語義） | — | `campaign.seeded = true`（當 `owned` 非空） | **必需**：否則 `GameState.initCampaign` 會把遷移檔當「未開局」再白送 3 座城（`GameState.ts:644-689`） |
| `snapshot` 其餘鍵（year/ledger/armies/log/…） | 快照 | `campaign` 同鍵 | 原樣帶過（`GameState.normalize` 白名單外鍵保留） |
| `entry.ts` | 槽摘要 | `SlotRecord.at` | 優先於 snapshot.ts；都沒有→`Date.now()` |
| `entry.monarch` | 槽摘要 | `meta.monarch` | 非空覆蓋（快照沒有獨立君主名欄位時靠它） |
| `entry.slotName` | 玩家改名 | `meta.name` | `slice(0, SLOT_NAME_MAX=20)` |
| `entry.scenarioName` | 劇本名 | `meta.scenario` | 非空覆蓋 |
| `meta.monthText/wins/losses/cities/generals` | 派生 | `meta.*` | 由 `metaOfSave(campaign)` 重算，不信任 web 摘要 |

已知邊界：`owns` 在目前 web/ 生產程式碼中並不存在（全倉 grep 只有本檔的防禦別名與測試），
這裡按 lead 要求「`owns≈owned`」做成兩種拼寫都吃、統一收斂；未逐欄位比對 web 60 城的
城明細鍵名與 Cocos `CityRuntime` 是否完全等價（見 §7 遺留）。

## 5. 測試：`game/tests/save_slots_unify.test.ts`（11 條，全過）

Node 24 原生跑 TS，但 `SaveSlots.ts` 頂部 `import … from 'cc'` 且有 `@ccclass('SaveSlotsPanel')`
裝飾器（Node 的 type-strip 不解析裝飾器）。測試用 `node:module` 的 `registerHooks`：

- resolve hook：`'cc'` 短路成 data: URL 樁（Component/Node/Label/Color/Graphics/UITransform/
  Vec3/EventTouch/input/Input/director/sys 全為空殼）；相對 import 缺副檔名時補 `.ts`；
- load hook：只對 `SaveSlots.ts` 生效，剝掉唯一一行 `@ccclass('SaveSlotsPanel')` 後
  `stripTypeScriptTypes()` 再交給 Node 編譯；
- `GameState.ts` 動態 import 只為取 `SAVE_KEY`（`GameState.ts` 本身無 cc 依賴，Node 可直讀）。

（`work/save_unify/probe2.mjs` 是同一方案的探針，`probe_import.mjs` 記錄了「裝飾器不能直接載入」的失敗嘗試，留作證據。）

| # | 測試 | 鎖定的行為 |
| --- | --- | --- |
| 1 | F-09 舊鍵→Cocos 結構 | web `last`→`active`、`slots[i]`→槽 `i+1`、`entry.ts`→`at`、payload 可 parse、`meta` 各欄位、campaign 的 owned/month/seeded/cities/roster |
| 2 | F-09 冪等 | 第二次遷移 `has-slots`；索引與舊鍵字串逐位元組不變；`readIndex` 也不改寫 |
| 3 | F-09 舊鍵只讀不刪 | 遷移後、`deleteSlot`、`saveToSlot` 之後舊鍵逐字不變（web 仍能讀） |
| 4 | F-09 壞 JSON | 回 `bad-json`、不寫 `sanguo_slots_v1`、`readIndex` 回 `{active:1,slots:{}}`、壞舊鍵原樣保留 |
| 5 | F-09 空容器/壞槽 | 全空→`empty` 不寫索引（可重試）；`snapshot` 非物件的槽跳過 |
| 6 | F-09 遷移意外 | storage 對舊鍵拋錯→`error` 不崩 |
| 7 | F-09 已有索引絕不覆蓋 | 舊鍵壞掉也不影響既有索引（`active=4` 保持） |
| 8 | F-09 跨端欄位 | `owns`→`owned` 去空去重且不殘留 `owns`；`month` 字串轉整數；`roster` 去重 generals=2；`entry.monarch/scenarioName` 覆蓋；`slotName` 截 20 字 |
| 9 | F-09 遷移後可讀 | `loadFromSlot` 寫回 live 鍵、`keys=[SAVE_KEY]`、`active` 指到讀取槽（web `loadSlot` 同款） |
| 10 | F-10 手動存檔不改 active | 空盤存槽 1→active 仍 1；再存 5/9 仍 1；`setActiveSlot(3)` 後存 1 仍 3 |
| 11 | F-10 自動存檔仍寫 active 槽 | `setActiveSlot(3)` 後 `saveAutoSlot` 寫槽 3、`active` 仍 3、槽 1 內容不動 |

跑法與結果：

```
cd F:\sanguo\game
node --test tests/save_slots_unify.test.ts
# tests 11 / pass 11 / fail 0
# （唯一 stderr：ExperimentalWarning: stripTypeScriptTypes is an experimental feature，無害）
```

## 6. 門禁（全綠）

| 門禁 | 命令 | 結果 |
| --- | --- | --- |
| Cocos 側類型（game 全量） | `cd F:\sanguo\game; node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| Cocos 引擎宣告檢查 | `node node_modules/typescript/bin/tsc -p cocos/tsconfig.check.json` | exit 0 |
| 中文編碼 | `cd F:\sanguo; node work/enc/scan_utf8.mjs game/cocos/assets/scripts/SaveSlots.ts game/tests/save_slots_unify.test.ts` | `scan: 2 files, 0 BAD, 0 WARN, 2 clean -> OK` |
| 全量測試 | `cd F:\sanguo\game; node --test tests/*.test.ts` | 1854 tests / 1853 pass / 0 fail / 1 todo（既有 todo）/ 5.5s → exit 0 |

## 7. 遺留 / 需要 lead 決定

1. **web 側要不要跟著改？**（本任務明定由 lead 決定）
   - 本次是「Cocos 單向兼容 web 舊容器」：Cocos 讀 `sanguo_saves_v1`、遷移後保留舊鍵，
     **web 完全不需要改就能繼續讀自己的存檔**。若 web 不改，兩端各寫各的鍵，只有
     「Cocos 第一次啟動且只有 web 存檔」時會遷移一次。
   - 若要**雙向同步/長期統一 schema**，需要 web 也認 Cocos 的 `sanguo_slots_v1` +
     `sanguo_slot_payload_v1_*`，或兩端都改寫到同一個帶 `version` 的容器（F-09 報告原文
     建議的 snapshot schema + upgrade 鏈）。這是跨端設計決策，超出本單「只改 Cocos」的紀律範圍。
   - `web/**` 本次一個字都沒動（已遵守）。
2. **遷移只發生一次（第一次建立 Cocos 索引之前）**：此後 web 新增/更新的槽不會自動併進
   Cocos 索引（`has-slots` 直接返回，防止覆蓋 Cocos 進度）。若要「隨時匯入 web 舊檔」，
   建議另開一個顯式「從 web 匯入」入口，而不是改 `readIndex` 的隱式遷移。
3. **真實 v3 生產檔的端到端回歸未做**：測試用的是合成 v3 快照（欄位按 `SNAPSHOT_REQUIRED`
   構造）。真實 web 存檔若含 `strange` 形狀（例如 `armies` / `year` / `ledger`），
   會原樣帶進 campaign，交由 `GameState.normalize` 清洗；建議 lead 拿一份真實 web 存檔
   樣本在 Cocos 裡讀一次（或在 web 端 `saves.js` 導出 JSON 給測試）。
4. **`owns` 別名**：目前生產 web 實際用 `owned`，`owns` 只是防御性兼容；如果 lead 知道
   有別的端（例如舊 APK / 存檔編輯器）用 `owns`，這個兼容就有價值，否則可視為冗余但無害。
5. **run 狀態不在遷移範圍**：`sanguo_run_v1` / `sanguo_run_fresh` / `sanguo_adv_single` 不在
   `CAMPAIGN_KEYS`，讀槽不會切換 run 狀態（原有行為，本次未動、未擴大到 run 系統）。
6. **面板 UI 無自動化測試**：Cocos 節點/觸控在 node 不可跑；本次面板改動（遷移提示、
   「自動存檔仍寫槽 N」提示、`save-active` 走 `saveAutoSlot`）靠 `tsc -p cocos` 型別門禁
   與人工代碼審閱，建議真人開一次面板確認文案。
7. **工作檔**：`work/save_unify/probe2.mjs`（可重跑的載入探針）與 `probe_import.mjs`
   （失敗方案記錄）保留在原處，不屬於交付代碼；如果 lead 不想要可刪。
