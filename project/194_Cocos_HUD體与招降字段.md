# 194 Cocos 战斗 HUD「兵/體」两条 + 招降面板十欄

> 目标：把 Cocos 版战斗 HUD 的主将卡补到与 **web 同口径**（`game/src/view/layout.ts:115-136` 的
> `GENERAL_CARD_Y` 与 `game/src/view/battleView.ts:1970-2054 drawGeneralCard()` 是权威实现），
> 并把招降面板的 10 栏两欄字段补齐（web 参考 `game/web/campaign.html:4851-4881 surFields(c)`）。
> 硬约束：只改 `game/cocos/assets/scripts/BattleHud.ts`、`game/cocos/assets/scripts/SurrenderPanel.ts`
> 与新建 `work/cocos_hud2/*.mjs`；未动 `game/src/**`、`game/web/**`、`core/**`、`DeployRoot.ts`、
> `BattleRoot.ts`、`BattleCmdUi.ts`、`SurrenderModel.ts`。
>
> 结论一句话：**两张卡各多了「兵」「體」两条 8px 条 + 四个 13px 裸数字 + 10px 的「技」小字，
> 行动条压成 3px；敌卡整块镜像；招降面板每卡 10 栏 5 行两欄，Cocos 拿不到的 7 项一律灰「—」。**
> 验收：`tsc` exit 0、`input_assert` 386/386、新建 `hud_assert` 108/108、三张 876×1368 截图。

---

## 0 摘要

1. `[确认]` **卡框不用换算**：Cocos 的两块卡用的是同一个 `view/layout`（`CARD_A {116,1012,250,100}`、
   `CARD_B {366,1012,151,100}`、`CARD_COL 124`），与 web `GENERAL_INFO` / `GENERAL_CARD_B` /
   `GENERAL_CARD_COL` 完全同值，所以 `GENERAL_CARD_VITAL_W = 88 / _B = 72`、`GENERAL_CARD_BAR_H = 8`
   **直接照抄，不做等比缩**（题面说「卡宽不同就缩」——实测同宽，见 §2.2）。
2. `[确认]` 四条 8px 条几何：`A/troop {204,1034,158,8}`、`A/hp {204,1050,158,8}`、
   `B/troop {370,1034,75,8}`、`B/hp {370,1050,75,8}`（= `card.x + vitalW` / `card.x + 4` 与
   `card.w − vitalW − 4`）。页面内实测正是这四组数（§4.3 dump）。
3. `[确认]` 字号与 web 逐字同号：我方 `兵/體` 16px（web `numSize = FONT.small`）、敌方 `兵/體` 13px；
   四裸数字两卡都 13px；`技` 10px 落在名字行内列；`行` 字仍 12px（web 是 9px，Cocos 端最小可读档，见 §7）。
4. `[确认]` `技` 的取整口径从 `Math.floor` 改成 `ceil`，与 web `vitalText()` 的 `Math.ceil` 一致
   （`battleView.ts:705-709`）；`兵/體` 用同一函数。
5. `[确认]` 招降面板：新增 `SUR_FIELD_KEYS` / `surFieldCells(view)` / `FIELD_LAYOUT`，
   每卡 20 个 Label（10 键 + 10 值），**武力 / 智力 / 忠誠 显示真值**，
   等級 / 士氣 / 疲勞 / 武器 / 物品 / 勝場數 / 敗場數 **灰 `—`**（`SurrenderCard` 里根本没有这些字段，
   见 `core/roster.ts:353-375`；**没有编数**）。
6. `[确认]` 未碰 `BattleRoot.ts`：`BattleHud` 自己持有卡的 Label 与 `barGfx`，接线不需要新参数，
   **所以「需要 lead 打的 diff」= 无**（§7 只留一条可选清理项）。

---

## 1 web 侧口径（照抄依据，只读未改）

| web 位置 | 值 | Cocos 对应 |
|---|---|---|
| `game/src/view/layout.ts:115-127` `GENERAL_CARD_Y` | name/mp `1028`、troopText `1046`、troopBar `1034`、hpText `1062`、hpBar `1050`、statA `1076`、statB `1090`、actionBar `1094` | `CARD_ROW_NAME 1025 / CARD_ROW_MP 1024 / CARD_ROW_TROOP 1040 / CARD_ROW_HP 1056 / CARD_ROW_STAT_A 1070 / CARD_ROW_STAT_B 1084 / CARD_ROW_ACTION 1090`，条顶 `CARD_BAR_TOP_TROOP 1034 / CARD_BAR_TOP_HP 1050` |
| `layout.ts:130` `GENERAL_CARD_BAR_H` | `8` | `CARD_BAR_H = 8` |
| `layout.ts:135-136` `GENERAL_CARD_VITAL_W` / `_B` | `88` / `72` | `CARD_VITAL_W_A = 88` / `CARD_VITAL_W_B = 72` |
| `battleView.ts:1970-2054 drawGeneralCard()` | `barX = mirror ? card.x+4 : card.x+vitalW`；`barW = card.w − vitalW − 4`；四裸数字 `rows=[[疲,tire,士,morale],[智,int,武,str]]`，13px，外侧列 `outerX`、内侧列 `innerX`；行动条 `bar(card.x, 1094, card.w−12, 3, ratio, gold)` + 右端「行」 | `GENERAL_CARD_BARS`（4 条）+ `paintMeter()` + `CardNumA*/CardNumB*` + `CARD_GAUGE {116,1094,238,3}` + `CardGaugeLabel` |
| `battleView.ts:952-974 bar()` | 轨道 `rgba(255,255,255,0.10)` + 填充 + 1px `rgba(255,255,255,0.14)` 描边，圆角 `h/2` | `paintMeter()`：轨道 `hexColor(COLORS.white,26)`、填充、1px `hexColor(COLORS.white,36)`，全部 `roundRect(radius=h/2)` |
| `battleView.ts:705-709 vitalText()` | `Math.max(0, Math.ceil(x))` + `` `${label} ${c}/${m}` `` | `BattleHud.ts:80 vitalText()` 逐字同口径 |
| `game/web/campaign.html:4851-4881 surFields(c)` | 10 栏顺序 `等級/士氣/疲勞/武力/智力/忠誠/武器/物品/勝場數/敗場數`，`null → <b class="none">—</b>` | `SUR_FIELD_KEYS` + `surFieldCells()`；null → 灰 `—` |
| `campaign.html:212-216` `.sgen .fld` | `grid-template-columns:1fr 1fr`、`font-size:14px`、`line-height:1.5` | `FIELD_LAYOUT`：两欄 5 行、11px / 16px 行距（卡高 150 放不下 14px，见 §7） |
| `campaign.html:4883-4915 surCardHtml(c,pick)` | face + nm + tier + `.fld` + `.rs` reason + 右侧按钮/徽标；**web 卡面已没有旧的 `stat` 单行** | 删 `SurStat{i}`，改 10 格；`SurReason{i}` 下移到 `cardY+106`；按钮列 `y+120` |

---

## 2 `game/cocos/assets/scripts/BattleHud.ts`（改了什么，file:line）

### 2.1 改动清单

| 行 | 改动 |
|---|---|
| `:80` | 新增 `function vitalText(label: string, cur: number, max: number): string`（与 web 逐字一致，ceil + 夹 0） |
| `:98` | `export type TextRole` 增 `'micro' \| 'vital' \| 'stat'`（原 6 级 → 9 级） |
| `:133` | `micro: { fontSize: 10, lineHeight: 14, outlineWidth: 0, shadow: false, bold: false }`（`技`） |
| `:134` | `vital: { fontSize: 16, lineHeight: 22, … }`（我方 兵/體 = web `FONT.small`） |
| `:135` | `stat: { fontSize: 13, lineHeight: 18, … }`（敌卡 兵/體 + 两卡四裸数字 = web 的 13px） |
| `:317-334` | 卡行位文档表：逐项对齐 web `GENERAL_CARD_Y`，含「web y 是基线、Cocos 是盒中心」的换算说明 |
| `:335-341` | `CARD_ROW_NAME 1025 / CARD_ROW_MP 1024 / CARD_ROW_TROOP 1040 / CARD_ROW_HP 1056 / CARD_ROW_STAT_A 1070 / CARD_ROW_STAT_B 1084 / CARD_ROW_ACTION 1090`（旧的 `CARD_ROW_TIRE 1062` / `CARD_ROW_ARM 1080` 删除） |
| `:344-347` | `CARD_BAR_TOP_TROOP 1034 / CARD_BAR_TOP_HP 1050 / CARD_BAR_H 8` |
| `:357-358` | `CARD_VITAL_W_A 88 / CARD_VITAL_W_B 72`（注释写清「卡框同尺寸 ⇒ 不缩」） |
| `:361` | `export interface CardBarRect { side:'A'\|'B'; kind:'troop'\|'hp'; rect:Rect; color:string }` |
| `:372-390` | `export const GENERAL_CARD_BARS`：4 条 8px 条（`:375` A/troop、`:379` A/hp、`:383` B/troop、`:387` B/hp），几何全部由 `CARD_A/CARD_B/CARD_VITAL_W_*/CARD_BAR_*` 派生 |
| `:480` | `readonly cardBars: readonly CardBarRect[] = GENERAL_CARD_BARS`（公开，给页面内断言） |
| `:482` | `readonly cardActionBar: Rect = CARD_GAUGE`（公开，「行」条几何） |
| `:486` / `:496` | `private cardHpA / cardHpB: Label` |
| `:584-587` | `GeneralName`（subtitle 22）/ `GeneralState`（body 18，右对齐）沿用 |
| `:598-601` | `CardTroopA`(vital, `CARD_A.x`, `CARD_ROW_TROOP`, 88, left, oursLight) / `CardHpA`(vital, 同 x, `CARD_ROW_HP`, 88, left, heal) |
| `:606` | `CardSkillA`(micro, `CARD_A.x + CARD_COL`, `CARD_ROW_MP`, 90, left, textDim) —— `技` 不占行位 |
| `:610-613` | `CardNumA0..3`(stat, 偶 = `CARD_A.x` 外侧 / 奇 = `CARD_A.x+CARD_COL` 内侧, 宽 110) |
| `:619-631` | `CardNameB`(body, `CARD_B.x+CARD_B.w`, right) / `CardStateB`(caption) / `CardTroopB`(stat, 72, right) / `CardHpB`(stat, 72, right) / `CardSkillB`(micro, `CARD_B.x+48`, 60, left) |
| `:634-640` | `CardNumB0..3`(stat, 偶 = 右对齐 at `CARD_B.x+CARD_B.w` / 奇 = 左对齐 at `CARD_B.x+4`) —— **整块镜像** |
| `:651` | `CardGaugeLabel`('行', caption, `CARD_GAUGE_LABEL_X`, `CARD_ROW_ACTION`, 24, right, textFaint) |
| `:993-995` / `:1007-1009` | `cardTroopA.string = vitalText('兵', a.aliveCount, a.start)`、`cardHpA.string = vitalText('體', gen.hp, gen.maxHp)`、`cardSkillA.string = vitalText('技', gen.mp, gen.mpMax)`（**floor → ceil**）；B 侧对称 |
| `:1026-1033` | `refreshConsole()`：`for (const bar of GENERAL_CARD_BARS)` 内联算 `ratio`（troop = `start > 0 ? aliveCount/start : 0`、hp = `maxHp > 0 ? hp/maxHp : 0`）→ `this.paintMeter(g, bar.rect, ratio, bar.color, bar.side === 'B')` |
| `:1035-1037` | 行动条 `const gu = generalUnitOf(world,'A'); const gauge = gu && gu.alive ? actionGaugeOf(gu) : null; if (gauge) this.paintMeter(g, CARD_GAUGE, gauge.ratio, COLORS.gold)`（3px） |
| `:1101` | `private paintMeter(g: Graphics, rect: Rect, ratio: number, color: string, mirror = false): void`（替换旧的 `paintBar`；轨道/填充/描边 + mirror 从右端往左填） |

### 2.2 为什么不用等比缩（题面提到的 `measureText` 问题）

- web 的两块卡是 `{116,1012,250,100}` 与 `{366,1012,151,100}`，**Cocos 用的同一个
  `game/cocos/assets/scripts/view/layout.ts` 常量，同值**。所以 `88 / 72 / 8` 是同一坐标系下的数，
  不需要「卡宽不同就缩」。
- Cocos 没有 `measureText`，数值文本的宽只能给常量：我方 `兵 999/999` 在 16px 下 ≈ 81px < 88，
  敌方同串在 13px 下 ≈ 66px < 72（`BattleHud.ts:349-356` 注释里写了这个估算）。
  Label 用 `Overflow.SHRINK`，真超长只会缩字不会压到条上。

### 2.3 行位为什么整体 −6（1028 → 1025 等）

web 的 `T(x, y)` 是 `fillText` 的**字母基线**，Cocos 的 `placeOn` 给的是**盒中心**
（`verticalAlign = CENTER`）。两边差 ≈ 0.35×字号：名字 22px 用 −3（沿用已验收值），
正文 16px 用 −6，10~13px 小字用 −4（`mp 1028 → 1024`、`statA 1076 → 1070`、`statB 1090 → 1084`、
`actionBar 1094 → 1090`）。这也是 web 与 Cocos 逐像素对齐的历史口径（`project/156 §7.1`）。

---

## 3 `game/cocos/assets/scripts/SurrenderPanel.ts`（改了什么，file:line）

| 行 | 改动 |
|---|---|
| `:91` | `export const SUR_FIELD_KEYS = ['等級','士氣','疲勞','武力','智力','忠誠','武器','物品','勝場數','敗場數'] as const`（顺序 = web `surFields(c)`） |
| `:112` | `export interface SurFieldCell { key: string; value: string \| null }` |
| `:123` | `export function surFieldCells(view: SurrenderView): SurFieldCell[]`：`武力 = cellNum(view.str)`、`智力 = cellNum(view.int)`、`忠誠 = cellNum(view.loyal)`，其余 7 项 `null` |
| `:146` | `export const FIELD_LAYOUT = { top: 27, rowH: 16, keyW: 44, valW: 116, size: 11, colX: [160, 330] }` |
| `:241` | `SurrenderDebug` 增 `fields: string[]`（每可见卡 10 格拼一行，headless/页面断言用） |
| `:334-336` | 字段 `labelsFieldKey: Label[][]` / `labelsFieldVal: Label[][]`（`[i][k]`，k = 0..9）；**删 `labelsStat`** |
| `:403-431` | `build()` 每卡循环 k=0..9 建 `SurFieldK{i}_{k}`（键，textDim）+ `SurFieldV{i}_{k}`（值，text），`col = k % 2`、`row = (k − col) / 2`（CSS grid 按行填） |
| `:433` | `SurReason{i}` 下移到 `{ x: 160, y: cardY + 106, w: 480, h: 14 }`、12px → 10px |
| `:399` | `SurName{i}` 上移到 `cardY + 3`、22px → 20px（腾出十欄的 27..107 段） |
| `:510` | `debug()` 增 `fields: views.map(v => surFieldCells(v).map(c => `${c.key} ${c.value ?? '—'}`).join(' · '))` |
| `:594-595` | `refresh()` 每卡节点数组：`labelsStat[i].node` → `...labelsFieldKey[i].map(l => l.node)` + `...labelsFieldVal[i].map(l => l.node)` |
| `:680-690` | `paintCard()`：删 `labelsStat[index].string = view.stat`，改 `const cells = surFieldCells(view)`；键 `rgba(COLORS.textDim)`；值 `cell.value ?? '—'`、颜色 `value === null ? textFaint : text` |
| `:808-813` | `pickRect(cardY) → { x:160, y:cardY+120, w:210, h:28 }`、`btnRect(cardY,i) → { x:160+i*158, y:cardY+120, w:150, h:28 }`（原 `y+104 / h38`） |

### 3.1 卡面版式（150 高一卡）

```
cardY+ 3 .. 32   名字（20px）                 cardY+12 .. 38   档位徽标（右）
cardY+27 .. 107  10 欄 5 行 × 16px（11px 字）  cardY+12 .. 138  头像 94×126（左）
cardY+106..120   理由（10px，SHRINK）
cardY+120..148   按钮 3 颗 或 「已/逃 走」徽标
```

### 3.2 哪些字段是真值、哪些是灰「—」

- 真值：**武力 / 智力 / 忠誠**（`SurrenderCard.str/int/loyal`，`core/roster.ts:353-375`）。
- 灰「—」（Cocos **拿不到**，一律不编）：**等級、士氣、疲勞、武器、物品、勝場數、敗場數**。
- `game/web` 侧本轮另有 `project/196_招降字段真值.md`：web 从 `save.morale` / `save.tire` /
  新增 `save.generalRecord` 取真值。**Cocos 的 `SurrenderModel` 不读这三张表**
  （`SurrenderCard` 里就没有字段），而 `SurrenderModel.ts` 属禁改范围，所以 Cocos 保持「—」；
  要让 Cocos 也显示，需要先给 `SurrenderCard` 加字段（core + model 变更），不在本任务范围（§7）。

---

## 4 验收（三条全过）

### 4.1 `tsc`

```
$ cd F:\sanguo\game\cocos; npm.cmd exec -- tsc -p tsconfig.check.json --noEmit
TSC EXIT=0        （无任何输出，日志 work\cocos_hud2\tsc_final.log 0 字节）
```

### 4.2 `input_assert`（不能退化）

```
$ node work\cocos_input\input_assert.mjs
G15 8 技位：learnedSkillSeqs + skillSlotRects + 第 8 格  29 条
G16 指令台 cmd6 / armyMenu / armyCmd 命中与下令         40 条
--------------------------------------------------------
断言总数 386 · 通过 386 · 失败 0
INPUT EXIT=0
```

### 4.3 新建 `work/cocos_hud2/hud_assert.mjs` → 108/108

`node work\cocos_hud2\hud_assert.mjs` 自己起静态服务（自有构建）+ 独立 Edge profile，
跑 `steps_hud_dump.mjs` 采集页面内实测（HUD 卡 + 招降面板），再对 dump 做断言：

```
自起静态服务 :5272（root=F:\sanguo\work\cocos_hud2） OK
launched Edg/158.0.4370.33 target 3144D6DC8DC594E8EAB647939B95EE02
waitCc {"scene":"Boot","frames":54}
HUD labels 83 bars ["A/troop","A/hp","B/troop","B/hp"]
dump → F:\sanguo\work\cocos_hud2\hud_dump.json 54937 B
frames [85, 158, 421]
------------------------------------------------------------------------
分组统计：
  0 dump 前提           6 条
  1 兵/體 两条 8px 条（几何照抄 web GENERAL_CARD_BARS） 12 条
  2 左卡「兵 x/y」「體 x/y」两条 Label 14 条
  3 名字行里的 `技` 10px 小字（不占行位）  8 条
  4 四个裸数字（疲 / 士 / 智 / 武，13px，两列） 13 条
  5 「行」3px 细条（height ≤ 4） 11 条
  6 敌方卡整块镜像（x 序与左卡相反） 20 条
  7 招降面板十欄（web surFields 同序，拿不到的灰「—」） 24 条
断言总数 108 · 通过 108 · 失败 0（分组合计一致）
全部通过 ✔
```

实测 Label dump（节选，完整见 `work\cocos_hud2\hud_assert.log`）：

```
  CardSkillA       "技 53/53"   size=10 x=  285 y=  1024 box=90x16  #9aa3ae
  CardSkillB       "技 52/52"   size=10 x=  444 y=  1024 box=60x16  #9aa3ae
  GeneralName      "關羽"        size=22 x=  201 y=  1025 box=170x37  #e9e4d8 bold
  GeneralState     "在陣"        size=18 x=  285 y=  1025 box=110x30  #69c98a
  CardNameB        "張角"        size=18 x=  469 y=  1025 box=96x30  #ffa18e
  CardTroopA       "兵 100/100" size=16 x=  160 y=  1040 box=88x25  #9db8ff
  CardTroopB       "兵 100/100" size=13 x=  481 y=  1040 box=72x21  #ffa18e
  CardHpA          "體 96/96"   size=16 x=  160 y=  1056 box=88x25  #69c98a
  CardHpB          "體 85/85"   size=13 x=  481 y=  1056 box=72x21  #69c98a
  CardNumA0        "疲 0"       size=13 x=  171 y=  1070 box=110x21 #9aa3ae
  CardNumA1        "士 60"      size=13 x=  295 y=  1070 box=110x21 #9aa3ae
  CardNumB1        "士 60"      size=13 x=  408 y=  1070 box=76x21  #9aa3ae
  CardNumB0        "疲 0"       size=13 x=  479 y=  1070 box=76x21  #9aa3ae
  CardNumA2        "智 75"      size=13 x=  171 y=  1084 box=110x21 #9aa3ae
  CardNumA3        "武 97"      size=13 x=  295 y=  1084 box=110x21 #9aa3ae
  CardNumB3        "武 70"      size=13 x=  408 y=  1084 box=76x21  #9aa3ae
  CardNumB2        "智 88"      size=13 x=  479 y=  1084 box=76x21  #9aa3ae
  CardGaugeLabel   "行"          size=12 x=  354 y=  1090 box=24x20  #65707c
  SurFieldK0_0     "等級"        size=11 x=  182 y=   275 #9aa3ae
  SurFieldV0_0     "—"          size=11 x=  262 y=   275 #65707c
  SurFieldK0_3     "武力"        size=11 x=  352 y=   291 #9aa3ae
  SurFieldV0_3     "91"         size=11 x=  432 y=   291 #e9e4d8
```

`hud.cardBars` 实测（页面内读 `hud.cardBars`）：
`A/troop {204,1034,158,8} #9DB8FF`、`A/hp {204,1050,158,8} #69C98A`、
`B/troop {370,1034,75,8} #FFA18E`、`B/hp {370,1050,75,8} #69C98A`；`actionBar {116,1094,238,3}`。

每卡十欄（`panel.debug().fields`）：

```
#0 等級 — · 士氣 — · 疲勞 — · 武力 91 · 智力 78 · 忠誠 44 · 武器 — · 物品 — · 勝場數 — · 敗場數 —
#1 等級 — · 士氣 — · 疲勞 — · 武力 88 · 智力 76 · 忠誠 61 · 武器 — · 物品 — · 勝場數 — · 敗場數 —
#2 等級 — · 士氣 — · 疲勞 — · 武力 80 · 智力 62 · 忠誠 12 · 武器 — · 物品 — · 勝場數 — · 敗場數 —
#3 等級 — · 士氣 — · 疲勞 — · 武力 61 · 智力 70 · 忠誠 100 · 武器 — · 物品 — · 勝場數 — · 敗場數 —
```

断言里还有三条值得单独说：
- 「行」条 `h = 3 ≤ 4`，`w = 238 = CARD_A.w − 12`（同 web `card.w − 12`），字右端落在 `x = 354`。
- 敌卡镜像：`CardNumB0`(疲) `x = 479` > `CardNumB1`(士) `x = 408`（外侧在右、内侧在左），
  条从卡左沿 `370` 起、右端 `445`（= `CARD_B.x + 4 + 75`）。
- 拒降卡（`recruitable === false`）：`panel.hits` 里**没有** `card:2:recruit`、有 `card:2:kill`；
  君主卡 `SurPick3 = '逃 走'`、`SurBtn3_0..2` 全 `active = false`。

---

## 5 截图（876×1368，三张全部实测尺寸）

| 文件 | 尺寸 | 字节 | 拍前帧数（`getTotalFrames()`） |
|---|---|---|---|
| `F:\sanguo\work\cocos_hud2\battle_hud.png` | 876×1368 | 1308402 | 579 → 640 ✔ 在涨 |
| `F:\sanguo\work\cocos_hud2\cards_closeup.png` | 876×1368 | 1232169 | 448 → 508 ✔ 在涨 |
| `F:\sanguo\work\cocos_hud2\surrender_panel.png` | 876×1368 | 388225 | 722 → 783 ✔ 在涨 |

拍法（`work/cocos_hud2/steps_shots.mjs`）：每张前都做 `Page.bringToFront` +
`Emulation.setFocusEmulationEnabled`，再用 `cc.director.getTotalFrames()` 前后差 > 3 卡一道闸
（否则直接 throw `rAF 停了`），确认在涨才 `Page.captureScreenshot`。
`cards_closeup.png` 是**把视口临时放大到 1200×2134（设计区 ×1.6）再裁窗**，所以是 1.6 倍真渲染的
卡面（不是放大 876 那张的插值）。

视觉核对：左卡 `兵 100/100` + 蓝条、`體 96/96` + 绿条、`技 53/53` 10px 在名字行、
`疲 0 / 士 60 / 智 75 / 武 97` 两列、底部金色 `行` 细条 + 右端「行」；右卡整块镜像；
招降面板十欄两欄、7 项灰「—」、理由行、三颗按钮（拒降卡「招降」暗）、君主卡「君 主」+「逃 走」。

---

## 6 构建与验证环境（一条偏离，已如实记录）

- **没有覆盖共享产物** `F:\sanguo\game\cocos-build\web-mobile`：那份是别的 agent 18:37:40 建的，
  而且当时系统里有 4 个 `CocosCreator` 进程（17:34:10 / 17:34:55 / 18:40:55 / 18:41:42），
  同项目并发构建会抢 asset db 锁。为了不踩别人，本轮建到自己的目录：
  ```
  $env:ELECTRON_RUN_AS_NODE=''
  CocosCreator.exe --project F:/sanguo/game/cocos --build "platform=web-mobile;debug=false;md5Cache=true;buildPath=F:/sanguo/work/cocos_hud2/cocos-build;startScene=0b007000-1a2b-4c3d-8e4f-000000000001"
  ```
  日志 `work\cocos_hud2\build1.out.log`：`build Task (web-mobile) Finished in (40 s)ms`（18:47:59）。
- **产物自检**：`assets\main\index.dd47a.js`（838761 B）里 grep 到 `cardActionBar`、`CardHpA`、
  `SurField`、`surField`、`勝場數` ⇒ 本轮改动确实进包。
- **服务与浏览器**：`node work\cocos_hud2\serve.mjs F:\sanguo\work\cocos_hud2 5271`
  （URL `http://127.0.0.1:5271/cocos-build/web-mobile/index.html`）；CDP 用
  `work\cocos_verify\cdpweb.mjs`，独立 profile `.edgeprof_hud2` + 端口 9333（`hud_assert.mjs`
  会自动找空口、拉起服务、launch/attach/close，`--no-run` 只重放已有 dump）。
- **踩过的坑（留给后来人）**：5191 端口先被另一个 agent 的 `web/serve.mjs` 占了，我的服务静默退出，
  页面一直加载**别人的旧构建**（`index.629a5.js`，`hud.cardBars = []`），白查了一轮；
  现在 `hud_assert.mjs` 会先 `net.createServer` 探口再起服务，且 dump 里带
  `waitCc/ frames` 可供事后核对。
- 构建之后又改了两处**纯注释**（`BattleHud.ts:324-327` 的「18px → 16px」、`:355` 的宽估算），
  行为不变，所以截图对应的 bundle 与现在的源码行为等价。

---

## 7 没做到 / 已知差异 / 需要 lead 的 diff

1. `[确认]` **需要 lead 打的 diff：无。** `BattleRoot.ts` 一行未动——`BattleHud` 的卡是它自己在
   `refreshConsole()` 里画的，`cardBars` / `cardActionBar` 只是给断言读的公开几何。
2. `[确认]` **Cocos 拿不到的 7 项仍是灰「—」**（等級/士氣/疲勞/武器/物品/勝場數/敗場數）。
   web 侧 `project/196` 已经从 `save.morale` / `save.tire` / `save.generalRecord` 取到真值；
   Cocos 要跟上，得先给 `core/roster.ts` 的 `SurrenderCard` 加 `level/morale/tire/weapon/thing/wins/losses`
   并在 `SurrenderModel.viewOf()` 里带出来（两处都在禁改范围）。**这是本任务唯一的功能性缺口。**
3. `[确认]` 「行」字 web 是 9px，Cocos 沿用 `caption` 12px：Cocos 端 9px 在当前字库下糊成一团
   （`project/176` 同类问题），且该字只是标尺标签。位置（`x=366` 起右对齐、`y=1090`）与 web 同构。
4. `[确认]` 四裸数字行距：web `statA 1076 / statB 1090`（14px 行距），Cocos 用 `1070 / 1084` 同 14px 行距，
   但整体上移 6px（基线 → 盒中心，§2.3），不是缩小行距。
5. `[确认]` 招降面板字段字号 11px（web 14px）：卡高 150、十欄 5 行要挤进 `cardY+27..107`，
   14px 会与理由行/按钮打架。行距 16px（web 21px）同理。这是**有意偏离**，不是漏做。
6. `[确认]` 截图来自**自有构建 + 自有端口**（§6），不是 `game/cocos-build` 的共享产物。
   如果 lead 要在 `http://127.0.0.1:5173/...` 上直接看到，需要有人重建 `game/cocos-build`（共享产物，
   我没敢覆盖）。
7. `[确认]` 本轮**没有**改 `BattleCmdUi.ts` 里重复产出 `gen.stats/gen.hp/gen.mp` 的逻辑（题面要求保持现状），
   `BattleRoot.syncCmdUi()` 的跳过逻辑也没碰。

---

## 8 复现（从零到三张图）

```powershell
# 1) 类型检查
cd F:\sanguo\game\cocos; npm.cmd exec -- tsc -p tsconfig.check.json --noEmit   # 0

# 2) 内核断言（不许退化）
cd F:\sanguo; node work\cocos_input\input_assert.mjs                            # 386/386

# 3) HUD/面板断言（自带服务 + 自带浏览器；--no-run 只重放 hud_dump.json）
node work\cocos_hud2\hud_assert.mjs                                             # 108/108

# 4) 三张截图（需先有 1/2 步的构建：work\cocos_hud2\cocos-build\web-mobile）
node work\cocos_hud2\serve.mjs F:\sanguo\work\cocos_hud2 5271
$env:OUTDIR='F:\sanguo\work\cocos_hud2'; $env:PORT='9333'
$env:PROFILE='F:\sanguo\work\.edgeprof_hud2'
$env:PAGE_URL='http://127.0.0.1:5271/cocos-build/web-mobile/index.html'; $env:MATCH='5271'
node work\cocos_verify\cdpweb.mjs launch
node work\cocos_verify\cdpweb.mjs run work\cocos_hud2\steps_shots.mjs
node work\cocos_verify\cdpweb.mjs close
```

产物：`work\cocos_hud2\{battle_hud,cards_closeup,surrender_panel}.png`（876×1368）、
`hud_dump.json`、`hud_assert.log`、`shots.log`、`tsc_final.log`、`input_final.log`。
脚本：`steps_hud_dump.mjs`（采集 + 开招降面板）、`hud_assert.mjs`（108 断言）、
`steps_shots.mjs`（三张图）、`serve.mjs`（零依赖静态服务）、`steps_probe.mjs` / `steps_which.mjs`（诊断）。
