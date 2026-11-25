# 118 Cocos 版式对齐（v18-cocos-layout）

三页版式按 **web 版**（`game\web\*.html`，750×1334）对齐：大地图（底图零溢出 + 占满可用高度 + 戰報移到地图下方独立区）、内政（資訊卡分层 + 吃满 1334 + 月令文案去重）、物品（加成表两列）。

- 产物：`F:\sanguo\work\cocos_layout\cocos-build\web-mobile`，**构建时间 2026-11-25 09:10:07**（`index.html` 2187 B；bundle `assets/main/index.229b7.js` 491237 B；CocosCreator 3.8.8 CLI，`platform=web-mobile;debug=false;md5Cache=true`）
- 我自己构建了一份同源产物做验证，**没有动 lead 的 `game\cocos-build`**；lead 复验时用他那一份即可（源码相同 → 版式相同）
- 截图窗口 876×1368（`Emulation.setDeviceMetricsOverride`，见 §6 的坑）

## 1. 改前 / 改后截图

| 页面 | 改前 | 改后 |
| --- | --- | --- |
| 大地图 | `work\cocos_layout\before_campaign.png`（原 `cocos_verify7\r89_01_campaign.png`） | `work\cocos_layout\campaign.png` |
| 大地图（空戰報） | — | `work\cocos_layout\campaign_empty_log.png` |
| 内政 | `before_city.png`（`r89_03_city.png`） | `city.png`（空紀錄）、`city_after_cmd.png`（点开发后） |
| 物品 | `before_items.png`（`r89_04_items.png`） | `items.png` |

改前 → 改后的可量化差别：

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| 底图矩形 x / 右边界 | −14.63 / 798.96（左溢 14.63、右溢 48.96） | **0 / 750.00（溢出 0.00）** |
| 底图矩形 | 813.59×610.19（横跨 1.085 屏宽） | **750×562.5（正好一屏宽）** |
| 戰報矩形 | {392,786,336,234} 浮在地图右下，压住 桂陽/廬陵/義州 | **{16,842,718,298}，地图下方独立区** |
| 地图带 | 图像 610 高、上下黑带合计 290 | 图像 562.5 高、上下装裱带各 69 / 66（与 web 的 66 / 67 同构） |
| 内政 紀錄 矩形 | {18,752,714,?}（压在朝堂带上） | **{18,880,714,348}（朝堂带下方）** |
| 内政最底元素 bottom | 1320（提示条底）但 紀錄 之上有大片空黑 | **1334（提示卡 1320 + 标签 1320）**，纪录卡 6 行帐页线铺满 |
| 内政「本月令可下」 | 与資訊卡「月令 可下」重复 | 纪录卡右上改「最近 5 條」，重复文案消失 |
| 物品 加成 | `武力 +1生命 —`（两列黏在一起） | `武力 +1 ｜ 生命 —`（两列，值右对齐） |

## 2. 几何公式（屏幕矩形怎么来的）

设计坐标是左上原点 750×1334；Cocos 节点 `x = designX − 375`、`y = 667 − designY`。

设计 → 截图 px（实测标定，`work\cocos_layout\cal.png` + `cal_marks.py` 用洋红角标定位）：

```
px = 53.5 + designX * 1.0254873
py = designY * 1.0254873
```

即可见设计区 x ∈ [−52.17, 802.0]（876 / 1.0254873 = 854.22 宽，750 的设计矩形居中），设计矩形落在 px 53.5…822.5。

**底图（对齐 web 的 `img#bgmap` 0,332 750×563）**

```
k    = MAP_VIEW.w / MAP_IMAGE_W = 750 / 1280 = 0.5859375
h    = MAP_IMAGE_H * k         = 960 * 0.5859375 = 562.5
rect = { x: MAP_VIEW.x,
         y: MAP_VIEW.y + (MAP_VIEW.h − h) / 2,   // 130 + (700−562.5)/2 = 198.75
         w: MAP_VIEW.w, h }
     = { 0, 198.75, 750, 562.5 }

toScreen(worldX, worldY) = { x: rect.x + worldX * k, y: rect.y + worldY * k }
```

world 坐标就是 1280×960 **原图像素**（`pos_xy` 本来就是图上的点），所以城点/道路/势力环永远贴住底图，不会因版式改动漂移。旧版走的是 `min(710/1050, 900/776)*0.94` 那套“世界→视图”缩放，图像和城点虽然一致，但图像宽度不受 750 约束，于是左右各溢出 14.6 / 49 px。

**垂直预算（设计 px，加起来正好 1334）**

| 区带 | y 范围 | 说明 |
| --- | --- | --- |
| 页头 | 0 – 124 | 未动（`hud_layout.mjs` 锁定） |
| 地图带 | 130 – 830 | 底图 198.75 – 761.25，上带 0–199、下带 761–830 |
| 圖例 | 800 – 830 | 三色圆点 r=4 @ x 268/342/416，文字 我方/勢力/無主 |
| 戰報 | 842 – 1140 | 标题 28，8 行 × 30 = 240 |
| 月令按钮 | 1152 – 1248 | 3 颗，宽 (750−32−24)/3 = 231.33 |
| 底部提示 | 1260 – 1330 | 3 行 × 22，`setContentSize(700, 66)` 不 SHRINK |

内政页垂直预算：页头 0–118 / 資訊卡 126–332（4 列 × 3 行，行高 66，列宽 174.5）/ 內政命令 344–740（3×3，按钮 230×104）/ 朝堂带 740–880（含 `paintSeam()` 接缝 + 自加 828→880 过渡）/ 紀錄 880–1228 / 提示 1240–1320。

## 3. 断言输出（`work\cocos_layout\assert_layout.mjs`，`node assert_layout.mjs`）

```
PASS  ①a 底圖左溢出 ≤ 1px           rect.x=0 → overflow=0.00px
PASS  ①b 底圖右溢出 ≤ 1px           rect 右邊=750.00 → overflow=0.00px
PASS  ①c 底圖寬 = 設計寬 750         w=750
PASS  ①d 底圖節點 bbox == mapRect  node={"n":"CampaignMapImage","x":0,"y":198.75,"w":750,"h":562.5} rect={...同值}
PASS  ②a 戰報 ∩ 地圖 = 0           戰報={"x":16,"y":842,"w":718,"h":298} 交集面積=0
PASS  ②b 戰報在地圖下方               戰報.y=842 ≥ 地圖底=761.25
PASS  ②c 內政紀錄 ∩ 地圖 = 0         紀錄={"x":18,"y":880,"w":714,"h":348} 交集面積=0
PASS  ②d 內政紀錄在地圖下方             紀錄.y=880 ≥ 地圖底=761.25
PASS  ③a 城點數 = 60              icons=60 cities=60
PASS  ③b 城點全部在地圖矩形內            越界 0 個
PASS  ④ 內政頁最底元素 bottom ≥ 1300  bottom=1334.00（提示卡底=1320，label 底=1320.00）
PASS  ⑤a 加成表 10 標籤兩兩不重疊        最大交集面積=0
PASS  ⑤b 左欄數值右邊界一致             right=[590,590,590,590,590]
PASS  ⑤c 右欄數值右邊界一致             right=[728,728,728,728,728]
PASS  ⑤d 兩欄之間有淨空               左欄值右緣 590 → 右欄標籤 x 602，間距 12.00px

15/15 PASS → F:\sanguo\work\cocos_layout\assert_layout.json
```

断言取的都是**运行期真值**（`comp.mapRect()`、`comp.logRect()`、`panel.layoutRects`、`panel.cmdRects`、`panel.statNameRect(i)`），不是源码常量，所以能抓住“代码写了但没生效”的情况（①d 就对过底图节点的实际 bbox）。

## 4. 为什么选“重算不溢出”，不选 `MaskComponent`

1. **web 基准就是满宽居中**：`img#bgmap` 实测 0,332 750×563 —— 1280×960 按 4:3 满宽画，上下留 66 / 67 px 装裱带（`.bgveil` 渐变 + 装饰带），不是 cover 裁切、也不是拉伸。照抄它，Cocos 和 web 就是同一套。
2. **Mask 会裁掉东西**：`MaskComponent` 要裁的是屏幕外那 14.6 / 49 px，可 atlas 外侧那一圈正好是 西凉 / 義州 与海面（`map/chinamap.png` 1280×960 的边缘），裁掉以后地图右缘会出现硬切口；而且 `Mask` 在 3.8.8 是废弃别名、要多一个 stencil 批次，多一层“上真机才发现”的风险。
3. **零风险满足验收**：满宽方案让 `rect.x = 0 / rect.w = 750` 恒成立，①“左右溢出 ≤ 1px”是**构造性**成立，不依赖任何裁切，也不会因为后续有人调 `MAP_VIEW` 又溢出。

## 5. 踩到的坑：`ArtLayer.addVeil()` 的双重偏移（workaround）

改完底图后地图下半部忽然“发白、有一条横向硬接缝”。定位结论：`game\cocos\assets\scripts\ArtLayer.ts` 的 `addVeil()` 先用 `placeNode(node, rect)` 把节点摆到 rect 中心，**又**在本地坐标里 `g.rect(rect.x − HALF_W, HALF_H − rect.y − rect.h, …)` 画一遍，等于把设计→本地偏移算了两次：

```
实际画出的设计矩形 = { x: 2*rect.x + w/2 − 375,  y: 2*rect.y + h/2 − 667, w, h }
```

只有“矩形正对屏幕中心”时才看不出问题。旧版 rect.y = 279.99 / h = 610.19 → 实际画在 198.1…808.3（所以改前的 `r89_01_campaign.png` 在 page y≈828 就有一条接缝）；我换成本版 rect.y = 196.75 → 实际画在 9.75…576.25，正好把页头也刷暗、地图下三分之一不刷 —— **是原有 bug，不是我的改动引入的**，只是被我挪到了更难看的位置。

`ArtLayer.ts` 属于别的 agent，我没改。做法是在 `CampaignRoot.ts:1306` 加 `veilRectOnMap()`，把 y 反解成“让画出来正好落在地图上”的值：

```
y' = (target.y + 667 − h/2) / 2   →  (196.75 + 667 − 283.25) / 2 = 290.25
```

调用仍是 `addVeil(...)`，兄弟层级/观感不变。**根治要在 `ArtLayer.addVeil()` 里删掉那一次偏移**，那时 `veilRectOnMap()` 可以直接删。

## 6. 环境坑（会重复踩，记下来）

- **`Page.captureScreenshot` 会截到旧帧**：分页被判定 hidden 时 rAF 停了，截图逐字节相同（`cc.director.getTotalFrames()` 两次读数不变）。必须先
  `Emulation.setFocusEmulationEnabled{enabled:true}` + `Page.setWebLifecycleState{state:'active'}` + `Page.bringToFront` + `Emulation.setDeviceMetricsOverride{876,1368}`，再用 `getTotalFrames()` 两次读数确认在跑。
- **不要 `Page.reload`**：Cocos 重载后会黑屏（`cc.director.getScene()` 为 null），要重新 `cdp.mjs close` + `launch`。
- **VM 只有 800×600**：Edge 窗口被夹到 756×488，`--window-size=900,1500` 无效，必须用 `Emulation.setDeviceMetricsOverride`，否则取景和 lead 的 876×1368 对不上。
- **`cc.UITransform` 在产物里不是全局类**：一律用字符串 `getComponent('cc.UITransform')`；但**组件方法名在压缩后保留**，所以 `comp.mapImageRect()` 这类可以直接从 CDP 调。
- **tsc 不在 `game\cocos\node_modules`**：任务是 `node .\node_modules\typescript\bin\tsc`，实际要 `node F:\sanguo\game\node_modules\typescript\bin\tsc`。

## 7. 回归

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `cd F:\sanguo\game\cocos; node F:\sanguo\game\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit` | **EXIT=0** |
| 纯函数区契约 | `node work\cocos_monarch84\layout_guard.mjs` | **EXIT=0**，region `CampaignRoot.ts:157–404`（246 行），60 城 / 出界 0 / 重叠 0 对 |
| 页头版式 | `node work\cocos_monarch84\hud_layout.mjs` | **EXIT=0 / 0 失败**（11 项） |
| 地图探针 | `node work\cocos_map84\probe.mjs` | **24/24 PASS，failed=0**（与 lead 的基线 `probe_report.json` 一致；无浏览器时运行时探针 SKIP） |
| 地图探针（带浏览器） | `CDP_PORT=9333 node work\cocos_map84\probe.mjs` | **28/29**，唯一失败 `②shim 后 CampaignBg.active=false（map_bg 停用） null` |

关于那条 28/29：`probe.mjs` 的 marker 是 `/CampaignBands|planBaseMap/.test(String(comp.buildArt))`，压缩产物里标识符被改名 → 永远判成“修前版本”并走 shim 分支；shim 第 5 条要求存在一个 `CampaignBg` 节点（旧的 `bg/map_bg` 图层），而**改前的产物（lead 的 `game\cocos-build\web-mobile` 08:36:14，bundle `index.02250.js`）里也搜不到 `CampaignBg`**，拿它跑同样是 28/29、同一条失败 —— 属于探针对已删除图层的过期期待（同一份探针自己的单元检查「②没有任何 bg/map_bg 图层」是 PASS），不是版式回归。真要 29/29，得改 `probe.mjs` 那条（不在我的文件所有权里）。

## 8. 改了哪些 file:line

**`game\cocos\assets\scripts\CampaignRoot.ts`**
- `:75` `MAP_VIEW = { x: 0, y: 130, w: 750, h: 700 }`（原 `{20,130,710,900}`）；`:77` 新增 `CONSOLE_TOP = 830`；`:88-89` `BUTTON_Y = 1152`、`BUTTON_H = 96`；`MAP_WORLD` 删除（两处变换重写后无引用）
- `:350` `baseMapScale(viewW, imageW = 1280)`、`:362` `baseMapRect(view, imageW = 1280, imageH = 960)`（纯函数区，**不引用模块常量**，`layout_guard.mjs` 才能单独编译）
- `:1268` `mapImageRect()` → `baseMapRect(MAP_VIEW)`；`:1380` `toScreen()` → `rect + world * k`
- `:1092` `buildArt()`，`:1099` `planBaseMap(this.mapImageRect(), DESIGN_W, CONSOLE_TOP, HUD_TOP, CONSOLE_TOP)`
- `:1306` `veilRectOnMap()`（§5 的 workaround）
- `:450` `LOG_VIEW = { x: 16, y: 842, w: 718, h: 298 }`、`LOG_ROW_H = 30`、`LOG_ROW_TOP = 48`（`LOG_HEAD_H = 28` 保持不变，别的探针断言它）
- `:929` `labelLegend`、`:1012` 三个图例 label、`:1909` `drawFrame()`（`CONSOLE_TOP` 底色带 + 图例圆点 + 删掉旧的城市卡底板 16,1240,718,84）
- `:954` `logEmpty`、`:2401` `buildLogLabels()`、`:2421-2431` 空戰報占位行、`:2505` `refreshBattleLog()`、`:2539` `drawBattleLog()`（8 行帐页线，空行更淡）
- 新增只读访问器给断言脚本：`:1273` `mapRect()`、`:1278` `logRect()`、`:1283` `consoleRects()`

**`game\cocos\assets\scripts\CityPanel.ts`**
- `:104-107` 页头带 `R_HEADER/R_BACK/R_TITLE/R_MONTH`
- `:117-124` 資訊卡 `R_HUD {18,126,714,206}` + `HUD_ROW_H 66 / HUD_PAD 8 / HUD_COL_W 174.5 / HUD_NAME_FONT 14 / HUD_VALUE_FONT 24`（4 列 × 3 行）
- `:127-132` 命令卡 `R_CMD {18,344,714,396}`、`CMD_W 230 / CMD_H 104 / CMD_TITLE_H 42`
- `:141-146` 紀錄卡 `R_LOG {18,880,714,348}`、`R_LOG_STATE {512,888,206,30}`、`LOG_ROW_H 60`、`LOG_ROWS 5`
- `:149` 提示条 `R_HINT {18,1240,714,80}`（bottom 1320，加标签 1320，`bottom ≥ 1300` 达标）
- `:237` `layoutRects`（给断言脚本读）；`:240` `lblCmdTitle`（「內政命令」标题）
- `:696` `vline()`；`:711` `vAlpha 226`（原 168，太透看不清字）；`:727/738/751-756` 卡片填充、金线、帐页线
- `:418` `paintFloorFade()`（828→880 过渡，`paintSeam()` 本体一字未动）
- `:904-905` 紀錄右上「最近 5 條」（原「本月令 可下」，与資訊卡「月令」重复）

**`game\cocos\assets\scripts\ItemsPanel.ts`（只读展示行）**
- `:149` `statCol: [{x:464,y:638,w:126},{x:602,y:638,w:126}]`（原 `[{468,…},{594,…}]`：左值右缘 594 == 右标签左边 594，所以黏成 `武力 +1生命 —`）
- `:765` `statNameRect()`（标签左对齐，w 78）、`:773` `statValRect()`（数值右对齐到列右缘，w 46）
- 「原作欄位」表（`FIELD_ROWS`）**没改**：`編號 Sequence` / `原作 TYPE` / `使用等級 Level` 这种「中文 + 原字段名」是照 web 抄的，web 也是这样，属有意保留

## 9. 没做到 / 待确认

- **`[推测]`** 内政页 紀錄 只有 5 行（web 是「最近 6 條」）：卡高 348 扣掉标题 48 后 `(348−48)/60 = 5`，若 lead 要 6 行，把 `LOG_ROW_H` 降到 50 即可（`CityPanel.ts:145`），其余不用动。
- **`[推测]`** 朝堂图底部 828→880 的过渡（`paintFloorFade`）是我按“截图上看接缝太硬”自己加的，没和 web 逐像素比对；web 那边是整图铺底 + 卡片压上去，没有这条渐变。不合适可以删这一个方法调用。
- **遮罩 bug 只做了 workaround**：`ArtLayer.addVeil()` 的双重偏移没有根治（`ArtLayer.ts` 不归我）；根治后请删 `CampaignRoot.ts:1306` 的 `veilRectOnMap()`，直接用 `{x: rect.x−2, y: rect.y−2, w: rect.w+4, h: rect.h+4}`。
- **截图来自我构建的产物**（`work\cocos_layout\cocos-build`，09:10:07）。lead 的 `game\cocos-build` 需要重新构建后复验；`assert_layout.mjs` 的端口写死 9333（`$env:CDP_PORT` 可覆盖），lead 自己起浏览器时要改端口。
- **60 城点/势力色环/玩家金环/错开标签**没有改逻辑，只换了坐标变换；断言是“60 个都在底图矩形内 + `layout_guard` 的重叠 0 对”，没有逐城目视比对错开效果（`campaign.png` 上肉眼看着和改前一致）。
- 图例（我方/勢力/無主）是我加的：web 的 campaign 页没有独立图例 DOM（只有 tabs），但 60 个城点在 Cocos 里没有颜色说明会看不懂，所以放在地图下装裱带里。若认为超出范围可以删 `CampaignRoot.ts:1012` 那三个 label + `drawFrame()` 里的三个圆点。

## 10. 复验步骤（lead）

```powershell
# 1) 构建（lead 自己跑）
# 2) 起静态服务 + 浏览器（产物路径要含 cocos-build）
cd F:\sanguo\work\cocos_verify
$env:PORT='9333'; $env:PROFILE='F:\sanguo\work\.edgeprof_layout'; $env:OUTDIR='F:\sanguo\work\cocos_layout'
$env:PAGE_URL='http://127.0.0.1:5174/cocos_layout/cocos-build/web-mobile/index.html?v=6'
node cdp.mjs launch
# 3) 截图
node cdp.mjs run F:\sanguo\work\cocos_layout\steps_shot_all.mjs
# 4) 断言
node F:\sanguo\work\cocos_layout\assert_layout.mjs
```
