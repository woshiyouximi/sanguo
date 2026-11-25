# 70 · Cocos 物品頁移植（C3 另一半）

> 任務書：w4-cocos-items，把 web 版物品頁（`game\web\items.html` + `game\web\items_model.js`）移植進 Cocos，補 `project\66_原版对照复查.md` C3 的另一半。
> 工程根：`F:\sanguo\game\cocos`（Creator 3.8.8，750×1334 fitHeight）。**沒有新增 .scene**，物品頁是面板 `ItemsPanel`，由內政頁 `CityPanel` 的「物品」按鈕打開（大地圖 `CampaignRoot` 頭部另有一個備用入口）。

## 0. 結論

| 驗收項 | 結果 |
| --- | --- |
| `tsc -p tsconfig.check.json --noEmit` | **EXIT=0**（接線後的 `CityPanel.ts` / `CampaignRoot.ts` 也在 program 裡） |
| `work\cocos_items\parity.mjs`（web ↔ TS 對拍） | **1969 條斷言，0 失敗，ALL PASS**，EXIT=0 |
| `work\cocos_items\portrait_chain.mjs`（肖像回落鏈） | **598 條斷言，0 失敗，ALL PASS**，EXIT=0 |
| `work\cocos_items\panel_headless.mjs`（mock cc 跑真面板） | **91 條斷言，0 失敗，ALL PASS**，EXIT=0 |
| 移植函數 | **21 個函數 + 6 個常量（27 個導出）**，與 `items_model.js` 一一對應 |
| 面板節點數 | **139 個**（含根；Label 110 / Sprite 26 / Graphics 2） |
| 實機 | **未在 Creator 實機驗證**（任務書不許跑 CocosCreator），用 mock `cc` 模組跑編譯產物代替 |

## 1. 移植對照

### 1.1 檔案

| web | Cocos | 說明 |
| --- | --- | --- |
| `game\web\items_model.js`（252 行） | `game\cocos\assets\scripts\ItemsModel.ts` | 純邏輯，**零 `import`**（連 `cc` 都不 import），編譯後可直接在 node 跑 |
| `game\web\face_map.js`（451 行，`SG.portraitUrl`） | `game\cocos\assets\scripts\Portrait.ts` | 400 條 FACE 表 + 回落鏈加載器 |
| `game\web\items.html`（625 行 UI） | `game\cocos\assets\scripts\ItemsPanel.ts`（1483 行） | 面板；固定節點池 + 分頁 |
| — | `game\cocos\assets\scripts\CityPanel.ts` | 內政頁「物品」入口（主入口，只加 5 處），見第 6.1 節 |
| — | `game\cocos\assets\scripts\CampaignRoot.ts` | 大地圖「物 品」入口（備用，只加 4 處），見第 6.2 節 |

### 1.2 `ItemsModel.ts` 導出清單（27）

常量 6：`SLOTS`、`SLOT_NAMES`、`STAT_KEYS`、`STAT_NAMES`、`GROUP_ORDER`、`GROUP_LABELS`（值與 key 順序都與 web 相同，parity 逐個比過）。

函數 21：`num`、`bitsOf`、`typeOf`、`isTalisman`、`isFormBook`、`slotOf`、`isEquippable`、`groupOf`、`emptyBonus`、`bonusOf`、`registerItems`、`itemOf`、`allItems`、`normalizeEquips`、`equipItem`、`unequipSlot`、`equippedSlot`、`totalBonus`、`applyEquip`、`runtimeGeneral`、`bonusText`。

型別（TS 額外，執行期不存在）：`Slot`、`GroupKey`、`StatKey`、`NumLike`、`ItemLike`、`Bonus`、`EquipTable`、`GeneralLike`、`AppliedGeneral`、`RuntimeGeneral`。

移植時逐條保留了 web 的怪行為，容易「順手改掉」的幾處：

- `num(v)`：`''`/`null`/`undefined`/非有限值全算 0（`Number('') === 0` 不是巧合，是原邏輯）。
- `bonusOf(item, general)`：兵符（`JEWEL_MISC && Force > 0`）**early-return 全 0**，即使條目上寫了 `STR` 也不給。
- `applyEquip`：`bonus.Force |= b.Force`、`bonus.Battle |= b.Battle`（位標記用 `|=`，不是 `+=`）；回傳新物件且掛 `_bonus` / `_equips`，**不改入參**。
- `runtimeGeneral`：`MaxHP = num(MaxHP) || num(BaseHP)`（`||` 不是 `??`，0 會落到 BaseHP）。
- `slotOf` 的判定順序：`JEWEL_WEAPON` → `JEWEL_HORSE` → `JEWEL_THING` → `JEWEL_MISC && Loyal > 0` → `null`。

### 1.3 `ItemsPanel.ts` 導出

`ITEM_SAVE_KEY='sanguo_items_v1'`、`DEFAULT_BAG`（12 件，與 web 同序）、`POOL_SIZE=12`、`ROW_POOL=11`、`LAYOUT`、`ItemsSave`、`PanelDebug`、`ItemsPanelOptions`、`ITEMS_NODE_NAME='ItemsPanel'`、`class ItemsPanel`（`static show(parent, opts)` / `get isOpen()` / `open()` / `close()` / `debug()` / `tap(x,y)` / `static get saveKey()`）。

存檔形狀 `{equip:{名:{槽:seq}}, bag:[seq], gen:名|null}` —— 前三項與 web 的 `sanguo_items_v1` **完全兼容**（`gen` 是我多存的「上次選的武將」，web 讀到會忽略）。背包內容、裝備表、`owned` 過濾（武將池只看已佔城池）都沿用 web 口徑。

## 2. parity 對拍（1969 條）

`work\cocos_items\parity.mjs`：`import` web 的 `items_model.js`（ESM，`game/package.json` 有 `"type":"module"`）+ `createRequire` 加載 `_sim/ItemsModel.js`（tsc CommonJS 產物），同一批輸入逐項比。

覆蓋面：

1. 導出鍵集合 / 數量（27）/ 每個函數 `length`（arity）。
2. 6 個常量：值 + key 順序。
3. `num`：28 個邊界值（`''`、`' '`、`null`、`undefined`、`NaN`、`Infinity`、`'12'`、`'0x10'`、`true`、`[]`…）。
4. `bitsOf`：20 個掩碼（0、1、2、3、4、8、16、255、256、負數、2^31…）。
5. **77 件物品 × 8 函數**：`typeOf/isTalisman/isFormBook/slotOf/isEquippable/groupOf/bonusOf/bonusText`。
6. 9 種怪輸入 × 6 函數（`null`、`undefined`、`{}`、字串、數字、陣列…）。
7. `bonusOf(item, general)`：4 位武將 × 12 件（含兵符 early-return）。
8. `itemOf`：10 個值（存在的 seq、不存在、字串 seq、`null`）。
9. `normalizeEquips`：15 種形狀 + 幂等性。
10. `equipItem` / `equippedSlot`：77 件 × 2 張底表（覆蓋「同槽已有」與「空表」）。
11. `unequipSlot`：4 槽 × 有/無。
12. `totalBonus`：15 種形狀（含重複 seq、非法槽名）。
13. `applyEquip`：40 位武將 × 2 種裝備表 + **不修改入參**。
14. `runtimeGeneral`：401 位武將 + 5 種怪輸入。
15. 隨機 300 步（seed 20261125，mulberry32）equip / unequip / totalBonus / applyEquip 的每個中間狀態。

實跑輸出：

```
cocos 模組 : _sim/ItemsModel.js (27 個匯出, 21 函式)
items.json : 77 件 sha256=c8049a22357761bc…
groups     : {"weapon":34,"horse":8,"book":8,"amulet":5,"talisman":13,"formation":9}
斷言總數   : 1969
失敗       : 0
結果       : ALL PASS
```

> 修過兩個「對拍器自己」的 bug（不是移植差異）：匯出數一度按 30/24 寫；隨機段兩邊各調一次 `rnd()` 取武將索引，導致選到不同武將。現在兩邊共用同一個 `pickIndex`。

## 3. 面板結構

節點樹 / 尺寸 / 錨點 / web 對應全部在 **`work\cocos_items\panel_layout.md`**，實跑原始樹在 `work\cocos_items\panel_tree.txt`（139 行）。

骨架：

- `ItemsBg`（`bg/map_bg`，cover）+ `ItemsVeil`（壓暗）+ `ItemsFrame`（**唯一** Graphics，一次畫完整個面板：底板/邊框/選中態/槽位/頁籤/詳情框）。
- 武將卡：肖像 `face/full/NNN` + 名 + `武力 b→a · 智力 … · 生命 … · 速度 …` + `所在 X · 忠誠 N`；四槽 `兵器/坐騎/兵書/寶物`（裝備中有金邊）。
- 12 個武將切換格（`face/thumb/NNN` + 名），池 = `generals` 去掉 `盜賊`、`CITY ∈ owned`、按 `STR+INT` 降序取 12（空則回落 `關羽`/首個）——與 web 同算法。
- 7 個頁籤：`全部` + `兵器/坐騎/兵書/寶物/兵符/陣法`（`GROUP_LABELS` 去空格）。
- 列表：按 `Sort` 升序、分組頭（`{label} {n} 件 · 已擁有 {m}`）；行 = 圖示 + 名（`[已裝備]/[使用品]` tag）+ `Description` + `Lv n · 加成串`。
- 詳情：大圖 + `TYPE_NAMES` + `在背包/未擁有 · 裝備中/可裝備·{槽}槽/不可裝備` + 10 項加成表（`—`/`+n`，正數綠）+ `Description` + 預覽（`裝上後：…` / `使用品：不佔裝備槽，也不加任何屬性` / `{名} 已裝備於「{槽}」槽`）+ **原作欄位 12 行**（`編號 Sequence / 原作 TYPE / 標記 Attrib / 使用等級 Level / 排序 Sort / 兵器型 WeaponType / 外形 WeaponObject / 搜索型 SearchType / 出現率 Rate / Force 位 / Battle 位 / 圖示 Sprite`），空值一律 `—`。
- 底欄：`裝備/卸下/不可裝備` + 副文（`{槽} · {名}` 或 `兵符 · 使用品`）、`全部解鎖` + `背包 N 件`、`返 回`、兩行規則提示、`ItemsToast`。
- 交互：4 槽 → 12 武將 → 7 頁籤 → 當前頁行 → 上/下頁 → 3 個底欄按鈕，共 **39 個命中矩形**；點槽位會跳選該槽物品，點物品不在當前分類時自動切回「全部」（`selectSeq` 內先重算 `pages` 再定位，避免指到舊頁）。

實跑首屏（`panel_headless.mjs`）：

```
面板節點數           : 139（host 連同 140）
Label / Sprite       : 110 / 26（Graphics 節點：ItemsVeil, ItemsFrame）
條目 / 頁數          : 83 條 / 8 頁
命中矩形數           : 39
頁眉                 : 共 77 件 · 可裝備 55 · 背包 12 件 · 已裝備 0/4
武將卡               : 關羽 | 武力 99 · 智力 85 · 生命 85 · 速度 0 | 所在 代縣 · 忠誠 100
詳情                 : 直劍 | 兵器　—　Lv 1 | 在背包 · 可裝備 · 兵器槽
原作值（前 4 行）    : 14 / JEWEL_WEAPON / — / 1
```

12 段交互（真 `TOUCH_END`）逐段有斷言：切頁籤（83→35 條）、選物品（#14→#16，詳情/底欄跟隨）、裝備（槽位出物名、按鈕變「卸 下」、卡面 `武力 99→100`、foot 變「裝備中」、預覽變「已裝備於兵器槽」）、卸下、翻頁（0→1→2→1，8 頁）、切武將（關羽→曹操，大肖像 `face/full/220`、12 個小頭像 `face/thumb/*`）、全部解鎖（背包 12→77，toast「背包補滿 65 件」）、點槽位回選（#17→#15）、存檔落盤、關閉（節點隱藏 + 註銷 input + 回調）、重開（背包 77、記住曹操、裝備仍在）。

## 4. 打包預算

- 新增**零**資源：只用已在包裡的 `bg/map_bg`（與大地圖同圖）、`face/full` + `face/thumb`（801 檔 1.90 MB）、`items/*.png`（57 檔 0.13 MB）。
- 不依賴 lead 移出工程的 `bg\env`、`bg\policy`、`map`、`anim\general`，**不需要恢復任何東西**。
- 代碼量：`ItemsModel.ts` 319 行 / `Portrait.ts` 546 行 / `ItemsPanel.ts` 1483 行，編譯後 JS 約 86 KB（未壓縮，gzip 後更小），對 15.72 MB 的包可忽略。

## 5. 肖像回落鏈（`Portrait.ts`）

API：`FACE_MAP`（400 條）、`faceNumberOf(name)`、`portraitUrl(name, variant)`、`facePath(name, variant)`、`heroPaths(name)`、`portraitChain(name, variant, hero)`、`loadPortrait(target, name, variant, load, done?)`。

- FACE 表由 `work\cocos_items\gen_portrait.py` 從 `game\web\face_map.js` 的 `FULL` 表**自動生成**（不是手抄），400 條逐條與 web 對拍一致；`generals.json` 的 `FACE` 欄位（`FACE\FACE001` → `001`）也驗證同源，唯一例外 `盜賊`。
- 回落鏈：`face/full/{NNN}` → `face/thumb/{NNN}` → `hero/{名}` → `hero/{encodeURIComponent(名)}` → 隱藏（`apply(null)`）。`variant='thumb'` 時第一級就是 thumb（與 web 的 `portraitUrl(name,'thumb')` 一致）；`hero=false` 可砍掉 hero 級（`?portrait=hero` 場景）。
- 加載器是**注入**的 `FrameLoader`（`(path, cb) => void`），面板傳 `ArtLayer.loadFrame`；所以 `Portrait.js` 編譯後零 `require`，node 裡可以打樁驗證。

實跑證據（`node portrait_chain.mjs`）：

```
FACE_MAP        : 400 條（與 face_map.js FULL 表逐條一致）
portraitChain   : full → thumb → hero/<名> → hero/<encoded> → 隱藏
bundle 實檔     : face/full 400/400 · face/thumb 400/400 · hero 400/400
斷言總數        : 598
失敗            : 0
結果            : ALL PASS
```

- 6 種情形都打樁跑過：全存在→只載一次就 via full；full 缺→thumb；full+thumb 缺→hero 原名；只有 encodeURIComponent 形式→第 4 級；全缺→隱藏；`盜賊` 無 FACE→直接 hero 不試 face。
- 面板側實測：`ItemsPortrait frame=face/full/385`（關羽）→ 切武將後 `face/full/220`（曹操）；12 個 `ItemsPickFace` 全是 `face/thumb/NNN`；三級實檔在 bundle 裡 400/400/400 都存在，**hero 沒同步也不會崩**（第 3 級失敗就隱藏）。

## 6. 接線（兩處入口：內政頁 + 大地圖）

任務書要求「`CityPanel.ts` 有就掛內政頁，沒有就掛 `CampaignRoot.ts`」。開始接線時 `CityPanel.ts` 還不存在，先掛了大地圖；工作進行中 w3-cocos-city 把 `CityPanel.ts` 落了盤（39949 B），於是**按任務書補接內政頁，同時保留大地圖入口**（兩條路進同一個面板，互不衝突）。改動前都先寫進 `work\cocos_items\entry_registry.md` 登記。

### 6.1 內政頁「物品」按鈕（主入口）

| 位置 | 內容 |
| --- | --- |
| `CityPanel.ts:43` | `import { ItemsPanel } from './ItemsPanel';` |
| `CityPanel.ts:175` | 欄位 `private itemsPanel: ItemsPanel \| null = null;` |
| `CityPanel.ts:368`（`hide()`） | `if (this.itemsPanel?.isOpen) this.itemsPanel.close();` |
| `CityPanel.ts:1011`（`cmdItems()` 開頭） | 資料齊全 → `ItemsPanel.show(this.node, { onClose })`（:1021）+ `panel.open(data.generals, data.items, owned)` 後 `return`；資料缺失才退回原本 6 行背包 `openSheet()` |
| `CityPanel.ts:1138`（`onTouch()` 開頭） | `if (this.itemsPanel?.isOpen) return;`（防穿透：內政頁指令格 y 478–790 與物品列表 y 456–1100 重疊，不擋會「點一行物品同時觸發徵兵/搜索」） |

- 觸發鏈：內政頁指令格「物品」→ `case '物品': this.cmdItems(); return;`（`CityPanel.ts:825`；同檔 `:648` 那個 `case '物品'` 只是指令格的副標題文案，別搞混）。
- 面板掛 `this.node`（內政頁節點）底下 → 天生蓋在內政頁上、跟著內政頁顯隱。
- `hide()` 那句是必須的：內政頁隱藏後子節點雖 `active=false`，但 `ItemsPanel` 的 `input` 監聽還掛著（`onTouch` 只看 `opened`），會把大地圖的點擊吃掉。
- 內政頁原本的「背包一覽」sheet 保留作為 fallback（`this.opts.data.items` 為空時走它）。

### 6.2 大地圖頭部「物 品」按鈕（保留）

| 位置 | 內容 |
| --- | --- |
| `CampaignRoot.ts:38` | `import { ItemsPanel } from './ItemsPanel';` |
| `CampaignRoot.ts:69` | `const ITEMS_BUTTON = { x: 560, y: 64, w: 176, h: 52 };` |
| `CampaignRoot.ts:108/112` | 欄位 `labelItems: Label \| null`、`itemsPanel: ItemsPanel \| null` |
| `CampaignRoot.ts:139` | `labelStats` 寬 700 → 516（給右上角按鈕讓位） |
| `CampaignRoot.ts:142` | `this.labelItems = this.makeLabel('物 品', 648, 90, 176, 20, COLORS.goldLight, 'center')` |
| `CampaignRoot.ts:766-767` | `drawFrame()` 畫按鈕底 + 金邊（`#2A2318` / `COLORS.gold` 1px） |
| `CampaignRoot.ts:897` | `onTouch()` 第一行 `if (this.itemsPanel?.isOpen) return;`（防穿透） |
| `CampaignRoot.ts:909-914` | 按鈕命中 → `this.openItems()` |
| `CampaignRoot.ts:946-958` | `openItems()`：`ItemsPanel.show(...)` 複用實例，`open(data.generals, data.items, GameState.loadSave().owned ?? [])`，`onClose` 回 `refresh()` |

契約：兩個宿主檔**其餘一行不改**；面板存檔走獨立 key `sanguo_items_v1`，不寫 `sanguo_campaign_v1`；面板是後加的子節點，永遠蓋在宿主之上。

### 6.3 要不要收成單一入口

建議留內政頁那條，大地圖那條可以等 lead 決定後刪（刪法：`CampaignRoot.ts` 的 import / `ITEMS_BUTTON` / 欄位 / `labelStats` 寬度還原 / `drawFrame` 兩行 / `onTouch` 兩處 / `openItems()` 方法）。`ItemsPanel.ts` 本身**不用改**（`show(parent)` 接受任意父節點，`open()` 的 owned 由呼叫端傳）。


## 7. 驗證怎麼跑

```powershell
# 1. 型別檢查（真實 Creator 3.8.8 引擎宣告）
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit   # EXIT=0

# 2. 編譯成 CommonJS 供 node 跑（產物在 work\cocos_items\_sim）
cd F:\sanguo\work\cocos_items
node F:\sanguo\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json   # EXIT=0

# 3. 三套對拍
node parity.mjs          # 1969 條，ALL PASS
node portrait_chain.mjs  # 598 條，ALL PASS
node panel_headless.mjs  # 91 條，ALL PASS（順便寫 panel_tree.txt / panel_interactions.txt）
```

`_sim\node_modules\cc\index.js` 是手寫的 mock `cc`：`Node/Component/UITransform/Graphics/Label/Sprite/SpriteFrame/Texture2D/ImageAsset/JsonAsset/input/sys/director/assetManager`，`__setAsset/__emitTouch/__storage/__loadLog/__nodeCount` 是測試鉤子。它只覆蓋面板實際用到的 API，不能當引擎用。

## 8. 沒做到的 / 已知限制

1. **未在 Creator 實機驗證**：任務書禁止跑 CocosCreator，所有表現層結論來自 mock `cc` + 編譯產物。真機要驗的是字體（`FONT_FAMILY` 在微信小遊戲的實際字型）、Graphics 圓角與 1px 線、以及 `Label` 在 `SHRINK` 模式下的截斷效果。
2. **`.meta` 仍需在 Creator 裡導入一次**：`project\67` 記的坑還在 —— `face/`（801）、`items/`（57）等新資源沒有同名 `.meta`，必須打開一次工程讓 Creator 導入，否則 bundle 裡沒有。headless 是直接按檔案路徑註冊的，**測不到這一層**。
3. **`hero` 級只驗到「檔案存在 + 打樁通過」**：真機上首幀可能先顯示 `full`，`hero` 那兩級在正常存檔下不會走到（400 位武將 full/thumb 全在）。
4. **web 的滾動 / 觸控拖動沒移植**：改成 8 頁分頁；手機上分頁比滾動省節點，但連續翻 77 件比 web 累（點 7 次下頁）。
5. **web 的調試參數沒做**（`?gen=&seq=&act=equip|unequip`）：Cocos 側用 `panel.open()` + `panel.tap()` / `debug()` 在 headless 裡驅動，真機沒有 URL。
6. **使用品沒有「使用」動作**：web 物品頁本來也只有裝備/卸下（兵符、陣法書顯示 `解鎖` / `學會` 文案但不消耗），Cocos 保持一致 —— 也就是說「解鎖兵符」「學陣法」要等兵符/陣法頁或戰鬥入口來接。
7. **圖示 44×44**（web 48×48），肖像 `contain` 後是 72×72（web 是 72×92 拉伸）：都是為了 56 行高與不變形做的取捨，已寫在 `panel_layout.md` 第 7 節。
8. **兩處入口都還在**：內政頁「物品」按鈕（主）+ 大地圖頭部「物 品」按鈕（保留）。內政頁那條是在 w3-cocos-city 落盤後補接的，接法見第 6.1 節；要不要把大地圖那條撤掉留給 lead 決定（第 6.3 節有刪法）。**這兩個入口都沒有在 Creator 實機點過** —— 實機路徑是「點城市 → 內政頁 → 物品」，headless 只驗到面板本身與 `show/open` 契約。

## 9. 檔案清單

新增：

- `game\cocos\assets\scripts\ItemsModel.ts`（319 行）
- `game\cocos\assets\scripts\Portrait.ts`（546 行，含 400 條 FACE 表）
- `game\cocos\assets\scripts\ItemsPanel.ts`（1483 行）
- `work\cocos_items\parity.mjs`、`portrait_chain.mjs`、`panel_headless.mjs`、`probe_assets.mjs`、`gen_portrait.py`、`entry_registry.md`、`panel_layout.md`、`panel_tree.txt`、`panel_interactions.txt`、`tsconfig.sim.json`、`_sim\**`（mock cc 與編譯產物）

修改（只加入口）：

- `game\cocos\assets\scripts\CampaignRoot.ts`（第 6.2 節，只加 import / 按鈕 / `openItems()` / `onTouch` 兩處）
- `game\cocos\assets\scripts\CityPanel.ts`（第 6.1 節，只加 import / 欄位 / `hide()` 一行 / `cmdItems()` 開頭的分支；其餘 w3-cocos-city 的代碼一行未動）

未改：`game\src\**`、`game\web\**`、`game\cocos\assets\scripts\core\**`、`project\` 既有文件、4 個 `.scene`。
