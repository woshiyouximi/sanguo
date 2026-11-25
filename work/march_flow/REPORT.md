# 出征/战后经济闭环（F22 deploy 侧 / F23 / F24）— 实机报告

日期：2026-11-26 · 负责人：marchflow（subagent）· 任务来源：lead 的 F22/F23/F24
改动文件：`game/web/main.js`、`game/web/deploy.html`、新增 `game/web/march_flow.js`(+`.d.ts`)、`game/tests/march_flow.test.ts`
**未碰**：`campaign.html`、`city_model.js`、`city.html`、`game/src/core/**`、`game/cocos/**`、`project/**`（禁令）

---

## 0. 结论

- **F23**：出征兵力上限 = `min(每将等级上限, 出发城实有兵+预备兵)`；UI 明写「上陣 兵 X / 城中有 Y」；
  点「出征」时把 X 从出发城扣掉（先扣部队兵、再扣预备兵，不够整笔失败、一个兵都不扣）。
- **F24**：攻城战结算后按 A 方存活比折算兵损，幸存兵归建出发城；兵团线（兵已在 `dispatchArmy()`
  扣过）不重复扣，战后清掉残留的 `save.armies` 条目。
- **F22 deploy 侧**：`deploy.html` 已接受 `from/city/officers/a/lv/bsoldiers/troops/army/advisor/wise/blevel`
  全部参数；campaign.html 的接线由 affairs 做（契约见 §4）。
- 数字：`tsc --noEmit` exit 0；全量 `node --test tests/*.test.ts` **1677 pass / 0 fail**（基线 1631，我 +28）；
  `node --check web/main.js` OK；deploy 内联 module 语法 OK（700 行）；CDP 实机 4 组，errors=0。

---

## 1. 新增的纯函数层（两页共用一个口径）

`F:\sanguo\game\web\march_flow.js`（+ `march_flow.d.ts` 壳，让 tests/*.ts 能 import）：

| 导出 | 语义 |
| --- | --- |
| `TROOP_HARD_CAP = 600` | 城池兵额上限（与 `campaign.html` 的 `refundArmy()` 同口径） |
| `DEPLOY_OFFICER_MAX = 5` | 出征名册上限（= `DQ.DEPLOY_SLOTS`） |
| `parseOfficerList(raw, max)` | `?officers=張飛,關羽` → 去重/去空/截断的名字数组 |
| `cityPoolOf(st, {fallbackTroops, prepCap})` | 城的可出征兵 = 部队兵 + 预备兵（缺省用 `Saves.cityTroops()` 兜底） |
| `fieldCapOf(levelCap, pool)` | `min(每将等级上限, 可出征兵)` ← F23 的核心一行 |
| `takeFromCity(st, n, {fallbackTroops, prepCap})` | 扣兵：先部队兵后预备兵，不足 → `{ok:false, reason:'not-enough'}`（整笔失败） |
| `returnToCity(st, n, {troopsCap})` | 归建：加回部队兵，超上限的部分记 `overflow` |
| `casualtySplitOf(pool, start, alive)` | 战损折算：`loss = clamp(max(1, round(pool*lost/start)), 0, pool)`，`returned = pool - loss` |

`F:\sanguo\game\tests\march_flow.test.ts`：28 个 test（纯函数 22 + deploy/main 源码契约 6）。

---

## 2. F23 逐条 file:line

### deploy.html（`F:\sanguo\game\web\deploy.html`）
- `:245` `import * as MF from './march_flow.js';`（与 main.js 同一模块）
- `:336-364` 出征兵源块：`HOME_TROOPS_FALLBACK`（= `Saves.cityTroops(homeCity)`）、`HOME_PREP_CAP`（= `CM.prepCapOf(pop)`）、
  `ARMY_ID/ARMY_QUERY/ARMIES/MARCH_ARMY`、`MARCH_MODE = 'city' | 'army'`、`CITY_STATE = MF.cityPoolOf(...)`、`MARCH_POOL`
- `:391-398` `?officers=` 名册：`OFFICER_PARAM = MF.parseOfficerList(qs.get('officers'))`，有则 `pool = listed`
- `:453-469` `LEVEL_SOLDIER_CAP/LEVEL_CAV_CAP` + `applyMarchCap()`：
  `const total = MF.fieldCapOf(LEVEL_SOLDIER_CAP + LEVEL_CAV_CAP, MARCH_POOL)`
- `:481-483` `rerollCaps()` 先写 LEVEL_* 再 `applyMarchCap()`；`TROOP_CAP<=0` → 步骑双 0
- `:506-512` 队列按名册重建（`DQ.makeQueue(names, {troopOf, troopsOf})`，沿用同将上次的兵种/兵数）
- `:687-716` render：`soldiers` 下限随 `TROOP_CAP>0?1:0`；滑杆 `disabled`；`#numhint` 三态（含兵源说明）；
  `#numtotal` = `上陣 兵 <b>X</b> / 城中有 <b>Y</b> 兵 = 步 a + 騎 b`
- `:857-864` 「出征」点击：`const fielded = soldiers + cavalry; const commit = commitMarchTroops(fielded);
  if (!commit.ok) { notice(...); return; }`（城兵不够 → 不跳转、一个兵都不扣）
- `:876-879` 出阵 URL 追加 `home: HOME`、`marchpool: <army?ARMY_TROOPS:fielded>`

### 扣兵（deploy 侧）
- `:592-609` `commitMarchTroops(fielded)`：army 模式直接 `{ok:true,taken:0}` 跳过；city 模式 `MF.takeFromCity`，
  成功写 `st.troops/st.prep`、`save.ts=Date.now()`、`MARCH_POOL=res.pool`
- `:557-580` `writeSaveBoth()`：legacy 键 + 当前自动存档槽一起写；city 模式把 `cities[HOME].troops/prep`
  抄进槽快照（否则 campaign 读槽又看到旧兵数，F23 的另一半）
- `:583-585` `persistQueue()` 改为「存队列 + `writeSaveBoth()`」

---

## 3. F24 逐条 file:line（`F:\sanguo\game\web\main.js`，CRLF）

- `:37` `import { casualtySplitOf, returnToCity } from './march_flow.js';`
- `:66-69` `const MARCH_HOME = QUERY.get('home')`；`const MARCH_POOL_QUERY = QUERY.get('marchpool')`
  （注释写明 **不是** `from=`：`from=campaign` 是入口标记）
- `:1158-1190` 攻城分支（`if (win)/else` 之前）：
  - `:1167` `army = save.armies.find(a => a.side==='A' && a.from===MARCH_HOME && a.to===city)`
  - `:1168-1170` `pool = min(600, ?marchpool 优先 : army.troops)`
  - `:1171` `split = casualtySplitOf(pool, state.world.sides.A.start, state.world.sides.A.aliveCount)`
  - `:1175-1176` `back = returnToCity(home, split.returned, {troopsCap:600}); home.troops = back.troops`
  - `:1178-1186` `marchNote` + `logTo()`（`攻 南皮：陳留 損 5 兵（上陣 10 活 5）`）+ overflow 日志
  - `:1188` `if (army) save.armies = armies.filter(a => a !== army)`（兵团解散接线）
- `:1199` 攻城 return 追加 `${marchNote}`（结算屏与战报都能看到回写结果）
- 守城分支 `:1124-1145` **未改**（原有按比例扣守军口径保留，两者现在同一套「存活比」语义）

旧行为对照：改前攻城分支只 `owned.push` / `losses+1`，**任何城的 troops 都不动**（差异报告 §5 F24）。

---

## 4. 给 affairs 的接口说明（campaign.html → deploy.html 参数契约）

### A. 打开编成页
`./deploy.html?` + 参数（全部 UTF-8 URL-encoded）：

| 参数 | 必填 | 含义 / 缺省行为 |
| --- | --- | --- |
| `city` | ✔（实际） | 目标城名。缺省 `南皮` |
| `from` | ✔（F23 后） | **出发城名**，兵源城。缺省 `save.owned[0]` → 目标城 |
| `a`（或旧名 `gen`） | 建议 | 主将名。缺省 = 出发城武将池第一个（太守优先） |
| `officers` | 可选 | 逗号分隔名册，最多 5；给了就按它重建 5 槽队列，只保留本城武将 |
| `troops` | 兵团线**必填** | 兵团总兵数。带上 = **兵团模式**：这批兵已在 `dispatchArmy()` 扣过，deploy **不再扣城兵**；`marchpool` 写这个数 |
| `army` | 可选 | 兵团 id；优先于 `troops`（先按 id 找，再退化找「A 方、from=HOME、to=target、progress≥1、未驻守」）。**注意**：campaign 抵达时会先 `removeArmy(a.id)`，所以抵达后一般只剩 `troops` 可用 |
| `lv` | 可选 | 存档等级（等级上限用） |
| `bsoldiers` | 强烈建议 | 敌上阵兵（不是守军总数）。缺省显示「—」并提示，不猜 |
| `bgen/bstr/bint/bmorale` | deploy 自己带出 | 不用传（deploy 从 `garrison.json` 取守将） |
| `advisor` / `wise` / `blevel` | 可选 | 军师 / 军师技 / 敌等级 |

**没有 `troops`/`army` 时 = 城兵模式**：上限被城兵夹住，点出征才扣兵。这是「地图 → 出征 → 编成 → 打」
那条路的正确形态。

### B. deploy → 战斗页（deploy 已实现，main.js 已读）
`./index.html?city=<目标>&from=campaign&a=&gen=&home=<出发城>&marchpool=<兵数>&troop=&form=&soldiers=&cav=&atire=&amorale=&wise=&blevel=&bsoldiers=&bgen=&bstr=&bint=&bmorale=`

- `home` + `marchpool` 是 **F24 契约**：main.js 用它们折算战损并把幸存兵归建。缺 `home` → 整段兵损回写跳过（老链接行为不变）。
- `from=campaign` 仍是入口标记，**绝不能**拿它当出发城名（main.js:62 的 `ENTRY_BATTLE` 依赖它）。
- `soldiers` = 上阵总数（步+骑），`cav` = 骑兵栏。

### C. affairs 需要改的两处（campaign.html）
1. `dispatchArmy(to)`（campaign.html:2864-2889）不要直接生成兵团走路，改成打开编成页：
   `deploy.html?city=<to>&from=<from>&a=<leader>&officers=<armyRosterFor(from,leader).join(',')>&bsoldiers=<enemySetup().enemyTroops>&lv=<leaderLv>`
   （`dispatchArmy` 保留给 AI；玩家路径改指 deploy。）
2. **抵达城下「出戰」URL 必须补兵团兵**（campaign.html:4527-4560，现在只带 `city/from/amorale/lv/bsoldiers/blevel/advisor/wise`）：
   加 `troops: String(a.troops)`（此时 `a` 还没被 `removeArmy`，也可同时带 `army: a.id`，但 `troops` 才是
   `removeArmy` 之后仍然有效的那份）。**不加这一条 = deploy 会按城兵模式再扣一次城兵**（F23 重复扣）。
3. 退兵 `refundArmy(a)`（:4572）与 main.js 的回写互不重叠：退兵是在「没打」的分支，兵还在 `a.troops`；
   打完的那份由 main.js 回写（`save.armies` 里同名兵团会被删）。

### D. deploy 写存档的行为（campaign 侧注意）
- deploy 扣兵后 `writeSaveBoth()`（`deploy.html:557`）会同时写：legacy 键 `sanguo_campaign_v1`（`save.ts = Date.now()`）
  + 当前自动存档槽的 deployQueue 快照（city 模式下把 `cities[HOME].troops/prep` 也抄进槽）。
- campaign 启动时 `legacy.ts > snap.ts` 会用 legacy；`isBattleDelta()`（campaign.html:5921-5927）只比
  `wins/losses/defWins/owned`，所以 deploy 写 ts **不会**被误判成「战斗结果已写回」。
- 反过来说：如果 campaign 在 deploy 之后立刻 `autosave()` 写旧内存快照，会把扣过的城兵盖回去。
  接线时请在从 deploy 返回大地图的那次 `boot` 里先 `readLegacy` 同步（现有代码已是这个顺序，勿改）。

---

## 5. 实机取证（CDP，端口 9352，profile `F:\sanguo\work\.edgeprof_marchflow`）

脚本：`work\march_flow\cdp_march.mjs`（三轮主流程）、`cdp_scroll.mjs`（兵力区截图）、`cdp_troops.mjs`（`?troops=` 契约）。
原始数据：`work\march_flow\cdp_result.json`、`cdp_scroll.json`、`cdp_troops.json`；**errors = 0**。

| 轮 | 初始城兵 | deploy 显示 | 点「出征」后 `save.cities.陳留.troops` | 战后（`?dev=1&sim=5&end=…`） | 回写 |
| --- | --- | --- | --- | --- | --- |
| A 城兵 200 | 200 | 上限 10（等级瓶颈）· `上陣 兵 10 / 城中有 200` | **190** | `end=win`：上陣 10 活 5 | `損 5、歸建 5` → **195** |
| B 城兵 4 | 4 | 上限 4（城兵瓶颈）· `上陣 兵 4 / 城中有 4` | **0** | `end=lose`：上陣 4 活 0 | `損 4` → **0** |
| C 兵团 40（`?army=a1`） | 200 | `上陣 兵 10 / 兵團 40` | **200 不变**（不再扣） | `end=win`：上陣 10 活 5 | `損 20、歸建 20` → **220**；`save.armies` 清空 |
| D `?troops=40`（无 id） | 200 | `上陣 兵 10 / 兵團 40` | **200 不变** | —（deploy 侧契约） | URL `marchpool=40` |

- A 轮战报：`攻 南皮：陳留 損 5 兵（上陣 10 活 5）`；`lastBattle.won=true`、`wins 0→1`。
- B 轮：`lastBattle.won=false`、`losses 0→1`、`陳留 損 4 兵（上陣 4 活 0）`（A 方全灭 → 全部损失、无归建）。
- C 轮：`save.armies` 从 1 条变 0 条（main.js 的兵团解散接线）。
- 出阵 URL 实测（A 轮）：
  `.../web/index.html?city=%E5%8D%97%E7%9A%AE&from=campaign&a=夏侯惇&gen=夏侯惇&home=%E9%99%B3%E7%95%99&marchpool=10&troop=1&form=2&soldiers=10&cav=0&…`

截图（`work\march_flow\`）：
- `deploy_city_200.png` / `deploy_city_200_troops.png`：城兵 200、上限 10、兵力区「上陣 兵 10 / 城中有 200」
- `deploy_city_4.png` / `deploy_city_4_troops.png`：城兵 4 时上限被夹到 4（滑杆 max=4、快捷档 2/3/4）
- `deploy_army_40.png` / `deploy_army_40_troops.png`：兵团模式「上陣 兵 10 / 兵團 40」
- `battle_win_settle.png` / `battle_lose_settle.png` / `battle_army_settle.png`：战后结算屏

收尾：`cdpweb.mjs close` → `closed`；`reap.mjs --kill --match=edgeprof_marchflow` → **遗留验证浏览器进程: 0**。

---

## 6. 验证命令与数字

```
cd F:\sanguo\game
npm.cmd exec -- tsc --noEmit                                → exit 0
node --check web/main.js                                    → OK
node F:\sanguo\work\march_flow\check_syntax.mjs             → deploy.html inline module OK (700 行)
node --test --test-reporter=tap tests/march_flow.test.ts    → tests 28 / pass 28 / fail 0
node --test --test-reporter=tap tests/*.test.ts             → tests 1677 / pass 1677 / fail 0
```

基线 1631 pass（lead 给的口径）；本轮 +28（新文件），其余 +18 为其他人并行新增的测试（同一轮全量跑出来的总数
1677 = 1677 pass / 0 fail）。`guard_web_contract` 里与 deploy.html 相关的字符串契约全部保留：
`import { levelOf, troopCapOf } from '../dist/core/levels.js'`、`id="numrange" min="1" max="100" step="1"`、
`range.max = String(SOLDIER_CAP)`、`const quick = [...]`、`soldiers = Math.min(Number(t.dataset.num), SOLDIER_CAP)` 等。

---

## 7. 未完成项 / 需要 lead 处理

1. **campaign.html 两处接线（P0，禁改，归 affairs/lead）**
   - `dispatchArmy` 改开 deploy（带 `from/officers/bsoldiers`）；
   - 抵达城下「出戰」URL 补 `troops: a.troops`（不补 → 兵团线在 deploy 里被当城兵模式**再扣一次**）。
   契约见 §4；我已把这节用 `send_message` 发给 `affairs`。
2. **「点出征后没打就返回」没有归还路径**：F24 只覆盖「打完的仗」。若玩家在战斗页刷新/关页，兵已扣、
   无人回写 → 城兵永久少一批。要修需要「出征前记账、回城时对账」的 journal（`save.marchOut` 之类），
   属于**新数据结构**，本任务按「别发明新结构」的约束没有做。
3. **`?march` 旧入口文案**（campaign.html:3735-3766 / `openMarchTargets` 的「上限 等级×5」）仍是等级口径；
   行为上 F23 已在 deploy 侧夹住，不会超分，但列表文案与真实上限可能不一致（affairs 可顺手改）。
4. **`save.cities[HOME]` 的 pop/money**：deploy 首次创建城态时用 `homeCity.POPULATION/MONEY` 补
   （`deploy.html:602-603`）；若 campaign 的 `ensureCityState()` 先建过则不动 —— 两边口径一致，未发现冲突。
5. **未覆盖**：prep>0 的扣兵只由纯函数测试覆盖（实机 prep 全为 0）；`?unlimited` 旧参数 deploy 不读（无害）。
6. 实机验证只用了 headless Edge 1280×1334 视口 + `?dev=1&sim=5&end=` 强制终局；真实手打战斗的
   `aliveCount` 走的同一条 `casualtySplitOf()`，没有另开浏览器复测。
