# 125 · Cocos 开局流程（标题 / 剧本 / 君主 三壳）

- 日期：2026-11-25
- 范围：`F:\sanguo\game\cocos\assets\scripts` 的 Boot 开局段，目标是把「点开直接进第 1 剧本、玩家固定 `玩家`」改成
  **标题 → 剧本 → 君主 → 大地图**。
- 约束遵守：未新建 `.scene`；未改 `CampaignRoot.ts` / `BattleRoot.ts` / `BattleHud.ts` / `GameState.ts` /
  `AiModel.ts` / `MonarchModel.ts` / `CityPanel.ts` / `ItemsPanel.ts` / `DeployRoot.ts` / `core/**` /
  `SurrenderPanel.ts` / `SaveSlots.ts`；未跑 `tools\build_wechat.ps1`；未新增素材。
- **没有构建、没有截图**：本机只能跑 `tsc` 与 mock `cc` 的 headless 测试，不能启动 Creator / 微信开发者工具。

## 0. 一句话结果

数据载入后不再 `director.loadScene('Campaign')`，而是挂 `TitlePanel`；三颗按钮分别接
剧本选择、读档、说明；剧本页 5 张卡，君主页按城池 `KING` 聚合势力；按「开始新局」才写
`localStorage['sanguo_run_v1'] = {v:1, scenarioIndex, playerForce}`，再进大地图。

- `tsc -p tsconfig.check.json --noEmit` → **EXIT=0**
- `work\cocos_select\model_assert.mjs` → **164 断言 / 164 通过 / 0 失败 / EXIT=0**
- `work\cocos_select\panel_headless.mjs` → **73 断言 / 73 通过 / 0 失败 / EXIT=0**

## 1. 改动清单（file:line）

| 文件 | 状态 | 内容 | 关键行 |
|---|---|---|---|
| `game\cocos\assets\scripts\SelectModel.ts` | 新增 221 行 | 纯逻辑：剧本卡、势力表、分页；**不 import cc** | `scenarioForces` :126、`scenarioCard` :175、`isKingName` :103、`openingCityNames` :110 |
| `game\cocos\assets\scripts\RunSetup.ts` | 新增 141 行 | `sanguo_run_v1` 单例 + localStorage 兜底 | `RUN_KEY` :19、`sanitizeSelection` :64、`readRun` :79、`playerForce` :124、`scenarioIndex` :119 |
| `game\cocos\assets\scripts\TitlePanel.ts` | 新增 523 行 | 标题 / 存读档 / 说明 三页 | `show` :111、`loadSlot` :215、`buildTitle` :285、`buildSaves` :319、`buildHelp` :348 |
| `game\cocos\assets\scripts\ScenarioSelect.ts` | 新增 636 行 | 剧本页 + 君主页（同一面板两页） | `show` :133、`init` :158、`act` :222、`buildScenarioPage` :353、`buildForcePage` :417、`pager` :478 |
| `game\cocos\assets\scripts\BootRoot.ts` | 改 218 行 | 载入完成后先出标题；三个面板的挂/卸与进场景 | `BootState` :46、`boot` :138、`setScenarioCount` :148、`showTitle` :167、`openSelect` :179、`enterCampaign` :190 |

未改（并行/禁改）：`AiRunner.ts`、`CampaignRoot.ts`、`GameState.ts`、`SaveSlots.ts`、`UiSkin.ts`、场景文件。
`UiSkin` 只调用：`makeNineSlice` :425、`makeBtn` :478、`makePanel` :520、`placeDesign` :543。
`SaveSlots` 只读调用：`SLOT_COUNT` :50、`readIndex` :258、`slotRecord` :294、`filledCount` :302、
`loadFromSlot` :420、`setActiveSlot` :460、`slotLines` :487。

## 2. 流程（改前 / 改后）

改前（`BootRoot.boot()`）：

```
loadGameData() → preloadMagicProgram() → director.loadScene('Campaign')
```

改后：

```
loadGameData() → preloadMagicProgram() → setScenarioCount(5) → showTitle()
  TitlePanel
    ├ 開始新局 → openSelect() → ScenarioSelect
    │     ├ 剧本页（5 卡，点选高亮）→ 選 君 主 →
    │     └ 君主页（8 行/页，分页）→ 開 始 新 局
    │           setRunSelection(scenarioIndex, force) → onEnterCampaign()
    ├ 讀取存檔 → loadFromSlot(n) → setActiveSlot(n)
    │           → matchScenarioIndex(meta.scenario) + setRunSelection(…, meta.monarch)
    │           → onEnterCampaign()
    └ 說明 → 13 行文字
onEnterCampaign() → closeSelect() + closeTitle() → director.loadScene('Campaign')
```

要点：

- **只有按「开始新局」才写盘**，点卡片/翻页/返回都不污染上一次选择。
- 面板用 `close()` 从 Canvas 摘下并 `destroy()`；`input` 监听在 `onDestroy` 也会 `off`，不会叠监听。
- `BootBase`（原载入页）在出标题时 `active=false`，失败态仍可点击重试（`BootRoot.ts:210` 只在 `failed` 重试）。

## 3. UI 结构树（节点名与文案以 `panel_headless.mjs` 实测为准）

### 3.1 标题页 `TitlePanel`（19 个节点）

```
TitlePanel (750×1334)
├─ TitleBg                     Graphics：bg 满屏 + 页头线 y=124 + 按钮区底线距底 86
├─ PageTitle                   「三國群英傳 2 · 豎版」40
├─ PageSub                     「184 — 219 · 5 套劇本 · 直屏 750×1334」22
├─ TitleEmblem                 frame_panel 630×300 @(60,180)
│  ├─ Skin_frame_panel
│  ├─ Skin_bar_div 420×12
│  ├─ TitleHero                「群 雄 逐 鹿」40
│  ├─ TitleTag                 「擇 一 劇 本 · 擇 一 君 主 · 定 一 方 天 下」22
│  └─ TitleMeta                「5 套劇本 · 最多 19 路勢力 · 60 座城」18
├─ TitleLead                   18
├─ TitleHint                   18（30Hz 说明）
├─ Btn_開始新局                 520×88 @(115,944)
├─ Btn_讀取存檔                 @(115,1052)
├─ Btn_說明                    @(115,1160)
└─ PanelMsg                    仅 flash 时出现
```

### 3.2 存读档页（`TitlePage='saves'`）

```
PageTitle「讀 取 存 檔」 / PageSub「共 10 槽 · 已用 N · 點一行載入」
SaveRow_1 .. SaveRow_10        670×80，top=140，步长 86（末行底 986）
  ├─ SaveRow_N_L1              20px  槽 N[ · 名][ · 使用中]
  ├─ SaveRow_N_L2              18px  第X年Y月 · 城N · W勝L敗 · YYYY-MM-DD HH:mm
  └─ SaveRow_N_L3              18px  君主X · 將N
Btn_返回                       220×64 @(40,1184)
FootHint                       「目前使用中：槽 N」
```

空槽整行也画（`slot_off`），点击只 `flash('槽 N 是空的 · 先按「開始新局」')`，不崩。
有档：`loadFromSlot` 失败只提示 `reason`；成功才 `setActiveSlot` + 写 RunSetup + 进大地图。

### 3.3 剧本页（`ScenarioSelect`，`page='scenario'`）

```
PageTitle「選 擇 劇 本」 / PageSub「5 套劇本 · 點卡片高亮 · 下一步選君主」
ScCard_0 … ScCard_4           670×150，top=140，gap=10；选中 plate_sel，未选 frame_panel
  ├─ ScCard_i_Name            「1. 黃巾之亂」22
  ├─ ScCard_i_Stats           「184 年 · 15 勢力 · 60 城 · 116 條道路」18
  ├─ ScCard_i_Opening         「開局三城：襄平 · 北平 · 代縣」18
  └─ ScCard_i_Dot             「已選」/ 空
ScSummary                     670×150 @(40,966)
  ├─ ScSummaryTitle           《群雄割據》200 年
  ├─ ScSummaryStats           9 家勢力 · 60 座城 · 116 條道路
  └─ ScSummaryOpen            開局三城：襄平 · 北平 · 代縣
Btn_返回 / Btn_下一步「選 君 主 →」
FootHint / PanelMsg
```

### 3.4 君主页（`page='force'`）

```
PageTitle「選 擇 君 主」
PageSub  《群雄割據》9 家勢力 · 有城 8 家 · 點一行選定
ForceRow_0 … ForceRow_7       670×106，top=140，gap=6；8 行/页
  ├─ ForceRow_g_Name          勢力名（0 城显示「盜賊（0 城）」）22
  ├─ ForceRow_g_Meta          「勢力 袁紹 · 旗2 · 起始 7 城」18
  └─ ForceRow_g_Cities        「城池：鄴 · 平原 · … 等 7 城」/「此劇本名下無城（不可選）」18
Btn_上頁 / PageLabel「第 1 / 2 頁」/ Btn_下頁
Btn_返回 / Btn_開始「開 始 新 局」
FootHint / PanelMsg
```

选 0 城势力只 flash「X 名下無城（不可選）」，不会写 RunSetup；默认选第一个有城势力。

## 4. 版式 / 字号 / 无资源降级

- 画布：750×1334，设计坐标左上原点；`placeDesign` 换算 `x+w/2-375, 667-(y+h/2)`。
- 页头 0–124（`PageTitle` 22–76，`PageSub` 82–112）；按钮区底边 **1248**（距底 86）。
- 四级字号：`title 40` / `head 22` / `body 18` / `num 20`（`TitlePanel.ts:46-50`、`ScenarioSelect.ts:54-58`，未借用 `theme.FONT`）。
- 九宫只用 26 张已有图元：`frame_panel` / `plate_btn` / `plate_sel` / `slot_off` / `bar_div`。
- 降级：`makePanel`/`makeBtn` 内部 `loadSkinFrame` 失败 → `drawFallback()` 画 `#10141A@184` 深底 +
  `goldDim` 1px 描边；`panel_headless.mjs` 明确用「无资源」路径跑通（3 个 skin 加载失败仍出 3 按钮与完整节点树）。
- 遮罩/滚动：君主列表 750×1334 装不下 15–19 行，改用 **8 行/页 + 上/下页**（真实 Cocos 有 ScrollView，
  但 headless mock 没有；分页也让手柄/触屏都能点，不依赖拖拽）。

## 5. RunSetup 数据契约

`localStorage['sanguo_run_v1']`：

```json
{ "v": 1, "scenarioIndex": 2, "playerForce": "曹操" }
```

- 模块级单例缓存；`readRun()` 命中缓存直接返回（`resetRunCache()` 可强制重读）。
- 脏数据回落：非 JSON / 非对象 / `scenarioIndex` 非整数或越界 → `0`；`playerForce` 非字符串或 trim 后空 →
  `公孫瓚`（`RunSetup.ts:64`）。
- `setScenarioCount(data.scenarios.length)` 在 Boot 载入后调用，越界判断以真实套数为准（不是写死 5）。
- `writeRun` 先更新缓存再 `setItem`；`setItem` 抛错（隐私模式/配额）只 `console.warn`，本局仍生效。
- `scenarioIndex()` / `playerForce()` 是给 `CampaignRoot` / `AiRunner` 的唯一读口。

## 6. 给 lead 的 hook 代码 `[推测]`

> `CampaignRoot.ts` 正被另一个 agent 改，下面的行号是我 **2026-11-25 09:4x** 读到的；
> 落地时请用 `grep -n "scenarios\[0\]\|playerId: PLAYER_FORCE\|seedMonarch(view"` 重新定位。
> 我没有改这些文件（禁改 + tsc 依赖）。

### 6.1 CampaignRoot：剧本下标（当前 `:1091`）

```ts
// CampaignRoot.ts 顶部（当前 :51 那组 import 附近）
import { playerForce as runPlayerForce, scenarioIndex as runScenarioIndex } from './RunSetup';

// :1091 原：const scenario = data.scenarios[0] as unknown as CampaignScenario | undefined;
const scenario = data.scenarios[runScenarioIndex()] as unknown as CampaignScenario | undefined;
```

### 6.2 CampaignRoot：把玩家势力传给 AI（当前 `:1881`）

```ts
// 原：playerId: PLAYER_FORCE,
playerId: runPlayerForce() || PLAYER_FORCE,
```

### 6.3 CampaignRoot：开局君主按玩家选择播种子（当前 `:2431`）

`MonarchModel.seedMonarch(save, cities, opts)` 已支持 `opts.king`（`MonarchModel.ts:1084-1088`），
所以只需把 opts 传进去；再补一次落盘（`writeMonarchExtras` 是同类私有方法，当前 `:2452`）：

```ts
// :2431 原：if (!this.monarchExtinct) M.seedMonarch(view, this.cities);
if (!this.monarchExtinct) M.seedMonarch(view, this.cities, { king: runPlayerForce() });

// :2435 原：this.monarchState = view;  之后补一行，让君主名立刻进 sanguo_monarch_v1
this.writeMonarchExtras(view);
```

> 为什么需要 `:2431`：`GameState.initCampaign` 只送「前三城」（`GameState.ts:344`），
> 不按君主发城；不播种的话，页头君主仍是「前三城首个 KING」（剧本 1/2 = 公孫瓚），
> 和玩家在君主页选的势力对不上。

### 6.4 AiRunner：可选一行（不改导出类型）

`PLAYER_FORCE` 现在是**字符串常量**，`CampaignRoot.ts:51` 以值 import、`:1881` 当 `playerId:string` 用。
直接改成函数会让禁改文件 tsc 爆，所以推荐保留常量、加一个读取函数：

```ts
// AiRunner.ts 顶部
import { playerForce as runPlayerForce } from './RunSetup';

// :66 保留 export const PLAYER_FORCE = '玩家';
export function currentPlayerForce(): string { return runPlayerForce() || PLAYER_FORCE; }

// :442 原：s.king = str(c.playerId) || (ownedList.length ? PLAYER_FORCE : '');
s.king = str(c.playerId) || (ownedList.length ? currentPlayerForce() : '');
```

若 lead 更愿意把 `PLAYER_FORCE` 直接改成函数，则必须同时改 `CampaignRoot.ts:51` 与 `:1881`，
否则 tsc 报 `Type '() => string' is not assignable to type 'string'`——这是我选择不动它的原因。

## 7. 验收证据

### 7.1 tsc

```powershell
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
# EXIT=0
```

（`tsconfig.check.json` 为项目原有配置：strict、noEmit、include `assets/scripts/**/*.ts` + `types/cc.engine.d.ts`。）

### 7.2 纯逻辑断言 `work\cocos_select\model_assert.mjs`

| 分组 | 断言数 |
|---|---:|
| §1 剧本卡（5 套） | 48 |
| §2 势力表（城池 KING + kings[] 补 0 城） | 46 |
| §3 剧本查询 / 分页 | 13 |
| §4 RunSetup（单例 + localStorage 兜底） | 23 |
| §5 存档槽摘要行（slotLines） | 15 |
| §6 存读档：有/无存档两态都不崩 | 19 |
| **合计** | **164（164 通过，0 失败，EXIT=0）** |

覆盖验收点：①5 套剧本的势力表（真实值，见 §8.1）；②`playerForce()` 能取到选中势力名；
③空/脏 localStorage 回落第 1 剧本 + 第一个势力；④`slotLines` 10 槽摘要行格式（空槽/有档/使用中）；
⑤点「讀取存檔」在有/无存档两态都不崩（无档 `{ok:false}`，有档整组换 7 键）。

### 7.3 面板结构断言 `work\cocos_select\panel_headless.mjs`

| 分组 | 断言数 |
|---|---:|
| §1 标题页 | 14 |
| §2 读取存档：10 槽空态 | 8 |
| §3 说明页 | 6 |
| §4 读取存档：有档态（真的载入） | 10 |
| §5 剧本选择：5 张卡 | 10 |
| §6 剧本 → 君主页 | 11 |
| §7 君主分页 / 0 城不可选 | 6 |
| §8 选君主 → 开始新局 | 6 |
| §9 返回键 / 收尾 | 2 |
| **合计** | **73（73 通过，0 失败，EXIT=0）** |

产物：`work\cocos_select\panel_tree.txt`（节点树）、`panel_interactions.txt`（点击序列）、
`model_assert.txt` / `panel_headless.txt`（完整 PASS 行）。

### 7.4 复现

```powershell
cd F:\sanguo\work\cocos_select
node model_assert.mjs
node panel_headless.mjs
```

测试基建：`tsconfig.sim.json` 用 `rootDir=../../game/cocos/assets/scripts`、`outDir=_sim`，
把 `SelectModel/RunSetup/TitlePanel/ScenarioSelect` + 依赖编译成 CJS，`cc` 走 `_sim/node_modules/cc`
（从 `work\cocos_surrender\_sim` 复制，补了 `Color.fromHEX`、`director.loadScene` 记录、
`Node.removeChild` 直接清 `_parent` 以避免 mock 自身递归）。

## 8. 没做到 / 数据与边界

### 8.1 验收①「5 套剧本各 ≥14 家势力」在原数据上不成立

`data\scenarios.json` 的 `system.TotalKing`：

| 剧本 | 行号 | TotalKing | 有城势力（城池 KING 去重） | 势力表并集 |
|---|---|---:|---:|---:|
| 黃巾之亂 184 | :7 | 15 | 14 | 15 |
| 討伐董卓 189 | :5545 | 19 | 18 | 19 |
| 群雄割據 200 | :11111 | 9 | 8 | 9 |
| 赤壁之戰 208 | :16607 | 9 | 8 | 9 |
| 三國鼎立 219 | :22103 | 6 | 5 | 6 |

后三套的**上限就是 9/9/6**，「各 ≥14」不可能满足。我没有伪造行：卡片/列表显示真实值，
测试断言真实值（15/19/9/9/6 与 14/18/8/8/5），并额外断言「过滤纯数字脏势力」「0 城不可选」。
剧本 1 的城市 `KING` 里还有 `1..12` 这类纯数字脏值（转换残留），`isKingName()` 已过滤，
否则会出现 12 个假势力。

### 8.2 选君主不会把「名下城池」给玩家（Cocos 与 web 的行为差）

web 的 `startNewGame` 按君主把名下城全部划给玩家（`game\web\campaign.html:1896-1900`）；
Cocos 的 `GameState.initCampaign` 固定 `cities.slice(0,3)`（`GameState.ts:344`），
`CampaignSave` 也没有 `king` 字段。所以当前 Cocos 侧：

- 玩家选势力只影响 `RunSetup.playerForce()`（以及 hook 后的 AI `playerId`、君主播种）；
- 开局仍固定襄平/北平/代县三城，**不按君主给城**。

要做「名下城池归你」，得在 `CampaignRoot.start()` 里按 `RunSetup.playerForce()` 重写 `owned`/`owner`；
这超出我被允许改的文件，未做。`[推测]` hook 的形态会是：

```ts
// start() 内、initCampaign 之后：把 selectedForce 名下的城并入 owned
const force = runPlayerForce();
if (force) this.save.owned = this.cities.filter((c) => c.KING === force).map((c) => c.NAME);
```

但会牵动 `selected`、`refresh()`、存档兼容，需 lead 决策，不放进 6.1–6.3 的必改项。

### 8.3 其他

- **未构建、未截图**：不能跑 Creator，`tools\build_wechat.ps1` 归 lead；headless 的 `cc` 是 mock，
  真机字宽/安全区/微信触控未验证。
- **剧本页/君主页是分页，不是惯性滚动**：8 行/页；若产品坚持 ScrollView，需要真机再调。
- **没有「继续上局」按钮**：只有「读取存档」；开局默认不会自动载入 `sanguo_campaign_v1`。
- **`scenarioIndex` 没进 `GameState`**：`GameState.ts` 无该字段，未改；`CampaignRoot` 仍读 `scenarios[0]`，
  需 §6.1 的 hook 才真正按选择开图。
- **`AiRunner` 未动**：玩家势力名仍是 `'玩家'`，需 §6.2/6.4 的 hook；在此之前选君主对 AI 无影响。
- 说明页/标题页文案是占位级产品文案，未做多语言与设置项。
