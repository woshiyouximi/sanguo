# 37a 80 行 · 逐行最终裁定（第 5 轮 / R86）

> 基准：`project/37a_逻辑对照.md:11-90` 的 80 行主表；对照 `project/31`（近似值）、`project/98`（R84 复查）、`docs/**` 与反汇编地址。
> 方法：先跑只读探针 `work/orig_gap/_check_rows.mjs`（80 行 × 2–3 条正则，语料 = `game/src/core/**` + `game/web/**` + `game/tests/**`），再对 37 个可疑行逐行 `Select-String` 复核实现点；对「原作到底有没有」的条目回查 `docs/04b3`/`04c`/`04d`/`07`/`07b` 的负证据。
> 判定口径：**✅ = 有实现且证据指向原作语义**（允许数值误差已登记在 31）；**🟡 = 有实现/有分歧，但语义或数值仍是近似**；**❌ = 未实现或与原作相反**。
> **重要发现**：37a 主表的状态列是 R81 前后的旧快照（表内 15 个 ❌），§十（R85）只逐条收口了 10 行，却宣称 ✅79/🟡1。本轮实测为 **✅60 / 🟡19 / ❌1**——比 §十 保守，比主表乐观。下表逐行给最终值，凡与 37a 主表或 §十 不同均标「改判」。

## 汇总

| 口径 | 数值 |
|---|---|
| 行数 | 80 |
| ✅ | **60** |
| 🟡 | **19**（R5 R7 R9 R11 R12 R15 R20 R31 R34 R35 R37 R39 R44 R49 R52 R66 R69 R76 R79） |
| ❌ | **1**（R70） |
| 等权还原度 | (60 + 19×0.5) / 80 = **86.9%** |
| 功能加权（战场/内政权重 2，表现/存档权重 0.5） | **≈88%** |
| 收口工时 | 19 个 🟡 + 1 个 ❌ ≈ **88.5 h**（按 37a 表列工时逐项重估，见 `missing.md`） |

## 逐行

| 行 | 系统 | 37a 表 | 终裁 | 证据（本轮实查） |
|---|---|---|---|---|
| R1 | ①大地图 | ✅ | ✅ | `game/web/city_model.js:473-479` isGate 以 `RATE===0 \|\| POPULATION===0` 判关；60 城全量 |
| R2 | ①大地图 | ✅ | ✅ | `game/src/core/march.ts:73-84` pathBetween 只认邻接一跳、跳 30000 哨兵 |
| R3 | ①大地图 | ✅ | ✅ | `data/scenarios.json` 5 剧本；`campaign.html:896` 全量显示 |
| R4 | ①大地图 | ❌ | **✅ 改判** | 主表说「无君主概念」，实际 `game/web/monarch_model.js:85 monarchOf` / `:110 setMonarch`；`campaign.html:213` 君主选择 sheet、`:310` monarchSheet |
| R5 | ①大地图 | 🟡 | 🟡 | 原作 `0x4C30E0` 月内倒计时（`docs/04c:14-28`，`0x41BC1B=0x0E10`）；我们只有月令锁（`campaign.html:1784 CM.monthLocked`），无月内计时。**§十/31 #70 称「原作没有」与 04c 冲突，见报告裁决表** |
| R6 | ①大地图 | 🟡 | **✅ 改判** | `city_model.js:420-428` 注释「城規模 RATE 1..5 劇本給定、不可升級」；`+0x6C` 除装载器无写入（`docs/04c:182`） |
| R7 | ①大地图 | ⚠️ | 🟡 | 年度结算已做（`campaign.html:3346`、`saves.js:1297 annualSettle`），但原作 `0x423885` 五子函数语义未定位（`docs/04c:1.4`）⇒ 内容仍是近似 |
| R8 | ②内政 | ❌ | **✅ 改判** | `campaign.html:1784/2012/2588` 用 `CM.monthLocked()` 闸门；`city_model` 侧 `monthLocked/clearMonthLock`（`:3703`），对应 `0x4A64BC` |
| R9 | ②内政 | 🟡 | 🟡（§十 ✅ → 改判） | `city_model.js:69-72`：人口随机项 `rand()%3000` 与上限 1,000,000 已定位；但「開發收 400 金」原作者不动 `+0x92`（同文件注释），收费是 `[新设计]` |
| R10 | ②内政 | ❌ | **✅ 改判** | `city_model.js:994 autonomyTick`；`campaign.html:3749-3751` 换月 lazy tick、`save.auto` 城各做一次开发 |
| R11 | ②内政 | 🟡 | 🟡 | 两条分支都在（`city_model.js:487-518`）；三路权重 `SEARCH.WEIGHTS:194` 与先后顺序仍是自定（原作二选一顺序未定，`docs/04c:160`） |
| R12 | ②内政 | 🟡 | 🟡 | 预备兵池已实现：`city_model.js:80-84`（上限 `min(POP/2500+110,600)`，常量有据）、`:349 prepCapOf`、`:616` 步/骑双上限；但月补充 10%、1:1 换兵是 `[新设计]/[推測]` |
| R13 | ②内政 | 🟡 | **✅ 改判** | `campaign.html:219-221` 三个按钮「武將資料/勢力地圖/內政終了」；`:1729-1733` 三条原命令地址；`:3911` `?cmd=` 深链 |
| R14 | ②内政 | ✅ | ✅ | 移动武将近邻（`MOVE{COST:0}`）；Rate 部分归 R76 计 |
| R15 | ②内政 | ⚠️ | 🟡（§十 ✅ → 改判） | `saves.js:1297 annualSettle` 已实现；但 `docs/04c:172` 明写金钱公式**未定位**，「年税 floor(pop×75/10000)+2250 / 无月税无俸禄」全部是自造 |
| R16 | ②内政 | ✅ | ✅ | 负证据成立：`docs/04c:168` 全 EXE 无 `徵糧/訓練/治水` 字串；`:171` 城结构无粮草字段 |
| R17 | ③搜索 | ✅ | ✅ | `city_model.js:644-660` 按 Rate 权重、Rate=0 剔除、SearchType 分组 |
| R18 | ③搜索 | ❌ | **✅ 改判** | `city_model.js:563` + `:1302-1326` ONLYONE 已持集合 `held`、命中即权重 0 |
| R19 | ③搜索 | ✅ | ✅ | Rate<=0 的 5–6 件永不出（`city_model.js` 注释点名、skip 逻辑） |
| R20 | ③搜索 | 🟡 | 🟡（§十 ✅ → 改判） | `city_model.js:230/287-296`：真随机 nonce + 确定性 hash ⇒ 同档可重放，与原作 `rand()` 每次重掷不同（可被 S/L 利用的差异消失） |
| R21 | ④武将属性 | ✅ | ✅ | `game/web/deploy.html:344 SOLDIER_CAP = min(level*5,100)` |
| R22 | ④武将属性 | ✅ | ✅ | `battle.ts:390 cavalryCapOf` + `Unit.kind` + 战功步×6/骑×12 |
| R23 | ④武将属性 | 🟡 | **✅ 改判** | `battle.ts:586-592` 用 `BaseHP/BaseMP` + `hpCapOf(baseHp,str,level)`；`main.js:671` 注释 `mpCapOf = BaseMP + level*2*t/100` |
| R24 | ④武将属性 | 🟡 | **✅ 改判** | `battle.ts:2319-2334` levelUp 重算上限并保留溢出（`ovHP` 注释带 `0x40A020`）；带兵上限不落存储、编成时按等级算，故无需重算 |
| R25 | ④武将属性 | ✅ | ✅ | `capture.ts:449-473 learnedAtLevelUp` + `battle.ts:2334` 升级补学 |
| R26 | ④武将属性 | ✅ | ✅ | `battle.ts:835 expToReach` 同式 `((n-1)*137-34)*n/2+17` |
| R27 | ⑤编成 | ✅ | ✅ | `unlock.ts:60,134` troopsOf/isTroopUnlocked + 兵符掩码 |
| R28 | ⑤编成 | 🟡 | **✅ 改判** | `data/formations.json` 实测 `matrix` **11 行**、`matrix_names` 11（含「特殊阵型/乱阵」）、`playable` 9；主表「9×9」过期 |
| R29 | ⑤编成 | ✅ | ✅ | `deploy.html:423-430` 滑杆 1..min(等级×5,100)，快捷档按上限切分（非写死 50/80/100） |
| R30 | ⑤编成 | ✅ | ✅ | `battle.ts:235 formationCells` 走 `slot_rule` 真表 |
| R31 | ⑥军师技 | 🟡 | 🟡 | 67 条中 43 条有实现、24 条占位（`wises.ts SPECS`，project/26 §6） |
| R32 | ⑥军师技 | ✅ | ✅ | `main.js:380` 开战前 applyWise；军师在城才提供（garrison.wise） |
| R33 | ⑥军师技 | ⚠️ | **✅ 改判** | `battle.ts:1341-1343` 注释「舊式 ×(1+bonus/100) 是本作自造，R33 已按原作改成純加法」，`return base + wiseBonus(...)` |
| R34 | ⑥军师技 | 🟡 | 🟡 | 一次一边、无「化解計策」对抗（applyWise 单条）；原作是否可对抗仍未定位 |
| R35 | ⑥军师技 | 🟡 | 🟡 | 开战即自动发动，无「出阵前选一条」界面 |
| R36 | ⑦战斗流程 | ✅ | ✅ | `battle.ts:257 createWorld` → step/checkOver → settle 全链 |
| R37 | ⑦战斗流程 | ❌ | **🟡 改判** | 策略与援军已接线：`battle.ts:26-36` 引 `strategy.ts`，`:282` ReinforceConfig；但 66 分支指令/`0x44D450` 派发只做了子集，未全 |
| R38 | ⑦战斗流程 | ❌ | **✅ 改判** | `battle.ts:201` 撤退标记（`0x4447B7`→`[0x4A8AE0]\|=4`）、`:279 AI 全军撤退`；`main.js:10 requestRetreat`、`:777` 结算文案 |
| R39 | ⑦战斗流程 | ❌ | **🟡 改判** | `weather.ts:54 weatherOf(month,terrain)` 已进战斗，但文件头 `:16` 自述「原作天气对战斗数值的影响，一条依据都没有，两张表全部是 [推测]」 |
| R40 | ⑦战斗流程 | ✅ | ✅ | 负证据：`docs/04b3:11` + `:490 0x447516 空函数`；我们同样无独立单挑 |
| R41 | ⑧伤害命中 | 🟡 | **✅ 改判** | `battle.ts:100 MORALE_DAMP = 1`（旧的减半已撤） |
| R42 | ⑧伤害命中 | ✅ | ✅ | `battle.ts:396 hitChance` 四条与 04b4 同式 |
| R43 | ⑧伤害命中 | ✅ | ✅ | 移动目标 ×2/3（`0x43BE08`） |
| R44 | ⑧伤害命中 | ⚠️ | 🟡 | 骑兵位已用：`battle.ts:790 isCavalryBit`、`:1360` 命中 `150+STR/3`；但 04b §3.4 的「命中后再掷 2/3 补判」未实现 |
| R45 | ⑧伤害命中 | ✅ | ✅ | `battle.ts:1405 terrainBonus` + `:1640` 进战力；12×13 表硬编码在 core（注释 `0x48D030`），`data/terrains.json` 只有视觉字段——主表说「terrains.json vs[13]」不准 |
| R46 | ⑧伤害命中 | ⚠️ | **✅ 改判** | `battle.ts:975-994` = `(Rand32()%(str-str/2)+str/2)/10`；测试 `game/tests/battle_r81.test.ts:132` 直测 |
| R47 | ⑨气力技力 | 🟡 | **✅ 改判** | `battle.ts:116 QI_MAX=120000`、`:133 QI_COST_SCALE=1200`（POWER×1200）；MP 查 `general+0x16` |
| R48 | ⑨气力技力 | ✅ | ✅ | `core/smartscript/**` 90 opcode + 逐帧 SkillSession |
| R49 | ⑨气力技力 | 🟡 | 🟡 | `project/28:139`：runSkill 成功 109/110、有 fx 109、有命中 100 |
| R50 | ⑨气力技力 | 🟡 | **✅ 改判** | `battle.ts:795-855 ACTIVE_BIT`（1/2/4/8）带证据 `docs/03a §2.3`；`activeHits()/cast()` 消费 |
| R51 | ⑨气力技力 | ✅ | ✅ | 全局 g4 = ATTACK 已接 runtime `valueFor` |
| R52 | ⑨气力技力 | ❌ | **🟡 改判** | 音效已通：`audio_bus.ts` + `syso_host.ts:571`「5 个音效在 audio_bus，34 个在这里」；但特效仍是几何合成，非脚本物件逐帧碰撞 |
| R53 | ⑩招降斩首 | ✅ | ✅ | `capture.ts:174-176` 三道硬门 L>90/70/50→0；`:232-242 canRecruit` |
| R54 | ⑩招降斩首 | ✅ | ✅ | `capture.ts:324` 起逐人；`campaign.html:375-389` R85 逐将招降/斩首/释放面板（一将一卡 + 剩余全部） |
| R55 | ⑩招降斩首 | ✅ | ✅ | `capture.ts:191 isKing → 0` |
| R56 | ⑩招降斩首 | 🟡 | **✅ 改判** | `campaign.html:3406-3422`：`save.executed` 过滤 + 出池永不复活 |
| R57 | ⑩招降斩首 | 🟡 | **✅ 改判** | `capture.ts:128 drops: []` 常量、`:454-455` 注释「rollDrop 只给搜索/测试」；`tests/capture.test.ts:164` ⑥直测 |
| R58 | ⑩招降斩首 | ✅ | ✅ | `capture.ts:322` 忠≥50 折 ×2/3、先扣忠 |
| R59 | ⑪战后结算 | 🟡 | **✅ 改判** | `battle.ts:1260 warMeritOf(startInf,startCav,aliveInf,aliveCav)`，`:2235-2238` 用开战快照 |
| R60 | ⑪战后结算 | ✅ | ✅ | `battle.ts:2179 MODE_NAME / :2191 settleMode / :2206 settleReport`；测试 `battle.test.ts:229-235` 断言 mode 1–4 + modeName 四档 |
| R61 | ⑪战后结算 | ✅ | ✅ | `battle.ts:966-999` `tireGain = 15+tick/10` 双方都加 |
| R62 | ⑪战后结算 | ✅ | ✅ | `battle.ts:975-999` 士气 −20、忠诚 −(10-节操)×2 |
| R63 | ⑪战后结算 | 🟡 | **✅ 改判** | `saves.js:1075-1080 updateRecord`（胜/败/连胜/最高连胜）+ `campaign.html:3054/3061` 接入 |
| R64 | ⑪战后结算 | 🟡 | **✅ 改判** | `battle.ts:1274 extraExpOf`、`:2263`；测试 `battle_r81.test.ts:304` 直测 Σ敌等级×32÷我方人数 |
| R65 | ⑪战后结算 | 🟡 | **✅ 改判** | `campaign.html:647 moraleMonthly`（`:3776` 调用）+ `:3811 MM.recordDrift` |
| R66 | ⑫武将技 | 🟡 | 🟡 | 数据 110 条齐，109 条可跑（`project/28:139`） |
| R67 | ⑫武将技 | 🟡 | **✅ 改判** | `battle.ts:288/660/1007`：伤害默认走 `MAGIC.SO Hurt → SYSCALL 0x125 → 0x43ED96` 脚本通道，`legacy` 仅对拍；统一的 0.15+atk 公式已废 |
| R68 | ⑫武将技 | ❌ | **✅ 改判** | `capture.ts:449 learnedAtLevelUp` 按 `SKILLLEVEL1-4` 补学，升级段 `battle.ts:2334` 调用 |
| R69 | ⑬军师技 67 | 🟡 | 🟡 | 43 条生效、24 条占位（同 R31） |
| R70 | ⑭存档 | ❌ | ❌ | `saves.js:23` 10 槽 localStorage JSON；无 SSAV 二进制。原作：`docs/07:15` 模板、`:19 %02d 上界未定位`、`:38` 头 0x1D0、`docs/07b:14` 七段（势力 32×0x352 / 城 64×0xB2 / 部队 128×0x70 / 武将 512×0x11F / 路径 / 路径点 / 128B 标志）、`07:79` 64 城摘要 |
| R71 | ⑭存档 | 🟡 | **✅ 改判** | `saves.js:891 citySummaryOf`；`campaign.html:146` 槽位显示君主 + 势力（存活/滅亡）+ 武将数 |
| R72 | ⑭存档 | 🟡 | **✅ 改判** | `saves.js:200-237` 版本链 `0→2→3`，`steps` 逐跳迁移 |
| R73 | ⑮AI | ❌ | **✅ 改判** | `ai_model.js:81-86` PLAN_DOMESTIC/RECRUIT/ATTACK/MOVE；`campaign.html:2765` 逐城四段规划、`:2823 runAiMonth` |
| R74 | ⑮AI | ❌ | **✅ 改判** | `ai_model.js:103 ACT_TABLE`（`0x487248` 9 项）+ 占空城/联合注释 `:23-25`；只有 Rate 数值是近似（R76） |
| R75 | ⑮AI | 🟡 | **✅ 改判** | `ai_model.js:319 limitOf/:325 capOf`；`campaign.html:981` 注释旧固定 100 已改为按上限公式 |
| R76 | ⑮AI | 🟡 | 🟡 | `ai_model.js:38` 明写「内政/征兵/调将三个规划器的评分表未定位，本文件 Rate 是自定」 |
| R77 | ⑯剧本势力 | ✅ | ✅ | `data/scenarios.json` 5 剧本；`generals.json` 401 将 |
| R78 | ⑯剧本势力 | ❌ | **✅ 改判** | `monarch_model.js:110 setMonarch/:135 abdicate`；`campaign.html:3406` 斩首出池；灭亡残将/余城规则见 31 #26-29（`[推測]`） |
| R79 | ⑰事件脚本 | ❌ | **🟡 改判** | `syso_host.ts:571`：5 个音效 + 34 个宿主函数（39/39）已实装，`SYSO_UNSUPPORTED` 清空；但 SYSTEM.SO 的剧情编排（StartBattle/SearchTalk/EnterWar）未接进战役流程 |
| R80 | ⑱音效 | ❌ | **✅ 改判** | `main.js:142-162` R80 六类（命中/受击/格挡/阵亡/撤退/撤离）规则在 `audio_bus.ts`，`:156 audio.sfx` 唯一出口 |

## 与 37a 主表 / §十 的差异清单

**主表 ❌ → 本轮 ✅（11 行）**：R4、R8、R10、R18、R38、R56、R68、R73、R74、R78、R80。
**主表 ❌ → 本轮 🟡（4 行）**：R37、R39、R52、R79。
**主表 🟡 → 本轮 ✅（16 行）**：R6、R13、R23、R24、R28、R41、R46、R47、R50、R59、R63、R64、R65、R71、R72、R75。
**主表 ⚠️ 分歧（3 行）**：R7→🟡、R33→✅（`battle.ts:1341` 纯加法）、R44→🟡（骑兵位已用、2/3 补判未做）。
**§十 声称 ✅ → 本轮 🟡（3 行）**：R9、R15、R20。理由：三者的「原作公式/顺序/随机性」都未定位，代码里是自造值（分别见 `city_model.js:69`、`docs/04c:172`、`city_model.js:230`）。
**维持 ❌（1 行）**：R70（SSAV 逐字节）。

## 仍属「假绿」风险的 4 处（无测试或测试不测语义）

1. **R39 天气**：`weather.ts:16` 自述全部 `[推测]`，但已进战斗数值——属「有实现无依据」。
2. **R79 SysoHost**：39 个宿主函数有实现，但没有一条测试跑「StartBattle → 换屏」链路。
3. **R12 预备兵**：上限公式有据，补充率 10% 与 1:1 换兵无据。
4. **R37 策略**：`strategy.ts` 41 KB 只有 `battle_r81` 等少数测试，66 分支的派发条件（`0x44D450`）未逐条覆盖。
