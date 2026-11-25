# Cocos 端 vs 原作 · 特有差距

> **口径**：Cocos 工程是 `game/cocos`（49 个 `.ts` / 4 个场景 / 设计分辨率 **750×1334 竖屏**）；仓库根的 `cocos/` 是旧骨架，不计。
> 只列「相对**原作**」的差距。原作是 `F:\sanguo\docs\00:17` 明写的 **640×480×16bpp 横屏** Win32/DirectDraw 程序。
> 原作也没有的（单挑画面、`?probe` 调试口）**不列为缺口**。

## 一、Cocos 有什么（先排除误判）

- 4 个场景：`game/cocos/assets/scene/{Boot,Campaign,Deploy,Battle}.scene`。
- 脚本 49 个，主力：`CampaignRoot.ts` 112,626 B、`core/battle.ts` 106,068、`AiModel.ts` 104,931、`core/syso_host.ts` 75,159、`CityModel.ts` 63,207、`ItemsPanel.ts` 58,699、`core/smartscript/runtime.ts` 51,476、`CityPanel.ts` 50,856、`MonarchModel.ts` 45,679、`DeployRoot.ts` 41,724、`core/strategy.ts` 41,529、`BattleRoot.ts` 37,283、`BattleHud.ts` ≈35 KB、`MonarchPanel.ts` ≈31.6 KB、`core/audio_bus.ts` ≈30.5 KB。
- 内政 9 命令（`CityPanel.ts:14` 開墾/徵兵/搜索/移動/任命/物品/情報/出征/自治）、战后处置（`SurrenderPanel.ts` + `SurrenderModel.ts`）、君主卡/勢力一覽/繼承（`MonarchPanel.ts:2-13`）、物品 8 页（`ItemsPanel.ts`）、编成（`DeployRoot.ts`）、AI 月循环（`AiRunner.ts`）、行军（`CampaignRoot.ts:38` 引 `core/march`）、九宫（`UiSkin.ts:425 makeNineSlice`）、BGM（`AudioHost.ts:256 TERRAIN_TRACK`）。

**所以 Cocos 缺的不是「玩法规格」，而是「PC 游戏的壳」和「横屏版式」。**

## 二、原作有 · Cocos 没有（画面/入口级）

| 原作特性 | 证据 | Cocos 现状 | 影响 | 估时 |
|---|---|---|---|---|
| **主選單 / 標題畫面** | `docs/02-美术资源与格式.md:367`：`MAIN01-04A/B（主菜单）`、`TITLE` | `BootRoot.ts:45/136` 读完数据直接 `loadScene('Campaign')`，无标题/菜单 | 一进游戏直接落大地图，没有「新遊戲/讀取進度/設定」入口 | 2 h |
| **劇本選擇（5 个）** | `docs/03c-剧本武将城池TIMES.md`（5 个 TIMES）、`extract/pak/TIMES1..5.INI` | `CampaignRoot.ts:1045`/`DeployRoot.ts:269` 硬编码 `data.scenarios[0]`；`BootRoot.ts:134` 只是打印剧本数 | 只能玩第 1 剧本 | 3 h |
| **君主選擇** | 原作开局选君主（`docs/03c` 的 KING 字段；`04c:129` 城 `+0x10` 君主编号） | `AiRunner.ts:66 PLAYER_FORCE='玩家'`，`CampaignRoot.ts:1721` 明写「Cocos 玩家没有势力 id」，直接 `initCampaign(playerId: '玩家')` | 不能选势力/君主，固定一城开局 | 3 h |
| **存檔/讀檔畫面（多槽）** | `docs/07:15` 模板 `SANGO%02d.SAV`、`:17` 槽描述串 `"%-6s 城數%02d 武將%03d 時間%3d年"` `0x48D840` | `GameState.ts:17 SAVE_KEY='sanguo_campaign_v1'` 单档 localStorage；`grep 存檔/讀檔` 无 UI；无 `slot` 相关代码 | 不能多存档、不能回看旧局、不能导入原作档 | 6 h |
| **武將資料（獨立頁）** | `docs/04c:154-172` 内政命令「武將資料」`0x48B228`→`0x423901`（名冊） | 只有 `MonarchPanel.ts:13` 的「勢力明細抽屜」（按勢力分頁列 武/智/忠/士/疲+狀態），无全势力名册/单将详情页 | 查将不便（原作是核心查阅页） | 4 h |
| **勢力圖（獨立頁）** | `docs/04c:154-172`「勢力地圖」`0x48B434`→`0x4280A9` | 大地图城点有势力 tint（`CampaignRoot.ts:412/639 cityTintOf`）+ `MonarchPanel` 勢力一覽文字抽屉；**没有原作那张全屏势力图** | 观感/查阅方式不同（功能部分等价） | 3 h |
| **結局 / 統一畫面** | `docs/04c:26` 结局才打印 `%3d年%2d月%2d日`（原作有结局流程） | 全树 grep `結局/統一` 只命中注释与 syso 台词（`syso_host.ts:1243`），无结局场景/结算画面 | 通关无收束 | 3 h |

小计：**7 项 / 24 h**（这也是「Cocos 验收」最可能被一眼看出的部分）。

## 三、版式 / 观感（不是缺功能，但和原作不像）

| 项 | 原作 | Cocos | 影响 | 估时 |
|---|---|---|---|---|
| **横屏 vs 竖屏** | 640×480 横屏（`docs/00:17`），一屏看全战场/大地图 | `settings/v2/packages/project.json` `designResolution 750×1334`；`view/layout.ts:2` 明写「750×1334 竖屏布局」，HUD 100 / 战场 900 / 控制台 334 | 战场变成 71 列窗口（`core/battle.ts GRID_W=71` + camera 滚动），原作是整屏；大地图 813.6×610.2 溢出（31 #66） | 8 h（若改横屏）|
| **字体** | 640×480 点阵字（原作 UI 全像素字） | `view/theme.ts:57 FONT_FAMILY` 是系统字体栈；`UiSkin.ts:493 text.fontFamily = FONT_FAMILY` | 文字观感现代、非点阵 | 2 h（嵌位图字）|
| **九宫/边框** | 原作 `BUTTON01-10A/B/C` 三态、`SB_H*/SB_V*` 滚动条（`docs/02:367`） | **已有** `UiSkin.ts:425 makeNineSlice` + `makeButton`（`:486`） | 无差距（此前「未找到九宫」的判断作废） | 0 |
| **头像/造型** | SHP 序列帧（`docs/05b`） | `ArtLayer.ts` 按 PNG 帧加载（`:85`），`GeneralArt/Portrait` | 动态帧数/演出密度可能少（未逐帧比对） | 未评估 |
| **地圖底圖** | `CHINAMAP.SHP` 1280×960 + MSK 640×480（`docs/02:233`） | 用 1280×960 底图（`CampaignRoot.ts:70` 注「1280×960 的底图」）缩小到竖屏 | 比例对，视野窄 | 已含在上条 |

## 四、资产 / 运行时

| 项 | 现状 | 判定 |
|---|---|---|
| 音效/BGM 资产 | `game/cocos/assets/bundles/res/audio`：**99 WAV + 10 BGM，共 32.14 MB**（bgm 03/04/05/06/10/11/12/13/14/17） | 资产在，BGM 场景映射在（`AudioHost.ts:256`）。31 #45「16.07 MB 被剔」在当前工程内**未找到排除配置**，需打包后验包体 `[推测]`；缺的 7 首（01/02/07/08/09/15/16）与原作调用点无证据一致 |
| 表现层实证 | 31 #40：tsc/配对过，**渲染与音频没在真机跑过** | 验收风险（用户已定 Cocos 验收） |
| 运行时实证 | 31 #46：headless 截图纯白，未真机 | 同上 |
| 存档分层 | `GameState` 白名单单档 + 君主补丁键 + `[SAVES_V3]` 扩展键（`MonarchPanel.ts:55`、`CampaignRoot.ts:939`） | 与「原作单份 SSAV」不同构，但内部自洽；31 #41 |

## 五、Cocos 不需要补的（原作也没有）

- 单挑画面：原作无独立单挑子系统（`docs/04b3:11/490`）⇒ 不列缺口。
- `?probe`/调试口：原作无 ⇒ 忽略。
- 7 首 BGM：原作调用点未找到证据 ⇒ 不硬塞。

## 六、结论

- Cocos 端**玩法层已基本齐**（内政 9 命令、战斗、编成、战后处置、AI、行军、君主/势力、物品、音频）。
- 真正缺的是 **7 个「壳」**：主菜单、剧本选择、君主选择、存读档画面、武将资料页、势力图页、结局画面 —— 合计 **24 h**。
- 另有 **竖屏 750×1334 vs 原作 640×480 横屏** 的结构性差异（8 h 若改横屏）+ 字体（2 h）。
- 因此「Cocos 验收」要过的不是「玩法有没有」，而是「入口/存档/结局 + 竖屏观感能不能被接受」。
