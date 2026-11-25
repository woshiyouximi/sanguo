# 三國群英傳2 豎版重製 · Cocos Creator 3.8 工程骨架

這個目錄不是「打開就能跑」的完整工程，而是**可被 Creator 覆蓋導入的骨架**：
本機沒有安裝 Cocos Dashboard / Creator，所以沒有 `.scene`、沒有 `library/`、沒有 `temp/`，
這些都由 Creator 首次打開時生成。

## 三步導入

### 1. 裝 Dashboard + Creator 3.8

- 安裝 Cocos Dashboard，登錄後安裝 **Cocos Creator 3.8.x**（與本骨架 `package.json` 的
  `creator.version` 對齊；3.8 任意小版本都可以）。
- 不要用 2.x：本骨架的 API（`Graphics`、`UITransform`、`resources.load`、`@ccclass`）
  都是 3.x 的。

### 2. 新建空 2D 工程

- Dashboard → 新建 → **Empty (2D)** → 路徑選 `F:\sanguo\cocos-new`（先建一個新的，別直接覆蓋）。
- 打開一次，讓 Creator 生成 `library/ temp/ settings/` 等目錄，然後關閉編輯器。
- 把本目錄的這三塊覆蓋進新工程：
  - `assets/scripts/` → `assets/scripts/`
  - `assets/resources/data/` → `assets/resources/data/`（13 個 JSON）
  - `settings/v2/packages/project.json` → 同路徑（設計分辨率 750×1334）
  - `package.json` 可以不合併，只保留新工程自己的；本檔只用來標識 `sanguo-vertical`。
- 重新打開工程，等待資源導入完成（`things.json` 較大，第一次會慢一點）。

> 為什麼不直接給完整工程：Creator 的 `library/`、`temp/`、`.meta` 與本機版本/緩存綁定，
> 跨機器複製最容易出「資源 UUID 丟失」。骨架 + 覆蓋是最穩的方式。

### 3. 建場景、掛 BattleRoot

1. 在 `assets/` 下新建場景 `Battle.scene`，雙擊打開。
2. 場景裡保留默認的 `Canvas`（設計分辨率應為 750×1334；若不是，選 Canvas →
   `UITransform` 改成 750×1334，或檢查 `settings/v2/packages/project.json`）。
3. 選中 `Canvas` 節點 → 添加組件 → 自定義腳本 → `BattleRoot`。
4. 運行。`BattleRoot` 會自己創建 5 個 `Graphics` 節點和 5 個 `Label`，
   不需要手工擺 UI。
5. 若不想自動開戰，把 `BattleRoot.autoStart` 取消勾選，點一次畫面再開。

> 沒有現成 `.scene` 是刻意的：場景文件裡保存的是節點 UUID 引用，跨工程導入容易斷。
> 用「新建場景 + 掛組件」兩步，比修一個壞掉的 scene 快。

## 目錄

```
cocos/
  package.json                     # Creator 識別的項目標識（name/uuid/version）
  tsconfig.json                    # 繼承 Creator 生成的 temp/tsconfig.cocos.json
  settings/v2/packages/project.json# 只保留 designResolution 750×1334
  assets/
    scripts/
      BattleRoot.ts                # cc.Component：持有 World、固定 30Hz、Graphics + Label
      DataLoader.ts                # resources.load('data/generals', JsonAsset) 等 8 張表
      core/battle.ts               # 從 game/src/core/battle.ts 複製（邏輯核心，見下）
      types.ts                     # 從 game/src/types.ts 複製
      view/theme.ts                # 從 game/src/view/theme.ts 複製（純常量，不引 cc）
      view/layout.ts               # 從 game/src/view/layout.ts 複製（純坐標，不引 cc）
    resources/data/*.json          # 13 張表，resources.load 的路徑根
```

## 邏輯核心不改、視圖層兩套實現

```
game/src/core/battle.ts   ← 唯一邏輯核心（純 TS，Node 測試 15/15）
        │  複製（只改 import 後綴）
        ▼
cocos/assets/scripts/core/battle.ts
        │
        ├── game/src/view/battleView.ts  → Canvas2D 預覽（web/）
        └── cocos/assets/scripts/BattleRoot.ts → Cocos Graphics + Label
```

- **邏輯核心**：`createWorld / step / cast / settle / camera / project` 全部在
  `core/battle.ts`。Cocos 版與 Canvas2D 版共用同一份邏輯，連 `RNG`、氣力回復、
  技能判定順序都完全一致。
- **視圖層**：`game/src/view/` 是「World → 繪製指令」的參考實現（Canvas2D）；
  `BattleRoot.ts` 是 Cocos 版，直接讀 `World` 畫 `Graphics`。兩者不互相 import。
- **唯一改動**：複製到 Cocos 時把 `import type ... from '../types.ts'` 改成
  `from '../types'`（Cocos 的模塊解析不認 `.ts` 後綴），以及 `layout.ts` 的
  `'../core/battle.ts'` → `'../core/battle'`。**沒改一行邏輯**。
- 同步方式：改完 `game/src/core/battle.ts` 後，重新複製到
  `cocos/assets/scripts/core/battle.ts`，再跑一次上面的後綴替換；或在 Cocos 工程裡
  保留一份 `sync-core.mjs`（本骨架未帶，避免兩份腳本漂移）。

## Canvas2D → Cocos 的替換表

| Canvas2D（`game/src/view/battleView.ts`） | Cocos（`BattleRoot.ts`） | 備註 |
| --- | --- | --- |
| `ctx.fillRect / strokeRect` | `Graphics.rect()` + `fill()/stroke()` | 坐標要從「左上原點、y 向下」翻成「中心原點、y 向上」 |
| `ctx.beginPath / moveTo / lineTo` | `Graphics.moveTo / lineTo / stroke` | 網格線、朝向缺口 |
| `ctx.ellipse` | `Graphics.ellipse`（或 `circle`） | 技能範圍、Spine 特效的地面圈 |
| `ctx.fillText / strokeText` | `Label`（系統字或 BMFont） | HUD、飄字；大量飄字用對象池 |
| `ctx.drawImage` / 圖集 | `Sprite` + `SpriteFrame`（圖集自動合批） | 單位方塊換成序列幀時走這條 |
| 單位方塊 | `Graphics` 方塊（當前）/ `Sprite`（接圖後） | 先用方塊驗證投影與朝向 |
| 技能特效 | `sp.Skeleton`（Spine） | 留給後續；先保留 `world.fx` 的地面圈 |
| 相機 | `camera(world)` + 手動 lerp | 與 Canvas2D 完全同一套 `camX` |
| 固定步長 | `update(dt)` 內 `while (acc >= 1/30)` | 兩邊都是「最多補 5 tick，超出丟棄」 |

### Graphics 的坐標翻轉

`layout.ts` 给的是 750×1334、左上原點、y 向下；Cocos UI 是中心原點、y 向上：

```ts
const x = sx - 375;       // DESIGN_W / 2
const y = 667 - sy;       // DESIGN_H / 2
```

矩形要給**左下角**：

```ts
g.rect(sx - 375, 667 - sy - h, w, h);
```

`BattleRoot.fillScreenRect()` 已經封裝了這件事，新增繪製時複用它，不要直接混用兩套坐標。

## HUD 現狀

- 頂部：我軍/敵軍兵力、戰鬥計時（`Label`），下方四條兵力/HP 條（`Graphics`）。
- 底部：主將名/等級/武力/智力/HP/MP/技能列表（`Label`）。
- 尚未做：技能按鈕點擊、突擊/撤退、開始/結算面板、安全區適配。
  這些在 Canvas2D 預覽裡已經有完整交互，Cocos 版等 UI 圖出來後再接。

## 已知限制（必須看）

- **沒有 Cocos 實機驗證**：本機未安裝 Creator，`BattleRoot.ts` 只經過人工 API 核對，
  沒有在編輯器/真機跑過。第一次打開若報 API 差異，優先看 `Graphics.close/ellipse`、
  `Label.Overflow`、`resources.load` 這三處。
- **沒有真機幀率**：100 兵 + 每幀 `Graphics.clear()` 重畫，在低端機可能偏貴。
  正式版應改成「只在 tick 變化時重畫」+ 單位換 `Sprite` 合批；見
  `project/11_客戶端工程與視圖層.md` 的性能小節。
- **沒有音效/字體/圖集**：`assets/` 裡沒有美術資源，HUD 用系統字。
- **core 的 heal fx 坐標是壞的**（`x` 填了 HP）：Canvas2D 已特判到主將腳下；
  Cocos 版先跳過 heal 圈，等 core 修或 view 層統一特判。
- **`things.json` 較大**（約 600KB）：小遊戲首包 4MB 預算下，正式版要按需加載/分包，
  不能全塞進 `resources`。

## 驗收清單

- [ ] Creator 3.8 能打開本目錄覆蓋後的工程，`assets/scripts` 無編譯錯誤
- [ ] 場景掛 `BattleRoot` 後能看到 14 車道網格、紅藍方塊、頂部 HUD
- [ ] 30 秒內能自然打完並顯示「勝利/敗退/平手」
- [ ] 點擊畫面能重開
- [ ] `game/` 下 `node --test tests/*.test.ts` 仍 15/15（core 未被改動）
