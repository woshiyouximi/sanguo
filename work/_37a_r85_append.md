
---

## §十　R85 批次（第 5 轮，2026-11-25 上午）

同一批把 37a 主表里剩下的 10 个 🟡 全收口，并修掉三个「整页死」级别的真 bug。测试从 919 → **972**。

### 10.1 转 ✅ 的行（每条带证据）

| 行 | 现在的实现 | 证据 |
|---|---|---|
| R5 月内倒计时 | 不做（原作没有月内倒计时，是每回合一次行动） | r5 裁决；`project/108` §2 |
| R6 城规模 RATE | 不做（特征对齐无据） | r5 裁决；`project/108` §2 |
| R9 開發增量 | `rand()%3000 + INT×100`，人口上限 1,000,000、防禦上限 999 | `city_model.js` 的 `DEV` 表；`tests/rows85.test.ts` |
| R11 搜索权重 | 两段式：先判武將 50%，再按物品权重；`SearchType` 决定等级窗 | `city_model.js:1101-1151`；`tests/rows85.test.ts` |
| R13 内政三命令 | 页头「武將資料／勢力地圖／內政終了」+ `?cmd=` 深链 | `campaign.html` 页头；截图 `work/final85/campaign.png` |
| R15 金钱 | 年税 `floor(pop×75/10000)+2250`，每城正月收一次；**无月税、无俸禄** | `saves.js` 的 `annualSettle`；`tests/rows85.test.ts` |
| R20 搜索种子 | 每档 `searchNonce` 随机，纯逻辑层不自增（模型层可重放） | `city_model.js:827-834`；`tests/rows85.test.ts` |
| R33 军师技加成 | 原作是**纯加法**：增強攻擊 17/46/64 = 己方 +10/+20/+30 点；強化士兵 16/45/63 = 敌方 −10/−20/−30 点 | `battle.ts:1337-1343`、`wises.ts:202-209`；`work/dis_battle_B_44D450.txt:505-540` |
| R57 战斗掉宝 | **原作不掉**（`docs/04b2 §5.1` 负证据）→ 删掉 `capture.ts:452-454`，`report.drops` 恒空 | `tests/capture.test.ts` ⑥⑦、`tests/stepcav.test.ts` 掷骰数 |
| R12 带兵上限 | `core/levels.ts`：`troopCapOf(L)=min(5L,100)`、`cavalryCapOf(L)=clamp((L−20)×5,0,100)`、起始等级 6..20 | `levels.ts:32-53`；`tests/levels.test.ts` 27 条 |

### 10.2 节奏与音效（实测数字）

- **士兵行动间隔 120 → 40 帧**（`battle.ts:78 ATTACK_COOLDOWN=40`）：证据是原作 `0043B5DE mov dword ptr [ecx+0x34], 0x28`（唯一复位点、无兵种分支），且士兵 `0x43D24B` 与主将 `0x43EB50` 调同一个 `0x43B574`。20 seed 实测：troop2v10 中位 17.55 → **11.63 s**、mixed 最慢 36.93 → **16.13 s**、尾段占比 0.376 → 0.158。
- **技能音三条推测全部定案**：043 狂雷天牢 `m022snd01`→**`m032snd01`**、080 八卦奇陣 `m029snd01` **确认不变**、102 集火柱 `m021snd01`→**`m031snd01`**。旧值都是按 `fx_dir_primary` 猜命名（`m022snd01` 实为 `Ice`，服务 063/076/097；`m021snd01` 实为 `FireRing`，服务 054/077/089/103）。根因是 `work/sfx84/map5.mjs backName()` 取了最远的 `PUSHS`；修正后 110 条里 **86 条可直证**（A=73 / A2=13 / C=24 / X=0）。**044 的 `m018snd03` 与调用图 `m018snd01/02` 仍对不上，遗留。**

### 10.3 本轮修掉的三个「整页死」bug

| bug | 症状 | 根因 | 修法 |
|---|---|---|---|
| S0-1 TDZ | 打完一仗回大地图必崩，金 0/城 0/地图空白，存档永远打不开（崩溃跑不到 autosave → `boot.battle` 恒 true） | `campaign.html:1185` 顶层调 `settleBattleReturn()`，它链到 `openSurrenderSheet` 读 `surState`（档尾才 `let`） | 顶层调用删掉、挪到档尾 `:4151` 加 try/catch；`let view` 提到 `:426`；`fit()/resizeCanvas()` 加守卫 |
| S2-1 放技恒 MISS | 每个技能都「未命中」，同屏 `脚本 554 中断：疑似死循环 200000 条指令` | 主将 `mpMax` 被 `main.js:652-659` 覆写成 `BaseMP`（张角 Lv2 47→44）；技能脚本跑飞被 20 万条上限掐断 | 删覆写；`mpCapOf()` 本来就对；`main.js` 命中判定改看 `result.hit/hits/damage` |
| S2-2 装备孤岛 | 装了直剑武力 96→97，但大地图与战斗都不认 | `items.html` 写 `sanguo_items_v1`，`saves.js:619 equipOf()` 无人调用 | 登记为开放项（见 §十一） |

### 10.4 大地图版式（用户实拍反馈）

- 用户原话（m03962，附截图）：「下面有按钮时，上面的大地图被压缩了」。
- 根因：`plotRect()` 用整图 1280×960 等比 fit，竖屏 750 宽只能得 **750×562**，上下各 66px 装裱带；`#actions` 四颗 86px 按钮 + 推进会吃掉 278px。
- 改法：①新增 `CITY_BOX = {x0:88, y0:84, x1:1138, y1:860}`（5 剧本 300 城坐标联集）与 `CITY_PAD=26`，`plotRect()` 改成**按城池外框定标**并以外框中心对齐，外框外的边海允许被裁；②按钮 86→64、`#logbox` 196→152；③`syncView()` 每帧从 `#mapwrap` 实读尺寸（只在 `resize` 事件同步会因字体/战报高度变化而不触发，实测有 144px 错位）；④`MAP_BAND=62`：下带 ≥58px 时 R70 圖例会写进带里，不再压住最南的桂陽/廬陵/夷州。
- 结果：城点区域从 615×455 → **698×516**（+13.5%），60 城全在画面内（含西凉/襄平/夷州），图下方不再有死黑。

### 10.5 仍缺（按工时）

| 项 | 工时 | 说明 |
|---|---|---|
| S2-2 装备不进战斗/大地图 | 3h | `equipOf()` 已写好但无调用点，需在 `buildWorld`/大地图属性计算处接 |
| S2-3 战后 `save.last` 落战场城 | 0.5h | `main.js:840 save.last = city` 应写回**出发城** |
| S2-4 v2 档迁移提示死代码 | 1h | `saves.js:457/713` 已在 `loadStore` 升级，页面再调时 `up.from=3` 恒不满足 |
| S1-1 强插守城不校验归属 | 1h | `campaign.html:3146` 缺 `owned.includes(a.to)` |
| Exec 34「3 後選出陣」 | 4h | 需编成层出阵队列（`[阻塞]`，原作该分支零状态写入） |
| 044 技能音 | 1h | `m018snd03` 与调用图不符 |
| Cocos 版式对齐 | — | 见 `project/118`（r88 在修，大地图底图溢出 + 内政页对比度） |
