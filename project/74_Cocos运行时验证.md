# 74 · Cocos 运行时验证（web-mobile 构建产物 + 微信小游戏包静态完整性）

- 验证时间：2026-11-25 05:1x–05:4x
- 验证对象（只读）：`F:\sanguo\game\cocos-build\web-mobile\`（最新一次构建，3127 文件 / 45,690,454 B）、`F:\sanguo\dist\wechat-upload\`（2867 文件 / 15,822,149 B）
- 全部脚本与截图：`F:\sanguo\work\cocos_verify\`
- 未修改任何 `game\**` 源码或构建产物；本文件之外的写入只有 `work\cocos_verify\**`。

---

## 0. 一句话结论

**Cocos 版能跑起来，跑的是真渲染，而且交互链是通的**：有头/无头 Edge 双路实测 WebGL2 正常、`cc 3.8.8` 加载成功、Boot→Campaign 自动跳转、大地图完整渲染；**真鼠标点击走通了「点敌城 → 出征 → Deploy 出征编成屏」全链路**（目标易京 / 从北平出征 / 守军 110 兵 / 主将公孙瓒），也走通了「推进一月」改状态。
**但 Battle 一进就崩，黑屏**——`BattleBg.ts` 从 `'cc'` 导入的 `Mask` 在这份构建的 ES 模块命名空间里是 `undefined`（引擎只导出 `MaskComponent`），`clip.addComponent(undefined)` 抛 `Error 3804`，`onLoad` 中断，UI 一个没建出来（场景只剩 6 个节点、0 个 Label、0 个 Sprite）。
**即：可启动、可走大地图与出征编成、不可战斗。**

⚠ 另外一条必须先知道的事实：**`game\cocos-build\web-mobile` 是过期产物**——构建 04:49:38，而源码 `CampaignRoot.ts` 是 05:02:13（微信包是 05:26:03）。该产物里**没有** `CityPanel` / `ItemsPanel` / `openItems` / `openCityPanel` / `物 品`（命中 0 次），所以内政面板、物品面板在 web-mobile 上是**点不出**的（不是坐标问题，是代码不在产物里）；任务要求的 City / Items 截图只有在**重新构建后**才可能拿到。

微信小游戏包：静态断言 **26/30 通过**，4 条失败——子包 13.83 MB（超微信单分包 4 MB 约 3.5×）、109 个 `audio/*` 资产被剔除但仍被声明、`game.json` 子包 root 带尾斜杠、6 个文件残留 `audio/` 悬挂引用。

---

## 1. 执行环境

| 项 | 值 |
|---|---|
| 浏览器 | Microsoft Edge **158.0.4370.33**（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，本机无 Chrome） |
| Node | v24.21.0（CDP 用原生 `fetch` + 原生 `WebSocket`，**未安装任何依赖**） |
| 站点 | `http://127.0.0.1:5173/cocos-build/web-mobile/index.html`（既有 5173 服务，`game\` 为站点根，未改动） |
| 有头参数 | `--remote-debugging-port=9222`、`--user-data-dir=F:\sanguo\work\.edgeprof_cocos2`、`--window-size=900,1500`、`--force-device-scale-factor=1` |
| 无头参数 | `--headless=new`、`--enable-unsafe-swiftshader`、`--window-size=900,1400`、`--user-data-dir=F:\sanguo\work\.edgeprof_headless`、端口 9231 |
| 截图方式 | CDP `Page.captureScreenshot`（**不是** `msedge --screenshot`，原因见第 5 节） |

启动方式一律 `Start-Process`（`&` 直接调 msedge 会静默失败），且 `--window-size=` / `--remote-debugging-port=` 先赋变量再入数组（否则报 `Multiple targets are not supported`）。

---

## 2. canvas / WebGL 探针（`Runtime.evaluate`）

### 2.1 有头 Edge

```json
{
  "url": "http://127.0.0.1:5173/cocos-build/web-mobile/index.html",
  "innerWH": [876, 1368],
  "canvasBitmapWH": [876, 1368],
  "canvasCSSWH": [876, 1368],
  "canvasHW": [876, 1368],
  "GameDiv": "876x1368 display:block",
  "Cocos3dGameContainer": "876x1368 display:block",
  "gl2": true,
  "gl1": true,
  "offscreenGL2": true,
  "glVersion": "WebGL 2.0 (OpenGL ES 3.0 Chromium)",
  "hasCC": "object",
  "ccVersion": "3.8.8",
  "director": true,
  "sceneName": "Campaign",
  "totalFrames": 706,
  "winErrHook": [],
  "winError": "undefined"
}
```

- **不是 canvas 0×0**，也不是 WebGL 缺失：`gl2:true`，且离屏 WebGL2 同样可用。
- 设计分辨率/适配：`getDesignResolutionSize()=[750,1334]`、`getVisibleSize()=[750,1334]`、`getScaleX()==getScaleY()==1.025487256371814`、`getFrameSize()=[876,1368]`、dpr=1、`getViewportRect()={x:53,y:0}`（左右各 53px 黑边）。
- 时间线（有头，t=0 为 navigate）：`t=38ms` 尚无 `cc`、canvas 还是 300×150 → `t=561ms` `cc` 出现、canvas 已 876×1368 → `t≈2.09s` `scene=Boot`、frames=2 → `t≈2.6s` `scene=Campaign` → 之后稳定出帧（14 s 时 706 帧）。
- **首帧在 ~2.4–2.6 s**，这个数字是第 5 节「纯白之谜」的关键。

### 2.2 无头 Edge（`--headless=new --enable-unsafe-swiftshader`）

```json
{
  "gl2": true, "offscreenGL2": true,
  "glVersion": "WebGL 2.0 (OpenGL ES 3.0 Chromium)",
  "hasCC": "object", "ccVersion": "3.8.8",
  "sceneName": "Campaign", "totalFrames": 1222,
  "innerWH": [876, 1408], "canvasBitmapWH": [876, 1408],
  "exceptionCount": 0, "netFails": 0
}
```

**无头和有线一样正常**。之前「headless 只得到纯白」不是 headless 的锅。

---

## 3. Console 记录（前 30 条，按顺序，实际条目更少则全列）

> 说明：`Runtime.enable` 会回放页面已有的 console 历史，所以每个步骤文件里都能看到本次启动的 2 条 `timeEnd`。以下以**一次干净启动**为准。

### 3.1 干净启动 · 有头（全量，共 2 条，无任何 warning/error）

```
0 [timeEnd] LoadScene db://assets/scene/Boot.scene: 16.9 ms
1 [timeEnd] LoadScene Campaign: 17.6 ms
```

`exceptionCount = 0`，`Network.loadingFailed` = 0。41 条/30 组的上限内**没有第 3 条**，也没有 404、没有 `Error 3804`。

### 3.2 干净启动 · 无头（全量，共 2 条）

```
0 [timeEnd] LoadScene db://assets/scene/Boot.scene: 17.0859375 ms
1 [timeEnd] LoadScene Campaign: 19.076171875 ms
```

### 3.3 进入 Battle（共 5 条，其中 1 条 error —— 这是本次唯一真实运行时错误）

```
0 [timeEnd] LoadScene db://assets/scene/Boot.scene: 16.951904296875 ms
1 [timeEnd] LoadScene Campaign: 16.346923828125 ms
2 [timeEnd] LoadScene Battle: 17.902099609375 ms
3 [error] TypeError: Error 3804, please go to https://github.com/cocos/cocos-engine/blob/3.8.8/EngineErrorMap.md#3804 to see details.
    at e.addComponent (http://127.0.0.1:5173/cocos-build/web-mobile/cocos-js/cc.ac421.js:1:382014)
    at new t        (http://127.0.0.1:5173/cocos-build/web-mobile/assets/main/index.2e8e7.js:11:1693)
    at o.buildUi    (http://127.0.0.1:5173/cocos-build/web-mobile/assets/main/index.2e8e7.js:13:6934)
    at o.onLoad     (http://127.0.0.1:5173/cocos-build/web-mobile/assets/main/index.2e8e7.js:13:2428)
    at eval / e._invoke / i.invoke / e.activateNode / e._activate / i.runSceneImmediate (cc.ac421.js)
4 [timeEnd] LoadScene Campaign: 20.55419921875 ms      ← 我手动 loadScene 回大地图
```

完整未截断版本：`F:\sanguo\work\cocos_verify\console_steps_battle_canon.json`。

> 早期几次跑出现 81 条同样的 3804，是**我自己探针的副作用**（遍历节点时 `getComponent(cc.UITransform)`，而发布包里 `window.cc.UITransform === undefined`）。干净基线 + 重载测试均为 0 条，已排除。判据只能用 CDP 侧 `Runtime.consoleAPICalled`——引擎会缓存 `console.error` 引用，页面内 patch 抓不到。

---

## 4. 交互实证（真鼠标事件，`Input.dispatchMouseEvent` 三次：moved/pressed/released）

坐标换算：`页面坐标 = [vp.x + designX*scale, vp.y + designY*scale]`，**y 不翻转**（游戏内 rect 是左上原点 y 向下）。

| 动作 | 页面坐标 | 结果 |
|---|---|---|
| Campaign 点「推進一月」（第 3 个动作按钮，design 中心 618.3,1172） | (687, 1202) | `labelMonth` `第 1 年 1 月`→`第 1 年 2 月`；`gold` 1200→**1464**（+264）；`labelStats`→`金 1464    城 3    戰績 0 勝 0 敗`；`hint`→`推進一月：稅收 +264 金。` |
| Campaign 点**敌城「易京」**（design 689,338） | (760, 346) | `selected` → `易京`；动作栏从 `[徵兵,開發,推進一月]` 变成 `[出 征, 推進一月]`，按钮标题 `出 征 / 目標 易京 · 守 守備隊 · 關羽` |
| 点「出 征」（actionRects[0] 中心，design 192,1172） | (250, 1202) | `LoadScene Deploy: 28.51 ms`，`scene.name === "Deploy"`，**0 报错**；编成屏显示「目標 易京 · 從 北平 出征 · 守軍 110 兵」、主将 公孫瓚（武力86/智力70/等級20）、三个武将头像（公孫瓚/嚴綱/公孫越）、長槍·錐形·100 兵 |
| Deploy 点「出征」（design 中心 561,1252） | (628, 1284) | `LoadScene Battle`，随后第 3.3 节那条 3804 报错（→ 黑屏） |
| Campaign 点右上「物 品」热区（`ITEMS_BUTTON {x:560,y:64,w:176,h:52}` 中心） | (718, 92) | **面板没打开**（`comp.itemsPanel` 仍为 null，console 无错）——因为该产物里连 `openItems` 方法都没有，见第 6.5 节 |
| Campaign 点自己的城「襄平」（design 689,337） | (760, 346) | **内政面板没打开**（`comp.cityPanel` 为 null）——同上，`openCityPanel` 不在产物里 |
| Battle 崩溃后 `loadScene('Campaign')` | — | `LoadScene Campaign: 20.55 ms`，回到大地图正常，帧数继续增长 |
| `Page.reload` 整页重载 | — | 仍在 Campaign，帧数继续增长，0 异常（重载健壮） |

> 真点敌城 → 出征 → Deploy 这一条是**完整走 UI 的**（不是 `loadScene` 硬跳），截图 `F:\sanguo\work\cocos_verify\campaign_to_deploy.png`（598,462 B）。
> 「点自己的城 / 点物品」没反应的那两次，事后用 `comp.openCityPanel is not a function` / `comp.openItems is not a function` 证实是**产物缺代码**，不是点击坐标错。

Campaign 场景数据也是真加载：`cities.length=60`、`save={month,gold,cityIds[60]}`、`data` 键 `[magics,wises,generals,terrains,items,scenarios,garrison]`（`data/*.json` 全部命中，无 404）。

Deploy 场景实测 `loaded:true`、`troop:6`、`form:1`、`soldiers:100/cap:100`，11 个按钮可交互，UI 完整（兵种与阵形网格带「未學」置灰 / 兵力滑杆 / 返回大地图·出征）。

### 场景清单（重要修正）

`assets\main\config.2e8e7.json` 的 `scenes` 只有 **4 个**：`Boot.scene`(0)、`Battle.scene`(1)、`Campaign.scene`(2)、`Deploy.scene`(3)。
**没有 City / Items 场景**。在当前源码里 City / Items 是**面板**（`CityPanel.ts` / `ItemsPanel.ts`，作为 Campaign 的子面板挂出来，不走 `loadScene`），而这版 web-mobile 产物里**面板代码根本没被打进去**（见 6.5），所以 City / Items 截图在现有产物上无法产出。

---

## 5. 「纯白 5780 B」之谜：截图方法问题，不是运行时问题

复现实验（完全照「一步到位」写法，一次性截图）：

| 命令 | 产物 | 字节 |
|---|---|---|
| `msedge --headless=new --disable-gpu --window-size=900,1400 --screenshot=oneshot_cocos.png <URL>` | `oneshot_cocos.png` | **6,590**（整张纯 `#2b2b2b` 空白） |
| 同上换 `--enable-unsafe-swiftshader` | `oneshot_cocos_swiftshader.png` | **6,586**（同样空白） |
| 同上再加 `--virtual-time-budget=12000` | `oneshot_vtb.png` | **6,586**（依然空白） |

根因：`--screenshot` 在 `load` 事件后**立刻**截屏，而 Cocos 首帧在 **~2.4 s**（见 2.1 时间线，`t=561ms` 才刚有 `cc`，`t=2093ms` 才 frames=2）。截到的是尚未绘制的画布。`--virtual-time-budget` 也救不了（虚拟时间不推进 WebGL 呈现）。

**可靠做法**（本项目已留工具）：CDP `Page.captureScreenshot`，等 `cc.director.getScene()` 就绪（或 `scene.name==='Campaign'`）后再截 → 857,868 B 的真实画面。

### 最小复现（`work\cocos_verify\min_webgl.html`）

750×1334 纯 canvas + `getContext('webgl2')` + `clearColor(1,0,0,1)` + 一行 `✓/✗` 文字，同参数一次性截图：

- `min_webgl_headless.png` = **46,252 B，整张纯红**
- 页面文字：`✓ webgl2 正常 | WebGL 2.0 (OpenGL ES 3.0 Chromium) | WebKit WebGL | WebKit`

**红/白结论**：浏览器（有头 + 无头 + swiftshader）**给** WebGL。若有问题也只可能是 Cocos 工程自身的，不是浏览器不给 WebGL。

---

## 6. Battle 黑屏根因：`Mask` 导出名不匹配（可一行修）

### 6.1 崩溃现场

- 栈顶 `index.2e8e7.js:11:1693` → 该位置是 `BattleBg.ts` 模块 setter 里的 `o.addComponent(d).type = d.Type.GRAPHICS_RECT`，其中 `d` 来自 `cc` 依赖的 `t.Mask`。
- 探针（重写 `Node.prototype.addComponent` 记录 falsy 类名）实测**唯一**一次 falsy 调用：

```json
{"node":"FloorClip","argc":1,"ctor":"undefined",
 "stack":"at proto.addComponent | at new t (index.2e8e7.js:11:1693) | at o.buildUi (index.2e8e7.js:13:6934) | at o.onLoad (index.2e8e7.js:13:2428)"}
```

### 6.2 为什么是 undefined（关键证据，重载后复测一致）

```js
// System.import('cc') 的 ES 模块命名空间：378 个键
{ hasMaskOwn: false, inMask: false, mask: "undefined",
  maskLike: ["BitMask", "BITMASK_TAG", "MaskComponent"],   // ← 只有 MaskComponent
  uiTransform: "function", uiOpacity: "function", label: "function", graphics: "function" }
// window.cc（cclegacy 视图）：194 个键
{ mask: "function", uiTransform: "undefined", uiOpacity: "undefined" }

// 等价性判定
MaskComponent === window.cc.Mask  →  true
MaskComponent.prototype instanceof Component → true
MaskComponent.Type → { GRAPHICS_RECT:0, GRAPHICS_ELLIPSE:1, GRAPHICS_STENCIL:2, SPRITE_STENCIL:3 }
new cc.Node().addComponent(MaskComponent) → 成功
```

也就是说：**类在引擎里存在（`cclegacy.Mask` 就是它），但这份构建的 `cc` ES 模块只导出了名字 `MaskComponent`，没有 `Mask` 别名**。

引擎包内的直接证据（`F:\sanguo\game\cocos-build\web-mobile\cocos-js\cc.ac421.js`，1,536,817 字符）：

```js
S.MaskComponent=Uz, ae(Uz,"cc.MaskComponent")     // ← 正式导出：MaskComponent（并注册类名 cc.MaskComponent）
...
Jv._maskComp=Uz, S.Mask=Uz, St({RenderComponent:{newName:"UIRenderer",since:"1.2.0",removed:!0},...})
                                                  // ← Mask 属于「带 removed:!0 的废弃别名表」，不进程 ESM 导出
```

`--` 即 `Mask` 这个名字在 3.8.8 的构建产物里成了**废弃别名**（`S.*` 表里还在，`ae()` 注册的正式类名是 `cc.MaskComponent`），ESM `System.import('cc')` 不再提供它。编辑器里能跑、构建后就 undefined，正是这个差异。

源码侧（只读确认）`F:\sanguo\game\cocos\assets\scripts\BattleBg.ts`：
- `:26` `import { Color, Graphics, Layers, Mask, Node, Sprite, SpriteFrame, UITransform } from 'cc';`
- `:117` `const mask = clip.addComponent(Mask);`
- `:118` `mask.type = Mask.Type.GRAPHICS_RECT;`

→ `Mask === undefined` → `addComponent(undefined)` → 引擎 `Iy()` 走 falsy 分支 `rt(3804)` → `throw TypeError(ut(3804))` → `buildUi` 在 `onLoad` 中断。

### 6.3 后果

Battle 场景树只剩 6 个节点、**0 个 Label、0 个 Sprite**：

```
Battle
└─ Canvas
   ├─ BattleHudBar   (空)
   ├─ Camera
   └─ BattleBg
      └─ FloorClip   ← 只建到 mask 这一行就崩了
```

截图 `battle_canon.png` = **65,936 B**，肉眼只有顶上一条 HUD 横幅（左右兽首），其余整屏纯黑。帧数仍在涨（渲染循环没死），但没有任何战斗 UI → **不可玩**。

### 6.4 建议修法（按代价排序）

1. **一行改名**（推荐，已验证等价）：`BattleBg.ts:26` 改成 `import { ..., MaskComponent as Mask, ... } from 'cc';`，`:117/:118` 不动；或把两处 `Mask` 直接写成 `MaskComponent`。改完重构建，Battle 应能建出 UI。风险：需在 Creator 里确认 3.8.8 的 `cc.d.ts` 是否导出 `MaskComponent`（引擎运行时确有这个导出）；若 d.ts 不认，见 2/3。
2. 不用 `Mask`：用 `Graphics` 画矩形 / 用 `UITransform` + 裁剪节点方式替代（`FloorClip` 只是矩形裁剪，成本很低）。
3. 兜底：`import { cclegacy } from 'cc'` 后 `cclegacy.Mask`（`window.cc.Mask` 实测是合法组件类）。
4. 不要试图在运行期「打补丁」绕过：setter 早已把 `Mask` 绑成 `undefined`，注入命名空间或替换 `addComponent` 都来不及（已实测，仍黑屏）。**必须改源码重构建。**

> 附带发现：`window.cc`（cclegacy 视图）只有 194 个键，`UITransform`/`UIOpacity` 在那里是 `undefined`。任何探针/脚本不要用 `window.cc.UITransform`，会误触发 3804；用 `System.import('cc')`。

### 6.5 顺带查出的更大的问题：`web-mobile` 产物落后于源码

| 对象 | 时间戳 | 关键能力 |
|---|---|---|
| `F:\sanguo\game\cocos-build\web-mobile\assets\main\index.2e8e7.js` | **2026-11-25 04:49:38**（234,222 字符） | 无 `CityPanel` / `ItemsPanel` / `openItems` / `openCityPanel` / `物 品`（**各 0 次命中**） |
| `F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts`（源码） | 2026-11-25 **05:02:13** | 有 `openCityPanel()` / `openItems()` / `ITEMS_BUTTON` / `actions()` 的 `march` 分支 |
| `F:\sanguo\dist\wechat-upload\assets\main\index.5e375.js` | 2026-11-25 **05:26:03**（317,489 字符） | **有**：`CityPanel`(14) / `ItemsPanel`(13) / `openItems`(2) / `openCityPanel`(2) / `物 品`(2) |

结论：**web-mobile 这次构建（04:49）比当前源码旧 13 分钟，比微信包旧 36 分钟**，内政/物品面板根本没打进去。所以：

- 我报告的 Battle 崩溃、Campaign 交互，全部基于 **04:49 那版 web-mobile**；
- 「点自己的城 / 点物品」在 web-mobile 上点不动，是**产物缺代码**，不是 UI bug、也不是我的坐标错（`comp.openCityPanel is not a function` 直接证实）；
- 任务要的 City / Items 截图，必须在**重新构建 web-mobile** 之后才能拿；现产物下无解。
- 微信包（05:26）虽然功能更全，但 `BattleBg` 同样在（`Mask` 命中 1 次、`MaskComponent` 0 次），且**微信引擎包 `cocos-js\cc.705f1.js` 的导出表同样是 `MaskComponent`**（`MaskComponent=` 1 次、`[^A-Za-z0-9_]Mask=` 也是废弃别名表）→ **微信包大概率同样 Battle 黑屏**（未实测，本机无微信开发者工具）。

---

## 7. 微信小游戏包静态完整性断言（`F:\sanguo\dist\wechat-upload`）

脚本 `F:\sanguo\work\cocos_verify\wechat_check.mjs`（零依赖，结果落 `wechat_check.json`）。
**结果：26/30 通过，4 条失败。**

> 注意：`dist\wechat-upload` 是 **05:26 的另一次构建**（比 web-mobile 04:49 新，含 CityPanel/ItemsPanel），文件名哈希与 web-mobile 完全不同（`application.a23d3.js` / `settings.d828b.json` / `main config.5e375.json` / `res config.5f8c7.json` / `cc.705f1.js`）。本节数字只代表这一版。

```
✓ M1 game.json 可解析 :: ["deviceOrientation","networkTimeout","subpackages"]
✓ M2 deviceOrientation=portrait
✓ M3 声明 subpackages :: count=1 names=res
✗ M4 子包 root 无首尾斜杠 :: res -> "subpackages/res/"   ← 微信要求 root 是纯目录名，尾斜杠有被判非法风险
✓ M5 子包目录存在 [res] :: subpackages/res
✓ M6 子包 entry [res/game.js] :: 40 B :: "// asset-only subpackage: no entry code\n"
✓ S1 settings 可解析 :: settings.d828b.json (1982 B)
✓ S2 launchScene 在 main.scenes 内 :: Boot.scene | 场景= Battle/Boot/Campaign/Deploy
✓ S3 bundleVers 与磁盘 config 哈希一致 :: internal 8f131/8f131  main 5e375/5e375  res 5f8c7/5f8c7
✓ S4 projectBundles 目录存在 :: [ internal main res ] missing=[]
✓ S5 settings.assets.subpackages 与 game.json 一致 :: ["res"] == ["res"] | server="" remoteBundles=[]
✓ G1 game.js 静态 require 目标全部存在 :: ./web-adapter ✓ ./first-screen ✓ src/polyfills.bundle.43263.js ✓ src/system.bundle.f45da.js ✓ src/import-map.b9ad8.js ✓ ./engine-adapter ✓
✓ G2 game.js 首行是 __initApp 且无 BOM :: "function __initApp () {  // init app"
✓ G3 application.*.js 存在且被 game.js 引用一致 :: disk=application.a23d3.js | 引用=application.a23d3.js
✓ G4 cocos-js 引擎存在 :: cc.705f1.js 1,392,029 B
✓ G5 adapters 存在 :: web-adapter.js=90055 engine-adapter.js=20342 first-screen.js=18877
✓ A internal import 全命中 :: 1/1
✓ A internal native 全命中 :: 0/0
✓ A main import 全命中 :: 6/6
✓ A main native 全命中 :: 0/0
✓ A res(子包) import 全命中 :: declared=1484 have=135 missing=0
✗ A res(子包) native 全命中 :: declared=1461 have=1350 missing=109
✓ A res(子包) 缺失项归类 :: missing=109 其中 audio 路径=109（样例 36=audio/sfx/m038snd01、51=audio/bgm/06、85=audio/sfx/m020snd02、89=audio/sfx/m005snd01）
✓ S6 四个场景都在 main.scenes
✓ S7 main uuids 数量 >= 场景数 :: uuids=6 scenes=4
✗ A5 无 audio 悬挂引用 :: 6 个文件命中 —— assets\main\index.5e375.js(2)、audio-manifest.json(219)、subpackages\res\config.5f8c7.json(110)、res import json ×2（4/1）
✓ A6 磁盘上 audio 目录文件 :: 0 个命中 /audio/
✓ A7 audio-manifest 可解析 :: {version:1, bundle:"res", source:"assets/bundles/res/audio", count:109, bytes:16851271}
✓ Z1 总体量 :: files=2867 bytes=15,822,149 (15.82 MB)  主包 1.99 MB  子包 13.83 MB
✗ Z2 子包体积（微信单分包上限） :: subpackages/res = 13.83 MB / 超限 3.5×
```

### 7.1 四条失败的含义

1. **M4 子包 root 带尾斜杠**（`"subpackages/res/"`）：微信的 `subpackages[].root` 要求是目录名（不带首尾 `/`）。轻则警告，重则该分包被判非法、`res` 里的贴图全加载不到——**装上去白屏的头号嫌疑**。改成 `"subpackages/res"`。
2. **A native 缺 109 个，全部是 `audio/*`**：`res` bundle 的 `config.5f8c7.json` 仍声明 1461 个 native 资产，磁盘只有 1350 个；缺的 109 个与 `audio-manifest.json` 记录的 `count:109, bytes:16,851,271`（16.87 MB）完全吻合（bgm/sfx 的 mp3/ogg）。而 `settings.assets.server=""`、`remoteBundles=[]` → **没有远程分包兜底**，这些音频既不在包里也不在 CDN 上。运行到播放音效/ BGM 时会 load fail（不影响首屏，但会让战斗/事件流程报错或静音）。
3. **A5 悬挂引用**：`assets\main\index.5e375.js` 里 2 处、`subpackages\res\config.5f8c7.json` 里 110 处仍指向 `audio/...`，与第 2 条同源。
4. **Z2 单分包 13.83 MB**：按微信小游戏代码包限制（主包/单分包 4 MB、全部分包合计 20 MB，以后台当期规则为准），`res` 子包超 **3.5×**，直接上传会被拒；图片已是 webp/png（单张最大 414,205 B），zip 不会显著变小。要真机验证必须先解决体积（进一步压图 / 拆多分包 / 远程化）。

### 7.2 通过项说明（能排除的坑）

- 入口链完整：`game.js` 静态 `require` 的 6 个目标全在，`application.a23d3.js` 与引用一致，`cocos-js/cc.705f1.js` 1.39 MB 在包内，adapters 三个都在。
- `subpackages/res/game.js` **存在**（40 B，`// asset-only subpackage: no entry code`）——之前担心的「子包缺 entry」不成立。
- `bundleVers` 与磁盘 config 哈希三 bundle 全一致，`projectBundles` 目录齐全，四个场景都在 `main.scenes`，`launchScene` 可解析。
- `res` 的 1484 个 import 全命中（配置与文件对得上）。

---

## 8. 复现方式（都在 `F:\sanguo\work\cocos_verify\`）

```powershell
cd F:\sanguo\work\cocos_verify

# 1) 起有头 Edge（9222）并打开构建页，等 cc 就绪
node cdp.mjs launch

# 2) 跑任意步骤（连现有页，收 console/异常/网络失败，出图）
node cdp.mjs run steps_battle_canon.mjs     # Battle 黑屏 + 完整 console dump
node cdp.mjs run steps_campaign.mjs         # 大地图 + 点「推進一月」
node cdp.mjs run steps_deploy.mjs           # Deploy 出征編成
node cdp.mjs run steps_ccmask2.mjs          # cc 命名空间 Mask/MaskComponent 证据
node cdp.mjs run steps_maskcomp.mjs         # MaskComponent 等价性判定
node cdp.mjs run steps_march.mjs            # 全链路：物品热区 / 内政城 / 敌城→出征→Deploy
node cdp.mjs run steps_panels.mjs           # 面板方法是否存在（产物是否过期）

# 3) 收浏览器
node cdp.mjs close

# 4) 一次性探针 + 截图（可加 HEADLESS=1 / GPU_ARGS=...）
node verify.mjs
TAG=headless_swiftshader HEADLESS=1 PORT=9231 PROFILE=F:\sanguo\work\.edgeprof_headless GPU_ARGS=--enable-unsafe-swiftshader WAIT_MS=20000 node verify.mjs

# 5) 微信包静态断言
node wechat_check.mjs
```

---

## 9. 产物清单（截图 / 证据）

| 文件 | 字节 | 内容 |
|---|---|---|
| `F:\sanguo\work\cocos_verify\web_mobile_boot.png` | 857,868 | **有头 Edge，Boot→Campaign 后的大地图（本次主证据）** |
| `F:\sanguo\work\cocos_verify\default_t1.png` / `default_t2.png` | 857,869 / 857,868 | 同上（原始命名，t1/t2 两次截图） |
| `F:\sanguo\work\cocos_verify\headless_swiftshader_t2.png` | 879,008 | 无头 + swiftshader 的同一画面（证明无头也正常） |
| `F:\sanguo\work\cocos_verify\campaign_advance_month.png` | 850,606 | 真点「推進一月」后的第 1 年 2 月 / 金 1464 |
| `F:\sanguo\work\cocos_verify\deploy_scene.png` | 575,369 | 出征編成完整 UI（硬跳 Deploy 那次） |
| `F:\sanguo\work\cocos_verify\campaign_to_deploy.png` | 598,462 | **真点击走通的全链路**：大地图点易京 → 出征 → Deploy「目標 易京 · 從 北平 出征 · 守軍 110 兵 · 公孫瓚」 |
| `F:\sanguo\work\cocos_verify\items_panel.png` / `city_panel.png` / `city_panel_direct.png` | 858,208 / 858,209 / 858,209 | 点「物 品」热区、点自己的城：**面板没打开**，画面与大地图相同（产物缺 CityPanel/ItemsPanel） |
| `F:\sanguo\work\cocos_verify\after_go_click.png` / `battle_canon.png` / `battle_scene.png` | 各 65,936 | **Battle 黑屏**（只剩顶部一条 HUD 横幅） |
| `F:\sanguo\work\cocos_verify\oneshot_cocos.png` / `oneshot_cocos_swiftshader.png` / `oneshot_vtb.png` | 6,590 / 6,586 / 6,586 | 「一次性 `--screenshot` 抢跑」的空白 —— 与原报的 5780 B 纯白同类 |
| `F:\sanguo\work\cocos_verify\min_webgl_headless.png` | 46,252 | 最小复现：整张纯红 + `✓ webgl2 正常` |
| `F:\sanguo\work\cocos_verify\min_webgl.html` | 1,776 | 最小复现页面（红色清屏 + WebGL 探测） |
| `F:\sanguo\work\cocos_verify\console_steps_battle_canon.json` | 1,577 | Battle 那次运行的完整未截断 console |
| `F:\sanguo\work\cocos_verify\console_steps_march.json` | 1,489 | 全链路那次运行的完整 console（3 条 timeEnd、0 error） |
| `F:\sanguo\work\cocos_verify\wechat_check.json` | 5,335 | 30 条静态断言的机器结果 |

---

## 10. 没做到 / 未覆盖

1. **Battle 修复未验证**：我没改 `game\cocos\**`（死规矩只读），所以「`Mask`→`MaskComponent` 后 Battle 能玩」只是**强证据推断**（等价性 + `addComponent` 成功已实测），不是端到端跑通。
2. **City / Items 截图拿不到**：不是我没点，是 04:49 那版 web-mobile 产物里没有 `CityPanel`/`ItemsPanel`（详见 6.5）。要拿这两张图必须先重构建，然后我可以直接跑 `steps_march.mjs` 的同类脚本补上。
3. **未验证「新构建」**：我的运行时结论全部基于 04:49 的 web-mobile 与 05:26 的微信包；两者都不是「当前源码 + 当前时间」的产物，源码里 05:02 之后的变化没有被运行验证。
4. **微信小游戏没有真机 / 模拟器验证**：第 7 节全是静态断言；微信开发者工具不在本次范围、也未安装。Battle 在微信包上是否同样黑屏只是静态推断。
5. **音频缺失的运行时影响未实测**：109 个音频文件不在包里，理论上 load fail；我没有跑到触发音效的战斗流程（Battle 本来就崩）。
6. 浏览器只有 Edge 158（本机无 Chrome / Firefox / Safari），跨浏览器未验证。
7. 没有测真实触摸（`Input.dispatchTouchEvent`），全部用鼠标事件；微信小游戏真机是触摸路径，理论上 Cocos 两者都收，但未实证。

---

## 11. 给下一步的最小动作清单

1. **先重构建** `web-mobile`（当前产物 04:49，源码已 05:02+），否则内政/物品面板任何时候都验不出来。
2. `game\cocos\assets\scripts\BattleBg.ts:26`：`Mask` → `MaskComponent as Mask`（或两处改用 `MaskComponent`），一起进这次重构建。
3. 重跑 `node cdp.mjs run steps_battle_canon.mjs`：验收标准 = `nodes > 50`、`labels > 0`、截图 **远大于 65,936 B**、console 无 3804。
4. 重跑 `node cdp.mjs run steps_march.mjs`：这一版应能点开内政面板（`cityPanel:true`）与物品面板（`itemsPanel:true`），截图补上 City / Items。
5. `dist\wechat-upload\game.json`：`"root": "subpackages/res/"` → `"subpackages/res"`。
6. 决定音频策略（三选一）：把 109 个文件放回包内 / 构建时彻底剔除并改 `audio-manifest` 与 config 声明 / 配 `assets.server` 走远程。
7. 解决 `res` 子包 13.83 MB 超限（压图 / 拆 4 个分包 / 远程），否则微信包上不了架。
