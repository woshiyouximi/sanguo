# 111 Cocos 君主阵亡弹窗与逐条战报

- 日期：2026-11-25
- agent：`cocos-monarch-ui`
- 范围：Cocos 大地图（`CampaignRoot.ts` + `MonarchPanel.ts`），不碰 `MonarchModel.ts` / `GameState.ts` / `AiRunner.ts` / `core/**` / `game/web/**`
- 前置：`project/106_Cocos君主与势力.md` §9 第 2、3 条「沒做到」；§4.4 城點分色

---

## 1. 结论

| 目标 | 状态 | 证据 |
| --- | --- | --- |
| ① 玩家君主阵亡 → 弹「君主陣亡 → 選繼承人」 | 完成 | 纯状态机 `successionStart/View/Land`（`CampaignRoot.ts:713/752/798`）＋面板抽屉 `MonarchPanel.openSuccession`（`MonarchPanel.ts:538`）＋面板级 shim 点击测试（探针 §14） |
| ② AI 逐条战报（环形缓冲 + 底部战报区） | 完成 | `BattleLog` 环形缓冲（`CampaignRoot.ts:453-557`）＋浮层 `drawBattleLog`（`:2392`）＋`recordAiBattleLog`（`:2319`）接 `runMapAi()` 结果 |
| ③ 城点按势力 tint（金环覆盖/选中亮金/中性灰） | 完成（原本已有 inline 实现，本轮抽成纯函数并补探针） | `cityTintOf`（`CampaignRoot.ts:587`），`drawMap` `:1863`、`placeCityLabels` `:1995` |
| tsc | EXIT=0 | `tsc -p tsconfig.check.json --noEmit` |
| 探针 | **201 条断言，PASS 201 / FAIL 0** | `node work/cocos_monarch85/probe.mjs` |

本轮**没有**跑 CocosCreator / `tools\build_wechat.ps1`（无真机），全部用「纯函数 + mock cc shim + 探针」证明。

---

## 2. 改动清单

### 2.1 `game/cocos/assets/scripts/CampaignRoot.ts`（2571 行，+832 行）

新增纯逻辑 region（不 import `cc`，探针可逐行抽出编译）：

| 行 | 内容 |
| --- | --- |
| `:48` / `:1631` | 去掉 `save as unknown as AiSave`：`CityRuntime.officers` 升成物件数组后 `CampaignSave` 可直接赋给 `AiSave`（`runAiMonth(save, …)`）；`AiSave` import 换成一行注释说明 |
| `:363–:844` | `// #region 戰報 / 君主繼承 / 城點取色（純邏輯）`（480 行，全部 `export`） |
| `:383` | `BATTLE_LOG_MAX = 8`（与 web `pushLog` 的 8 条一致） |
| `:385-391` | `BATTLE_LOG_KEY` / `MONARCH_SEAT_KEY` / `MONARCH_EXTINCT_KEY` 三个 localStorage 键 |
| `:393` | `logKindOf(value)`：把读盘的任意值收敛成 `'info'\|'atk'\|'hold'\|'lost'\|'win'\|'year'` |
| `:399-407` | `LOG_VIEW{392,786,336,234}` / `LOG_BAR_H=62` / `LOG_HEAD_H=28` / `LOG_ROW_H=24` / `LOG_ROW_TOP=34` |
| `:410` | `logHit(x,y,collapsed)` → `'header'\|'body'\|''`（标题列可点折叠，内容区吞点击） |
| `:418` | `monthStamp(month)` = web `stamp()`：`N年M月` |
| `:428` | `logColor(kind)`：`atk #E8A08C`、`hold #7FD1A8`、`lost #E08A7A`、`year #F0D48A`（web `.logrow.*` 同名色），其余返回 `''` 用主题色 |
| `:453/467/478/487` | `battleLogPush` / `battleLogTail` / `battleLogAppend` / `battleLogLine`（环形缓冲，纯函数、不改入参） |
| `:498` | `battleLogFromAi(out, max)`：三类战报的唯一来源 |
| `:563` | `tintLighten(hex,k)`（原 `lighten()` 的实现搬进 region，`:141` 的 `lighten()` 改成转调，避免两份实现漂移） |
| `:573/587` | `CityTint` / `cityTintOf(owner, playerForce)`：色板只从 `M.forceColorOf` 取 |
| `:602-686` | `successionOfficers` / `successionCandidates`：城→守将摊平 + `M.successionList` 排序 + 城名 |
| `:688-732` | `SuccessionState` / `SuccessionStartArgs` / `successionStart`（不改存档，只算 prompt/extinct） |
| `:734-777` | `SuccessionRow` / `SuccessionView` / `successionView`（弹窗文字全在这里，面板只排版） |
| `:779-842` | `SuccessionOutcome` / `successionLand`（prompt→`M.inheritForce`，extinct→`M.extinguish`） |

类内接线：

| 行 | 内容 |
| --- | --- |
| `:895/:897` | `battleLog: BattleLogLine[]`、`logCollapsed` |
| `:903` | `successionState: SuccessionState \| null` |
| `:909/:911` | `monarchSeat`、`monarchExtinct` |
| `:929` / `:971` | `onLoad()` 末尾 `this.buildLogLabels()`（建标题 + 8 组「时间/正文」Label） |
| `:974` / `:994-1000` | `start()`：`promoteLogLabels()` → `loadBattleLog()` → `loadMonarchSeat()` → `refresh()` → `checkMonarchDeath()` |
| `:1426` / `:1441` | `doAction('advance')`：`this.save = GameState.loadSave()` 之后 `this.recordAiBattleLog(ai)` |
| `:1454` | 无 AI 月时的 `spawnRaid()` → 战报「敵軍出動：A → B」 |
| `:1462` | 敌军抵达 → 战报「敵軍抵達 X 城下（N 兵）」 |
| `:1472` | `advance` 末尾 `checkMonarchDeath()`（AI 回合里丢座位城 → 回大地图弹窗） |
| `:1705/1722` | `refresh()` 里 `refreshBattleLog()` |
| `:1793/1830` | `drawFrame()` 末尾 `drawBattleLog(ui)`（底板走 `gUi`，文字是兄弟 Label） |
| `:1833/1863` | `drawMap()`：`const tint = cityTintOf(owner, this.playerForce())`，色晕 alpha / 金环 alpha+线宽全走 tint |
| `:1974/1995` | `placeCityLabels()`：`label.color = rgba(tint.labelColor \|\| COLORS.textDim)`，保留「无主但 owned → 金」兜底 |
| `:2039/2045` | `onTouch()`：`monarchPanel.isOpen` 之后 `if (this.successionState) return;`（弹窗期间地图不吃点击） |
| `:2055-2060` | `logHit()` → header 折叠 / body 吞点击 |
| `:2154/2169` | `syncMonarchState()`：`if (!M.monarchOf(view)) { if (!this.monarchExtinct) M.seedMonarch(...) } else M.seedCityOwners(...)`（防灭国后刷新页面又播种子） |
| `:2211-2261` | `ownerOf` / `playerForce` / `officersByCity` / `ensureMonarchPanel` / `openMonarchCard` 沿用 |
| `:2276` | `buildLogLabels()` |
| `:2296` | `promoteLogLabels()`（城名 Label 在 `start()` 才建，兄弟序在后会盖住战报） |
| `:2311` | `pushBattleLog(lines)` |
| `:2319` | `recordAiBattleLog(ai)` |
| `:2326/2334` | `storeBattleLog()` / `loadBattleLog()`（读盘时用 `logKindOf` 收敛） |
| `:2365` | `refreshBattleLog()`（最新在上，和 web `renderLog()` 同序） |
| `:2392` | `drawBattleLog(g)` |
| `:2406` | `toggleBattleLog()` |
| `:2421-2461` | `loadMonarchSeat` / `storeMonarchSeat` / `storeMonarchExtinct`（新开局清座位+灭国旗标） |
| `:2471` | `detectMonarchDeath(): string`（座位丢了返回死者名） |
| `:2513` | `checkMonarchDeath()`（算候选 → view → 开面板） |
| `:2543` | `commitSuccession(name)`（落地 + 写战报 + 重画） |

### 2.2 `game/cocos/assets/scripts/MonarchPanel.ts`（878 行，+124 行）

| 行 | 内容 |
| --- | --- |
| `:97/:106` | `SuccessionPanelRow{text,tone,name}` / `SuccessionPanelView{title,sub,hint,extinct,rows}` |
| `:201` | `sheetKind` 联合类型加 `'succession'` |
| `:210` | `successionView` / `successionPick` / `successionPage` 字段 |
| `:340/:349` | `open()` / `hide()` 清 succession 状态 |
| `:403-414` | `rowOf` 的 for-of 头修复：`const gens = this.opts?.generals ?? []` 先落常量再 `for (const g of gens)`（Creator 3.8.8 的 `plugin-transform-for-of` 不吃逻辑式当 for-of 头） |
| `:538` | `openSuccession(view, onPick)`：build → active → registerTouch → `sheetKind='succession'` → `rebuildSuccession()` |
| `:553` | `clearSuccession()` |
| `:560` | `rebuildSuccession()`：候选按 `PAGE_ROWS=5` 分页＋「下一頁 ▶（p/q）」＋ confirm 行＋ prompt 态补「必須選一位，無法取消」 |
| `:603` | `pickSuccession(name)`：清抽屉 → `hide()` → 回呼（**先关窗再回呼**） |
| `:613` | `turnSuccessionPage(pages)` |
| `:620-622` | `rebuildSheet()` 开头分流到 succession（沿用原抽屉的 7 行 × 60px 布局与绘制） |

`onTouch` 未改：原逻辑「`sheetKind!=='none'` 时只认行、其余全部吞掉」正好满足「非答不可」——三颗按钮与卡片外点击都关不掉弹窗。

### 2.3 新增探针

- `work/cocos_monarch85/probe.mjs`（700 行）
- 产物目录 `work/cocos_monarch85/_probe/`（`MonarchModel.probe.mjs`、`region.probe.mjs`、`panel/`、`panel_mutant/`）
- 报告 `project/111_Cocos君主弹窗与战报.md`（本文件）

---

## 3. 逐条战报

### 3.1 数据流

```
AiRunner.runMonth()
  → AiMonthOutcome{ month, log[], battles[], incoming[], gone[], changed, ... }
  → CampaignRoot.runMapAi()（:1609，原样返回 out）
  → doAction('advance'): recordAiBattleLog(out)（:1441）
  → battleLogFromAi(out)（:498）→ battleLogAppend(buf, lines, 8)（:478）
  → storeBattleLog()（localStorage 'sanguo_battlelog_v1'）
  → refreshBattleLog()（:2365，最新在上）→ 8 组 Label
```

缓存语义：`battleLogPush` 返回**新数组**并裁到最近 `BATTLE_LOG_MAX=8` 条；`battleLogTail` 返回「最新在前」的副本——两条都有探针断言（不改入参、上限、顺序）。

### 3.2 三类战报的触发路径

| 类 | 触发字段（AiRunner） | 组装位置 | 行文字 |
| --- | --- | --- | --- |
| **某势力出兵某城** | `out.incoming[i]`：`{force, from, to, troops, ...}`（`AiRunner.ts:102-112`） | `CampaignRoot.ts:504-514` | `A 出兵 城B（自 城A · N 兵）`，kind=`atk` |
| **某城易手** | `out.battles[i].captured`（`AiRunner.ts:115-127`；`battles.push(bt)` 在 `AiRunner.ts:510`） | `CampaignRoot.ts:517-530` | 得手：`城B 易手：某将 破城（守 N 兵）` kind=`win`；败退：`城A 攻 城B 敗退（守 N 兵）` kind=`lost` |
| **某将/君主阵亡** | `out.log` 中含「陣亡」「滅亡」的行（源头 `AiRunner.ts:519-522` 的「X 的君主陣亡於 Y，Z 繼位」、`:541-545` 的「勢力滅亡：X」） | `CampaignRoot.ts:532-538` | 原文照抄，kind=`lost` |
| 补充：势力灭亡 | `out.gone[i]` | `CampaignRoot.ts:540-553`（与上一条去重） | `X 勢力滅亡：名下已無城池` kind=`lost` |
| 补充：玩家侧君主阵亡 | `commitSuccession()` | `CampaignRoot.ts:2543-2557` | `N年M月　X 君主陣亡：Y 繼位（勢力存續 · 名號不變）` / `…：勢力滅亡` kind=`lost` |

「某将阵亡」的实际文本由 `AiRunner` 的 `captureKingIn` 决定（`AiRunner.ts:519-522`），本 agent 不改 `AiRunner.ts`，因此**只做透传**：`out.log` 里凡是带「陣亡/滅亡」的行都进战报。

### 3.3 界面

- 位置：地图右下角 `LOG_VIEW = {x:392, y:786, w:336, h:234}`（`[新设计]`：web 是右栏常驻列表，Cocos 的地图区没有侧栏，放地图右下、城市卡（y=1240）之上）
- 标题列「戰 報 3/8 ▾」可点折叠（`logHit` header），折叠后高 `LOG_BAR_H=62`，只留标题 + 最新一条
- 8 行 = 8 组 Label（时间 11px/`textFaint` + 正文 11px），颜色按 `logColor(kind)`；展开时整块吞点击（防止点战报误选城）
- 落盘：`localStorage['sanguo_battlelog_v1']`，`start()` 里恢复；读盘时 `logKindOf` 收敛脏 kind

---

## 4. 君主阵亡 → 选继承人

### 4.1 触发口径（`[推测]`，因为 web 只在破城瞬间判一次）

`detectMonarchDeath()`（`:2471`）：

1. `M.monarchOf(save)` 为空 → 不判（还没君主）
2. 记住的「君主座位城」仍在 `save.owned` → 不判
3. 在 `owned` 里找 `garrisonOf(data,0,city).major === 君主` 的城 → 把座位搬过去，不判
4. 座位城不在了 → **判阵亡**，返回君主名
5. 首次（座位为空）→ 用 `owned[0]` 兜底当座位，不判

「座位」存 `localStorage['sanguo_monarch_seat_v1']`；「已灭国」存 `sanguo_monarch_extinct_v1`，二者在新开局（`month<=1 && wins===0 && losses===0`）都会清掉（`loadMonarchSeat` `:2421`），否则上一局的座位会被误判成「开局即阵亡」。

调用点：`start()`（`:1000`，守城战在 Deploy 结算、回大地图是新场景）与 `doAction('advance')` 末尾（`:1472`，AI 回合里丢城）。

### 4.2 状态机（纯函数）

```
successionStart({force, dead, month, remaining, officers, king})
  remaining === 0            → phase 'extinct'
  否则 candidates = M.successionList(force, officers, {dead, king})
     有候选 → 'prompt'；无候选 → 'extinct'
successionView(state)        → {title, sub, rows[], hint, extinct}
   prompt  : title「君主陣亡 · 選繼承人」，rows 全是 cand 行（无取消/确定行）
   extinct : title「君主陣亡 · 勢力滅亡」，rows = note「殘將散去 · 還有 N 城無主/名下已無城池」+ confirm「確定：勢力滅亡」
successionLand(save, state, pick)
   prompt  → M.inheritForce(save, force, pick || 候选首位, {month})；战报「X 繼承」
   extinct → M.extinguish(save, force, {month, dead, officers})；战报「勢力滅亡」
```

与 `M.kingDeath` 的关系：玩家侧是「**先弹窗、后落地**」两步；探针用同一份输入分别跑 `successionLand` 与 `M.kingDeath`，再用 `stable()` 逐键对比整个存档（含 `fate` 表）证明**落档结果完全一致**（0 候选、1 候选两种夹具）。

### 4.3 界面

- `MonarchPanel` 的抽屉机制（`R_SHEET{18,672,714,584}`、7 行 × 60px、金边、标题带）直接复用：`sheetKind='succession'`
- 候选行：`甲 · 同族　武 84 · 智 76 · 忠 88　駐 江州`
- 5 人/页 + 「下一頁 ▶（p/q）」；灭国态是「说明行（不可点）+ 確定：勢力滅亡」
- prompt 态末行补「必須選一位，無法取消」（面板 UI 文案，`successionView` 不产出——探针只断言 prompt 无 confirm/取消行）
- **非答不可**：`CampaignRoot.onTouch` 在 `successionState` 非空时直接 return（`:2045`）；面板 `onTouch` 在 `sheetKind!=='none'` 时只认行，三颗按钮与卡片外点击都吞掉

---

## 5. 城点势力 tint

`cityTintOf(owner, playerForce)`（`CampaignRoot.ts:587`）——色板**不复制**，`color = M.forceColorOf(owner)`（`MonarchModel.ts:1008`，14 固定色 + 14 备色 + 中性灰）：

| 情形 | 主色 | 色晕 | 金环 | 城名 |
| --- | --- | --- | --- | --- |
| 我方城 | `M.forceColorOf(我方)` | `alpha 120` | `M.FORCE_GOLD` alpha 235 / 线宽 2 | `M.FORCE_GOLD` |
| 其他势力 | `M.forceColorOf(势力)` | `alpha 78` | 不画（alpha 0） | `tintLighten(color, 0.42)` |
| 无主城 | `FORCE_COLOR_NEUTRAL '#8A8478'` | `alpha 78` | 不画 | `''` → `COLORS.textDim` |

选中环仍是 `COLORS.goldLight` 3px（原逻辑，未改）。

真实数据（`scenarios.json[0].cities` 60 城 × `garrison.json` 剧本 1）实测分布：

```
#8A8478×39  #C9A82E×6  #B14A3B×3  #6E8FBF×1  #B98A3E×1  #8E6BA8×1
#4F8F8B×1   #7C8A48×1  #6B6F76×1  #D0803C×1  #4F9A6E×1  #3F6E9A×1
#8C6248×1   #7A6FB0×1  #5E7D5A×1
```

即：60 城全部取到 tint，无主 39 / 有主 21，14 家势力，15 种色号；14 家固定色逐一等于 `M.FORCE_PALETTE[i].color`，主色 === `M.forceColorOf(owner)`（色板单一来源）。

---

## 6. 验证

### 6.1 tsc

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
EXIT=0
```

### 6.2 探针 `work/cocos_monarch85/probe.mjs`

```
node work\cocos_monarch85\probe.mjs
→ 斷言：201 條（PASS 201 / FAIL 0）  EXIT=0
```

做法（不跑 Creator）：

1. 按 `// #region 戰報 / 君主繼承 / 城點取色（純邏輯）` … `// #endregion` 逐行抽出 480 行，`ts.transpileModule`（ES2022/ESNext）→ `_probe/region.probe.mjs`；`MonarchModel.ts` 同法编译 → `_probe/MonarchModel.probe.mjs`（region 只 import 它）
2. 直接 import 真实编译产物做断言；`60 城` 读真实 `scenarios.json` + `garrison.json`
3. **面板级 shim**（§14）：把 `MonarchPanel.ts` 与它的相对 import 树（`view/layout` → `core/battle` …）编译成 CommonJS，`node_modules/cc` 指向 `work/cocos_items/_sim/node_modules/cc`（上一轮 ItemsPanel 的 mock cc），`new Node().addComponent(MonarchPanel)` → `onLoad()` → `openSuccession()` → `cc.__emitTouch()` 真的点

断言分区：

| 区 | 内容 |
| --- | --- |
| 1 | `monthStamp` / `logColor` / `logKindOf` |
| 2 | 环形缓冲：上限 8、最新在后、不改入参、append 合并 |
| 3 | `battleLogFromAi`：出兵 / 易手 / 败退 / 阵亡原文 / `gone` 去重 / 跳过月报 / max 上限 / kind 对色 |
| 4 | `logHit`：标题列 / 内容区 / 左右下边界 / 折叠高度 |
| 5 | 单点 tint 语义（玩家 / 他势力 / 无主 / 金环 alpha） |
| 6 | 真实 60 城 tint：60 城、色号全在色板内、主色 === `forceColorOf`、39 中性 / 21 有主 / 1 玩家城 / 14 家 / 15 色 / 直方图 / 14 家逐一 / 备色稳定 |
| 7-11 | 继承：0 候选 extinct、1 候选 prompt、多人排序（同族 2 万分优先）、指定非首位生效、`remaining=0` 即便有人也灭国、有城无候选文案、`successionOfficers` 城→守将摊平；**与 `M.kingDeath` 落档逐键对拍** |
| 12 | 阴性对照 ×2（见 6.3） |
| 13 | 接线静态断言（24 条：19 条串匹配 —— `buildLogLabels`/`promoteLogLabels`/`recordAiBattleLog`/`refreshBattleLog`/`drawBattleLog`/`logHit`/`toggleBattleLog`/两处 `cityTintOf`/`checkMonarchDeath`/新开局清座位/灭国不播种/`openSuccession`/`successionState` 早退/`logKindOf` 读盘收敛/面板 `succession` 抽屉/`rebuildSheet` 分流/`pickSuccession` 先关窗；+ 3 条结构性 —— `cityTintOf` 至少两处、类别内不得再出现 `forceColorOf`、`pickSuccession` 先关窗再回呼；+ **2 条 for-of 头扫描**：`CampaignRoot.ts` 与 `MonarchPanel.ts` 都不得出现「`for (const x of …??/||/&&/?:…）」，防 Creator `plugin-transform-for-of` 崩 `TSUnionType`） |
| 14 | 面板级点击：3 候选 → 4 行；点「關閉」/卡片外无效；点第 2 位回呼「乙」并关窗；7 候选 → 5+翻页+提示 7 行、翻页后点人回呼「將5」；灭国态 2 行、说明行 `act=null`、确定行回呼 `''` |

### 6.3 阴性对照（证明探针不是恒绿）

| 改坏处 | 期望 | 实测 |
| --- | --- | --- |
| region 的 `BATTLE_LOG_MAX = 8` → `3` | 探针红 | 红（正确） |
| region 的 `ringAlpha: isPlayer ? 235 : 0` → `? 0 : 0` | 探针红 | 红（正确） |
| 面板产物 `openSuccession` 的 `this.opened = true` → `false` | `isOpen` 断言红 | `isOpen=false`（§14.6，正确） |

前两个把 region 改坏后重新编译、再断言同样的事实（上限 8、金环 alpha 235 必须是真的）；第三个是把面板产物复制一份改坏后重新实例化，证明 §14 的「开窗」断言不是恒真。

另外，探针 §13 的 **for-of 头扫描**是给 Creator 兜底的：`tsc` 看不出 `for (const g of this.opts?.generals ?? [])` 会让 3.8.8 的 `plugin-transform-for-of` 抛 `Property types[1] of TSUnionType expected node to be of a type ["TSType"]`，所以用静态扫描守住 `CampaignRoot.ts` / `MonarchPanel.ts`（本轮修掉了 `MonarchPanel.ts:403-414` 的那一处）。

### 6.4 回归

| 探针 | 结果 |
| --- | --- |
| `work/cocos_monarch84/parity.mjs` | EXIT=0（0 不一致，6000 事件） |
| `work/cocos_monarch84/layout_guard.mjs` | EXIT=0（版式纯函数区 145–361 契约完好） |
| `work/cocos_monarch84/hud_layout.mjs` | EXIT=0（页头 0 出界 / 0 相交） |
| `work/cocos_map84/probe.mjs` | EXIT=0（24/24） |
| `work/cocos_items/panel_headless.mjs` | EXIT=0（143 断言） |
| `work/cocos_monarch84/ai_smoke.mjs` | **EXIT=1，且与本轮改动无关（先前就坏）** |

`ai_smoke.mjs` 失败细节：它把 `core/garrison.ts` 编成 ESM 后 `_ai_garrison.mjs:4` 留下 `from './levels'`（`core/garrison.ts:25` 本来就是无扩展名 import），Node ESM 报 `ERR_MODULE_NOT_FOUND ... 'F:\sanguo\work\cocos_monarch84\levels'`。`core/garrison.ts` / `core/levels.ts` 的 mtime 是 07:46（本 agent 08:0x 才开工），且这两个文件不在本 agent 可改范围（`core/**` 禁改）。因此本轮**没有重跑真实月份的 `runMapAi`**，改用：① 探针 §3 用手工 `AiMonthOutcome` 覆盖三类行；② §13 静态断言 `runMapAi` 的接线仍在。若后续有人给 `work/cocos_monarch84/ai_smoke.mjs` 的 `compile()` 加一条 `'./levels' → './_ai_levels.mjs'` 的 rewrite，这条就能恢复。

---

## 7. 标注

- `[新设计]` 战报区：web 是右栏常驻 8 条列表；Cocos 没有侧栏，改成地图右下浮层 + 标题列折叠（`LOG_VIEW` / `LOG_BAR_H`），折叠后只留最新一条
- `[新设计]` 战报文案：`AiRunner.describeAction()` 没有导出，且 `log` 里已经带了定稿中文，所以「易手/败退」按 `out.battles` 的 `captured/attacker/defenders` 自己组句；「陣亡/滅亡」直接透传 `out.log` 原文
- `[新设计]` 君主座位：`localStorage` 记「君主当太守的那座城」，丢了就判阵亡；额外用 `sanguo_monarch_extinct_v1` 防「灭国后刷新页面又播种子复活」
- `[新设计]` 面板复用：继承弹窗不做新组件，直接加 `sheetKind='succession'`，复用原抽屉的坐标、7 行卡、金边与触摸吞并逻辑
- `[新设计]` tint 抽函数：`drawMap`/`placeCityLabels` 原本各自 inline 算色，现统一走 `cityTintOf`（探针可单测、色板只有 `M.forceColorOf` 一个入口）
- `[推测]` `remaining` 口径：web 在破城前算 `owned.length-1` 再传给 `kingDeath`；Cocos 的 `save.owned` 是破城后的（`GameState.recordBattleResult` 已经把它删了），所以传 `save.owned.length`。两者在「座位城刚丢」这一时机等价
- `[推测]` 首次没有座位时的兜底 `owned[0]`：玩家开局三城常分属不同势力，君主不一定当太守；此时丢首城会被判阵亡。宁可误报一次（玩家点「继承」就继续）也不漏报
- `[推测]` 浮层不遮城市卡：`LOG_VIEW.y+234=1020 < 1240`，城市卡与五个行动按钮都在其下

---

## 8. 没做到

1. **没有真机 / 没有 CocosCreator**：字体、Label 遮挡、半透明叠加、真机触摸坐标系都没验。面板级 shim 的 `convertToNodeSpaceAR` 是 identity，只能证明「设计坐标下的命中矩形」与回调链，不能证明真机 UI 表现。
2. **`ai_smoke.mjs` 没恢复**（外部原因见 6.4）：真实月份跑 `runMapAi` 的端到端验证本轮缺席；`work/cocos_monarch84` 不在本 agent 可改范围。
3. **「某将阵亡」依赖 `AiRunner` 的 log 文案**：只透传含「陣亡/滅亡」的行；若 AI 只把城打下来、没杀将，就不会有这一类行（这与 web 一致，但可能被读成「没接」）。
4. **玩家君主在 Deploy 场景战死没有即时弹窗**：`GameState.recordBattleResult` 只改 `owned`，大地图要等回到 Campaign 场景（`start()`）或下一次 `advance` 才判。
5. **非座位城丢城不触发**：君主在别的城被俘/阵亡不会弹窗；判定是「座位城丢了」的启发式。
6. **继承后新君主不自动迁到座位城**：座位清空，下次 `detectMonarchDeath` 用 `owned[0]` 兜底。
7. **战报不写 GameState 主档**：只在 `localStorage`，换设备/清缓存即丢；也没有「翻历史」的滚动面板（web 同样只留 8 条）。
8. **战报没按势力色上色**：只用 web 的 kind 色（atk/hold/lost/year），势力色只用于城点与城名。
9. **`out.battles[].skipped` 不写战报**（跳过即无事发生），这是有意的。
10. **没有改 `MonarchModel.ts`**：继承规则、排序、`extinguish` 全用现有导出；探针只做「调用 + 对拍」。

---

## 9. 复现

```powershell
cd F:\sanguo
node work\cocos_monarch85\probe.mjs          # 201 断言，EXIT=0

cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit   # EXIT=0
```

探针产物（可删）：`work/cocos_monarch85/_probe/`；`probe.mjs` 每次运行会重建它。
