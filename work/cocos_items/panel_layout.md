# Cocos 物品頁 節點樹 / 尺寸 / 錨點 / web 對應

本文件是 `ItemsPanel.ts` 的佈局藍本，數據全部來自實跑：

- 節點樹與文案：`work\cocos_items\panel_tree.txt`（`node work\cocos_items\panel_headless.mjs` 產出，mock `cc` 模組跑編譯後的 `ItemsPanel.js`）
- 交互與狀態：`work\cocos_items\panel_interactions.txt`
- 實測：**節點 139 個**（含面板根）、Label 110、Sprite 26、Graphics 2（`ItemsVeil` / `ItemsFrame`）、條目 83（6 組頭 + 77 行）、分頁 8 頁、命中矩形 39 個

## 1. 畫布與座標

| 項目 | 值 |
| --- | --- |
| 設計分辨率 | 750 × 1334（`fitHeight`，與工程既有場景一致） |
| 面板節點 | `ItemsPanel`，`UITransform` 750×1334，掛在 `CampaignRoot` 節點下（`ItemsPanel.show(parent)`） |
| 節點錨點 | 全部 `0.5 / 0.5`（Label 與 Sprite 都由 `makeLabel()` / `ArtSprite` 統一設） |
| 佈局座標系 | 左上角原點、y 向下（與 `LAYOUT` 常數一致，方便直接對 web 的 px） |
| 轉節點座標 | `placeNode()`：`x = rect.x + rect.w / 2 - 375`、`y = 667 - (rect.y + rect.h / 2)` |
| 觸控反算 | `convertToNodeSpaceAR()` → `x = local.x + 375`、`y = 667 - local.y` |

> 面板根在 `(0,0)`，所以 `ItemsPanel` 本地座標 = 螢幕中心為原點；`LAYOUT` 全部用「左上原點」，兩者只通過 `placeNode()` / `onTouch()` 換算，其它地方不出現 375/667 的魔數。

## 2. 節點樹（`panel_tree.txt` 實測，139 行全量見該檔）

```
ItemsPanel            750x1334 @(0,0)                    ← 面板根
  ItemsBg             1334x1334 @(0,0)  frame=bg/map_bg   ← ArtBg，cover
  ItemsVeil           750x1334 @(0,0)                     ← addVeil 壓暗
  ItemsFrame          750x1334 @(0,0)                     ← 唯一 Graphics，畫所有框
  ItemsTitle          400x44  @(0,637)  "物 品 　裝 備"
  ItemsSub            712x34  @(0,596)  "共 77 件 · 可裝備 55 · 背包 12 件 · 已裝備 0/4"
  ItemsPortrait        72x72  @(-305,513) frame=face/full/385
  ItemsGenName        320x32  @(-99,545) "關羽"
  ItemsGenStat        560x24  @(21,517)  "武力 99 · 智力 85 · 生命 85 · 速度 0"
  ItemsGenCity        560x22  @(21,494)  "所在 代縣 · 忠誠 100"
  ItemsSlotKey ×4     156x20  @"兵器/坐騎/兵書/寶物"
  ItemsSlotVal ×4     156x20  @"空"
  ItemsPickFace ×12    30x30  frame=face/thumb/385 …
  ItemsPickName ×12    67x20  "關羽/張遼/孫堅/曹操/夏侯惇/程普/黃忠/李典/劉備/嚴顏/袁紹/公孫瓚"
  ItemsTab ×7          56x34  "全部/兵器/坐騎/兵書/寶物/兵符/陣法"
  ItemsHead ×6        410x22  組頭（當前頁第一組有字："兵 器 34 件 · 已擁有 3"）
  ItemsRowIcon ×11     44x44  frame=items/WEAPONA1 …
  ItemsRowName ×11    350x21  "直劍/短錐槍/銅殳/眉尖刀/吳鉤/鉤鎌槍/蛇矛/鳳嘴刀/馬叉/青銅劍/大斧"
  ItemsRowDesc ×11    350x16  "武力上昇1點。…"
  ItemsRowMeta ×11    350x16  "Lv 1 · 武力 +1"…
  ItemsPrev          134x32 @(-282,-453) "◀ 上頁"
  ItemsPage          134x32 @(-144,-453) "第 1/8 頁"
  ItemsNext          134x32 @(-6,-453)   "下頁 ▶"
  ItemsBigIcon       100x100 @(221,190)  frame=items/WEAPONA1
  ItemsDetName       264x28 @(221,107)   "直劍"
  ItemsDetType       264x18 @(221,84)    "兵器　—　Lv 1"
  ItemsDetFoot       264x18 @(221,66)    "在背包 · 可裝備 · 兵器槽"
  ItemsSectBonus     264x18 @(221,42)    "加 成"
  ItemsStatName ×10   66x18  @"武力/智力/生命上限/技力上限/速度" + @"生命/技力/士氣/忠誠/疲勞"
  ItemsStatVal ×10    52x18  @"+1" / "—"
  ItemsDesc          264x42 @(221,-96)   "武力上昇1點。"
  ItemsPreview       264x34 @(221,-138)  "裝上後：武力 99→100"
  ItemsSectField     264x18 @(221,-168)  "原 作 欄 位"
  ItemsFieldKeys     132x192 @(155,-277) 12 行（`\n` 拼一欄）
  ItemsFieldVals     132x192 @(287,-277) 12 行
  ItemsActMain       400x32 @(-157,-511) "裝 備"
  ItemsActSub        400x24 @(-157,-539) "兵器 · 直劍"
  ItemsUnlockMain    146x28 @(128,-513)  "全部解鎖"
  ItemsUnlockSub     146x20 @(128,-541)  "背包 12 件"
  ItemsBack          144x76 @(285,-523)  "返 回"
  ItemsHint          714x40 @(0,-593)    兩行提示
  ItemsToast         450x54 @(0,-50)     "" [hidden]  ← 初始隱藏
```

節點池是**固定**的（不是每次 refresh 建/刪）：6 組頭、11 行 × 4 節點、12 武將 × 2、7 頁籤、4 槽 × 2、10 屬性 × 2。列表頁裝不滿就清字/隱藏，因此節點數不隨頁碼變動（每次都是 139）。

## 3. `LAYOUT` 區域表（設計座標，左上原點）

| 區域 | 矩形 (x, y, w, h) | 內容 | web 對應 |
| --- | --- | --- | --- |
| `screen` | 0, 0, 750, 1334 | 整屏底色 | `body` / `#stage` |
| `header` | 0, 0, 750, 96 | 標題帶 | `header` |
| `title` | 175, 8, 400, 44 | `物 品 　裝 備` | `h1` |
| `sub` | 19, 54, 712, 34 | 共 77 件 · 可裝備 55 · 背包 N · 已裝備 n/4 | `.sub` |
| `gen` | 18, 96, 714, 302 | 武將卡底板 | `.gline` 卡 |
| `portrait` | 34, 108, 72, 92 | 大肖像（`ArtSprite` contain） | `#gimg`（72×92） |
| `genName` | 116, 106, 320, 32 | 武將名 | `.gname` |
| `genStat` | 116, 138, 560, 24 | 武力/智力/生命/速度，裝備後 `b→a` | `.gstat` |
| `genCity` | 116, 162, 560, 22 | 所在 X · 忠誠 N | `.gcity` |
| `slot` | 34, 190, 164, 54, gap 8 | 四槽（兵器/坐騎/兵書/寶物），4×164+3×8 = 680 | `.slots` grid 4 列 |
| `pick` | 34, 254, 107, 54, gap 8, perRow 6, rowGap 6 | 12 武將格（6 列 × 2 行：6×107+5×8 = 682） | `#genpick` 每項高 54 |
| `tabs` | 24, 414, 56, 34, gap 4 | 7 個分類頁籤 | `.tabs` |
| `list` | 18, 406, 430, 736 | 列表框 | `#list` |
| `listBody` | 26, 456, 414, 644 | 條目區（高 644 = 11 行 × 56 + 餘量） | `#list` 內滾動區 |
| `row` | 26, —, 414, 56 | 一行（圖示 44 + 名 21 + 描述 16 + meta 16） | `.item` |
| `nav` | 26, 1104, 414, 32 | 上頁 / 第 n/m 頁 / 下頁（三列，每列 134） | 無（web 是滾動） |
| `det` | 460, 406, 272, 736 | 詳情底板 | `#detail` |
| `bigFrame` | 533, 414, 126, 126 | 大圖外框 | `.dthumb` 126 框 |
| `bigImage` | 546, 427, 100, 100 | 大圖 | `.dthumb img` 100 |
| `detName` | 464, 546, 264, 28 | 物名 | `.dname` |
| `detType` | 464, 574, 264, 18 | `TYPE_NAMES` + `—` + `Lv n` | `.dtype` |
| `detFoot` | 464, 592, 264, 18 | 在背包/未擁有 · 裝備中/可裝備·{槽}槽/不可裝備 | `.dfoot` |
| `sectBonus` | 464, 616, 264, 18 | 「加 成」小節線 | `.sect` |
| `statCol[0]` | 468, 638, 126 | 屬性表左欄（5 行，行距 20） | `.stats` 兩列 |
| `statCol[1]` | 594, 638, 126 | 屬性表右欄 | 同上 |
| `desc` | 464, 742, 264, 42 | 原作 Description | `.ddesc` |
| `preview` | 464, 788, 264, 34 | 預覽（裝上後 / 使用品 / 已裝備 / 沒這件） | `.dpreview` |
| `sectField` | 464, 826, 264, 18 | 「原 作 欄 位」小節線 | `.sect` 2 |
| `fieldKeys` | 464, 848, 132, 192 | 12 行欄位名（`\n` 拼） | 原作欄位表 |
| `fieldVals` | 596, 848, 132, 192 | 12 行欄位值 | 同上 |
| `actBtn` | 18, 1152, 400, 76 | 裝備 / 卸下 / 不可裝備 + 副文 | `#actBtn`（80 高） |
| `unlockBtn` | 430, 1152, 146, 76 | 全部解鎖 + 背包 N 件 | `#unlockBtn` |
| `backBtn` | 588, 1152, 144, 76 | 返 回 | 回大地圖連結 |
| `hint` | 18, 1240, 714, 40 | 兩行規則提示 | `.hint` |
| `toast` | 150, 690, 450, 54 | 浮層提示（初始隱藏） | `.toast` |

子矩形由方法算，不寫死：`slotRect/slotKeyRect/slotValRect`（槽內上 20 標題、下 20 物名）、`pickRect/pickFaceRect/pickNameRect`（頭像 30×40 取 30×30 contain + 名 67 寬）、`tabRect`、`navRect`、`statNameRect/statValRect`（左 66 / 右 52）、`headLine(y)`、`rowParts(y)`（row/icon/name/desc/meta）。

## 4. 命中矩形（39 個，順序 = 渲染順序，`onTouch` 線性掃描）

| 序 | 數量 | 矩形 | 動作 |
| --- | --- | --- | --- |
| 1 | 4 | `slotRect(0..3)` | 選中該槽已裝備物品（`hitSlot`），空槽 → toast「{槽}槽是空的」 |
| 2 | 12 | `pickRect(0..11)` | `selectGeneral(i)` |
| 3 | 7 | `tabRect(0..6)` | `setFilter(tab)` → 回第 1 頁 |
| 4 | 當前頁行數（≤11） | `rowParts(y).row`，高 56 | `selectSeq(seq)` |
| 5 | 2 | `navRect(0)` / `navRect(2)` | `setPage(page ∓ 1)`（首/末頁時 hit 仍註冊，但 page 會被夾住） |
| 6 | 3 | `actBtn` / `unlockBtn` / `backBtn` | `toggleEquip()` / `unlockAll()` / `close()` |

`addHit(rect, act)` 在每次 `refresh()` 開頭清空重填，所以 rect 永遠跟當前頁一致；`tap(x, y)`（設計座標）與 `onTouch` 共用同一份掃描邏輯，headless 測試靠它。

## 5. 分頁（web 是滾動，Cocos 用手寫分頁）

- 條目序列 `entries()`：按 `GROUP_ORDER` 分組，每組先一條組頭（高 26：`{label} {n} 件 · 已擁有 {m}`，`label` 取自 `GROUP_LABELS` 帶空格），再逐行（高 56）。
- `paginate(entries, listBody)`：貪心裝填，游標從 `listBody.y = 456` 起累加高度，超出 `644` 就換頁；單條超高（不可能，行最多 56）自成頁。77 件 + 6 組頭 → **8 頁**（實測 `第 1/8 頁`）。
- `placePage()` 回傳 `{entry, y}[]`，`renderList()` / `drawFrame()` 都遍歷它定位 —— 組頭 26 與行 56 混排時 y 只能這樣算，靜態 `index * ROW_H` 會錯位（第一版踩過，已改）。

## 6. 圖片鏈（全部走 `ArtLayer.loadFrame` 四參 `bundle.load`，`res` bundle）

| 節點 | 路徑 | 說明 |
| --- | --- | --- |
| `ItemsBg` | `bg/map_bg` | 與大地圖同圖，**包裡已有 → 零新增體積**（lead 把 `map/`、`bg/policy` 等移出工程，面板不依賴它們） |
| `ItemsPortrait` | `face/full/{NNN}` → `face/thumb/{NNN}` → `hero/{名}` → `hero/{encodeURIComponent(名)}` → 隱藏 | `Portrait.loadPortrait()`，見報告第 5 節 |
| `ItemsPickFace` | 同上但 `variant='thumb'`（第一級就是 thumb） | 12 個小頭像 |
| `ItemsRowIcon` | `items/{Sprite basename}`（**不帶副檔名**，bundle 裡是 `.png`） | `JEWEL\WEAPONA1` → `items/WEAPONA1` |
| `ItemsBigIcon` | 同 `ItemsRowIcon` | 詳情大圖 |

`ArtSprite` 會記 `state: pending|ready|failed`；加載失敗就隱藏節點，底下是 `ItemsFrame` 畫的框 + 純色底，不會白屏。圖片只在「路徑變了」時才重新 load（`portraitFor / pickFor[] / rowIconFor[] / bigFor` 記帳），翻頁不會重複請求。

## 7. 與 web 的差異（有意為之）

1. **滾動 → 分頁**：Cocos stub 沒有 `ScrollView`/`Mask`，且手機上滾動手勢會和城市地圖/底欄衝突；改成 8 頁 + 上/下頁按鈕，行高與 web 一致（56）。
2. **圖示 48 → 44**：行高 56，留 6px 上下內距；web 的 48 是 `#list` 有 gap 的排法。
3. **肖像 `contain`**：`ArtSprite` 用 contain（等比縮進 72×92 框），實際掛上後 `72×72`；`hero` 圖是正方形，直接拉伸會變形。
4. **標題 `物 品 　裝 備`**：抄 web `h1` 的兩個詞，中間用全角空格斷開。
5. **toast**：web 用 fixed 的 `#toast`，這裡是面板內 `ItemsToast`（`setTimeout` 1600ms，token 防舊 timer 清掉新字）。
