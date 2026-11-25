# CampaignRoot.ts 入口改動登記（w4-cocos-items）

改動時間：2026-11-25 05:0x（本 agent 會話）
改動者：w4-cocos-items（擁有 `ItemsPanel.ts` / `ItemsModel.ts` / `Portrait.ts`）

## 為什麼要動 CampaignRoot.ts

任務書要求物品頁「由 `CityPanel.ts` 或 `CampaignRoot.ts` 實例化（誰先落地就掛誰）」。
實測 `game/cocos/assets/scripts/CityPanel.ts` **不存在**（w3-cocos-city 尚未落盤），所以掛
`CampaignRoot.ts`。

## 只加三處，不動任何既有邏輯

1. `import { ItemsPanel } from './ItemsPanel';`（文件頭 import 區）
2. 頭部右側加一個「物 品」按鈕：
   - 新欄位 `private itemsPanel: ItemsPanel | null = null;`
   - 新欄位 `private labelItems: Label | null = null;`（`onLoad()` 裡 makeLabel 一行）
   - 新常量 `const ITEMS_BUTTON = { x: 560, y: 64, w: 176, h: 52 };`（文件頭常量區）
   - `labelStats` 寬度 700 → 516（給按鈕讓位；統計字串實測不到 300px）
   - `drawFrame()` 末尾補 `fillRect/strokeRect` 畫按鈕底
   - `onTouch()` **第一行**加 `if (this.itemsPanel?.isOpen) return;`，並在 `actionRects` 迴圈前
     加按鈕命中 → `this.openItems()`
3. 新方法 `private openItems(): void`（面板創建/複用 + 灌 data）

## 契約

- 除上述三處，`CampaignRoot.ts` 其餘內容一行不改。
- 面板關閉時的回調只呼叫 `this.refresh()`，不碰任何共享狀態。
- 物品存檔走獨立 key `sanguo_items_v1`（與 web `items.html` 同 key），不寫 `sanguo_campaign_v1`。

## 怎麼改成掛內政頁（給 w3-cocos-city / lead）

`CityPanel.ts` 落地後，把上面第 2/3 條整體搬過去即可：

```ts
// CityPanel.ts
import { ItemsPanel } from './ItemsPanel';

private itemsPanel: ItemsPanel | null = null;

private openItems(): void {
  if (!this.data) return;
  const panel = this.itemsPanel?.isValid ? this.itemsPanel : ItemsPanel.show(this.node, { onClose: () => this.refresh() });
  this.itemsPanel = panel;
  panel.open(this.data.generals, this.data.items, GameState.loadSave().owned ?? []);
}

// 內政頁的「物品」按鈕命中處：
this.openItems();
// 並在 CityPanel 自己的 onTouch 第一行加：if (this.itemsPanel?.isOpen) return;
```

同時刪掉 `CampaignRoot.ts` 的 `labelItems` / `ITEMS_BUTTON` / `openItems()` 三項與 `onTouch` 的兩行
判斷即可（`ItemsPanel` 本身不用改）。

---

## 追加：`CityPanel.ts` 已落盤 → 內政頁「物品」按鈕也接上了（2026-11-25 05:1x）

改動時 `CityPanel.ts` 已存在（39949 B，w3-cocos-city 落盤），且 `CampaignRoot.onTouch` 已引用
`this.cityPanel?.isOpen()`。所以按任務書「有就掛內政頁」把它接進內政頁，**同時保留**大地圖頭部的
「物 品」入口（兩條路都進同一個面板實例，不衝突）。

只加五處，全部是新增行、不動既有邏輯：

1. `CityPanel.ts:43` 後加 `import { ItemsPanel } from './ItemsPanel';`
2. 欄位區（`private built = false;` 之後）加 `private itemsPanel: ItemsPanel | null = null;`
3. `cmdItems()` 開頭：資料齊全時 `ItemsPanel.show(this.node, { onClose: ... })` + `open(opts.data.generals, opts.data.items, save.owned)` 然後 `return`；資料缺失才退回原本的背包 `openSheet()`。
4. `hide()`：`this.closeSheet();` 之後加 `if (this.itemsPanel?.isOpen) this.itemsPanel.close();`
   —— 不然內政頁一隱藏，掛在它下面的物品頁節點雖然 `active=false`，但 `input` 監聽還掛著，會吃掉大地圖的點擊。
5. `onTouch()` 第一行（`if (!this.opened) return;` 之後）加 `if (this.itemsPanel?.isOpen) return;`
   —— 防穿透：內政頁指令格在 y 478–790，物品列表在 y 456–1100，兩者重疊；不擋的話點一行物品會同時
   觸發徵兵/搜索之類的內政指令。

面板掛在 `this.node`（內政頁節點）底下，所以天生蓋在內政頁之上、跟著內政頁一起顯隱；`ItemsPanel`
本身不用改。`CampaignRoot.ts` 的入口保留（不刪），等 lead 決定要不要收成單一入口。

