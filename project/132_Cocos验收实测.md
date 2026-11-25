# 132 · Cocos 竖版《三国群英传 2》移植 —— 验收实测

- 验收时间：**2026-11-25 10:16 – 10:56（Asia/Shanghai）**，所有数字绑定这段时间的 `web-mobile` 构建。
- 产物：`F:\sanguo\game\cocos-build\web-mobile\index.html`（只读；测试期间未发现产物被替换，但 scene 加载耗时波动极大，见 §5）。
- 驱动：`F:\sanguo\work\cocos_verify\cdp.mjs`（有头 Edge 158.0.4370.33，`--window-size=900,1500`，CDP 9222，注入 `__errs` 探针）。
- 证据目录：`F:\sanguo\work\cocos_accept\`（`steps_*.mjs` 脚本、`r*.json`/`p*.json` 结果、`*.png` 截图、`log_*.txt` 控制台日志）。
- 验收员只读 `game/**`，未修改任何源码；下文 `file:line` 仅为定位。

**一句话结论：标题→剧本→君主→大地图、月推进、内政→出征→编成→战斗、君主阵亡→继承人 这 4 条通；「结算后招降面板」「10 存档槽」「九宫皮肤命中」3 条不通。**

---

## 1. PASS/FAIL 总表

| # | 链路 | 结论 | 关键数字 | 截图 / 证据 |
|---|------|------|----------|-------------|
| 1 | 标题页 → 剧本 → 君主 → 大地图（含 5 张卡文案） | **PASS** | 剧本 5 张（184/189/200/208/219 年，勢力 15/19/9/9/6，均 60 城 · 116 道）；君主页 15 家 · 可选 14 · 8 行/2 页；落地 Campaign month 3 / gold 1336 / owned 2 / cities 60 | `a11_01_title.png` `a11_02_scenario.png` `a11_03_force.png` `a11_04_campaign.png`；`r11.json` |
| 2 | 推进一月（`doAction('advance')`） | **PASS** | 月 1→2，金 1200→1268（+68），`hintText` 命中 `AI 月 報：**13** 個勢力行動`；再推一月 2→3、金 1336，追加「AI 出兵 1 路，來犯：北平。」 | `a2_advance.png`；`r2.json` |
| 3 | 内政 → 出征 → 编成 → 战斗，且玩家可放技能 | **PASS** | Deploy `{home:北平, garrison:141, target:襄平, generals:3, soldiers:100, cap:100, buttons:13}`；Battle `over:false`；`tapSkill(0)` 氣 **70088 → 46088（Δ24000 = qiCost）**、技 **53 → 33（Δ20）**、`lastMessage` = 「命療術：回復 0 點體力。」 | `a3_01_city.png` `a3_02_items.png` `a3_03_deploy_sheet.png` `a3_04_deploy.png` `a3_05_battle.png` `a6_01_skill_qi.png`；`r3.json` |
| 4 | 战斗结束 → 结算 → **招降面板** | **FAIL**（面板本体可用，生产链路不弹） | 结算 `winner:A / endReason:troops / survivors 93:0`；`post.captures=[{閻圃, recruited:false}]` → 回大地图后 `SurrenderPanel` **0 个节点**；dev 钩子塞 `save.captured=['逢紀']` 后弹窗正常（1 卡、成功率 87.0%） | `a4_01_settlement.png`（结算画面）`a6_02_surrender.png`（钩子弹出）；`p2.json`（0 节点）`p8.json` |
| 5 | 标题页「讀取存檔」10 槽，至少 1 槽有数据 | **FAIL** | `已用 0`、10 行全是「空槽 · 可存入目前進度」、`activeSlot:1`；`SaveSlotsPanel` 未实例化；`saveToSlot()` 全库只有 `SaveSlots.ts:765/:775` 自调用 → **玩家没有任何写槽入口** | `a6_05_slots.png`；`p8.json` |
| 6 | 九宫皮肤命中（`ui/` 或 `Skin_` 前缀） | **FAIL** | 四页 `skinNodes=0 / uiFrames=0`；Sprite 总数：大地图 **75**、内政 **92**、物品 **148**、编成 **70**（战斗 121）；所有 `spriteFrame` 均为 `null` | `a6_03_items.png` `a3_04_deploy.png`；`p8.json` `r3.json` |
| 7 | 君主阵亡 → 继承人弹窗 | **PASS**（dev 钩子触发） | `MonarchPanel.sheetKind='succession'`、`isOpen:true`、view `{title:'君主陣亡 · 選繼承人', sub:'勢力 公孫瓚 · 陣亡 嚴綱（1年3月）', rows:2}`、`successionState` 7 键、`hintText` 同步 | `a12_01_succession.png`；`r12.json` |

---

## 2. 逐条证据

### 链路 1 · 标题 → 剧本 → 君主 → 大地图（PASS）

- 标题页 `TitlePanel.debug()`：`{page:'title', buttons:3, rows:0}`，acts `['new','saves','help']`，按钮「開 始 新 局 / 讀 取 存 檔 / 說 明」。
- 剧本页：5 张卡全部同页，`ScCard_i_Name/_Stats/_Opening` 读数为
  - `1. 黃巾之亂` `184 年 · 15 勢力 · 60 城 · 116 條道路`
  - `2. 討伐董卓` `189 年 · 19 勢力 · …`
  - `3. 群雄割據` `200 年 · 9 勢力 · …`
  - `4. 赤壁之戰` `208 年 · 9 勢力 · …`
  - `5. 三國鼎立` `219 年 · 6 勢力 · …`
  - 每张下方 **`地圖前三城：襄平 · 北平 · 代縣`**；摘要卡 `ScSummaryOpen` 同文案。
- 文案改造验收：`舊文案「開局三城」命中 0`，`新文案「地圖前三城」命中 6`（5 卡 + 1 摘要）→ **改名完成**。但 5 张卡的城市完全相同（见问题 P7）。
- 君主页 `debug()`：`{page:'force', scenarioName:'黃巾之亂', forces:15, selectable:14, rows:8, pages:2}`；首行「公孫瓚 · 勢力 公孫瓚 · 起始 1 城 · 城池：北平」。
- 落地：`scene:'Campaign'`，`save {month:3, year:1, gold:1336, owned:['北平','襄平'], wins:1, losses:0}`，`cities:60`，`monarch:'公孫瓚'`，`seat:'北平'`。
  - ⚠ 这里 month 3 / wins 1 是**上一局残留**（见 P5：「開始新局」没有重置）。
  - ⚠ 落地同时会弹一张**假招降卡**（「抓 到 敵 將：公孫瓚 · 我方君主 · 只能逃走」），把刚进的大地图盖住 —— 见 P1b。截图 `a11_04_campaign.png` 就是这一状态（地图在上层被 `SurrenderPanel` 覆盖）。

### 链路 2 · 推进一月（PASS）

`r2.json`（`steps_a2_advance.mjs`）：

| 项 | 推进前 | 第 1 次 `doAction('advance')` | 第 2 次 |
|---|---|---|---|
| month | 1 | **2** | **3** |
| gold | 1200 | **1268（+68）** | **1336（+68）** |
| hintText | — | 「推進一月：稅收 +68 金。**AI 月 報：13 個勢力行動**（劉焉·攻擊ai、張角·攻擊ai、韓馥·攻擊ai、龔景·攻擊ai、喬玄·攻擊ai、何進·攻擊ai、董卓·佔領空城、孫堅·攻擊ai、陶謙·攻擊ai、孔岫·攻擊ai、丁原·攻擊ai、劉繇·攻擊ai、嚴白虎·佔領空城）」 | 追加「AI 出兵 1 路，來犯：北平。」 |

正则 `/AI\s*月\s*報：(\d+)\s*個勢力行動/` 命中，N=13，且 13 条明细与 N 自洽。

### 链路 3 · 内政 → 出征 → 编成 → 战斗 → 放技能（PASS）

1. 大地图点己城 → `CityPanel`（内政）：截图 `a3_01_city.png`；命令含 徵兵/開發/出征/物品。
2. 物品页 `ItemsPanel`（`isOpen:true`）：`a3_02_items.png`。
3. 出征目标 sheet：唯一可打城 `襄平｜無主｜兵 153｜防 377｜將 0`（`a3_03_deploy_sheet.png`）→ 进 `Deploy`。
4. 编成 `DeployRoot`：`home:'北平'`、`garrison:141`、`target:'襄平'`、`generals:['公孫瓚','嚴綱','公孫越']`、`soldiers:100`、`cap:100`、13 个按钮 `gen:0..2 / troop:1 / form:2 / form:4 / wise:0 / slide:0 / quick:0..2 / back / go`（`a3_04_deploy.png`）。
5. 战斗 `BattleRoot`：`hasWorld:true, over:false`，截图 `a3_05_battle.png`（我軍 95/100 vs 敵軍 89/100 張角、關羽 Lv.6 體96 技33 氣44%、技能条 4 格）。
6. **放技能（硬数字）**：`r.input.slots[0] = {seq:1, name:'命療術', qiCost:24000, mpCost:20, kind:'heal'}`；同一次 eval 内 `tapSkill(0)`：

   | | qi | mp | hp |
   |---|---|---|---|
   | before | **70088** | 53 | 96 |
   | after | **46088** | 33 | 96 |
   | Δ | **−24000（=qiCost）** | −20 | 0 |

   `r.lastMessage` = `r.input.message` = **「命療術：回復 0 點體力。」**（含技能名 ✓）；`over` 仍 `false`。
   截图 `a6_01_skill_qi.png`（HUD 顯示「氣 44%」、訊息栏就是这句）。

   > 说明：任务书写的是 `r.world.sides.A.qi`，该字段**不存在**——`World.sides.A` 的自有属性里没有 qi/hp/mp；气力在 `r.world.sides.A.general.qi`（`BattleInput.ts:169-177` 的 `castBlockReason` 就是这么取的）。上面数字走的是 `.general.qi`。

### 链路 4 · 结算 → 招降面板（FAIL：生产链路不弹，面板本体正常）

战前：`BattleRoot.world.launch.from='campaign'`；打完结算（`p2.json`）：

- `winner:'A'`、`endReason:'troops'`、`settled:true`、`survivorsA:93 / survivorsB:0`
- `generalA {hp:117, mp:52, qi:63950, alive:true}`、`generalB {hp:53, mp:3, qi:29600, alive:true}`
- `record {wins:1, losses:0, streak:1, bestStreak:1}`
- **`post`**：`captures:[{name:'閻圃', str:42, int:80, loyal:54, recruited:false}]`、`executed:[]`、`released:[閻圃]`、`kingsEscaped:[]`、`drops:[{itemId:'64', name:'方形陣法之書'}]`
- 结算画面 `a4_01_settlement.png`；点结算相（整屏任意点都是 `restart`）回大地图 → `owned ['北平','襄平']`、wins 1、gold 1336。

回大地图后：`SurrenderPanel present:false`，`__all()` 里 **0 个 Surrender 节点** → **0 候选，面板不出现**（`a4_02_surrender.png`）。

**根因（两段代码，已定位）**：
1. `F:\sanguo\game\cocos\assets\scripts\SurrenderModel.ts:615` —— `if (!name || item?.recruited !== true) continue;`：只有「战前预判招降成功」的俘虏才进 `save.captured`。
2. `F:\sanguo\game\cocos\assets\scripts\core\capture.ts:257-265` —— `let t = constancy>=5?1:constancy>=3?0:-1; if (loser.lordAlive) t += 2; if (t>=2) return {ok:false, chance:0, …'宁死不降（0x10）'}`：閻圃 `CONSTANCY=3` 且其主健在 → 恒 `recruited:false`。
3. 连锁：`hasPending(save)`（`SurrenderModel.ts:635`）为 false → `openOf/stateOf`（`:306/:292`）返 null → `SurrenderPanel.showIfNeeded`（`:175`）**连节点都不建**。

**面板本体没问题**（dev 钩子 `c.save.captured=['逢紀']` + 重进 Campaign，走生产入口 `CampaignRoot.ts:1297`）：
`debug() = {opened:true, cards:1, left:1, pages:1, visible:['逢紀'], buttons:3, hits:6, msg:'剩 1 位待決…', title:'抓 到 敵 將', bulkEnabled:true, canFinish:false, portraitVia:['full','none','none','none','none']}`；卡面「需 再 戰」「武 63 · 智 85 · 忠誠 36 · 義理 2」「本戰擲骰成功：成功率 87.0%（忠誠 36 / 節操 2）」+ 招降/斬首/釋放/剩餘全部/完成（`a6_02_surrender.png`）。

### 链路 5 · 「讀取存檔」10 槽（FAIL）

标题页 acts `['new','saves','help']` → tap `saves` → `page:'saves'`：

- `TitlePanel.debug() = {opened:true, page:'saves', title:'讀 取 存 檔', sub:'共 10 槽 · 已用 0 · 點一行載入', rows:10, buttons:1, activeSlot:1}`
- 10 行文本：`槽 1` … `槽 10`，每行副文 **「空槽 · 可存入目前進度」**；页脚「目前使用中：槽 1」。
- `SaveSlotsPanel` 未实例化（`savePanel:null`）；`SaveRow_i_L1/_L2/_L3` 节点存在但 Label 为空（文本在子节点）。
- 截图 `a6_05_slots.png`。

**0 槽有数据，且没有写入入口**：全库 grep `saveToSlot(` / `SaveSlotsPanel.show`，只有 `SaveSlots.ts:765`（面板内点行）与 `SaveSlots.ts:775`（写当前槽）自己调用，UI 侧 **0 个调用点** → 玩家永远无法产生第二个有数据的槽（首槽也无从写入）。

### 链路 6 · 九宫皮肤命中（FAIL：四页全 0）

`__skin()` 同时统计「节点名以 `Skin_` 开头」与「`cc.Sprite.spriteFrame.name` 含 `ui/`」：

| 页面 | skinNodes（`Skin_` 前缀） | uiFrames（`ui/` 帧名） | Sprite 总数 |
|---|---|---|---|
| 大地图 Campaign | **0** | **0** | 75 |
| 内政 CityPanel | **0** | **0** | 92 |
| 物品 ItemsPanel | **0** | **0** | 148 |
| 编成 Deploy | **0** | **0** | 70 |
| （战斗 Battle） | 0 | 0 | 121 |

进一步：**所有** `cc.Sprite` 的 `spriteFrame` 都是 `null`（`frameNames` 全是 `节点名[null]`，连 `CampaignMapImage`、`CityIcon_襄平…` 也是）→ 这一版构建里地图片/图标/九宫皮肤**一张都没套上**。

两个原因：
1. 资源加载失败（控制台）：`assets/res/import/7c/7c7e2207-2d07-4216-87a0-19070d5c7388.a2533.json`、`assets/main/import/0c/0ca3d000-…0002.45f23.json` 404，并伴随 `[UiSkin] 皮肤「plate_sel」加载失败（ui/plate_sel），降级 Graphics 描边`。
2. 命名口径不一致：`UiSkin.ts:426` 建节点名 `Skin_${key}`，而 `DeployRoot.ts:99-104` 的皮肤表用 `SkinCardMain / SkinCardGen / SkinCardTroop / SkinCardForm / SkinCardWise / SkinCardPower` 等**无下划线**名称 → 按任务口径统计必为 0。

### 链路 7 · 君主阵亡 → 继承人弹窗（PASS，dev 钩子）

触发方式（等价于「君主所在城失守」）：`c.monarchState.monarch='嚴綱'`、`c.monarchSeat='易京'`（非己方城）→ `c.checkMonarchDeath()`，900 ms 后读面板。

- `detectMonarchDeath()` 判定：`seat='易京'` 不在 `owned`，遍历 `北平/襄平` 的 `major` 都不是 `嚴綱` → 清空 seat、返回 `嚴綱` → `planMonarchDeath` 走 `prompt` 分支。
- **`MonarchPanel.openSuccession(...)` 被调用**（唯一调用点 `CampaignRoot.ts:3205`）：`sheetKind:'succession'`、`isOpen:true`。
- `successionView = {title:'君主陣亡 · 選繼承人', sub:'勢力 公孫瓚 · 陣亡 嚴綱（1年3月）', rows:[公孫越（武65/智46/忠64/駐北平）, 公孫瓚（武86/智70/忠59/駐北平）], hint:'點一位武將立為新君', extinct:false}`。
- `c.successionState` 键：`[phase, force, dead, month, remaining, candidates, officers, selected]`；`hintText` = 「君主陣亡 · 選繼承人：點一位武將立為新君」。
- 截图 `a12_01_succession.png`（面板底部还写着「必須選一位，無法取消」）。

**接得上，不缺调用行。** 但暴露两个毛边：① 招降面板会盖在它上面（P8）；② 候选里出现前任君主本人、且君主卡「即位 第1年1月」与「陣亡（1年3月）」自相矛盾（P9）。

---

## 3. 发现的问题（file:line，只读定位，未改）

| # | 严重度 | 问题 | 位置 | 证据 |
|---|---|---|---|---|
| P1 | **高** | 打赢也永远弹不出招降面板：`queuePostBattle` 只收 `recruited===true`，而节操≥3 且原势力健在的敌将恒「宁死不降」 | `SurrenderModel.ts:615`；`core/capture.ts:257-265`；连锁 `SurrenderModel.ts:635` → `SurrenderPanel.ts:175` | `p2.json`（`recruited:false` → 回图 0 节点） |
| P1b | **高** | **反过来又乱弹**：每次进大地图都会弹一张「抓 到 敵 將：公孫瓚（我方君主）· 君主不可俘（0x40975E）· 只能逃走」的假卡，把地图和继承人面板都盖住。`kingOf(save)` 读 `save.monarch \|\| save.king`，而本移植把君主放在补丁键（`sanguo_monarch_v1`），干净档里 `save.monarch` 为空 → `surrenderCandidates` 的「我方君主不用逃」守卫（`roster.ts:560`）失效；`mine` 又来自 `save.roster`，空档时也是空集 | `CampaignRoot.ts:1297-1302`（只传 `{save,data,home,onDone}`，没传 `king/atCity/mine`）；`SurrenderModel.ts:285-287`（默认值）；`roster.ts:556-562` | `a1_03_campaign.png`、`a11_04_campaign.png`（地图被此卡盖住）；`rp.json`、`p13.json`（`save.monarch='嚴綱'` vs `monarchState.monarch='公孫瓚'`） |
| P2 | **高** | 10 个存档槽没有写入入口（`saveToSlot` 只有面板自调用） | `SaveSlots.ts:381`（导出）、`:602`（`SaveSlotsPanel.show`）、`:765/:775`（唯一调用点）；`TitlePanel.ts:340` 只读 | `p8.json`：`已用 0`、`savePanel:null` |
| P3 | **高** | 九宫皮肤/地图图集全未命中：所有 `cc.Sprite.spriteFrame === null`；且 Deploy 的皮肤节点名不走 `Skin_` 前缀 | `UiSkin.ts:426`（`Skin_${key}`）vs `DeployRoot.ts:99-104`（`SkinCardMain…`）；资源 404 见控制台 `7c7e2207…`、`0ca3d000…` | `p8.json`（四页 0/0，`frameNames` 全 `[null]`） |
| P4 | 中 | 标题页中段信息卡「資料/操作/存檔/聲明」标题与正文**重叠**（正文压在标题上） | `TitlePanel.ts:324-325`：key `cx=-252,w=84`（框 −294..−210）、value `cx=12,w=500`（框 **−238**..262）→ 重叠 28 px | `a11_01_title.png`（「資 料劇本 5 · 城池 60…」「存 檔0 槽 · …」） |
| P5 | 中 | 「開始新局」不重置：同剧本+同君主时 `runKey` 不变 → 直接续上一局（month 3 / 2 城 / 1 胜），与按钮文案不符 | `GameState.ts:363`（`keyChanged = key !== '' && save.runKey !== undefined && save.runKey !== key`） | `r11.json`（点新局后 month:3、owned 2 城、wins 1） |
| P6 | 中 | **出征死路**：占了襄平后 `deployTargets` 为空（北平邻接 `[襄平, 易京]`，易京是关隘被过滤）→ 玩家再也无法出征 | `CityModel.ts:1079-1101`（`deployTargets`）、`:437-446`（`neighboursOf` 只认 `Length < PATH_SENTINEL`）、`:457-459`（`isGate = RATE===0 || POPULATION===0`） | `p5.json`（`sheetRows:[]`）；`p13.json`（残留 AI 军队 易京→北平 100 兵 0%） |
| P7 | 低 | 5 张剧本卡「地圖前三城」全是 `襄平 · 北平 · 代縣`，与剧本无关（取的是地图顺序前三城），信息量为 0；同时每张卡都写「60 城 · 116 條道路」（连 208/219 年剧本也一样） | `SelectModel.ts:110`（`openingCityNames`）、`:175`（`scenarioCard`）、`ScenarioSelect.ts:384-396/:409` | `r11.json`（5 卡 opening 全同）、`a11_02_scenario.png` |
| P8 | 中 | 战后「招降面板」与「继承人面板」可同时存在且**招降在上**，玩家看不到必须二选一的继任界面 | `CampaignRoot.ts:1294`（`checkMonarchDeath`）先于 `:1297`（`SurrenderPanel.showIfNeeded`）建节点，后者 `setSiblingIndex(top)` | `a9_01_succession.png`（此刻 `sheetKind='succession'` 但屏上是「抓 到 敵 將」） |
| P9 | 低 | 继任候选里出现前任君主本人；君主卡写「即位 第1年1月」而阵亡写「1年3月」，同一面板自相矛盾 | `core/roster.ts:527-564`（`surrenderCandidates` 口径）、`CampaignRoot.ts:3186-3187`（`successionOfficers` 传参） | `a12_01_succession.png` |
| P10 | **高**（疑似） | **命療術花 20 MP + 24000 氣，实际治疗 0 点**（體 96/117 明明未满），浮字 `+0`、消息「回復 0 點體力」 | `BattleInput.ts:506-509`（`result.healed ?? 0`）；`core/battle.ts:1931`（`healed = max(0, after.selfHp - before.selfHp)`）；治疗累加点 `core/smartscript/runtime.ts:869`；旁证控制台 `[smartscript] 占位 syscall 0x135（视觉表现未复现）` | `r3.json`/`p8.json`（before hp 96 → after hp 96，qi 扣满）；`a6_01_skill_qi.png` |
| P11 | 低 | 战斗 HUD 露出未实现占位：「突擊 v2 未接」；法术丢出一行 `[smartscript] 占位 syscall 0x135` 警告 | `BattleRoot.ts`（HUD 文案）／smartscript 运行时 | `a6_01_skill_qi.png`、`console_steps_a6_tail.json` |

---

## 4. 「没做到」清单（诚实交代）

1. **招降面板没有在真实战斗里看到**。真实战斗 `recruited:false` → 面板不生成；我只用 dev 钩子（直接写 `save.captured`）证明了面板本体可用。真实链路要等 P1 修完再验。
2. **没有验证「多场战斗/多个俘虏」的分页**：本局占了襄平后无出征目标（P6），无法再刷第二场；面板 `pages` 恒为 1。
3. **没有验证点击「招降/斬首/釋放/完成」后的落盘结果**（`save.owned` 武将池是否真的变化）。只核了面板渲染与 `debug()`。
4. **继承人的「确认继任」没有点完**：只到「弹窗出现 + `openSuccession` 被调用」，没点候选人走 `commitSuccession`（因为盖着招降面板，且要做需要再开一轮）。
5. **没有任何存档/读档往返**：10 槽无写入口，无法制造「至少 1 槽有数据」的前置条件；`loadFromSlot` 未被实测。
6. **九宫皮肤无法在「有资源」的前提下验收**：这一版构建的 `spriteFrame` 全 null（资源 404），所以「命中数=0」既可能是命名/加载 bug，也可能是构建缺资源；我只报了实测数字与两条原因，没定论。
7. **截图存在「旧帧」陷阱**：Cocos 在页面被遮挡/不刷新时，CDP `Page.captureScreenshot` 会拿到上一帧合成结果（`a1_01_scenario.png` 实为标题页、`a9_01/a10_01_succession.png` 实为招降面板）。凡是引用前都核过 `getTotalFrames()` 是否在涨；本报告只引用核实过的图（`a12_01_succession.png` 已确认 783→874 帧、60 fps）。
8. **没有跑移动端真机/横竖屏切换、没有跑无尽月推进（>12 月）的存档**。
9. 「AI 月報」的 13 条明细只做了文本记录，没有逐条与 `runMapAi` 期望对账。
10. **没有一张「干净的大地图主界面」截图**：每次进 Campaign 都会先弹那张假招降卡（P1b），要拍干净图得手动 `SurrenderPanel.node.active=false`；我只在链路 7 里这么干过（为了拍继承人面板）。

---

## 5. 环境备注（影响复现）

- 冷启动 `LoadScene Campaign` 首次 **6050 ms**，之后 12–30 ms；页面重载后 `LoadScene Boot` 可达 **22 s**。脚本必须用「轮询 `c.save.owned`」而不是固定 sleep（`lib_accept.mjs` 的 `waitCampaignReady`）。
- 构建后 `constructor.name` 被压成 `n`，找组件一律用 `c.__classname__`；`cc.Sprite`/`World.sides.A` 等对象上 `Object.keys` 拿不到 qi/hp，必须按已知字段名直取（`r.world.sides.A.` **`.general.qi`**）。
- 场景只有 4 个：`Boot / Campaign / Deploy / Battle`；标题页、剧本页、内政页、物品页都是**面板**，不是独立 scene。
- 浏览器实例会被环境反复杀掉（本次实测中 Edge 崩溃 3 次、`9222` 掉线 2 次）；脚本要能「launch → 立刻 run」，失败就重试。
- 复现命令（PowerShell）：
  ```powershell
  $env:OUTDIR='F:\sanguo\work\cocos_accept'
  cd F:\sanguo\work\cocos_verify
  node cdp.mjs launch
  node cdp.mjs run F:\sanguo\work\cocos_accept\steps_a11_chain.mjs      # 链路 1
  node cdp.mjs run F:\sanguo\work\cocos_accept\steps_a2_advance.mjs     # 链路 2
  node cdp.mjs run F:\sanguo\work\cocos_accept\steps_a3_deploy_battle.mjs  # 链路 3
  node cdp.mjs run F:\sanguo\work\cocos_accept\steps_a4_settle_surrender.mjs # 链路 4
  node cdp.mjs run F:\sanguo\work\cocos_accept\steps_a6_tail.mjs        # 链路 3/4/5/6 取数
  node cdp.mjs run F:\sanguo\work\cocos_accept\steps_a12_succession.mjs # 链路 7
  ```
  ⚠ steps 文件在 `cocos_accept`，`cdp.mjs run` 必须给**绝对路径**，否则报 `Cannot find module`。

---

## 6. 脚本与产物索引（`F:\sanguo\work\cocos_accept\`）

- 脚本：`lib_accept.mjs`（注入 helper `__cn/__comp/__scene/__labels/__skin/__tapAct` + `ensureCampaign/waitCampaignReady`）、`steps_a0_baseline.mjs`、`steps_a0b_reset.mjs`、`steps_a2_advance.mjs`、`steps_a3_deploy_battle.mjs`、`steps_a4_settle_surrender.mjs`、`steps_a6_tail.mjs`、`steps_a8_succession.mjs`、`steps_a11_chain.mjs`、`steps_a12_succession.mjs`、`steps_p1_world.mjs`、`steps_p10_state.mjs`、`steps_p12_root.mjs`、`steps_p13_start.mjs`
- 结果：`r0.json`（基线 localStorage）、`r0b.json`（重置）、`r1_stale_leak.json`（首次链路 1）、`r2.json`（月推进）、`r3.json`（编成/战斗/技能/皮肤）、`p2.json`（结算）、`p8.json`（招降+槽+皮肤）、`r11.json`（链路 1 重跑）、`r12.json`（继承人）
- 截图：`a11_01_title / a11_02_scenario / a11_03_force / a11_04_campaign / a2_advance / a3_01_city / a3_02_items / a3_03_deploy_sheet / a3_04_deploy / a3_05_battle / a6_01_skill_qi / a4_01_settlement / a4_02_surrender / a6_02_surrender / a6_03_items / a6_05_slots / a12_01_succession`
