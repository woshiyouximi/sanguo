# 九宫皮肤接入示例（`UiSkin.ts`）

一句话：把现在 `Graphics` 手绘的框/底，换成 `makePanel` / `makeBtn` / `makeNineSlice`；坐标仍用 750×1334 设计口径，用 `placeDesign` 一次摆好。资源在 bundle `res` 的 `ui/` 下，26 张已就位，加载失败会**自动降级成 Graphics 描边**（1px `goldDim` + 深底），不会抛、不用 try/catch。

```ts
import { makePanel, makeBtn, makeNineSlice, placeDesign, SKINS } from './UiSkin';
```

## 1. `.sec` 面板：替换「fillRect 深底 + strokeRect 边框」

```ts
// 旧（CampaignRoot.ts:2540-2541 那种画法）
//   this.fillRect(g, LOG_VIEW.x, LOG_VIEW.y, LOG_VIEW.w, LOG_VIEW.h, '#0B0E13', 216);
//   this.strokeRect(g, LOG_VIEW.x, LOG_VIEW.y, LOG_VIEW.w, LOG_VIEW.h, COLORS.line, 1);

const p = makePanel(this.ui, 'frame_panel', LOG_VIEW.w, LOG_VIEW.h); // 深底 #10141A@72% + 8/8/8/8 九宫框
placeDesign(p, LOG_VIEW.x, LOG_VIEW.y, LOG_VIEW.w, LOG_VIEW.h);      // 设计坐标左上原点，内部换算成 Cocos 中心点
```

## 2. 按钮：替换「#2A2318 填充 + gold 1px 边框 + 自己造的 Label」

```ts
// 旧（CampaignRoot.ts:1938-1942 物品/势力按钮那种画法）
const btn = makeBtn(this.ui, 'plate_btn', '物 品', ITEMS_BUTTON.w, ITEMS_BUTTON.h); // 16/16/16/16 + Label(1px 深色描边 + 1px 投影)
placeDesign(btn, ITEMS_BUTTON.x, ITEMS_BUTTON.y, ITEMS_BUTTON.w, ITEMS_BUTTON.h);
btn.on(Node.EventType.TOUCH_END, () => this.openItems(), this); // Button 组件照旧不用，自己接 touch
```

按钮高度变了不用重建：`makeBtn` 的 Label 字号是 `h*0.42` 夹在 12..24，改尺寸时把 Label 的 `fontSize` 一起改（或重建）。

## 3. 格子 / 图标：`slot`、`cmd_*`、`force_XX`、`gem_gold`

```ts
const cell = makeNineSlice(this.ui, 'slot', 68, 68);   // 14/14/14/14 角括号，任意尺寸都不糊
const icon = makeNineSlice(cell, 'force_07', 32, 32);  // 图标走 SIMPLE，按 32×32 直接缩放
placeDesign(cell, x, y, 68, 68);
```

## 4. 分隔线：`bar_div` 横拉（**不要**改成 TILED）

```ts
const line = makeNineSlice(this.ui, 'bar_div', 690, 11); // 0 insets = 整图横向拉伸，与 web 的 100% 11px 一致
placeDesign(line, 30, y, 690, 11);
```

`sep` 是 `tile:true`（web `repeat-x`），但它只有 12px 高：节点高度不正好 12 时引擎会把整格压扁，做细线请优先用 `bar_div`。

## 5. 改尺寸 / 判断有没有这张图

```ts
node.getComponent(UITransform)!.setContentSize(320, 120); // SLICED 会自己重算九块 UV，角不会被拉变形
if (!SKINS['plate_btn']) { /* 表里没有 → 用 Graphics 兜底 */ }
```

## key 对照

| 用途 | key | insets（上右下左） |
|---|---|---|
| 大面板 / 弹窗 / .sec 区块 | `frame_panel` | 8, 8, 8, 8 |
| 标准按钮（宽扁） | `plate_btn` | 16, 16, 16, 16 |
| 小方牌 / 页签 | `plate_sq` | 12, 12, 12, 12 |
| 选中态外框（红金） | `plate_sel` | 12, 12, 12, 12 |
| 分隔细线（横拉） | `bar_div` / `sep` | 0, 0, 0, 0 |
| 格子 / 兵符位 | `slot` / `cmd_on` / `cmd_off` / `port` / `msg` / `slot_off` | 14 / 16 / 14 / 14 / 10 / 8 |
| 金币图标 / 13 兵种兵符 | `gem_gold` / `force_01..13` | 0, 0, 0, 0（SIMPLE） |

全部 26 条见 `SKINS` 表，或在 `?skinlab=1` 的 SkinLab 页里按原尺寸 + 拉伸 + 各档尺寸对照。
