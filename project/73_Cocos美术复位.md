# 73 · Cocos 原作美术复位（大地图 / 内政页 / 战场主将）

- 日期：2026-11-25
- 工程：`F:\sanguo\game\cocos`（Creator 3.8.8，750×1334，唯一 bundle `assets/bundles/res`）
- 目标：把此前为压体积移出 bundle 的原作美术按 ≤19.5 MB 预算复位并接线；只改 `game\cocos\assets\**`、`work\cocos_sync\**`、`work\cocos_art\**`、本报告。
- 结论：四组资源已重新量体积并分组处理；bundle 新增 2,399,581 B、删除旧占位 `bg/map_sheet` 352,294 B；出包 **17.80 MB**（≤19.5 MB），`tsc` exit 0，5 个剧本 × 60 城 = 300 点坐标对拍全过。

## 1. 体积算术

### 1.1 四组资源的实际体积（源 = `game\web`，停放区 = `game\cocos-park\res`）

| 组 | 停放区档数 | 停放区字节 | 源档数 | 源字节 | 说明 |
|---|---:|---:|---:|---:|---|
| `anim\general` | 72 | 5,648,183 | 36 | 5,613,774 | 35 张 2048²/1024² 调色板页 + index.json 311,087 |
| `bg\env` | 62 | 2,746,984 | — | — | AI 图，web 端已弃用；Cocos 侧无引用 |
| `bg\policy` | 12 | 2,230,172 | 6 | 2,230,172 | palais_01..05 + palais_yield，640×480 RGBA |
| `map` | 14 | 1,687,702 | 7 | 1,680,865 | chinamap.png 1,434,685 + chinamap.webp 239,924 + city_1..4 6,059 + point 197 |

> 停放区 `map` 目录的 14 档里包含 1100×825 的 `map_sheet.png`（351,314）——它是**模糊占位图**，不是原作 CHINAMAP；web 源目录里另有 `chinamap.webp` 239,924。

### 1.2 进 bundle 的决策后体积

| 组 | 进 bundle 档数 | 进 bundle 字节 | 相对停放区 |
|---|---:|---:|---:|
| `anim\general` | 33（32 页 PNG + index.json 88,278） | 1,766,345 | −3,881,838 |
| `bg\policy` | 10（5 palais webp + 5 预烘 floor webp） | 387,056 | −1,843,116 |
| `map` | 6（chinamap.webp 239,924 + city_1..4 6,059 + point 197） | 246,180 | −1,441,522 |
| `bg\env` | 0 | 0 | −2,746,984 |
| **新增合计** | **49** | **2,399,581** | |

另删除 `assets\bundles\res\bg\map_sheet.png` 与其 `.meta`：**352,294 B**。

### 1.3 出包总账

| 项 | 字节 | MB |
|---|---:|---:|
| 上一轮包（基线，`dist\wechat-upload`） | 16,577,612 | 15.81 |
| + 本次新增资源 | +2,399,581 | +2.29 |
| − 删除 map_sheet | −352,294 | −0.34 |
| 预计 | 18,624,899 | 17.76 |
| **实际出包** | **18,661,691** | **17.80** |
| 差额（构建生成的 .meta / config 等） | +36,792 | +0.04 |

限额 19.5 MB → **余量 1.70 MB**。bundle 原始总量 32,895,837 B（含音频 16,879,926 B，出包时按既有策略剔除，不进包）。

## 2. 每组决策与理由

### 2.1 `anim\general`：子集 + 精确调色板重排（不是整组搬回，也不是 webp）

先量后决：

| 方案 | 字节 | 结论 |
|---|---:|---|
| 原 35 页 PNG | 5,302,687 | 超预算（15.81+5.30=21.1 > 19.5） |
| 整组 webp lossless | 4,661,152 | 只省 12%，仍超 |
| 整组 webp q80 / q85 | 5,764,226 / 6,503,592 | **反而比 PNG 大**（调色板像素画 + 全透明 alpha），不可行 |
| 子集 PNG（重排调色板） | **1,766,345** | 采用 |

子集规则（`work\cocos_sync\restore_art.py`）：

- 15 个造型 × 左右两套 = 30 页（`L0..LE` / `R0..RE`），每页只保留 `Wait:1`、`Attack:1`、`Walk`、`Death` 四组动作（共 32 个去重帧）；
- `H` 页只保留 `H900:*`（黄鬃马/缺省马），`W:A` 页只保留 `W700:*`（直劍/缺省武器）；
- 依据：`assets\bundles\res\data\generals.json` 401 行里 `Weapon`/`Horse`/`SHAPE` **全部为 null**，参考实现 `game\src\view\generalAtlas.ts` 对空装备走缺省（直劍 slot 1 / seq 700、马 900），因此运行时最多只需要这 4 页键（`L{shape}`、`R{shape}`、`H`、`W:A`）。

像素保真：源图是 P 模式、`transparency` 为单值 255、alpha 只有 {0,255}。生成器按页收集实际用到的索引，重排成紧凑调色板（不透明色在前、透明色最后，LUT 重映射），再以 PNG optimize 输出；逐帧 numpy 比对 **bad frames 0**，与源帧完全一致。对照：`quantize(256)` 每页有 3.4 万–11.8 万像素差、最大通道差 29，已弃用。

单页体积：body 页 49,628–57,876 B；`H` 页 1024×499 = 63,950 B；`W:A` 页 1024×68 = 5,253 B。

### 2.2 `bg\policy`：palais 01..05 → webp q85 + 预烘柔焦地面

- 6 张 PNG 合计 2,224,295 B；webp q85 后 5 张 `palais_01..05` 合计约 377 KB，加 5 张 `floor_0N` 后 **387,056 B**。
- 柔焦地面按 web 成熟做法预烘，而不是运行时拉伸：取每张源图最底 24 行 → `resize(750,318, BICUBIC)` → `GaussianBlur(9)` → `Brightness(.56)` → `Color(.92)` → webp q80，单张 1,590–2,196 B。好处是运行时零成本、效果与 city.html 的 `100% 2000% + blur(9px)` 等价；代价是 5 张共约 9 KB。
- `palais_yield` 不进包：web 全库无引用（`grep` 0 命中）。
- 朝堂带几何照 `project\64_内政页美术.md`：640×480 源按 750×562 显示（1.17×、0% 裁切），地面 750×318 接在 562 之下。

### 2.3 `map`：只进 chinamap + 城点四档 + 光标

- `chinamap.webp` 239,924 B（1280×960，原作 CHINAMAP），替代 `bg/map_sheet`（1100×825 模糊占位）。
- 城点 `city_1..4.png` 6,059 B，按人口四分档；`point.png` 197 B 只作选中光标，**不是城点**。
- 不改画面比例：`CampaignRoot.mapImageRect()` 恒按 `MAP_IMAGE_W=1280 / H=960` 的 world→screen 映射给 rect，`ArtBg` 在 `cover=false` 时**不重设 contentSize，直接把纹理拉伸到 rect**，所以换图前后同一套 `toScreen()` 数学完全不变（见 §4 对拍）。

### 2.4 `bg\env`：不复位

62 档 2.62 MB 的 AI 图，web 端已弃用（仅 `hall_0N` 在 city.html 的历史引用）。Cocos 侧 `CityModel.hallImageOf()` 虽仍返回 `assets/bg/env/hall_0N.jpg`，但全工程**无调用点**；内政页现在改用原作 PALAIS。若未来要 AI 朝堂图，需重新评估预算。

## 3. 接线（file:line）

行号以本次最终源码为准。

### 3.1 大地图 `assets\scripts\CampaignRoot.ts`

| 行 | 内容 |
|---|---|
| 220 | `this.artMap.load('map/chinamap', ...)`（原 `bg/map_sheet`） |
| 237 / 241 | `buildArt()` 末尾调用 / `buildCityArt()`：`loadFrame` 载 `map/city_1..4`、`map/point`，建 `CampaignCityIcons` 层 |
| 265 | `computeCityTiers()`：人口 q25/q50/q75 → tier 1..4；关隘（RATE 0 / 人口 0）归 1 档 |
| 286 | `cityIconAt(name)`：懒建城点节点，锚点 (0.5, 0) |
| 305 | `ensurePointIcon()`：选中光标节点 |
| 896-910 | `drawMap` 城循环：`contentSize = 纹理宽高`、`spriteFrame = cityFrames[tier-1]`、位置 `(p.x-375, 667-p.y)`；无图元才回退原来的双圆 |
| 941-949 | 选中光标 `point` 放在城点上方 `y-30` |

`toScreen()`（306-316）与 `mapImageRect()`（246-252）**未改**，保证城点不偏。

### 3.2 内政页 `assets\scripts\CityPanel.ts`

| 行 | 内容 |
|---|---|
| 182-183 | 字段 `artHall` / `artFloor` |
| 228 | `ensureBuilt()` 开头先 `buildArt()`，再建 `gMain`（美术在 sibling 0/1） |
| 313-317 | `buildArt()`：`CityHallArt {0,0,750,562}` cover + `CityHallFloor {0,562,750,318}` cover，`setSiblingIndex(0/1)` |
| 321-328 | `applyHall()`：`hallIndexOf(this.def())`，6→1、clamp 1..5，拼 `bg/policy/palais_0N` 与 `floor_0N`；序号不变跳过 |
| 371 | `open()` 在 `cityName` 赋好后 `applyHall()` |
| 580-585 | `drawMain()`：`artReady = artHall?.state==='ready'`；全屏底 alpha 60（否则 253）；artReady 时补 `{0,880,750,454}` alpha 252 盖住下方大地图 |
| 591-622 | 面板 alpha：header 240 / 返回 235 / HUD 168 / 命令 212 / 日志 220 / 提示 240；未 ready 全 255 |

`hallIndexOf` 在 `CityModel.ts:395-400`（RATE clamp 1..5，人口 ≥300,000 → 6），未改。

### 3.3 战场 `assets\scripts\BattleRoot.ts` + 新 `GeneralArt.ts` + `ArtLayer.ts`

| 文件:行 | 内容 |
|---|---|
| `BattleRoot.ts:40` | `import { GeneralArt }` |
| `BattleRoot.ts:108` | 字段 `generalArt` |
| `BattleRoot.ts:293` | `boot()` 里 `generalArt.load(world, () => redraw())` |
| `BattleRoot.ts:352` | `new GeneralArt(this.node)`（unitLayer 之后、weather 之前） |
| `BattleRoot.ts:637 / 675` | `drawUnits` 两条分支都调 `generalArt.draw(world, camX)` |
| `BattleRoot.ts:659` | 金菱形仅 `!generalArt.hasArt()` 时画（无图降级） |
| `BattleRoot.ts:732` | `drawUnitSprites` 跳过已由三层图绘制的 general，避免双影 |
| `GeneralArt.ts:70` | `class GeneralArt` |
| `GeneralArt.ts:94` | `load(world, onReady)`：按双方主将 TYPE 查 `data.generals` → shape；只载 `L{shape}`、`R{shape}`、`H`、`W:A` 四页 |
| `GeneralArt.ts:117` | `draw(world, camX)`：死亡 24 tick 隐藏、`moving/attack` 选动作、`t` 计算 |
| `GeneralArt.ts:196` | body key（Wait/Attack 加 `:1`） |
| `GeneralArt.ts:227` | `place()`：`node.x = sx-375 + w/2 - ox`，`node.y = 667 - (sy+h-oy)`，`sy = project(...).y + 8`；层序 horse→body→weapon |
| `ArtLayer.ts:372` | `GeneralIndex` 类型 |
| `ArtLayer.ts:382` | `loadGeneralAtlas(indexPath, units, cb)`：任一行失败整体 `cb(null,null)`，保留菱形 |

### 3.4 资源生成 / 同步（幂等）

- `work\cocos_sync\restore_art.py`：量源、拼页、重排调色板、写 `work\cocos_art\gen\{anim\general,bg\policy,map}`；`.stamp.json` 按源 size+mtime 跳过未变组。
- `work\cocos_sync\restore_art.mjs`：把 staging 复制进 `game\cocos\assets\bundles\res`（copy 49 files / 2,399,581 B），并 prune `bg/map_sheet.png` + `.meta`（352,294 B）。
- 二者均幂等；重跑不会重复追加。

## 4. 60 城坐标对拍（`work\cocos_art\_check_cities.mjs`）

方法：直接读 `assets\bundles\res\data\scenarios.json` 的 5 个剧本 `cities[].pos_xy`，用 `CampaignRoot` 同款公式重算 `toScreen`，断言：

1. 每个 `pos_xy` 都在 `0..1280 / 0..960` 内；
2. 屏幕点在 `MAP_VIEW{x:20,y:130,w:710,h:900}` 内；
3. 每个剧本「世界 y 升序」与「屏幕 y 升序」的城序完全一致。

结果：**5 × 60 = 300 点全过**；`scale = 0.635619`，`origin = (41.300, 333.380)`；TIMES1..5 的排序全部 `same`。

样例：襄平 (1108,90) → (689.6,337.2)；代縣 (728,84) → (448.1,333.4)；合肥 (968,540) → (600.6,623.2)。

城档分布（剧本 1，四分位阈值 141,500 / 164,500 / 213,500）：tier1..4 = **25 / 12 / 12 / 11**，其中 12 座人口 0 的关隘归 1 档。

## 5. 出包与自检

命令：

```
Remove-Item Env:\ELECTRON_RUN_AS_NODE; Get-Process CocosCreator* | Stop-Process -Force
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode upload -SkipWeb
```

结果（`work\build-logs\wechatgame_20261125_053719.log`）：

| 项 | 字节 | MB | 文件数 |
|---|---:|---:|---:|
| 主包 | 2,098,959 | 2.00 | 28 |
| `subpackages\res` | 16,562,732 | 15.80 | 2,934 |
| **合计** | **18,661,691** | **17.80** | **2,962** |

- `✅ 出包成功`；主包 <4 MB、总 <20 MB、`game.json` 首字节 `0x7B` 无 BOM、已声明 `subpackages/res/`、分包 `game.js` 存在；
- 音频 109 档 / 16.07 MB 按既有策略剔除到 `dist\audio-cdn`（不在包内）；
- 从 `subpackages\res\config.7d75d.json` 的 `paths` 逐项确认资源全在包：`anim/general/index`、32 个 `anim/general/*/texture`、`map/chinamap`、`map/city_1..4`、`map/point`、`palais_01..05`、`floor_01..05`；
- 原生文件按字节核对：`chinamap` 239,924、`L0` 54,173、`H` 63,950，与落盘源一致（无二次有损）；
- 图集自检：32 页，PNG 实际尺寸全等于 index 的 `w/h`，所有 sprite 的 `x+w / y+h` 均在页内；必需 group（`L2:Wait:1/Attack:1/Walk/Death`、`H900:Wait/Walk/Attack`、`W700:Wait/Attack`）全在。

类型检查：

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
# EXIT=0
```

## 6. 没做到的 / 风险

1. **未在真机或微信开发者工具里肉眼验证**：内政页的 alpha（60/168/212/220/240）、朝堂带与地面的衔接、城点 22–49 px 的实际观感、主将三层动画的脚点/遮挡，全部只做了代码级与资源级校验，没有截图。
2. **只保留默认装备与默认马**：`Weapon/Horse` 现在全为 null，所以只带 `W700`、`H900`；若将来数据填入短錐槍/銅殳/眉尖刀或别的马，`GeneralArt` 仍会按默认图降级显示（不崩，但造型不符），需要再补 `W720/W740/W760` 与 `H901..907`（约 +0.4 MB，预算还有 1.7 MB）。
3. **TYPE 30 的 1 名武将**按参考实现 `clamp(1..15)` 落到缺省造型 2，与原作造型不一定一致（原作 SHAPE 表只有 15 项）。
4. **死亡动画时间轴**逐行对照了 web 的 `DEATH_TICKS=24` 与 `lastHitTick`，但未跑实机时间轴；阵亡后 24 tick 内若帧图缺失，会停在最后一帧而不是隐藏，需真机确认。
5. **城点未按势力着色**：原作图元是单色剪影，Cocos 侧只保留选中金环与势力半透明圈，没有做 tint 分色。
6. **`bg/env` 未复位**（2.62 MB AI 图）；`CityModel.hallImageOf()` 仍指向不存在的 `assets/bg/env/hall_0N.jpg`，当前无调用点，属于死代码。
7. **音效仍被剔除**（16.07 MB / 109 档走 CDN），包内静音；这是既有策略，不是本次回归。
8. **地面是预烘图**（blur 9 / brightness .56 / saturate .92），与 city.html 的 CSS 滤镜未做逐像素比对，只保证同参数同区域。
9. `palais_yield` 未进包（web 无引用），若后续要丰年/荒年朝堂变化需另加。

## 7. 复现步骤

```powershell
# 1) 生成 staging（幂等）
python work\cocos_sync\restore_art.py
# 2) 复制进 bundle + 清理旧占位（幂等）
node work\cocos_sync\restore_art.mjs
# 3) 类型检查
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
# 4) 出包（必须先杀 CocosCreator，否则会 5 秒内静默失败）
cd F:\sanguo
Remove-Item Env:\ELECTRON_RUN_AS_NODE; Get-Process CocosCreator* | Stop-Process -Force
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode upload -SkipWeb
# 5) 坐标对拍
node work\cocos_art\_check_cities.mjs
```
