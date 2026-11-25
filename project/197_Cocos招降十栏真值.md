# 197 Cocos 招降十欄真值（接 web `surFields()` 口径）

日期：2026-11-25 · 子 agent：r1-cocos-sur-fields
任务：把 Cocos 招降面板里那 7 个恒灰「—」的欄位接上真值，口径与 web 完全一致。

## 0. 一句话结论

七欄全部接上了取值链路（等級 / 士氣 / 疲勞 / 武器 / 物品 / 勝場數 / 敗場數），
**有记录显真值、无记录显灰「—」**，与 web `campaign.html` 的 `surFields()` 逐行同口径；
「士氣/疲勞的战后落账」在 Cocos 侧没有干净的钩子，本轮只做「能读就显示」，
缺口与原因写在 §6，没有硬塞假数据。

## 1. 欄位来源对照（原作 ↔ web ↔ Cocos）

| 欄位 | 原作（反汇编） | web 真源（唯一标准） | Cocos 存档键 | Cocos 读函数 |
|---|---|---|---|---|
| 等級 | —（本作新增欄） | `generalLevelOf()`：`LEVEL_OVERRIDE` → `save.generalLevel[name]` → `scenarioLevelOf()`（`campaign.html:1624-1629`） | `save.generalLevel[name]` | `core/roster.ts:574 generalLevelOf()`（**只读存档**，见 §6-2） |
| 士氣 | `[g+0x38]`，面板 `0x44F222` | `save.morale[name]`，`hasOwnProperty` 才取（`campaign.html:722-745` + `surFields` 4897-4915；`moraleOf` 的缺省 60 **不**用于面板） | `save.morale[name]`（v3 新键，`GameState.ts:119` / `:480`） | `core/roster.ts:534 moraleOf()`，无记录 **null** |
| 疲勞 | `[g+0x3A]`，面板 `0x44F25F` | `save.tire[name]`，同上（`campaign.html:630-643`） | `save.tire[name]`（`GameState.ts:121` / `:481`） | `core/roster.ts:542 tireOf()`，无记录 **null** |
| 武力 | —（`STR`，卡上原有） | `c.str` | `generals.json` 静态表 | `core/roster.ts:479 statOf()`（原有） |
| 智力 | —（`INT`） | `c.int` | 同上 | 同上 |
| 忠誠 | —（`Loyal`） | `c.loyal \|\| row.Loyal` | 同上 | 同上（`clamp(Loyal-(10-CONSTANCY)*2,0,99)`） |
| 武器 | —（本作新增欄） | `equipNamesOf().weapon \|\| row.Weapon`（`campaign.html:1710-1726` + `saves.js:701-762`） | `save.equip[name].weapon` → 回落 `save.weapon[name]` → 回落 `generals.json` 的 `Weapon` | `core/roster.ts:556 equipNamesOf()` + `:594 surrenderCardExtras()` |
| 物品 | —（本作新增欄） | `eq.book \|\| eq.amulet \|\| row.Thing` | `save.equip[name].book/amulet` → 回落 `save.thing[name]` → 回落静态 `Thing` | 同上 |
| 勝場數 | `[g+0x9F]`，面板 `0x44F3BE` | `Saves.generalRecordOf(save,name).w`，无记录 **null**（`saves.js:879-884`） | `save.generalRecord[name].w`（`GameState.ts:123` / `:482`） | `core/roster.ts:491 generalRecordOf()` |
| 敗場數 | `[g+0xA1]`，面板 `0x44F3FE` | `rec ? rec.l : 0` **+ `lossNow`**，`(rec \|\| lossNow)` 才显（`campaign.html:5087-5095` / `surFields` 覆蓋段） | 同上 `.l` + 本场 | `SurrenderPanel.ts:141-153`（`lossNow = view.lossNow ? 1 : 0`） |

原作胜负按武将持久化：累加 `0x4084C9`、写档 `0x431A7A`→`+0xC7`、读档 `0x43348B`（见 `project/196_招降字段真值.md`）；
本作等价物就是 `save.generalRecord`（web v3 可选键，上限 `GENERAL_RECORD_MAX = 9999`）。

## 2. 改动清单（只碰了允许的 4 个文件）

### 2.1 `game/cocos/assets/scripts/core/roster.ts`（纯 core，无 cc）
- `:360` `export interface SurrenderCardExtras { level?; morale?; tire?; wins?; losses?; weapon?; item? }`
  —— 每项 doc 标明对应原作偏移；规矩写在接口注释里「存档没有就不填，不拿 0/60 冒充」。
- `:378` `export interface SurrenderCard extends SurrenderCardExtras`（原有 13 个字段不变）。
- `:422` `GENERAL_RECORD_MAX = 9999`（与 web `saves.js` 同名同值）。
- `:491 generalRecordOf(save,name): GeneralRecordRow | null` —— `hasOwnProperty`，**无记录 null**（不是 0 勝 0 敗）。
- `:511 noteGeneralResult(save,name,won)` —— `won === true` → `w+1`，`false` → `l+1`，夹 `0..9999`；
  `won` 非布尔 / 名字空 → 返回 `null` 且**不写档**；只写 `save.generalRecord` 一个键（web `saves.js:896-909` 同口径）。
- `:534 moraleOf` / `:542 tireOf` —— `hasKey` 才取，0..100，**无记录 null**（不用 web `moraleOf` 的缺省 60）。
- `:556 equipNamesOf(save,name): {weapon,horse,book,amulet}` —— `save.equip[name][slot]` 优先，
  回落 `save.weapon/horse/thing`（`book ← thing`），空槽返回 `''`（与 web 一致，空串不算有值）。
- `:574 generalLevelOf(save,name)` —— 只读 `save.generalLevel[name]`，≥1 上限 99。
- `:594 surrenderCardExtras(save,data,name)` —— 组装卡片可选字段：
  武器 = `equip.weapon || 静态 Weapon`，物品 = `book || amulet || 静态 Thing`，取不到就不写这个键。
- `:734 cardOf(data,name,from,save)` / `:783 kingCardOf(data,name,save)` / `:816 surrenderCandidates()`
  —— 三处都改成把 `save` 传下去，卡片末尾 `...surrenderCardExtras(save, data, name)`。

### 2.2 `game/cocos/assets/scripts/SurrenderModel.ts`
- `:27` 值 import 增加 `noteGeneralResult`；`:28` type import 增加 `SurrenderCardExtras`。
- `:90` `export interface SurrenderView extends SurrenderCardExtras` + 新字段 `lossNow: boolean`（web `surBattleReal`）。
- `:122` `SurrenderCtxOpts.battle?: boolean` / `:143` `SurrenderCtx.battle?: boolean`
  —— doc 写明「缺省 true；只有手工 mock state 才是 false」。
- `:286 contextOf()` 返回 `battle: opts.battle !== false`（真实路径恒 true，`openOf()/stateOf()` 不用改）。
- `:382 viewOf()` 返回对象带上 `level/morale/tire/wins/losses/weapon/item` 与 `lossNow: state.ctx.battle === true`。
- `:561 finishOf()`：`box.lastPost` 之后、`state.done = true` 的既有结算钩子里加落账
  （`:598-604`）：
  ```ts
  if (state.ctx.battle === true) {
    for (const card of state.cards) noteGeneralResult(state.ctx.save, card.name, false);
  }
  ```
  与 web `campaign.html:5087-5095` 一致：**每张卡（含君主）+1 败**，落账在写 `lastPost` 后、`persistSave()` 前。

### 2.3 `game/cocos/assets/scripts/SurrenderPanel.ts`
- `:118 cellNum(value: number | null | undefined)`；`:124 cellText(value: string | null | undefined)`
  —— 空串 / `'---'` / `'—'` 一律算「没有」。
- `:140 surFieldCells(view)` 重写成 web 公式（十项顺序不变）：
  ```ts
  const lossNow = view.lossNow === true ? 1 : 0;
  const hasRecord = view.wins !== undefined || view.losses !== undefined;
  ...
  { key: '等級',   value: cellNum(view.level) },
  { key: '士氣',   value: cellNum(view.morale) },
  { key: '疲勞',   value: cellNum(view.tire) },
  { key: '武器',   value: cellText(view.weapon) },
  { key: '物品',   value: cellText(view.item) },
  { key: '勝場數', value: cellNum(view.wins) },
  { key: '敗場數', value: hasRecord || lossNow ? cellNum((view.losses ?? 0) + lossNow) : null },
  ```
- 画法没动：`:699` 取 cells，`:706-707` `valLabel.string = cell.value ?? '—'`、
  `color = cell.value === null ? COLORS.textFaint : COLORS.text`（灰/正常两色原本就绪）。

### 2.4 `game/cocos/assets/scripts/GameState.ts`
- `:14` `import { GENERAL_RECORD_MAX } from './core/roster';`（无循环依赖：roster → capture → types/battle(type)）。
- `:86` `export interface GeneralRecordRow { w: number; l: number }`；`CampaignSave` 新增 8 个可选键（各带 doc）：
  `morale?`（:119）、`tire?`（:121）、`generalRecord?`（:123）、`generalLevel?`（:125）、
  `equip?`（:127）、`weapon?` / `horse?` / `thing?`（legacy 三槽镜像）。
- `:361-420` 新增 4 个清洗器（把 web `saves.js` 的 normalize 语义搬过来）：
  `intMapOf(raw,lo,hi)`（布尔/空串/非数丢，空表 → undefined）、`textMapOf(raw)`、
  `generalRecordMapOf(raw)`（缺 `w`/`l` 按 0，坏行丢）、`equipMapOf(raw)`（只收非空字符串行）。
- `:480-487` `normalize()` 里逐键清洗（先占位挡住 `SAVE_V3` 把坏形状原样搬回来）。
- `:349` `R197_TABLES` + `:499` 末尾 `delete` 掉清洗后仍为 `undefined` 的键
  —— 保证旧档不会凭空多出 `'morale' in save === true`。

## 3. 验收证据

### 3.1 类型检查（exit 0）
```
cd F:\sanguo\game\cocos; npm.cmd exec -- tsc -p tsconfig.check.json --noEmit
TSC_EXIT=0
```
（无任何输出，即无错。）

### 3.2 `node work\cocos_hud2\hud_assert.mjs` → 108 条全过（未退化）
```
  7 招降面板十欄（web surFields 同序，拿不到的灰「—」） 24 条
断言总数 108 · 通过 108 · 失败 0（分组合计一致）
全部通过 ✔
```
另用**新构建**（本轮改动）再跑同一支断言（`PAGE_URL=http://127.0.0.1:5273/... MATCH=5273`）：
同样 `断言总数 108 · 通过 108 · 失败 0 / 全部通过 ✔`
—— 说明接真值后 hud 那套「手工假 state（空存档、无 battle 旗标）」仍然全灰，没有污染。

### 3.3 `node work\cocos_sur\assert_sur.mjs` → 94 条全过
```
── 0. 编译 assets/scripts → _sim（tsc -p tsconfig.sim.json）
   tsc exit=0（无输出即无错）
...
   [有记录] 卡0 張遼：等級 12 · 士氣 88 · 疲勞 41 · 武力 92 · 智力 78 · 忠誠 40 · 武器 古錠刀 · 物品 孫子兵法 · 勝場數 7 · 敗場數 4
   [有记录] 卡1 程昱：等級 —(灰#65707C) · 士氣 —(灰#65707C) · 疲勞 —(灰#65707C) · 武力 62 · 智力 90 · 忠誠 10 · 武器 短弓 · 物品 —(灰#65707C) · 勝場數 —(灰#65707C) · 敗場數 1
   [无记录] 卡0 張遼：等級 —(灰#65707C) · 士氣 —(灰#65707C) · 疲勞 —(灰#65707C) · 武力 92 · 智力 78 · 忠誠 40 · 武器 —(灰#65707C) · 物品 —(灰#65707C) · 勝場數 —(灰#65707C) · 敗場數 —(灰#65707C)
断言 94 条，失败 0 条
全部通过 ✓
```
覆盖 A 存档读写 / B `noteGeneralResult` 落账与夹取 / C `surrenderCandidates()` 卡片带真值 /
D `viewOf()` 透传 + `lossNow` + `finishOf()` 每卡 +1 败 / E `surFieldCells()` 十项顺序与取值 /
F 面板真节点 `SurFieldV{i}_{k}` 实测（有记录显数字、无记录显「—」、weapon 有值显武器名、灰 #65707C 与真值 #E9E4D8）。
完整日志：`work/cocos_sur/assert_sur.log`（stderr 里那堆 `mock 缺資源` 是 headless mock 没有美术资源，无害，exit 0）。

### 3.4 截图（876×1368，`Page.bringToFront` + `getTotalFrames()` 在涨）
- `F:\sanguo\work\cocos_sur\surrender_fields.png`（392,660 B，876×1368）——有记录：十欄真值
- `F:\sanguo\work\cocos_sur\surrender_grey.png`（388,764 B，876×1368）——无记录：七欄灰「—」

帧计数（截图前实测，证明没停在后台 rAF）：
```
frames@fields 1167 → 1228 OK（在涨）
frames@fields-shot 1292 → 1352 OK（在涨）
frames@grey-shot 1431 → 1491 OK（在涨）
```
每张卡的十欄实测（CDP 直接读 `SurFieldV{i}_{k}`/`SurFieldK{i}_{k}` Label）：
```
卡 夏侯淵 等級 12 · 士氣 88 · 疲勞 41 · 武力 91 · 智力 78 · 忠誠 44 · 武器 古錠刀 · 物品 孫子兵法 · 勝場數 7 · 敗場數 4
卡 張郃   等級 —(灰) · 士氣 —(灰) · 疲勞 —(灰) · 武力 88 · 智力 76 · 忠誠 61 · 武器 短弓 · 物品 —(灰) · 勝場數 —(灰) · 敗場數 1
卡 高覽   等級 —(灰) · 士氣 —(灰) · 疲勞 —(灰) · 武力 80 · 智力 62 · 忠誠 12 · 武器 —(灰) · 物品 —(灰) · 勝場數 —(灰) · 敗場數 1
卡 袁紹   等級 —(灰) · 士氣 —(灰) · 疲勞 —(灰) · 武力 61 · 智力 70 · 忠誠 100 · 武器 —(灰) · 物品 —(灰) · 勝場數 —(灰) · 敗場數 1
```
（`敗場數 1` 不是编数：这三张卡没有 `generalRecord` 记录，但 `ctx.battle = true`，
按 web `(rec || lossNow) ? (rec ? rec.l : 0) + lossNow : null` 现算 1。灰图 `battle:false` 时它们是「—」。）

复现命令（私有构建 + 私有端口，不碰 `game/cocos-build` 与 5173）：
```
# 构建（注意先清 ELECTRON_RUN_AS_NODE，否则 CocosCreator 退化成 node 秒退）
Remove-Item Env:\ELECTRON_RUN_AS_NODE
Start-Process CocosCreator.exe -ArgumentList '--project','F:/sanguo/game/cocos','--build',
  'platform=web-mobile;debug=false;md5Cache=true;buildPath=F:/sanguo/work/cocos_sur/cocos-build;startScene=0b007000-...'
# 服务
node work\cocos_hud2\serve.mjs F:\sanguo\work\cocos_sur 5273
# 截图
$env:OUTDIR='F:\sanguo\work\cocos_sur'; $env:PAGE_URL='http://127.0.0.1:5273/cocos-build/web-mobile/index.html'
$env:PORT='9345'; $env:PROFILE='F:\sanguo\work\.edgeprof_sur'
node work\cocos_verify\cdpweb.mjs launch
node work\cocos_verify\cdpweb.mjs run work\cocos_sur\steps_sur_shots.mjs
node work\cocos_verify\cdpweb.mjs close
```

## 4. 面板上的判别规则（一句话版）

- 有值 → 数字/名字，颜色 `#E9E4D8`；
- 无值 → 「—」，颜色 `#65707C`（`COLORS.textFaint`）；
- 十欄**全部**由 view 带值，`surFieldCells()` 里再没有硬编码的 `null`；
- 从来没有「缺省 60 士气」「缺省 0 疲劳」「0 勝 0 敗」这种事——
  没有记录就是没有记录，显示上不撒谎。

## 5. 与 web 的逐条对齐（差异说明）

| 点 | web | Cocos | 是否一致 |
|---|---|---|---|
| 无 `generalRecord` 的勝場 | `null` → 「—」 | `null` → 「—」 | ✅ |
| 无记录的敗場 + `lossNow` | `(rec\|\|lossNow) ? (rec?rec.l:0)+lossNow : null` | 同式 | ✅ |
| 士氣缺省 | `moraleOf` 缺省 60，但面板只在 `hasOwnProperty` 时取值 | `moraleOf` 直接返回 `null` | ✅（面板口径一致） |
| 疲勞缺省 | `tireOf` 缺省 0，面板同上 | 返回 `null` | ✅ |
| 裝備空槽 | `equipNamesOf` 返回 `''` | 同 | ✅ |
| `noteGeneralResult` | 只写 `generalRecord`，夹 9999，`won` 非布尔不写 | 同 | ✅ |
| 等級回落劇本等級 | 有 `scenarioLevelOf` | 无 | ⚠️ 见 §6-2 |
| 戰後回寫士氣/疲勞 | `main.js:930-982` 回寫雙方主將 | 无 | ❌ 见 §6-1 |
| 物品面板 → 戰役存檔裝備同步 | `syncEquipFromBag()` | 无 | ❌ 见 §6-3 |

## 6. 仍会是「—」的项及原因（没做到的部分，诚实清单）

1. **士氣 / 疲勞的战后落账（最大缺口）**
   Cocos 的 `core/battle.ts settle()` 其实已经算好了双方士气/疲劳
   （`morale: {A,B}`、`tire: {A,B}`、`tireGain`、`tireAdded`，`battle.ts:3240-3361`），
   但唯一战后结算钩子 `GameState.recordBattleResult(city, winner, armyId?, defend, record?)`
   （`GameState.ts:852-884`）只收到 `BattleRecord`，**没有 settle 结果、也没有双方主将名**
   （`armyId` 只能反查我方主将）。硬塞会失真（把别人的士气算到他头上），所以本轮**没有**落账。
   ⇒ 目前只有在存档里已经有 `save.morale[name]` / `save.tire[name]` 时（人工种值 / 从 web 档导入）
   面板才显真值；Cocos 原生对局里这两欄仍显示「—」。
   修法（下一轮）：让 `BattleRoot` 把 `settle()` 的 `morale/tire` 与双方主将名一起传给一个新入口，
   在 `GameState` 里按 web `main.js:930-982` 的 `writeBackCampaign()` 语义回写。
   （`BattleRoot.ts` 在禁改清单里，本轮不能动。）

2. **等級**
   Cocos 没有升级系统/`generalLevel` 写入口，也没有 web 的 `scenarioLevelOf` 回落
   （`campaign.html:1624-1629`）。且「回落剧本等级」会让**没有记录**的将也有数字，
   与「无记录显『—』」的口径冲突、会把 hud 108 打红。⇒ 只有存档带 `save.generalLevel[name]` 时显真值，
   否则「—」。若将来要接劇本等级，应作为独立议题（先定口径再动）。

3. **武器 / 物品**
   Cocos 有**独立**的物品存档（`ItemsPanel.ts` 的 `{ equip: { 名: { 槽: seq } }, bag, gen }`，
   与战役存档分开），但没有 web `syncEquipFromBag()`（`campaign.html:1758-1776`）那种
   「物品面板 → 战役存档」同步钩子。⇒ 玩家在物品面板装的装备不会自动出现在招降面板，
   只有 `save.equip` / `save.weapon` / `save.horse` / `save.thing` 有值（或 `generals.json` 静态 `Weapon/Thing`）时才显。
   静态表兜底是照 web `row.Weapon` / `row.Thing` 做的，所以多数武将至少能显一件「初始装备」。

4. **敗場數的 `+1`（lossNow）依赖 `ctx.battle`**
   只有 `SurrenderModel.openOf()/contextOf()` 的真实路径是 `true`；
   `work/cocos_hud2/steps_hud_dump.mjs` 那种手工拼的 state 不带这个键 ⇒ 显示「—」。
   这是**有意**的（否则 hud 的「七欄全 —」断言会红）：手工 mock 不该凭空多一场败。

5. **截图用的是假 state**
   真 state 需要真存档 + `GameData` + 真实战后流程，在战斗场景里造不出来。
   两张图是 `panel.open(假state)` 打开的真组件，走的是**同一套** `SurrenderPanel` / `SurrenderModel` 取值链路；
   卡片上的 `level/morale/...` 就是 `SurrenderCard` 的可选字段。数值链路有 headless 断言（§3.3）交叉验证。

6. **构建产物位置**
   本轮构建输出到 `work/cocos_sur/cocos-build`（`game/cocos-build` 由 lead 统一重建，没动）；
   静态服务起在 **5273**——5271 当时被别的进程（PID 123232，不是我的）占着，
   我第一次起的 5271 服务随父 shell 退出被杀，随后端口被别人占用，
   一度让我对着**旧构建**截图（十欄全「—」）。换 5273 + 后台 job 后正常。

## 7. 新增/改动的辅助文件（都在 `work/cocos_sur/`，不属于 `game/`）

| 文件 | 作用 |
|---|---|
| `assert_sur.mjs` | 94 条断言（headless，真编译产物 + mock cc） |
| `tsconfig.sim.json` | 把 `assets/scripts` 编到 `_sim/` 供 node 跑 |
| `_sim/` | 编译产物（含 mock `cc`） |
| `steps_sur_shots.mjs` | 两张截图的 CDP 步骤（876×1368、帧校验、假 state） |
| `probe_fields.mjs` | 十欄 Label 逐卡 dump（核对截图用） |
| `surrender_fields.png` / `surrender_grey.png` | 两张验收截图 |
| `assert_sur.log` | 断言原始输出 |
| `cocos-build/` | 本轮私有构建产物 |
