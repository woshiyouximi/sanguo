# 24 Cocos 版美术接入（底图 / 立绘 / 单位帧）

> 目标：让 Cocos 版和 web 版看起来是同一个游戏。三屏（大地图、出征编成、战斗）从「纯 Graphics 色块」换成
> 「底图 + 立绘 + 单位帧」。**只加绘制代码，没动任何战斗/存档逻辑。**
> 改动：`scripts/ArtLayer.ts`（新增）、`CampaignRoot.ts`、`DeployRoot.ts`、`BattleRoot.ts`。

## 1. 资源：放哪、多大

| 文件 | 尺寸 | 体积 | 用途 |
|---|---|---|---|
| `assets/bundles/res/bg/map_bg.png` | 832×1216 | 585 KB | 大地图氛围底（cover 铺满全屏） |
| `assets/bundles/res/bg/map_sheet.png` | 1100×825 | 343 KB | 真正的地图；60 城 `pos_xy` 是 1280×960 像素坐标 |
| `assets/bundles/res/bg/deploy_bg.png` | 832×1216 | 294 KB | 出征编成底图（书案/虎符/铜爵） |
| `assets/bundles/res/bg/hud_bar.png` | 1024×256 | 121 KB | 战斗 HUD 顶栏（拉伸到 750×100） |

**总增量 1.31 MB**（未压缩，无需再压）。放 `bundles/res/`（`res.meta` 里 `isBundle:true`），**不放
`assets/resources/`**：工程里本来没有 `resources` 目录，`DataLoader.loadRes()` 走的也是 `res` bundle，
再建一个会多一个 bundle 进主包、还和分包构建冲突。

## 2. 关键坑：`load(path, SpriteFrame)` 一定会失败

`bg/*.png.meta` 和 `hero/*.webp.meta` 的 `userData.type` 都是 `"texture"`，`subMetas` 只有 `6c48a`
（texture）一个子资产，**没有 spriteFrame 子资产**。所以老代码 `loadRes('hero/' + name, SpriteFrame, cb)`
从来就没成功过——这就是「美术效果都没有」的直接原因。统一改走 `ArtLayer.loadFrame()`：
`loadRes(path, ImageAsset)` → `new Texture2D(); tex.image = img` → `new SpriteFrame(); sf.texture = tex`。
路径不带扩展名（`bg/map_bg`、`hero/關羽`）；`hero/<繁名>` 先试原样中文，失败再试 `encodeURIComponent(name)`。

第二坑：`Bundle.load(path, type, cb)` **三参是错的**（第三参是 progress 回调，会抛
`TypeError: this.onProgress is not a function` 或永不回调）。`ArtLayer` 自带 `loadAsset()` 统一用四参
`b.load(path, type, null, (err, asset) => …)`。

## 3. 大地图（`CampaignRoot.ts`）

节点自底向上（`buildArt()` 里按 `setSiblingIndex` 固定）：

1. `CampaignBg` — `ArtBg` + `bg/map_bg`，`cover` 按 `originalSize` 等比铺满 750×1334
2. `CampaignMapImage` — `ArtBg` + `bg/map_sheet`，矩形由 `mapImageRect()` 算，**和 `toScreen()` 同源**
   （`scale = min(710/1050, 900/776) × 0.94`），所以 60 城一个都不偏
3. `CampaignVeil`（地图矩形上 `rgba(8,11,16,168)`，对应 web 的 `.bgveil`）+ `CampaignVeilScreen`（全屏再压 `rgba(8,11,16,96)`，压住 map_bg 那条浅色沙地）
4. `CampaignEdgeFade` — 地图上下各 8 条 12px 渐变带（alpha 170→0），消掉地图矩形的硬边
5. `CampaignBase`/`CampaignMap`/`CampaignUi` — 原 Graphics（城点、道路、按钮）**逻辑一行没改**，只是现在画在底图之上

城名 `Label` 加描边（`enableOutline` + 1px `rgba(6,8,12,240)`，不用已弃用的 `LabelOutline`），字号 13→14；
底图到位后 `drawFrame()` 只压两条半透明带（顶 202、底 226），不再画 4 条不透明色块。

## 4. 出征编成（`DeployRoot.ts`）

- `DeployBg`（`bg/deploy_bg`，cover）+ `DeployVeil` `rgba(8,11,16,152)`；底图到位后 `draw()` 只压顶栏/底栏，
  缺图时退回原来的 4 条纯色块。
- **主将立绘**：`Portrait` 120×150，`loadFrame('hero/<繁名>')` → `contain` 缩放（`k = min(120/w, 150/h)`，
  web 原图 480×701 或 256×374 都自动适配）。**12 格缩略立绘**：`ArtSprite` 34×48、`contain`，姓名变化才重载。
- 修过两个坑：①`setVisible(true)` 在图到达前调用会关掉节点，图到了要按 `wantVisible` 恢复；②`onReady?.(this.apply(frame))` 会被编译成 `onReady == null || …`，不传回调时 `apply()` **根本不执行** → 先 `const ok = this.apply(frame)` 再 `onReady?.(ok)`。**可选链里别塞有副作用的表达式。**
- 候选格/兵种格/阵形格改成半透明卡片 `rgba(16,20,26,190)`（选中 `#3D301B` 240），底图透出来；
  `戰前情報` 三行字下垫 `rgba(14,18,24,172)` 的板。顺带修了分节标题撞行：主將 312 / 兵種 480 / 陣形 704 /
  戰前情報 868 / 兵力 992，兵力按钮 1012，`對敵軍…` 1096，都在 1200 以内。

## 5. 战斗（`BattleRoot.ts`，最小改动）

- `BattleHudBar` — `ArtBg` + `bg/hud_bar`，`UIOpacity 150`，`siblingIndex 0`（在所有 Graphics 之下）。
- `UnitSprites` 层 — 懒建 `Unit_0..n` 精灵池，用 `anim/atlas_00` + `anim/atlas` 的 **walk 帧**（`walk_back`
  给我方 A、`walk_front` 给敌方 B，和 web `battleView.ts` 同源）。帧序按 `tick/3` 取模（30Hz 下 10fps），
  脚底锚点 `HALF_H-(p.y+8)+h/2`，高度 52（主将 72）。
- **切帧不要翻 y**：meta 里的 `y` 是自上而下的行号，但用 `ImageAsset` 手工建的 `Texture2D` 上传后行 0 落在纹理坐标下端，所以 `frame.rect = new Rect(s.x, s.y, s.w, s.h)` 才对；按 `texH - s.y - s.h` 翻会切到空白区（表现为「有阴影、没有小人」——这个 bug 卡了很久）。
- 战场地面从整块 `#11161D` 改成 6 段暖灰渐变，单位脚下加落地阴影（`gA/gB` 一批 fill）。深蓝黑袍压在深色
  纯底上根本看不见——不是尺寸问题是对比度问题（尺寸也从 40/56 提到 52/72）。
- HUD 三条资源条下面加了 `#05070A` 200 的圆角底板 + 1px 金色描边。

## 6. 降级策略

`loadFrame()` 失败统一 `console.warn('[ArtLayer] …')` 后回 `cb(null)`，**没有一条分支会抛异常或白屏**。实测 `bundle.load('bg/__missing__', ImageAsset, null, cb)` 回调 `err = "Bundle res doesn't contain bg/__missing__"`（会回调、不会挂住），于是走下面这些分支：

| 资源 | 失败时 |
|---|---|
| `bg/map_bg`、`bg/map_sheet` | `ArtBg.state='failed'`、节点 `active=false`，`drawFrame()` 回 4 条纯色块 |
| `bg/deploy_bg` | 同上，`draw()` 回退纯色块 |
| `bg/hud_bar` | 顶栏变纯 `bgDeep`（alpha 255），布局不变 |
| `hero/<繁名>` | 原样中文 → URL 编码 → 远程立绘（`heroBaseUrl` 空则跳过）→ 留空板，不留白块 |
| `anim/atlas(_00)` | `unitFrames=null`，`drawUnits()` 回原来的 Graphics 方块 |

## 7. 验证与还差什么

三张验收图（web-mobile debug 构建 + CDP 截图，三屏 console 均无 error/warning）：`work/cocos_art_campaign.png`、`work/cocos_art_deploy.png`、`work/cocos_art_battle.png`。

- **序列帧动画没接**：按 tick 手动切 walk 帧，不是 `AnimationClip`；`attack_front_*` 17 帧、`fx/` 41 张、
  `items_bg`、`panel_frame` 未搬。战斗未接暴击/受击闪白。阴影走 Graphics、小人是 Sprite，是两套绘制。
- 只在 `web-mobile`（debug）验证；`wechatgame` 分包由另一个 agent 做，未联调。
- 资源仍是本地 bundle（`res` 随包），1.31 MB 增量对微信首包的影响待分包方案定。
