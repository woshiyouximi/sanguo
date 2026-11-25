# 131 · Cocos 战斗操作（技能格 / 突擊 / 撤 退 / 结算重开）

> **任务来源**：`project\122_Cocos验收差距.md` 里 c04 审计的最高优先缺口 —— Cocos 3.8.8 战斗页全局只有一个「点一下重开」，
> 战场上**不能放武将技、不能突擊、不能撤退**。用户定调「最后以 cocos 验收」，所以这条必须通。
>
> **行为基准**：web（`game\web\main.js` + `game\src\view\battleView.ts`）。Cocos 侧内核与 web 同源
> （`game\cocos\assets\scripts\core\battle.ts` 的 `cast()` / `requestRetreat()` / `qiCostOf()`），只是壳没接。
>
> **状态：已补齐。**
> `tsc` EXIT=0；`work\cocos_binput\input_assert.mjs` **271 条断言 / 0 失败 / EXIT=0**；
> web 全量 `node --test tests/*.test.ts` **0 fail**。

---

## 0. 改动一览

| 文件 | 性质 | 归属 | 说明 |
|---|---|---|---|
| `game\cocos\assets\scripts\BattleInput.ts` | **新建**（535 行） | 我 | 状态机 + 几何/命中 + 文案，**不 import `cc`** |
| `game\cocos\assets\scripts\BattleRoot.ts` | 改（841 → 约 1070 行） | 我 | 触摸分发、瞄准/飘字/标记的渲染 |
| `work\cocos_binput\input_assert.mjs` | **新建** | 我 | 271 条断言（编真源码、跑真内核） |
| `work\cocos_binput\mock\cc\index.cjs` | **新建** | 我 | `cc` 哨兵：真被 require 就抛错 |
| `project\131_Cocos战斗操作.md` | **新建** | 我 | 本报告 |

**为什么把逻辑单开一个文件**：`BattleHud.ts` 是展示层且归别人，`BattleRoot.ts` 是 841 行的场景壳（画布/精灵/音频都在里面）。
把「选中 → 选目标 → 施放 / 突击 / 撤退 / 命中测试 / 坐标反投影」放进一个不依赖引擎的纯逻辑文件，
才能像 web `battleView.ts` 那样被 Node 直接编出来跑断言（`input_assert.mjs` 就是证据：整条链 0 次访问 `cc`）。

---

## 1. 状态机

`BattleInput.ts:306-318` 的文档注释 + 实现（`bind/clear/setSettled` 在 `:331/:341/:351`，
`tapSkill/tapField/tapAssault/tapRetreat` 在 `:405/:433/:443/:450`，`castAt` 在 `:491`）：

```
                        ┌──────────────── clear() ────────────────┐
                        ▼                                         │
 idle ──bind(world)──────────────────────────────────────────▶ fighting
   ▲                                                            │ │ │
   │              點技能格(可放 & kind!=='heal')                  │ │ │
   │                                    ┌───────────────────────┘ │ │
   │                                    ▼                         │ │
   │                                aiming(i) ──點同格──▶ 取消（MSG_CANCEL_AIM）
   │                                    │  ▲                      │ │
   │              點技能格(j,可放) ──────┘  └────── 點了不可放(j) → 只出原因，选中不变
   │                                    │
   │                                    ▼
   │                          點戰場 → cast(world,'A',seq,x,y,ttl)
   │                             成功 → fighting（清 selected/aim，出飘字+技能音）
   │                             失败 → fighting（**保留** selected，只改 message）
   │
   │  fighting ──點 heal 格(可放)──▶ cast(主將位置) ──▶ fighting（不进入瞄准相）
   │  fighting ──點突擊────────────▶ message='突擊：v2 未接。'（world 一个字段都不改）
   │  fighting ──點撤退──成功───────▶ world.fled.A=true + status.A=2 + 「全軍撤退」标记
   │                    失敗──────▶ message='撤退失敗。'
   │
   └── world.over && settle() → setSettled(true) → settled
                                 settled ──點畫面(非控件)──▶ boot() 重开 / 回 Campaign
```

### 触摸分发表（`BattleRoot.ts:425-448`）

| 相位 | 命中位置 | 动作 | 代码 |
|---|---|---|---|
| `loading` | 任何 | 忽略 | `BattleRoot.ts:426` |
| `settled` | 技能格 / 突擊 / 撤退 / 消息栏 | **忽略（不重开）** | `:429-431` |
| `settled` | 其它（战场 / HUD / 控制台空白） | `launch.from==='campaign'` → `loadScene('Campaign')`，否则 `boot()` | `:432-438` |
| 无 world | 任何 | `boot()`（保留原语义） | `:441-444` |
| `fighting` | 技能格 | 选技 / 取消 / 直接放 heal / 出原因 | `:446` → `BattleInput.tap` |
| `fighting` | 突擊 | 只出提示 | 同上 |
| `fighting` | 撤退 | `requestRetreat(world,'A')` | 同上 |
| `fighting` | 战场带 | 施放 / 「先選技」提示 | 同上 |
| `fighting` | HUD / 控制台其它 | 忽略 | `hitTest` 返回 null |

`TOUCH_START` / `TOUCH_MOVE` 只更新瞄准落点（`BattleRoot.ts:404-414` → `BattleInput.ts:466-477`），
`TOUCH_END` 才分发（web `onPointerMove` / `onPointerDown` 同构）。

---

## 2. 技能格：选中 → 瞄准 → 施放

### 2.1 技能格数据（`BattleInput.ts:144-159`）

`makeSkillBar()` 与 web `battleView.ts:302-313` 同式（`qi` 用 `qiCostOf`，**不乘** `qiCostMul`），
只多取 `dir`（`Magic.fx_dir_primary`）与 `ttl`（`fxTtlOf`）给 Cocos 壳用：

| 格 | seq | NAME | MP | qi（=qiCostOf） | kind | dir | ttl |
|---|---|---|---|---|---|---|---|
| 0 | 1 | 命療術 | 20 | 24000 | heal | `016` | 24 |
| 1 | 50 | 半月斬 | 22 | 26400 | strike | `001` | 24 |
| 2 | 2 | 落月弓 | 18 | 24000 | strike | `003` | 73 |
| 3 | 104 | 神鬼亂舞 | 47 | 56400 | aoe | `004` | 57 |

技序表来自 `BattleHud.ts:211` 的 `DEFAULT_SKILL_SEQ = [1, 50, 2, 104]`。
**因为 `BattleHud.ts` 会 `import cc`，`BattleInput.ts` 不能引它**，所以在 `BattleInput.ts:51`
复制了一份并写了注释说明（报告此处记为重复源，改动时要同步两处；同一数字也在 web `battleView.ts:299`）。

### 2.2 可放性（`BattleInput.ts:169-177`）

```ts
if (!world) return 'over';
if (world.over) return 'over';
const g = world.sides.A.general;
if (!g.alive) return 'dead';
if (g.mp < slot.mp) return 'mp';
if (!Number.isFinite(slot.qi) || g.qi < slot.qi) return 'qi';
return null;
```

与 web `battleView.ts:355-363` **逐行同式**，也只有这四种原因（web 的 `CastReason` 见 `battleView.ts:315`；
**没有**「冷却 / 未習得」—— 任务书里提到的那两种，web 线上并不存在，所以不发明）。

> `BattleHud` 自己算 `usable` 时多乘了 `qiCostMul`（`BattleHud.ts:606-607`），
> 所以带「气力消耗」军师技时「格子亮」与「castBlockReason 判可放」会有一个很窄的窗口差。
> 真正的门仍是 `cast()` 内部那道 `g.qi < qi`（`core\battle.ts:1951` 起），见 §10 差异 2。

### 2.3 点技能格（`BattleInput.ts:405-430`）

对齐 web `main.js:1085-1106` 的 `pickSkill`：

1. 不在 `fighting` / 没世界 → 返回空；
2. `castBlockReason` 非空 → `message = \`${name}：${原因}\``，**不清 selected**（web 就是直接 return）；
3. `kind === 'heal'` → **立刻** `castAt(index, 主将位置)`（web 同理，不进入瞄准）；
4. 点的是当前选中格 → 取消 + `已取消瞄準。`；
5. 否则 → `selected = index`，`message = \`${name}：點戰場選目標（再點技能格取消）。\``。

### 2.4 点战场（`BattleInput.ts:433-440` → `491-524`）

没选技 → `先點下方技能格，再點戰場選目標。`（web `main.js:1169`）；
选了 → `cast(world,'A',slot.seq,worldX,worldY,slot.ttl)`。

成功后按 `CastResult` 出副作用（`BattleInput.ts:502-523`）：

* 技能音：`{kind:'magic', dir}` → `BattleRoot.ts:451-463` 调 `audio.playMagic(dir, 0.7)`；
* 飘字：heal → `+${healed}`（位置=主将），否则 `-${killed}` / `-${damage}` / `命中` / `MISS`（位置=点击处）；
* 文案对齐 web `main.js:1108-1141`：`${name}：擊殺 N 名敵兵` / `命中敵將` / `未命中`，有将伤再追加 `，敵將 −N 點體力`，heal 是 `回復 N 點體力。`；
* 最后清 `selected` / `aim`；`!ok` 时**先 return**（保留选中）——与 web 的 `return` 位置一致。

---

## 3. 突擊

内核没有突击指令（web 也标 `v2 未接`），所以**不发明**：

* `BattleInput.ts:443-447`：只写 `message = ASSAULT_NOTE`（`'突擊：v2 未接。'`，`BattleInput.ts:57`），不读不写 `world`；
* `hitTest` 在 `BattleInput.ts:274` 把 `BTN_ASSAULT` 映射成 `{type:'assault'}`；
* HUD 侧本来就是灰的（`BattleHud.ts` 里突擊 label 恒 `'突 擊' / 'v2 未接'`），我没有改它。

断言 G10 用 `JSON.stringify` 指纹（qi/mp/hp/fled/status/over/tick/units/log/fx/sessions）证明点突擊前后**一字不差**，
且 `cast` / `requestRetreat` 调用计数都不增。

---

## 4. 撤 退

`BattleInput.ts:450-463`：

```ts
if (!world || this.mode !== 'fighting') return [];
if (world.over) { this.message = MSG_OVER; return []; }
if (requestRetreat(world, 'A')) { this.message = MSG_RETREAT_OK; return []; }
this.message = MSG_RETREAT_FAIL; return [];
```

* 内核 `requestRetreat`（`core\battle.ts:1672`）成功时置 `world.fled.A = true`、`world.status.A = 2`、该侧存活单位 `flee = true`；
* **它不写 `world.log`**，所以 HUD 消息栏不会自动出现「全軍撤退」→ 由壳自绘一个标记：
  `BattleRoot.ts:846-851` 把 `input.banner`（`BattleInput.ts:297-300`，`fled.A ? '全軍撤退' : null`）写进 `labelBanner`（`BattleRoot.ts:514`，屏幕 `(375,936)`，金色 22px）；
* 结算沿用既有流程：`BattleRoot.ts:199-240` 每 tick `step()`，`world.over` 后 `settle()` → `recordBattleResult` → `queuePostBattle` → `persistSave()`，
  然后 `input.setSettled(true)`（`:240`）。撤退走空后内核 `checkOver()` 走 `finish(world,'B','retreat')`（`core\battle.ts:1729-1750`），
  断言 G8 里推进 3000 tick 内确实 `over=true / endReason='retreat' / winner='B'`。

---

## 5. 结算后重开 & 误触

原实现是**全局** `input.on(TOUCH_END)`（旧 `BattleRoot.ts:341-349`），战斗中点了没事，
但结算后点任何地方都重开——c04 点名的误触来源。

现在 `BattleRoot.ts:425-448` 先 `hitTest`，而 `hitTest` 在 `settled` 相（`BattleInput.ts:258-264`）
对 `isConsoleControl()`（`BattleInput.ts:286-294`：4 个技能格 + 突擊 + 撤退 + 消息栏，含边界）
一律返回 `null`；其余位置返回 `{type:'restart'}`。于是：

* 点技能格 / 突擊 / 撤退 / 消息栏 → **不重开**（也不施放、不撤退，因为 mode 已是 `settled`）；
* 点战场 / HUD / 控制台空白 → `boot()` 重开（`from==='campaign'` 时回 `Campaign` 场景）。

与 web 的差别：web 结算相只认 `AGAIN_BUTTON`（`battleView.ts:1547-1553`）。
Cocos 保留「点一下画面重开」的老语义（用户没要求改），只把「控件区」从重开里摘出去。

---

## 6. 触摸坐标 → 战场世界坐标

`BattleRoot.ts:399-402`：

```ts
const p = event.getUILocation();        // UI 坐标（左下原点）
return { sx: p.x + HALF_W, sy: HALF_H - p.y };   // → 750×1334 屏幕坐标（左上原点）
```

（`HALF_W = 375`、`HALF_H = 667`，正是 `view/layout.ts:179-181` `toLocal()` 的逆变换。）

`BattleInput.ts:212-216`：

```ts
worldY = (tx - LANE_PX/2) / LANE_PX          // LANE_PX = 750/14 ≈ 53.571
worldX = camX + (ty - FIELD_CENTER_Y) / ROW_PX   // ROW_PX = 96*SCALE ≈ 71.429, FIELD_CENTER_Y = 550
```

`screenToWorld()` **不做战场带门禁**（这样 HUD 区样本也能往返），门禁在 `screenToCell()`（`BattleInput.ts:228-241`，
`contains(FIELD,…)` + `gx=clamp(round(worldX),0,70)`、`gy=clamp(floor(worldY),0,13)`），
与 `view/layout.ts:140-154` 的 `screenToCell` 同式（断言 G2 逐点比对同值）。

camX=35 的 6 个样本（断言脚本实算，往返误差 0，单位=格 ≤1）：

| 样本 | 屏幕 (sx,sy) | worldX | worldY | 往返误差 |
|---|---|---|---|---|
| 战场左上 | (4, 104) | 28.756 | -0.425 | 0 / 0 |
| 战场右上 | (746, 104) | 28.756 | 13.425 | 0 / 0 |
| 战场左下 | (4, 996) | 41.244 | -0.425 | 0 / 0 |
| 战场右下 | (746, 996) | 41.244 | 13.425 | 0 / 0 |
| 战场中心 | (375, 550) | 35.000 | 6.500 | 0 / 0 |
| HUD 区 | (375, 50) | 28.000 | 6.500 | 0 / 0（`screenToCell` 必须为 null） |

---

## 7. 文案对齐表（Cocos ↔ web，逐字）

`reasonText`：Cocos `BattleInput.ts:185-198` ↔ web `main.js:960-972`

| reason | web 行 | web 文案 | Cocos 行 | Cocos 文案 |
|---|---|---|---|---|
| `over` | `main.js:962` | 戰鬥已結束。 | `BattleInput.ts:188` | 戰鬥已結束。 |
| `dead` | `main.js:964` | 主將已陣亡，無法施放。 | `BattleInput.ts:190` | 主將已陣亡，無法施放。 |
| `mp` | `main.js:966` | 技力不足。 | `BattleInput.ts:192` | 技力不足。 |
| `qi` | `main.js:968` | 氣力不足（每 tick 回复，等一會）。 | `BattleInput.ts:194` | 氣力不足（每 tick 回复，等一會）。 |
| 其它（`general-dead`/`sealed`/`no-target`/`no-magic`/未知） | `main.js:970` | 無法施放。 | `BattleInput.ts:196` | 無法施放。 |

其余交互文案（Cocos `BattleInput.ts:57-72` ↔ web）：

| 场景 | Cocos 常量/行 | 文案 | web 出处 |
|---|---|---|---|
| 点战场时没选技 | `:60 MSG_PICK_FIRST` | 先點下方技能格，再點戰場選目標。 | `main.js:1169` |
| 选中技 | `:62 MSG_AIM` | 點戰場選目標（再點技能格取消）。 | `main.js:1104`（原文含「右鍵 / Esc 取消」） |
| 再点取消 | `:64 MSG_CANCEL_AIM` | 已取消瞄準。 | `main.js:1103` |
| 撤退成功 | `:66 MSG_RETREAT_OK` | 全軍撤退。 | `main.js:1182` |
| 撤退失败 | `:68 MSG_RETREAT_FAIL` | 撤退失敗。 | `main.js:1184` |
| 已结束还点撤退 | `:70 MSG_OVER` | 戰鬥已結束。 | `main.js:1180` |
| 突擊 | `:57 ASSAULT_NOTE` | 突擊：v2 未接。 | `main.js:1174` |
| 撤退标记 | `:72 BANNER_RETREAT` | 全軍撤退 | （web 只在 message 里追加「我軍撤退。」`main.js:778-779`） |

> 唯一改写：瞄准提示去掉了「右鍵 / Esc 取消」——触屏没有右键/Esc，改成「再點技能格取消」（同义、可操作）。

---

## 8. 壳里的渲染（不动 `BattleHud.ts`）

`BattleHud.ts` 是展示层且归别人，我没有加任何逻辑；需要的东西它没公开（`slotOn`/`retreatOn` 都是 private，
`BattleHud.ts:273-274`；技能格 hitbox 也没导出），所以：

| 需要 | 做法 | 代码 |
|---|---|---|
| 技能格命中矩形 | 复用 `view/layout.ts` 的 `skillSlotRect(i)`（与 HUD 画格子同源） | `BattleInput.ts:266-273`、`286-294` |
| 格子可用性 | `BattleInput.castBlockReason()` 重算（不读 HUD 私有态） | `BattleInput.ts:169-177` |
| 「全軍撤退」标记 | 壳自绘 Label（HUD 消息栏不会自动出现） | `BattleRoot.ts:514`、`846-851` |
| 选中框 + 半径圈 | 壳新建的 `gAim: Graphics`，**建在 `hud` 之后**所以盖在 HUD 之上 | `BattleRoot.ts:512`、`781-828` |
| 瞄准文字 | `labelAim`，显示 `${name} · 點擊施放` | `BattleRoot.ts:515`、`822-827` |
| 提示条 | `labelToast`（屏幕 `(375,980)`，`MESSAGE_TTL=150` tick 后自动消失） | `BattleRoot.ts:513`、`840-844` |
| 飘字 | 8 个 Label 的池（`FLOATER_POOL=8`，上飘 `age*0.9` px、线性淡出 `FLOATER_TTL=45` tick） | `BattleRoot.ts:520-525`、`853-877` |

两个实现细节（都写进了代码注释）：

1. **`Graphics.fill()` 会把当前路径里所有子路径一起填**，所以瞄准中心点必须在画技能格方框/半径椭圆**之前** fill，
   否则会把格子与圈整个涂成金色（`BattleRoot.ts:809-813`）；
2. Cocos `Graphics` 没有虚线，web `drawAim` 的金色虚线椭圆（`battleView.ts:1068-1088`）在这里是金色实线（视觉意图一致）。

---

## 9. 验收记录

### 9.1 类型检查

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
→ TSC_EXIT=0
```

共跑 4 次（每次改完 `BattleRoot.ts` 都复跑一次），**全 0**；最后一次是在最终格式修正之后。
中途出现过 2 条 `ScenarioSelect.ts` 的 TS2345，是**别的 agent 正在改那个文件**的瞬时状态，与我无关，其后已恢复 0。

### 9.2 操作层断言：`work\cocos_binput\input_assert.mjs`

```
cd F:\sanguo
node work\cocos_binput\input_assert.mjs
→ 断言总数 271 · 通过 271 · 失败 0 （EXIT=0）
```

它做什么（真源码、真内核）：

1. 用仓库自带 typescript 把 **`BattleInput.ts`** 编成 CJS 到 `work\cocos_binput\.build\`
   （依赖 `view/layout.ts`、`core/battle.ts`、`core/smartscript/*` 全被带出来，同一份产物）；
2. 数据用 `game/src/data.ts` 的 `loadData()`（与 web 同源）；世界用**编译后的 Cocos 内核 `createWorld()`** 建；
3. `magic_so` 走 `BootRoot` 那条真路径：临时 `location` + `fetch` 垫片从 `game\data\magic_so.{bin,symbols.json}` 读盘，
   再 `runtime.initMagicProgram('data/')`（**不碰 core 内部变量**）；
4. 给 `core.cast` / `core.requestRetreat` 套计数壳，证明「真调了内核」；
5. `cc` 用哨兵：`Module._resolveFilename` 里记账 + mock 文件一被加载就抛错 → 断言整条链 **0 次**碰引擎。

分组与条数：

| 组 | 覆盖 | 条数 |
|---|---|---|
| G0 | 编译产物、`magic_so` 预加载 | 6 |
| G1 | `makeSkillBar` 4 格的 name/mp/qi/kind/dir/ttl（并与 `qiCostOf`/`fxTtlOf` 对拍） | 38 |
| G2 | `screenToWorld` 6 样本（四角/中心/HUD）往返 ≤1 格 + 与 `layout.screenToCell` 同值 + 3 个 camX | 55 |
| G3 | `hitTest` 分流：4 技能格 / 突擊 / 撤退 / 战场 / HUD / 消息栏 / `isConsoleControl` | 36 |
| G4 | HUD 与战场外点击**不施放**、气力技力不动、`cast` 调用数为 0 | 10 |
| G5 | `castBlockReason` 四种原因 + `reasonText` 5 分支 + `skillRadius` 4 档 | 16 |
| G6 | 气力不足：`'qi'`、文案、点战场**不扣气力**、失败保留选中 | 14 |
| G7 | 气力足：`cast` 真被调、`qi` 下降 === `qiCostOf`、`mp` 下降 === MP、fx/飘字/清选中 | 21 |
| G7b | 命療術直接施放（不进瞄准）、`+N` 飘字、24000/20 扣除 | 10 |
| G8 | 撤退：`fled.A`、`status.A=2`、单位 `flee`、标记、二次失败、推进到 `endReason='retreat'` | 20 |
| G9 | 结算相：技能格/按钮/消息栏 **不重开**，战场/HUD/空白 **才重开**，settled 里点击无副作用 | 16 |
| G10 | 突擊只出提示、`world` 指纹不变、不动 `cast`/`requestRetreat` | 9 |
| G11 | `moveAim` 仅在「选中 + 战场带内」更新、`cancelAim` | 10 |
| G12 | 7 条文案常量 + `SKILL_SEQ` 与 web 一致 + `cc` 隔离 | 10 |
| **合计** | | **271** |

> 运行时会看到一行 stderr：`[smartscript] 占位 syscall 0x135（视觉表现未复现）`。
> 这是内核执行「半月斬」脚本时的既有警告（core 里的占位 syscall），不影响 `cast` 的返回与断言。

### 9.3 web 全量（自证没碰 web/src）

```
cd F:\sanguo\game
node --test tests/*.test.ts
→ ℹ tests 1031   ℹ pass 1031   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ todo 0
→ TESTS_EXIT=0
```

基线是 972 条，跑的时候已经是 **1031** 条 —— 多出来的 59 条是**别的 agent 在会话期间新增的测试**，
不是我的改动带来的（我只碰了 `game\cocos\**`，`game\src\**` / `game\tests\**` 一行没动，可用文件时间戳与 diff 证明）。

> **一次瞬时红**（记录在案，避免误会）：第一次全量跑出 `fail 1`，是
> `tests\wises.test.ts:233`「十面埋伏（54）：敵將有坐騎時破解，不置位」期望 `ok:false` 实得 `ok:true`。
> 当时 `game\src\core\wises.ts`（mtime 9:40:28）与 `game\tests\wises24.test.ts`（mtime 9:41:51）
> 正被别的 agent 编辑，我是**在别人写到一半时读到的中间状态**；单独重跑该文件 27/27 通过，
> 全量重跑 1031/1031 通过。与本次改动无因果关系。

### 9.4 断言脚本自身踩过的三个坑（留给后来人）

1. `layout.screenToCell` 的签名是 **`(sx, sy, camX)`**，而 `BattleInput.screenToCell` 是 `(camX, tx, ty)`
   —— 第一版断言按后者顺序传，6 个样本全红；已改为按各自签名调用并逐点对拍。
2. `cast()` 的参数是 `(world, side, seq, tx, ty, ttl)`，**ttl 是第 6 个**（下标 5）。
3. `moveAim` 的 `gy` 由 **sx** 决定（车道），`gx` 由 **sy** 决定（推进轴）——别按「x→x」直觉写样本。

---

## 10. 与 web 的差异（刻意 / 无法对齐）

1. **技能音查表键**：web `skillSfx(seq)`（`web\audio.js`，`MAGIC_SFX` 是 seq→音效名，110 条）；
   Cocos `AudioHost.playMagic(dir)`（`AudioHost.ts:312`，`MAGIC_SFX` 是 **3 位目录号**→音效名，31 条）。
   → Cocos 传 `Magic.fx_dir_primary`（`BattleInput.ts:154`、`BattleRoot.ts:457`）。
   `AudioHost.ts` 不在我的文件清单里，**没有改它**；31 vs 110 的覆盖面差距记在这里。
2. **`qiCostMul`**：`castBlockReason` 用裸 `qiCostOf`（对齐 web `battleView.ts:302-313`），
   而 HUD 亮灯用 `qiCostOf * qiCostMul`（`BattleHud.ts:606-607`）。
   带「气力消耗」军师技时可能出现「格子亮但 cast 判 qi 不足」，此时 `cast()` 返回 `reason:'qi'`，
   界面文案正确（走 `reasonText`）。真门只有 `cast()` 一道，不会出现越权施放。
3. **瞄准样式**：web 金色虚线椭圆；Cocos `Graphics` 无 dash → 金色实线（同上意图）。
4. **结算重开**：web 只认 `AGAIN_BUTTON`；Cocos 保留「点一下画面重开」，只是控件区不再触发。
5. **瞄准提示**：去掉「右鍵 / Esc 取消」，改成「再點技能格取消」（触屏语）。
6. **heal 不给半径**：web 也跳过（`battleView.ts:1068-1088` 只在非 heal 画圈），一致。

---

## 11. `[推测]`

* `[推测]` 「技能音查表键是目录号」是从 `AudioHost.ts:58 MAGIC_SFX` 的键（`'001'`→`'m001snd01'`）与
  `data.magics[].fx_dir_primary`（如 `'016'`）对出来的；没有真机听声验证（我没法跑 Cocos 编辑器）。
* `[推测]` `getUILocation()` 在目标机上是「设计坐标像素」（Canvas 750×1334、无缩放）。若构建侧改成
  `fitWidth/fitHeight` 缩放，`toScreen` 需要乘缩放系数——这是真机验收时第一个要看的点（见 §12）。
* `[推测]` 撤退后 A 侧单位 `flee` 走空所需 tick 数：理论上 ~50 tick（`RETREAT_SPEED=1.5`，`core\battle.ts:1656`），
  断言里给到 3000 tick 上限，实测远小于上限。
* `[推测]` 结算相把「技能格/按钮/消息栏」从重开里摘掉不会伤到 web 的 `AGAIN_BUTTON` 流程——Cocos 没有那个按钮，
  重开面就是整块画面。

---

## 12. 没做到 / 留给后续

1. **真机/编辑器验收没做**：我只能跑 Node 断言与 `tsc`（构建归 lead，且任务书禁止我跑 `tools\build_wechat.ps1`）。
   触摸坐标的缩放假设（见 §11 第 2 条）必须在真机/预览里确认一次。
2. **突擊仍是灰的**：内核没有突击指令，web 也标 `v2 未接`；本次只做「置灰 + 一行提示」，符合任务书「不要自己发明突击」。
3. **「未习得」过滤没接**：web 有 `learnedSkillSeqs()`（`battleView.ts:317-353`）但线上 `makeSkillBar` 不传 seq，
   仍是写死 4 格；Cocos 同步现状（否则会和 web 打架）。要做的话是另一张单。
4. **科技/冷却**：内核没有冷却概念，web `CastReason` 也没有，未加。
5. **撤退期间 HUD 消息栏**：`requestRetreat` 不写 `world.log`，所以「全軍撤退」是壳自绘的横幅；
   HUD 自己的 `retreatSub` 会显示「撤退中」。如果要求 HUD 消息栏也出现，需要改 `BattleHud` 或内核，两者都不在我的范围。
6. **技能音表 31 条 vs web 110 条**（`AudioHost.ts` 归别人）：某些技能在 Cocos 下会静音（`playMagic` 查不到就 return），
   不会崩、不会误播。
7. **触摸没有「取消/离开」事件**：手指滑出战场后 `aim` 会保持最后一次落点（web 有 `onPointerMove` 的 `contains(FIELD)` 兜底，
   我也有 `BattleInput.ts:471-474`；但触屏没有 hover，抬手前不会清空）。影响仅是瞄准圈多留一会儿。

---

## 13. 复现（三条命令）

```powershell
# ① 类型检查
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit   # EXIT=0

# ② 操作层断言（271 条）
cd F:\sanguo
node work\cocos_binput\input_assert.mjs                                   # EXIT=0

# ③ web 全量（自证没碰 src）
cd F:\sanguo\game
node --test tests/*.test.ts                                               # 0 fail
```

## 14. 编辑器 / 真机手验清单（给 lead，10 分钟）

构建用 `tools\build_wechat.ps1`（**我没跑**，归 lead）。跑起来后按顺序点：

1. 进战斗场景 → 状态行应是 `晴 · 30Hz · 點技能格施放`（不是旧的「點擊畫面重開」）；
2. 点第 1 格（命療術）→ **立刻**回血：主将头顶飘绿色 `+N`、气力条降一截、有技能音；
3. 点第 2 格（半月斬）→ 格子描金框、状态条出现提示；**拖手指**到敌方那半边 → 出现金色半径圈 + `半月斬 · 點擊施放`；
   抬手 → 敌方单位处飘 `-N` / `命中` / `MISS`，气力降 26400；
4. 再点第 2 格 → 「已取消瞄準。」金框消失；
5. 点突擊 → 只出 `突擊：v2 未接。`，气力/兵力一个不动；
6. 点撤 退 → 出 `全軍撤退。`，战场上方出现金色「全軍撤退」，我方单位往下走光 → 结算面板；
7. 结算后先点**技能格**→ 不该重开；点**突擊/撤退**→ 不该重开；点战场空白 → 重开（或回大地图，若 `from==='campaign'`）；
8. 若坐标偏了（点战场落点与手指位置不重合），先怀疑 Canvas 缩放：`toScreen` 需要乘 `uiScale`（见 §11 第 2 条），
   改 `BattleRoot.ts:399-402` 一处即可。

---

## 15. 突擊接线（g6 `AllRush` 内核 → Cocos 壳）

> 本节晚于 §1-14，**取代 §12 第 2 条「突擊仍是灰的」与第 3 条「未习得过滤没接」**；其余结论不变。

### 15.1 同步内核

`cd F:\sanguo; node work\cocos_sync\sync_core3.mjs` → EXIT=0。新增/更新：
`core\army_cmd.ts`（696 行，新建）、`core\battle.ts` 2378→2632 行、`core\roster.ts` +45、
`core\smartscript\runtime.ts` 1357→1561 行、`core\smartscript\syso_host.ts` 1753→1829 行、
`core\syscalls.ts` +36、`core\strategy.ts` +101、`core\wises.ts` +10、`core\wises_effects.ts` +56、`core\audio_bus.ts` +17。
`work\cocos_sync\sync3_report.txt`：KEEP_PATCHES K4/K6/K7a 锚点全在；Babel 陷阱 **0/0/0/0**
（for-of 逻辑表达式 0、Set/Map 展开 0、`import.meta` 0、`.ts` 后缀 import 0）。

内核 API（Cocos 侧同签名）：
`World.rush: Record<Side, boolean>`（`core\battle.ts:364`，`createWorld` 里 `{A:false,B:false}` `:669`）、
`RUSH_SPEED = 1.3`（`:1841`）、`allRush(world, side): boolean`（`:1883`，已在突擊/已结束返回 false）、
`isRushing(world, side)`（`:1890`）；宿主通道 `createBattleSysoHost(world, side, opts)`（`core\smartscript\runtime.ts:1526`）、
`runSystemSoFunction`（`:1483`）、`syso_host` 内置命令 `AllRush`（`:518`，case `:790`）。

### 15.2 `BattleInput.tapAssault()`（`BattleInput.ts:572-594`）

```ts
tapAssault(): BattleEffect[] {
  const world = this.worldNow;
  if (!world || world.over) { this.message = MSG_OVER; return []; }
  if (isRushing(world, 'A')) { this.message = MSG_RUSHING; return []; }   // 幂等：不重复写 rush
  let applied = false;
  try {
    const host = createBattleSysoHost(world, 'A', {});
    const res = host.call('AllRush', []);
    applied = isRushing(world, 'A');
    if (!res || res.handled !== true) applied = allRush(world, 'A') || applied;  // 宿主没接线 → 退化内核
  } catch {
    applied = allRush(world, 'A');                                         // 宿主异常 → 退化内核
  }
  this.message = applied ? MSG_RUSH_OK : MSG_RUSHING;
  return [];
}
```

口径与 web `main.js:789-816` 的 `rushCommand()` 一致：**先宿主、`handled!==true` 再内核、异常也内核**；
文案逐字：成功 `全軍突擊！`，已在突擊中 `全軍已在突擊中。`（`BattleInput.ts:79-80 MSG_RUSH_OK/MSG_RUSHING`）。
突擊**不消耗**气力/技力，也不产生 `BattleEffect`（演出由内核 `army_cmd`/`AllRush` 驱动）。

### 15.3 HUD 文案（`BattleHud.ts:666-673`）

`const rushing = world.rush?.A === true;` → 副文案 `rushing ? '突擊中' : '全軍突擊'`，
主文案 `突 擊` 在突擊态转金色，命令牌 `cmd_on/cmd_off` 随之换帧（`assaultOn`，`:277`、`:489`）。
**「v2 未接」字样已从 HUD 与 `BattleInput` 全部移除**（建局时若 `world.rush` 尚未初始化，用可选链兜底为常态）。

### 15.4 技能格 4 → 8（按将习得）

* `BattleInput.ts:62 MAX_SKILL_SLOTS = 8`（`SKILL_SLOTS` 兼容别名同值）；`SKILL_SEQ=[1,50,2,104]` 降级为**数据查不到时的兜底**。
* `learnedSkillSeqs(data, name, level, max=8)`（`BattleInput.ts:219-250`）：解析 `generals.json` 的 `SKILL`
  （`"1, 50"` 字符串数组 / 单字符串 / `[[1,50]]` / 扁平 `[1,50]` 四种落盘形状都吃），按 `lv >= need` 过滤，`slice(-max)`。
* 版式 `skillSlotRects(count)`（`BattleInput.ts:193-209`）：`<=4` 沿用 `view/layout.ts` 的 `skillSlotRect(i)`（88×88 单行，
  一格不动）；`5..8` 为 4 列×2 行 88×56（`SKILL_GRID_ROW2_Y=1100`、行高 56、行距 6，与 web `battleView.ts:323-325` 同值）。
  `BattleInput.hitTest` / `isConsoleControl` 与 `BattleHud.layoutSlots`（`BattleHud.ts:582-600`）**都调这一个函数**，
  绘制与命中区同源（避免「画第 5 格、点中第 6 个技」）。
* `BattleHud` 预建 8 个格子（`SkillSlot5..8` 精灵 + 8 组 Label），`refreshConsole` 里
  `const seqs = learnedSkillSeqs(data, gen.name, gen.level); slotCount = Math.min(seqs.length, MAX_SKILL_SLOTS);`
  再 `layoutSlots(slotCount)`；第 `slotCount` 格之后 `slotOn[i]=false` 且节点 `active=false`（不补空格）。

### 15.5 发现并修掉的数据缺陷（**影响面超出本单，特此标注**）

Cocos 内置数据 `game\cocos\assets\bundles\res\data\generals.json` 的 `SKILL` 字段**只有最后一对**等级/技序
（如 關羽 `"40, 110"`），而规范数据 `game\data\generals.json` 是完整 8 条
（`["1, 50","6, 63",…,"40, 110"]`）。401 个将**全部**如此，导致按习得过滤后：
關羽 Lv6 只出 1 格、且技序被误解析成 `0`（界面显示「技 0 / --」）。
用一次性脚本 `work\cocos_input\patch_skill_data.mjs` 按 `NAME` 对齐，仅合并 `SKILL` 一列（401/401，其它字段原样），
文件 356,831 → 381,083 字节；重建后真机 HUD 恢复正确：關羽 Lv6 = 2 格（半月斬/冰柱刺），Lv40 = 8 格满。
**建议**：数据管线（`tools\import_legacy.py` 的 SKILL/WISESKILL 多值累积，或同步 Cocos 数据那一步）
应把这份内置包一起纳入校验；否则下次重新导出会再次退化。

### 15.6 验收

* `cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit` → **EXIT=0**。
* `node work\cocos_input\input_assert.mjs` → **断言总数 350 · 通过 350 · 失败 0**（EXIT=0）。
  * G10 突擊 18 条：初始 `rush.A===false` → 点突擊 `rush.A===true`、`isRushing` 同口径、文案 `全軍突擊！`、
    不动气力/技力、不调 `cast`/`requestRetreat`；再点 → `全軍已在突擊中。` 且 `rush` 保持 true（幂等）；
    `RUSH_SPEED===1.3`。
  * G15 8 技位 25 条：`learnedSkillSeqs('關羽',30)` >4 且 ≤8、`skillSlotRects(4)` 与 `layout.skillSlotRect` 同值、
    `(8)` 两行 y=1100/1162、h=56、`(9)` 夹到 8、未知将兜底 4、四种 `SKILL` 落盘形状、
    關羽 Lv30 建局 → 格数 = min(习得,8)、最后一格 `hitTest`/点选 → `selected=最后一格`、`phase='aiming'`、
    8 格版式行尾算控件 / 4 格版式不算。
  * G13 中新增接线检查：源码无「v2 未接」、含 `createBattleSysoHost(world`、`allRush(world, 'A')`、
    `isRushing(world, 'A')`、`catch` 兜底、HUD 含「全軍突擊」「突擊中」「world.rush?.A === true」。
* 真机 CDP（`work\cocos_verify\cdp.mjs`，私有 `PORT=9333`、`PROFILE=work\.edgeprof_cocos_input2`，876×1368）：
  * 真点「突擊」→ `rush=true`、`message='全軍突擊！'`、`toast='全軍突擊！'`、HUD 副文案「突擊中」；
    A 侧单位 x 均值 52.29 → 49.80（0.45s）→ 40.22（+2.5s）→ 38.12，**全军前压**；
    再点一次 → `message='全軍已在突擊中。'`、`rush` 仍 true。
  * 截图：`work\cocos_input\battle_rush.png`（全軍突擊！ + 突擊中 + 前压）、`battle_rush_before.png`、
    `battle_rush_advance.png`、`battle_rush_again.png`；
    8 格：`battle_slots8.png`、`battle_slots8_aim.png`（第 8 格「鬼哭神號」金框 + 瞄准圈 + `鬼哭神號 · 點擊施放`）。

### 15.7 仍未做

1. `AllRush` 的**演出**依赖 `SYSTEM.SO` 里的 22 条指令与 `syso_host` 的 `AllRush` 实现；若某个构建里
   `handled!==true`，只会退化成「全军加速 1.3×」的玩法内核，界面文案不变（不报错、不空转）。
2. 8 格在低等级将身上通常只出 2~4 格（习得表决定）；这是 web 同口径行为，不是 bug。
3. 突擊没有独立冷却/次数限制（内核也没有），连点只出「已在突擊中」。


