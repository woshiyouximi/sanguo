# 120 Cocos 招降面板 + 存檔位 UI

> 任務書：`m00001`（lead 派）。範圍：把 web 版招降面板照搬到 Cocos 3.8.8，並補存檔位 UI。
> **本輪沒有 build、沒有跑 `tools\build_wechat.ps1`、沒有截圖**（不能建構），面板行為全部以 node + mock `cc` 驗證。
> 沒動 `CampaignRoot.ts` / `CityPanel.ts` / `ItemsPanel.ts` / `game\web\**` / `game\src\**` / `game\tests\**` / `project\37a|31|44`。

## 0. 交付物

| 檔案 | 行數 | 說明 |
| --- | --- | --- |
| `game\cocos\assets\scripts\SurrenderModel.ts` | 593 | 招降純邏輯（不 import `cc` / `GameState` / DOM） |
| `game\cocos\assets\scripts\SurrenderPanel.ts` | 762 | 全屏彈層（`@ccclass('SurrenderPanel')`） |
| `game\cocos\assets\scripts\SaveSlots.ts` | 951 | 存檔位純邏輯 + 面板（`SaveSlotsPanel`），同一個檔 |
| `work\cocos_surrender\model_assert.mjs` | — | 168 條斷言，`ALL PASS` |
| `work\cocos_surrender\panel_headless.mjs` | — | 103 條斷言，`ALL PASS`，產 `panel_tree.txt` / `panel_interactions.txt` |
| `work\cocos_surrender\slot_assert.mjs` | — | 148 條斷言，`ALL PASS` |
| `work\cocos_surrender\tsconfig.sim.json` | — | 把三個新檔編到 `_sim/` 給 node 跑（commonjs） |

`.ts.meta` 已補：`SurrenderModel.ts.meta`（`a3eaaf96-0e50-42fc-8bd5-8048d33537fd`）、`SurrenderPanel.ts.meta`（`f6da9d49-7e8e-411e-bbb0-ce2cf15863ba`）、`SaveSlots.ts.meta`（`7e63e8a8-fac0-4703-a97d-50fa980cca37`），格式照抄 `ItemsModel.ts.meta`。

---

## 1. 任務 A：招降面板

### 1.1 `SurrenderModel.ts` API

規則層 `game\cocos\assets\scripts\core\roster.ts` 本來就有整套招降 API（`:302 SurrenderTier`、`:305 SurrenderDecision`、`:308 SurrenderCard`、`:527 surrenderCandidates`、`:572 needSurrenderPanel`、`:595 applySurrender`）。這一檔只做「包成 Cocos 側好呼叫的形態 + 補 web 有而 Cocos 沒有的純函式」，**不重寫規則**。

| 符號 | 行 | 說明 |
| --- | --- | --- |
| `PANEL_TITLE` | :36 | `'抓 到 敵 將'` |
| `CardAction` / `BulkMode` | :39 / :42 | `'recruit' \| 'kill' \| 'release'` |
| `ACTION_TEXT` | :44 | `招 降` / `斬 首` / `釋 放` |
| `BULK_TEXT` | :51 | `剩餘全部招降` / `剩餘全部斬首` / `剩餘全部釋放` |
| `PICK_TEXT` | :58 | `已 招 降` / `已 斬 首` / `已 放 走` / `已 釋 放`（逐字同 web `campaign.html:3444`） |
| `KING_CHIP` | :66 | `'逃 走'` |
| `CardButton` / `SurrenderView` | :73 / :88 | 一張卡的畫法：名字/武智忠義/檔位/理由/已選/三個按鈕的可用性 |
| `SurrenderCtx` / `SurrenderState` | :133 / :144 | ctx = `{save,data,home,atCity,mine,king}`；state = `{ctx,cards,picks,done}` |
| `SurrenderOutcome` | :159 | `{result,lastPost,logs,text,failed,error}` |
| `saveOf(raw)` | :193 | `object → core/roster` 的寬鬆 `CampaignSave`（`types.ts` 有索引簽名，`GameState.CampaignSave` 沒有，兩者不互相可賦值） |
| `kingOf(save)` | :205 | `save.monarch \|\| save.king`（同 web） |
| `myNamesOf(save)` | :218 | 我方武將名：`save.roster` 全員 + 不在名單裡的 `_moved` |
| `officersAt(data,city,scenIdx=0)` | :252 | 走 `core/garrison.garrisonOf()`，取該城 officer 名 |
| `contextOf(save,data,home,opts)` | :274 | 組 ctx（`atCity`/`mine`/`king` 可覆寫） |
| `stateOf(ctx)` | :292 | `{ctx,cards:views,picks:{},done:false}`；**在這裡把空名卡過濾掉** |
| `openOf(save,data,home,opts)` | :306 | 一步到位：ctx → state（沒有候選回 `null`） |
| `findCard` / `pendingOf` / `leftOf` / `allDecided` | :319 / :327 / :334 / :339 | 面板查詢 |
| `subText(state)` / `footText(state)` | :344 / :349 | 標題下副標、底部「剩 N 位待決…」/「處理完畢」 |
| `bulkEnabled(state)` | :356 | 三個批量鍵的 disabled |
| `viewOf` / `viewsOf` | :368 / :404 | 單卡 / 全部卡的畫法（含 `recruitable` 決定的按鈕可用性） |
| `decideOf(state,name,act)` | :426 | 寫 pick；君主 / 已決 / 拒降檔的 `recruit` 一律回 `false` |
| `bulkOf(mode,state)` | :445 | 批量：君主 → `escape`；`recruit` 模式下 `recruitable!==true` → `escape`（**r86 修正**） |
| `wouldEscape(state,mode)` | :465 | 批量前先算會被改成「放走」的人（給提示用） |
| `finishOf(state)` | :537 | 落庫：`applySurrender()` + 寫 `save.lastPost` + 出五行 log + 完成文案；冪等（`state.done` 時回 `null`） |
| `PostBattleLike` / `queuePostBattle(save,post)` | :589 / :605 | 把戰鬥結算的 `captures/executed` 寫回 `save.captured/executed`（**Cocos 目前缺的一環**，見 §4 補丁 B） |
| `hasPending(save)` | :635 | 存檔裡有沒有待處理的俘虜 |

**純度**：只 import `./core/roster`、`./core/garrison`、`./types`；不碰 `cc`、`sys`、`localStorage`，所以 `node model_assert.mjs` 直接跑真檔。

### 1.2 卡面欄位與來源

| 卡面 | 取值 | 來源（逐行） |
| --- | --- | --- |
| 名字 | `card.name` | `core/roster.ts:527 surrenderCandidates()` 逐名 emit |
| 武 / 智 | `str` / `int` | `core/roster.ts:434 statOf()` → `round(row.STR)` / `round(row.INT)` |
| 忠誠 | `loyal` | 同上，**不是 json 原值**：`clamp(baseLoyal - (10-constancy)*2, 0, 99)`，`baseLoyal = row.Loyal ?? 50` |
| 義理（節操） | `constancy` | 同上，`clamp(row.CONSTANCY ?? 5, 0, 9)` |
| 檔位 / 檔位字 | `tier` / `tierText` | `core/roster.ts:454 cardOf()` + `:362 TIER_TEXT = {must:'可 降', roll:'需 再 戰', refuse:'拒 降'}` |
| 成功率 | `chance` | `core/capture.ts:199 recruitChanceOf()`（`loyal<25→1`、`sameForce→1`、`lordSurrendered→1`、`constancy>=5→t=1…`、三道硬門 `loyal>90/70/50→0`、再按 `t` 算 `1-p*p` / `1-p` / `(1-p)/3`） |
| 可否招降 | `recruitable` | **`= predicted`**，`predicted = from === 'captured'`（`core/roster.ts:454`）→ 從 `executed` 來的卡永遠不可招降，哪怕檔位是 `must` |
| 理由 | `reason` | `cardOf()` 拼：roll 檔是 `本戰擲骰成功/失敗：成功率 X%（忠誠 L / 節操 C）`；must/refuse 是 `canRecruit(WINNER,…).reasons.join('；')` |
| 君主 | `isKing` + `tierText='逃 走'` | `core/roster.ts:496 kingCardOf()`（君主不可俘 `0x40975E`） |
| 頭像 | `Portrait.loadPortrait()` | `face/full → face/thumb → hero/<名> → hero/<urlencoded> → 隱藏` 五級回落（`Portrait.ts:507 portraitChain`），`ArtSprite` 結構上就是 `PortraitTarget` |

### 1.3 tier → 按鈕可用性矩陣

`viewOf()` 的 `buttons` 三格（順序固定 招降/斬首/釋放），與 web `surCardHtml`（`campaign.html:3526`）對齊：

| 卡的來源 | `tier` | 招 降 | 斬 首 | 釋 放 | 備註 |
| --- | --- | --- | --- | --- | --- |
| captured（`recruitable=true`） | `must` | ✅ | ✅ | ✅ | 點了必定入池 |
| captured | `roll` | ✅ | ✅ | ✅ | 擲骰已成功才會有 `captured` 卡 |
| captured | `refuse` | ⛔ 灰 | ✅ | ✅ | 灰鍵不進 `hitList`（點不到），只能斬或放 |
| executed（`recruitable=false`） | `must` / `roll` / `refuse` | ⛔ 灰 | ✅ | ✅ | 已斬的人不能招，`applySurrender` 也會再擋一次 |
| 君主（`isKing`） | — | ⛔ 灰 | ⛔ 灰 | ⛔ 灰 | 三鍵全關，顯示 `逃 走` 徽標，只剩底部三顆批量鍵 |
| 已決（有 `pick`） | — | 三鍵全收起 | | | 改顯示 `PICK_TEXT[pick]` 徽標 |

批量鍵（`bulkOf`）：

- `bulk:recruit` → `c.isKing || !c.recruitable ? 'escape' : 'recruit'`（**不繞過硬門**）
- `bulk:kill` → `c.isKing ? 'escape' : 'kill'`
- `bulk:release` → `c.isKing ? 'escape' : 'release'`

> **r86 缺陷的處置**：web 舊版「剩餘全部招降」對所有人寫 `'recruit'`，規則層硬門把拒降檔改成 `rejected + escaped`，玩家看到的是「招降成功 0 人、4 人被放走」卻沒有任何提示。本版在**批量鍵這層就先改寫成 `escape`**，所以 `bulk:recruit` 之後 `rejected` 是空的（測試 §4 斷言）。測試 §4b 另外硬寫 `picks['華佗']='recruit'` 繞過面板，證明 `applySurrender` 的硬門仍然有效（`rejected=['華佗','死士']`、名單不改）——**兩層都驗了**。

### 1.4 `SurrenderPanel.ts` API

| 符號 | 行 | 說明 |
| --- | --- | --- |
| `PER_PAGE` / `CARD_H` / `CARD_GAP` | :71 / :72 / :73 | 5 / 150 / 8（750×1334 設計座標，一頁 5 張） |
| `LAYOUT` | :89 | `screen` / `sheet`(26,96,698×1084) / `title` / `sub` / `prev` / `pageNo` / `next` / `cards`(40,240,670×782) / `msg` / `bulk`(40,1080,214×58,gap 10) / `finish`(40,1080,670×58) |
| `SURRENDER_NODE_NAME` | :104 | `'SurrenderPanel'` |
| `SurrenderPanelOptions` | :155 | `{save, data, home?, atCity?, mine?, king?, onDone?}` |
| `static showIfNeeded(parent,opts)` | :175 | **沒候選就回 `null`、連節點都不建**（給 lead 的補丁用這個） |
| `static show(parent,opts,state?)` | :187 | 復用同名節點 + `setSiblingIndex(父.children.length-1)` 壓頂 |
| `build()` / `open(state)` / `close()` | :270 / :332 / :350 | 建節點 / 換 state 重畫 / 解監聽 + `onClose` |
| `debug()` | :361 | `{open,page,pages,done,left,sub,msg,outcome,views,hits…}` |
| `tap(x,y)` | :390 | 設計座標命中（headless 用；正式走 `input.on(TOUCH_END)`） |

節點名（面板子節點固定 **57** 個）：`SurVeil` / `SurFrame` / `SurTitle` / `SurSub` / `SurPrev` / `SurPage` / `SurNext` / `SurPortrait{i}` / `SurName{i}` / `SurTier{i}` / `SurStat{i}` / `SurReason{i}` / `SurPick{i}` / `SurBtn{i}_0..2` / `SurMsg` / `SurBulk0..2` / `SurFinish`。

行為照 web：**沒有關閉鍵、點背景不關**（決策沒做完不放大地圖）；逐將決策完最後一張會自動落庫；批量鍵等於「剩下全填 + 立刻落庫」；落庫後三顆批量鍵換成整寬「完 成」，點它才 `close()`。落庫時 `finishOf()` → `GameState.persistSave()` → `onDone(outcome)` → 再 `refresh()`。

### 1.5 與 web 的差異（刻意）

1. **文案用 web 的繁體原文**（`招 降` / `斬 首` / `釋 放` / `逃 走` / `抓 到 敵 將` / `剩 N 位待決…`），因為 web 是視覺基準；Cocos 內政面板用的是另一套字。要改簡體只需改 `SurrenderModel.ts:44-66` 與 `:344/:349`。
2. web 的 `#surSub` 會帶回城名（`招降的進 ${home} 武將池`），Cocos 版 `home` 可能是空字串 → `subText()` 在 `home` 為空時省略那半句。
3. web 有 `?surafter=1` 收尾開城池武將列表；**Cocos 沒做**（要 CityPanel，屬禁改檔）。
4. web 落庫失敗只 `console.warn`；Cocos 版 `finishOf()` 也 try/catch，但會把 `failed/error` 放進 `SurrenderOutcome`，面板顯示「結算失敗」並保留 state（可以再點一次），不會靜默吞掉。

---

## 2. 任務 B：存檔位 UI

### 2.1 儲存佈局

```
sanguo_slots_v1            = { active: 1..10, slots: { "1": {at, meta}, … "10": … } }
sanguo_slot_payload_v1_N   = { "sanguo_campaign_v1": "<原始字串>", "sanguo_city_v1": …, … }
```

**payload 不塞進索引**（索引保持小、寫一格只動兩個鍵）。`CAMPAIGN_KEYS`（`SaveSlots.ts:60`）七把：

`sanguo_campaign_v1`、`sanguo_city_v1`、`sanguo_items_v1`、`sanguo_monarch_v1`、`sanguo_battlelog_v1`、`sanguo_monarch_seat_v1`、`sanguo_monarch_extinct_v1`

> 後三把（戰報 / 王座 / 滅亡名單）是 `CampaignRoot.ts:429-433` 自己的鍵。**不換這三把，讀檔後會看到上一局的戰報**，所以一起進 payload。這是任務書「讀檔後要把 `sanguo_*_v1` 那幾把鍵一起換掉」的落地。

`meta`（`SlotMeta`，`SaveSlots.ts:87`）：`monarch` / `cities` / `month` / `monthText` / `wins` / `losses` / `generals` / `scenario` / `name`。任務書要求的四項（君主/城數/年月/勝敗）都在，另外多存將數、劇本、自訂槽名。

### 2.2 四個操作

| 操作 | 函式 | 行 | 要點 |
| --- | --- | --- | --- |
| 存 | `saveToSlot(save, slot, opts?)` | :381 | 七把鍵原樣抄進 payload → 寫索引（`at` + `metaOfSave`）→ **`active` 指到該槽** |
| 讀 | `loadFromSlot(slot)` | :420 | payload 裡有的 `setItem`、**沒有的 `removeItem`** → 改 `active` → `GameState.resetCache()`；回 `{ok,slot,reason,meta,keys}`，場景重畫交給 `options.onLoad` |
| 刪 | `deleteSlot(slot)` | :448 | 清 payload + 清索引格；删的是 active 槽時 `active` 不動（下次自動存會重寫） |
| 換槽 | `setActiveSlot(slot)` | :460 | 只改 `active`，不動資料（=「以後自動存寫這格」） |
| （改名） | `renameSlot(slot, name)` | :470 | 純邏輯有；**面板沒 UI**（Cocos 沒 `prompt`） |

**為什麼存檔會改 `active`**：Cocos 沒有 web 那套「自動存檔固定寫某一槽」的語義，`active` 就是「自動存檔寫哪格」。若照 web 的「存到槽 2 不改自動存檔目標」，接下來打一仗自動存就會把槽 2 蓋成別的東西。這裡選「存到哪格就把自動存檔指到哪格」，與任務書「換槽」的直覺一致。**與 web 不同，已寫進 §5 風險。**

`loadFromSlot` 必須呼 `GameState.resetCache()`（`GameState.ts:690`）：`loadSave()` 有模組級 `cached`，不 reset 會直接回舊檔（測試 `slot_assert 5.12` 就是抓這個：讀回 A 局後 `GameState.loadSave().owned === ['許昌','洛陽']`，沒 reset 會是 B 局的 `['鄴']`）。

### 2.3 面板 `SaveSlotsPanel`

`@ccclass('SaveSlotsPanel')`（`:600`），`static show(parent,options)`（`:602`）、`build()`（`:650`）、`open()`（`:699`）、`close()`（`:712`）、`tap(x,y)`（`:724`）、`debug()`（`:736`）、`get hitList` / `get isOpen`。

- 面板子節點固定 **67** 個：`SlotVeil` / `SlotFrame`（`Graphics` 描邊，**沒有九宮皮膚，照任務書「視覺先簡單」**）/ `SlotTitle`『存 檔 位』/ `SlotSub` / `SlotMsg` + 10 列 ×（`SlotRow{i}_0..2` 三行字 + `SlotBtn{i}_0..2`『存』『讀』『刪』）+ `SlotFootSave`『存 到 當 前 槽』/ `SlotFootClose`『關 閉』。
- 命中標籤：`slot:<n>:save|load|del|row`、`foot:save`、`foot:close`。**先推按鈕再推整列**，線性掃描所以按鈕優先（點「讀」不會同時觸發換槽）。空槽 2 個命中（存 + 列），有檔 4 個。
- 列文字（`slotLines`，:487）照 web `renderSlotRows`：第 1 行 `槽 N · 槽名 · 劇本名 · 使用中`，第 2 行 `第X年Y月 · 城N · X勝Y敗 · 時間`，第 3 行 `君主X · 將N`；空槽 `槽 N · 空` / `可存入目前進度`，讀/刪灰。
- 顏色用本地 `rgba(hex,alpha)`（`view/theme.ts` 只有字串 hex，沒有 hex→`Color` 轉換器，不為此改 theme）。

---

## 3. 驗證

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit     → EXIT=0

cd F:\sanguo\work\cocos_surrender
node model_assert.mjs     → ALL PASS — 斷言總數 168，失敗 0   (EXIT=0)
node panel_headless.mjs   → ALL PASS — 斷言總數 103，失敗 0   (EXIT=0)
node slot_assert.mjs      → ALL PASS — 斷言總數 148，失敗 0   (EXIT=0)
```

`tsconfig.sim.json` 把 `cc.engine.d.ts` + `types.ts` + 三個新檔編成 commonjs（`_sim/`），mock `cc` 在 `_sim/node_modules/cc/index.js`（從 `work\cocos_items\_sim` 複製）。`panel_headless.mjs` 額外產出 `panel_tree.txt`（58 行節點樹，逐節點 name/active/position/contentSize/label/sprite）與 `panel_interactions.txt`（每次點擊的命中項 + 畫面狀態）。

**`model_assert` 覆蓋**（11 段）：候選順序（executed 優先、同名不重複、`atCity` 只出君主）／三檔 tier + 文案／按鈕可用性矩陣／r86 批量鍵不得繞過／硬門縱深／君主不可招／空名髒檔不生成卡／`mine`·`king`·`atCity` 過濾／逐將決策／`queuePostBattle` 去重／邊界（空 picks、重複 finish）。

**`panel_headless` 覆蓋**（8 段）：節點數 57、6 張卡分 2 頁、命中矩形 17（灰鍵不進 `hitList`）、頭像五級回落後節點隱藏、點招降後三鍵收起 + 徽標、批量斬首後 6 人全決 + `SurMsg='戰 後 處 置完成：招降 1 · 斬首 4 · 放走 1'`、存檔被真實改寫（`captured/executed` 清空、`lastPost` 寫入、`roster._moved` 出池）、完成後 `close` + 解監聽、君主卡只剩批量鍵。

**`slot_assert` 覆蓋**（8 段）：索引讀寫/越界/壞 JSON、`metaOfSave` 四項必填、存檔不動其他槽、讀檔換七把鍵並**刪掉本局沒有的鍵**、`resetCache` 生效、空槽/壞檔 reason、面板 67 節點、空盤 22 命中→存檔後 24 命中、換槽、讀檔回呼、復用節點、刪槽、關閉解綁。

> stderr 會印 `[ArtLayer] load('face/full/xxx', ImageAsset) 失敗：mock 缺資源` —— mock 沒註冊任何圖檔，五級回落最後隱藏頭像**是預期行為**，不是錯誤。

---

## 4. 給 lead 的接入補丁

### 補丁 A（必須）：`CampaignRoot.ts` 3 行

`CampaignRoot.start()` 是「回到大地圖」的必經路徑（`:1065` 的註釋已說明守城戰在 Deploy 場景結算、回大地圖是新場景，所以 `start()` 會再跑一次）。把面板掛在 `:1067 checkMonarchDeath()` 之後：

```ts
// ① 檔案頂部 import 區（和 `import * as GameState from './GameState';` 放一起）
import { SurrenderPanel } from './SurrenderPanel';

// ② start() 內，`:1067 this.checkMonarchDeath();` 的下一行
SurrenderPanel.showIfNeeded(this.node, { save: this.save, data, home: this.selected ?? this.save.owned[0] ?? '', onDone: () => this.refresh() });
```

- `showIfNeeded()` 沒候選時回 `null` 且**不建節點**，所以平常零成本、不會擋點擊。
- `home` 是招降後入伍的城。web 用的是「打的那座城」（`save.last`），Cocos 沒有 `save.last`；`this.selected` 是地圖上當前選中的城，攻擊後通常就是它。要更準可改 `((this.save.lastPost as {city?: string} | undefined)?.city) ?? this.selected ?? this.save.owned[0] ?? ''`。**[推測]** 這條 fallback 鏈沒有實機驗證。
- 面板自己做 `GameState.persistSave()`，`onDone` 只需要 `refresh()` 讓城池兵力/武將數重畫。
- 若之後要做「先決策再回大地圖」的嚴格版，就把 `showIfNeeded` 改到 `CampaignRoot` 的 `onLoad`/`start` 尾端並擋掉 `refresh` 前的輸入；目前版本是「回地圖後彈層蓋在上面」，行為等價、改動最小。

### 補丁 B（必要，否則面板永遠沒候選）：`BattleRoot.ts` 3 行 + 2 個 import

現況：`BattleRoot.ts:180-192` 只把 `settlement.record` 給 `recordBattleResult()`，**`settlement.post.captures/executed` 從不寫進存檔**（`core/battle.ts:517` 的 `SettleResult.post?: PostBattleReport` 有這份資料，`grep captured|executed` 在 Cocos 腳本裡只命中 AiModel/AiRunner）。所以 `save.captured`/`save.executed` 永遠是空 → `surrenderCandidates()` 永遠回空 → 面板永遠不彈。

```ts
// ① `BattleRoot.ts:42` 的 GameState import 補上 persistSave
import { consumeBattleLaunch, loadSave, persistSave, recordBattleResult } from './GameState';
// ② 同檔 import 區
import { queuePostBattle } from './SurrenderModel';

// ③ update() 內，`recordBattleResult(...)` 之後（`:191` 下一行）
queuePostBattle(loadSave(), this.settlement.post); persistSave();
```

`queuePostBattle()` 的語義與 web `main.js:845-853` 一致：`captures` 只收 `recruited === true` 的、`executed` 全收，兩邊去重，不碰其他鍵。

### 補丁 C（可選）：存檔位入口

`SaveSlots.ts` 已經有完整面板，但需要一個入口按鈕（`CampaignRoot` 的 UI 是禁改檔，所以這裡只給呼叫方式）：

```ts
import { SaveSlotsPanel } from './SaveSlots';
SaveSlotsPanel.show(this.node, {
  save: this.save,
  onLoad: () => { this.save = GameState.loadSave(); this.refresh(); },
});
```

`onLoad` 是必要的：`loadFromSlot()` 只換 localStorage + `resetCache()`，不知道場景長什麼樣；讀檔後要重新取 save 並重畫（若之後要換劇本，還得重跑 `loadGameData()`，目前 Cocos 只有一個劇本，所以沒做）。

---

## 5. [推测] 與風險

- **[推测]** `CampaignRoot.start()` 是回大地圖的必經路徑（依據是 `:1065` 的註釋），我沒有實機跑過場景切換，所以補丁 A 的掛載點是讀碼推論。若實際是場景不重載（例如 `director.loadScene` 被替換成別的流程），補丁要改成事件回呼。
- **[推测]** `home = this.selected` 是否等於「剛打完的那座城」：攻擊流程上應該是，但 `selected` 在戰後可能已被重置成 `owned[0]`。要 100% 準確就把打的那座城寫進 `save.lastPost.city`（web 就是這樣），再由補丁 A 讀。
- **與 web 不同的兩處語義**（刻意，已在 §2.2 說明）：① `saveToSlot` 會把 `active` 指到該槽；② 沒有 v3 快照/遷移，payload 直接存七把鍵的原始字串。舊 web 存檔（`sanguo_slots_v1` 的 web 格式 `{slots:[…],last}`）**Cocos 版讀不了**，`readIndex()` 遇到不合形狀的 `slots` 會回空盤（不報錯、不覆蓋）。
- **改名沒有 UI**：`renameSlot()` 有、面板沒有輸入框（Cocos 沒 `prompt`，要另外做 `EditBox` 彈層）。
- 面板字體用 `FONT_FAMILY`（`view/theme.ts`），750×1334 設計座標；**沒有在真機/預覽上看過排版**，`model_assert`/`panel_headless` 只驗行為與節點結構，不驗像素。
- `SurrenderPanel` 一頁 5 張：俘虜超過 5 人時分頁（`SurPrev`/`SurPage`/`SurNext`）。web 是無限滾動列表，Cocos 沒有 ScrollView 皮膚，所以用分頁。**[推测]** 一頁 5 張在 1334 高度下不擠，是按 `CARD_H=150 + CARD_GAP=8` 算出來的，沒有視覺確認。

## 6. 沒做到

1. **沒有 build、沒有跑微信構建、沒有截圖**（任務書禁止，構建歸 lead）。所以「照 web 視覺」只做到結構與文案層級，像素級對齊未驗。
2. **`CampaignRoot` / `BattleRoot` 一行都沒改**：補丁 A/B/C 都要 lead 落。落補丁 B 之前，招降面板在實機上永遠不會彈（沒有候選）。
3. **`surafter` 收尾**（web 決策完開城池武將列表）沒做。
4. **改名 UI** 沒做（純邏輯有）。
5. **web 存檔格式遷移**（v3 快照 → Cocos 索引）沒做，兩邊槽位格式不通用。
6. **真機中文字體/換行**未驗：`Label.Overflow.SHRINK` 對長理由（`reason` 最長約 40 字）可能在窄卡上縮到很小，`SurReason` 用 `SHRINK`，實機可能要改成兩行或省略號。
7. `ArtSprite` 的頭像沒有實機加載過（mock 沒資源），五級回落「到隱藏」是測試裡唯一走過的路徑；`face/full` 成功那條路徑只有 `Portrait.ts` 自己的單元測試覆蓋。
