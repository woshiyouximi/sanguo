# 106 Cocos 君主與勢力（v16-cocos-monarch）

- 日期：2026-11-25
- 範圍：`F:\sanguo\game\cocos\assets\scripts\` 三個檔（新建 2、改 1）+ `work\cocos_monarch84\**` + 本報告
- 任務：`m00001`（移植君主/勢力）+ lead 追加的 AI 宿主接線（`m00357`）
- 結論：**4 項交付全部落地**；`cocos tsc` exit 0；君主模組對拍 **6000 次事件 / 2,965,306 葉子 / 0 不一致**；地圖版式探針 29/29 PASS；頁頭幾何自檢 0 出界 0 相交；`runMapAi()` node 冒煙 0 失敗。
- **`GameState.ts` 一個字都沒改**：君主欄位走補丁鍵 `sanguo_monarch_v1`（§8），需要動主檔的兩處寫成建議 diff 交給 lead。

---

## 1. 交付物

| 檔案 | 行數 | 性質 |
|---|---:|---|
| `game\cocos\assets\scripts\MonarchModel.ts` | **1072** | 新建。`game/web/monarch_model.js`（617 行）的 1:1 TS 移植 + 色板/開局播種（搬自 `saves.js`） |
| `game\cocos\assets\scripts\MonarchPanel.ts` | **755** | 新建。君主屬性卡 + 讓位候選浮層 + 勢力一覽/勢力明細抽屜 |
| `game\cocos\assets\scripts\CampaignRoot.ts` | 1388 → **1737** | 改。頁頭「君主 X · 勢力 Y · 城 N · 戰績」、君主卡入口、勢力一覽入口、城點 14 家分色 + 玩家金環、AI 接線 |
| `work\cocos_monarch84\parity.mjs` | 733 | 新建。君主模組 ↔ web 真源逐欄位對拍（0 不一致） |
| `work\cocos_monarch84\layout_guard.mjs` | 154 | 新建。`// #region 版式纯函数` 契約回歸（不許 import cc、四個導出答案不變、60 城標籤 0 出界 0 重疊） |
| `work\cocos_monarch84\hud_layout.mjs` | 135 | 新建。頁頭版式幾何自檢（出界/相交/安全距/命中區） |
| `work\cocos_monarch84\ai_smoke.mjs` | 311 | 新建。把 `CampaignRoot.runMapAi()` 的方法體整段切出來真跑（§7） |
| `work\cocos_monarch84\parity_result.json` | — | 對拍統計數字（本報告 §3 直接引用） |
| `project\106_Cocos君主与势力.md` | — | 本報告 |

---

## 2. 移植範圍（`MonarchModel.ts`）

### 2.1 分節

| 節 | 內容 | 行 |
|---|---|---:|
| §0 | 常量/型別/小工具：`MONARCH_SRC`（0x40975E / 0x10 / 0x4A64F0 / 0xBF / 0x91 / 1 / 2 / 8 / `LoyalKing` / 60）、`FATE`、`FATE_TEXT`、`STATUS_TEXT`、`COMPOUND`（60 個複姓）、`str/num/intOr`、`saveOf/objOf/cityNameOf` | 36–124 |
| §1 | 君主是誰：`monarchOf / forceIdOf / forceNameOf / setMonarch / abdicate / inheritForce` | 125–270 |
| §2 | 繼承：`clanOf / sameClan / normOfficer / normStatus / isEmployed / successionScore / successionList / pickSuccessor / abdicateCandidates` | 271–466 |
| §3 | 滅亡：`decideFate / extinguish / kingDeath` | 467–639 |
| §4 | 勢力聚合：`forceRoster / officerStatus / forceDetail` | 640–817 |
| §5 | 漂移摘要：`recordDrift / driftSummary / driftText / monthTag` | 818–903 |
| §6 | 出兵上限：`troopCapOf / fateText` | 904–930 |
| §7 | 勢力色板：`FORCE_PALETTE`(14) / `FORCE_RESERVE`(14) / `FORCE_COLOR_NEUTRAL` / `FORCE_GOLD` / `FORCE_EDGE` / `forceHash` / `forceColorIndex / forceColorOf / forceColorMap` | 931–1026 |
| §8 | 開局播種：`seedMonarch(save, cities, opts)` | 1027–1072 |

**73 個 `export`**，其中：

- **34 個與 web `monarch_model.js` 同名**（對拍腳本逐個驗過兩邊都在，見 §3「同名導出 34/34」）；
- **31 個是單純的型別**（`MonarchSave`/`Officer`/`ForceRow`/`… Result` 等，型別擦除後不影響執行）；
- **8 個是 Cocos 新增**：色板 7 個 + `seedMonarch`。這 8 個在 web 側屬於 **`saves.js`**（`:113-186` 色板、`:1030-1046` 開局播種），任務書只指名 `monarch_model.js`，所以搬進 MonarchModel 以免 Cocos 依賴 `game/web/**`。

### 2.2 與 web 的差異（全部是型別層，沒有行為差）

| 差異 | 原因 | 影響 |
|---|---|---|
| 所有 `save` 參數型別是 `unknown`，內部 `saveOf()` 收窄成 `MonarchSave`（索引簽名介面） | web 是無型別的寬鬆物件；`strict: true` 下不能直接點屬性 | 無（`saveOf` 語義照抄：非陣列物件或 `{}`） |
| 新增 `Officer`/`ForceRow`/`SuccessionEntry`/`…Result` 等 31 個 interface | 同上 | 無（執行期擦除） |
| `Officer.loyal: number \| null`（web 用 `null` 表示「沒有忠誠資料」） | 保留 web 的 `null` 哨兵，不用 `undefined` | 無 |
| `objOf()` 拒絕陣列（web 的 `typeof f === 'object'` 對陣列也 true） | 型別收窄需要 | **已驗算等價**：陣列在 `forceRoster.ensure` 的 `f.alive !== false` 判定下結果相同（`[]` 沒有 `alive` 屬性 → `declared = true`） |
| `forceRoster.ensure` 回 `ForceRow \| null`，空字串回 `null` | 對應 web `if (!key) return null` 的早退 | 無 |
| `forceDetail` 用 `ForceDetailRow extends Omit<ForceRow,'officers'>` + 一次 `as unknown as` | `officers` 從 `Officer[]` 換成 `OfficerStatus[]` | 無（只是欄位型別放寬） |

### 2.3 逐字保留、最容易寫錯的 8 條語義

1. `normOfficer` **只認 `loyalKing/LoyalKing`，絕不讀 `Force`**（web 那支刻意不看 Force，否則 AI 勢力的武將全會被當成同族）。
2. `successionScore(null)` → `null`；`decideFate(非法武將)` → `FATE.WILD`。
3. `successionList` 的 `seen` **只對通過過濾的武將**記錄（因此 `dead`/`sitting`/`盜賊` 不佔名額）；排序 `(b.score-a.score) || a.name.localeCompare(b.name)`。
4. `extinguish` 的 `already-dead` 分支不是空物件，仍是 `{ok:true, force, month, fates:[], surrender:[], wild:[], reason:'already-dead'}`。
5. `kingDeath`：`dead !== sitting` → `reason:'not-monarch'` 且 `dead:false`（不是報錯）；`remaining === 0` 直接滅亡、不選繼承人。
6. `officerStatus` 的忠誠優先序 `save.loyal[name]` → 武將自帶 `loyal` → `num(base.LOYAL ?? base.loyal) || 90`；士氣缺省 **80**、疲勞缺省 **0**、`statusText` 缺省 `'在職'`。
7. `driftSummary` **不含** `spiritSkipped/loyalSkipped`（雖然 `recordDrift` 有寫）——這是 web 的既有行為，照搬。
8. `forceRoster` 只對 `str(c?.NAME)` 呼叫 `ensure`（`abdicateCandidates` 才多一條 `|| str(c)` 回退）。

---

## 3. 等價對拍（`work\cocos_monarch84\parity.mjs`）

### 3.1 方法

`node` 裡同時載入三份：

```js
const CC    = ts.transpileModule(MonarchModel.ts) → work/cocos_monarch84/_unit_monarch.mjs;
const WEB   = game/web/monarch_model.js;   // 真源
const SAVES = game/web/saves.js;           // 色板 + 開局播種的真源
```

同一份驅動跑兩邊：**每個事件都比較「函數返回值」+「事件跑完之後的整份存檔」**。存檔夾具照 `saves.newCampaign` 的真實形狀造（`cities` 帶 `owner/garrison`、`owned` = 劇本前三城、`forces:{}`、`fate:{}`、`drift:null`、`loyal/tire/morale:{}`），`seedKing` = 「`owned` 裡第一座 `KING` 為非空字串的城」——與 `saves.js:1030-1046` 同規則。

`deepCompare` 比 **key 集合**（包含值為 `undefined` 的 key）並累加葉子數，任何 `!==`（NaN 容忍）都記 `{path, web, cocos}`。

20 個事件（`MODES`）：
`setMonarch / setMonarch-empty / abdicate-ok / abdicate-bad / inherit-ai / inherit-player / kingDeath-inherit / kingDeath-extinct / kingDeath-notMonarch / kingDeath-alreadyDead / extinguish / extinguish-dead / forceRoster / forceDetail / abdicateCandidates / successionList / decideFate / recordDrift / driftText / seedMonarch`。

事件分佈：君主欄位 600、讓位 900、繼承 1800、滅亡 600、漂移 600、勢力聚合 1500、開局播種 300。

### 3.2 規模與結果

```
Cocos 君主與勢力 ↔ web monarch_model.js 對拍
  真源   F:\sanguo\game\web\monarch_model.js（617 行）
  移植   F:\sanguo\game\cocos\assets\scripts\MonarchModel.ts（1072 行）

  劇本   城   事件   葉子欄位   不一致   種子君主
  S1     60   1200     487328        0   公孫瓚
  S2     60   1200     517951        0   公孫瓚
  S3     60   1200     559646        0   袁紹
  S4     60   1200     661587        0   曹操
  S5     60   1200     707136        0   曹操

  主對拍     ：5 劇本 × 60 城 × 20 事件 = 6000 次
  葉子欄位   ：2965306
  不一致     ：0
  同名導出   ：34/34
  純函數掃描 ：9251 次呼叫
  勢力色板   ：558 次比對（276 個勢力名）
  陰性對照   ：5/5 組都抓到差異
  耗時       ：1230 ms
```

| 統計項 | 要求（`m00001`） | 實測 |
|---|---|---|
| 劇本數 | 5 | **5** ✅ |
| 城數 | 60 | **60/劇本** ✅ |
| 事件 | 20 次繼承/滅亡/讓位/漂移 | **20 種 × 5 × 60 = 6000 次** ✅ |
| 不一致 | 0 | **0** ✅（0.000000%） |
| 逐欄位 | 要逐欄位比 | **2,965,306 個葉子**，含返回值與整份存檔 ✅ |

逐劇本葉子數不同是因為 `garrison.json` 的武將密度不同（S4/S5 武將更多 → `forceDetail`/`abdicateCandidates` 的葉子更多）。

### 3.3 陰性對照（證明對拍不是恆真斷言）

`parity.mjs` 內建 5 組「已知必須有差異」的比對，全部要被抓到，否則記一條 `harness` 不一致 → exit 1：

1. 返回值少一格 `heir`；2. 多一格；3. 勢力名單少一家；4. 存檔君主名不同；5. 勢力明細忠誠差 1。

**現況 5/5 都抓到。**

> 踩過的坑：`forceDetail` 的 `officers` 來自 `opts.officersByCity`，預設 `{}` → 空名單。第一版陰性對照只傳 `{cities}`，把 `officers[0]` 改壞其實改在空陣列上 → 4/5。改成傳 `{cities, officersByCity}` 後 5/5。

### 3.4 復跑

```powershell
cd F:\sanguo
node work\cocos_monarch84\parity.mjs            # 完整對拍，0 不一致 → exit 0
node work\cocos_monarch84\parity.mjs --quiet    # 只印匯總
node work\cocos_monarch84\parity.mjs --json     # 附明細
node work\cocos_monarch84\layout_guard.mjs      # 版式純函數區契約
node work\cocos_monarch84\hud_layout.mjs        # 頁頭幾何
node work\cocos_monarch84\ai_smoke.mjs          # runMapAi 冒煙
```

---

## 4. UI 結構（`MonarchPanel.ts`）

### 4.1 君主屬性卡（`R_CARD = {26, 88, 698, 1160}`）

節點層（`build()`，`:219`）：`MonarchPanelBg`（Graphics，第一個建 ⇒ 永遠在 Label 之下）→ 卡片 Label → 抽屜 `MonarchPanelSheet`（最後建 ⇒ 蓋住卡片下半部）。

- 標題 `R_TITLE`：`君主 · <名>`（金）
- 右上 `R_SINCE`：即位月（`monthTag(monarchSince)`）
- 帶條 `R_BAND`：「帶兵上限 N（等級 L）· 旗號 F」
- **12 格屬性**（2 列 × 6 行，`STAT_ROW_H=78` / `STAT_COL_W=330`）：

  `武　力` `智　力` `等　級` `忠　誠` `士　氣` `疲　勞`
  `名下城數` `在職武將` `投降殘將` `旗　號` `勢　力` `即位月`

  值取自 `M.officerStatus(save, {name}, rowOf(name))`（存檔 `loyal/morale/tire` 優先）與 `M.forceRoster()`；疲勞 ≥60 標紅。
- `R_NOTE`：`M.driftText(save)`（上月漂移）+ `M.fateText()`（殘將）+ 勢力存續/已亡
- 三顆按鈕（`R_BTN_FORCES` / `R_BTN_ABD` / `R_BTN_CLOSE`）：「勢力一覽」「讓　位」「關　閉」
- `R_HINT`：「點卡片外或按關閉返回」

### 4.2 三個抽屜（`sheetKind: 'none' | 'forces' | 'detail' | 'abdicate'`）

底板 `R_SHEET = {18, 672, 714, 584}`，`SHEET_ROWS=7`（1 標題 + 5 行 + 1 導航 + 1 取消，`PAGE_ROWS = SHEET_ROWS - 2`）：

| 抽屜 | 內容 | 行為 |
|---|---|---|
| `forces` | `forceRoster()` 全部勢力：色塊 26×26 + 「名 · 城 N · 將 M · 存/亡」 | 點一行 → `detail` |
| `detail` | `forceDetail(save, force)` 的武將明細：名 · 武/智 · 忠 · 職 · 勢力 | 一頁 5 行，底部「下一頁 / 上一頁」 |
| `abdicate` | `abdicateCandidates(save, {cities, officersByCity})` 前 5 名：名（同族標「族」）· 忠 · 武智 · 所在城 | 點一行 → `M.abdicate(save, heir, {month})` → `opts.onCommit('讓位：A → B')` |

`onTouch`（`:716`）優先級：抽屜開著時**吞掉全部點擊**（只認抽屜行）→ 三顆按鈕 → 卡片外 → `close()`。

### 4.3 頁頭版式（`CampaignRoot.ts`，重排過一次）

舊版：標題居中 `(375, 40)`、月份在標題列右側 `(650, 40)`、兩顆按鈕在第二列 `y=64`，而第二列還要放「君主 + 勢力/城/戰績」。統計串一變長（`君主 公孫瓚　·　勢力 公孫瓚　·　城 60　·　戰績 0 勝 0 敗`）就會壓到按鈕底下。

新版（三列，`CampaignRoot.ts:445-448`）：

| 元素 | 矩形（設計座標，字身） | 說明 |
|---|---|---|
| 標題「大 地 圖」 | x 25–355, y 24–56 | 改**左對齊**，讓出右邊給按鈕 |
| `FORCES_BUTTON` | x 384–544, y 14–66 | 提上標題列 |
| `ITEMS_BUTTON` | x 560–736, y 14–66 | 提上標題列（原 y=64） |
| `labelMonarch` | x 24–214, y 78.5–97.5 | 金色、可點 |
| `labelStats` | x 224–600, y 80–96 | 16px |
| `labelMonth` | x 610–740, y 79.5–96.5 | 從標題列移到第二列右側 |
| `MONARCH_HIT` | x 18–218, y 78–112 | 點君主名開屬性卡 |

`hud_layout.mjs` 直接從原始碼抽 `makeLabel` 參數與三個矩形常數重算，斷言 **0 出界 / 0 相交 / 按鈕間距 16 / 右邊界 14 / 標題與按鈕 29px / 命中區包住君主名**，現況全綠。

> 註：`makeLabel(text, cx, cy, width, …)` 的 `cx` 對 `left/right` 是**框的邊**，不是中心（`CampaignRoot.ts:730` 的 `centerX` 換算）。第一版重排就是按「中心」寫的，`labelStats` 實際落在 x 412–788（出界、壓按鈕）——是 `hud_layout.mjs` 抓出來的，不是靠肉眼。

### 4.4 城點分色（`drawMap`，`CampaignRoot.ts:1334-1360`）

```
owner = 我方城 ? M.forceIdOf(save) : (typeof city.KING === 'string' ? city.KING : '')
color = M.forceColorOf(owner)        // 14 家固定色 → 14 備色（FNV-1a）→ 中性灰 #8A8478
```

- 外圈暈：`rgba(color, isPlayer ? 120 : 78)`，半徑 `radius + 5`
- 無城點圖元時：實心 `rgba(color)` + `rgba('#080C10', 220)` 2px 描邊（有圖元時保留原 sprite，只靠暈圈與標籤分色）
- 玩家城：`rgba('#EFC978', 235)` 2px **金環**
- 選中城：金環再放大（`art ? 22 : radius + 9`）
- 城名標籤：玩家 → 金；其他 → 勢力色提亮 42%（`lighten(hex, 0.42)`，暗色 14px 直接畫會糊）；無主 → `textDim`

**數字 `KING` 不算勢力**：`scenarios.json` 的 12 座關隘 `KING` 是 `1..12`（數字），web `saves.js:1024` 的口徑是 `typeof c.KING === 'string' ? c.KING : ''`，這裡照抄 → 關隘顯示成無主灰。

---

## 5. `CampaignRoot.ts` 接線（file:line）

| # | 位置 | 內容 |
|---:|---|---|
| 1 | `:46-48` | `import { PLAYER_FORCE, runMonth as runAiMonth } from './AiRunner'` + 2 個 type + `import type { AiSave }` |
| 2 | `:42-44` | `import * as M from './MonarchModel'`、`{ MonarchPanel }`、`{ MONARCH_EXTRAS_KEY }` |
| 3 | `:90` `:92` `:99` | 常量 `FORCES_BUTTON {384,14,160,52}`、`MONARCH_HIT {18,78,200,34}`、`MONARCH_SAVE_KEYS`（10 個鍵） |
| 4 | `:140` | `function lighten(hex, k)`（在版式純函數區之外，探針不受影響） |
| 5 | `:391-413` | 類字段：`labelMonarch / labelForces / monarchPanel / monarchState / officerMap` |
| 6 | `:445-448` | `onLoad()` 頁頭四行（§4.3） |
| 7 | `:453` | `labelForces`「勢 力」按鈕文字 |
| 8 | `:488` | `start()`：`initCampaign` 之後 `this.syncMonarchState()` |
| 9 | `:927` `:929` | `doAction('advance')`：`const ai = this.runMapAi();` → `const spawned = ai ? null : this.spawnRaid();` |
| 10 | `:936-940` | 提示條追加 AI 月報第一行 + 「AI 出兵 N 路，來犯：…」 |
| 11 | `:1085-1150` | `runMapAi()` 新方法（§7） |
| 12 | `:1184` `:1199` | `refresh()`：`syncMonarchState()` + 面板開著時 `panel.refresh()` |
| 13 | `:1200-1210` | `labelMonarch = 君主 X`（金/灰）、`labelStats = ·　勢力 Y　·　城 N　·　戰績 W 勝 L 敗` |
| 14 | `:1297-1300` | `drawFrame()`：勢力按鈕底板 + 君主名下方 1px 金線提示 |
| 15 | `:1334-1360` | `drawMap()` 城點分色（§4.4） |
| 16 | `:1465-1475` | `placeCityLabels()` 城名分色 |
| 17 | `:1519` | `onTouch()`：面板開著先吞 |
| 18 | `:1541-1557` | `onTouch()`：勢力按鈕 → `openForcesPanel()`；君主名 → `openMonarchCard()` |
| 19 | `:1620-1735` | 新增 10 個私有方法：`syncMonarchState / readMonarchExtras / writeMonarchExtras / commitMonarch / ownerOf / playerForce / officersByCity / ensureMonarchPanel / openMonarchCard / openForcesPanel` |

`ownerOf(name)`：我方城 → `M.forceIdOf(save)`；否則 `cityByName(name)?.KING` **是字串才** `trim()` 回傳，數字/空 → `''`。
`officersByCity()`：逐城 `garrisonOf(this.data, 0, city.NAME)` 取 `officers`，惰性快取在 `officerMap`（`MonarchPanel` 的抽屜每次開只算一次）。

---

## 6. AI 接線（lead 追加，`m00357`）

### 6.1 三處補丁（按 `project\102_Cocos_AI移植.md` §5.3，錨點文本為準）

1. **import**（`:46-49`）：`PLAYER_FORCE, runMonth as runAiMonth` from `./AiRunner`、`AiMonthOutcome/AiRunnerGarrison`、`AiSave`。
2. **`advanceMonth` 分支**（`:927-929`）：`GameState.advanceMonth` → `GameState.marchArmies(3)` → **`const ai = this.runMapAi();`** → `const spawned = ai ? null : this.spawnRaid();` → `this.save = GameState.loadSave()`。
   - 合併順序（與君主接線的關係）：**先月推進/行軍，再 AI 出兵，最後才刷 UI**；君主 `syncMonarchState()` 在 `refresh()` 裡跑，所以 AI 改完的 `owned/save` 會先被吸收再顯示。君主側沒有自己的 `advanceMonth` 分支，無衝突。
   - 放在 `marchArmies(3)` **之後**：本月新出的 B 方部隊 `progress = 0`，不會當月抵達（與原本 `spawnRaid` 同一個理由）。
3. **`runMapAi()`**（`:1085`）：`garrisonOf(data,0,name)` 供情報 → `runAiMonth(save, cities, generals, {playerId: PLAYER_FORCE, paths, seed:(month+1)*7919, garrisonOf, capOf})` → 把 `incoming` 用 `pathBetween` + `GameState.addArmy` 轉成 B 方在途部隊 → `if (out.changed) GameState.persistSave()`。

要點：
- `playerId: PLAYER_FORCE`（`'玩家'`）是**故意**的：Cocos 玩家沒有勢力 id，`initCampaign` 直接把劇本前 3 城給玩家，這 3 城在 `garrison.json` 裡可能屬於 3 個不同勢力；傳固定 `'玩家'` 後 AiRunner 會把這 3 城的 `owner` 改寫成 `'玩家'`，AI 才會把它們當「別人的城」來打。
- `capOf` 用 `GameState.garrisonOf(cityRow)`（`min(floor(pop/2500)+110, 600)`），與宿主守軍公式同源。
- `spawnRaid()` **保留但被短路**（`ai ? null : …`），回滾只需刪那兩行。
- **唯一一處型別斷言**：`save as unknown as AiSave`。原因：`GameState.CityRuntime.officers` 宣告成 `string[]`，`AiCity.officers` 是 `AiOfficer[]`。執行期沒差（AI 的 `buildMeta/ensureMeta` 只補缺、不假設型別），但這是 §8 B2 的伏筆。

### 6.2 node 級冒煙（`work\cocos_monarch84\ai_smoke.mjs`）

不是「重寫一遍再跑」：腳本按大括號配對把 `private runMapAi()` 的**方法體整段切出來**（實測 52 行，`:1085` 起），只做 `this.` → `host.` 的文本替換 + 補 import 頭，再 `ts.transpileModule` 去型別後真的呼叫。依賴全用真貨：`AiModel.ts`/`AiRunner.ts`、`core/garrison.ts`、`core/march.ts`；只樁掉 `GameState` 的 4 個函數（`nextArmyId/addArmy/persistSave/garrisonOf`，語義照 `GameState.ts:290/501/507/245` 抄，因為它 `import 'cc'`）。

實跑輸出（`node work\cocos_monarch84\ai_smoke.mjs` → exit 0）：

```
== A. 2 城最小局面（襄平=玩家空城 / 北平=公孫瓚）==
  ✓ runMapAi 返回对象
  ✓ log[0] 是月報抬头 — AI 月 報：1 個勢力行動（公孫瓚·攻擊player）
  ✓ 来犯队列全部转成 B 方部队 — 1/1
  ✓ 部队字段合法（side/progress/troops/pathIndex）
  ✓ seed = (month+1)*7919 — 15838
    · m1-B1 北平 → 襄平（100 兵，來犯之將，path#0）
== B. 真剧本 1（60 城）连跑 3 个月 ==
  第 1 月：行動 12、易主 36、就地結算 12、來犯 0
    AI 月 報：12 個勢力行動（張角·攻擊ai、韓馥·攻擊ai、…、嚴白虎·佔領空城）
      韓馥 攻 擊 ai：鄴 → 官渡（出兵 40） → 得 手（守 120 兵）
  第 2 月：行動 11、易主 5、就地結算 11、來犯 0
      韓馥 的君主陣亡於 官渡，勢力滅亡
  第 3 月：行動 10、易主 8、就地結算 10、來犯 0
  ✓ 至少一个月 AI 改动了世界（changed=true） — 3/3
== C. 确定性（同存档同 seed 跑两遍）==  ✓
== D. 宿主接线点 ==  ✓ import / 调用顺序 / 提示条两行
```

- 合計：AI 行動 **34**、就地結算 **33**、來犯 **1**、轉成部隊 **1**；6 個斷言組全過。
- 第 1 月「易主 36」大部分是 **owner 初始化**（`applyWorld`/`syncOwned` 把 60 城按 `garrison.json` 回寫，玩家 3 城改寫成 `'玩家'`）+ 佔領空城，不是 36 場戰鬥；第 2、3 月的 5/8 才是真易主。
- 已知限制：`incoming` 在 60 城局面很少（AI 優先打 AI 與空城），所以 A 案的 2 城局面才是「來犯 → 守城戰」的主證據。

### 6.3 AI 接線的已知限制

1. **`tire` 恆 0**：Cocos 沒有任何「加疲勞」的來源（web 是戰鬥後加），屬未接線不是移植遺漏（`102_Cocos_AI移植.md` §4 已記）。
2. **`officers` 被存檔吃掉**：`GameState.normalize` 用 `stringArray()`（只留 `typeof item === 'string'`）清洗 `cities[*].officers`，而 AI 回寫的是物件 → 每次 `loadSave()` 後退回 `garrison.json` 的靜態名單。見 §8 B2 的建議 diff。
3. AI 就地結算的戰報只進 `hintText`（第一行 = 月報），沒有逐條 UI；`onBattle/onForceGone` 兩個鉤子沒接。

---

## 7. 存檔補丁（`GameState.ts` 我沒改）

任務書禁止改 `GameState.ts`；它的 `normalize()` 是白名單重建（未知鍵丟棄），所以君主欄位另存補丁鍵 —— 這是 `CityPanel` 已經用過的分層先例（`sanguo_city_v1`）。

### 7.1 A：已落地的補丁鍵 `sanguo_monarch_v1`（`MonarchPanel.ts:56`）

- 存放鍵（`CampaignRoot.ts:99` `MONARCH_SAVE_KEYS`）：`king / monarch / force / monarchSince / forces / fate / drift / loyal / morale / tire`。
- 讀：`readMonarchExtras()`（`:1637`）`sys.localStorage.getItem` + `JSON.parse` + 非陣列物件才收，`try/catch` 回 `{}`。
- 寫：`writeMonarchExtras()`（`:1650`）只寫上述 10 鍵；`commitMonarch(note)`（`:1664`）在讓位成功後落盤 → 提示 → `refresh()`。
- 合併：`syncMonarchState()`（`:1620`）每次 `refresh()` 把主檔的 `month/owned/cities/gold/wins/losses` 覆蓋進補丁物件，`if (!M.monarchOf(view)) M.seedMonarch(view, this.cities)`（老檔/新檔都能種出君主）。
- **老檔兼容**：沒有補丁鍵 → `seedMonarch` 從 `owned` 第一座有 `KING` 的城播種（S1–S5 分別是 公孫瓚 / 公孫瓚 / 袁紹 / 曹操 / 曹操），不需要遷移。

> 想併進主檔的話（可選，非本任務）：`CampaignSave` 加 `monarch/force/monarchSince/king/forces/fate/drift/loyal/morale/tire` 十個欄位 + `normalize()` 對應清洗，再把 `sanguo_monarch_v1` 當 fallback 讀一次即可。本任務不做，避免動到禁止檔案。

### 7.2 B：建議 diff —— `officers` 要存物件（給 lead 決定）

現況（`GameState.ts:27` 與 `:205`）：

```ts
officers?: string[];                                     // :27
if (Array.isArray(c.officers)) city.officers = stringArray(c.officers);   // :205
// stringArray(): value.filter((item): item is string => typeof item === 'string')
```

→ AI 回寫的 `AiOfficer[]` 在 `loadSave()` 時被整批丟掉，城內人事每月退回 `garrison.json`。建議：

```ts
// (1) GameState.ts:19 附近
export interface CityOfficer {
  name: string;
  str: number;
  int: number;
  loyal: number;
  status: string;
}
export interface CityRuntime {
  troops: number; pop: number; money: number;
  owner?: string;
  major?: string;
  officers?: CityOfficer[];        // 由 string[] 改成物件陣列
  DEFENSE?: number;
}

// (2) GameState.ts:205
if (Array.isArray(c.officers)) {
  const list: CityOfficer[] = [];
  for (const item of c.officers) {
    // 兼容舊檔的純名字串：只留名字，數值 0，狀態 '登'
    if (typeof item === 'string' && item) {
      list.push({ name: item, str: 0, int: 0, loyal: 0, status: '登' });
      continue;
    }
    const o = recordOf(item);
    if (!o || typeof o.name !== 'string' || !o.name) continue;
    list.push({
      name: o.name,
      str: Math.trunc(numberOr(o.str, 0)),
      int: Math.trunc(numberOr(o.int, 0)),
      loyal: Math.trunc(numberOr(o.loyal, 0)),
      status: typeof o.status === 'string' ? o.status : '登',
    });
  }
  if (list.length > 0) city.officers = list;
}
```

改完之後 `CampaignRoot.ts` 的 `save as unknown as AiSave` 斷言可以一併刪掉（`runMapAi` 的註釋已寫明）。**我沒動這個檔**，所以現況是靠 AI 的 `ensureMeta` 每月從 `garrison.json` 補回靜態名單 —— 不會崩，但 AI 的「換太守 / 武將被俘 / 武將移動」在跨月後不保留。

---

## 8. `[推测]` 標註

| # | 位置 | 推測內容 | 為什麼是推測 |
|---:|---|---|---|
| 1 | `MonarchPanel.applyCard` | 君主「等級」取 `M.intOr(base.level, 1, 1, 99)` | `generals.json` 沒有 `level` 欄位（只有 `BaseEXP`），`core/garrison.ts` 有 `levelFromExp()` 但沒有 exp 來源可餵。所以多數武將顯示 1 級 —— 原作是怎麼由 EXP 推等級待考 |
| 2 | 同上 | 忠誠/士氣/疲勞在**沒有存檔值**時顯示 90/80/0 | 這三個缺省值來自 `officerStatus` 的 web 口徑；但 UI 上看不出「這是推定值」。是否要在畫面上加「≈」待美術定 |
| 3 | 同上 | 「旗號」顯示 `forces[force].flag`（缺省 0） | 原作旗號（FLAGNUM）的玩法含義未考證，這裡只當編號顯示 |
| 4 | `CampaignRoot.runMapAi` | `seed = (month+1)*7919` 與 web `campaign.html` 的呼叫時機同（都在 `advanceMonth` 之後） | 對拍的是 `AiModel`（0 不一致），`AiRunner` 的種子呼叫時機是另一 agent 的 `[新設計]`；Cocos 這裡照 `102_Cocos_AI移植.md` §5.3 的補丁放 |
| 5 | `MONARCH_HIT` | 命中區 200×34 的尺寸夠拇指點 | 沒有真機，只有設計座標 |
| 6 | 色板 | 第 15 家以後走 FNV-1a 備色（14 個），視覺上可能與固定 14 色接近 | 備色表是 web 原表，沒有做「保證與固定色不撞」的校驗 |
| 7 | `commitMonarch` | 每次讓位寫一次 10 鍵小 blob 不會造成微信 localStorage 卡頓 | 沒有真機/容量實測；`sanguo_city_v1` 也是同樣寫法 |
| 8 | 抽屜分頁 | 一頁 5 行、翻頁導航是**新交互**（web 是整頁滾動） | 原作/web 沒有這個 UI 形態，是為 750×1334 設計的 |

---

## 9. 沒做到 / 未驗證

1. **沒有 Cocos 編輯器或真機預覽**（任務書禁跑 CocosCreator 建置，構建歸 lead）。所有 UI 只經過 `tsc` + 幾何自檢 + node 冒煙；以下都**沒看到實際畫面**：14px 城名在底圖上的可讀性、`Label.Overflow.SHRINK` 下長勢力名的縮放、微信端 `Noto Sans SC` 是否可用、抽屜 5 行的行高是否夠、金環 2px 在真機 DPR 下是否可見。
2. **君主陣亡/繼承沒有玩家互動**：`kingDeath()` / `extinguish()` 只被 AI 的 `captureKingIn` 呼叫；宿主沒有「君主陣亡 → 選繼承人」的彈窗（web 有完整流程）。玩家只能主動「讓位」。
3. **AI 戰報沒有逐條 UI**：`onBattle/onForceGone` 沒接，60 城局面下幾十條戰報只留第一行月報。
4. **`tire` 無來源** → 屬性卡的疲勞恆 0（見 §6.3）。
5. **`officers` 跨月不保留**（§7.2），需要 lead 決定是否改 `GameState.ts`。
6. 勢力明細抽屜沒有排序切換/搜尋；讓位候選超過 5 人只翻頁列前 5×N 名（`abdicateCandidates` 的全量排序，不截斷）。
7. 沒跑 `tools\build_wechat.ps1` / Creator 構建（按任務書）。
8. `MonarchModel.ts` 與 `MonarchPanel.ts` 的 `.meta` 檔沒建（按慣例由 Creator 首次導入時生成，與 `AiModel.ts` 同）。

---

## 10. 驗證（本機輸出）

| 指令 | 結果 |
|---|---|
| `cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit` | **EXIT=0** |
| `node work\cocos_monarch84\parity.mjs --quiet` | **0 不一致**（6000 事件 / 2,965,306 葉子 / 34-34 導出 / 5-5 陰性對照） |
| `node work\cocos_monarch84\layout_guard.mjs` | exit 0，region `:149-365`（215 行），60 城標籤 0 出界 / 0 重疊 |
| `node work\cocos_monarch84\hud_layout.mjs` | exit 0，頁頭 0 出界 / 0 相交 |
| `node work\cocos_monarch84\ai_smoke.mjs` | exit 0，AI 行動 34 / 結算 33 / 來犯 1 / 部隊 1 |
| `node work\cocos_map84\probe.mjs`（別人的地圖探針，回歸用） | **29/29 PASS**，`planBaseMap` 三塊 rect 與圖元四檔尺寸不變 |

改檔清單（本次）：`MonarchModel.ts`（新）、`MonarchPanel.ts`（新）、`CampaignRoot.ts`（改）、`work\cocos_monarch84\{parity,layout_guard,hud_layout,ai_smoke}.mjs`（新）、`work\cocos_monarch84\parity_result.json`（產物）、本報告。**沒有碰** `GameState.ts`、`CityPanel.ts`、`ItemsPanel.ts`、`BattleRoot.ts`、`ArtLayer.ts`、`core\**`、`game\src\**`、`game\web\**`、`game\tests\**`、`tools\**`、`project\37a|31|44`。
