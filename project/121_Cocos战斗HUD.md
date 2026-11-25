# 121 Cocos 战斗 HUD / 结算面板（九宫 + 4 级字级）— 交付

日期：2026-11-25 09:26
执行：c3-battle-ui
一句话：**把 web 版战斗页控制台的九宫叠层（`#battleui` 那 7 张图）和结算面板搬进 Cocos：新建 `BattleHud.ts`（704 行）建出 12 个九宫节点 + 4 级字级 + 结算层，`BattleRoot.ts` 只删掉原来压在控制台里的两行 General 文本、把刷新委托给它；`tsc --noEmit` EXIT=0，node 侧 357 条断言全过（含「素材与 web 逐字节相同」「主将三层节点名仍在」）。没跑构建、没截图。**

---

## 1 改前 / 改后（节点结构）

### 改前（`BattleRoot.ts` 841 行，控制台 y1000..1334 几乎是空白）

```
BattleRoot
├ BattleHudBar        (ArtBg bg/hud_bar, UIOpacity 150)
├ BattleBg            (战场底图 3 段滚动)
├ AudioHost
├ BattleBase / UnitsA / UnitsB / Generals / Fx   (5 个 Graphics)
├ UnitSprites         (士兵精灵池，节点名 Unit_0..N)
├ GeneralArt          (GenAHorse/Body/Weapon + GenBHorse/Body/Weapon)
├ BattleWeather
├ Label_我軍 / Label_敵軍 / Label_00:00
├ Label_              ← labelGeneral：y=1172，16px，两行「我/敵 名字 Lv 武力 智力 HP MP …」
├ Label_status        ← y=1308，14px 居中一行
└ ScreenTint
```

控制台带里**只有** `redrawBase()` 画的一块 `fillScreenRect(0, 999, 750, 335)` 深色底（`BattleRoot.ts:518` 那行）
+ 上面那两行 16px 文字。没有头像框、没有技能格、没有命令按钮、没有消息框、没有分隔线，也没有结算面板
（结算只有 `labelStatus` 里拼出来的一行长句）。

### 改后

```
BattleRoot
├ …（上面那一串全部不变，见 §5「保留未动」）
├ Label_我軍 / Label_敵軍 / Label_00:00
├ Label_              ← labelStatus：改到 x16 / y1004，宽 360，12px 左对齐（让位给九宫控制台）
├ BattleHud                                       ← 新建（BattleHud.ts:328 起）
│ ├ HudConsole                  (UIOpacity；战斗中 255 / 结算时 41 ≈ web 的 .16)
│ │ ├ HudPortrait               (port.png  SLICED 86×108 = PORTRAIT)
│ │ │ ├ PortraitGlyph           「將」hero 40 + 2px 描边 + 阴影
│ │ │ └ PortraitLevel           「Lv.6」num 20
│ │ ├ GeneralName / GeneralState / GeneralStats    (subtitle 22 / subtitle 22 / body 18)
│ │ ├ HudBars                   (Graphics：HP 绿 238×9、技 蓝 238×6、氣 金 238×4)
│ │ ├ HpValue / MpValue / QiValue                  (caption 12，右端角标「體 96」「技 25」「氣 50%」)
│ │ ├ SkillSlot1                 (slot.png    SLICED 88×88)
│ │ │ ├ SkillIndex1 (num) / SkillName1 (body) / SkillKind1 (caption) / SkillCost1 (caption)
│ │ ├ SkillSlot2 / SkillSlot3 / SkillSlot4         (同上；不可用时整格换 slot_off.png)
│ │ ├ SepTop                    (sep.png  TILED 624×12 @108,1106)
│ │ ├ CmdBtnAssault             (cmd_off.png SLICED 204×84 = BTN_ASSAULT)
│ │ │ ├ CmdLabelAssault 「突 擊」subtitle / CmdSubAssault「v2 未接」caption
│ │ ├ CmdBtnRetreat             (cmd_on.png / cmd_off.png 两态 SLICED = BTN_RETREAT)
│ │ │ ├ CmdLabelRetreat「撤 退」subtitle / CmdSubRetreat「全軍離場|撤退中|已結束」caption
│ │ ├ MsgBox                    (msg.png   SLICED 392×84 = MESSAGE_BOX)
│ │ │ ├ MsgLine1 (body 18，战场最后一条 log) / MsgLine2 (caption，敌方主将明细) / MsgHint「1-4 / R」
│ │ ├ SepBottom                 (sep.png  TILED 714×12 @18,1316)
│ │ └ HudMeta                   (caption，右上「出征 · 連勝 2（最高 3） · 軍師技 …」)
│ └ SettleLayer                 (整组 active=false，结算时开)
│   ├ SettleShade               (Graphics #06080C α199，只盖战场 100..1000)
│   ├ SettleArt                 (Graphics：面板底/金边/斑马行/经验条/再战按钮，一次性画，见 :699)
│   ├ SettleFrame               (msg.png SLICED inset(SETTLE_PANEL,8)=624×784)
│   ├ SettleSep                 (sep.png TILED 510×12 @120,270)
│   ├ SettleTitle               (hero 40 + 2px 描边 + 阴影：「大 勝/敗 走/平 手」)
│   ├ SettleSub                 (subtitle 22：「大勝 · 用時 16 秒 · 100 擊殺」)
│   ├ SettleKey1..6 / SettleVal1..6 (body 18 左 / num 20 右)
│   ├ SettleExp / SettleExpNext (num：「EXP 1530 / 2775」「距下一級 1245」)
│   ├ SettleMeta                (caption：「法術擊殺 8 · 連勝 1（最高 3）」)
│   ├ SettleReport              (caption：SettleResult.report，胜负色)
│   ├ SettleNote                (caption：「本局結果只存在內存，不寫存檔（預覽版）」)
│   └ SettleAgainLabel / SettleAgainSub (subtitle「再 戰」+ caption「點擊畫面重開」)
└ ScreenTint
```

**两处顺序是刻意的**：① `BattleHud` 建在顶栏 3 个 Label **之后**、`ScreenTint` **之前** —— 结算遮罩要盖住战场
但保留顶栏兵力条，所以它必须压在顶栏文字之上（`BattleRoot.ts:383` 的注释）；② 九宫图先建、字后建（子节点顺序
= 渲染顺序），所以「將」压在 `port.png` 框上、技能名压在 `slot.png` 里（`BattleHud.ts:337-341`）。

---

## 2 九宫：7 张图 / 12 个节点

### 素材（`game\cocos\assets\bundles\res\ui\battle\`）

| 文件 | 尺寸 | 字节 | 九宫 inset | 挂载点 |
|---|---|---|---|---|
| `slot.png` | 34×34 | 567 | 14 | `SkillSlot1..4`（可用） |
| `slot_off.png` | 22×22 | 377 | 8 | `SkillSlot1..4`（不可用，含 MP/氣力不足、阵亡、战斗结束） |
| `cmd_on.png` | 38×38 | 477 | 16 | `CmdBtnRetreat`（可下撤退令，金→红） |
| `cmd_off.png` | 34×34 | 557 | 14 | `CmdBtnAssault`（恒灰）、`CmdBtnRetreat`（不可用） |
| `port.png` | 34×34 | 556 | 14 | `HudPortrait` |
| `msg.png` | 26×26 | 466 | 10 | `MsgBox`、`SettleFrame` |
| `sep.png` | 111×12 | 603 | 0 | `SepTop` / `SepBottom` / `SettleSep`（TILED） |
| 合计 | — | **3603** | — | 12 个节点 |

- 从 `game\web\assets\battleui\` **拷副本**（web 原件一个没动），`hud_assert.mjs` 逐字节比对 **7/7 相同**；
  与 `res\ui\*.png`（另一路 c1-nineslice 放的那 7 张）也同源同字节 —— 直接落在 `res\ui\battle\` 子目录，
  **没覆盖**别人已生成的 `res\ui\slot.png` 等文件（任务要求「已建好就放子目录」）。
- insets 值来自生成器 `work\battleui\_make.py` 的 `MID = 6`（inset + 6 + inset，中心透明），也就是 web 的
  `border-image` slice 值，不是 border 宽度；运行期由 `applyFrames()` 写到 `SpriteFrame.insetLeft/Right/Top/Bottom`
  （`BattleHud.ts:460-472`），**不依赖 `.meta` 里的 border 字段**（仓库里 png 的 `.meta` 只有 texture 子资源，
  frame 是 `ArtLayer.loadFrame()` 手工包的）。
- 8 个 `.meta`（1 个目录 + 7 张图）是本轮手写的：uuid 全新，字段格式抄 `res\ui\slot.png.meta`（`importer:"image"`,
  `subMetas.6c48a` texture, `userData.hasAlpha:true`）。**没有任何地方按 uuid 引用这些图**（全靠 `bundle.load('ui/battle/xxx')`
  按路径取），所以 Creator 重新导入、换 uuid 都不会破；如果 lead 不想保留手写 meta，**删掉这 8 个 `.meta` 让它自己生成即可**。

### SLICED / TILED（引擎源码依据）

- 6 张边框图用 `Sprite.Type.SLICED` + `sizeMode = CUSTOM`（`BattleHud.ts:496-500`）。CUSTOM 是必须的：
  `TRIMMED` 会按图集裁剪框重算尺寸，节点给多大都不算数。
- `sep.png` 用 `Sprite.Type.TILED` + inset 0：web 是 `index.html:92` 的 `repeat-x`，**平铺不拉伸**。
  我先放大核过 web 的做法：从 `work\battleui\after.png` 裁 (90,1094)-(740,1120) 放大成
  `work\cocos_battleui\_sep_web.png`，**每 111px 一道接缝，清楚可见** —— 所以要复刻的是平铺而不是拉伸。
  引擎 `cocos\2d\assembler\sprite\tiled.ts` 在 insets 全 0 时按 `hRepeat = 宽/图宽`、`col = ceil(hRepeat)`
  逐块复制整图（末块按余数截断），就是 CSS `repeat-x` 的等价物。
  624/111 = 5.6 块、714/111 = 6.4 块、510/111 = 4.6 块（`ceil` 后 6/7/5 块，末块按余数截断，和 web
  的 `repeat-x` 同一套算法），所以接缝的**相位**可能和 web 差半格，但「每隔一格一道暗缝」的观感一致。
- 为什么不用 SLICED 拉 `sep`：`sliced.ts` 的 `xScale = min(1, 宽/insets和)`，inset 0 时是纯拉伸 ——
  111px 的端头装饰会被横向拉成糊条，和 web 完全不同。

---

## 3 字体层级：`applyTextRole(label, role)`

`BattleHud.ts:85-141`。4 级主层级 + 1 级角标：

| role | fontSize | lineHeight | 描边 | 阴影 | 粗体 | 用在哪 |
|---|---|---|---|---|---|---|
| `hero` | **40** | 58 | **2px** | ✓ | ✓ | 結算大字「大 勝/敗 走/平 手」、头像「將」 |
| `subtitle` | **22** | 32 | 1px | — | ✓ | 主將名、在陣/撤退、突 擊/撤 退、結算副行、再 戰 |
| `body` | **18** | 26 | — | — | — | 武智行、技能名、結算 6 行標籤、消息首行 |
| `num` | **20** | 28 | 1px | — | ✓ | 結算數值、EXP、頭像 Lv、技能序號、資源條數值 |
| `caption` | 12 | 17 | — | — | — | 技能類別·消耗、消息次行、角標、note、元信息 |

```ts
export function applyTextRole(label: Label, role: TextRole): void {
  const spec = TEXT_ROLES[role];
  label.fontSize = spec.fontSize;
  label.lineHeight = spec.lineHeight;
  label.isBold = spec.bold;
  label.enableOutline = spec.outlineWidth > 0;
  label.outlineWidth = spec.outlineWidth;
  label.outlineColor = OUTLINE_COLOR;      // #06080C α235，与 ArtLayer.addOutline() 默认值一致
  label.enableShadow = spec.shadow;
  if (spec.shadow) {
    label.shadowColor = SHADOW_COLOR;      // 纯黑 α200
    label.shadowOffset = new Vec2(2, -2);
    label.shadowBlur = 4;
  }
}
```

**描边/阴影用的是 3.8 的 `Label` 内建字段，不是 `LabelOutline` / `LabelShadow` 组件** —— 后者自 3.8.2 起
deprecated（引擎 `label-outline.ts` / `label-shadow.ts` 的注释明写 *please use Label.enableOutline /
Label.enableShadow*），`ArtLayer.ts:267 addOutline()` 已经是这套写法。视觉等价：2px 深色描边 + 右下 2px 投影。

数字（`num`）特意给了 1px 描边而不是靠加粗：深底 + 金色九宫框上，纯黑的 20px 数字边缘会糊，加一圈近黑描边
才「透得出来」——这正是任务里「用 LabelOutline 让数字在深底上透得出」那条的落地。

所有 Label 统一 `Overflow.SHRINK` + `enableWrapText = false`（`BattleHud.ts:511-539`）：Cocos 的 `NONE` 会把节点
撑成文字实际宽度并按中心重排，右对齐/定宽的框就失效了（`BattleRoot.makeLabel` 的注释里踩过这个坑）。
SHRINK 只缩小渲染尺寸、不改 `fontSize` 属性，所以字号层级仍是 40/22/20/18/12。

---

## 4 结算面板（对照 web `drawSettle()`）

| 元素 | 几何 | 来源 |
|---|---|---|
| 遮罩 `SettleShade` | 整宽，y 100..1000，`#06080C` α199 | 只盖战场：顶栏兵力条要留着（web 是全屏 overlay，见 §7） |
| 面板底 | `SETTLE_PANEL` 55,120,640,800，圆角 16，`COLORS.panel` α245 + 金边 α184 2px | web `panelAlpha` + `gold .72` |
| 九宫框 `SettleFrame` | `inset(SETTLE_PANEL, 8)` = 63,128,624,784，`msg.png` SLICED | web 面板金边 |
| 大字 | 375,198，hero 40（金/红/白） | web `FONT.hero 64`（**本条是 §7 的 [推测] 重点**） |
| 副行 | 375,238，`大勝 · 用時 16 秒 · 100 擊殺` | `modeName/durationSec/kills` |
| 分隔线 | 120,270,510,12，`sep.png` TILED | web 120..630 / y270 |
| 6 行数据 | y = 316 + i×42；标签 132 左、数值 618 右；偶数行 `(118, y-20, 514, 34)` 白 α8 斑马底 | `SettleResult` |
| 经验条 | 132,600,486,12：轨道 `COLORS.line` + 按比例填 gold | `(exp-expToReach(level))/(next-expToReach(level))` |
| EXP 文本 | 132,630（`num`）/ 618,630 右（`num`） | `EXP n / next`、`距下一級 k` |
| 小字三行 | 375,660 法術擊殺·連勝 / 375,688 `report`（胜负色）/ 375,714 note | 见下 |
| 再战按钮 | `AGAIN_BUTTON` 250,838,250,72，gold 底 + goldLight 2px 边 | web `AGAIN_BUTTON` |

6 行的键和值（`BattleHud.ts:666-673`，与 web 一一对应）：

| # | 键 | 值 | 颜色 |
|---|---|---|---|
| 1 | 敵將等級 | `Lv.5` | text |
| 2 | 戰功 | `+1370` | gold |
| 3 | 經驗 | `+1530` | heal |
| 4 | 功勳 | `+16` | goldLight |
| 5 | 等級 | `Lv.6  (+1)` | 升级时 gold，否则 text |
| 6 | 戰績 | `1 勝 / 0 負` | textDim |

比 web 多出来的两行小字，是为了**不让数字从 HUD 上消失**：`法術擊殺 8 · 連勝 1（最高 3）`（原来在
`labelStatus` 的长句里）、`report`（守城失败时会写「城池失守」）、note（web 原文）。原来那条长句现在缩成
一句「點擊畫面重開 / 點擊返回大地圖」，明细全部由面板承担（`BattleRoot.ts:626-629`）。

---

## 5 接线：`BattleRoot.ts` 只动了 5 处

| 位置 | 改动 |
|---|---|
| `:33` | `import { BattleHud } from './BattleHud';` |
| `:100-105` | 删掉 `labelGeneral` 字段，换成 `private hud: BattleHud \| null = null`（JSDoc 写明它只读 world/settlement） |
| `:379` | `labelStatus` 从 `(375,1308,700,14,居中)` 改成 `(16,1004,360,12,左对齐,SHRINK)` —— 让位给九宫控制台 |
| `:383-386` | `this.hud = new BattleHud(this.node); this.hud.load(() => { if (this.world) this.redraw(); });` |
| `:621-629` | 删掉原来 `if (this.labelGeneral) {…}` 那 16 行，换成 `this.hud.refresh(world, this.settlement, this.launch, this.wiseNote)` + 结算时的一句短状态 |

`:322` 的状态文案也顺手缩短成 `${WEATHER_NAME[weather]} · 30Hz · 點擊畫面重開`（360px 宽放不下长句，
SHRINK 会缩到看不清）。

**保留未动（硬约束）**：

- `:172-184` 的 `settle(this.world)` / `recordBattleResult(...)`、`onTouch()` 点击重开/回大地图；
- `drawUnitSprites()` 的 `Unit_${index}` 精灵池、`GeneralArt` 的三层主将（`GenAHorse/GenABody/GenAWeapon`）、`BattleBg`；
- `BattleHud.ts` 里**没有** `requestRetreat(` / `cast(` / `settle(` / `.settled =`，只 `import` 了 7 个只读查询
  （`QI_MAX/expToReach/magicBySeq/qiCostMul/qiCostOf/qiPowerPercentOf/skillKindOf`）—— 断言脚本按名字逐个卡住。

---

## 6 自证（没构建、没截图，全部算术 + 断言）

1. **tsc**：`cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit`
   → **EXIT=0**（`types\cc.engine.d.ts` reference 到真引擎 3.3MB `cc.d.ts`，所以 `Sprite.Type.TILED`、
   `frame.insetLeft`、`Label.enableOutline`、`label.shadowOffset` 都是真类型在检查，不是手写桩）。
2. **node 断言**：`cd F:\sanguo; node work\cocos_battleui\hud_assert.mjs` → **357/357 通过，EXIT=0**

   | 组 | 条数 | 覆盖 |
   |---|---|---|
   | ① 九宫节点 | 148 | `HUD_ART_SPEC` 12 条逐条：节点存在、`Sprite.type` 是 SLICED/TILED、`sizeMode=CUSTOM`、contentSize 与 rect 相同、已铺 frame、四边 inset 等于表值；再点名 4 技能格 + 2 命令按钮 + `MsgBox` + `HudPortrait` 必须 SLICED、3 条 sep 必须 TILED、`SettleFrame` 必须 SLICED；头像框 86 宽 + 框内「將」/`Lv.` 两个 Label 在 |
   | ② 字体层级 | 85 | 5 个 role 的 fontSize/lineHeight/outlineWidth/shadow/bold 逐字段；`applyTextRole` 真写到 Label（含 `enableOutline`/`outlineWidth`/`enableShadow`/`shadowOffset`）；树里 `SettleTitle=hero`、`GeneralName=subtitle`、`SettleKey1=body`、`SettleVal1=num`、`MsgHint=caption`；所有 Label 都是 SHRINK 且关换行；全树字号只落在 12/18/20/22/40 |
   | ① 控制台状态（战斗中） | 27 | 名字/在陣/武智/三條数值/技能名·类别·消耗/突擊「v2 未接」/撤退「全軍離場」/消息两行/元信息，逐条比对字符串；+ 9 条**对齐**断言（左对齐看框左边、右对齐看框右边、居中看中心：GeneralName 116 / GeneralState 366 / GeneralStats 116 / HpValue 358 / SkillIndex1 124 / MsgLine1 128 / MsgHint 496 / HudMeta 734） |
   | ① 技能格两态 | 6 | `mp=25` 时旋龍(22)/伏兵(21) 可用 → `slot.png`，半月斬(26)/神鬼(47) 不可用 → `slot_off.png`；撤退可下 → `cmd_on.png`，突擊恒 `cmd_off.png` |
   | ③ 结算面板 | 38 | 6 行键值、EXP 两条、`法術擊殺·連勝` 小字、`report`、note、再战两行、`SettleLayer.active`、`HudConsole` 透明度 41、`SettleArt` 的 roundRect/fill/stroke 条数；再 `refresh(world, null)` 验证回战斗态（inactive + 255）；6 行 + EXP 两条 + 标题/note 的左右落位（132 左 / 618 右 / 375 居中） |
   | ④ 防回归 | 21 | `new GeneralArt()` 后 `GenAHorse/GenABody/GenAWeapon`（+ B 侧三个）六个节点都在；`BattleRoot.ts` 代码级：`this.hud = new BattleHud(this.node)`、`this.hud.refresh(...)`、无 `labelGeneral`、`Unit_${index}` 在、`settle(this.world)`/`recordBattleResult(` 未动、无 `requestRetreat(`/`cast(`；`BattleHud.ts` 代码级：无写判定、core 只 import 那 7 个只读名字 |
   | ① 素材 | 32 | 7 张与 `game\web\assets\battleui` 逐字节相同（7/7）、合计 ≤4KB（实测 3603B）、`battle.meta` 在 |

   断言跑的是**真源码**：`hud_assert.mjs` 用仓库自带的 `game\node_modules\typescript` 现场 `ts.createProgram`
   把 `BattleHud.ts` + `GeneralArt.ts` 编到 `work\cocos_battleui\.build\`（23 个 js），再用
   `work\cocos_battleui\mock\cc\index.cjs`（手写 mock：Node/UITransform/UIOpacity/Label/Sprite/SpriteFrame/
   Graphics 记录 ops/Vec2/Color + Proxy 兜底）建出**真实的 HUD 树**遍历，不是另抄一份逻辑。
3. 过程中修掉的两个真 bug（记录在此，避免下次重踩）：
   - **对齐错位**：`makeLabel(..., x, width, 'left')` 里的 `x` 是**框的边**，但锚点是 0.5，`placeOn()` 把它当中心用
     —— 368 宽的 `MsgLine1` 会从 x=-56 开始（左半行飞出屏幕）、340 宽的 `HudMeta` 会到 x=904（右边被裁）、
     `SettleKey*` 从 22 开始而不是 132。修法：`centerX = left ? x + w/2 : right ? x - w/2 : x`（`BattleHud.ts:526`），
     并把这 17 条对齐断言固化进脚本（上面的「对齐」两行）。
   - 断言脚本自己的坑：tsc 在 `game\node_modules` 而不是仓库根；`build()` 必须早于产物 require；
     `program.emit()` 的 `emittedFiles` 是 undefined（得自己递归数 .js）；`labelGeneral` / `requestRetreat()` /
     `cast()` 只出现在注释里 → 必须先做**字符串感知**的去注释（`'載入 data/*.json'` 里的 `/*` 会把后面 6000 字符
     代码当注释吃掉，普通正则不行）；`settled =` 会误伤 `const settled =` → 改 `\.settled\s*=`；
     `import \{([\s\S]*?)\} from './core/battle'` 会跨过 `cc` 的 import → 改 `[^}]*`；`checkEdge` 一开始只累加
     节点自己的 x，忘了技能格里的字是 `SkillSlotN` 的子节点（父节点在格子中心）→ 改成逐级累加。

---

## 7 `[推测]`：Cocos 与浏览器在字号/描边上的视觉差（没截图，皆为推算）

1. **大字字号 40 vs web 64（差最多的一处）**：任务给的字级表是「大标题 40px」，web `drawSettle()` 用的是
   `FONT.hero = 64`。40px 在 640 宽的面板里只占 1/16，`敗 走` 两个字的冲击力会比 web 弱不少。
   这是**按任务表做的**，若 lead 看截图觉得小，改 `TEXT_ROLES.hero.fontSize` 一个数即可（56/64），
   lineHeight 同步 58→80，其它代码不用动。
2. **描边的外扩方向**：Cocos `enableOutline` 是沿字形轮廓**向外**画 `outlineWidth` 像素（并参与 SHRINK 的
   可用宽度计算）；web 那边是 `text-shadow` 叠影，视觉上更「柔」。所以 40px 大字在 Cocos 里看起来会比 web
   的 64px + shadow 更「硬」、更小一圈。数字的 1px 描边同理：深底上会更清晰，但也更「锐」。
3. **SHRINK 的副作用**：web 长句会换行/截断，Cocos 这里统一 SHRINK —— 文字超出框宽时**整体缩小**。消息栏首行
   368px @18px ≈ 20 个汉字，`援軍自鄰城出發，N 刻後抵達（M 人）` 这类 20+ 字的 log 会缩到 ~90%，
   字号层级里它仍是 body 18。若截图觉得挤，把 `MsgLine1` 宽度放到 `MESSAGE_BOX.w - 12` 或手工折两行。
4. **TILED 的接缝位置**：web 是 111px 定距平铺，Cocos 的 tiled 汇编器按整格复制、末格按余数截断，
   两边都是 6/7/5 块，但接缝相位可能差半格；首尾两端的装饰是完整的，中间每格重复一次端头纹样 ——
   和 web 的观感相同（web 也是 repeat-x 重复整图）。
5. **数字与文字的基线**：web 是 canvas 直接按坐标画文字，Cocos Label 用 `lineHeight` ≈ 1.4× 字号
   （40→58、22→32、20→28、18→26、12→17）+ `VerticalAlign.CENTER`。理论上居中，但中文字体（Noto Sans SC
   在真机上可能回落到系统字体）的 ascent/descent 不同，可能整体偏上/偏下 1~2px。这类偏差只能靠截图看。
6. **斑马行的 α**：web 是 `rgba(255,255,255,.022)`，我用 α8/255 ≈ .031，比 web 略强一点点 —— 因为 Cocos 的
   Label 压在上面时没有 web 的抗锯齿混色，α8 是「能看见但不像色块」的下限。若截图显得脏，改
   `paintSettlementArt()` 里那个 `alpha` 到 5。
7. **结算遮罩只盖 100..1000**：web 是全屏 `overlay` + 面板，我留了顶栏（`SettleShade` 从 y100 开始）。
   理由：顶栏的兵力条/時間/主将名是本局结果的一部分（`0/100` 对 `92/100`），盖掉就看不到战果了；
   但这是**主动偏离** web，若要严格对齐，把 `shade.rect(0, HALF_H-100-900, …)` 那行改成整屏即可（1 行）。

---

## 8 没做到 / 需要 lead 收尾

1. **不能构建、不能截图**：构建归 lead，本报告所有「通过」都是 tsc + node 断言 + 尺寸算术，**没有任何截图**。
   第一张截图重点看四件事：①技能格 88×88 里 4 行字是否压框（`SkillCost` 在 y+78，格子只有 88 高）；
   ②`SepTop/SepBottom` 的平铺接缝是否刺眼；③「將」+ `Lv.` 在 86×108 框里的位置；④结算大字 40px 的大小。
2. **技能格 / 命令按钮 / 再战按钮都还没接点击**：Cocos 里既没有 `cast()` 调用点也没有 `requestRetreat()` 调用点，
   我是按「只读、只改节点/文案」的硬约束做的**纯展示**。接线需要 `BattleRoot.onTouch` 里做命中测试并调用
   `cast(world, …)` / `requestRetreat(world, 'A')` —— 那已经进入判定语义（要处理目标选择/右键取消/气力扣除），
   建议单独一轮，由 lead 定。
3. **头像框里没有立绘**：`res/face/*` 的立绘还没接进战斗页，框里现在是「將」+ `Lv.6` 两个 Label 叠在 `port.png` 上。
   接立绘只需给 `HudPortrait` 加一个 `ArtSprite`（`res/face/<名字>`），框和字都不用改。
4. **素材重复 3.6KB**：这 7 张和另一路 c1-nineslice 放进 `res\ui\` 的完全相同（同 SHA256）。我按要求放在
   `res\ui\battle\`，若 lead 想省这 3.6KB，把 `BattleHud.ts:148` 的 `HUD_UI_DIR` 改成 `'ui'` 就行
   （insets 表已经在代码里，不依赖 `.meta`；`UiSkin.ts` 也可以直接替换掉我的 `loadFrame` 这一段）。
5. **`.meta` 是手写的**（7 图 + 1 目录）：uuid 全新、格式抄现有文件，但不排除 Creator 首次导入时重写。
   代码只按路径取图，所以**重写不影响运行**；如果导入日志报 meta 不合法，删掉这 8 个文件重新导入即可。
6. **体积**：bundle 只多了 3603B 的 png（`.meta` 不进包），主包/分包 19.35/20 MB 的数字不变；没有加大图。
