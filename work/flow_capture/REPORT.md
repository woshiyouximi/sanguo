# R208 战报：战后处置归还给胜者（P0「我方被俘却由我方处置」）

- 日期：2026-11-26
- 代号：capture
- 结论：**修好了**。我方胜 → 只出敌方战俘卡；我方败 → 不开面板，我方被俘将由敌方 AI 沿用战斗页已判结果处置（劝降 / 斩首 / 阵亡 / 释放）并落库、逐人写战报；混合战俘只处置敌方。
- 未起浏览器（按 lead 要求）；验证走纯函数测试 + tsc 双配置 + 全量 `node --test` + campaign.html 内联脚本语法检查。

---

## 1. 现状与根因

原 `F:\sanguo\game\web\campaign.html` 的 `settleBattleReturn()` 只用「名单里有没有名字」决定开不开面板：

```js
mine = myGeneralNames();                       // 静态归属 + roster 名单
held = owned.includes(home);
foes = held ? new Set(garrisonNames(home)) : new Set();
cards = surrenderCandidates(save, GDATA, { atCity, mine: [...mine].filter(n=>!foes.has(n)), king });
if (!needSurrenderPanel(cards)) return null;    // 只看 cards.length，没有「胜者门」
```

`main.js:932-937 writeBackCampaign()` **不分胜负**把 `post.captures`（劝降成功）写进 `save.captured`、`post.executed`（斩首）写进 `save.executed`。我方战败时这两个键里装的是**我方**被俘将，于是：

| 战况 | 旧行为 | 根因 |
| --- | --- | --- |
| 守城败 | 面板打开，卡片是**我方**守将 | 城已从 `owned` 移除 → 守将的静态归属跟着城走 → 不在 `mine`；`foes` 为空 → 我方俘将直接进卡池 |
| 攻城败 | 面板打开，卡片可能是**我方**主将 | `home = save.last` 是出征地；若我方主将正好在 `garrisonNames(home)` 里，会被 `foes` 从 `mine` 剔掉 → 当成敌将 |
| 攻城胜 | 面板**空**（反向 bug） | 被攻下的城已进 `owned`，其守将立刻被 `myGeneralNames()` 算成我方 → 敌方俘将被当 `mine` 滤掉；`main.js:927` 又只在 `owned.includes(city)` 时写 `save.last`，此战 `last` 仍是旧城 |

`game/src/core/roster.ts:611-613` 的 `needSurrenderPanel()` 原来只判断 `cards.length > 0`，core 层没有任何「胜者才有处置权」的闸门。

---

## 2. 胜负信号契约（优先 `save.lastBattle`）

生产者：`main.js writeBackCampaign()`（**另一个智能体在改，本任务没碰 main.js**）。形状：

```ts
save.lastBattle = {
  won: boolean,         // 我方是否获胜（战斗页 winner === 'A'）
  defend: boolean,      // 是否守城战（?defend=1）
  city: string,         // 战场城：攻城=目标城，守城=被攻的城
  captured: string[],   // 我方被俘（被劝降成功）——我方败时才有意义
  executed: string[],   // 我方被斩首
  dead: string[],       // 我方阵亡
  joined: string[],     // 我方招降到的敌将（战报用）
  ts: number,           // 写回时刻；同一场战斗的幂等标记，必须 > 0
}
```

读取与兜底（`roster.ts:852-895`）：

1. `readBattleOutcome(save)`：形状校验，`won` 非布尔 → `null`，不抛。
2. `decideBattleWon(save, outcome)`：有 `lastBattle` 直接返回 `won`；没有时兜底：
   - `save.last` 指向的城**不在** `owned` → 我方败（守城丢城）；
   - `save.captured` / `save.executed` 里有人属于 `ourForceNames(save)` → 我方败；
   - 否则按我方胜处理（保持旧行为：只把非我方的人送进面板）。

> 兜底只服务旧档 / 验收探针（`?sur=` 不会写 `lastBattle`）。**新流程不走兜底**。

---

## 3. 改动点（file:line）

### `F:\sanguo\game\src\core\roster.ts`（733 → 1013 行）

| 行 | 改动 |
| --- | --- |
| `roster.ts:60-68` | 新增 `export const ENEMY_HELD = '敵軍'`：`_moved` 哨兵，表示被我方战败后被敌军带走，非死亡，再招降时要摘除 |
| `roster.ts:237-241` | `applyCapturesToRoster()` 摘哨兵条件扩为 `RELEASED \|\| ENEMY_HELD`（敌将再招回来时清掉「敵軍」） |
| `roster.ts:397-404` | `SurrenderOpts` 新增 `won?: boolean`（`false` = 我方败，没有处置权） |
| `roster.ts:595` | `surrenderCandidates()` 首行加胜者门：`if (opts.won === false) return [];` |
| `roster.ts:638-644` | `needSurrenderPanel(cards, opts: { won?: boolean } = {})`：`won === false` 直接 `false`，其余仍看 `cards.length` |
| `roster.ts:767-789` | 新节文件头：说明原作面板是胜者权利、main.js 不分胜负写回、三层胜者门 |
| `roster.ts:852-868` | `readBattleOutcome(save): BattleOutcome \| null` |
| `roster.ts:882-895` | `decideBattleWon(save, outcome?)`（兜底推断） |
| `roster.ts:906-926` | `ourForceNames(save)`：roster 城名单 + `_moved` 落腳城，排除 `DEAD`/`RELEASED`/`ENEMY_HELD`，不靠静态归属 |
| `roster.ts:935-953` | `markEnemyHeld(save, names)`：所有城名单删除 + `_moved='敵軍'`，`DEAD` 跳过，幂等返回新名字 |
| `roster.ts:962-979` | `planAiDisposal(input)`：纯函数，顺序 `captured → executed → dead → released`，同名先到先得，君主排除 |
| `roster.ts:991-1013` | `applyAiDisposal(save, plan)`：recruit→`markEnemyHeld`；execute/dead→`removeFromPools`（`_moved='陣亡'`）；release→只记账不动名单；幂等 |

### `F:\sanguo\game\web\campaign.html`（原 5827 → 5952 行）

| 行 | 改动 |
| --- | --- |
| `campaign.html:535-546` | import 补 `applyAiDisposal, decideBattleWon, ourForceNames, planAiDisposal, readBattleOutcome`（原 `applySurrender/needSurrenderPanel/surrenderCandidates` 不动） |
| `campaign.html:4708-4725` | `settleBattleReturn()` 文件头重写：胜者才有处置权、胜/败两条路径、`lastBattle` 优先级 |
| `campaign.html:4726-4775` | `settleBattleReturn()` 重写：读 `outcome`；`own=Set(ourForceNames)+king`；`home = lastBattle.city（有效）\|\| save.last \|\| owned[0]`；重复处置守卫（`lastPost.ai===true && lastPost.battleTs===outcome.ts`）；`won=decideBattleWon()`，`won===false` → `aiDisposeCaptives()`；胜方路径把 `own` 里的名字从待决队列摘掉（混合战俘 + 旧文案日志），再以 `mine: Array.from(own)` 出卡并 `.filter(c => !own.has(c.name))` 硬过滤，`needSurrenderPanel(cards,{won})` |
| `campaign.html:4777-4785` | `aiDisposeCaptives()` 文件头（沿用已判结果、不重掷、幂等） |
| `campaign.html:4787-4840` | `aiDisposeCaptives({outcome, home, king})`：合并待决队列 + `lastBattle` 名单 → `planAiDisposal` → `applyAiDisposal` → 清 `save.captured`/`save.executed` → 逐人 `pushLog('戰 報：（我方）X 被敵軍…','lost')` + `Saves.noteGeneralResult(false)` → 写 `save.lastPost`（含 `ai:true`, `battleTs`）→ `autosave(); render(); notice()` |
| `campaign.html:4868-4878` | 新增 `uniqNames()`；同时删除已死的 `myGeneralNames()`（原 :4787-4801） |

`finishSurrender()`（`campaign.html:5138` 起）**未改**：它只在胜方面板点完后执行，`save.lastPost` 形状与战报逻辑保持原样。

### 测试与工具

- 新建 `F:\sanguo\game\tests\surrender_side.test.ts`（16 条）
- 新建 `F:\sanguo\work\flow_capture\probe_side.ts`（三例探针）
- 新建 `F:\sanguo\work\flow_capture\extract_inline.mjs`（抽 campaign.html 内联模块）+ 产物 `campaign_inline.mjs`

---

## 4. AI 处置规则（我方败）

沿用战斗页 `capture.ts resolvePostBattle()` 已经算好的结果，**不重新掷骰、不用 `Math.random`/`SangoRng`**（重掷会与 `save.captured`/`save.executed` 的战报打架）：

| 输入（`lastBattle` / 待决队列） | 敌方 AI 处置 | 落库 |
| --- | --- | --- |
| `captured` / `joined` | 劝降成功 | 从所有城名单删除，`_moved[name]='敵軍'`（转投敌营，`rosterOf()` 不再显示；再招降时自动摘哨兵） |
| `executed` | 斩首 | 从所有城名单删除，`_moved[name]='陣亡'`（出池，永不复活） |
| `dead` | 阵亡 | 同上（`_moved='陣亡'`） |
| 其余被俘者 | 释放 | 名单不动（我方将本来就在名单里），只写战报 |

- 优先级：同名先出现的为准（captured → executed → dead → released）；君主（`save.monarch || save.king`）一律排除。
- 确定性：同输入同输出，无随机。
- 日志逐人一条（`kind='lost'`）：
  - `戰 報：（我方）X 被敵軍勸降，已轉投敵營`
  - `戰 報：（我方）X 被敵軍斬首`
  - `戰 報：（我方）X 被敵軍所殺，陣亡`
  - `戰 報：（我方）X 被敵軍釋放，已回本城`
- 同时 `Saves.noteGeneralResult(save,name,false)` 记败场（探针模式不记）。
- 处置完把名字从 `save.captured` / `save.executed` 摘掉——它们是「待处置队列」，不清会重复处理。
- 写 `save.lastPost = { city, joined: [], dead: [...], joinedAll: [], deadAll: [...], escaped: [], released: [...], rejected: [], month, ts, ai: true, battleTs, aiRecruited, aiReleased }`；`lastPost` 现存无任何渲染读取方（只在 `campaign.html:5644` 导出），加字段安全。
- `notice()` 汇总：「我軍戰敗：敵軍處置我軍俘將（勸降 n · 斬首 n · 陣亡 n · 釋放 n）」。

**幂等**：`settleBattleReturn()` 开头 `outcome.ts>0 && save.lastPost.ai===true && Saves.num(save.lastPost.battleTs)===outcome.ts` → 直接返回；刷新/回跳带同一场 `lastBattle` 的存档不会二次处置、二次记战报。

**我方胜**（面板路径）：

- 卡池 `mine = ourForceNames + 君主`，不再用静态归属，所以刚打下的城的敌方守将能正常出卡；
- 出卡后再按 `own` 硬过滤一次，**我方将绝不可能出现在自己的处置面板**（用户 P0 的根因）；
- `home` 取 `lastBattle.city`（战场城），招降的敌将就落在刚打下的城（旧逻辑落 `save.last`，攻城胜时会落到出征地，属于顺手修正）。

---

## 5. 探针复现（真实数据，剧本 id2 / idx1，劉備·平原）

文件：`F:\sanguo\work\flow_capture\probe_side.ts`，运行：

```
cd F:\sanguo\game
node ..\work\flow_capture\probe_side.ts
```

用 `loadData()` + `CM.rosterOf()` 拼真实存档（不用浏览器），同时打印「旧逻辑结果」与「新逻辑结果」：

| 例 | 档 | 旧逻辑 | 新逻辑 |
| --- | --- | --- | --- |
| W 攻城胜 | `owned=[平原,鄴]`, `last=平原`, `captured=[沮授,韓馥]`, `lastBattle.won=true, city=鄴` | home=平原，面板**不开**，卡片 `[]` | home=鄴，面板**开**，卡片 `[沮授, 韓馥]` |
| L1 攻城败 | `owned=[平原]`, `last=平原`, `captured=[關羽]`, `lastBattle.won=false, city=鄴` | 面板**开**，卡片 `[關羽]`（我方将） | 面板**不开**，卡片 `[]` |
| L2 守城败 | `owned=[]`, `captured=[張飛]`, `lastBattle.won=false, city=平原` | 面板**开**，卡片 `[張飛]`（我方将） | 面板**不开**；AI 计划 `[{name:'張飛',action:'recruit'}]`，`_moved['張飛']='敵軍'`，待决队列清空 |

---

## 6. 测试与验证

新增 `F:\sanguo\game\tests\surrender_side.test.ts`，16 条（要求 ≥8）：

1. 我方胜：面板只出敌方战俘（`won:true` 时 `surrenderCandidates` 返回張遼等敌将）；
2. 我方败：`won:false` → `surrenderCandidates` 返回 `[]`、`needSurrenderPanel` 为 `false`；
3. `needSurrenderPanel` 空 / 非空 / 败方三种入参；
4. 混合战俘：`mine` 里的關羽/張飛被剔除，只剩敵将張遼；
5. `lastBattle` 优先于兜底推断（丢城但 `won:true` 仍判胜）；
6. 兜底：`save.last` 城不在 `owned` → 判败；
7. 兜底：待决名单里有 `ourForceNames` 的人 → 判败；
8. 兜底：只有敌将 → 判胜；
9. `readBattleOutcome` 形状校验（坏档 → null；合法档字段齐全）；
10. AI 处置四选一都落在合法集合 `recruit/execute/dead/release`；
11. 确定性（同输入同输出）+ 去重 + 君主排除；
12. `applyAiDisposal` recruit → `_moved='敵軍'` 且幂等；
13. execute / dead → `_moved='陣亡'`；release 不动名单；
14. 再招降时 `applyCapturesToRoster` 摘掉 `敵軍` 哨兵；
15. `ourForceNames` 含名单与 `_moved` 落腳城，排除 `陣亡/釋放/敵軍`；
16. 战败完整接线（AI 处置 + 清队列）可重入（第二次空转）。

命令与结果：

| 命令 | 结果 |
| --- | --- |
| `cd F:\sanguo\game; npm.cmd exec -- tsc --noEmit` | exit 0 |
| `npm.cmd exec -- tsc -p tsconfig.build.json` | exit 0（`dist/core/roster.js` 已含新导出：`readBattleOutcome`/`decideBattleWon`/`ourForceNames`/`markEnemyHeld`/`planAiDisposal`/`applyAiDisposal`） |
| `node --test tests/surrender_side.test.ts` | **16 pass / 0 fail** |
| `npm test`（`node --test tests/*.test.ts`） | **1623 tests / 86 suites / 0 fail**（约 11.4s；含本文件 16 条；总数随并行智能体新增用例会浮动） |
| `node work\flow_capture\extract_inline.mjs` + `node --check campaign_inline.mjs` | exit 0（campaign.html 内联模块语法通过） |

---

## 7. 风险与遗留

1. **依赖生产者**：`save.lastBattle` 由另一个智能体在 `main.js writeBackCampaign()` 补写。合并前 `decideBattleWon()` 走兜底；兜底第 3 条在「攻城失败、且被俘的我方将既不在 roster 名单、也没有 `_moved` 记录」时会误判为胜 → 仍可能开面板。合并后不触发。**上线必须确认 main.js 真的写了 `won` 与 `ts>0`。**
2. **旧档**：没有 `lastBattle` 的存档只能走兜底；上述误判窗口存在，但至少守城败（丢城）与名单内有我方将的档已能正确判败。
3. **`home` 语义变化**：胜利时招降的敌将现在落到 `lastBattle.city`（战场城），不是 `save.last`。攻城胜时这是修正（旧逻辑落到出征地）；守城胜时两者相同。
4. **`_moved='敵軍'` 哨兵**：`city_model.stationedNames()` 会把所有 `_moved` 键算在職、`rosterOf()` 只在落腳城等于查询城时才显示，故哨兵不会让敌将回到我方名单或在野池。Cocos 侧 `game/cocos/assets/scripts/SurrenderModel.ts:230-261 myNamesOf()` 也已核对：值不是 owned 城名会被跳过，不会误用。但**以后任何把 `_moved` 值直接当城名迭代的新代码，都必须处理 `陣亡/釋放/敵軍` 三个哨兵**。
5. **`save.dead` 未写**：main.js 当前不写 `save.dead`；`aiDisposeCaptives()` 只合并 `lastBattle.dead`。若后续 main.js 增加 `save.dead`，需要像 `captured/executed` 一样并入待决并在处置后清空。
6. **战报字段**：`lastPost.ai / battleTs / aiRecruited / aiReleased` 是新增扩展键；`saves.js prepareSnapshot()` 与 `normalizeCampaign()` 都原样保留未知键，已确认不会被存档归一化抹掉。
7. **未同步 Cocos 端**：`game/cocos/assets/scripts/core/roster.ts` 与 `SurrenderModel.ts` 是另一份实现，仍是旧的「按名单开面板」语义（禁止 Cocos 构建，本任务没碰）。若 Cocos 版也要修，需要把同样三层胜者门 + 敌方 AI 处置搬过去。
8. **测试约束**：`tests/rows85.test.ts:177` 会扫非 `//` 开头的行，要求 `settleBattleReturn(` 调用点出现在 `let surState` 之后。该文件附近新增注释/代码时不要把 `settleBattleReturn(` 写在行首（本次已踩坑并改成「上一节的 settleBattleReturn…」）。
9. **未跑浏览器**：按 lead 要求用纯函数验证；`?sur=` / `?surdead=` 验收探针路径未被本改动破坏（它们不写 `lastBattle`，走兜底判胜 → 出卡），但浏览器实机回归仍需另一轮人工确认。

---

## 8. 给 lead 的交接

- 需要确认的唯一外部依赖：`main.js writeBackCampaign()` 落 `save.lastBattle`（含 `won:boolean`、`ts>0`），并在**我方败**时把 `captured`（我方被劝降）/`executed`（我方被斩）/`dead`（我方阵亡）按上方契约填好；`save.captured`/`save.executed` 的既有写法可保持不变（campaign 会自己清队列）。
- 改动文件：`game/src/core/roster.ts`、`game/web/campaign.html`、新建 `game/tests/surrender_side.test.ts`；`main.js` / `battle.ts` 未改。
