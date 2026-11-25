# 186 Cocos 部队层与兵团指令（web → Cocos 移植）

把 web `game/web/campaign.html` 已实现的大地图**部队层**与**兵团指令 5 项**移植到 Cocos（TypeScript / Cocos Creator 3.8.8），并补齐 4 处文案差异。

- 施工基线：web 侧 182（部队层与兵团指令）＋185（驻扎与军师）
- 新增文件：`game/cocos/assets/scripts/ArmyLayer.ts`（1496 行）
- 改动文件：`CampaignRoot.ts`（4057 行）、`GameState.ts`（894 行）、`SaveSlots.ts`（1034 行）
- **未改**：`game/web/**`、`game/src/**`、`game/cocos/assets/scripts/core/**`、`Battle*.ts`、`DeployRoot.ts`
- 禁改目录 `core/march.ts` 里没有驻扎/军师逻辑，所以这一段全部落在新文件 `ArmyLayer.ts` 的纯函数段，Cocos 的 `GameState` 只负责写回（见 §2 的「为什么不放进 core」）

---

## 0. 结论速览

| 验收项 | 结果 | 命令 / 证据 |
| --- | --- | --- |
| `tsc -p tsconfig.check.json --noEmit` | **exit 0** | `cd game\cocos; npm.cmd exec -- tsc -p tsconfig.check.json --noEmit` |
| 纯函数断言 | **65 条全过** | `node work\cocos_army\assert_army.mjs` → `65/65 通过 ✓`（报告 `work\cocos_army\assert_army_report.json`） |
| CDP 大地图取证 | **22/22** | `node work\cocos_verify\cdp.mjs run work\cocos_army\steps_army.mjs` |
| CDP 文案取证 | **6/6** | `node work\cocos_verify\cdp.mjs run work\cocos_army\steps_text.mjs` |
| 出包 | **exit 0** | `tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode preview` → `game\cocos-build\web-mobile` |
| 截图（876×1368） | **8 张** | `work\cocos_army\01_army_on_road.png` … `08_general_book.png` |

部队层与 5 项指令在 Cocos 里**都能点、都有实测证据**。与原作的差异集中在两处（路上遭遇战、武将资料卡形态），见 §6，全部按标签标注。

---

## 1. 数据结构

### 1.1 存档里的部队（`save.armies[]`）

web 的元素形状（`campaign.html:2565-2583` 的 `dispatchArmy()`，185 追加后三个字段）：

| 字段 | 类型 | 来源 | 说明 |
| --- | --- | --- | --- |
| `id` | `string` | `nextArmyId()` | `m<月>-<side><序>`，例：`m1-A1` |
| `side` | `'A' \| 'B'` | 出征方 | A＝玩家侧，B＝AI 侧 |
| `from` / `to` | `string` | 城名 | 出发城 / 目的城 |
| `pathIndex` | `number` | `marchPath()` | `scenario.paths` 下标 |
| `progress` | `number` | 0→1 | 0＝出發城、1＝城下 |
| `troops` | `number` | 主将带兵上限 | 出征时一次扣掉守军 |
| `general?` | `string` | 主将 | 无主将时可缺 |
| `officers?` | `string[]` | 185 新增 | **随军武将，主将排第一，≤5** |
| `advisor?` | `string` | 185 新增 | 军师；`''`＝未任命 |
| `stationed?` | `boolean` | 185 新增 | 驻扎＝进度冻结 + 同段阻挡 |
| `reported?` | `boolean` | 182 | 是否已写过战报 |

Cocos 侧 `GameState.ts:66` 新增：

```ts
export type CampaignArmy = Army & {
  officers?: string[];
  advisor?: string;
  stationed?: boolean;
  reported?: boolean;
};
```

`CampaignSave.armies` 的类型随之改成 `CampaignArmy[]`（`GameState.ts:98`）。

**读档兼容**：`normalizeArmies()`（`GameState.ts:267`）原来只保留 8 个已知键，185 的三个新字段会被静默丢掉（旧存档里没有，但 web 存档同步过来就会丢）。现在：
- `officers` 走局部 `pushOfficer()`：trim + 去重，`general` 先入，再逐个入 `row.officers`，最后 `slice(0, ARMY_OFFICER_CAP=5)`（`GameState.ts:262`）
- `advisor` 必须 ∈ officers 才写（否则清空，对齐 web `normalizeArmyExtras()` `campaign.html:1205`）
- `stationed` / `reported` 只有严格 `=== true` 才写

> 为什么不直接 import `ArmyLayer.normalizeArmyExtras()`：`ArmyLayer.ts` 为了画图 import 了 `cc`，而 `work/cocos_officers85/build.mjs` 有一条历史探针断言「`GameState.ts` 里 `from 'cc'` 只能出现 1 次」。所以 `GameState.ts` 里是精简副本，注释写明了出处。

### 1.2 纯函数层（`ArmyLayer.ts`）

文件分三段，第一段 `[ARMY_CORE_BEGIN]…[ARMY_CORE_END]` **不 import 任何东西、不碰 `cc`**，断言脚本用 `ts.transpileModule` 逐字抽出来在 node 里跑。这也是「可断言」的前提：65 条断言全部只跑这一段。

主要导出（行号为 `ArmyLayer.ts`）：

| 函数 | 行 | 对应 web |
| --- | --- | --- |
| `armyPos(scenario, army)` | 184 | `armyPos()` `campaign.html:1148` |
| `armyLerpPoint(points, progress, reverse)` | 117 | `marchLerpPoint()` `:1020` |
| `armyMonths/armyStep/armyRemain` | 213 / 224 / 236 | `marchMonths()` `:984`、`marchStep()` `:990`、`marchRemain()` `:1125` |
| `armyStackPlace(base, 13)` | 263 | `marchStackPlace()` `:1054` |
| `armyHitIndex(placed, px, py, 16)` | 307 | `marchHitArmy()` `:1076` |
| `armyScreenList(scenario, armies, project)` | 334 | `armyScreenList()` `:2878` |
| `resolveMapHit(pickMode, armyIdx, cityIdx)` | 366 | 点击优先级 `:3627-3642` |
| `armyOfficerList / armyCanAppointAdvisor / armyAdvisorOf / armySetAdvisor` | 380 / 393 / 398 / 405 | `:1224 / :1281 / :1286 / :1292` |
| `stationProgressLimit / planArmyMoves` | 493 / 528 | `:1326 / :1346` |
| `stationPairKey / stationStandoff` | 570 / 579 | `:1377 / :1388` |
| `armyRetargetCheck` | 618 | `marchRetargetCheck()` `:1100` |
| `armyCanEnterCity` | 647 | `canEnterCity()` `:2974` |
| `armyCmdRows(army, isMine)` | 672 | `renderArmySheet()` 的 5 个 `cmd()` `:2999-3040` |
| `armyInfoRows(army, ctx)` | 742 | `armyInfoRows()` `:2949-2972` |

`armyCmdRows()` 是**可点性与灰字提示的唯一真值来源**：面板只负责把它的结果画出来，所以「军师灰/亮两态」这类判定不会出现「面板一套、执行一套」。

### 1.3 面板（`ArmyMenu`，`ArmyLayer.ts:957`）

照抄 `CityListPanel.ts` 的面板范式：`static show(parent, options)` 复用同名节点 → `build()` 一次性建 Label/Graphics → `open()` 绑 `input.on(TOUCH_END)` → `close()` 解绑并 `active=false`。两个子页 `menu` / `advisor` 用两组节点切换（不是重建），`debug()` 返回结构体给 CDP 断言读（`title/sub/infoKeys/infoValues/cmds/advisorRows/foot/hitNames/nodeCount`）。

---

## 2. 坐标公式

### 2.1 城图坐标 → 屏幕

沿用 `CampaignRoot.toScreen()`（`CampaignRoot.ts` 既有）：

```
rect = baseMapRect(MAP_VIEW)           // MAP_VIEW = {x:0, y:130, w:750, h:700}
k    = baseMapScale(750) = 750/1280    // 0.5859375
sx   = rect.x + x * k                  // rect = {x:0, y:198.75, w:750, h:562.5}
sy   = rect.y + y * k
```

### 2.2 部队在路上（沿折线按**段长**插值）

与 web `marchLerpPoint()`（`campaign.html:1020`）逐行等价：

```
pts = paths[pathIndex].points 过滤非法点
若 pts.length === 0 → 用两端城 pos_xy 兜底（Cocos 版会「追加」而不是替换，见下）
若 pts.length === 1 → 返回该点
t = clamp01(progress); along = reverse ? 1-t : t     // reverse = (army.from === path.End && from !== Start)
按 hypot 累积段长 → 找到 along*total 落在哪一段 → 段内线性插值
```

Cocos 版有一处**比 web 更宽容**：web 在 `pts.length < 2` 时只取 `cityOf(p.Start/p.End).pos_xy` 一个点返回；Cocos 把两端城的 `pos_xy` **追加**到点列后面再走同一套插值，这样 `points: []` 的哨兵路（`Length >= 30000`）也能沿两端城连线走，而不是钉死在出发城。

### 2.3 重叠错开（画与点同一份）

`armyStackPlace()`（`ArmyLayer.ts:263`）＝ web `marchStackPlace()`（`:1054`）：按九宫格顺序 `[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]` 各乘 `MARCH_STACK_GAP=13`，冲突判据 `dist < gap - 0.001`。

`armyScreenList()` 返回 `{a, x, y}[]`，`CampaignRoot.drawMap()` 用它画（`CampaignRoot.ts:2682`），`onTouch()` 的命中用 `armyHitIndex(this.armyScreen, x, y, 16)` 查**同一份**。web 的同一句：`for (const it of armyScreenList()) drawArmyMark(g, it)`（`campaign.html:3566`）＋ `hitArmy(px,py)`（`:2886`）。分两份必然出现「看到 A 却选到 B」，所以这里是硬约束。

### 2.4 命中半径与优先级

`MARCH_HIT_R = 16`（`ArmyLayer.ts:86`，与 web `campaign.html:1008` 同值；任务要求 ≥14）。`armyHitIndex()` 取圆内最近者（`d <= r*r && d < bd`），无命中 `-1`。

优先级由 `resolveMapHit(pickMode, armyIndex, cityIndex)`（`ArmyLayer.ts:366`）单点决定：

| 状态 | 判定顺序 | 依据 |
| --- | --- | --- |
| 选点态（`pickArmyId !== null`） | **只看城** | web `campaign.html:3627`：`if (pickArmyId) { …hitCity… }` |
| 平时 | **部队 > 城** | web `:3637`：`const ai = hitArmy(px,py); if (ai>=0) …; else hitCity` |

Cocos 的 `onTouch()` 先算最近城（半径 42²，`CampaignRoot.ts:2930` 附近）再算部队，然后交给 `resolveMapHit` 决定走哪条（`CampaignRoot.ts:2940`）。城用「最近」而非「首个」，是为了和既有的城市点击行为保持一致。

---

## 3. 兵团指令 5 项（逐项可用性）

面板 `openArmyMenu()`（`CampaignRoot.ts:3004`）→ 副标 `我軍/敵軍 · from → to · 已走 N%` ＋ 7 行军情 ＋ 5 个指令块 ＋ 脚注。截图见 `02_army_menu.png`。

### 3.1 武将资料 `general`

- 可点性：`Boolean(army.general)`；灰字 `沒有主將`，亮字 `${general} 的數值`
- 行为：关面板 → 打开既有「武 將 資 料」名册面板（`GeneralBookPanel.show()`）
- 实测：`cmds[0] = {act:'general', label:'武將資料', hint:'公孫瓚 的數值', enabled:true}`；点下去 `{menuClosed:true, bookOpen:true, bookActive:true}`（截图 `08_general_book.png`）
- **与原作差异**：web 是**单将资料卡**（只显示这名武将），Cocos 的 `GeneralBookPanelOptions` 没有 focus 参数，只能打开全名册（`[新设计]`，见 §6）

### 3.2 变更目的 `retarget`

- 可点性：`isMine === 'A'`；灰字 `敵軍兵團不可用`，亮字 `點相鄰敵城改道`
- 行为：进选点态（`enterPickMode()` `CampaignRoot.ts:3067`），提示条 `請選擇兵團目的城市（點相鄰的敵城／空城）· 點空地取消`；点城走 `applyRetarget()`（`:3094`）
- 校验：`armyRetargetCheck()`（`ArmyLayer.ts:618`）六条拒绝文案逐字照 web `marchRetargetCheck()`（`campaign.html:1100`）：没选中/敌军/没选中城市/目的地已经是/不能是出发城/没有可行道路/是我方城池
- 成功：`updateArmy(id, {to, pathIndex, progress: 0, reported: false})` ＋战报 `兵 團 改 道：…`
- 实测：`hint1 = 請選擇兵團目的城市…`、`hint2 = 已取消變更目的：兵團照原路走。`（点空地取消）
- **与原作差异**：web 退出选点态用右键 / Esc（`campaign.html:3645`、`:3650`）；Cocos 没有右键与键盘，改成**点空地取消**（`[新设计]`）

### 3.3 部队驻扎 `station`

- 可点性：`own && (stationed || 0 < progress < 1)`；灰字分三种：敌军 `敵軍兵團不可用`、未出发 `駐紮：停在路上、阻擋敵軍`、已到城下同理；亮字驻扎中 `駐紮中：再點一次解除`
- 三条拒绝文案逐字（`toggleStation()` `CampaignRoot.ts:3135`）：
  - `敵軍兵團不能下令駐紮。`
  - `部隊已到城下，不能再駐紮。`
  - `部隊還在出發城：出發後才能在路上駐紮。`
- 效果：`stationed` 翻转 → 下月推进**进度冻结**（`planArmyMoves()` 的 `frozen` 分支），并且**同段阻挡**：敌方推进被夹在接触点 `1 − ps − 0.005`（`STATION_EPS`，web `:1199`），同向则夹在 `pb − 0.005`
- 实测：驻扎后副标尾巴 `駐紮中：進度凍結，擋住這條道`、`cmds[2].hint = 駐紮中：再點一次解除`；`advanceArmiesMonth()` 前后 `{before:0.42, after:0.42}`（冻结）
- 对峙：`stationStandoff()`（`ArmyLayer.ts:579`）判定两军卡在接触点；Cocos 侧「第一次只记战报、再推一月按兵力折算结算」（`[新设计]`，见 §6）

### 3.4 任命军师 `advisor`

- 可点性：`own && armyOfficerList(army).length >= 2`（web `armyCanAppointAdvisor()` `campaign.html:1281`）
- `< 2` 灰字：**`軍團僅主將一人，無可任命`**（逐字，见 `04_advisor_gray.png`）
- `>= 2` 亮字：`從 N 名隨軍武將裡選`（见 `02_army_menu.png`、`05_advisor_lit.png`）
- 子页标题 `任 命 軍 師`；首卡 `不 設 軍 師`（免职），其余每人一张卡（主将标 `主將`）；脚注 `現任軍師：… · 點別張卡即更換 · 軍師技於開戰時發動`
- 写入：`armySetAdvisor()`（`ArmyLayer.ts:405`）——`''`＝免职返 true；非成员返 false 且不改值（面板提示 `這名武將不在隨軍名單裡。`）
- 实测：灰态 `{act:'advisor', hint:'軍團僅主將一人，無可任命', enabled:false}`；亮态 `advisorRows = ['不 設 軍 師','公孫瓚  ·  主將','嚴綱','公孫越']`
- **与原作差异**：web 开战时把 `?wise=<seq>` 传给战斗页（`campaign.html:4358`）；Cocos 的 `DeployRoot.ts` 在禁改名单里，战术军师技只能**提示玩家在编成屏选同一项**（`hint: 攻城戰：軍師 X（軍師技 #n，編成屏請選同一項）`）。这是**未做到**的一项，见 §7

### 3.5 进入城内 `enter`

- 可点性：`armyCanEnterCity()`（`ArmyLayer.ts:647`）——部队必须站在**我方**城上（`progress<=0` 看 `from`、`progress>=1` 看 `to`）
- 灰字：`部隊在路途中，不在城上` / `${at} 不是我方城池，不能進城`（逐字照 web `canEnterCity()` `:2974`）
- 亮字：`併入 ${city} 守軍`
- 结算：`GameState.enterCityWithArmy()`（`GameState.ts:824`）→ 守军 `Math.min(600, 现有 + 兵)`（`CITY_TROOP_CAP=600`，`GameState.ts:265`）、部队从 `armies` 移除、写战报 `兵 團 進 城：…`
- 实测：`{city:'北平', before:140, troops:5, after:145, gone:true}`，提示 `公孫瓚 5 兵 進入 北平，守軍 145（上限 600）。`

---

## 4. 行军推进（把 web 的 planArmyMoves 搬进月推进）

`CampaignRoot.advanceArmiesMonth()`（`CampaignRoot.ts:3291`）取代原来的 `GameState.marchArmies(3)`（`core/march.ts` 的线性 `advance()` 没有驻扎与阻挡，`core/` 禁改）：

1. `planArmyMoves(armies, army => armyStep(scenario, army.pathIndex))` —— 每支按自己路段的月数折算步长（`armyStep = 1/armyMonths`，`armyMonths = clamp(ceil(Length/100), 1, 3)`）
2. `GameState.applyArmyProgress()` 按 id 写回 progress，**不重排** `save.armies`（重排会让重叠错开的顺序抖动）
3. 被挡（`blockedBy && next < want`）写战报 `行 軍 受 阻：…`
4. `stationStandoff()`：首次只记战报 `駐 紮 阻 擋：…` ＋提示「下月仍未解開就會開戰」；第二次按 `resolveEncounter()` 口径结算（`chance = clamp(0.15, 0.85, mine/(mine+foe))`)
5. 出兵/抵达的 `arrived/still` 仍按原样回给 `doAction('advance')` 组提示条

顺带把出征改成**真出兵**：`doAction('march')` 在没有「已到城下」的我方部队时调 `dispatchArmyTo()`（`CampaignRoot.ts:3227`），扣守军、`addArmy({officers, advisor:'', stationed:false})`；只有 `arrivedAt(city,'A')` 非空时才进 Deploy 编成屏，且进之前 `removeArmy()`——因为 `DeployRoot.ts:1594` 会把非空 `armyId` 当**守城战** `defend=true`，进攻不能走 `setDeployArmy`。

AI 侧同步：`runMapAi()` 与 `spawnRaid()` 造的 B 方部队也带 `officers`（不任命军师），对齐 web `spawnAiArmy()`。

---

## 5. 文案同步（4 处）

| 项 | 位置 | 实测 |
| --- | --- | --- |
| 顶栏纪元 `西元 N年 M月` | `CampaignRoot.ts:2357`：`西元 ${adYearOfMonth(save.month)}年 ${month}月`；`adYearOfMonth()` 在 `SaveSlots.ts:522`（`184 + floor((m-1)/12)`，锚点 184） | `labelMonth` 连推 4 月都过 `/^西元 \d+年 \d+月$/`：184年2/3/4/5月；截图 01/06 |
| 存档槽 `記錄01..10` 4 段 | `SaveSlots.ts:504` `SLOT_LABEL='記錄'`、`:528` `slotTitle()`（两位补零）、`:541` `slotLines()` → l2 = `[君主, 城數NN, 武將NNN, 時間NNN年].join(' ｜ ')` | `['記錄01 · 使用中','公孫瓚 ｜ 城數01 ｜ 武將003 ｜ 時間184年','存於 …']`；截图 07 |
| 月推进 `內政時間到了....` | `SaveSlots.ts:575` `ADVANCE_NOTICE`（四个半角点）；`CampaignRoot.ts:2054` 拼在提示条最前 | `內政時間到了....推進一月：稅收 +0 金。…`；截图 06 |
| 招降标题 `武 將 招 降` | **原本就有**（`SurrenderPanel.ts:75 PANEL_TITLE_TEXT`，注释「逐字照原作」） | 无需改 |

对照依据（与 web 一致，非新设计）：
- 纪元：web `game/web/era.js:161 eraTextOfMonth()`；原作帧 `work/video_ui/A_map_date_zoom_t0130.png`（`西元` 后与 `年` 后各一个半角空格）
- 存档槽：web `game/web/saves.js:1379 SLOT_LABEL`、`:1382 slotTitle()`、`:1395-1407 slotLineParts()`；原作帧 `work/video_ui/A_save_t0035.png`
- 月推进：web `game/web/saves.js:1420 advanceNotice`；原作帧 `work/video_ui/A_map_monthprompt_t0183.png`

存档槽第 3 行 `存於 <日期>` 是 Cocos 自有（web 只有 4 段，一行装不下日期）→ `[新设计]`。

---

## 6. 与原作的差异

### 6.1 一致的部分（有出处）

| 行为 | Cocos | web / 原作 |
| --- | --- | --- |
| 部队坐标＝沿折线按段长插值 | `ArmyLayer.ts:117/184` | `campaign.html:1020 marchLerpPoint` / `:1148 armyPos` |
| 画与点**同一份**列表 | `CampaignRoot.ts:2682` + `:2940` | `campaign.html:3566` + `:2886` |
| 命中半径 16 | `ArmyLayer.ts:86` | `campaign.html:1008` |
| 重叠错开 13 / 九宫格顺序 | `ArmyLayer.ts:263` | `campaign.html:1054` |
| 选点态只看城、平时部队优先 | `ArmyLayer.ts:366` | `campaign.html:3627-3642` |
| 驻扎＝冻结＋同段阻挡夹点 `1−ps−0.005` | `ArmyLayer.ts:493/528` | `campaign.html:1326/1346`、`STATION_EPS` `:1199` |
| 军师可点性 `officers>=2` | `ArmyLayer.ts:393` | `campaign.html:1281` |
| 进城内上限 600 | `GameState.ts:265/824` | `campaign.html:2982 enterCity` |
| 5 项标签/灰字文案 | `ArmyLayer.ts:672` | `campaign.html:2999-3040` |
| 7 行军情（主將/軍師/目的地/武將數/兵數/金錢/地形） | `ArmyLayer.ts:742` | `campaign.html:2949-2972` |

### 6.2 明确不同的部分

| # | 差异 | 标签 | 原因 |
| --- | --- | --- | --- |
| D1 | **路上遭遇战**：web 走 `startEncounter()` → `encounter.html` 野战页；Cocos 没有野战场景（Deploy/Battle 都锚在城上），改成「对峙第一次记战报，再推一月按兵力概率折算结算」 | `[新设计]` | 禁改 `DeployRoot.ts`/`Battle*.ts`，且 `encounter.html` 是 web 独有页 |
| D2 | **选点态取消**：web 右键 / Esc；Cocos 点空地 | `[新设计]` | Cocos 无右键、无键盘 |
| D3 | **武将资料**：web 单将资料卡；Cocos 打开全名册「武 將 資 料」 | `[新设计]` | `GeneralBookPanelOptions` 无 focus 参数，且 `GeneralBookPanel.ts` 不在允许改动名单内 |
| D4 | **军师技传递**：web `?wise=<seq>` 直达战斗；Cocos 只提示「编成屏请选同一项」 | 未做到 | `DeployRoot.ts` 禁改，编成屏自己选 wise |
| D5 | **兵力牌宽度**：web `measureText+10`；Cocos 固定 34px | `[新设计]` | Cocos `Graphics` 没有 `measureText` |
| D6 | 存档槽第三行 `存於 <日期>` | `[新设计]` | web 只有 4 段一行 |
| D7 | AI 月报在提示条截断到 28 字（完整进战报） | `[新设计]` | 提示条单行不换行，13 势力全列会冲出设计宽度（见 §8 修 2） |

### 6.3 待确认（推测）

- `[推测]` 原作「部队驻扎」是否也影响 AI 的出兵判断（web 里 AI 不主动驻扎，见 185 §已知限制）。Cocos 侧 AI 同样不驻扎、不任命军师。
- `[推测]` 原作部队旗面颜色与势力色的关系：web 只用 A/B 两色（`#7FD1A8` / `#F2AE97`），Cocos 照抄；原作帧 `work/video_ui/A_map_troopmenu_t0120.png` 里兵团菜单第 3 项本身是灰字，无法据此判断旗色是否随势力变。

---

## 7. 未做到 / 半做到

1. **军师技不会自动带进战斗**（半做到）：`DeployRoot.ts:1586` 的 `wise` 来自编成屏自己的选择，禁改名单不允许我把它接到 `army.advisor`。当前只在攻城前把军师与 `#seq` 写进提示条。要让军师真正生效，需要允许改 `DeployRoot.ts`（读 `GameState` 里暂存的 `armyAdvisor/wise`）或允许改 `Battle*.ts`。
2. **路上野战没有战场**（差异，非缺陷）：见 D1。原作 `encounter.html` 是独立页；Cocos 若要 1:1，需要新增一个「遭遇战」场景并复用 `BattleRoot`，属于新工程范围。
3. **AI 不会主动驻扎、不会任命军师**：与 web 185 的已知限制一致（web 侧同样未做），未额外补。
4. **武将资料不是单将卡**（D3）：只能开全名册。
5. **`stationed` 的跨存档稳定性**：`stationed` 现在会正确读回（`normalizeArmies`），但没有像 web 的 `stationSince/stationNoticed` 那样的时间戳——Cocos 的对峙「第一次/第二次」判定用的是页面内存 `Set`（`this.stationNoticed`），重启游戏后会重新计一次「第一次」。`[新设计]`，与 web 的页面内存语义接近（web 同样是页面内存）。
6. **`CityPanel`/`CityModel` 未改**：本轮的 5 项指令全在大地图面板里完成，`CityPanel.ts` / `CityModel.ts` 在允许名单内但无需改动（行数变化 1650/1901 是之前轮次的）。若要把「进入城内」也做成城内面板入口，需要另开一轮。

---

## 8. 施工中发现并修掉的问题

1. **兵力牌浮在面板上**：`ArmyMenu` 是 `CampaignRoot.node` 的子节点，`placeArmyBadge()` 每帧把 Label `setSiblingIndex(children.length-1)` 抬到最上层 → 面板打开时「5」压在面板上。修：`CampaignRoot.ts:2691` 开头 `if (!picked || this.armyMenu?.isOpen) { badge.active=false; return; }`。
2. **提示条文字冲出屏幕**：`labelHint` 是单行、`overflow NONE`；月推进时 AI 月报会把 13 个势力全列 → 文字跑到 876×1368 的黑边上。修：`ai.log[0]` 截 28 字（完整进战报）＋新增 `clampHint(text, 96)`（`CampaignRoot.ts:2386`）。
3. **任命军师子页标题空白**：`titleLabel/subLabel` 原本挂在 `menuGroup` 下，切页时 `menuGroup.active=false` 连带藏掉。修：改挂 `root`（`ArmyLayer.ts` build 段，注释写明）。
4. **遮罩盖不住画布**：`addVeil` 只盖 750×1334，876×1368 时左右露出底下的地图与提示条文字。修：`VEIL = {-240,-240, 1230, 1814}`（`ArmyLayer.ts:890`）。
5. **存档槽「武將000」**：`metaOfSave()` 只数 `save.roster`，开局是空 → 补上「我方各城的 `major` + `officers[].name`」（`SaveSlots.ts:346`），现在 `武將003`。

---

## 9. 证据索引

### 9.1 纯函数断言（65 条）

`work/cocos_army/assert_army.mjs`，`node work/cocos_army/assert_army.mjs` → `65/65 通过 ✓`，明细 `work/cocos_army/assert_army_report.json`。

| 组 | 条数 | 覆盖 |
| --- | --- | --- |
| A 插值 | 9 | `armyLerpPoint` 两端/中点/反向/单点/非法点/segLen 加权 |
| B 画＝点同份列表 | 5 | `armyScreenList` 的坐标即 `armyPos+toScreen`、顺序与 `armies` 一致 |
| C 优先级与半径 | 6 | `resolveMapHit` 四态、`armyHitIndex` 边界 `d==r²`、最近者 |
| D 错开 | 2 | 重合两支错开 13、不重合不动 |
| E 驻扎冻结 | 3 | `planArmyMoves` 的 `frozen`、progress 不变 |
| F 阻挡夹点 | 6 | 相向 `1−ps−0.005`、同向 `pb−0.005`、不后退不超车、`blockedBy` |
| G 对峙 | 3 | `stationStandoff` 相向/同向/不同段 |
| H 军师两态 | 7 | `officers<2` 灰、`>=2` 亮、`armySetAdvisor` 免职/非成员、`armyRosterPick` 主将第一 |
| I 改道进城 | 7 | `armyRetargetCheck` 六条拒绝、`armyCanEnterCity` 两态 |
| J 5 项矩阵 | 6 | `armyCmdRows` 的 enabled 与 hint |
| K 文案月数 | 11 | `armyMonths/armyStep/armyRemain/armyAtCity/armyInfoRows` |

### 9.2 CDP（876×1368，先 `Page.bringToFront` 且确认 `getTotalFrames()` 在涨）

- `work/cocos_army/steps_army.mjs` → **22/22**，报告 `work/cocos_army/cdp_report.json`
- `work/cocos_army/steps_text.mjs` → **6/6**
- 断言的实测值（原文摘录）：
  - 出征 `{"id":"m1-A1","from":"北平","to":"襄平","troops":5,"general":"公孫瓚","officers":["公孫瓚","嚴綱","公孫越"],"advisor":"","stationed":false,"progress":0}`
  - `armyScreen` `[{x:573,y:255}]`
  - 面板 `sub = 我軍 · 北平 → 襄平 · 已走 42% · 剩 1.7 個月（約 52 天）`
  - 驻扎 `{before:0.42, after:0.42}`、`cmds[2].hint = 駐紮中：再點一次解除`
  - 军师灰 `{enabled:false, hint:'軍團僅主將一人，無可任命'}`；军师亮 `hint:'從 3 名隨軍武將裡選'`
  - 进城内 `{city:'北平', before:140, troops:5, after:145, gone:true}`
  - 武将资料 `{menuClosed:true, bookOpen:true, bookActive:true}`
  - 存檔槽 `['記錄01 · 使用中','公孫瓚 ｜ 城數01 ｜ 武將003 ｜ 時間184年','存於 …']`

### 9.3 截图（`work/cocos_army/`）

| 文件 | 内容 |
| --- | --- |
| `01_army_on_road.png` | 部队（旗＋兵力牌 5）在北平→襄平的路上；顶栏 `西元 184年 1月` |
| `02_army_menu.png` | 兵團指令面板：副标 42%、7 行军情、5 项（进入城内灰） |
| `03_stationed.png` | 驻扎态：副标「駐紮中：進度凍結，擋住這條道」、地形行「平原（路上） · 駐紮中（進度凍結）」 |
| `04_advisor_gray.png` | 军师灰：`軍團僅主將一人，無可任命` |
| `05_advisor_lit.png` | 军师亮：`任 命 軍 師` 子页，4 张卡（不設／主將／嚴綱／公孫越） |
| `06_advance_notice.png` | 月推进：`內政時間到了....` ＋ 战报逐条 |
| `07_save_slots.png` | 存档槽 `記錄01..10` 4 段行 |
| `08_general_book.png` | 武将资料：兵团指令关闭 → `武 將 資 料` 名册（按势力分组，公孫瓚 3 人） |

### 9.4 复现命令

```powershell
cd F:\sanguo\game\cocos; npm.cmd exec -- tsc -p tsconfig.check.json --noEmit    # exit 0
cd F:\sanguo; node work\cocos_army\assert_army.mjs                              # 65/65
cd F:\sanguo; Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode preview

# CDP（Chromium 会把「完全被遮挡的窗口」算成 hidden → rAF 停走 → 截图全是同一帧，
# 见 project\169_Cocos启动故障.md:51/:85；必须带这三个开关）
$env:PORT='9444'; $env:PROFILE='F:\sanguo\work\.edgeprof_cocos_army2'; $env:OUTDIR='F:\sanguo\work\cocos_army'
$env:GPU_ARGS='--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling'
node work\cocos_verify\cdp.mjs launch
node work\cocos_verify\cdp.mjs run work\cocos_army\steps_army.mjs
node work\cocos_verify\cdp.mjs run work\cocos_army\steps_text.mjs
```

### 9.5 相关文档

- `project/182_大地图部队层.md`（web 侧部队层与 5 项指令）
- `project/185_驻扎与军师.md`（web 侧驻扎与军师）
- `project/169_Cocos启动故障.md`（CDP 截图纪律：`Page.bringToFront` + `getTotalFrames()` 必须涨）
