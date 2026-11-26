# R231 · 「每次到达就弹出编成界面，到达一次弹出一次」排障报告

- 任务：三国群英传2 竖版重制（Cocos Creator 3.8，`F:\sanguo`）
- 执行：子代理 `arrive-loop`（父代理 `lead`）
- 基线：`HEAD d7796e2`（S-049 R230）＋本次未提交改动（按任务要求不 `git add/commit`）
- 结论：**已定位到两条把「抵达」错误变成「重新派兵编成」的代码路径并修复**。抵达后不再出现可反复派兵的编成屏，而是「攻城戰前準備」：参战部队＝刚抵达的兵团，只能调阵形/兵种/军师技/站位/出阵顺序，按钮「出 戰」直接进 Battle；「返回大地圖」按原作/web 口径把兵退回出发城并把部队从存档里结清。

---

## 1. 用户现象

用户原话（m00001）：「每次到达就弹出编成界面，到达一次弹出一次」。

补充复现细节（m00145）：

1. 朝 A 地出征，编成队伍出征；
2. 队伍到达 A 地后**没有进入战斗，弹出编成队伍界面**，此时派出的武将已经不见了，也没触发战斗；
3. 再次编成出征后，再次重复 1 和 2。

即：抵达后确实进了 Deploy（出征編成）场景，但进入的是**「从出发城重新派兵」的编成屏**，不是「带着刚抵达的这支部队开战」的战前准备；玩家只能再点一次「出征」→ 又派一支新兵团 → 新兵团再走到目标 → 再弹编成 → 循环。

---

## 2. 为什么本报告没有 CDP 截图 / 真机录屏（限制说明，重要）

任务要求「先用 Cocos web-mobile 构建 + CDP 复现」，但仓库里唯一的 web-mobile 构建**早于出 bug 的代码**，无法复现当前逻辑：

| 证据 | 内容 |
|---|---|
| 构建产物 | `F:\sanguo\game\cocos-build\web-mobile\index.html` mtime **2026-11-26 15:38:30**；`assets/main/index.e7450.js` 945,897 B，15:38 |
| 对应代码 | 构建里能查到 `1ce372e`（15:37）附近字串；而「抵达自动进 Deploy」逻辑是 **R225b(16:24)/R226(16:43)/R227(17:22)/R230/R231** 才进来的 |
| 字串探测 | 构建 bundle 内 **MISS**：`startArrivalSiege`、`arrivedNoticed`、`stepArmiesFrame`、`部隊已抵達目的地`；**FOUND**：`沒有抵達城下的敵軍`、`先在大地圖取得一座有我方武將的城`、`兵 團 進 城`（旧版语句） |
| 其它构建 | `cocos-build-local/wechatgame` 11/24、`cocos-build-native/android` 11/26 08:37、`cocos-build/web-desktop` 11/24、`web-mobile-remote` 11/24 —— 都更旧 |

用旧包跑 CDP 只能跑到旧行为，无法验证本 bug，也无法验证修法。按任务约束「不要自己跑 Cocos 全量构建」，并且 `lead` 已明确允许「源码 + 契约测试落地，真机验收交用户」，本次改为：

1. **真跑逻辑的运行时 harness**（新增 `tests/deploy_siege_runtime.test.ts`）：用 `registerHooks` 把 `cc` 换成空壳桩（`sys.localStorage` = 内存 Map，`director.loadScene` 记录场景名），真的 `import GameState.ts` 并跑存档读写，**在数据层把「每次抵達→又派一支新兵團→又抵達」的循环跑出来**，再跑修复后的「一次抵达只开一场战」；
2. 源码契约测试（新增 `tests/deploy_siege.test.ts`，改 `tests/march_arrival_auto.test.ts`）；
3. 双 tsc + 全量 `node --test`。

因此 `work/arrive_loop/` 下**没有 png 截图**（构建过旧，截不到当前 bug），提供的是可复跑的命令与日志（见 §7、§10）。

---

## 3. 复现（数据层，可照着复跑）

命令：

```powershell
cd F:\sanguo\game
node --test tests/deploy_siege_runtime.test.ts
```

日志：`F:\sanguo\work\arrive_loop\runtime_harness.log`（6 tests / 6 pass / 0 fail）。

关键用例 `[R231] 舊路徑：setDeployMarch → dispatchMarch 會再造新兵團…` 的实测数值（存档初始：`平原` 300 兵；`A1` 部队 120 兵、主将 劉備、隨軍 關羽、已在 `樂陵` progress=1）：

| 步骤 | 实测结果 |
|---|---|
| ① 抵达（数据前提） | `GameState.arrivedAt('樂陵','A').length === 1` |
| ② 旧 `startArrivalSiege`：`removeArmy('A1')` + `setDeployMarch(...)` | `armies.length === 0`（撤队本身是对的） |
| ③ 旧 `DeployRoot.march()`：`peekDeployMarch()` 为真 → `dispatchMarch('劉備',['關羽'],120)` | 返回 `true`；`armies.length === 1`；**新 id ≠ A1**；`to='樂陵'`、`progress=0`；`平原.troops 300 → 180` |
| ④ 新兵团走到目标 | `applyArmyProgress` 推到 1 后 `arrivedAt('樂陵','A').length === 1` → **下一次 `stepArmiesFrame()` 又会弹 Deploy** |
| ⑤ 再按一次出征 | 又一支新兵团；`平原.troops 180 → 60` |
| ⑥ 再按一次 | `dispatchMarch` 把城里剩的 60 兵也派出去（`taken=clamp(120,0,60)=60`）；再下一轮才返回 `false`（兵不足），而 `peekDeployMarch()` 仍非空（失败不清、全库又没有 `clearDeployMarch()` 调用点） |

→ 这就是「到达一次弹出一次」：**每次抵达都会进编成屏；每次在编成屏点「出征」都会造一支新兵团；新兵团再次抵达又进编成屏**。每循环还从出发城多扣一次兵，直到城里兵被扣光，玩家仍被编成屏困住。

---

## 4. 根因（旧代码，HEAD d7796e2）

### 根因 A：抵达时只写「派兵上下文」，没把部队本身传进 Deploy

`F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts`（旧 4410-4436，`startArrivalSiege`）：

```
4410:   private startArrivalSiege(army: Army, target: string): void {
4411:     if (!this.save) return;
4412:     const from = saveOwnedOr(this.save, army.from);
4413:     GameState.removeArmy(army.id);          // 部队已从存档里删掉
4414:     this.save = GameState.loadSave();
4415:     GameState.setDeployMarch({ from, target, pathIndex: army.pathIndex });  // 只写了「从 from 派兵到 target」
4416:     GameState.setDeployFrom(from);
4417:     GameState.setDeployTarget(target);
4418:     GameState.setDeployArmy(null);
...
4435:     director.loadScene('Deploy');
4436:   }
```

`DeployMarch` 只是一个「派兵目的地」上下文，**不含这支部队的主将、随军、兵数、armyId**。部队在 4413 已被 `removeArmy()` 删掉，于是 Deploy 屏没有任何「参战部队」可用，只能按出发城重新组候选池——就是用户看到的「重新派兵的编成屏」。

### 根因 B：Deploy 的「出征」按钮把「抵达战」当成了「派兵」

`F:\sanguo\game\cocos\assets\scripts\DeployRoot.ts`（旧 1915-1935，`march()`）：

```
1915:   private march(): void {
1916:     const gen = this.currentGen();
1917:     if (!gen) { ...; return; }
1922:     // 兵團出征：編成屏只負責選將/排序/兵力，按「出征」才真的把兵團派出去
1923:     if (GameState.peekDeployMarch()) {
1924:       this.persistQueue();
1925:       const officers = this.queue.map((slot) => slot.general).filter((name) => !!name && name !== gen.NAME);
1928:       if (GameState.dispatchMarch(gen.NAME, officers, this.soldiers + this.cavalry)) {
1929:         director.loadScene('Campaign');       // ← 派完就回大地图
1930:       } else { ... }
1934:       return;
1935:     }
```

`dispatchMarch()`（`GameState.ts` 旧 1058-1085）会 `nextArmyId('A')` 造一支 **新兵团**（progress=0），并从 `save.cities[from].troops` 扣兵。于是：抵达 → 编成屏 → 点出征 → 造新兵团 → 回大地图 → 新兵团再次抵达 → 又进编成屏……**A+B 合起来就是完整的循环**。

### 根因 C（同一 bug 的第二入口）：城下已有部队时先撤队、后判接邻、且不带部队上下文

`CampaignRoot.ts`（旧 2836-2875，大地图上点「目的地已有我方部队」的城 → Deploy）：

```
2838:       // 這裡先撤隊，攻城結果由 BattleRoot 的 recordBattleResult（省略 armyId）處理。
2839:       GameState.removeArmy(siege.id);            // 先撤队（部队已落盘删除）
2840:       this.save = GameState.loadSave();
2841:       if (GameState.distanceFromOwned(selected, this.paths) !== 1) {
2842:         this.hintText = '不接壤：只能打與我方相鄰的城。';
2843:         this.refresh();
2844:         return;                                    // ← 不接壤时部队已经没了，白丢
2845:       }
...
2862:       GameState.setDeployArmy(null);
2866:       GameState.setDeployFrom(siege.from);
2867:       GameState.setDeployTarget(selected);
...
2875:       director.loadScene('Deploy');               // ← 同样没有部队快照
```

即使这里成功进 Deploy，也是「重新派兵」屏（同 A+B），且撤队发生在守卫之前。

### 关于用户说的「武将不见了」

不是武将数据被删：Deploy 屏的候选名单是**按出发城当前存档重新算的**（`DeployRoot.start()` 里 `officerNamesOfCity(save, this.home, ctx)` → 过滤「在本城之外行军的武将」（away）→ 按太守优先、STR+INT 排序 → 截 12 人）。刚抵达那支部队已被 `removeArmy()` 从存档删除，它的编制（主将/随军/兵数/站位）**根本没有进入这个屏**；屏上显示的是「出发城现在还能派的将和兵」。所以玩家看到的不是自己刚派出去的那支队伍——与用户描述一致。此外旧 `deployMarch` 全仓库没有 `clearDeployMarch()` 调用点，残留上下文还会污染后续进入 Deploy 的场景。

---

## 5. 修法（R231，工作树已落地）

### 5.1 GameState.ts：新增「攻城战前准备」快照总线 + 放弃攻城的退款

`F:\sanguo\game\cocos\assets\scripts\GameState.ts`

- **`:1059` `export interface DeploySiege`**（`from/target/pathIndex/armyId/general/officers/troops/advisor`）；
- `:1072` `setDeploySiege()`、`:1076` `peekDeploySiege()`、`:1080` `clearDeploySiege()`（模块内存，一次性消费）；
- `:1091` `refundSiegeTroops(from, troops, cap = CITY_TROOP_CAP)`：`cities[from].troops = min(600, troops + 抵达兵数)` 并 `persistSave`，返回实退数量；
- `resetCache()`（文件末尾 `:1438`）追加 `deploySiege = null`。

口径依据：`game/web/campaign.html:4967-4972` 的 `refundArmy()` = `save.cities[a.from].troops = Math.min(600, troops + a.troops)`；`game/web/deploy.html` 的 army 模式 `commitMarchTroops()` 返回 `{ok:true, taken:0}`（不从城里扣兵），返回只跳 `campaign.html?sel=`（那时部队还没撤）。Cocos 侧撤队已发生，所以「返回大地图」采用 campaign「退兵」语义退款，避免玩家白丢一支部队。

### 5.2 CampaignRoot.ts：抵达写快照；撤队前先判守卫；清掉所有残留上下文

同一文件：

- `:4422` `startArrivalSiege()`：`removeArmy()` → `GameState.clearDeployMarch()` → `GameState.setDeploySiege(this.siegeSnapshotOf(...))`，再 `setDeployFrom/setDeployTarget/setDeployArmy(null)/setDeployEnemy/hint/loadScene('Deploy')` 保持原行为；
- `:4460` 新增 `private siegeSnapshotOf(army, target, from): GameState.DeploySiege`：主将、`officers`（过滤空值、截 4）、`troops=max(1,round(army.troops))`、`armyId`、`advisor`、`pathIndex`；
- `:2856-2857` 原来「城下已有部队」分支：**先**判 `distanceFromOwned(...) !== 1`（守卫前移，`:2843` 一带），**再** `removeArmy(siege.id)`，然后 `clearDeployMarch()` + `setDeploySiege(...)`；保留 `setDeployFrom(siege.from)`、`setDeployTarget(selected)`、`enemyIntelOf(selected)`、`setDeployArmy(null)` 原文（既有 `march_deploy_ctx.test.ts` 契约）；
- 四个进 Deploy 的入口（守城戰 `:2782-2783`、march 无部队 `:2822`、城下已有部队 `:2856`、抵达 `:4430`）都清掉另一种模式的残留：攻城入口清 `deployMarch`，派兵/守城入口清 `deploySiege`。

### 5.3 DeployRoot.ts：Deploy 屏加「攻城戰前準備」模式

`F:\sanguo\game\cocos\assets\scripts\DeployRoot.ts`

- `:330` `private siege: DeploySiege | null = null;`；`:555` `start()` 里 `this.siege = GameState.peekDeploySiege();`；
- `:2064` `applySiegeRoster(byName)`：`generals`/出阵队列**只由快照名单重建**（主将+随军去重、上限 `DEPLOY_SLOTS`），不混入出发城候选池；解析不到的将 → `generals = []`（空数组），交给 `fight()` 用快照 general 兜底；
- `:2088` `applySiegeTroops()`：兵力锁死 `soldiers = max(1,round(siege.troops))`、`cavalry = 0`、上限放宽到抵达兵数（不夹掉），提示「不能换将/改兵力」；
- `:1129` 标题 → `'攻 城 編 成'`；`refresh()` 的 `labelTarget` 增加「攻城 … N 兵 自 from 抵達 · 敵 M 兵」分支；
- `:1539` 底栏按钮文案：`const action = this.siege ? '出 戰' : '出 征';`；
- `:1982` `march()` 最顶端：`if (this.siege) { this.fight(); return; }`（放在「没有可用主将」检查之前，保证兜底路径也能开战）；
- `:2109` `fight()`：从快照构造 `BattleLoadout`（`gen/genStr/genInt/genLevel/troop/form/soldiers=抵达兵数/wise/home/bgen/btroop/bform/bsoldiers/rosterA/rosterB/armyId`）＋ `cols: this.deployCols()`，`clearDeploySiege()/clearDeployMarch()` 后 `GameState.startBattle(...)`，**不调用 `dispatchMarch()`**；
- `:2168` `abandonSiege()`：清快照/派兵上下文 → `refundSiegeTroops(siege.from, siege.troops)` → `loadScene('Campaign')`；
- 锁定交互：将卡（`gen`）点击 → 提示不能换将；兵力滑杆/快捷 50/80/100 → 不生效；`persistQueue()` 在攻城模式直接 return（不写出发城的派兵队列）；`drawQueue()` 主将行显示抵达兵数、其余行标「隨軍」（不再显示 makeSlot 默认的 10 兵）。
- 战斗结算复用既有 `BattleRoot.recordBattleResult(city, winner, armyId, defend, record)`：胜→占城、按 `armyId` 清部队（部队已不在存档时是 no-op，不双删）；败→不占城、部队消耗（不设 `defend`，所以不会误丢出发城）。

### 5.4 行为对照

| 操作 | 旧行为 | R231 新行为 |
|---|---|---|
| 抵达敌城/关卡 | 进「从出发城重新派兵」编成屏，部队已撤、屏上换了一批人 | 进「攻城戰前準備」：参战=刚抵达兵团，主将/随军/兵数锁定 |
| 该屏能改什么 | 换将、换兵、改兵力、重选出发城 | 只能阵形/兵种/军师技/前中後站位/出阵顺序 |
| 底部主按钮 | 「出 征」（再派一支新兵团） | 「出 戰」（直接进 Battle，带 `armyId`） |
| 返回大地图 | 回大地图，无部队（已被删），再来一轮 | 放弃攻城：兵退回出发城（cap 600），清快照，不产生新兵团 |
| 结果 | 每次抵达弹一次编成，无限循环 | 一次抵达只开一场战 |

---

## 6. 测试与验证

### 6.1 新增/修改的测试

| 文件 | 内容 |
|---|---|
| `game/tests/deploy_siege.test.ts`（新增，10 条，源码契约） | 快照总线接口/resetCache；`refundSiegeTroops`；`siegeSnapshotOf` 字段镜像；`startArrivalSiege` 顺序（removeArmy → clearDeployMarch → setDeploySiege，且不再 `setDeployMarch({`）；城下已有部队路「守卫在撤队前」；Deploy 屏两模式分支（start 读快照、锁将/锁兵、禁换将/禁滑杆/不落盘、`generals` 无条件覆盖）；`march()` 攻城分支在派兵之前且在「没有可用主将」之前；`fight()` 带 `armyId`/`cols`、不 `dispatchMarch`；`abandonSiege()` 退款+清快照+不造新兵团；按钮「出 戰」、标题「攻 城 編 成」、队列表「隨軍」 |
| `game/tests/deploy_siege_runtime.test.ts`（新增，6 条，**真跑 GameState**） | 抵达前提；旧路径循环（数据层复现，见 §3）；新路径一次开战（armies 为空、startBattle 带 armyId、结算占城、不造新兵团）；攻败只按 armyId 清自己那支；放弃攻城退款 cap 600 且落盘；未满 cap 原样退回/不重复退款 |
| `game/tests/march_arrival_auto.test.ts`（改第 2 条） | 由旧断言 `GameState.setDeployMarch(` 改为 R231：`clearDeployMarch()` + `setDeploySiege(` + `siegeSnapshotOf(army`，且 removeArmy 在写快照之前、不含 `setDeployMarch({` |

### 6.2 验证命令与结果（全部 0 退出）

```powershell
cd F:\sanguo\game
node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json   # exit 0（无输出）
node node_modules\typescript\bin\tsc --noEmit                        # exit 0
node --test "tests/*.test.ts"                                        # exit 0
```

| 项 | 结果 |
|---|---|
| cocos 侧 tsc | **exit 0**，无输出（`work/arrive_loop/tsc_cocos.log`） |
| 根 tsc | **exit 0**（`work/arrive_loop/tsc_root.log`） |
| 全量测试 | **tests 1946 / suites 89 / pass 1945 / fail 0 / todo 1 / skipped 0**（`work/arrive_loop/tests_full.log`） |
| 运行时长 | ≈5.1s |
| 专项 | `deploy_siege.test.ts` 10/10 pass；`deploy_siege_runtime.test.ts` 6/6 pass（`work/arrive_loop/runtime_harness.log`） |

计数说明：任务给的基线是 1924 tests / 1923 pass / 1 todo；本次 **+10**（`deploy_siege.test.ts`）、**+6**（`deploy_siege_runtime.test.ts`）= 1940；同时工作树里有**并行另一个任务**新增的 `game/tests/items_equip_bag.test.ts`（+6）和 `ItemsPanel.ts` 的改动（非本任务、未触碰），合计 **1946**。**fail 0** 与基线一致。

---

## 7. 制作人真机验收步骤

1. 新局 → 出征（如 平原 → 樂陵 或 界橋），带将带兵编成出征；
2. 等大地图时钟推进到部队抵达（兵团图标到城下/关卡）：
   - **期望**：进入「**攻 城 編 成**」战前准备屏；标题/目标行显示「攻城 … N 兵 自 平原 抵達」；主将与随军就是刚派出的那些人；兵力数字＝出发时的兵团兵数；
   - 试试点将卡/拖兵力滑杆 → 应提示「不能換將」「兵力鎖在抵達時的兵數」；
   - 底部按钮是「**出 戰**」而不是「出 征」；
3. 点「出 戰」→ 直接进 Battle（不再回大地图/不再派新兵团）；
   - 胜：回大地图后目标城已归我方（`owned` 增加），存档里没有该兵团（已结清）；
   - 败：回大地图，部队消耗，不占城、不丢出发城；
4. 另一路：抵达后点「**返 回 / 大地圖**」→ 放弃攻城，兵退回出发城（出发城守军 `+兵团兵数`，上限 600），场上不再出现该兵团，**不会再弹编成屏**；
5. 反复上述 1-4 多次，不应出现「到达一次弹一次」；存档 `sanguo_campaign_v1` 里 `armies` 不应出现同一目标上反复增生的新兵团。

---

## 8. 遗留风险 / 未做

1. **真机未验收**：web-mobile 构建早于本逻辑（§2），本报告只到「源码契约 + 真跑 GameState 的运行时 harness」层；Deploy 屏在攻城模式下的排版/立绘/5 将上限（`DEPLOY_SLOTS`）需真机看一眼。
2. **快照只在内存**：抵达瞬间 `removeArmy()` 已落盘，若玩家在「攻城戰前準備」屏杀进程/断电，重启后存档里既没有这支部队、内存快照也没了 → **兵与将会丢**。后续建议把 pending siege 落成存档字段（会动存档 schema，本次未做以控制风险）。
3. **攻城败＝部队消耗**（兵将不回出发城）。web/既有 `recordBattleResult` 也是 loss 删部队；若制作人希望「败退回出发城」需另立需求。
4. **攻城胜后的新城守军**：沿用 `recordBattleResult` 既有语义只 `owned.push(city)`，没有把抵达兵团的残兵并入新城守军（与旧 `dispatchMarch`+recordBattleResult 路径一致，非本次回归）。
5. 抵达处理「失败可重试但限次」：新路径 `removeArmy` 是幂等数据操作，`setDeploySiege` 后即便 `loadScene` 失败也不会每 tick 重弹（存档里已无该部队）；`arrivedNoticed` 仍是调用后标记（既有实现）。极端情况下若 `removeArmy` 返回 false（部队已不在），快照 `armyId` 仍写入，战后结算按 armyId 过滤是 no-op，不会误删别的部队。
6. `DeployRoot.march()` 里原有的「兵團出征」分支（大地图上主动从城里派兵）保持不动，仍走 `dispatchMarch()`；只有 `siege` 快照存在时才走 `fight()`。
7. 工作树里有并行任务的改动（`ItemsPanel.ts`、`items_equip_bag.test.ts`），提交时请分辨；本次未 `git add/commit`。

---

## 9. 遗留验证浏览器进程

本任务**从未启动** CDP 浏览器（因构建过旧，未执行 `cdpweb.mjs launch/run`）。收尾按任务要求仍执行了关闭与回收检查：

```
node work\cocos_verify\cdpweb.mjs close                      → no browser（exit 0，没有属于本任务的会话/进程）
node work\cocos_verify\reap.mjs                              → 遗留验证浏览器进程: 0
node work\cocos_verify\reap.mjs --kill --match=arrive-loop   → 遗留验证浏览器进程: 0
```

**遗留验证浏览器进程: 0**（未误杀其它并行任务可能存在的浏览器；执行时全局 CDP 浏览器计数也是 0）。

---

## 10. 变更文件与证据文件

改动（全部未提交）：

| 文件 | 说明 |
|---|---|
| `game/cocos/assets/scripts/GameState.ts` | `DeploySiege` 快照总线 + `refundSiegeTroops` + `resetCache` 清快照（+51 行） |
| `game/cocos/assets/scripts/CampaignRoot.ts` | `startArrivalSiege` 改写成写快照；`siegeSnapshotOf` 新增；城下已有部队路守卫前移+写快照；四处 Deploy 入口清残留上下文 |
| `game/cocos/assets/scripts/DeployRoot.ts` | 攻城戰前準備模式（锁将/锁兵/出戰→`fight()`/返回→`abandonSiege()`/禁换将禁滑杆/队列表显示） |
| `game/tests/march_arrival_auto.test.ts` | 第 2 条契约改成 R231 快照断言 |
| `game/tests/deploy_siege.test.ts` | 新增 10 条源码契约测试 |
| `game/tests/deploy_siege_runtime.test.ts` | 新增 6 条真跑 GameState 的运行时回归测试 |

证据文件（`F:\sanguo\work\arrive_loop\`）：

| 文件 | 内容 |
|---|---|
| `tsc_cocos.log` | cocos 侧 tsc 输出（空 + `exit=0`） |
| `tsc_root.log` | 根 tsc 输出（空 + `exit=0`） |
| `runtime_harness.log` | 运行时 harness：6 tests / 6 pass / 0 fail |
| `tests_full.log` | 全量测试：1946 tests / 1945 pass / 0 fail / 1 todo |
| `REPORT.md` | 本报告 |

复跑命令：

```powershell
cd F:\sanguo\game
node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json
node node_modules\typescript\bin\tsc --noEmit
node --test "tests/*.test.ts"
node --test tests/deploy_siege.test.ts tests/deploy_siege_runtime.test.ts
```
