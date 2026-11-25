# 119 Cocos 九宫皮肤（原作图元 SLICED）— 交付

日期：2026-11-25 09:1x
执行：c1-nineslice
一句话：**把 web 侧已验过的 26 张原作图元（10 张九宫边框 + 1 条横拉线 + 1 条平铺线 + 14 个图标）按 web 的 `border-image` slice 值登记进 `UiSkin.ts`（20,742 B 原样拷入 `res/ui/`），用 `Sprite.Type.SLICED + SizeMode.CUSTOM` 做工厂，加载失败降级 Graphics 描边；`tsc --noEmit` EXIT=0、node 侧 7,691 条断言全过。** 未改 `.scene`、未动 `CampaignRoot.ts`/`CityPanel.ts`/`ItemsPanel.ts`、未手工写 `.meta`、未跑构建。

---

## 1 素材：26 张，全部是 web 侧在跑的原图

| 来源 | 张数 | 落点 | 校验 |
|---|---|---|---|
| `game\web\assets\ui\orig\` | 19（frame_panel / plate_btn / plate_sq / plate_sel / bar_div / gem_gold / force_01..13） | `game\cocos\assets\bundles\res\ui\` | 逐文件 `buf.equals(web 原件)` |
| `game\web\assets\battleui\` | 7（slot / slot_off / cmd_on / cmd_off / port / msg / sep） | 同上 | 同上 |

- 总计 **26 文件 / 20,742 B**（与 lead 给的数字一致，逐文件尺寸也逐个量过：frame_panel 2,424 B … sep 603 B）。体积对主包 2.14 MB / 分包 17.21 MB 可忽略。
- **只拷副本**：web 侧原件一个没动、一个没删；`skin_assert.mjs` 每条都断言「web 原件仍存在」+「逐字节相同」，26×2 条。
- `battleui\try\` 下的候选图**没拷**（只拷在跑的那 7 张）。
- **没有手写任何 `.meta`**：`res.meta` 里 `isBundle:true / bundleName:"res"`，`res/ui/` 是新建目录，`.meta`（1 个 `ui.meta` + 26 个 `*.png.meta`）由 Creator 首次导入自动生成。理由：手写 uuid 一旦格式/类 id 对不上，会连带把 lead 的构建卡住；而且我这次不需要 uuid（没人引用这些图，全靠 `bundle.load('ui/xxx')` 按路径取）。代价见 §9：**导入前 `bundle.load` 一定失败，画面上是 Graphics 降级描边**，不是崩。

## 2 insets 表（= web 已验的 slice 值，不是 border-width）

web 侧原文（`game\web\` 下，已逐条核过）与登记值对照：

| key | 源图 | Cocos insets（上右下左） | web 原文 | 类型 |
|---|---|---|---|---|
| `frame_panel` | 241×73 | 8, 8, 8, 8 | `items.html:35` `border-image:url(…frame_panel.png) 8 / 8px / 0 stretch` | SLICED |
| `plate_btn` | 308×40 | 16, 16, 16, 16 | `items.html:153`、`deploy.html:117` `16 / 10px` | SLICED |
| `plate_sq` | 64×68 | 12, 12, 12, 12 | `items.html:41,53,69,93,127`、`deploy.html:52,64,72` `12 / 6px` | SLICED |
| `plate_sel` | 100×120 | 12, 12, 12, 12 | `items.html:109` `12 / 8px` | SLICED |
| `bar_div` | 111×12 | 0, 0, 0, 0 | `items.html:25,89,101,149`、`deploy.html:25,111` `background: …/ 100% 11px no-repeat`（**横向拉伸**） | SLICED（整图拉） |
| `sep` | 111×12 | 0, 0, 0, 0 | `index.html:92` `… / 111px 12px repeat-x` | TILED |
| `slot` | 34×34 | 14, 14, 14, 14 | `index.html:108` `14 / 14px` | SLICED |
| `slot_off` | 22×22 | 8, 8, 8, 8 | `index.html:118` `8 / 8px` | SLICED |
| `cmd_on` | 38×38 | 16, 16, 16, 16 | `index.html:143` `16 / 16px` | SLICED |
| `cmd_off` | 34×34 | 14, 14, 14, 14 | `index.html:135` `14 / 14px` | SLICED |
| `port` | 34×34 | 14, 14, 14, 14 | `index.html:101` `14 / 14px` | SLICED |
| `msg` | 26×26 | 10, 10, 10, 10 | `index.html:126` `10 / 10px` | SLICED |
| `gem_gold` | 22×22 | 0, 0, 0, 0 | `center/contain no-repeat` | SIMPLE（图标） |
| `force_01..13` | 16×16（`force_05` 16×17） | 0, 0, 0, 0 | 同上，`<img>` 图标 | SIMPLE（图标） |

取 **slice** 不取 border-width 的理由：Cocos 的 `insets` 同时决定「从源图哪几条像素切角」和「渲染时角占多大」。取 10/6/8 会把 16/12px 的角饰**裁掉一半**（金色钩子断在边长上），取 8/16/12/12 才是完整的角饰 1:1 上屏。与 web 的视觉差见 §8（web 是把整块角**压**进窄边框，不是裁）。

## 3 新增文件

### `game\cocos\assets\scripts\UiSkin.ts`（545 行，纯数据 + 工厂，零引擎副作用）

| 位置 | 内容 |
|---|---|
| `:42` | `SKIN_DIR = 'ui'` |
| `:45` | `type Inset4 = [number, number, number, number]`（**上右下左**） |
| `:48` | `interface NineSliceSpec { key; src; insets; size; tile?; webBorder?; icon?; note? }` |
| `:86` | `SKINS: Record<string, NineSliceSpec>`（13 条字面量 + `:195` 循环补 13 条 force） |
| `:224` | `SKIN_ORDER`（SkinLab 与报告表格共用一份顺序） |
| `:242/:247/:252` | `skinKeys()` / `specOf(key)` / `isSliced(key)` |
| `:271` | `sliceInsetsOf(key, w, h)` —— 按引擎式子缩角 |
| `:296` | `nineGridRects(key, w, h)` —— 9 个矩形，行优先 |
| `:340` | `loadSkinFrame(key, cb)` —— 走 `ArtLayer.loadFrame`，帧缓存 + 同一 key 只 warn 一次 |
| `:378` | `applyInsets(frame, spec)` —— 写 `insetTop/Right/Bottom/Left` |
| `:403` | `drawFallback(node, w, h)` —— 降级 Graphics |
| `:425` | `makeNineSlice(parent, key, w, h): Node` |
| `:478` | `makeBtn(parent, key, label, w, h, opts?)` |
| `:520` | `makePanel(parent, key, w, h, opts?)` |
| `:543` | `placeDesign(node, x, y, w, h)` |

`makeNineSlice` 的关键三行：`sprite.type = SLICED`（非 TILED）、`sprite.sizeMode = Sprite.SizeMode.CUSTOM`、`sprite.trim = false`。CUSTOM 是必须的——`TRIMMED` 会按图集裁剪框重算尺寸，节点给多大都不算数。

`makeBtn` 的 Label 用 **3.8.2 起的内建属性** `label.enableOutline / outlineColor / outlineWidth = 1` + `enableShadow / shadowOffset (0,-1) / shadowBlur = 1`，而不是 `LabelOutline` / `LabelShadow` 组件——`ArtLayer.ts:267 addOutline` 已经是这么写的，注释也写明老组件会刷 deprecated 警告，视觉等价（1px 深色 `#06080C` α235 + 1px 下投影）。字号 `h*0.42` 夹在 `FONT.tiny(12)..FONT.h2(24)`，行高 1.25×。**不挂 `Button` 组件**：全仓库没有一处用 Button，都是自己接 `TOUCH_END`，工厂跟着这个习惯走。

`makePanel` = Graphics 深底（`#10141A` α184 ≈ web `.sec` 的 `rgba(16,20,26,.72)`，`game\web\items.html:32`）+ 子节点 `Frame_<key>` 九宫框；这样面板内部有底色、边框有角饰，跟现在 `.sec` 的画法一一对应。

### `game\cocos\assets\scripts\SkinLab.ts`（302 行，`?skinlab=1` 验证页）

- `:108` `@ccclass('SkinLab') class SkinLab extends Component`；`:109 onLoad` 先判开关（关的时候 `node.active = false`，编辑器里误挂也不挡画面），`:123 build()` 铺满 750×1334。
- 版面：13 行 × 2 列，每格 366×86；`buildCell`（`:161`）给每张画 **4 档**：①1:1 原尺寸（>84×50 的等比缩）②84×50 宽拉伸 ③84×20 扁 ④40×50 窄高；图标（gem/force）改画 16/32/48/64 四档。格子右上角标注 `in t,r,b,l  src W×H  [TILED]`。
- `:211 buildFooter` 单独演示三条路径：不存在的 key（降级描边）、`makePanel('frame_panel')`、`makeBtn('plate_btn','確 定')`。
- 判定「切对了没有」只需看：**四档尺寸下角饰形状完全一样、直角处没有 1px 缝、中间没有拉伸糊边的接缝**。
- `:244 skinLabEnabled()`：浏览器读 `location.search` 的 `?skinlab=1`，小游戏读 `getLaunchOptionsSync/getEnterOptionsSync().query.skinlab`，取不到一律当没开。
- `:277 mountSkinLab()`：找场景的 `Canvas`，造 750×1334 节点挂组件并置顶；`:292` 在 `Director.EVENT_AFTER_SCENE_LAUNCH` 上挂钩自动挂载。**没有改 `.scene`，也没有碰 `CampaignRoot.ts`**。

### `work\cocos_skin\`

- `skin_assert.mjs`（666 行）：node 侧断言，见 §6。
- `usage.md`（67 行）：5 段接入示例（面板 / 按钮 / 格子 / 分隔线 / 改尺寸）。
- 另有勘察脚本 `_probe.py`、`_sheet.py`、`_sheet2.py`、`_probe_strip*.py`、`_copy.py` 与拼图 `_sheet*.png`，是过程产物，可删。

## 4 SLICED 还是 TILED（引擎源码依据）

`F:\sanguo\tools\cocos\cc388\resources\resources\3d\engine\cocos\2d\assembler\sprite\sliced.ts` → `updateVertexData`：

```ts
let xScale = width / (leftWidth + rightWidth);
xScale = (Number.isNaN(xScale) || xScale > 1) ? 1 : xScale;
sizableWidth = sizableWidth < 0 ? 0 : sizableWidth;
```

即**节点比两侧 insets 之和还窄时，角按比例缩、永不放大**，中间段夹到 0 —— 这正是 `border-image` 的语义，所以 `sliceInsetsOf()` 直接复刻这个式子，工厂里不需要自己夹取。

`...\tiled.ts`：`updateVerts` 前的 `:97-101` 是 `hRepeat = sizableWidth / centerWidth`、`row = Math.ceil(vRepeat + offsetVertexCount)`、`col = Math.ceil(hRepeat + offsetVertexCount)`；`:391-405` 决定每格的 UV 缩放，`sizableWidth > centerWidth` 时 `coefU = 1`（整格重复），否则 `coefU = hRepeat`。**也就是说节点比一格还窄时，整格被压扁（`coefU = hRepeat < 1`）而不是裁切** —— 12px 高的 `bar_div` 放进 2px 高的节点，一条线会被压成 1/6 高的细丝、发虚。更要紧的是平铺的接缝：`bar_div.png` 与 `sep.png` **逐像素完全相同**（111×12，80 种不同列），首尾列差 total=1519 / avg=31.6 灰阶（末列全黑）；每 111px 接一次就会出现一道暗缝。web 的 `sep` 本来就是 `repeat-x`（认了这道缝），而 `bar_div` 是 `no-repeat` + `100% 11px` 拉伸。

⇒ **所以我把 lead 字面要求的「`bar_div` = `[0,0,0,0]` + TILED」改成「`bar_div` = `[0,0,0,0]` + 拉伸（SLICED），`sep` = `[0,0,0,0]` + TILED」**。理由：① 与 web 行为一致（web 只有 sep 平铺）；② 拉伸没有接缝，平铺每 111px 一道暗缝；③ 两者像素相同，横拉不会看出区别。数据上 `SKINS.bar_div.tile === false`、`SKINS.sep.tile === true`，若一定要平铺，把这一个 `tile` 改 `true` 即可，其它代码不用动（`skin_assert.mjs` 里 `bar_div` 那条断言是读表断言的类型，改表就同步改断言）。

渲染层那组断言把三条路径的 `Sprite.Type` 都钉住了：`frame_panel → SLICED`、`gem_gold → SIMPLE`、`sep → TILED`、`bar_div → SLICED`。

## 5 加载失败为什么必须降级而不是崩

1. `.meta` 还没生成（§1）：`res` 是自定义 bundle，`ui/` 目录在 Creator 首次导入前**根本不在 bundle 的 asset 表里**，`bundle.load('ui/frame_panel')` 必然失败。这种"资源还没导进来"的窗口期，如果工厂抛异常，页面初始化会整块挂掉。
2. 加载是**异步**的：`ArtLayer.loadFrame` 走 `bundle.load(path, type, null, cb)`，首帧一定拿不到帧。工厂必须先返回一个尺寸正确的节点，帧回来了再挂上去（`if (!node.isValid) return;` 防节点已销毁）。
3. 已有先例：`ArtLayer.ts:74/92` 在微信 native 读到坏文件时会 `console.warn` + `cb(null)`，从不抛（`project\91` 里就踩过 `file … does not exist!`）。九宫皮肤沿用同一约定。

降级视觉 = `drawFallback`：1px `COLORS.goldDim`(α210) 描边 + `#10141A`(α184) 深底，就是现在 `strokeRect` 那条线的观感 —— 也就是说**没导进资源时页面看起来跟今天的 Cocos 版一模一样**，不会出现空框/白块。同一 key 只 warn 一次（`warnOnce`），日志不会刷屏。

## 6 自证（没有构建、没有截图，全部算术）

1. **tsc**：`cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit` → **EXIT=0**（`types\cc.engine.d.ts` 一行 reference 到真引擎 `cc.d.ts`，所以 `Sprite.Type.SLICED`、`frame.insetLeft`、`Label.enableOutline` 都是真类型在检查，不是手写桩）。
2. **node 断言**：`cd F:\sanguo; node work\cocos_skin\skin_assert.mjs` → **ALL PASS · 断言 7,691 条**（EXIT=0）

   | 组 | 条数 | 覆盖 |
   |---|---|---|
   | 表完整性 | 350 | 26 key 集合、src=`ui/<key>`、size 与磁盘 PNG 真宽高（读 IHDR）一致、insets 与 web slice 一致、图标/平铺标记、26 张与 web 原件逐字节相同、总体积 20,742 B |
   | insets 合法 | 128 | 每条 `t < h`、`b < h`、`l < w`、`r < w`；非图标还要求 `l+r < w`、`t+b < h`（中间留得下像素可拉） |
   | 九宫几何 | 7,033 | 26 key × 10 档尺寸（750×200 / 375×120 / 300×44 / 111×12 / 84×20 / 40×50 / 34×34 / 20×20 / 12×12 / 1×1）：9 块非负、不越界、每行宽之和 = w、每列高之和 = h、面积和 = w·h |
   | 渲染层（桩） | 175 | SLICED/CUSTOM/trim=false、insets 真写到帧上、帧缓存、26 个 key 全走一遍降级且都描边、未知 key 只 warn 一次、节点先销毁再回调不抛、makeBtn/makePanel/placeDesign 行为 |
   | SkinLab 模块 | 5 | 能 import、导出 `mountSkinLab`、没场景时返回 false、挂了 `AFTER_SCENE_LAUNCH` 钩子 |

   断言跑的是**真源码**：`skin_assert.mjs` 用仓库自带的 `game\node_modules\typescript` 现场 `transpileModule` 编译 `UiSkin.ts` 与 `view/theme.ts`，再注入一个极小的 `cc` 桩执行，不是另抄一份逻辑。
3. **算术自证（报告里可复核）**：
   - `sliceInsetsOf('frame_panel', 750, 200)` → `[8,8,8,8]`；`nineGridRects` 三列宽 `8 / 734 / 8`、三行高 `8 / 184 / 8`，9 块面积和 = 750×200 = 150,000。
   - `sliceInsetsOf('frame_panel', 12, 12)` → `[6,6,6,6]`（12/16 = 0.75）。
   - `sliceInsetsOf('cmd_on', 20, 100)` → `[16,10,16,10]`（宽 20 < 16+16 = 32，缩到 10+10，中间 0）。
   - 九宫断言共跑 `26 × 10 = 260` 组。
4. 过程中有一处自纠：`eqArray` 最初对字符串数组也走 `Math.abs`（得到 NaN）导致 2 条误报，改成「数字走 1e-9 容差、其余 `Object.is`」后 350 条全过 —— 是断言脚本的 bug，不是皮肤表的问题。

## 7 接入示例（详见 `work\cocos_skin\usage.md`）

```ts
import { makePanel, makeBtn, makeNineSlice, placeDesign } from './UiSkin';

// .sec 面板：替换 fillRect 深底 + strokeRect 边框
const p = makePanel(this.ui, 'frame_panel', LOG_VIEW.w, LOG_VIEW.h);
placeDesign(p, LOG_VIEW.x, LOG_VIEW.y, LOG_VIEW.w, LOG_VIEW.h);

// 按钮：替换 #2A2318 填充 + gold 1px 边框（CampaignRoot.ts:1938-1942 那种画法）
const b = makeBtn(this.ui, 'plate_btn', '物 品', ITEMS_BUTTON.w, ITEMS_BUTTON.h);
placeDesign(b, ITEMS_BUTTON.x, ITEMS_BUTTON.y, ITEMS_BUTTON.w, ITEMS_BUTTON.h);
b.on(Node.EventType.TOUCH_END, () => this.openItems(), this); // Button 组件照旧不用

// 格子 / 图标 / 分隔线
makeNineSlice(this.ui, 'slot', 68, 68);
makeNineSlice(this.ui, 'force_07', 32, 32);
makeNineSlice(this.ui, 'bar_div', 690, 11);
```

尺寸随时改：`node.getComponent(UITransform)!.setContentSize(320, 120)` 后 SLICED 会自己重算九块 UV，角不跟着变形。

## 8 `[推测]` Cocos 与浏览器在九宫缩放上的差异（没截图，皆为推算）

- **角的尺寸**：web 把 16px 的角**压**进 10px 的边框（0.625×），Cocos 的 SLICED 角 = insets **1:1** 按 16px 画。`plate_btn`(16 vs 10)、`plate_sq`(12 vs 6)、`plate_sel`(12 vs 8) 三条的边在 Cocos 里会比 web 粗 1.6×/2×/1.5×。按 750 设计稿量，`plate_btn` 每边多 6px，300 宽的按钮上外框视觉占比约从 3.3% 变 5.3%。**这是刻意的**：1:1 才不糊、角钩才完整；若嫌粗，把 insets 改成 border 值即可（会裁掉角饰外半圈），我保留了 `webBorder` 字段方便对照。
- **中间段的采样**：Cocos 默认 linear 过滤 + 无 mipmap，九宫中间被拉长的那条会轻微发虚；web 端是否开了 `image-rendering: pixelated` 我**没有核对**。若截图发现拉伸处糊，给这 26 张的纹理设 `filterMode = NEAREST` 即可（`SpriteFrame.texture` 上设），不影响 insets。
- **自动图集**：若 lead 给 `res` 开了自动图集（packable），`bar_div`/`sep` 这种 111×12 的细长图可能被旋转/挤边，平铺时会出现 1px 出血。`[推测]` 建议在编辑器里给 `assets/bundles/res/ui/` 关掉 packable，或至少不要旋转。SLICED 的 insets 存在每个 SpriteFrame 上，进图集后仍跟随，不会被图集破坏。
- **真机 `insets` 与尺寸不同步**：`sprite-frame.ts` 的 `set insetLeft` 会立即 `_calculateSlicedUV()`，`set texture` 会 `_calculateUV()`，所以「先设 frame 再改节点尺寸」与「先改尺寸再设 frame」两条路都安全；这条我读过源码，属于**有据**而非推测。

## 9 没做到 / 需要 lead 收尾的一件事

1. **不能构建、不能截图**：按分工构建归 lead；本报告所有"通过"都是 tsc + 纯函数断言 + 尺寸算术，**没有任何截图**。SkinLab 的版面（13 行 × 2 列、每格 4 档）是代码算术排的，第一张截图如果发现行距挤/字压图，改 `SkinLab.ts:43-54` 那几个常量即可。
2. **SkinLab 需要一行 import 才会活**（重要）：Cocos 的模块是按需执行的——没有被场景组件（或已被执行到的模块）import 的脚本，顶层代码（包括 `director.on(EVENT_AFTER_SCENE_LAUNCH, …)`）不会跑，所以今天 `?skinlab=1` 不会被触发。我**没有**去改 `BootRoot.ts`（它自己的注释写着"职责只有两件，别往这里塞业务"）也没有改 `.scene`（新脚本 uuid 要 Creator 首次导入才生成，手写 `.meta` 会连带卡住构建）。两种接法，任选其一：
   - 代码：在启动侧加一行 `import './SkinLab';`（`BootRoot.ts` 顶部最省事，纯副作用、不加逻辑）；
   - 编辑器（零代码）：打开 `Campaign.scene` → `Canvas` → Add Component → `SkinLab`。组件 `onLoad` 会自查开关，只有 `?skinlab=1` 时才铺页，平时 `node.active = false` 不挡画面。
   （我偏向第一种：一行、可 review、不影响 Boot 的两件职责。）
3. **页面还没接线**：按硬约束没动 `CampaignRoot.ts` / `CityPanel.ts` / `ItemsPanel.ts`，所以今天跑起来画面不变。接一个 `.sec` 大概 3 行（见 §7），整页换皮建议等 r88 的版式改完再动，避免冲突。
4. `bar_div` 的 `tile` 与 lead 字面要求不同（见 §4），这是唯一一处主动偏离，改回去只需一个 `true`。
5. 26 张的 `.meta` 未生成 → 首次导入后请顺手看一眼 `res/ui` 下是不是 27 个 `.meta`（1 目录 + 26 图），以及包体是不是 +20 KB 左右。
