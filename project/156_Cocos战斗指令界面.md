# 156 Cocos 战斗指令界面（h3）

> 范围：把 web 版 `game/src/view/battleView.ts` 的**两层战斗操作台** 1:1 搬到 Cocos 战斗页。
> Cocos 侧唯一允许动的三个脚本：新建 `BattleCmdUi.ts`、改 `BattleInput.ts`、改 `BattleRoot.ts`。
> **未改**：`game/src/**`、`game/web/**`、`game/cocos/assets/scripts/core/**`、`view/layout.ts`、
> `BattleHud.ts`、`UiSkin.ts`、`TextRole.ts`、`project/44|37a|31`、`tools/**`。
>
> 代码：`BattleCmdUi.ts` 649 行（新）、`BattleInput.ts` 864 行（688 → +176）、`BattleRoot.ts` 1355 行（1114 → +241）。
> 测试：`work/cocos_input/input_assert.mjs` **386 条全过**、`work/cocos_input/cmd_assert.mjs` **369 条全过**（新）。
> 截图：`work/cocos_verify/h01_cmd6.png`、`h02_menu.png`、`h03_hold.png`、`h04_skills8.png`（CDP 真点，876×1368）。

**结论**：web 操作台上那 6 颗第一层按钮（保護主將 / 部隊指令 / 武將技 / 武將出擊 / 主將待機·後退 / 全軍撤退）、
展开式第二层 6 行部队指令、左列突擊·撤退两颗 chip、8 格技能格、主将 `體/技/氣` 当前/上限 + 行动条，
**在 Cocos 里全部有、全部能点、全部照内核判可用性**；点第二颗开第二层后，**第一层第 2/3 行被面板盖住**
（与 web 的「面板优先命中」同一套顺序）。真机 CDP 验证：真点第 5 行「全軍待機」后，位移从 1.2s −2.96
变成 3s +0.52（89 tick），`world.armyOrderAdjust` 钩子 = function（`installArmyOrders` 已接上）。

---

## 1. 版式（坐标全部照抄 web，设计坐标 750×1334、左上原点）

web 的矩形表在 `battleView.ts:392-537`，Cocos 侧逐字搬进 `BattleCmdUi.ts`（**没有一处自己调**）。

### 1.1 第一层 6 颗 —— `BattleCmdUi.ts:52 cmd6Rects()`

`x = 524 + (i%2)*108`，`y = 1030 + floor(i/2)*94`，单颗 **100×84**（`CMD6_BTN_W/H/X0/Y0/GAP_X/GAP_Y` = `:43-49`）。

| i | 键位 | 正题 | 小字 | kind | x | y |
|---|-----|------|------|------|---|---|
| 0 | `A` | 保護主將 | 全軍護衛 | `guardLord` | 524 | 1030 |
| 1 | `S` | 部隊指令 | 陣形六令 | `armyMenu` | 632 | 1030 |
| 2 | `D` | 武將技 | 點技能格 | `skillPage` | 524 | 1124 |
| 3 | `F` | 武將出擊 | 主將上陣 | `sortie` | 632 | 1124 |
| 4 | `G` | 主將待機／主將後退 | 令：待機／令：後退 | `lordOrder` | 524 | 1218 |
| 5 | `H` | 全軍撤退 | 全軍離場 | `retreat` | 632 | 1218 |

- `cmd6Defs()`（`BattleCmdUi.ts:120`）里 G 键的 label/sub 是**跟着内核状态翻的**：
  `armyOrderOf(world,'A').buttons & ARMY_BTN.lordOrder` 非 0 → `主將待機 / 令：待機`，否则 `主將後退 / 令：後退`
  —— 与 web `battleView.ts:444-461` 一致。
- 可用性 `cmd6Usable()`（`:157`）只做**展示层**判断（`world.over`、主将 alive、`buttons & ARMY_BTN.sortie`、
  `skillCount`、`aliveSoldiersOf`），理由文案与 web `:469-509` 逐条对齐：`戰鬥已結束 / 主將陣亡 / 已下令護衛 /
  無武將技 / 已出擊 / 已無士兵 / 我軍已在撤退 / 未知按鈕`。**真正能不能下，一律由内核 `applyArmyCmdKind()` 说了算**。

### 1.2 第二层 6 行 —— `BattleCmdUi.ts:70/78`

面板 `ARMY_MENU_RECT = { x:512, y:1116, w:228, h:216 }`；
行 `armyCmdRects()`：`x = 516`，`y = 1119 + i*36`，**220×33**（与 web `:526-537` 同式）。
6 行文案来自内核 `armyCmdsOf(world.sides.A.formation)`（阵形 0 = 前軍前進 / 前軍後退 / 左右分散 / 中央集中 /
全軍待機 / 全軍突擊），**Cocos 里没有第二份指令表**。

每行右侧文案 `armyMenuItems()`（`BattleCmdUi.ts:217`）：`ordered ? '已下令' : ok ? '' : '不可用'` —— 与 web
`:554-572` 同式；`ok`/`reason` 直接取 `canUseArmyCmd(world,'A',slot)`。

### 1.3 左列两颗 chip —— `BattleCmdUi.ts:66-67`

`CHIP_ASSAULT = {18,1128,88,84}`、`CHIP_RETREAT = {18,1218,88,84}`（web `:407-408`）。
`突 擊` 的副文案 `突擊中` / `全軍突擊`；`撤 退` 的 `撤退中` / `全軍離場`；不可用时副文案换成原因。
可用性：突擊走 `canUseArmyCmd(world,'A',rushSlotOf(formation))`（内核 `kind==='rush'` 那一条），撤退走
`kind==='retreat'` 分支的原文案（`我軍已在撤退 / 敵軍已在撤退 / 已無士兵`）——**没有一条自己判**。

### 1.4 技能格 8 格 —— `BattleInput.ts:243 skillSlotRects()`

`MAX_SKILL_SLOTS = 8`；`≤4` 走老 88×88（`layout.skillSlotRect(i)`），`5..8` 走 4×2：`88×56`、
`y = 1100 / 1162`。技能格本身仍由 `BattleHud.layoutSlots()` 摆（它早就 8 格感知），
这次只把**主将数值**换成 web 口径：`體 96/96`、`技 53/53`、`氣 63%`（`BattleCmdUi.vitalText()`，`:307`）。

### 1.5 主将行动条 —— `BattleCmdUi.actionGaugeOf()`（`:324`）

`interval = max(1, isGeneral ? ACTION_INTERVAL_TICKS : ATTACK_COOLDOWN)`、`slow = max(interval, 46)`、
`remain = clamp(cd,0,interval)`、`mark = interval/slow`、`ratio = clamp((interval-remain)/slow,0,1)`
—— web `:701-729` 同式。`BattleRoot.drawGeneralGauge()`（`:1105`）把它画在主将脚下：50×3 细条 + `40/46`
那道刻度线（web `:1309-1316` 同款）。

---

## 2. 命中：顺序和 web 一模一样

`BattleInput.ts:421 hitTest()` 照着 web `battleView.ts:2068-2131` 抄：

```
idle → null
settled → 控件吞掉，其余 → restart
menuOpen ?
  1) armyRowAt() ≥ 0 → armyCmd{slot,label,kind,canUse,reason}
  2) 面板矩形内空白 → armyMenu
  3) 面板外 → onMenuOpen(false)（收起），然后**继续往下判**
技能格 → skill
cmd6IndexAt() ≥ 0 → cmd6{btn,kind,label,canUse,reason}（i===1 顺手开合第二层）
CHIP_ASSAULT → assault ； CHIP_RETREAT → retreat
screenToCell() → field
```

关键点：**第二层展开时，面板矩形里的一切都先被面板吃掉**——所以第一层第 2/3 行（`y=1124/1218`，正好落在
面板 `1116..1332` 里）点不到，这正是 web 的行为（web 也没禁用那几颗，只靠命中顺序）。

`tap()`（`BattleInput.ts:636`）新增三个分支：
- `cmd6`：`armyMenu → 只开合（+提示）`；`skillPage → 只提示「點下方技能格」`；
  `lordOrder → lordOrderKind() 决定 lordWait/lordBack`；其余 `applyArmyCmdKind(world,'A',kind)`；
- `armyCmd`：`applyArmyCmd(world,'A',slot)`，成功文案用行 label（`全軍待機：已下令。`）；
- `armyMenu`：面板空白，只提示「點一行下達」。

> 键盘（A/S/D/F/G/H、1-8、R）**不走 hitTest**，直接调 `tapCmd6/tapSkill/tapRetreat`，
> 所以不会被「面板展开时命中变成 armyCmd」的坑咬到 —— 这一点 web `main.js:1397-1403` 也是同样的处理。

---

## 3. 渲染：规格表 → 节点池

`BattleCmdUi.buildCmdUi(world, opts)`（`:452`）是一张**纯数据规格表**（不 import `cc`，node 里能直接跑）：

```
CmdBg   { kind:'bg',   id, rect, skin, alpha, fillAlpha?, fillColor? }
CmdText { kind:'text', id, text, x, y, w, size, color, align, bold }
```

数组顺序 = z 序：`chip.assault → chip.retreat → gen.stats/hp/mp → cmd6.0..5 → （展开时）army.panel → army.0..5`。
`BattleRoot.syncCmdUi()`（`:1003`）每帧按 id 复用节点：缺的建（`buildCmdItem()` `:1044`）、多的 `active=false`、
只有顺序签名变了才 `setSiblingIndex()`（`BattleRoot.ts:1036-1039`）。

踩过并修掉的三个真机坑（都在 h02 第一版截图里能看见）：

1. **`Label.overflow = NONE` 会忽略 `horizontalAlign`**：文字恒居中于节点，第二层行标签本该左对齐到
   `x=538`、`體/技` 本该右对齐到 `x=358`，结果全居中。改成 `Overflow.SHRINK`（保留 UITransform 宽度当「盒子」）。
   现在探针实测：`army.0.label` 左边界 **538**、`gen.hp` 右边界 **358**、`cmd6.0.key` 左边界 **540**。
2. **九宫皮肤中间是镂空的**：只铺 `plate_btn`/`frame_panel` 的话，底下第一层 D/F/G/H 的白字会透出来。
   `CmdBg` 加了 `fillAlpha/fillColor`，面板 `#080A0E@245`（= web `rgba(8,10,14,.96)`）、
   行底 `COLORS.panelHi/panel @255`（= web `R(ok?panelHi:panel)`），`BattleRoot` 用 `UiSkin.makePanel()` 渲染。
3. **单位会浮到顶栏/控制台上面**：web 是「先画单位、最后画顶栏与控制台」，Cocos 这两块底画在最底层
   `gBase` 上，单位在 `gA/gB/UnitSprites` 层 → 底边一排兵把状态字压花、前排枪兵插进「我軍 96/100」。
   新增 `gChrome`（`BattleRoot.ts:538`）+ `paintChromeBand()`（`:1142`），在 `drawUnits/drawFx` 之后铺
   **两条**实带：顶栏 `y=0..104`（`#080A0E@235`，`y=103` 一条 1px 金线）+ 控制台 `y=999..1334`（不透明）。
   顶栏木纹底图 `bg/hud_bar` 原本在整棵树最底层，会被这条带盖掉，所以建完 `gChrome` 立刻
   `artHud.node.setSiblingIndex(gChrome.node.getSiblingIndex())` 把它抬到实带之上、状态字/HUD 之下
   （`BattleRoot.ts:543`）。顺序因此是：战场/天气/单位/特效 → 两条 chrome 带 → 木纹底图 → 顶栏兵力条 → 状态字/HUD/指令台。
4. **顶栏 4 条兵力条必须画在实带之上**：它们原先和网格一起画在 `gBase`（最底层），第一版实带一铺
   就把蓝条/红条/绿 HP 条整条盖掉了（真机 13:11 那轮：顶栏只剩数字）。现在 `redraw()` 里把 4 条
   `drawBar` 挪到 `paintChromeBand()` **之后**、画在 `gChrome` 上（`redraw` 开头取 `const gChrome = this.gChrome`
   并加 null 门禁）。这条和上一条是同一类错误的两个方向：**实带上面该有的一条都不能少**。

老 HUD 控件按名字隐藏（`hideLegacyConsole()` `:975`，`BattleHud.refresh()` 每帧会把 `active` 写回 true，
所以 `syncCmdUi` 每帧再关一次）：`CmdBtnAssault / CmdBtnRetreat / CmdLabelAssault / CmdSubAssault /
CmdLabelRetreat / CmdSubRetreat / GeneralStats / HpValue / MpValue`。
保留：头像 `將/Lv.6`、`關羽`、`在陣`、三条 bar、消息栏、上下分隔线、`HudMeta`（`出征 · 連勝 1（最高 1）`）。

---

## 4. 部队指令真的生效：`installArmyOrders`

`core/battle.ts` 的 `step()` 只认 `world.armyOrderAdjust`（`:382-385`），装钩子的唯一入口是
`core/army_cmd.ts:721 installArmyOrders(world)`。web 在 `main.js:713` 的 `createWorld` 之后紧接调它，
Cocos `BattleRoot.boot()` 原来**没调**——不补这一下，全軍待機/前軍前進对位移完全无效，界面就只是个摆设。
本次在 `BattleRoot.ts:375` 补上（`createWorld` 之后、`input.bind` 之前）。

---

## 5. 验收

### 5.1 断言（真跑）

| 脚本 | 条数 | 结果 |
|------|------|------|
| `node work/cocos_input/input_assert.mjs` | 386 | **386 通过 / 0 失败**，EXIT=0 |
| `node work/cocos_input/cmd_assert.mjs`（新） | 369 | **369 通过 / 0 失败**，EXIT=0 |

- `input_assert.mjs` 原有 350 条，其中 26 条是**脚本自身过期**（g5 已把「点技能格选目标」改成「点格直接施放」、
  `RUSH_SPEED` 已从 1.3 变 1、老的 `BTN_ASSAULT/BTN_RETREAT` 中心已被六颗按钮取代）。逐条改成新口径后
  并成 22 条（4 条与新口径重复的删掉，**没有删检查点**），另新增 G16「指令台 cmd6 / armyMenu / armyCmd
  命中与下令」40 条：350 − 26 + 22 + 40 = **386**。
- `cmd_assert.mjs`（新，同一套 mock-cc 哨兵 + `tsc` 编译 `BattleCmdUi.ts`，断言里再证一遍「整条链没 require('cc')」）：
  A 编译与 cc 隔离 6 / B 第一层 6 颗 70 / C 第二层菜单 105 / D 左列 chips 24 / E 8 格技能格 50 /
  F `buildCmdUi` 渲染模型 84 / G 主将 HUD + 行动条 16 / H 与 BattleHud 老控件关系 14。
  覆盖你要的四件事：**矩形不重叠**（六颗两两、行与行、chip 与技能格、技能格 8 格两两）、
  **都在 750×1334 内**、**中心点 hitTest 返回对应 type**、**第二层展开时同一坐标返回 armyCmd**。
- 类型检查：`cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit`
  → **EXIT=0**。
- **13:12 内核换血后的两条适配**（`core/battle.ts` 由 lead 改成「40 帧抽一格」的滑动，
  `RUSH_SPEED`/`RETREAT_SPEED`/`MOVE_PER_TICK` 随连续移动一起删除，不在本单改动面）：
  ① `内核 RUSH_SPEED=1` → 改成 `内核 ACTION_SLIDE_TICKS=40`；
  ② `endReason='retreat'` → 改成 `endReason ∈ {retreat, troops}`（新走位下撤退方常在离场前被追杀光，
  内核 `checkOver()` 就会判 `troops`；两条都是内核合法出口）。条数不变，仍 386。

### 5.2 CDP 真点（`work/cocos_verify/steps_h3_cmd.mjs`，876×1368、dpr=1、`cc.view.getScaleX()=1.025487`）

最终一轮（构建 `index.html` = **13:12:35**、bundle `index.f0864.js`；截图 13:16:40–13:16:47；日志 `work/cocos_verify/h3run6.log`）：

```
advance(control) {"ax0":44.291,"ax1":41.25,"dx":-3.041}           ← 没下令时 1.2s 真前进
menu   {"menu":true,"hasArmyPanel":true,"hasSel":true,"msg":"部隊指令：點一行下達。"}
click 全軍待機 design(626,1279) -> page(695,1311.6)               ← 真鼠标事件
order  {"msg":"全軍待機：已下令。","menu":true}
hold   {"ax0":38.761,"ax1":39.364,"dx":0.603,"ticks":90,"hook":"function"}  ← 90 tick 只挪 0.60
skills {"before":2,"after":8,"gen":"太史慈 Lv40"}
console.error {"n":0}                                             ← 整轮 0 条引擎报错
labels army.0.label left=538 / gen.hp right=358 / cmd6.0.key left=540，overflow=SHRINK(2)
```

### 5.3 真机确认（lead 点名的六条）

| # | 要看的东西 | 结果 | 证据 |
|---|-----------|------|------|
| 1 | 底边士兵不再压住 `晴 · 30Hz · 點技能格施放` 与指令台文字 | ✅ 干净 | h01/h02/h04 底边没有士兵；`work/cocos_verify/h01_crop_status.png`（4×） |
| 2 | 第二层 6 行 = 实色面板 + 左对齐，且盖住第一层 D/F/G/H | ✅ 全部生效 | h02：行标签左边界实测 **538**（= `516+22`，web 同值）、`overflow=SHRINK`；D/F/G/H 完全被面板挡住 |
| 3 | 8 格技能格 | ✅ 真机拍到 8 格（**运行时换将**，不是正常存档） | h04：太史慈 Lv40 → 落月弓/八門金鎖/神劍一/列火旋燈 + 伏兵連陣/神火旋張/劍輪舞/鬼哭神號 |
| 4 | 顶栏不再被前排士兵/主将精灵压花（`我軍 96/100` / `86/100 敵軍 張角`） | ✅ 干净 | `h01_crop_top_left.png` / `h01_crop_top_right.png`（4×，见下） |
| 5 | 顶栏两条兵力条还在、且不被新实带盖掉 | ✅ 蓝条（`ours`）/ 红条（`enemy`）+ 绿 HP 条都在 | 同上两张 4× 图；**坑**：4 条 bar 原先画在 `gBase`（最底层），第一版实带把它们整条盖掉了 |
| 6 | 顶栏木纹底图 `bg/hud_bar` 还在 | ✅ 木纹 + 石雕纹都在（把 `artHud` 抬到实带之上） | 同上两张 4× 图 |

顶栏 4× 放大（`F:\sanguo\work\cocos_verify\`）：

| 文件 | 内容 |
|------|------|
| `h01_crop_top_left.png` | 木纹底图 + 石雕 + `我軍 97/100` + 蓝条 + 绿 HP 条，无单位叠字 |
| `h01_crop_top_right.png` | `95/100 敵軍 張角` + 红条 + 绿 HP 条 + 木纹/石雕，无单位叠字 |

四张主图（`F:\sanguo\work\cocos_verify\`，13:16:40–13:16:47）：

| 文件 | 内容 | 关键证据 |
|------|------|---------|
| `h01_cmd6.png` | 第一层六颗 + 左列 chips + 主将 HUD + 行动条 | A/S/D/F/G/H 六颗齐全、小字正确、`體 96/96 / 技 53/53 / 氣 63%`、`武 97 · 智 75 · 行 40/40`、顶栏四条 bar 齐 |
| `h02_menu.png` | 第二层展开 | 面板实色、6 行左对齐（前軍前進…全軍突擊）、**D/F/G/H 被面板盖住**、第 2 颗有选中框 |
| `h03_hold.png` | 下令「全軍待機」后 3s | 第 5 行高亮 + 右侧「已下令」（`h03_crop_row5.png`）、toast「全軍待機：已下令。」、士兵原地不动 |
| `h04_skills8.png` | 8 格技能 | 4×2 版式、8 条技名 + `技NN · 氣NN%` |


---

## 6. 没做到 / 已知限制

1. **8 格是靠运行时换将拿到的**，不是正常流程：新兵种数据下主角 Lv6 只有 2 格技能（半月斬、冰柱刺），
   仓库里没有高等级存档，`DeployRoot/GeneralBook` 按剧本起始等级取。所以 `h04` 是 CDP 里把
   `world.sides.A.general` 与主将单位临时改成 太史慈 Lv40 再 `input.bind(world)` 拍的（**只改内存，不落盘**）。
   8 格的几何/命中不依赖等级，已由 `cmd_assert.mjs` E 段 50 条 + G15 覆盖。
2. **`BattleHud` 的老版式与新指令台有一处 11px 的高度差**：`GeneralName` 在 HUD 里是「盒中心 = 1036」，
   web 是「基线 = 1036」，所以 Cocos 的「關羽」比 web 低约 11px，与下面一行 `武 97 · 智 75 · 行 40/40`
   贴得更近。`BattleHud.ts` 不在本次允许改动范围内（我只能按名字隐藏它的子节点），需要时由该文件属主调
   `GeneralName/GeneralState` 的 y。
3. **技能格仍由 `BattleHud` 画**（`HUD_ART_SPEC` 的 `SkillSlot1..8` + `layoutSlots` + 每格 4 个 label），
   本次只把它的老按钮/数值文字按名字隐藏，没有把技能格搬进 `BattleCmdUi`。原因：`BattleHud.layoutSlots`
   早已按 `skillSlotRects(count)` 自适应 8 格、与 web 同一套矩形，搬过去只会增加回归面。
   `cmd_assert.mjs` E 段 50 条已断言这 8 个矩形与命中口径。
4. 突击 chip 的下令仍走 `tapAssault()` 那条已有路径（`createBattleSysoHost(world,'A',{}).call('AllRush',[])`，
   失败回退内核 `allRush`），本次只把**命中矩形**从左下大按钮改成左列 chip（`18,1128,88,84`）。
5. 「已下令」三个字在 h03 里经 4× 放大确认**完整可读**（`work/cocos_verify/h03_crop_row5.png`），
   右侧文案锚点 `x=730` 与 web 同值，不需要再收紧。
6. 8 格的**旁证**：`work/cocos_input/battle_slots8.png` 是 g5 那轮用 Lv40 存档截到的真机 8 格图（舊產物，
   几何与本次一致），可与 `h04_skills8.png` 互相印证。

---

## 7. 文件清单

| 文件 | 改动 |
|------|------|
| `game/cocos/assets/scripts/BattleCmdUi.ts` | **新建** 649 行：几何（`cmd6Rects`:52、`CHIP_*`:66-67、`ARMY_MENU_RECT`:70、`armyCmdRects`:78）、定义（`CMD6_KINDS`:107、`cmd6Defs`:120）、可用性（`cmd6Usable`:157、`lordOrderKind`:191）、菜单项（`armyMenuItems`:217）、chips（`assaultChip`:266、`retreatChip`:289）、HUD 口径（`vitalText`:307、`actionGaugeOf`:324、`generalUnitOf`:334、`generalStatLine`:340）、规格表（`CmdBg`:354、`CmdText`:373）、`buildCmdUi`:452、命中工具（`armyRowAt`:633、`cmd6IndexAt`:640、`cmd6Controls`:647） |
| `game/cocos/assets/scripts/BattleInput.ts` | 864 行（+176）：`BattleHit` 扩三种命中（`:171`）、`HitOptions.onMenuOpen`（`:202`）、`hitTest` 重写为面板优先（`:421`）、`BattleInput` 类（`:526`）、`armyMenuNow`:574 / `toggleArmyMenu`:584 / `setArmyMenuOpen`:447、`tapCmd6`:647 / `tapArmyCmd`:649 |
| `game/cocos/assets/scripts/BattleRoot.ts` | 1355 行（+241）：`:375` `installArmyOrders(world)`、`:538` `gChrome`（顶栏 + 控制台实色带）、`:543` 木纹底图抬到实带之上、`:831` `syncCmdUi(world)` 调用、`:975` `hideLegacyConsole`、`:1003` `syncCmdUi`、`:1044` `buildCmdItem`、`:1085` `paintCmdText`、`:1105` `drawGeneralGauge`、`:1142` `paintChromeBand` |
| `work/cocos_input/cmd_assert.mjs` | **新建** 369 条断言 |
| `work/cocos_input/input_assert.mjs` | 26 条过期断言改口径 + G16 新增 40 条（350 → 386） |
| `work/cocos_verify/steps_h3_cmd.mjs` | **新建** CDP 验收脚本（坐标映射/焦点/真点/四张图/标签对齐探针/console 计数） |
| `work/cocos_verify/h01_cmd6.png` 等 4 张 | 截图 |

### 7.1 需他人落地的改动：`BattleHud.ts` 的「盒中心 vs 基线」

`BattleHud.makeLabel(parent,name,role,sx,sy,…)` 的 `sy` 是**文字盒中心**，而 web `battleView.ts` 的 `T(out,x,y,…)`
的 `y` 是**基线**（`ctx.textBaseline` 默认 `alphabetic`，见 `battleView.ts:2209`）。所以同名 22px 的
「關羽 / 在陣」在 Cocos 里比 web 低约 8px，与下面一行 `武 97 · 智 75 · 行 40/40` 贴得过近。

`BattleHud.ts` 不在本单允许改动的文件里（我只能按名字隐藏它的子节点），改动请由它的属主落：

```diff
--- a/game/cocos/assets/scripts/BattleHud.ts
+++ b/game/cocos/assets/scripts/BattleHud.ts
@@ -370,2 +370,4 @@
-    this.generalName = this.makeLabel(this.consoleRoot, 'GeneralName', 'subtitle', 116, 1036, 160, 'left', COLORS.text);
-    this.generalState = this.makeLabel(this.consoleRoot, 'GeneralState', 'subtitle', 366, 1036, 90, 'right', COLORS.ok);
+    // web 的 y 是基线（battleView.ts drawConsole: T(116,1036,'關羽',22) / T(366,1036,'在陣',12)），
+    // 这里是盒中心：22px 字的盒中心 ≈ 基线 − 22×0.38 ≈ 基线 − 8，所以 1036 → 1028 才对得上 web 的顶边。
+    this.generalName = this.makeLabel(this.consoleRoot, 'GeneralName', 'subtitle', 116, 1028, 160, 'left', COLORS.text);
+    this.generalState = this.makeLabel(this.consoleRoot, 'GeneralState', 'subtitle', 366, 1028, 90, 'right', COLORS.ok);
```

同源但**不在三行内**的两处（要不要一起对齐由属主定）：

- `GeneralStats`（`:372`，role `body`=18px、`y=1052`）web 是 12px 基线 1052 → 盒中心应 `1047`、role 应 `caption`；
  本单已按名字把它隐藏，改用 `BattleCmdUi` 的 `gen.stats`（12px、基线 1052）渲染。
- `HpValue/MpValue/QiValue`（`:373-375`）本单同样已隐藏，改用 `gen.hp/gen.mp`（10px、右对齐 358、web `vitalText()` 口径）；
  `QiValue` 保留 HUD 那一条（`氣 63%` 与 web 同字号同位置）。
