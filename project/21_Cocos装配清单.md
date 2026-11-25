# 21 · Cocos 装配清单（Creator 3.8 · 装配前状态）

> 本机没有 Creator，本文把「人一装上编辑器就能在 1 天内装完」写死。
> 现状（2026-11-24 实测）：`game/cocos` 有 5 个脚本 + 559 个资源，**0 个 `.scene` / `.prefab` / `.meta`**。
> **结论先行：4 个场景 × 1 个脚本、0 条编辑器连线。** 要做的只有「新建 4 个空场景 → 各放一个 `Main` 节点 → 挂脚本」，1.5–2 小时（不含首次导入等待）。前提是 §3 的两条硬约束别踩。

## 1. 资源现状（`game/cocos/assets/resources`，实测字节）

| 目录 | 文件 | 体积 | 用途 | 谁读 |
|---|---|---|---|---|
| `hero/` | 400 webp · 480×701 | 12.89 MB | 武将立绘（列表/编成/战斗 HUD 同图） | `DeployRoot.ts` `loadPortrait()`；`CampaignRoot` 头像 |
| `anim/` | `atlas_00.png` 1024² + `atlas.json` | 317 KB | 单位走路帧图集（未接渲染） | 待接 `BattleRoot`（`16_单位动作接入.md`） |
| `fx/` | `atlas_000..039.png` + `index.json` | 3.59 MB | 40 张技能图集 + 帧表 | 待接 `BattleRoot`（`12_技能特效接入.md`） |
| `audio/` | 103（`bgm/` 3 · `sfx/` 99 · `index.json`） | 9.20 MB | BGM 与音效（未接播放） | 待接 `AudioSource`（`13_音频接入.md`） |
| `data/` | 13 JSON（core 8 张） | 1.62 MB | 规则表 | `DataLoader.ts` `loadGameData()` |
| **合计** | **559** | **27.61 MB** | | |

逐文件的「文件名 / 字节 / 宽高 / 给谁用」在 `assets/resources/manifest.json`（含每类的 `caveats`）。

## 2. 导入（一次性，约 30 min + 导入等待）

1. 装 **Cocos Creator 3.8.x**（工程 `package.json` 记 3.8.0；Dashboard 里加装「微信小游戏」构建插件）。
2. Dashboard →「打开其他项目」→ `F:\sanguo\game\cocos`。首次打开会生成 `library/ temp/ profiles/` 和 559 个 `.meta`，导入 5–15 min，**别中断**（`.meta` 要入库）。
   若提示项目损坏/版本不符：新建空白 3.8 项目，把 `assets/ types/ settings/v2/ tsconfig*.json package.json` 覆盖进去，效果等价。
3. 项目设置 → 项目数据：设计分辨率 **750×1334**，**Fit Height ✓ / Fit Width ✗**（已写进 `settings/v2/packages/project.json`）。
4. 资源类型核对（多选 → 属性检查器 → Type）：
   - `hero/` `fx/` `anim/` 的 png/webp 必须是 **sprite-frame**。默认若是 texture，`resources.load(..., SpriteFrame)` 返回 null → 立绘/特效空白（400 张要批量改）。
   - `audio/` 的 mp3 = **audio-clip**；`data/` 的 json 保持 JsonAsset。
5. 新建 4 个场景，文件名**必须精确**：`Boot` / `Campaign` / `Deploy` / `Battle`（`director.loadScene('Campaign')` 按名查找，拼错就静默失败、停在原场景）。
6. 每个场景按 §3 的树搭；`Main` 节点 Add Component → 对应 Root。
7. 项目设置 → 项目数据 → 起始场景 = `Boot`；保存后浏览器预览一遍（不用真机）。

## 3. 四个场景的节点树（文字树，缩进=父子）

```
Boot.scene
└─ Canvas                  Canvas（内容尺寸自动=750×1334，无需 Widget）
   ├─ Camera               Camera：Projection=Ortho、z=1000、ClearFlag=SOLID_COLOR
   │                       ClearColor=#14171C、Visibility=UI_2D、Priority=0
   └─ Main                 UITransform 750×1334、anchor(0.5,0.5)、Position(0,0)
                           └─ 挂 BootRoot（nextScene="Campaign"）
```
`Campaign.scene` / `Deploy.scene` / `Battle.scene` 与上面**同构**，只换脚本与属性：

```
Campaign.scene  Canvas → Camera + Main（UITransform 750×1334）→ CampaignRoot      无属性
Deploy.scene    Canvas → Camera + Main（同上）              → DeployRoot        heroBaseUrl=""（空=读 resources）
Battle.scene    Canvas → Camera + Main（同上）              → BattleRoot        autoStart=true
```

- **不需要**：Button、预制体、事件连线、Sprite 占位图、字体资源。全部节点和 Label 都在脚本运行期创建。
- 可选（接音频时才建）：`Main` 下加空节点 `Audio`，挂 2 个 `AudioSource`（bgm: loop=true/volume=0.6；sfx: 用 `playOneShot`）。代码尚未接，先不建也行。
- 坐标口径：脚本内部用「750×1334、左上原点」的设计坐标，落节点时统一 `x-375 / 667-y`；所以 `Main` 必须在 Canvas 正中心、尺寸正好 750×1334，否则整体偏移。

## 4. 逐脚本核实：程序化建节点 vs 编辑器绑定（全部读源码确认）

| 脚本 | 性质 | 建节点方式 | 运行期节点 | `@property` | 编辑器连线 |
|---|---|---|---|---|---|
| `BootRoot.ts` | Component | 全程序化：`onLoad`→`buildUi()`，`makeLabel()` 逐个 `new Node` | 3（1 Graphics + 2 Label） | `nextScene: string` | **0** |
| `CampaignRoot.ts` | Component | 全程序化：`makeGraphics()`×3 + `makeLabel()`；城池 Label 按剧本城市数生成 | 3 Graphics + 4 固定 Label + 3 动作 Label + N 城 | 无 | **0** |
| `DeployRoot.ts` | Component | 全程序化：2 Graphics + `makePortrait()`（Sprite）+ Label 池（12+13+9+3+2+8） | ≈50 | `heroBaseUrl: string` | **0** |
| `BattleRoot.ts` | Component | 全程序化：5 Graphics（底/我方/敌方/主将/特效）+ 5 Label | 10 | `autoStart: boolean` | **0** |
| `GameState.ts` `DataLoader.ts` `types.ts` `view/*` | 纯 TS 模块 | 不建节点 | 0 | 无 | 不挂场景 |

**结论：不存在「手工连 20 个节点」的工作量**；触摸是 `input.on(TOUCH_END)` + 矩形命中，`ButtonKind` 只是枚举名，没有 `Button` 组件。风险不在连线，在下面两条硬约束：

1. `CampaignRoot.ts:451` 与 `DeployRoot.ts:481` 直接 `this.node.getComponent(UITransform).convertToNodeSpaceAR(...)`，**没有 null 检查** → 挂载节点必须有 UITransform。挂在 `Main` 上没问题；挂到裸 Node 上会 TypeError。
2. 运行期 `new Node()` 的 layer 默认 `DEFAULT(1<<30)`，而 Canvas 相机 visibility 只有 `UI_2D(1<<25)` → 整屏只剩底色。四个脚本的建节点辅助函数已统一 `node.layer = Layers.Enum.UI_2D`（本次已改），**别删这行**。

## 5. 微信小游戏构建

- 构建发布 → 平台 **微信小游戏**；填小游戏 AppID；发布路径 `build/wechatgame`。
- 勾选 **分离引擎**（引擎走微信插件，首包省约 1 MB）、压缩引擎、MD5 缓存；「资源服务器地址」填 https CDN，并在小游戏后台「开发设置」把它加进 `downloadFile` 合法域名。
- 硬约束（`PROJECT_BRIEF §4`）：首包 ≤4 MB、整包 ≤20 MB、单分包 ≤20 MB（代码包总大小另受 30 MB 上限约束）。

| 包（Bundle 名） | 内容与实测体积 | 归属 |
|---|---|---|
| `main` | 引擎 1.0 + 业务 JS 0.6 + `data` core 8 表 1.08 + `anim` 0.32 | 首包 ≈3.0 MB |
| `battle` | Battle 场景代码与战场 HUD（当前无独有图片资源） | 随主包；代码不能分包热更 |
| `fx` | `fx/` 3.59 MB（40 图集 + `index.json`） | 分包，进战斗前 `loadBundle('fx')` 预载 |
| `hero` | `hero/` 只放常用 40 张 ≈1.3 MB | 分包；其余 360 张走 CDN（`DeployRoot.heroBaseUrl`） |
| `audio` | `audio/` 9.20 MB（bgm 6.5 + sfx 2.7） | **必须远程/CDN**，整包放不下 |
| data 余下 5 表 | `things.json` 615 KB + 4 张小表 | 移出首包，按需远程 |

落地合计 ≈3.0 + 3.6 + 1.3 ≈ **7.9 MB**，离 20 MB 有充足余量。若嫌 `battle` 与 `fx` 两个名字啰嗦，可合成一个 `battle` 分包（≤20 MB 装得下），代价是「只想刷大地图」时也要预载 3.6 MB。

**最大的坑：`assets/resources` 会被无条件打进首包。** `resources` 是 Creator 内置 bundle，目录下任何资源都进主包，既不能分包也不能被裁剪——现在 hero+audio+fx+data 全在里面，首包 27.6 MB，真机构建直接失败（浏览器预览和开发者工具「不校验」模式下不拦）。两条路按时间选：

- **A｜装配日先跑通（推荐）**：资源不动，用浏览器预览 + 开发者工具勾「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」跑通 §6 的 6 条，包体留到 B。
- **B｜提审前必做**：把 `resources/{hero,fx,audio}` 移到 `assets/bundles/{hero,fx,audio}`，目录属性勾 **Is Bundle**（`hero` 再勾 Is Remote + 填 CDN 地址）。代码改动只有 **1 处**：`DeployRoot.ts:560` 的 `resources.load('hero/…')` → `assetManager.getBundle('hero')!.load(…)`（fx/audio 还没接代码，无需改）。`data/` 的 core 8 表可留在 resources（1.08 MB）；`things.json` 等 5 张非 core 表一并移出，省 0.62 MB。

## 6. 装配完成后必验的 6 条（按顺序，一条不过就停）

1. **启动**：`Boot` 状态行走到 `載入 8/8` 后 1 s 内切到大地图；无红字、无白屏、无 `resources.load 失敗`。
2. **大地图**：城池散点 + 连线 + 顶部年月/势力统计都在；点城池能改选中框，底部 3 个动作按钮文字随之变化。
3. **编成**：点「出征」进 Deploy；左侧立绘出现（不是灰块/空白）；12 名武将可点、兵种 13 / 阵形 9 高亮可切、兵力 ±100 生效、「返回」回大地图。
4. **战斗**：进 Battle ≤1 s 开打；双方队列推进、有伤害飘字与金色主将、HUD 双兵力条与计时在走；30 s 内不出现 `載入失敗`。
5. **结算**：一方兵力归零 → 结算面板（胜/负 + 战功）出现，点「返回大地图」回 Campaign；重进游戏后 `sys.localStorage` 里的 wins/losses 仍在。
6. **回大地图闭环**：城池归属/兵力/金钱与战前一致（或按结算更新），再点「出征」能第二次进战斗，不卡在上一场 World。

## 7. 最可能卡住装配的三件事

1. **`assets/resources` 全进首包（27.6 MB）**：微信真机构建/预览直接失败；开发者工具默认「校验」时也会拦。装配当天若走 A 路线，务必先明确「预览能跑 ≠ 能提审」。
2. **图片导入类型不是 sprite-frame**：立绘空白、`fx` 全空，现象像「代码 bug」，实际是资源设置。400 张 hero 要批量改类型（多选后在属性检查器里统一改 Type，Creator 会应用到全部选中项）。
3. **触摸坐标在非 9:16 屏幕上偏移**：`CampaignRoot.ts:453` / `DeployRoot.ts:483` 把 `event.getUILocation()`（屏幕像素）直接喂 `convertToNodeSpaceAR`，隐含「屏幕宽 = 750」。Fit Height 下 19.5:9 手机可见宽约 690 设计像素，点击会整体偏。修法：减掉 `(实际可视宽 - 750)/2`，或改用相机 `screenToWorld`。19.5:9 真机验收时把这条单列一项。

次要但会浪费半天：`Main` 漏加 UITransform（§4-1）；场景名拼错（`loadScene` 静默失败）。

## 8. 装配时仍然缺的东西（写在这里免得现场找）

- **只能人工**：4 个 `.scene` 必须手建（Creator 没有「脚本建场景」能力），这是唯一的硬性人工点。
- 未接代码：`anim` 切帧（`16_单位动作接入.md`）、`fx` 渲染（`12_技能特效接入.md`）、`audio` 播放（`13_音频接入.md`）——三者都是「资源已就位、代码待写」，不影响 §6 前 6 条。
- 数据缺口：generals 401 条 vs 立绘 400 张（1 名武将无图，需占位）；`types.ts` 的 `SKILL: Array<[number,number]>` 与数据（字符串 `"40, 110"`）不符，`DeployRoot.countList()` 已兜底。

## 9. 本次已备（装配前做完的部分）

- 代码同步：`core/battle.ts` 升到主工程最新版（28,348 B）；`types.ts` / `view/theme.ts` / `view/layout.ts` 对齐；`import '../core/battle.ts'` → `'../core/battle'`。
- 新增 `BootRoot.ts`（启动屏 + 数据加载 + 失败重试）；四个 Root 统一 `Layers.Enum.UI_2D`。
- `DeployRoot` 三修：立绘改按 `SpriteFrame` 取、`SKILL` 计数用 `countList()`、远程立绘拆 `applyPortraitFrame()`。
- `types/cc.d.ts` 补齐 `Asset`/`AudioClip`/`AudioSource`/`Layers`/`Node.layer` 等；`tsc -p cocos/tsconfig.check.json` → **exit 0**。
- 资源树与 `manifest.json`；`settings/v2/packages/project.json` 改为 Fit Height。
