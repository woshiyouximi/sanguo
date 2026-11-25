# 124 — 九宫皮肤 + 文字层级接进四页 UI（Cocos 3.8.8）

> 目标：把已交付的 `UiSkin.ts`（26 条九宫规格）与四级文字层级接进大地图 / 内政 / 物品 / 出征编成四页，让观感追平 web 版。
> 边界：只改 `CampaignRoot.ts` / `CityPanel.ts` / `ItemsPanel.ts` / `DeployRoot.ts`，新建 `TextRole.ts`、`work\cocos_skinapply\**`、本报告；**矩形一个没动、回调一个没动、素材一张没加**。

## 0. 结果摘要

| 项 | 结果 |
|---|---|
| `tsc -p tsconfig.check.json --noEmit` | **EXIT=0** |
| `node work\cocos_skinapply\skin_nodes_assert.mjs`（我写） | **107/107 通过**，EXIT=0 |
| `node work\cocos_monarch84\layout_guard.mjs` | ✓ 0 失败（region `CampaignRoot.ts:162–409`，60 城 / 出界 0 / 重叠 0 对） |
| `node work\cocos_monarch84\hud_layout.mjs` | ✓ 10/10（0 出界 / 0 相交） |
| `node work\cocos_layout\assert_layout.mjs` | **未能复验**：CDP 页面 `http://127.0.0.1:5174/cocos_layout/cocos-build/web-mobile/index.html?v=5` 是旧产物，`window.__comp is not a function`；按任务书用节点/静态断言替代（见 §7） |
| 九宫节点（静态声明 / 运行期） | A 8 / 8、B 15 / 15、C 30 / 30、D 10 / 56 |
| 新增素材 | 0（26 张 PNG 原样，只加代码） |

## 1. 交付文件

| 文件 | 行数 | 变化 |
|---|---|---|
| `game\cocos\assets\scripts\TextRole.ts` | 112 | **新建** |
| `game\cocos\assets\scripts\CampaignRoot.ts` | 2728 → 2855 | +127 |
| `game\cocos\assets\scripts\CityPanel.ts` | 1349 → 1500 | +151 |
| `game\cocos\assets\scripts\ItemsPanel.ts` | 1524 → 1680 | +156 |
| `game\cocos\assets\scripts\DeployRoot.ts` | 1015 → 1203 | +188 |
| `work\cocos_skinapply\skin_nodes_assert.mjs` | 478 | **新建**（静态断言） |
| `work\cocos_skinapply\tsconfig.skin.json` | 11 | **新建**（只编译本次 5 个 .ts，用于并行任务改坏旁支文件时自证） |

## 2. 九宫 key 表

### A. 大地图 `CampaignRoot.ts`

| 节点名 | key | 矩形（设计 px） | 位置 |
|---|---|---|---|
| `SkinLogFrame` | `frame_panel` | `{16,842,718,298}` | `CampaignRoot.ts:920`（表 :919–924） |
| `SkinHintFrame` | `frame_panel` | `{25,1260,700,70}` | `CampaignRoot.ts:921` |
| `SkinForcesPlate` | `plate_btn` | `{384,14,160,52}` | `CampaignRoot.ts:922` |
| `SkinItemsPlate` | `plate_btn` | `{560,14,176,52}` | `CampaignRoot.ts:923` |
| `SkinActionPlate_0..3` | `plate_btn` | 随 `actionRects` 现算（`{x,1152,w,96}`） | `CampaignRoot.ts:1157`（buildSkin）、`:1191`（layoutActionPlates） |

- 戰報卡矩形 = `logRect()` 的 `LOG_VIEW`；提示条矩形 = `consoleRects().hint`；两颗顶栏按钮 = `FORCES_BUTTON` / `ITEMS_BUTTON`；月令按钮 = `drawActions()` 里的 `rect`。**全部是既有常量，没有新坐标**。
- 兄弟序：`buildSkin()` 在 `this.gUi = this.makeGraphics('CampaignUi')` 之后调用（`:1033`），早于所有 Label（含 `buildLogLabels()`），所以底板永远在字下面；月令底板在 `drawActions()` 末尾重摆（`:2294`）。

### B. 内政 `CityPanel.ts`

| 节点名 | key | 矩形 | 位置 |
|---|---|---|---|
| `SkinHudFrame` | `frame_panel` | `R_HUD {18,126,714,206}` | `CityPanel.ts:219`（表 :218–224） |
| `SkinCmdFrame` | `frame_panel` | `R_CMD {18,344,714,396}` | `CityPanel.ts:220` |
| `SkinLogFrame` | `frame_panel` | `R_LOG {18,880,714,348}` | `CityPanel.ts:221` |
| `SkinHintFrame` | `frame_panel` | `R_HINT {18,1240,714,80}` | `CityPanel.ts:222` |
| `SkinBackPlate` | `plate_btn` | `R_BACK {18,26,104,64}` | `CityPanel.ts:223` |
| `SkinCmdPlate_0..8` | `plate_btn` | `cmdRects[i]`（`CMD_W 230 × CMD_H 104`） | `CityPanel.ts:452`（addCommandPlate，`:366` 调用） |
| `SkinCmdSelected` | `plate_sel` | 摆到最近执行的那颗 `cmdRects[i]` | `CityPanel.ts:469`（markCommandPlate） |

### C. 物品 `ItemsPanel.ts`

| 节点名 | key | 矩形（取 `LAYOUT`） | 位置 |
|---|---|---|---|
| `SkinGenFrame` | `frame_panel` | `gen {18,96,714,302}` | `ItemsPanel.ts:382`（表 :381–390） |
| `SkinListFrame` | `frame_panel` | `list {18,406,430,736}` | `ItemsPanel.ts:383` |
| `SkinDetFrame` | `frame_panel` | `det {460,406,272,736}` | `ItemsPanel.ts:384` |
| `SkinPortraitPlate` | `plate_sq` | `portrait {34,108,72,92}` | `ItemsPanel.ts:385` |
| `SkinBigFrame` | `plate_sq` | `bigFrame {533,414,126,126}` | `ItemsPanel.ts:386` |
| `SkinActPlate` | `plate_btn` | `actBtn {18,1152,400,76}` | `ItemsPanel.ts:387` |
| `SkinUnlockPlate` | `plate_btn` | `unlockBtn {430,1152,146,76}` | `ItemsPanel.ts:388` |
| `SkinBackPlate` | `plate_btn` | `backBtn {588,1152,144,76}` | `ItemsPanel.ts:389` |
| `SkinTabPlate_0..6` | `plate_btn` | `tabRect(i) {56,34}` | `ItemsPanel.ts:539` |
| `SkinPickPlate_0..11` | `plate_sq` | `pickRect(i) {107,54}` | `ItemsPanel.ts:531` |
| `SkinNavPrevPlate` / `SkinNavNextPlate` | `plate_btn` | `navRect(0)` / `navRect(2)` | `ItemsPanel.ts:561`,`:562` |
| `SkinRowSelected` | `plate_sel` | 选中行 `row {414,56}` | `ItemsPanel.ts:625` |

### D. 出征编成 `DeployRoot.ts`

| 节点名 | key | 矩形 | 位置 |
|---|---|---|---|
| `SkinCardMain` | `frame_panel` | `{16,136,718,166}` | `DeployRoot.ts:98`（表 :97–104） |
| `SkinCardGen` | `frame_panel` | `{16,336,718,128}` | `DeployRoot.ts:99` |
| `SkinCardTroop` | `frame_panel` | `{16,500,718,188}` | `DeployRoot.ts:100` |
| `SkinCardForm` | `frame_panel` | `{16,724,718,132}` | `DeployRoot.ts:101` |
| `SkinCardWise` | `frame_panel` | `{16,884,718,116}` | `DeployRoot.ts:102` |
| `SkinCardPower` | `frame_panel` | `{16,1040,718,120}` | `DeployRoot.ts:103` |
| `SkinPortraitPlate` | `plate_sq` | `{24,150,120,150}` | `DeployRoot.ts:108`（表 :107–111） |
| `SkinBackPlate` | `plate_btn` | `{24,1210,330,84}` | `DeployRoot.ts:109` |
| `SkinGoPlate` | `plate_btn` | `{396,1210,330,84}` | `DeployRoot.ts:110` |
| `SkinSliderTrack` | `bar_div`（横拉，**不用 TILED**） | `{24,1058,702,8}` = `SLIDER_X0, SLIDER_Y-4, SLIDER_X1-SLIDER_X0, 8` | `DeployRoot.ts:522` |
| `SkinGenPlate_0..11` | `plate_sq` | `GEN_X+(i%6)*112, GEN_Y+floor(i/6)*60, 104×52` | `DeployRoot.ts:527` |
| `SkinTroopPlate_0..12` | `plate_sq` | `TROOP_X+(i%5)*138, TROOP_Y+floor(i/5)*60, 130×52` | `DeployRoot.ts:532` |
| `SkinFormPlate_0..8` | `plate_sq` | `TROOP_X+(i%5)*138, FORM_Y+floor(i/5)*60, 130×52` | `DeployRoot.ts:537` |
| `SkinWisePlate_0..7` | `plate_sq` | `WISE_X+(i%4)*177, WISE_Y+floor(i/4)*52, 169×44` | `DeployRoot.ts:542` |
| `SkinGenSelected` / `SkinTroopSelected` / `SkinFormSelected` / `SkinWiseSelected` | `plate_sel` | 随选中格摆动 | `DeployRoot.ts:547–550` |

> 格子底板的位置公式与 `drawGenGrid/drawGrid/drawWise` **逐字相同**（`X+(i%cols)*(w+8)`、`Y+floor(i/cols)*(h+8)`），所以底板永远压在原来那块 Graphics 填充正上方，不会错位。空格（`lockedTroops/lockedForms`、`troopNames.length` 未满池）由 `syncCellPlates()` 隐藏（`:563`）。

## 3. 文字层级（role）表

`TEXT_ROLES` 在 `TextRole.ts:43–48`，逐字如下：

| role | fontSize | outline | shadow | 用途 |
|---|---|---|---|---|
| `title` | **40** | 2px `#06080C` | 有，`(0,-2)` blur 2 `#000000` | 结算「大勝」、页标题 |
| `head` | **22** | 1px `#06080C` | 有，`(0,-1)` blur 1 | 卡片标题、区块名 |
| `body` | **18** | 1px `#06080C` | 无 | 正文、说明 |
| `num` | **20** | 1px `#06080C` | 无 | 数值（深底上透得出） |

`applyTextRole(label, role, fontSize?)`（`TextRole.ts:76`）：
- `fontSize` 是**版式豁免**——传了就只换描边/阴影策略，不动字号（城名 14px 被 `CITY_LABEL_FONT` 锁死、命令副标题 14px…）；
- 行高按该 Label **原有比例**换算（1.35/1.42/1.45 各自保留），多行「標題\n說明」不会被挤开；
- **绝不改 `label.color`**：城名/君主名是按势力色板逐条染色的（`cityTintOf()`），role 只管字号/描边/阴影；
- 空 Label / 已销毁 Label 直接返回。

### 3.1 每页分配

**A 大地图**（`CampaignRoot.ts:1211–1236`）

| 元素 | role | 字号 | 行 |
|---|---|---|---|
| 页标题「大 地 圖」 | `title` | 32（40 降级，见 §8） | `:1213` |
| 君主行 | `body` | 18 | `:1215` |
| 势力/战果行 | `body` | 18 | `:1216` |
| 月令 | `num` | 20 | `:1217` |
| 顶栏「物 品」/「勢 力」 | `num` | 20 | `:1219`,`:1220` |
| 提示条 | `body` | 15 | `:1223` |
| 战报标题 | `head` | 18 | `:1227` |
| 战报空态 | `body` | 13 | `:1230` |
| 8×时间列 / 8×正文 | `body` | 12 / 13 | 同 `applyRoles()` |
| 4×月令按钮 | `num` | 20 | 同 |
| 图例 3 点 | `body` | 12 | 同 |
| 60 城名 | `body` | 14（`CITY_LABEL_FONT`） | `:1951` |

城名那条同时满足任务书「加 1px 深色描边」：`body` 自带 1px `#06080C`，原来的 `addOutline(label, Color(6,8,12,240), 1)` 已删（重复且色值不同）。

**B 内政**（`CityPanel.ts:490–521`）

| 元素 | role | 字号 | 行 |
|---|---|---|---|
| 页标题 | `title` | 34（`FONT.title`） | `:493` |
| 返回 | `num` | 22 | `:494` |
| 月份 | `num` | 20 | `:495` |
| 24×资讯卡名称 | `body` | 16 | `:498` |
| 24×资讯卡数值 | `num` | 20 | `:499` |
| 「內政命令」标题 | `head` | 22 | `:502` |
| 9×命令主标题 | `head` | 22 | `:503` |
| 9×命令副标题 | `body` | 16 | `:504` |
| 紀錄标题 / 状态 | `head` 22 / `num` 15 | | `:507`,`:508` |
| 5×紀錄行 | `body` | 18 | `:509` |
| 提示条 | `body` | 16 | `:512` |
| 抽屉标题 / 6 行 | `head` 20 / `body` 17 | | `:513`,`:514` |

**C 物品**（`ItemsPanel.ts:663–705`）

| 元素 | role | 字号 |
|---|---|---|
| 页标题 | `title` | 32 |
| 副标题 | `body` | 14 |
| 武将名 | `head` | 22 |
| 武将属性 / 城市 | `num` 16 / `body` 13 | |
| 4 槽名/值 | `body` 13 / `num` 15 | |
| 12 武将格名 | `body` | 11 |
| 7 分页签 | `num` | 14 |
| 6 组头 | `head` | 13 |
| 11 行名/说明/数值 | `body` 15 / `body` 11 / `num` 10 | |
| 上/页码/下 | `num` | 13 / 12 / 13 |
| 详情名 | `head` | 20 |
| 类型/脚注 | `body` | 11 |
| 「加 成」 | `head` | 13 |
| 10 加成名 / 值 | `body` 11 / `num` 13 | |
| 描述 / 预览 / 字段名 | `body` | 11 / 11 / 10 |
| 字段值 | `num` | 11 |
| 底栏主按钮 / 副 / 解锁主 / 副 / 返回 | `head` 22 / `body` 12 / `num` 15 / `body` 11 / `num` 16 | |
| 提示 / Toast | `body` 11 / `head` 15 | |

**D 编成**（`DeployRoot.ts:606–624`）

| 元素 | role | 字号 |
|---|---|---|
| 页标题 | `title` | 32 |
| 目标行 | `body` | 18 |
| 主将名 | `head` | 24 |
| 主将属性 | `num` | 18 |
| 军师技 | `body` | 17 |
| 情报 | `body` | 16 |
| `100 / 100` | `num` | 20 |
| 提示 | `body` | 15 |
| 12 武将格 / 13 兵种 / 9 阵形 / 8 军师技 | `body` | 16 / 16 / 16 / 15 |
| 未學 角标 | `body` | 12 |
| 3 快捷 | `num` | 17 |
| 2 底栏按钮 | `head` | 18 |

## 4. 逐页改动清单（file:line）

### A `CampaignRoot.ts`
- `:47` `import { applyTextRole, applyTextRoles } from './TextRole';`
- `:49` `import { makeNineSlice, placeDesign } from './UiSkin';`
- `:913–927` `SkinSlot` + `SKIN_SLOTS`（4 条）+ `ACTION_SKIN_SLOTS = 4` —— 在 `// #endregion`（`:409` 那条）之后、`@ccclass` 之前，**没进版式纯函数区**
- `:968–971` 字段 `skinLayer` / `skinNodes` / `skinActionPlates`
- `:1033` onLoad 里 `this.buildSkin();`（gUi 之后）
- `:1084` onLoad 末尾 `this.applyRoles();`
- `:1157` `buildSkin()`、`:1184` `skinPlace()`、`:1191` `layoutActionPlates()`、`:1211` `applyRoles()`
- `:1951` `buildCityLabels()` 里城名 `applyTextRole(label, 'body', CITY_LABEL_FONT)`
- `:2294` `drawActions()` 末尾 `this.layoutActionPlates();`

### B `CityPanel.ts`
- `:47`,`:50` imports
- `:212–224` `SkinSlot` + `SKIN_SLOTS`（5 条）
- `:285–290` 字段 `skinLayer` / `skinNodes` / `cmdPlates` / `cmdSel`
- `:322` `ensureBuilt()` 里 `this.buildSkin();`（gMain 之后）
- `:366` 9 颗按钮循环里 `this.addCommandPlate(rect);`
- `:412` `ensureBuilt()` 末尾 `this.applyRoles();`
- `:426` `buildSkin()`、`:452` `addCommandPlate()`、`:469` `markCommandPlate()`、`:490` `applyRoles()`
- `:1138` `runCommand()` 里 `this.markCommandPlate(index);`（`monthLocked` 早退之后，纯外观）

### C `ItemsPanel.ts`
- `:71`,`:72` imports
- `:375–390` `SkinSlot` + `SKIN_SLOTS`（8 条，rect 全取 `LAYOUT`）
- `:460–463` 字段
- `:515` `build()` 里 `this.buildSkin();`（`this.g = makeGraphics('ItemsFrame')` 之后）
- `:531` 12 武将格底板、`:539` 7 分页签底板、`:561–562` 上/下页底板
- `:591` `build()` 末尾 `this.applyRoles();`
- `:607` `buildSkin()`、`:625` 选中行 `plate_sel`、`:632` `addPlate()`、`:643` `placeRowSelection()`、`:663` `applyRoles()`
- `:1588` `drawFrame()` 里 `this.placeRowSelection(selRect);`

### D `DeployRoot.ts`
- `:50`,`:51` imports
- `:90–117` `SkinSlot` + `SECTION_CARDS`（6）+ `FIXED_PLATES`（3）+ 池常量（12/13/9/8）
- `:252–262` 字段
- `:270` onLoad 里 `this.buildSkin();`（gUi 之后）
- `:320` onLoad 末尾 `this.applyRoles();`
- `:504` `buildSkin()`、`:522` `bar_div` 轨道、`:527/532/537/542` 四类格子底板、`:547–550` 四块选中层
- `:554` `addPlateOn()`、`:563` `syncCellPlates()`、`:576` `placeSelection()`、`:591` `placeSelections()`、`:606` `applyRoles()`
- `:846–847` `draw()` 末尾 `this.syncCellPlates(); this.placeSelections();`

## 5. 硬约束执行记录

**矩形一个没动**（只读引用，没有重新赋值）：
- A：`MAP_VIEW {0,130,750,700}`、`CONSOLE_TOP 830`、`LOG_VIEW {16,842,718,298}`、`BUTTON_Y 1152`、`BUTTON_H 96`、`ITEMS_BUTTON`/`FORCES_BUTTON`/`MONARCH_HIT` 全部原样；`consoleRects()`/`logRect()`/`mapRect()` 签名与返回形状未变（`assert_layout.mjs` 依赖）。
- B：`R_HUD/R_CMD/R_LOG/R_HINT/R_BACK/...` 与 `vAlpha = artReady ? 226 : 255`（`:860`）原样；`layoutRects`（`:394`）仍由这四个常量派生。
- C：`export const LAYOUT` 一字未改（含 `statCol [{464,638,126},{602,638,126}]`、「加成」两列对齐依赖它）；`statNameRect()/statValRect(i)` 签名未变。
- D：`GEN_X/GEN_Y/GEN_W/GEN_H`、`TROOP_X/TROOP_Y/CELL_W/CELL_H/FORM_Y`、`WISE_X/WISE_Y/WISE_W/WISE_H`、`SLIDER_X0/X1/Y`、`QUICK_Y`、`{24,1210,330,84}/{396,1210,330,84}` 全部原样。

**逻辑零改动**：`drawActions`/`drawGenGrid`/`drawGrid`/`drawWise`/`drawSlider`/`drawQuick`/`drawFooter`/`onTouch`/`hitSlot`/`march`/`runCommand` 的分支、命中矩形、回调全部原样。新增的只有「摆底板」（`layoutActionPlates`/`markCommandPlate`/`placeRowSelection`/`syncCellPlates`/`placeSelections`）与「套 role」，都不返回值、不写游戏状态。

**版式纯函数区没碰**：`CampaignRoot.ts:162–409`（`#region 版式纯函数`…第一个 `#endregion`）字节级未动，`layout_guard.mjs` 抽出来的仍是 246 行；`SKIN_SLOTS` 那两块（`:913`、`:919`）在 `:409` 的 `#endregion` 之后。

**素材没加**：`assets\bundles\res\ui\` 26 张 PNG 一张没改没加；主包 2.14 MB / 分包 17.21 MB / 合计 19.35 MB 不变（只有 .ts 体积变化，编译进主包可忽略）。

## 6. 降级路径验证

**机制**：`UiSkin.makeNineSlice()` 在 `SpriteFrame` 未到 / `resources.load` 失败时调 `drawFallback()`，画 `#10141A` alpha 184 底 + `COLORS.goldDim` 1px 描边，**不抛异常、不 return null**。所以九宫节点永远是「有可见反馈的节点」。

**本次接线为什么走得到降级**：
1. 四页的 `buildSkin()` 都在 `onLoad`/`ensureBuilt()`/`build()` 里**无条件调用**，不看 `artReady`/`loaded`/`artMap.ready`；
2. `buildSkin()` 里没有任何 `try/catch`、没有 `return`，全部走 `makeNineSlice`；
3. 层级顺序保证降级描边也在文字下面（skin 层建在 Label 之前）。

**静态证据**（`skin_nodes_assert.mjs` 里 10 条，每页 2 条）：
- `UiSkin.makeNineSlice 有 drawFallback` / `drawFallback 在 makeNineSlice 内被调用（加载失败不崩）`
- `CampaignRoot.ts 的 buildSkin 不依赖底圖是否加載` + `都 import 了 makeNineSlice + placeDesign`（CityPanel / ItemsPanel / DeployRoot 同）

**人工复验方法**（我没构建，未实机跑）：
1. 把 `UiSkin.ts` 的 `SKIN_DIR` 由 `'ui'` 改成 `'ui_missing'`（或让 `loadSkinFrame` 直接 `cb(null)`）；
2. 重新打开四页 → 应看到每处底板变成「深底 + 金灰细框」的空框，文字/按钮/命中区照旧、控制台无红错；
3. 改回 `'ui'`。

## 7. 断言与实测数字

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit     → EXIT=0
node ..\..\work\cocos_skinapply\skin_nodes_assert.mjs                        → 107/107 通過，EXIT=0
node ..\..\work\cocos_monarch84\layout_guard.mjs                             → ✓ 0 失敗，EXIT=0
node ..\..\work\cocos_monarch84\hud_layout.mjs                               → ✓ 10/10，EXIT=0
```

- `skin_nodes_assert.mjs` 输出：`九宮 key：A 8 / B 15 / C 30 / D 10（靜態）；TextRole 4 級、降級 5 項` / `斷言：107/107 通過` / `全部通過 ✓`。它按页断言了每个 key 的 **name + key + rect 逐条相等**（A 8 / B 15 / C 30 / D 10 条）、D 页六卡互不重叠且全在 750×1334 内、TextRole 四级参数逐项、四页 buildSkin 的降级性。
- `layout_guard.mjs`：`region：CampaignRoot.ts:162–409（246 行）` / `標籤：60 城 / 出界 0 / 重疊 0 對` / `✓ 版式純函數區契約完好（仍可獨立 import，四個導出答案不變）`。
- `hud_layout.mjs`：10 条全 ✓，含「勢力/物品按钮间距 16px — 16px」「物品按钮右边界 14px — 14px」「标题与勢力按钮 ≥20px — 29px」「君主名左边界 = 命中区左界 +6px — 24」「按钮底边在第二列字身之上 — 66 < 80.0」。页头 4 个 `makeLabel` 调用的字面量（32 / 17 / 19 / 16）一个字没改。
- `assert_layout.mjs`：EXIT=2，`TypeError: window.__comp is not a function`。CDP 9333 上只有 `http://127.0.0.1:5174/cocos_layout/cocos-build/web-mobile/index.html?v=5`（旧的 layout 构建产物，没有 `window.__comp` 调试钩子），**不含本次改动**。按任务书「若产物里没有你的改动，用节点树断言替代」→ 已用 §7 的静态断言（107 条）替代；lead 重建 `work/cocos_layout/cocos-build` 后应能直接跑 15/15。

## 8. [推测]

- **D 页六张卡片矩形是推的**：源码里没有「分区卡片」矩形（只有散点坐标），我按各分区内容外接框 +8px 呼吸量推成 `{16,136,718,166}` 等六条；数值在 `DeployRoot.ts:97–104`，要调只改这六行。
- **页标题 32 而非 40**（任务书允许「可降到 32 保持版式」）：124 高的页头 band + `hud_layout` 锁死的 `cx/cy/w` 装不下 40px 字身（40px 会 y20..60，与按钮仍有 4px 但视觉上压到金线）。
- **君主/势力行取 18**：`hud_layout` 允许到 18（y79..97 仍在 `MONARCH_HIT 78..112` 内、与按钮 14..66 不交），再大就撞「按钮底边在第二列字身之上」那条断言。
- **CityPanel 按下态语义 = 「最近執行的指令」**：只绑了 `TOUCH_END`（`:675`，`registerTouch()` 在 `:673`），没有按下帧；加 `TOUCH_START` 会引入新一帧绘制与重复触发风险，故用 `plate_sel` 叠层表示「刚点过这颗」。
- **物品分页签是 7 个不是 8**：`buildTabs()` = 「全部」+ `GROUP_ORDER` 6 组；任务书写 8，按源码实现 7（断言里写死 7 并注明理由）。
- **`plate_*` 中心透明**（PNG 实测 alpha 0），所以九宫只提供边框/角饰，底色仍是原来 Graphics 的填充——观感提升来自「有框 + 有层级」，没有替换底层配色；若要进一步追平 web 版的色数比，得改 `drawFrame` 的填充色（超出本次「只叠底板」的范围）。

## 9. 没做到

1. **没有构建，不能截图验证**：本任务约定构建归 lead，我没有 Xcode/微信构建，也没有 cocos 预览进程；所有结论都是静态断言 + 代码审读，未在真机/浏览器里比对 web 版。
2. **`assert_layout.mjs` 15/15 未能在含本次改动的产物上复验**（旧产物无 `__comp`）；已按任务书用节点断言替代，待 lead 重建后请复跑确认。
3. **CityPanel 抽屉（`R_SHEET` / 6 行）没上 `frame_panel`**：`gSheet` 在 `ensureBuilt()` 末尾才建（在 skin 层之后），九宫会被它整块盖住；要上得把 skin 层挪到 `gSheet` 之后、或给抽屉单开一层，属于改绘制顺序，超出「只叠底板」范围。当前抽屉仍只有原 Graphics 底板。
4. **「按下态」不是真按下帧**：`plate_btn` 中心透明，换色只染边框；用 `plate_sel` 叠层表达「最近执行」，不是按压反馈。
5. **未复测观感指标**：审计里的「色数比 web 少 14.5%–48.8%」「暗带多 1.6–4.0 倍」没有重新采样对比（需要渲染帧，我没有构建）。
6. **`ItemsPanel` 的 8 个分页签任务条目**按源码实现为 7（见 §8），如确需第 8 个，得先加 `TabKey`（会动模型层，不在我可改范围）。
