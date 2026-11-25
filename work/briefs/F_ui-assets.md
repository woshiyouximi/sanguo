# F · 原作 UI 图元接 deploy / items

目标：把**原作** UI 图元接进 `deploy.html`（出战配置）与 `items.html`（道具），替掉现在 CSS 画的木框/按钮。
（原 8 个 agent 已占满，本简报在 slot 释放后立刻派工。）

## 素材（原图已解码，就是你该用的）
- `F:\sanguo\export\png\SHAPE\MENU\` 166 个：`BUTTON01.png`/`BUTTON01A`/`BUTTON01B`（68×30）、`BUTTON02A/B`、`BUTTON03A…`，另有框架/卷轴类 —— 先全部列出、用 read_image 抽查，别猜。
- `F:\sanguo\export\png\SHAPE\JEWEL\` 57 个：`BOOK01..`、卷轴类 → 道具/技能图标或装饰。
- 现成 AI 版对照：`game/web/assets/bg/env/ui_*.png`（13 个）。

## 规矩
- **只改** `game/web/deploy.html`、`game/web/items.html`；新增资源放 `game/web/assets/ui/orig/`；截图放 `work\ui_orig\`；报告 `F:\sanguo\project\54_原作UI素材.md`。
- 不许动 `game/src/**`、`game/web/main.js`、`campaign.html`、`city.html`、`city_model.js`、`saves.js`（其他 agent 在改）。
- 不许改被 JS 引用的 `id`/`class`/`data-*` 名、不许改 JS 逻辑、不许改表单字段名 —— 只改 CSS 与纯装饰 DOM。deploy→开战、items 筛选/使用按钮的流程必须与现在完全一致。
- 像素画放大必须 `image-rendering: pixelated`；九宫格用 CSS `border-image`（报告里给 slice 值）。
- 新增素材总量 ≤ 1.5 MB。

## 交付
1. 两页在 750×1334 与 1200×900 各 before/after：`work\ui_orig\{deploy,items}_{before,after}{,_wide}.png`（截图用 `Start-Process -FilePath $edge -ArgumentList $a -Wait`，直接 `& $edge` 会静默不出图）。
2. 图元对照拼图 `work\ui_orig\used_contact.png`。
3. 无需跑 tsc；但要确认页面无 JS 报错、内容完整渲染。
4. 报告写：每个图元 → 用在哪 → slice 值 → 为什么选它；找不到合适原图的部位写"保留 CSS"。
