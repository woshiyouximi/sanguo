# 126 · Cocos 武將資料名冊 + 勢力圖

> 任務書：`m00001`（d3-general-book）· 對應 c5 審計的「武將資料名冊 4h」「勢力圖 3h」兩塊整缺頁
> 產出日：2026-11-25 · 驗收全部通過（4/4）

---

## 0. 一句話結論

Cocos 側補了兩個面板：**武將資料名冊**（401 將、按勢力/按城兩種分組、勢力+首字兩檔篩選、20/頁複用行節點、單將卡帶原作 FACE 立繪）與**勢力圖**（60 城按 14 家色板著色 + 玩家金環、116 條路網、势力列表 15 行含「無主」、接壤判定）。三個新檔、4 條驗收全綠：

| # | 驗收 | 結果 |
|---|---|---|
| 1 | `tsc -p tsconfig.check.json --noEmit` | **EXIT=0** |
| 2 | `work\cocos_book\model_assert.mjs` | **261 條 / 通過 261 / 失敗 0**（任務要求 ≥50） |
| 3 | `work\cocos_book\panel_headless.mjs` | **153 條 / 通過 153 / 失敗 0** |
| 3b | `work\cocos_book\panel_offline.mjs`（我加的：零圖片資源降級） | **24 條 / 通過 24 / 失敗 0** |
| 4 | 本報告 | 就是這份 |

合計 **438 條斷言全綠**，兩套 tsc（全庫 check + 測試台 sim）都 EXIT=0。

---

## 1. 檔案清單（我新建，全部只碰這些）

| 檔案 | 行數 | 角色 |
|---|---|---|
| `game\cocos\assets\scripts\GeneralBook.ts` | 589 | **純邏輯**，零 `cc` 依賴（只 import `CityModel.levelOf` + `MonarchModel` 的純函數） |
| `game\cocos\assets\scripts\GeneralBookPanel.ts` | 1160 | 名冊 UI（`Component`，掛宿主 Canvas，`destroy()` 可回收） |
| `game\cocos\assets\scripts\ForcesPanel.ts` | 1148 | 勢力圖 UI + 它的純函數（投影/路網/鄰接/色點/列表） |
| `work\cocos_book\model_assert.mjs` | 426 | 純邏輯斷言，mock 掉 `cc`（根本沒 import） |
| `work\cocos_book\panel_headless.mjs` | 509 | 兩個面板真跑：真節點樹 / 真 Label / 真命中 / 真 `TOUCH_END` |
| `work\cocos_book\panel_offline.mjs` | 145 | 零資源降級（UiSkin 失敗→Graphics 描邊、頭像缺失→首字色塊） |
| `work\cocos_book\_sim\`（ttsc 產物 + mock `cc`） | — | 測試台；`tsconfig.sim.json` 編到 `_sim/`（CommonJS） |

**只讀未改**：`Portrait.ts`、`UiSkin.ts`、`MonarchModel.ts`、`CityModel.ts`、`ArtLayer.ts`、`view/theme.ts`、`view/layout.ts`、`CampaignRoot.ts`、`GameState.ts`、`AiModel.ts`、`SurrenderPanel.ts`、`SaveSlots.ts`、`project\37a|31|44`、`game\web\**`、`game\src\**`、`game\tests\**`。
**沒新建 `.scene`**；兩個面板都是「掛現有場景節點 + `destroy()`」。

---

## 2. 武將資料名冊

### 2.1 資料流（file:line）

```
scenarios.json[0].cities(60) ─┐
generals.json(401) ───────────┼→ GeneralBook.buildBook(opts)            GeneralBook.ts:390
garrison.json[0].officers ────┤     ├ mergeRow(raw,ctx)                 GeneralBook.ts:313
save.generalLevel/Status ─────┘     ├ levelOf(raw,save)  → 1..99        GeneralBook.ts:268
                                    ├ skillOf(raw,level,table)          GeneralBook.ts:277
                                    └ sortBook(rows) 我方→在職→俘→野→未  GeneralBook.ts:415
                                          ↓
        groupByForce(rows)(16 組)  GeneralBook.ts:431   ← 預設
        groupByCity(rows,owned)(35 組) GeneralBook.ts:472
                                          ↓
        filterBook(rows,{force,initial})  GeneralBook.ts:528
        paginateBook(rows,20)             GeneralBook.ts:543
                                          ↓
        GeneralBookPanel.refresh()        GeneralBookPanel.ts:807
        ├ drawChips      9 枚（含「全部 401」）        :856
        ├ drawInitials   8 枚首字 + ◀▶             :881
        ├ drawList       20 行 × 8 節點（複用池）    :929
        ├ drawNav        ◀ 上頁 / 第 N / 21 頁 / 下頁▶ :974
        └ drawCard       單將卡（模態）              :992
```

`GeneralBookPanel.show(parent, opts)` 在 `GeneralBookPanel.ts:395`；`build()` 冪等（`:416`），卡片節點一次性建在 `buildCard()`（`:528`），`open()`（`:576`）/`close()`（`:612`）/`destroyPanel()`（`:627`）。

### 2.2 列表欄位

表頭 7 欄（`GeneralBookPanel.ts:476`）：`名 · 武 · 智 · 級 · 所 屬 城 · 勢 力 · 狀 態`，行首多一格 26×26 勢力色塊 + 名字首字（`BookRowFace{i}`）。

- **武/智**：`generals.STR/INT`
- **級**：`levelOf()` = `save.generalLevel[名]` → `CityModel.levelOf(rec)` → 20（夾 1..99）——與 web 版 `qs.lv || 20`、`DeployRoot.ts:461-466` 同口徑
- **所屬城**：`garrison.officers` 的城 → 沒城顯 `—`
- **勢力**：`ownerOf(城)`，沒城→`在野`；有城無主→`在野`
- **狀態**：`save.generalStatus[名]` → `garrison.rec.status` → `generals.Status`，映射 `登→在職 / 俘→俘虜 / 野→在野 / 未→未登場`（`GeneralBook.ts:232`）

### 2.3 分組：**預設按勢力**（理由）

web `campaign.html:1760 renderGeneralSheet()` 就是 `byForce` 分組（副標「全勢力 N 家 · 按勢力分組」）。照抄它 = 兩邊驗收可以逐字對照。頁簽「按城」保留給「我要看某城還剩誰」的用法，`groupByCity(rows, save.owned)` 會把 `owned` 的城標 `mine`。

實測組數：按勢力 **16 組**（14 家 + 在野 22 人 + 未登場 259 人）；按城 **35 組**（34 城 + 未登場）。

### 2.4 搜尋框：Cocos 沒有輸入法 → 兩檔篩選（取捨）

| 檔 | 做法 | 取捨 |
|---|---|---|
| 勢力 chips | 9 枚（`全部 N` + 前 8 家），按人數降序；再點一次取消 | 覆蓋 401 人的 **35%**（前 8 家 = 142 人），其餘靠首字；好處是**一屏可視、不用翻頁** |
| 首字 chips | 401 個名字有 **138 種首字**，一屏放不下 → 8 枚/頁 + `◀ ▶`，按人數降序（第一頁 `張28 曹16 劉16 孫13 王13 陳10 夏10 董9`） | 兩檔**可疊加**（`filterBook({force,initial})`），例如「張角麾下姓張的」 |

**沒做**：真的輸入法輸入（Cocos 3.8 只有 `EditBox`，微信小遊戲端調起系統鍵盤會蓋住 750×1334 的整塊列表，且 `EditBox` 是原生層，headless 測不到）。若日後要加，建議 `EditBox` 浮在頁頭 `sub` 位置、只做「名字包含」匹配，`filterBook` 已預留 `initial` 之外的擴充點。

### 2.5 單將卡（`GeneralBookPanel.ts:992 drawCard`）

| 區塊 | 內容 |
|---|---|
| 立繪 220×296 | `loadPortrait(target, name, 'full', loadFrame, cb, true)` —— 五級回落 full→thumb→hero(名)→hero(URI)→`apply(null)`（`Portrait.ts` 只讀）；底下永遠墊 `BookCardFace` 首字色塊（96 號） |
| 名 | 我方金、其餘米白（40 號） |
| meta | `狀態 · 勢力 · 城 · 我方`（22 號，色 = 勢力色） |
| 體/技/兵 | `vitalLine()`：`體 上限 · 技 上限 · 帶兵 troopCap`（`MonarchModel.troopCapOf`） |
| 忠/氣/疲 | `moodLine()`：`save.loyal → officer.loyal → Loyal → 90`、`save.morale → Spirit → 80`、`tire → 0` |
| 武/智/級/義理/帶兵 | 一行 20 號 |
| 必殺技 | `skillLine(skill,'必殺技')`：解鎖 `鬼哭神號`、未解鎖 `哭哭神號 Lv40(未解)`（見 2.6） |
| 軍師技 | 同上，`WISESKILL` 走 `wises.json` |
| 裝備 | `equipLine()`：`兵 眉尖刀 · 馬 黃鬃馬 · 書 —` |
| 君主/TYPE/FACE | 除錯用一行：`君主 X　TYPE 5　FACE 385` |
| 忠氣疲來源 | `（存檔覆蓋：loyal/morale/tire）` |

卡片是**模態**（`GeneralBookPanel.ts:675 tap`）：開著時只有 `cardClose` 生效，其餘任何位置 = 關卡片。這條是修過的 bug —— 原本卡片底下的行會搶先命中，點「關閉」變成「換看另一個人」（headless 抓到）。

### 2.6 技能過濾（`level ≤ 當前等級`）

`SKILL`/`WISESKILL` 在真資料裡是**字串** `"40, 110"`（級別, 技 id），不是 `types.ts` 宣告的 `Array<[number,number]>`：

```ts
parseSkillPairs(raw)  // GeneralBook.ts:198  /^\s*(\d+)\s*,\s*(\d+)\s*$/ → [[40,110]]
skillOf(raw, level, table)  // GeneralBook.ts:277  → {level,id,name,unlocked: level<=當前}
```

**抽樣驗證（model_assert §4，5 個樣本 × 解鎖/未解鎖兩面）**：

| 將 | 必殺 `級別,id → 名` | 軍師 `級別,id → 名` | fixture 等級 |
|---|---|---|---|
| 關羽 | 40,110 → 鬼哭神號 | 39,54 → 十面埋伏 | 40（解鎖）/39（未解） |
| 張飛 | 39,104 | 24,13 | 39 / 38 |
| 呂布 | 39,110 | 1,9 → **快速集氣** | 39 / 38 |
| 諸葛亮 | 40,44 → 天地無用 | 37,67 | 40 / 39 |
| 盜賊 | 8,22 | 8,8 | 8 / 7 |

**新檔體感（重要）**：新檔 `generalLevel` 是 `{}` → 全員 20 級 ⇒

- **必殺技只有 4 人解鎖**（級別 8/20 那幾條）
- **軍師技 103 人解鎖**（級別 1/8 那 103 條）

所以卡片對未解鎖的招**必須顯示級別**，否則玩家會以為「這將沒技能」。`skillLine()` 輸出 `天地無用 Lv40(未解)`。

### 2.7 節點上限

**上限 240，實測 224**（`book_tree.txt` 第一行有機器數的可信數字；headless 每步都斷言 `≤240`）。

```
1 veil + 1 底板(Graphics) + 1 繪圖(Graphics) + 1 標題 + 1 副標 + 1 關閉鈕(+1 字)
+ 2 頁簽底板 + 2 頁簽 + 1 清除底板 + 1 清除
+ 9 chips + 2 首字箭頭 + 8 首字 + 7 表頭 = 45
+ 20 行 × 8 節點 = 160
+ 3 翻頁 + 1 提示 + 1 返回底板 + 1 返回 = 6
+ 卡片 17（frame/plate/G/face/art/name/meta/vital/mood/stat/skill/wise/equip/king/fate/closePlate/close）
≈ 224
```

**與資料量無關**：401 條、21 頁、篩到 2 條 —— 節點數都是 224（池子大小決定）。headless 有 3 條斷言專門守這件事（翻頁不新增節點 / 篩選不新增節點 / 401→2 條也不新增）。

---

## 3. 勢力圖

### 3.1 佈局（`FORCES_LAYOUT`，`ForcesPanel.ts:80`）

```
0..124      頁頭：標題「勢 力 圖」(40) + 副標(22) + 關閉鈕
132..668    地圖 714×536（chinamap 1280×960 contain）+ 116 條路網 + 60 城點 + 12 個城名
672..700    頁腳一行：路網 116 條 · 城 60 · 點一家高亮其城（或「所選 X：N 城 · M 在職 · 接壤 K 城」）
704..732    表頭 7 欄：勢力 / 君主 / 城 / 在職 / 接壤 / 滅亡 / 狀態
736..1120   列表 8 行 × 48 = 384（15 行 → 2 頁）
1124..1164  翻頁 ◀ 上頁 · 第 1/2 頁（共 15 家）· 下頁 ▶
1176..1244  返回大地圖（底 1244，距底 90；任務書要求 ≥86 ✓）
```

### 3.2 純函數（file:line，全部被 model_assert 直接調用）

| 函數 | 行 | 做什麼 |
|---|---|---|
| `cityPointOf(city)` | 151 | 讀 `pos_xy`（1280×960 原圖座標），60/60 齊全 |
| `mapRectOf(view)` | 166 | **逐字複刻** `CampaignRoot.baseMapRect()`：寬鋪滿、高 = 960×k、view 內垂直居中 |
| `projectCity(view,px,py)` | 173 | 原圖座標 → 設計座標；斷言四角與 `CampaignRoot` 公式吻合 |
| `pathPolylines(paths,view)` | 180 | 116 條路網折線 |
| `adjacencyOf(paths)` | 197 | 無向圖，60 節點、每城 ≥1 路、最大度 9 |
| `neighborCities(adj,cities,others)` | 218 | 「與玩家是否接壤」= 我的城有鄰城屬於它 |
| `normOwnerId(raw)` | 236 | **`'1'..'12'` 這種純數字 KING → `''`**（關隘/空城占位，不是勢力） |
| `makeOwnerOf(cities,save,given)` | 243 | 三層退回：呼叫方 → `save.cities[n].owner` → `city.KING` |
| `forceDots(cities,ownerOf,player)` | 284 | 60 點 + 顏色（`M.forceColorOf`）+ 玩家金環（`M.FORCE_GOLD`），半徑 5/4/3 |
| `forceListRows(args)` | 349 | 內部調 `M.forceRoster()`，末尾**合成一行「無主」** → 城數求和恆 = 60 |
| `sumCityCount` / `stateTextOf` / `rosterSubText` | 417 / 424 / 431 | 城數和 / 我方·存續·已滅亡·無主 / 副標「15 家 · 存續 14 · 滅亡 0 · 城 60（有主 21 / 無主 39）」 |
| `labelCityNames(...)` | 445 | 12 個城名（選中時只標那家的城） |
| `officersByCityOf(data,cities)` | 537 | 從 `garrisonOf()` 算各城守將 |

### 3.3 色板：**沒有第二套**

直接 import `MonarchModel` 的 `forceColorOf()` / `FORCE_PALETTE` / `FORCE_GOLD` / `FORCE_EDGE` / `FORCE_COLOR_NEUTRAL`，一行自建色都沒有。斷言：

- `FORCE_PALETTE` 14 家 + `FORCE_RESERVE` 14 備色 = **28 個色值全唯一**
- 14 家 `forceColorOf()` 全不同、全落 index 0..13、`張角 = #C9A82E`
- `FORCE_GOLD='#EFC978'` **不在** 28 色內（金環不會跟任何勢力撞色）
- `forceColorOf('')= FORCE_COLOR_NEUTRAL`，但**色板外的人名（袁紹/曹操/劉備/馬騰）走備色**——這是 `MonarchModel` 的既定行為，我沒改
- `forceColorIndex('')= -1`（非法）

### 3.4 列表行

| 欄 | 內容 | 空值 |
|---|---|---|
| 勢力 | 名稱（我方金、滅亡灰）+ 22×22 `plate_sq` tint 成勢力色 | — |
| 君主 | `forceRoster().monarch` | `—` |
| 城 | `cityCount` | `0` |
| 在職 | `officerCount`（**只數 `status==='登'`**） | `0` |
| 接壤 | 我方 `—`；否則 `接壤 N`（N = 鄰接的玩家城數） | `—` |
| 滅亡 | `monthTag(endedAt)` → `第N年M月`；活著 `—` | `—` |
| 狀態 | 我方 / 存續 / 已滅亡 / 無主 | — |

點一行 → `select(id)`（`:841`）：高亮板（九宮 `plate_sel`）跳到該行 + 地圖上只標這家的城名 + 頁腳改「所選 X：N 城 · M 在職 · 接壤 K 城」。再點同一下取消。

**實測（劇本 0）**：15 行（14 家 + 無主）；我方張角 6 城 42 將（在職 17）；何進 3 城 21 將（在職 17）；董卓 1 城 11 將（在職 10）；無主 39 城。城數和 = 60 ✓。

### 3.5 節點上限

**上限 120，實測 100**（`forces_tree.txt`）：

```
1 veil + 1 底板 + 1 地圖底圖(ArtSprite) + 1 繪圖(路網/城點/行底色) + 1 選中板
+ 1 地圖外框 + 標題1 + 副標1 + 頁腳1 + 關閉2 + 返回2 = 12
+ 表頭 7 + 8 行 × 8（色塊 + 7 字）= 71
+ 翻頁 3 + 城名 12 = 15
≈ 100
```

同樣與資料量無關：60 城 / 116 路網畫在**一個 Graphics** 上；只有 12 個城名是節點。

---

## 4. 版式（沿用 r88 鎖定的幾何）

| 項 | 值 | 出處 |
|---|---|---|
| 畫布 | 750×1334 豎屏 | `layout.ts DESIGN_W/H` |
| 頁頭 | `0..124`（兩頁一致） | 與 `CampaignRoot` 頁頭同高 |
| 標題 | 40 號、`title` 區 450×52 | 任務書 `title 40` |
| 副標 / 表頭 / 提示 | 22 號 | 任務書 `head 22` |
| 正文 / 行 | 18 號 | 任務書 `body 18` |
| 數字（城數/在職） | 20 號 | 任務書 `num 20` |
| 返回鈕底 | 名冊 1180+68=**1248**（距底 86 ✓）；勢力圖 1176+68=**1244**（距底 90 ✓） | 任務書「按鈕距底 86」 |
| 九宮 | `frame_panel`（面板/卡片外框）、`plate_btn`（頁簽/按鈕）、`plate_sq`（行色塊）、`plate_sel`（選中板/立繪墊板） | `UiSkin.ts` |

**兄弟序陷阱（踩過）**：九宮底片必須 **先建、文字後建**，否則底片蓋住文字。名冊的「清除篩選」原本是「字先板後」，headless 的節點樹看不出來（文字仍在），是讀 `book_tree.txt` 的順序時發現的，已修（`GeneralBookPanel.ts:462-464`）。

---

## 5. 硬約束逐條

| 約束 | 怎麼做的 | 證據 |
|---|---|---|
| 不新建 `.scene` | 面板 = `new Node(name)` 掛 `parent`（宿主 Canvas），`layer=UI_2D` | `GeneralBookPanel.ts:395`、`ForcesPanel.ts:597` |
| 用完 `destroy()` | 兩頁都有 `destroyPanel()`：`close()` → `node.destroy()` → 清池 → `built=false` | `GeneralBookPanel.ts:627`、`ForcesPanel.ts:771` |
| 401 條不能一幀建 401 節點 | 20 行 × 8 節點**固定池**，翻頁只改 `Label.string`；勢力圖 8 行池、60 城畫在一個 Graphics | 上限 240/120，實測 224/100；「翻頁不新增節點」×3 條斷言 |
| 無資源降級 | 頭像五級回落 + 首字色塊永遠墊底；`UiSkin` 失敗 → `Graphics` 深底+1px 描邊（`UiSkin.drawFallback` 自帶）；`chinamap` 缺席 → 底板深色塊 | `panel_offline.mjs` 24/24：零圖片資源跑完兩頁，`drawCalls>60`、標題/行/技能文字全非空、`cardPortrait='none'` |
| 中文檔不用 PowerShell 寫 | 全部走 `write` / `edit` 工具（UTF-8 直寫） | 本報告與三個 `.ts` 都是 |

---

## 6. 驗收命令與輸出（原樣）

```powershell
# ① 全庫型別檢查
cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
# → CHECK_EXIT=0

# ② 純邏輯斷言（mock 掉 cc；其實根本沒 import cc）
cd F:\sanguo\work\cocos_book; node model_assert.mjs
# → 斷言 261 條，通過 261，失敗 0 / EXIT=0

# ③ 面板 headless（先編譯測試台）
cd F:\sanguo\work\cocos_book; node ..\..\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json   # EXIT=0
node panel_headless.mjs
# → 面板斷言 153 條，通過 153，失敗 0 / EXIT=0
#   BOOK 節點數 = 224 / FORCES 節點數 = 100
#   產物 book_tree.txt / forces_tree.txt

# ③b 零資源降級
node panel_offline.mjs
# → 降級斷言 24 條，通過 24，失敗 0 / EXIT=0
```

### 6.1 model_assert 的 261 條在驗什麼（8 節）

| 節 | 條數 | 內容 |
|---|---|---|
| ① 401 將全可枚舉 | ~70 | 401 行；29 個欄位逐條驗非 `undefined`/非 `NaN`/非空；名字唯一；`skill`/`wise` 401 條全非 null；技能名不是 `#id`（代表 `magics/wises` 解得出）；等級 1..99；我方 42 / 在職 79 / 在野 63 / 未登場 259 / 俘 0 / 有城 142；`summarize` 各值 |
| ② 按勢力分組求和 = 401 | ~10 | 16 組（14 家 + 在野 + 未登場）；求和 401；張角 42 / 何進 21 / 董卓 11；在野 22；未登場 259 且排最後；`mine` 只有一組 |
| ③ 按城分組與 `save.owned` 一致 | ~8 | 35 組；求和 401；`mine ⟺ owned.includes(城)`；`owned=[]` 時無 `mine` |
| ④ 技能過濾 5 樣本 | ~40 | 見 §2.6；另驗新檔 20 級只 4 人必殺、103 人軍師；`parseSkillPairs(''|null|'abc')→[]`；`skillOf(…,null).name==='#110'`（缺表時給 id 不炸） |
| ⑤ 分頁 20/頁 | ~8 | 401→21 頁、每頁 20、末頁 1；`pageCountOf(401/0/20/21)=21/1/1/2`；size=50 → 9 頁 |
| ⑥ 14 家色板 + 金環唯一 | ~20 | 28 色全唯一；14 家全落 0..13 且互異；`FORCE_GOLD` 不在 28 色；`forceColorIndex('')=-1`；60 點/金環 6/無主 39/半徑 5:4:3/全在地圖框內；`mapRectOf`/`projectCity` 與 `CampaignRoot` 公式四角吻合 |
| ⑦ 城數求和 = 60 | ~60 | 15 行、求和 60、無主 39、有主 21；張角 6 城 17 在職；14 家全 alive；`monthText` 全 `—`；鄰接圖 60 節點 / 每城 ≥1 路 / 最大度 9 / 無向 / 無自環 / 116 折線；`borderCount` 與 `neighborCities` 一致；`normOwnerId('1'|'12')=''`；`makeOwnerOf` 三層退回 |
| ⑧ 文字組裝 | ~45 | 每行 7 欄都有字；裝備行含 `兵…馬…書`（**首字是「兵」不是「武」**）；`Thing` 全空 0 行；首字 138 種求和 401；首字最多「張」28 人；`filterBook` 疊加 |

### 6.2 panel_headless 的 153 條（真 `TOUCH_END`，不是直接叫 `tap()`）

走完的流程：`show()` → 標題/副標非空 → 表頭 7 欄逐字 → 20 行名字/武/智/級/城/勢力/狀態/首字全非空 → chips 9 枚（`全部 401` / `張角 42`）→ 首字 8 枚（第 1 枚 `張`）→ **點下一頁 → 頁碼 `第 2 / 21 頁`、內容換頁、節點數不變** → 上一頁復原 → 末頁 1 行（其餘行節點 `active=false`，不是殘留文字）→ **點 chip 張角 → 42 人 / 3 頁 / 每行勢力都是張角** → 點首字「張」→ 人數更少且每行首字都是張 → 清除 → 回 401 → **點行 → 卡片開**、名字/勢力/狀態/體技兵/忠氣疲/必殺技（帶 `Lv`）/軍師技/裝備/立繪路徑 `face/full/098`/首字層全非空 → **點卡片關閉 → 收起** → 再開 → 點卡片外 → 關 → 切「按城」→ 副標含「按城分組」→ 切回 → **點返回 → `isOpen=false`、`active=false`、`onClose` 叫 1 次** → 再 `show()` 復用同一節點（host 仍 1 子節點）→ 降級（2 條 / 0 條）→ `destroyPanel()` 後 host 0 子節點。勢力圖同套路（60 點/116 路/15 行/求和 60/翻頁 7 行/出現「無主」/點行 → 選中板 `active=true` 且 y 對齊行/關閉/降級/`destroyPanel`）。

---

## 7. 結構樹（機器輸出，完整版在 `work\cocos_book\book_tree.txt` / `forces_tree.txt`）

### 7.1 名冊（224 節點，單將卡關閉態）

```
GeneralBookPanel  750×1334
├ BookVeil / BookPlate / BookG                 蒙版 · 底板 · 繪圖（行底色/分隔線/首字色格）
├ BookTitle "武 將 資 料" / BookSub "401 人 · 在職 79 · 在野 63 · 未登場 259 · 14 家 · 34 城 · 按勢力分組"
├ BookCloseBtn └ BookCloseBtnLabel "關 閉"
├ BookTabForcePlate └ BookTabForce "按 勢 力"    BookTabCityPlate └ BookTabCity "按 城"
├ BookClearPlate └ BookClear "清 除 篩 選"        ← 板在字前（§4 的兄弟序陷阱）
├ BookChip0..8  "全部 401 / 張角 42 / 在野 22 / 何進 21 / 董卓 11 / 喬玄 7 / 孫堅 7 / 劉焉 6 / 陶謙 5"
├ BookInitPrev "◀" · BookInit0..7 "張 曹 劉 孫 王 陳 夏 董" · BookInitNext "▶"
├ BookHead0..6 "名 武 智 級 所 屬 城 勢 力 狀 態"
├ BookRowFace|Name|Str|Int|Lv|City|Force|Status {0..19}   ← 20×8 = 160（固定池）
│   例：BookRowFace0 "管" · BookRowName0 "管亥" · Str 87 · Int 45 · Lv 20 · City 汝南 · Force 張角 · Status 在職
├ BookPrev "◀ 上頁" · BookPage "第 1 / 21 頁　（篩選後 401 人）" · BookNext "下頁 ▶"
├ BookHint "無輸入法：用勢力/首字篩選"
├ BookBackPlate └ BookBack "返 回 大 地 圖"
└ BookCard (active=false)
   ├ BookCardFrame(九宮 frame_panel 690×824) · BookCardG · BookCardPlate(plate_sel 220×296)
   ├ BookCardFace "周"（首字 96 號，降級層）
   ├ BookCardArt @face/full/098（ArtSprite contain）
   ├ BookCardName "周倉" · BookCardMeta "在職 · 張角 · 陳留 · 我方"
   ├ BookCardVital · BookCardMood · BookCardStat · BookCardSkill · BookCardWise · BookCardEquip · BookCardKing · BookCardFate
   └ BookCardClosePlate └ BookCardClose "關 閉"
```

### 7.2 勢力圖（100 節點）

```
ForcesPanel  750×1334
├ ForcesVeil / ForcesPlate（地圖底 #0B0F14 + 列表底 #0E1116）
├ ForcesMapArt @map/chinamap 714×536
├ ForcesG（116 條路網 + 60 城點 + 行底色/分隔線）
├ ForcesSelPlate @ui/plate_sel 714×48（跟著選中行跑，active=false 初始）
├ ForcesMapFrame @ui/frame_panel 714×536
├ ForcesTitle "勢 力 圖" · ForcesSub "15 家 · 存續 14 · 滅亡 0 · 城 60（有主 21 / 無主 39）"
├ ForcesFoot "所選 何進：3 城 · 17 在職 · 接壤 1 城"
├ ForcesCloseBtn └ Label "關 閉" · ForcesBackPlate └ ForcesBack "返 回 大 地 圖"
├ ForcesHead0..6 "勢 力 君 主 城 在職 接壤 滅亡 狀態"
├ ForcesChip|Name|Monarch|Cities|Officers|Border|Month|State {0..7}   ← 8×8 = 64
│   例：張角｜張角｜6｜17｜—｜—｜我方   何進｜何進｜3｜17｜接壤 1｜—｜存續
├ ForcesPrev "◀ 上頁" · ForcesPage "第 1 / 2 頁　（共 15 家）" · ForcesNext "下頁 ▶"
└ ForcesCity0..11 "洛陽 弘農 長安 南皮 平原 陳留 許昌 汝南 宛 北平 代縣 鄴"
```

---

## 8. 給 lead 的入口 hook（`CampaignRoot.ts`，3–5 行）

頁頭第二排 `MONARCH_HIT`（`CampaignRoot.ts:110`，18..218 × 78..112）右邊是空的，剛好塞一顆 176×34 的「名 冊」。三處改動、共 5 行：

```ts
// ① 常數區（CampaignRoot.ts:110 MONARCH_HIT 之後）
const BOOK_HIT = { x: 226, y: 78, w: 176, h: 34 };
// ② onTouch() 的「君主卡」分支之後（CampaignRoot.ts:2394）
if (x >= BOOK_HIT.x && x <= BOOK_HIT.x + BOOK_HIT.w && y >= BOOK_HIT.y && y <= BOOK_HIT.y + BOOK_HIT.h) { this.openGeneralBook(); return; }
// ③ openForcesPanel() 之後（CampaignRoot.ts:2570）
private openGeneralBook(): void { this.syncMonarchState(); GeneralBookPanel.show(this.node, { data: this.data, save: this.save ?? {}, cities: this.cities, officersByCity: this.officersByCity(), ownerOf: (n) => this.ownerOf(n), onClose: () => this.refresh() }); }
// ④ 畫那顆字（頁頭 label 那批，跟 labelForces 同款）：保證點得到也看得見
this.makeLabel('名 冊', BOOK_HIT.x + BOOK_HIT.w / 2, BOOK_HIT.y + 17, BOOK_HIT.w, 20, COLORS.goldLight, 'center');
```

想讓「勢 力」按鈕直接開新勢力圖（取代 `MonarchPanel` 的 forces 抽屜）：

```ts
// CampaignRoot.ts:2566 openForcesPanel 換成：
private openForcesPanel(): void { this.syncMonarchState(); ForcesPanel.show(this.node, { save: this.save ?? {}, data: this.data, cities: this.cities, ownerOf: (n) => this.ownerOf(n), player: this.playerForce(), onClose: () => this.refresh() }); }
```

> `save` 傳 `{}` 也不會炸（兩頁都對空 save 有斷言）；`data` 有 `garrison`/`scenarios` 就夠，`magics/wises` 會自己從 `data` 取。
> 若 campaign 頁要「點城名 → 開該城名冊」，`GeneralBookPanel.show(…, { group: 'city' })` 已是現成入口（`group` 選項）。
>
> **行號聲明**：`CampaignRoot.ts` 有平行 agent 在改（本報告讀到的是 **2916 行**版；`MONARCH_HIT` 在 110、君主命中分支在 2386-2394、`openForcesPanel()` 在 2565-2570、`labelForces` 在 1061）。以符號名（`MONARCH_HIT` / `openForcesPanel`）定位，別硬抄行號。

---

## 9. `[推测]` 與不確定處

1. **`[推测]` `Thing`（書）永遠是空**：401 條 `Thing === ''`，沒有一條有值。可能是這份資料集把「書」拆到別的表（`items.json` 的 type=書），也可能是原作只有武器/馬兩格。卡片照實顯示 `書 —`。
2. **`[推测]` 12 座數字 `KING`（`'1'..'12'`）是關隘/空城占位**：依據是這些城的 `garrison.owner === ''`，且它們的名字（易京/樂陵/界橋/壺關/定陶/都陽/官渡/筑陽/長板/建平/赤壁/合肥）全是戰役地名。所以 `normOwnerId()` 把它們全歸「無主」——若原作其實有「關隘守軍」概念，這裡會被算進無主 39 城。
3. **`[推测]` web 版的 `bootCmd==='general'` / `'forces'`（`campaign.html:3914-3915`）是給「另一個入口」用的**，Cocos 端沒有 URL 參數機制，所以我只給 lead 頁頭按鈕的 hook，沒做 deep-link。
4. **`[推测]` 裝備/技能的中文名來自 `magics.json`/`wises.json` 的 `NAME`**：所有 `SKILL`/`WISESKILL` 的 id 都能解出（`1..110` / `1..67` 全命中），沒出現 `#id` 兜底。
5. **`[推测]` `Loyal`/`Spirit` 的新檔初值**：`save.loyal/morale/tire` 都是 `{}`，所以走「`Loyal` 或 90」「`Spirit` 或 80」「0」。這跟 `MonarchModel.officerStatus()` 的預設一致（不是我自己編的）。
6. **不確定**：`save.generalLevel` 的鍵是名字還是 `SEQUENCE`。我按名字（web `saves.js` 的 `SNAPSHOT_REQUIRED` 與 `generalStatus` 同款按名），若原作其實按 id，`levelOf()` 會全退回 20 —— 這一條值得 lead 找人核對 `+0x04E` 的 dump 格式。

---

## 10. 沒做到 / 留給後續

| 項 | 為什麼 | 建議 |
|---|---|---|
| **輸入法真的打字搜尋** | Cocos `EditBox` 會調系統鍵盤、蓋住列表；headless 也測不到原生層 | 用「勢力 chips + 首字分頁」代替（已做）；真要打字再加 `EditBox` 做 contains 匹配 |
| **401 張列表頭像** | `ArtLayer.loadFrame()` 沒有快取，20 槽位翻頁每頁會重載 20 張 webp；web 版本身也是純文字行 | 若日後要，先給 `ArtLayer` 加 `Map<path, SpriteFrame>` 快取，再把 `BookRowFace` 換成 `ArtSprite` |
| **列表里的「忠誠/士氣/疲勞」欄** | web 的行也是「名 · 城 · 勢力」+ 第二行小字；我放進單將卡（列裡放不下 7 欄 + 3 個數值還不擠） | 若要進列表，把 `ROW_H` 從 40 拉到 52、每頁降到 15 行 |
| **「滅亡月」實測全是 `—`** | 劇本 0 開局，`save.forces` 沒有 `endedAt` | 程式路徑已驗（`monthTag(endedAt)`）；要看效果得打完一家 |
| **勢力圖沒有「點城 → 開城」** | 城點只有 60 個畫在 Graphics 上，命中要另做 60 個 rect（會多 60 個命中項，但不加節點） | 5 行內可加：`forceDots` 已帶 `name`，在 `tap()` 前加一輪最近點判定即可 |
| **`MonarchPanel` 的 forces 抽屜沒拆** | 那是別人的檔（只讀） | 新 `ForcesPanel` 與它並存；lead 決定要不要把 `openForcesPanel()` 指過來（§8 給了 1 行版） |

---

## 11. 一句話給驗收

```powershell
cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit   # 0
cd F:\sanguo\work\cocos_book
node ..\..\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json                              # 0
node model_assert.mjs   # 261/261     node panel_headless.mjs   # 153/153     node panel_offline.mjs  # 24/24
```
