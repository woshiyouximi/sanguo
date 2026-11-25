# 101 Cocos 大地图版式（三修）

- 日期：2026-11-25
- 依据：`project/98_对照复查R84.md` §5 乙组 ①②③（三条已确认的真 bug）
- 生产代码只动一个文件：`game/cocos/assets/scripts/CampaignRoot.ts`
- 约束遵守：未改 `assets/scripts/core/**`、`CityPanel.ts` / `ItemsPanel.ts` / `BattleRoot.ts` / `ArtLayer.ts`、`game/src/**`、`game/web/**`、`tools/**`、`project/37a|31|44|98`；未跑 `tools/build_wechat.ps1`、未跑 CocosCreator 构建。

---

## 0 结论速览

| # | bug（project/98 §5乙） | 一句话修法 | 修前（实测） | 修后（实测/断言） | 位置 |
|---|---|---|---|---|---|
| ① | 两张底图叠着画：`bg/map_bg`(cover) + `map/chinamap` 同时加载，「硬边」 | 底图只留 CHINAMAP 一张，`map_bg` 层删掉；上下换成装裱带（暖褐渐变 + 绢纹 + 双金线 + 图边 1px） | `CampaignBg` 节点 active、**912.74×1334**；`CampaignMapImage` 813.59×610.19；`CampaignBands` 不存在 | `CampaignBg.active=false`；`CampaignBands` active；底图计划里只剩 1 张 `map/chinamap` | 纯函数 `planBaseMap()` :289；`buildArt()` :432；`buildMapBands()` :546；`paintBand()` :583 |
| ② | 城点 contentSize 被图集页宽污染（`art.texture.width`） | 只认 `spriteFrame.originalSize`→`rect`，×0.65，夹 [10,64] | **60/60 个 `CityIcon_*` = 2048×2048** | 25×**14×12**、12×**21×16**、12×**26×18**、11×**32×23**；>64 的 0 个 | `cityIconSize()` :128；`drawMap()` :1170-1174 |
| ③ | 关卡名标签全叠到 y=144 | 按屏幕 y 排序后奇偶分上下、撞了同方向再让一行、只在图幅内取位 | 60 个标签 **y 去重 = 1 组（144）** | **59 组**，范围 **[302,840]**，两两重叠 **0** 对，上 30 / 下 30 | `layoutCityLabels()` :193；`placeCityLabels()` :1254；调用 :1201 |

三条的「修后」数字都来自同一份探针（`work/cocos_map84/probe.mjs`，29/29 PASS）；运行时数字见 §2.2，单元数字见 §2.3。

---

## 1 逐条

### 1.1 ① 底图只留一张 CHINAMAP + 装裱带

**修前**（project/98 §5乙①，本轮复测一致）：`buildArt()` 里先 `new ArtBg(node,'CampaignBg',{0,0,750,1334},true).load('bg/map_bg')`，再 `new ArtBg(node,'CampaignMapImage',mapImageRect(),false).load('map/chinamap')`；`map_bg` 是 832×1216 的 cover 图，被拉到 750×1334 盖满全屏，CHINAMAP 只占中间 45.7%。实测隐藏 `CampaignMapImage` 地图还在 → 铺底的是 `map_bg`。地图上下边缘靠 `addEdgeFade()` 的 8 条 12px 半透明带盖住，`:233` 注释自承「硬边」。

**修法**：
- 新增纯函数 `planBaseMap(rect, designW, designH)`：只返回 `images:[{path:'map/chinamap', rect}]`，外加 `bands.top`（`0..ceil(rect.y)`）、`bands.bottom`（`floor(rect.y+rect.h)..1334`）、`rails`（上下各两条金线的 y）。
- `buildArt()` 删掉 `artBg` 字段与 `bg/map_bg` 加载，只 `artMap.load(plan.images[0].path)`；`CampaignBg` 节点在整个场景里不再创建（`artBg` 字段、`addEdgeFade()` 旧实现一并删除）。
- 新增 `buildMapBands(plan)`：`CampaignBands` 节点（`siblingIndex=0`，UI_2D，750×1334）+ 一个 Graphics，画
  - 12 段暖褐近似渐变，色标 = web `drawBands()` 的 `#1D1710 → #15110C → #100D09`（`BAND_STOPS` :238，`bandColorAt()` :245）；
  - 绢纹：`rgba('#D8B36A',11)` 每 4px 一条 1px 横线，整条带攒进**一次** `fill()`（`paintBand()` :594-601）；
  - 图边 1px `rgba('#D8B36A',76)` 描边（对应 web 的 `strokeRect`）；
  - 双金线：内侧 `#B08A4A` 3px α235 + `#E6C98A` 1px α140 高光，外侧 `#8A6A38` 1px α190。
- `drawFrame()` 的底图分支保留（`artMap.state==='ready'` 只叠 0..124 / 1080..1334 两条压条），但注释改回「一张 chinamap + 装饰带」。

**版式数字**（`planBaseMap` 断言）：

| 项 | 值 |
|---|---|
| 底图层数 | 1（`map/chinamap`） |
| 图矩形 | x=-14.6345, y=279.9878, **w=813.5924, h=610.1943** |
| 上带 | (0,0,750,**280**) |
| 下带 | (0,**890**,750,**444**) |
| 金线 y（上） | 内 276（3px）+ 275（1px 高光）/ 外 126（1px） |
| 金线 y（下） | 内 891（3px）+ 894（1px）/ 外 1072（1px） |

**为什么图是 813.6×610.2 而不是 750×562.5**：约束要求「坐标换算不要重算，沿用 `toScreen()`/`mapImageRect()`」。`toScreen()` 把世界 `1050×776` 映射进 `MAP_VIEW 710×900`，`scale = min(710/1050, 900/776) × 0.94 = 0.635619`（= project/73 §4 对拍值，本轮探针用三个样点复验：襄平 689.63/337.19、代縣 448.10/333.38、合肥 600.64/623.22）。1280×960 的图按同一 scale 摆就是 813.6×610.2，**左右各溢出画布**（左 14.6px、右 48.96px），这是「城点钉在图上任何一点都不偏」的代价；如果为了铺满 750 宽把图缩到 0.58594，城点最多会与山水错开约 30px（≈7.8%），那正是 98 报告在防的那类错位。装裱带因此从 y=280 / 890 开始，而不是 web 的 66.25 / 628.75。

`[推测]` 图右缘多裁 34px（世界坐标里图左右留白 88 vs 142，不对称），原作边框可能被切掉一点；未在真机上肉眼确认。

### 1.2 ② 城点尺寸只认 spriteFrame 自己的 rect

**修前**：`drawMap()` 里 `const tex = art.texture; const iw = tex ? tex.width : 24; ... icon.box.setContentSize(iw, ih)`。本轮探针在干净页面实测：**60/60 个 `CityIcon_*` 的 contentSize = 2048×2048**，同时 4 个 spriteFrame 的 `rect`/`originalSize` 分别是 22×18 / 33×24 / 40×28 / 49×35，而 `texture`（动态图集页）是 2048×2048：

```
frames: [{rect:22x18, originalSize:22x18, tex:2048x2048},
         {rect:33x24, originalSize:33x24, tex:2048x2048},
         {rect:40x28, originalSize:40x28, tex:2048x2048},
         {rect:49x35, originalSize:49x35, tex:2048x2048}]
```
→ `texture` 是**图集页**，不是图元；`ArtLayer.loadFrame()` 走 ImageAsset→Texture2D→`new SpriteFrame()`，引擎把 `rect/originalSize` 从纹理推导对了，`texture` 却被动态图集替换成整页。

**修法**：`cityIconSize(frame, k = CITY_ICON_K)`（:128）= `max(originalSize, rect)` × 0.65，再夹到 `[CITY_ICON_MIN=10, CITY_ICON_MAX=64]`。`drawMap()` 只调它，不再碰 `texture`。`CITY_ICON_K=0.65` 对齐 web `campaign.html:2146`。

| 档 | 原始 rect/originalSize | 修前 contentSize | 修后 contentSize | 城数（剧本1） |
|---|---|---|---|---|
| 1 | 22×18 | 2048×2048 | **14×12** | 25 |
| 2 | 33×24 | 2048×2048 | **21×16** | 12 |
| 3 | 40×28 | 2048×2048 | **26×18** | 12 |
| 4 | 49×35 | 2048×2048 | **32×23** | 11 |

另有兜底断言：同一帧即使带 2048 的 `texture` 也算 14×12；病态 `originalSize=2048` 被夹到 64×64；`originalSize` 为 0 时回落 `rect`；无帧给 10×10 占位（不是 0，避免隐形城点）。

### 1.3 ③ 标签按真实屏幕 y 错开

**修前**：`labelY = clamp(p.y - (iconH + 6), MAP_VIEW.y+14, ...)`。`iconH` 来自被污染的 2048 → 所有标签都被夹到下限 **y=144**，60 个城名叠成一行（截图 `shot_20261124230159_before.png` 顶部那条「西雲南 建寧 成都 …」）。探针实测：60 个标签 **y 去重 1 组，全部 144**。

**修法**（`layoutCityLabels()` :193，纯函数，不碰 cc）：
1. 按屏幕 y 升序排 rank（y 相同比 x、再比 name）；
2. `rank%2===0` 先往上、否则先往下，另一方向作兜底；
3. 同方向撞了就把候选框退 `h+2` 再试（最多 14 步）；候选只要压到 `top/bottom` 边界就跳过；
4. 取第一个与已放置框**交面积 = 0** 的候选；都没有就取重叠最小的，极端情况贴 `top+h/2`。

落地：`placeCityLabels(iconHeights)` 从 `this.cityScreen` 取城点屏幕坐标，`top = floor(mapRect.y)+12 = 291`、`bottom = floor(mapRect.y+mapRect.h)-12 = 878`，逐城 `label.node.setPosition(box.x-375, 667-box.y)`，自己城绿 `#8FD1B6`、其余 `COLORS.enemyLight`（颜色逻辑与原实现一致）。

**数字**：

| 指标 | 修前 | 修后 |
|---|---|---|
| 标签 y 去重 | 1 组（144） | **59 组**，302…840 |
| 两两重叠 | 60 个全叠一起 | **0 对** |
| 出界（图幅 [291,878]×[0,750]） | 全在 144（视觉上压住 HUD 下沿） | **0 个** |
| 上 / 下分布 | 0 / 0（全同一行） | **30 / 30** |
| 标签离自己城点最远 | — | **49px** |
| 标签宽度（估算） | 排版框 110 | 18（宛）… 44（虎牢關） |

标签 UITransform 仍是 `makeLabel(..., 110, 14, ...)` + `overflow=NONE` + 居中，110 只是排版框，实际字宽用 `cityLabelWidth()` 估算（`len*14+2`）参与避让。

---

## 2 验证

### 2.1 怎么验的

工具：`work/cocos_map84/probe.mjs`（零依赖，Node 24 + 仓库自带 typescript）。

```
node work/cocos_map84/probe.mjs          # 单元 + 运行时 + 两张截图
node work/cocos_map84/probe.mjs --unit   # 只跑单元（不碰浏览器）
```

1. **单元链**：读 `CampaignRoot.ts` → 截 `// #region 版式纯函数`（:97）到 `// #endregion`（:313）→ 用 `game/node_modules/typescript/lib/typescript.js` 的 `transpileModule` 去类型 → 写 `_unit_layout.mjs` → `await import()` → 对三个纯函数下断言。断言的是**文件里那段真代码**，不是复制品。
2. **运行时链**：CDP 连 9222 上已开的页面 → `Page.reload`（先打 `window.__probeToken`，必须等它消失，否则会读到 reload 前的旧文档，本轮踩过这个坑）→ 等 Canvas + 60 城 → 采 `CityIcon_*` 的 `UITransform.width/height`、60 个城名标签的 `position`、`CampaignMapImage/CampaignBg/CampaignBands` 节点 → 截图 → 因为**产物过期**（见 §3.1），再往页面注入 shim：同一段纯函数 + 同一套 Graphics 画法，把图标尺寸/标签位置/装饰带落到**真实节点**上，采第二轮并截图。shim 只补运行时证据，不冒充「产物已修复」。

### 2.2 运行时证据（CDP，876×1368 窗口）

修前（`buildIsFixed=false`，产物 = 修前代码）：

```
CityIcon_* contentSize : {"2048x2048": 60}         # 60/60 全部整页
城名标签 y 去重        : 1 组，全部 144
CampaignBg             : active=true, 912.74 x 1334
CampaignBands          : 不存在
CampaignMapImage       : 813.59 x 610.19 @ (17.2, 81.9)
```

shim 后（真实节点、同一段纯函数）：

```
CityIcon_* contentSize : {"14x12":25, "21x16":12, "26x18":12, "32x23":11}   # >64 的 0 个
城名标签 y 去重        : 59 组，范围 [302, 840]
CampaignBg             : active=false
CampaignBands          : active=true
```

截图：`work/cocos_map84/shot_20261124230159_before.png`（修前：60 个整页图元糊成一片 + 60 个城名叠一行 + map_bg 铺底）、`work/cocos_map84/shot_20261124230159_shim.png`（修后：单张 CHINAMAP + 上下装裱带 + 城点正常大小 + 标签错开）。原始数据：`work/cocos_map84/probe_report.json`。

### 2.3 探针结果

**29/29 PASS，failed=0**（24 条单元 + 5 条运行时 shim），摘要：

- ① `cityIconSize` 四档 = 14×12 / 21×16 / 26×18 / 32×23，全 ≤64×64；带 2048 texture 的帧仍 14×12；病态 2048 帧夹到 64×64。
- ② `planBaseMap` 只出 1 张 `map/chinamap`，plan 的 JSON 里搜不到 `map_bg`；图 813.6×610.2；上带 0..280、下带 890..1334；金线 [276,126] / [891,1072]；渐变端点 = {29,23,16} / {16,13,9}。
- ③ 60 城两两重叠 0、全部在图幅内、y 去重 59、上 30 下 30、离城点 ≤80px、宽度 18/44。
- 源码级：`load('bg/map_bg')` 已无、`tex.width` 已无、三个新函数都在调用点。
- 换算自证：`SCALE=0.6356190476`、`ORIGIN=(41.300,333.380)`，project/73 §4 三个样点全对。

### 2.4 类型检查

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
EXIT=0        # 2026-11-25 07:0x，最后一次改动（floor→ceil、CITY_ICON_MAX、注释）之后重跑
```

---

## 3 没做到 / 局限

1. **产物未重建，运行时证据是 shim 的**。`game/cocos-build/web-mobile` 还是 06:36 的修前产物（`assets/main/index.8a433.js` 里仍是 `CampaignBg`/`CampaignEdgeFade`），本轮禁止跑 Cocos 构建，所以「产物已含新代码」这件事没有证明。重建后跑同一条命令，探针会用 `comp.buildArt` 里有没有 `CampaignBands/planBaseMap` 判断 `marker`，为真时走真实断言（不等 shim），预期 `buildIsFixed: true` + 29/29。
2. **`rail_gold.png` 没进 Cocos bundle**。web 是 111×12 的原创金线图片平铺；本轮不能用 Cocos 导入/构建，`assets/bundles/res/**` 加 PNG 也不会进产物，所以用同色同位的 Graphics 实线等价替代（`#B08A4A` 3px + `#E6C98A` 1px 高光 + `#8A6A38` 1px 外线）。真纹样要等一次构建。
3. **装饰带渐变是 12 段近似**（每段 ΔRGB≈1，肉眼不可分），不是真线性渐变；Graphics 没有 gradient 支持。
4. **标签与选中环的视觉重叠**：襄平的标签落在选中光圈里（见 shim 截图右上）。功能无碍，未处理；如要改，可在 `layoutCityLabels` 给"当前选中城"加一个半径参数。
5. **图左右裁切 `[推测]`**：813.6 宽铺在 750 画布上，左裁 14.6px、右裁 49px；原作 chinamap 的边框是否被切掉一点，未真机肉眼确认。
6. **只统计了剧本 1 的 60 城**（scenarios.json[0]）。`layoutCityLabels` 对任何城数都成立，但其余 4 个剧本的标签分布没单独跑数字。
7. **未跑真机/微信小游戏**，只有 web-mobile + CDP。
8. 未改 `ArtLayer.ts`，所以 `artMap` 失败时仍是 `node.active=false` + `drawFrame` 纯色回退（本次没动这条路径，也没在无图条件下实测回退）。

---

## 4 改动清单

生产代码（唯一）：

- `game/cocos/assets/scripts/CampaignRoot.ts`
  - :97-313 新增 `// #region 版式纯函数`：`CITY_ICON_K/MIN/MAX` :101-105、`cityIconSize()` :128、`CITY_LABEL_FONT/GAP` :136-137、`cityLabelWidth()` :172、`layoutCityLabels()` :193、`BAND_STOPS` :238、`bandColorAt()` :245、`HUD_TOP/BOTTOM` :273-274、`planBaseMap()` :289
  - :322-325 `artBg` 字段删除，只留 `artMap`
  - :432-459 `buildArt()`：`planBaseMap()` 单图 + `buildMapBands()` + 两层蒙版
  - :546-580 `buildMapBands()`（新）、:583-602 `paintBand()`（新）
  - :1170-1174 `drawMap()` 图标尺寸改用 `cityIconSize(art)`；:1196 收 `iconHeights`；:1201 `placeCityLabels()`
  - :1254-1274 `placeCityLabels()`（新）
  - 删除：原 `addEdgeFade()`（8×12px 渐变淡出）、`bg/map_bg` 加载、标签 y 夹到 144 的旧块

探针与证据（`work/cocos_map84/`）：

- `probe.mjs`（单元 + 运行时，29 条断言）
- `proto_layout.mjs`（早期原型，保留）
- `_unit_layout.mjs`（probe 每次重写的抽取产物）
- `probe_report.json`（断言 + 两轮运行时数据）
- `shot_20261124230159_before.png` / `shot_20261124230159_shim.png`（另有两张更早的 `_stale` 截图）

## 5 给下一轮的复查口令

```powershell
cd F:\sanguo
# 重建 web-mobile 之后：
node work\cocos_map84\probe.mjs        # 期望 buildIsFixed=true、29/29 PASS
```

若要让底图正好铺满 750 宽（750×562.5，与 web 一致），必须同时把 `toScreen()` 的 `scale` 改成 `750/1280 = 0.5859375` 并重跑 project/73 §4 的 300 点对拍——那属于「重算坐标」，本轮按约束没做。
