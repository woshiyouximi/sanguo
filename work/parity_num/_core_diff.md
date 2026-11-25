# core/*.ts 归一化（仅去 import 的 .ts 后缀）后逐行 diff

| 文件 | 状态 | web 行 | cocos 行 | + | - | 首个差异行(web) |
|---|---|---|---|---|---|---|
| audio_bus.ts | DIFF | 771 | 770 | 7 | 8 | 122 |
| battle.ts | DIFF | 2379 | 2357 | 14 | 36 | 24 |
| capture.ts | DIFF | 557 | 559 | 8 | 6 | 152 |
| garrison.ts | SAME | 560 | 560 | 0 | 0 | - |
| levels.ts | SAME | 141 | 141 | 0 | 0 | - |
| march.ts | DIFF | 177 | 178 | 2 | 1 | 136 |
| roster.ts | DIFF | 689 | 696 | 11 | 4 | 407 |
| strategy.ts | DIFF | 1048 | 1045 | 1 | 4 | 499 |
| syso_host.ts | SAME | 1754 | 1754 | 0 | 0 | - |
| unlock.ts | DIFF | 439 | 448 | 15 | 6 | 76 |
| weather.ts | SAME | 86 | 86 | 0 | 0 | - |
| wises.ts | DIFF | 628 | 560 | 62 | 130 | 33 |
| wises_effects.ts | DIFF | 236 | 155 | 23 | 104 | 2 |
| smartscript/runtime.ts | DIFF | 1350 | 1298 | 21 | 73 | 27 |
| smartscript/so.ts | SAME | 252 | 252 | 0 | 0 | - |
| smartscript/syscalls.ts | DIFF | 457 | 438 | 7 | 26 | 53 |
| smartscript/vm.ts | SAME | 862 | 862 | 0 | 0 | - |

## audio_bus.ts  (DIFF)

-   122  *   [X]  仅按 m<fx_dir>sndNN 命名约定 + 文件存在（推测）。**已清零**：原 043/080/102
-   123  *        三条经效果函数字节码取证升 [A]（043→m032snd01、102→m031snd01、080 值不变）。
+   122  *   [X]  仅按 m<fx_dir>sndNN 命名约定 + 文件存在（推测）。
    124  * 110/110 有串；004/033/007 三组由 [C] 裁决（脚本层无调用点，物件层有播放点）。
    125  */
  ──
    167   '041': 'm017snd02',   // [A] 炎龍絕殺 dir017
    168   '042': 'm005snd01',   // [A] 五雷轟頂 dir005
-   169   '043': 'm032snd01',   // [A] 狂雷天牢 dir022（Sparkle→CreateSparkle 直证）
+   168   '043': 'm022snd01',   // [X] 狂雷天牢 dir022
    170   '044': 'm018snd03',   // [C] 天地無用 dir018
    171   '045': 'arrow',       // [C] 飛矢 dir006
  ──
    204   '078': 'm025snd01',   // [A2] 太極華陣 dir025
    205   '079': 'm028snd01',   // [A] 滾石遽壓 dir028
-   206   '080': 'm029snd01',   // [A] 八卦奇陣 dir029（Pa→CreatePa 直证）
+   205   '080': 'm029snd01',   // [X] 八卦奇陣 dir029
    207   '081': 'm002snd01',   // [A] 伏兵連陣 dir002
    208   '082': 'm004snd01',   // [C] 駟衝車 dir004
  ──
    226   '100': 'm011snd01',   // [A] 旋龍天舞 dir001
    227   '101': 'm020snd01',   // [A] 地獄之門 dir020
-   228   '102': 'm031snd01',   // [A] 集火柱 dir021（FirePillar→CreateFirePillar 直证）
+   227   '102': 'm021snd01',   // [X] 集火柱 dir021
    229   '103': 'm021snd01',   // [A] 神火怒張 dir010
    230   '104': 'm004snd01',   // [C] 神鬼亂舞 dir004
  ──
    244   '025':'A', '026':'A2', '027':'A', '028':'C', '029':'A', '030':'C', '031':'A', '032':'A2',
    245   '033':'A', '034':'A2', '035':'A', '036':'A2', '037':'A', '038':'A2', '039':'C', '040':'A',
-   246   '041':'A', '042':'A', '043':'A', '044':'C', '045':'C', '046':'A', '047':'C', '048':'C',
+   245   '041':'A', '042':'A', '043':'X', '044':'C', '045':'C', '046':'A', '047':'C', '048':'C',
    247   '049':'A', '050':'A', '051':'A', '052':'A', '053':'A', '054':'A', '055':'C', '056':'A2',
    248   '057':'A', '058':'A', '059':'A', '060':'A', '061':'A', '062':'A', '063':'A', '064':'C',
  ──
    248   '057':'A', '058':'A', '059':'A', '060':'A', '061':'A', '062':'A', '063':'A', '064':'C',
    249   '065':'C', '066':'A', '067':'A', '068':'A', '069':'C', '070':'A', '071':'A', '072':'C',
-   250   '073':'A', '074':'C', '075':'A', '076':'A', '077':'A', '078':'A2', '079':'A', '080':'A',
+   249   '073':'A', '074':'C', '075':'A', '076':'A', '077':'A', '078':'A2', '079':'A', '080':'X',
    251   '081':'A', '082':'C', '083':'A', '084':'A', '085':'A', '086':'A', '087':'C', '088':'A',
    252   '089':'A', '090':'C', '091':'C', '092':'A', '093':'A', '094':'A', '095':'A', '096':'A',
  ──
    251   '081':'A', '082':'C', '083':'A', '084':'A', '085':'A', '086':'A', '087':'C', '088':'A',
    252   '089':'A', '090':'C', '091':'C', '092':'A', '093':'A', '094':'A', '095':'A', '096':'A',
-   253   '097':'A', '098':'A', '099':'A', '100':'A', '101':'A', '102':'A', '103':'A', '104':'C',
+   252   '097':'A', '098':'A', '099':'A', '100':'A', '101':'A', '102':'X', '103':'A', '104':'C',
  ──

## battle.ts  (DIFF)

-    24 import { wiseAppliedAtStart, wiseBonus } from './wises';
+    24 import { wiseBonus } from './wises';
     25 import { normalizeWeather, weatherHitMod, weatherOf } from './weather';
     26 // R37 策略派發 / 援軍：純邏輯在 strategy.ts，本檔只做接線（見 project/61_策略与援军.md）
  ──
     61 export const ACTION_INTERVAL_TICKS = 40;
     62 /**
-    63  * 士兵/小队行动间隔（tick）＝原作 **40 帧**。
+    63  * 士兵/小队行动间隔（tick）＝原型手感值 120（4 s）。
     64  *
  ──
     64  *
-    65  * 旧值 120 是原型手感值（`project/09_战斗原型说明.md:104` 的 18→36→60→90→120），
-    66  * `project/15_数值模拟报告.md:158` 记作 `[偏差·待核]`。R113 补了原作证据，改回 40：
-    67  *  - 行动节奏计时器 `0x43B574` 本身与兵种无关，复位时**硬编码** `[u+0x34] = 0x28`(40)
-    68  *    （`work/dis_battle_units.txt:1624`，`0043B5DE mov dword ptr [ecx+0x34], 0x28`）；
-    69  *    只有 `[u+0x3c] != 0` 走脚本接管分支、以及 `flags & 0x4000` 时改 `0x2e`(46) 两个例外。
-    70  *  - 小队更新器 `0x43D125`（`docs/04b3:41-47`）在 `0x43D24B` 就用**同一个** `0x43B574(u)`
-    71  *    （参数 `[u+0x84]`＝该小队的代表兵）开它的整套行动块：计时器没到期就 `je 0x43d3b3`
-    72  *    只做逐帧动画更新，到期才找目标/掷伤害/发动画事件（`work/dis_battle_units.txt:4136-4239`）。
-    73  *  - 主将更新器 `0x43E964` 在 `0x43EB50` 是**逐行同形**的调用（同文件 `:6205`），
-    74  *    故主将/士兵在原作里共用 40 帧，士兵没有独立值。
-    75  * 逐帧移动 vs 40 帧一次的"行动"（选目标+掷伤+动画事件）的分工也与本作一致（移动每 tick、攻击
-    76  * 由 `actionIntervalOf` 把闸），所以这就是 1:1 的对应值，而不是新调的手感值。
-    77  */
-    78 export const ATTACK_COOLDOWN = 40;
-    79 /**
-    80  * 该单位的行动间隔（tick）。两个常量分开留着是为了保留两条独立的证据链
-    81  * （主将 `0x43B574` 直证 / 士兵 `0x43D125`→`0x43B574` 间接证），数值当前都是 40。
+    65  * 原作小队更新器 `0x43D125` 与主将更新器 `0x43E964` 是"结构几乎相同"的兄弟函数
+    66  * （`docs/04b3:41-47`），`[推测]` 它同样走 `0x43B574` 的 40 帧；但该函数没有逐行反汇编，
+    67  * 40 帧用在士兵身上仍是推断，而仓库的节奏基线（`tests/battle.test.ts` 的「单局时长」）
+    68  * 是按 120 标定的。故 R84 只把主将改到 40，士兵保持原值：改动只落在"有直接反汇编证据 +
+    69  * 有实测症状"的那一半。要一并改，请按 `project/105_战斗反馈与节奏.md` 的补丁建议同步
+    70  * 修改 `tests/battle.test.ts` 的时长区间。
     82  */
  ──
     82  */
+    72 export const ATTACK_COOLDOWN = 120;
+    73 /** 该单位的行动间隔（tick）。主将 = 原作 40 帧；士兵 = 原型手感值（见上面两个常量的注释）。 */
     83 export function actionIntervalOf(u: Unit): number {
     84   return u.isGeneral ? ACTION_INTERVAL_TICKS : ATTACK_COOLDOWN;
  ──
   1335   const strategyAtk = world.army?.[side]?.atkMod ?? 0;
   1336   const base = 150 + rt.troopBonus + rt.terrainBonus + rt.formationBonus + moraleTerm(rt.morale) + strategyAtk;
-  1337   // R33：軍師技「士兵攻擊力上昇 / 強化士兵」是**加點數**，不是乘百分比。
-  1338   // 原作 `0x44D450` 的 exec 21-23 對 `ownArmy+0x70 += 10/20/30`、exec 24-26 對
-  1339   // `foeArmy+0x70 -= 10/20/30`；`+0x70` 就是這個 150 起步的戰力和（docs/04b5 §1.2/§1.3）。
-  1340   // `0x442EFA`/`0x443498` 的五段加算裡沒有任何乘法指令（docs/04b5 §4.1）。
-  1341   // 舊式 `Math.round(base * (1 + bonus/100))` 是本作自造，R33 已按原作改成純加法；
-  1342   // 沒有軍師技時 `bonus = 0`，結果與原式逐位相同。詳見 project/109。
-  1343   return base + wiseBonus(world, side, 'troop_atk');
+  1328   // 军师技"士兵攻擊力上昇"：按**百分比**放大战力，而不是加绝对值
+  1329   // （依据：docs/04b §4.3 `unit+0x38` 数值 / project/26 §2 表 "士兵攻擊 +8%"）。
+  1330   // 没有军师技时系数为 1，结果与原式逐位相同。
+  1331   return Math.round(base * (1 + wiseBonus(world, side, 'troop_atk') / 100));
   1344 }
   1345 
  ──
   1580   // R37：策略派發（每側接戰後派一次）與援軍入場（狀態機）。放在 recompute 之後，
   1581   // 因為「喝阻敵軍」要按剛算出的 `aliveInf/aliveCav` 抽兵。
-  1582   // R88：軍師技「一場只結算一次」——戰前 `applyWise()` 已經真正改過狀態的 seq，
-  1583   // 不再進戰中派發器。main.js 會把出征頁的 `?wise=` 同時接到戰前效果與 `army.seq`，
-  1584   // 不摘掉的話同一條技會被算兩遍（例：離間計 L3 忠誠 −25 → −50）。這裡只讀
-  1585   // `wiseAppliedAtStart()` 的清單並清 seq，不動任何戰鬥公式；滿血時沒有生效的
-  1586   // 恢復類（11/40/57、12/41/58）不在清單裡，仍由派發器在戰中持續回復。
-  1587   for (const side of ['A', 'B'] as const) {
-  1588     const army = world.army?.[side];
-  1589     if (!army || army.seq == null) continue;
-  1590     if (wiseAppliedAtStart(world, side).includes(army.seq)) army.seq = null;
-  1591   }
  ──

## capture.ts  (DIFF)

-   152   for (const sc of data.scenarios ?? []) {
-   153     for (const k of sc?.kings ?? []) {
+   152   const scenarios = data.scenarios ?? [];
+   153   for (const sc of scenarios) {
+   154     const kings = sc?.kings ?? [];
+   155     for (const k of kings) {
    154       if (k && k.NAME === g.name) return true;
    155     }
  ──
    450   }
    451 
-   452   // 5) 掉落：**原作战斗不掉落任何物品**（`docs\04b2-战斗流程.md` §5.1 负证据）。
-   453   //    旧实现「胜方战后无条件掷一次轮盘」是取巧/加戏，已按原作删除（R57）。
-   454   //    `rollDrop()` 保留给内政搜索（`city_model.js` 走的是另一条路）与测试用，
-   455   //    这里不再调用；`report.drops` 恒为空数组，调用方不必改。
+   454   // 5) 掉落：原作战斗不掉落（§5.1 负证据），本作按需求在胜方战后掷一次轮盘
+   455   const drop = rollDrop(data, ws.general.level, taken, rng);
+   456   if (drop) report.drops.push(drop);
+   457 
  ──

## march.ts  (DIFF)

-   136   for (const raw of Array.isArray(path.points) ? path.points : []) {
+   136   const points = Array.isArray(path.points) ? path.points : [];
+   137   for (const raw of points) {
  ──

## roster.ts  (DIFF)

-   407   for (const sc of ((data?.scenarios ?? []) as unknown as KingsRow[]) || []) {
-   408     for (const k of sc?.kings ?? []) {
+   407   // Cocos 的 Babel 不能吃「for-of 的头是逻辑表达式」：`for (const x of a || b)` 会在
+   408   // plugin-transform-for-of 的类型推断里崩（`Property types[1] of TSUnionType ... GenericTypeAnnotation`），
+   409   // 而 tsc 全绿。提成常量即可（同 PUBLISH 清单里「三元式提成常量」那条坑）。
+   410   const rows = ((data?.scenarios ?? []) as unknown as KingsRow[]) || [];
+   411   for (const sc of rows) {
+   412     const kings = sc?.kings ?? [];
+   413     for (const k of kings) {
    409       const n = String(k?.NAME ?? '');
    410       if (n && !seen.has(n)) {
  ──
    549     emit(name, 'executed');
    550   }
-   551   for (const raw of opts.atCity ?? []) {
+   556   const atCity = opts.atCity ?? [];
+   557   for (const raw of atCity) {
    552     const name = String(raw ?? '');
    553     if (!kings.has(name)) continue; // 只有君主才配"逃走"这一行
  ──
    600   const cleared: string[] = [];
    601 
-   602   for (const card of cards ?? []) {
+   608   const cardList = cards ?? [];
+   609   for (const card of cardList) {
  ──

## strategy.ts  (DIFF)

-   499       // 原作 `0x44DE44` 這條分支只有 `push 0x491900("成功")` + 消息欄，沒有任何狀態改動
-   500       // （`work/dis_battle_B_44D450.txt:763`）——照抄，不造第 3 回合補兵。
-   501       // 「3」是 SEQUENCE 3，不是回合數；真實效果在戰前選將流程（ATTRIB=1），
-   502       // 需要戰役編成層的出陣隊列，見 project/109 的 [阻塞] 說明。
+   499       // 原作這條分支只打一條「成功」，沒有任何狀態改動 —— 照抄
  ──

## unlock.ts  (DIFF)

-    76   for (const tok of general.UseForce ?? []) {
+    76   const useForce = general.UseForce ?? [];
+    77   for (const tok of useForce) {
     77     const i = troopIndexOf(tok);
     78     if (i >= 0) return i;
  ──
     78     if (i >= 0) return i;
     79   }
-    80   for (const tok of general.Force ?? []) {
+    81   const force = general.Force ?? [];
+    82   for (const tok of force) {
     81     const i = troopIndexOf(tok);
     82     if (i >= 0) return i;
  ──
     89   const current = formationIndexOf(general.UseBattleArray);
     90   if (current >= 0) return current;
-    91   for (const tok of general.BattleArray ?? []) {
+    93   const battleArray = general.BattleArray ?? [];
+    94   for (const tok of battleArray) {
     92     const i = formationIndexOf(tok);
     93     if (i >= 0) return i;
  ──
     98 function toIndexes(tokens: string[] | undefined, indexOf: (t: string) => number): number[] {
     99   const out = new Set<number>();
-   100   for (const tok of tokens ?? []) {
+   103   const list = tokens ?? [];
+   104   for (const tok of list) {
    101     const i = indexOf(tok);
    102     if (i >= 0) out.add(i);
  ──
    102     if (i >= 0) out.add(i);
    103   }
-   104   return [...out].sort((a, b) => a - b);
+   108   // 注意：这里必须写 Array.from，不能写 [...out]。
+   109   // Creator 的 Babel（plugin-transform-spread loose 模式）把 [...set] 编成
+   110   // `[].concat(set)`，Set 不会被展开，运行期得到 [Set] 而不是 number[]，
+   111   // 兵种/阵形白名单因此整排误判成「未学」。
+   112   return Array.from(out).sort((a, b) => a - b);
    105 }
    106 
  ──
    256 function uniqSeqs(list: readonly number[] | undefined): number[] {
    257   const out: number[] = [];
-   258   for (const v of list ?? []) {
+   266   const seqs = list ?? [];
+   267   for (const v of seqs) {
  ──

## wises.ts  (DIFF)

-    33  *  troop_atk 兵   我軍士兵攻擊 +10/20/30 點     17,46,64 增強攻擊（exec 21-23）        powerOf
-    34  *                 敵軍士兵攻擊 −10/20/30 點     16,45,63 強化士兵（exec 24-26）        powerOf
+    33  *  troop_atk 兵   我軍士兵攻擊 +8/14/20%       16,45,63 強化士兵                     powerOf
+    34  *                 我軍士兵攻擊 +10/18/26%      17,46,64 增強攻擊                     powerOf
     35  *  general_up 將  主將武力 +4/7/10             22,49,67 強化武將                       hitChance（讀 str）
     36  *  exp_up  經驗   戰後經驗 +15/25/40%          21,47,65 增加經驗                       settle
  ──
     51  *      （atkMod:1233 · moveMul:1407 · takenMul:1461 · noRetreat:1582 · mayRetreat/
     52  *      fleeAnytime:1607 · sealMagic:1762）。在本表重複登記 = 出征頁一次 + 戰中一次 = 雙倍。
-    53  *    · 1 條仍佔位（`WISE_SYSO_UNSUPPORTED`）：3 後選出陣（Execute 34）。**[阻塞]**
-    54  *      這條不是「沒查」：`0x44DE44` 只有 `push 0x491900("成功")` + 消息欄 + 函數尾，
-    55  *      没有任何狀態寫入（`work/dis_battle_B_44D450.txt:763`）；`ATTRIB=1` 是戰前選擇
-    56  *      （`docs/03a-武将技表MAGIC.md:297` / `project/26` §）。真實語義是「後選出陣」：
-    57  *      使用方在敵方之後選將/兵種（三國群英傳2 攻略多源一致），需要的是戰役編成層的
-    58  *      5 將出陣隊列 + 開戰前重排，不是戰鬥內第 3 回合補兵。缺：Obj3 部隊池
-    59  *      （`docs/07b` §6，5 個武將槽）在戰場內核的消費點；另外 3 處測試把「只有日誌」
-    60  *      釘死（`wises_r84.test.ts:84-135`、`wises.test.ts:291`、
-    61  *      `strategy.test.ts:363`），都不在本輪可改清單。詳見 `project/109`。
+    53  *    · 1 條真佔位（`WISE_SYSO_UNSUPPORTED`）：3 後選出陣（Execute 34）—— 原作那條分支
+    54  *      只有一條日誌、沒有數值改動；本作沒有「出陣隊列」，要做需要 SSAV 預備兵欄位或
+    55  *      EVENT 表裡的出陣事件。
     62  *
     63  *  舊版這裡寫「24 條 unimplemented = World 沒有字段」，R84 逐條盤完是錯的：其中 21 條的
  ──
     70  *        aliveCount），所以下一 tick 就生效。
     71  *  mod ：不改數值，累積到 `world.wises = [{ side, kind, value, seq }]` 側表，由 battle.ts
-    72  *        的 4 個消費點各消費一次。**量綱按通道分，不是同一個口徑**：
-    73  *          · `troop_atk` 是**點**：`powerOf = base + wiseBonus(...,'troop_atk')`
-    74  *            （原作 `0x44D450` exec 21-26 直接 `army+0x70 += v`；`0x442EFA` 無乘數）
-    75  *          · `qi_regen` 是**百分比**：`qiRegenOf(g) * (1 + bonus/100)`
-    76  *          · `qi_cost`  是**百分比**：`1 + bonus/100`（值是負數）
-    77  *          · `exp_bonus` 是**百分比**：`expBase * (1 + bonus/100)`
-    78  *        後三個在原作有乘算證據（`0x43E72E` 跳表 130/150/200/76/66/50%、`0x4103DE`
-    79  *        真百分比、`unit+0x3C` 經驗倍率），所以同一批 MOD 裡 3 條乘算、1 條加法
-    80  *        不是不一致，是原作如此。詳見 `project/109_加法口径与Execute34.md`。
-    81  *        測試見 `game/tests/wises.test.ts` 的「R69 消費點」段（逐條量測 delta）。
+    66  *        的 4 個消費點各乘一次（百分數）：
+    67  *          · `tickSkills` battle.ts:1265  `qiRegenOf(g) * (1 + wiseBonus(...,'qi_regen')/100)`
+    68  *          · `qiCostMul`  battle.ts:1155  `1 + wiseBonus(...,'qi_cost')/100`（值是負數）
+    69  *          · `powerOf`    battle.ts:743   `base * (1 + wiseBonus(...,'troop_atk')/100)`
+    70  *          · `settle`     battle.ts:1434  `expBase * (1 + wiseBonus(...,'exp_bonus')/100)`
+    71  *        這些乘法在 battle.ts 主循環裡，`applyWise` 只負責登記；測試見
+    72  *        `game/tests/wises.test.ts` 的「R69 消費點」段（逐條量測 delta）。
     82  *        `applyWiseOnBattleStart` 是給 campaign 的一次性入口：戰前按武將 WISESKILL
     83  *        自動替 AI 側挑一條（玩家側由出征頁自己挑）。
  ──
     90 import type { Side, Unit, World } from './battle';
     91 import type { GameData, General } from '../types';
-    92 import { applyExtraSpec, WISE_EXTRA_SPECS, WISE_STRATEGY_HINTS } from './wises_effects';
-    93 export {
-    94   WISE_EXTRA_SPECS,
-    95   WISE_STRATEGY_HINTS,
-    96   WISE_STRATEGY_ONLY,
-    97   WISE_SYSO_UNSUPPORTED,
-    98 } from './wises_effects';
+    83 import { applyExtraSpec, WISE_EXTRA_SPECS } from './wises_effects';
+    84 export { WISE_STRATEGY_ONLY, WISE_SYSO_UNSUPPORTED } from './wises_effects';
     99 
    100 // ---------------------------------------------------------------------------
  ──
    134 };
    135 
-   136 /** `world.wises` 的通道名。量綱：`troop_atk` = 點（加到 150 起算的戰力和），其餘 = 百分比。 */
+   122 /** `world.wises` 的通道名：battle.ts 主循環認這四個 key。 */
    137 export type WiseChannel = 'qi_regen' | 'qi_cost' | 'troop_atk' | 'exp_bonus';
    138 
  ──
    154     | 'loyal'
    155     | 'persuade'
-   156     | 'dispel'
-   157     | 'hp_regen'
-   158     | 'mp_regen'
-   159     | 'no_retreat';
+   142     | 'dispel';
    160   value: number;
    161   channel?: WiseChannel;
  ──
    172   42: { kind: 'mp', target: 'self', op: 'mp_max', value: 20, note: '技力上限 +20' },
    173   60: { kind: 'mp', target: 'self', op: 'mp_max', value: 30, note: '技力上限 +30' },
-   174   // 恢復技力：原作 exec 38-40 是「戰鬥中每 N 幀回 +0x88 點」的持續回復（旗標 0x2），
-   175   // 不是瞬回 —— 舊實作的 `mp_restore 24/40/60` 在滿技力開戰時等於沒寫（probe 證實）。
-   176   12: { kind: 'mp', target: 'self', op: 'mp_regen', value: 30, note: '戰中技力持續回復 +30' },
-   177   41: { kind: 'mp', target: 'self', op: 'mp_regen', value: 50, note: '戰中技力持續回復 +50' },
-   178   58: { kind: 'mp', target: 'self', op: 'mp_regen', value: 70, note: '戰中技力持續回復 +70' },
+   157   // 恢復技力：只回當前技力
+   158   12: { kind: 'mp', target: 'self', op: 'mp_restore', value: 24, note: '技力 +24' },
+   159   41: { kind: 'mp', target: 'self', op: 'mp_restore', value: 40, note: '技力 +40' },
+   160   58: { kind: 'mp', target: 'self', op: 'mp_restore', value: 60, note: '技力 +60' },
    179   // 增加體力：上限與當前體力一起加
    180   14: { kind: 'hp', target: 'self', op: 'hp_max', value: 15, note: '體力上限 +15' },
  ──
    181   43: { kind: 'hp', target: 'self', op: 'hp_max', value: 25, note: '體力上限 +25' },
    182   61: { kind: 'hp', target: 'self', op: 'hp_max', value: 40, note: '體力上限 +40' },
-   183   // 恢復體力：原作 exec 35-37 是持續回復（旗標 0x1，參數 40/60/80），不是瞬回。
-   184   11: { kind: 'hp', target: 'self', op: 'hp_regen', value: 40, note: '戰中體力持續回復 +40' },
-   185   40: { kind: 'hp', target: 'self', op: 'hp_regen', value: 60, note: '戰中體力持續回復 +60' },
-   186   57: { kind: 'hp', target: 'self', op: 'hp_regen', value: 80, note: '戰中體力持續回復 +80' },
+   165   // 恢復體力：只回當前體力
+   166   11: { kind: 'hp', target: 'self', op: 'hp_restore', value: 24, note: '體力 +24' },
+   167   40: { kind: 'hp', target: 'self', op: 'hp_restore', value: 40, note: '體力 +40' },
+   168   57: { kind: 'hp', target: 'self', op: 'hp_restore', value: 60, note: '體力 +60' },
    187   // 鼓舞士氣
    188   1: { kind: 'morale_up', target: 'self', op: 'morale_add', value: 5, note: '我軍士氣 +5' },
  ──
    209   35: { kind: 'qi_down', target: 'enemy', op: 'mod', channel: 'qi_regen', value: -40, note: '敵軍集氣 −40%' },
    210   53: { kind: 'qi_down', target: 'enemy', op: 'mod', channel: 'qi_regen', value: -60, note: '敵軍集氣 −60%' },
-   211   // 增強攻擊（Execute 21/22/23）：我方士兵攻擊 +10/+20/+30 點（`army+0x70 += v`）
-   212   17: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 10, note: '士兵攻擊 +10' },
-   213   46: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 20, note: '士兵攻擊 +20' },
-   214   64: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 30, note: '士兵攻擊 +30' },
-   215   // 強化士兵（Execute 24/25/26）：敵方士兵攻擊 −10/−20/−30 點（`foeArmy+0x70 -= v`）
-   216   16: { kind: 'troop_atk', target: 'enemy', op: 'mod', channel: 'troop_atk', value: -10, note: '敵軍士兵攻擊 −10' },
-   217   45: { kind: 'troop_atk', target: 'enemy', op: 'mod', channel: 'troop_atk', value: -20, note: '敵軍士兵攻擊 −20' },
-   218   63: { kind: 'troop_atk', target: 'enemy', op: 'mod', channel: 'troop_atk', value: -30, note: '敵軍士兵攻擊 −30' },
+   193   // 強化士兵 / 增強攻擊
+   194   16: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 8, note: '士兵攻擊 +8%' },
+   195   45: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 14, note: '士兵攻擊 +14%' },
+   196   63: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 20, note: '士兵攻擊 +20%' },
+   197   17: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 10, note: '士兵攻擊 +10%' },
+   198   46: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 18, note: '士兵攻擊 +18%' },
+   199   64: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 26, note: '士兵攻擊 +26%' },
    219   // 強化武將
    220   22: { kind: 'general_up', target: 'self', op: 'str_add', value: 4, note: '主將武力 +4' },
  ──
    225   47: { kind: 'exp_up', target: 'self', op: 'mod', channel: 'exp_bonus', value: 25, note: '戰後經驗 +25%' },
    226   65: { kind: 'exp_up', target: 'self', op: 'mod', channel: 'exp_bonus', value: 40, note: '戰後經驗 +40%' },
-   227   // 十面埋伏（54）在 R88 移到 `WISE_EXTRA_SPECS`：原作 Execute 44 的效果是
-   228   // 「敵方無法退兵」（`foeArmy+0x84 |= 4`），不是「我方後排 +6 兵」（舊實作無原作依據）。
+   208   // 十面埋伏：戰前在我方後排追加伏兵
+   209   54: { kind: 'ambush', target: 'self', op: 'units', value: 6, note: '後排伏兵 +6' },
    229 };
    230 
  ──
    238  * 其中 12 條不是「沒生效」——它們在戰中派發器 `strategy.ts:runStrategy()` 裡已落地，
    239  * 見 `WISE_STRATEGY_ONLY`；這裡不重複登記是為了不與派發器雙算。
-   240  * 只有 3（後選出陣）仍佔位：`0x44DE44` 只有一條「成功」日誌，真實效果在戰前選將流程
-   241  * （ATTRIB=1），需要戰役編成層的 5 將出陣隊列 + 開戰前重排；戰場內核沒有這個結構，
-   242  * 且 3 處測試把現狀釘死（見 `project/109`）。**[阻塞]**
+   221  * 只有 3（後選出陣）是 `WISE_SYSO_UNSUPPORTED` 的真佔位。
    243  */
    244 export const WISE_UNIMPLEMENTED: readonly number[] = [
  ──
    256   side: Side;
    257   kind: WiseChannel;
-   258   /** `troop_atk` = 點（+10 = 戰力 +10）；其餘三個 = 百分比（+25 = +25%，−60 = −60%） */
+   237   /** 百分比增減（+25 = +25%，−60 = −60%） */
    259   value: number;
    260   seq: number;
  ──
    269 
    270 /**
-   271  * 某一側某個通道的合計值。**量綱按通道分**：
-   272  *   · `troop_atk` = 點：`powerOf` 直接 `base + wiseBonus(...)`
-   273  *   · `qi_regen` / `qi_cost` / `exp_bonus` = 百分比：消費點各自 `/100`
-   274  * 可疊加（同一側同一通道求和）。battle.ts 的 4 個消費點用它。
+   250  * 某一側某個通道的合計百分比（可疊加）。battle.ts 的 4 個消費點用它：
+   251  *   · tickSkills：`qi += qiRegenOf(g) * (1 + wiseBonus(world, side, 'qi_regen') / 100)`
+   252  *   · qiCostMul ：`mul = 1 + wiseBonus(world, side, 'qi_cost') / 100`（值是負數）
+   253  *   · powerOf   ：`power = base * (1 + wiseBonus(world, side, 'troop_atk') / 100)`
+   254  *   · settle    ：`expGain = expBase * (1 + wiseBonus(world, 'A', 'exp_bonus') / 100)`
    275  */
    276 export function wiseBonus(world: World, side: Side, channel: WiseChannel): number {
  ──
    300 const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
    301 
-   302 // ---------------------------------------------------------------------------
-   303 // 戰前生效紀錄（給 battle.ts 的「只結算一次」閘讀）
-   304 // ---------------------------------------------------------------------------
-   305 
-   306 /**
-   307  * 戰前 `applyWise` **真的改過狀態**的 seq（每側一份）。
-   308  *
-   309  * 為什麼需要：`main.js` 把出征頁選的 `?wise=` 同時傳給 `createWorld({strategy})`
-   310  * 與 `applyWise()`（`game/web/main.js:613-615/631/678`），於是同一條軍師技會先走
-   311  * 戰前效果、接戰後又被 `strategy.ts` 的派發器算一遍（例：離間計 L3 忠誠 −25 → −50）。
-   312  * `battle.ts` 的 `step()` 在 `tickStrategy()` 前讀這份清單，把已生效的 seq 從
-   313  * `army.seq` 摘掉 —— 每條技一場只結算一次，與 `0x44D450` 的「每側一次」一致。
-   314  *
-   315  * 只記「有觀測變化」的：滿血時的 `恢復體力`/`恢復技力`（11/40/57、12/41/58）戰前
-   316  * 改了等於沒改，這些仍留給戰中派發器（原作 exec 35-40 本來就是戰鬥內持續回復）。
-   317  */
-   318 const START_APPLIED = new WeakMap<World, Partial<Record<Side, number[]>>>();
-   319 
-   320 /** 戰前效果的狀態指紋：只覆蓋 `applySpec` 會寫的字段（雙方都看，target 可能是敵方）。 */
-   321 function wiseFingerprint(world: World, side: Side): string {
-   322   const foe: Side = side === 'A' ? 'B' : 'A';
-   323   const gs = [world.sides[side].general, world.sides[foe].general];
-   324   const mods = wiseModifiers(world);
-   325   let modSum = 0;
-   326   for (const m of mods) modSum = (modSum * 31 + m.value + m.kind.length * 7 + m.side.charCodeAt(0)) | 0;
-   327   return [
-   328     world.sides[side].morale,
-   329     world.sides[foe].morale,
-   330     world.units.length,
-   331     mods.length,
-   332     modSum,
-   333     world.army?.[side]?.flags ?? 0,
-   334     world.army?.[foe]?.flags ?? 0,
-   335     world.army?.[foe]?.seq ?? -1,
-   336     ...gs.flatMap((g) => [
-   337       g.hp,
-   338       g.maxHp,
-   339       g.mp,
-   340       g.mpMax,
-   341       g.str,
-   342       Math.round(g.tire ?? 0),
-   343       Math.round(g.loyal ?? -1),
-   344     ]),
-   345   ].join(',');
-   346 }
-   347 
-   348 function recordStartApplied(world: World, side: Side, seq: number): void {
-   349   const cur = START_APPLIED.get(world) ?? {};
-   350   const list = cur[side] ?? (cur[side] = []);
-   351   if (!list.includes(seq)) list.push(seq);
-   352   START_APPLIED.set(world, cur);
-   353 }
-   354 
-   355 /** 這一側戰前已真正生效的軍師技 seq（`battle.ts` 的 step 讀；空陣列 = 沒有）。 */
-   356 export function wiseAppliedAtStart(world: World, side: Side): readonly number[] {
-   357   return START_APPLIED.get(world)?.[side] ?? [];
-   358 }
-   359 
-   360 
    361 function applySpec(world: World, side: Side, seq: number, spec: Spec): boolean {
    362   const own = world.sides[side];
  ──
    401     case 'persuade':
    402     case 'dispel':
-   403     case 'no_retreat':
-   404     case 'hp_regen':
-   405     case 'mp_regen':
    406       return applyExtraSpec(world, side, spec);
    407   }
  ──
    459   const spec = SPECS[seq];
    460   if (!spec) return { ok: false, note: '未實作或未知的軍師技' };
-   461   const before = wiseFingerprint(world, side);
    462   if (!applySpec(world, side, seq, spec)) {
    463     // R84：只有「條件不滿足」會走這裡（勸降的忠誠閘），不是未實作。
  ──
    464     return { ok: false, kind: spec.kind, note: '條件不滿足，未生效' };
    465   }
-   466   // R88：只有真的改了狀態才記進「戰前已生效」，讓 step() 不再重複派發同一條。
-   467   if (wiseFingerprint(world, side) !== before) recordStartApplied(world, side, seq);
    468   return { ok: true, kind: spec.kind, note: spec.note };
    469 }
  ──
    471 /** UI 用：這一條的短效果描述；未實作返回 null。 */
    472 export function wiseHintOf(seq: number): string | null {
-   473   return SPECS[seq]?.note ?? WISE_STRATEGY_HINTS[seq] ?? null;
+   388   return SPECS[seq]?.note ?? null;
    474 }
    475 
  ──
    484  */
    485 export function parseWiseSkill(general: General): Array<[number, number]> {
-   486   const raw = general.WISESKILL;
-   487   if (!Array.isArray(raw)) return [];
+   401   // types.ts 把 WISESKILL 声明成 [number, number][]，实际数据可能是字符串，
+   402   // 所以先按 unknown 取出再判型（否则 typeof 分支会被收窄成 never）。
+   403   const raw = (general as unknown as { WISESKILL?: unknown }).WISESKILL;
+   404   // 数据里 WISESKILL 可能是一整串 "34, 47"（cocos 的 generals.json 就是这样），
+   405   // 也可能是一行一组的数组。字符串先按逗号/空白切成 token 再两两配对。
+   406   // 本副本相对 web 的偏离：web 那份由 deploy.html 自己 split，走不到这里。
+   407   const tokens: string[] = typeof raw === 'string'
+   408     ? raw.split(/[,\s]+/).filter((s) => s.length > 0)
+   409     : [];
+   410   const rows: unknown[] = typeof raw === 'string'
+   411     ? tokens.reduce<string[][]>((acc, tok, i) => {
+   412       if (i % 2 === 0) acc.push([tok]); else acc[acc.length - 1].push(tok);
+   413       return acc;
+   414     }, []).map((pair) => pair.join(','))
+   415     : Array.isArray(raw) ? (raw as unknown[]) : [];
+   416   if (rows.length === 0) return [];
    488   const out: Array<[number, number]> = [];
  ──
    488   const out: Array<[number, number]> = [];
-   489   for (const row of raw as unknown[]) {
+   418   for (const row of rows) {
    490     let learn = Number.NaN;
    491     let seq = Number.NaN;
  ──
    538     cur.learn = Math.min(cur.learn, learn);
    539   }
-   540   return [...best.values()].sort((a, b) => a.learn - b.learn).map((v) => v.seq);
+   469   // 注意：必须写 Array.from，不能写 [...best.values()]——Creator 的 Babel（loose
+   470   // spread）把它编成 `[].concat(iterator)`，迭代器不展开，sort/map 全落在迭代器上，
+   471   // 运行期回传 [undefined]，军师技列表显示成「技 undefined」。
+   472   return Array.from(best.values()).sort((a, b) => a.learn - b.learn).map((v) => v.seq);
  ──

## wises_effects.ts  (DIFF)

-     2  * 軍師技：戰前一次性效果的第二批登記表（R84 新增 11 條，R88 再加入十面埋伏 → 12 條）。
+     2  * 軍師技：戰前一次性效果的第二批登記表（R84 新增 11 條）。
      3  *
      4  * ── 為什麼是一個新文件 ────────────────────────────────────────────────────
  ──
      3  *
      4  * ── 為什麼是一個新文件 ────────────────────────────────────────────────────
-     5  * `wises.ts` 已經 500 行、主體是「分類 + 數值 + 側表」，再往裡塞 12 條規格會看不清。
+     5  * `wises.ts` 已經 500 行、主體是「分類 + 數值 + 側表」，再往裡塞 11 條規格會看不清。
      6  * 這裡只放兩樣東西：規格表 `WISE_EXTRA_SPECS` 和它的落地函數 `applyExtraSpec()`。
      7  * `wises.ts` 在模塊初始化時把這張表並進 `SPECS`，`applySpec()` 遇到新 op 就轉發過來。
  ──
      7  * `wises.ts` 在模塊初始化時把這張表並進 `SPECS`，`applySpec()` 遇到新 op 就轉發過來。
      8  *
-     9  * ── R88 的三處改動（都有原作負證據，見 `project/130`）────────────────────
-    10  *   1. 十面埋伏（54）：舊實作「我方後排 +6 兵」沒有原作依據；`0x44E09D` 起的分支是
-    11  *      `foeArmy+0x84 |= 4`（敵方無法退兵），敵將有坐騎時只打「破解我方埋伏」。
-    12  *      這裡改成寫 `noRetreat` 位，戰前/戰中兩條路徑寫的是同一個位（不會雙倍）。
-    13  *   2. 勸降（32）：原作成功分支只置 `foeArmy+0x84 |= 0x400`（敵將投靠），**不寫忠誠**；
-    14  *      這裡補上 0x400 位。忠誠 −15 保留為「投靠 → 戰後招降」的本作代理（`capture.ts`
-    15  *      的招降判定讀忠誠），屬 [推測]，見報告。
-    16  *   3. 新增 `WISE_STRATEGY_HINTS`：12 條戰中派發的 UI 提示。此前 `wiseHintOf()` 對它們
-    17  *      返回 null，出征頁把它們顯示成「原作有此技，本作尚未實作」——這正是 c5 誤判
-    18  *      「24 條占位」的直接來源之一。
-    19  *
-    20  * ── 這批技的依據 ──────────────────────────────────────────────────────────
-    21  * `0x44D450` 那 66 條分支已抄成 `strategy.ts:STRATEGY_TABLE`（`exec` = `Execute`）：
-    22  *   · Execute 9/10/11  → `or [unit2+0x34],0x1000` / `add [unit2+0x38],+1/+2/+3` → 4/25/51
-    23  *   · Execute 12/13/14 → `or [unit1+0x34],0x1000` / `sub [unit1+0x38],1/2/3`     → 5/27/50
-    24  *   · Execute 30/31/32 → `foeGen+0x3C -= 8/15/25`                               → 6/34/55
-    25  *   · Execute 33       → `foeArmy+0x84 |= 0x400` + 訊息「說服敵將投靠我方」      → 32
-    26  *   · Execute 44       → `foeArmy+0x84 |= 4`（有坐騎則破解）                    → 54
-    27  *   · Execute 57       → 只有日誌（真正取消在呼叫方，未定位）                    → 24
+     9  * ── 這 11 條的依據（不是猜的）──────────────────────────────────────────────
+    10  * 上一輪（R37/R83）把 `0x44D450` 那 66 條分支抄成了 `strategy.ts:STRATEGY_TABLE`
+    11  * （`exec` = `wises.json` 的 `Execute`），所以「戰中派發」的強度是反彙編定的：
+    12  *   · Execute 9/10/11  → `0x44DCxx` 敵將疲勞 +5/10/15      → SEQUENCE 4/25/51（擾亂敵將）
+    13  *   · Execute 12/13/14 → 己軍疲勞 −5/10/15                 → SEQUENCE 5/27/50（減少疲勞）
+    14  *   · Execute 30/31/32 → 敵將忠誠 −8/15/25                 → SEQUENCE 6/34/55（離間計）
+    15  *   · Execute 33       → 敵將忠誠 −15 + 投靠位             → SEQUENCE 32（勸降）
+    16  *   · Execute 57       → 「化解敵方軍師技」（只有日誌）     → SEQUENCE 24（化解計策）
+    17  * 本檔把同一批強度搬到**戰前**路徑（`applyWise`），因為這五類技在 `docs/04b §4.3` 裡
+    18  * 都是「出征前寫 `unit+0x34` 位掩碼 / `unit+0x38` 數值」的一次性效果。
     28  *
  ──
     28  *
-    29  * ── 消費點全部是既有的（battle.ts 只加了一處讀取點）─────────────────────
-    30  *   · `g.tire`     → `settle()` 讀 `g.tire ?? 0` → `SettleResult.tire`
-    31  *   · `g.loyal`    → `settle()` 讀 `g.loyal ?? row.Loyal ?? 50` → `.loyalty` → `capture.ts`
-    32  *   · `army.flags` → `battle.ts:1687` 的 `noRetreat` 讓 `requestRetreat()` 返回 false
-    33  *   · `army.seq`   → `strategy.ts:tickStrategy()` 的派發閘 → 敵方整場不派發
+    20  * ── 消費點全部是既有的（本輪 battle.ts 一行沒改）─────────────────────────
+    21  * 這正是 R84 的關鍵發現：這 11 條不是「沒有消費點」，而是「消費點早就有了，只是
+    22  * `wises.ts` 沒往那些字段寫」。三個落點：
+    23  *   · `g.tire`     → `settle()` 讀 `g.tire ?? 0`（battle.ts:2065）→ `SettleResult.tire`
+    24  *   · `g.loyal`    → `settle()` 讀 `g.loyal ?? row.Loyal ?? 50`（battle.ts:2062）→ `.loyalty`
+    25  *   · `army.seq`   → `strategy.ts:tickStrategy()` 的派發閘（strategy.ts:779）→ 敵方整場不派發
     34  *
     35  * 疲勞的取值口徑照抄 `settle()`（`g.tire ?? 0`），忠誠/節操照抄 `settle()` 的
  ──
     34  *
     35  * 疲勞的取值口徑照抄 `settle()`（`g.tire ?? 0`），忠誠/節操照抄 `settle()` 的
-    36  * `g.loyal ?? row.Loyal ?? 50` / `g.constancy ?? row.CONSTANCY ?? 5`。
+    28  * `g.loyal ?? row.Loyal ?? 50` / `g.constancy ?? row.CONSTANCY ?? 5`，這樣戰前寫進去
+    29  * 的值和結算讀出來的值是同一個基準。
     37  *
     38  * ── 為什麼疲勞不接戰力係數 ────────────────────────────────────────────────
  ──
     47  * 所以那 12 條留在派發器裡，本檔不碰。`WISE_STRATEGY_ONLY` 就是這份清單。
     48  *
-    49  * 依據鏈：`docs/04b` §4.3、`docs/04b5` §2、`work/dis_battle_B_44D450.txt` 的
+    42  * 依據鏈：`docs/04b` §4.3、`docs/04b5` §2、`export/script/system_so.dis.txt` 的
     50  * `0x44D450` 派發表、`game/data/wises.json` 的 `Execute` 列。
     51  */
  ──
     55 const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
     56 
-    57 /** `army+0x84` 的位（同 `strategy.ts:57` 的 `ARMY_FLAG`；不 import 是為了避免模塊環）。 */
-    58 const FLAG_NO_RETREAT = 0x4;
-    59 const FLAG_DEFECT = 0x400;
-    60 
     61 /** 主將狀態（= `world.sides[X].general`），避免從 battle.ts 額外導入類型名。 */
     62 type Gen = World['sides']['A']['general'];
  ──
    102       // 忠誠 > 0x5A、節操 > 5 都算「策略失敗!!」。另兩道是全局查詢（`0x40975E`/`0x450117`），未定位。
    103       if (!g.alive || loyalBase(world, g) > 90 || constancyOf(world, g) > 5) return false;
-   104       // 原作成功分支只置 `foeArmy+0x84 |= 0x400`（敵將投靠），不寫忠誠 → 這裡照抄狀態位。
-   105       const army = world.army?.[target];
-   106       if (army) army.flags |= FLAG_DEFECT;
-   107       // 忠誠 −15 是本作代理：[推測] `capture.ts` 的戰後招降讀忠誠，投靠位目前在 core 內
-   108       // 沒有消費點（`0x400` 的讀取處未在反彙編裡定位），靠這條把「投靠」接到招降流程。
    109       g.loyal = clamp(loyalBase(world, g) - spec.value, 0, 99);
    110       return true;
  ──
    110       return true;
    111     }
-   112     case 'no_retreat': {
-   113       // 原作 Execute 44（`0x44E09D`）：敵將有坐騎 → 只打「敵將騎%s，破解我方埋伏。」
-   114       // 不置位；沒坐騎 → `foeArmy+0x84 |= 4`（`requestRetreat()` 讀）。
-   115       const row = rowOf(world, g);
-   116       const horse = typeof row?.Horse === 'string' && row.Horse.length > 0 ? row.Horse : null;
-   117       if (horse) return false;
-   118       const army = world.army?.[target];
-   119       if (!army) return false;
-   120       army.flags |= FLAG_NO_RETREAT;
-   121       return true;
-   122     }
-   123     case 'hp_regen':
-   124     case 'mp_regen': {
-   125       // 原作 Execute 35-40：`army+0x84 |= 1|2`、`+0x88 = 40/60/80（體）/ 30/50/70（技）`。
-   126       // 舊實作寫成瞬回，滿血開戰時等於沒寫（probe: pre 無差量）；改成戰中持續回復後
-   127       // `battle.ts:2107-2118` 的 `strategyRegen()` 每 60 tick 按 maxHp/mpMax × param/1000 回復。
-   128       const army = world.army?.[side];
-   129       if (!army) return false;
-   130       if (spec.op === 'hp_regen') {
-   131         army.hpRegen = spec.value;
-   132         army.flags |= 0x1;
-   133       } else {
-   134         army.mpRegen = spec.value;
-   135         army.flags |= 0x2;
-   136       }
-   137       army.qiParam = spec.value;
-   138       return true;
-   139     }
    140     case 'dispel': {
    141       const army = world.army?.[foeSide];
  ──
    170   // 化解計策（Execute 57）：清掉敵方待派發的 seq
    171   24: { kind: 'dispel', target: 'enemy', op: 'dispel', value: 0, note: '化解敵方軍師技' },
-   172   // 十面埋伏（Execute 44）：`0x44E09D` 起 `foeArmy+0x84 |= 4`（敵方無法退兵）；
-   173   // 敵將有坐騎時原作只打「破解我方埋伏」，不置位。舊的「後排 +6 兵」無原作依據，已刪。
-   174   54: { kind: 'ambush', target: 'enemy', op: 'no_retreat', value: 0, note: '敵方無法退兵（十面埋伏）' },
    175 };
    176 
  ──
    176 
    177 /**
-   178  * 12 條戰中派發的 UI 提示（`wiseHintOf` 的第二來源）。
-   179  *
-   180  * 出征頁原本對它們返回 null，看起來像「未實作」；R88 補上這層，讓 67 條每一條都有
-   181  * 可讀的效果說明。鍵 = `wises.json` 的 SEQUENCE（與 `WISE_STRATEGY_ONLY` 同）。
-   182  */
-   183 export const WISE_STRATEGY_HINTS: Readonly<Record<number, string>> = {
-   184   10: '戰中：主將可後退（Execute 45）',
-   185   15: '戰中：敵方兵戰力 −5（Execute 27）',
-   186   23: '戰中：我方移速 ×1.1（Execute 49）',
-   187   26: '戰中：我方包圍、敵方移速 ×0.9（Execute 47）',
-   188   28: '戰中：敵陣散開、陣形歸零（Execute 7）',
-   189   29: '戰中：我方收拢、陣形歸零（Execute 8）',
-   190   30: '戰中：敵方被突襲（Execute 48）',
-   191   31: '戰中：主將傷害 ×0.75（Execute 46）',
-   192   33: '戰中：隨時可撤退（Execute 56）',
-   193   44: '戰中：敵方兵戰力 −10（Execute 28）',
-   194   59: '戰中：敵方武將技被封（Execute 64）',
-   195   62: '戰中：敵方兵戰力 −15（Execute 29）',
-   196 };
-   197 
-   198 /**
    199  * 本表不登記、但**已經由戰中派發器消費**的 12 條（`strategy.ts` 寫 `army.*`，
    200  * `battle.ts` 有現成消費點）。列在這裡是為了讓「67 = 54 + 12 + 1」可被測試釘住。
  ──
    215  * 顯式佔位：連派發器都沒有真實消費點，本作不做，理由寫在值裡。
    216  * 命名沿用 `SYSO_UNSUPPORTED`（見 `project/52` §4 的約定）。
-   217  *
-   218  * `3 後選出陣` 的語義已查清，不是「第 3 回合補兵」：`3` 是 `wises.json` 的
-   219  * `SEQUENCE`，`Execute 34` 才是分支號；`0x44DE44` 起只有
-   220  * `push 0x491900("成功")` → `call 0x46dae0`（消息欄）→ `jmp 0x44e6c7`，
-   221  * **沒有任何狀態寫入**（`work/dis_battle_B_44D450.txt:763`）。`ATTRIB=1` 表示
-   222  * 戰前選擇（`docs/03a-武将技表MAGIC.md:297`、`project/26` §），真實效果是
-   223  * 「使用方在敵方之後選將/兵種」，需要戰役編成層的 5 將出陣隊列 + 開戰前重排
-   224  * （`project/52:172`；Obj3 部隊池見 `docs/07b` §6），戰場內核沒有這個結構。
-   225  * 且 3 處測試把「只有一句日誌」釘死：`wises_r84.test.ts:84-135`、
-   226  * `wises.test.ts:291`、`strategy.test.ts:363`，都不在本輪可改清單。
-   227  * 詳見 `project/109_加法口径与Execute34.md`。**[阻塞]**
    228  */
    229 export const WISE_SYSO_UNSUPPORTED: Readonly<Record<number, string>> = {
  ──
    229 export const WISE_SYSO_UNSUPPORTED: Readonly<Record<number, string>> = {
    230   3:
-   231     '後選出陣 / Execute 34：`0x44DE44` 只有一條「成功」日誌（`0x491900`），無狀態改動；'
-   232     + 'ATTRIB=1 是戰前選擇，真實效果需要戰役編成層的 5 將出陣隊列 + 開戰前重排，'
-   233     + '戰場內核沒有這個結構。缺 Obj3 部隊池（docs/07b §6）的消費點，且 3 處測試鎖住現狀。'
-   234     + '[阻塞] 見 project/109。',
+   152     '後選出陣 / Execute 34：`0x44D450` 那條分支（`strategy.ts:498` 的 reserve）只有一條日誌，'
+   153     + '原作沒有任何狀態改動；本作沒有「出陣隊列」，要做需要 SSAV 的預備兵欄位或 EVENT 表裡的出陣事件。',
  ──

## smartscript/runtime.ts  (DIFF)

-    27 import { callSystemSo, emitBrightness, emitFlash, emitSfx } from '../audio_bus';
+    27 // Cocos 差异：音频总线在 `assets/scripts/AudioBus.ts`（AudioHost 也只认这个实例），
+    28 // 不能指向 `../audio_bus`——那份是 web 真源的副本，另建实例会让脚本音效听不见。
+    29 import { callSystemSo, emitBrightness, emitFlash, emitSfx } from '../../AudioBus';
     28 import { SysoHost, type SysoArg } from '../syso_host';
     29 
  ──
     47 }
     48 
-    49 const DATA_URL = new URL('../../../data/', import.meta.url);
+    51 /**
+    52  * Cocos 差异（web 那份用 `import.meta.url`，本副本不能有）：Creator 的产物是
+    53  * System.register 包起来的函数体，`import.meta` 不是合法语法（rollup 直接判死）。
+    54  * Cocos 走「预加载」路径（`assets/scripts/shim/host.ts` 已把 SO/数据装好），
+    55  * 这个常量只给下面的同步 XHR / node:fs 兜底分支用，指哪都无所谓。
+    56  */
+    57 const DATA_URL = new URL('data/', 'https://cocos.local/');
     50 
     51 /** 逐帧会话里单帧的统计（测试与结算面板用）。 */
  ──
    571       killed: this.killed,
    572       healed: this.healed,
-   573       unimplemented: [...this.unimplemented].sort((a, b) => a - b),
+   581       // Cocos 差异：Babel loose spread 不会展开 Set，必须用 Array.from（K7a）。
+   582       unimplemented: Array.from(this.unimplemented).sort((a, b) => a - b),
    574     };
    575   }
  ──
    582     if (this.soundsEmitted) this.log.push(`音效事件 ${this.soundsEmitted} 条 → audio_bus`);
    583     if (this.calls.length) this.log.push(`调用 ${this.calls.join(' ')}`);
-   584     if (this.healTargets.size) this.log.push(`治疗目标 ${[...this.healTargets].join(',')}`);
+   593     // Cocos 差异：Babel loose spread 不会展开 Set，必须用 Array.from（K7b）。
+   594     if (this.healTargets.size) this.log.push(`治疗目标 ${Array.from(this.healTargets).join(',')}`);
    585     this.log.push(`物件 ${stats.objects} 个 / 命中 ${stats.hits} / 击杀 ${stats.killed} / 治疗 ${stats.healed}`);
    586     if (fx) this.log.push(`fx ${fx} 个`);
  ──
    591 
    592   private objectSummaries(): RunSkillResult['objects'] {
-   593     return [...this.objects.values()]
+   603     // Cocos 差异：Babel loose spread 不会展开 Map.values()，必须用 Array.from（K7c）。
+   604     return Array.from(this.objects.values())
    594       .slice(0, 24)
    595       .map((o) => ({ resource: o.resource, x: o.x / 96, y: o.y / 72, angle: o.angle, dead: o.dead }));
  ──
    651   }
    652 
-   653   /**
-   654    * `WAITFOR name`：等同名脚本结束（docs/04-脚本引擎SmartScript.md:370）。
-   655    *
-   656    * 原作是"装回调 + 引擎每帧轮询"：`0x4658A0` 把名字交给 `0x464D70(0x465820,name,2)`，
-   657    * `0x465820` 在活动 VM 列表 `0x4A686C` 里按"当前函数名"查找，找到就继续挂起、
-   658    * 找不到才恢复；而 `0x467E70`（检查回调的那个函数）只在 `0x467F10` 的**每帧入口**
-   659    * 被调一次 ⇒ 一次 WAITFOR 至少跨过一帧，即使同名脚本早就结束。
-   660    *
-   661    * 我们的 CALLS 是同栈内联执行（vm.ts `case 0x47` 的 callInline），被调脚本在
-   662    * WAITFOR 之前就已经跑完，不存在"还挂在活动列表里的子 VM"，所以这里把原作语义
-   663    * 等价成**让出一帧的同步点**：挂起 1 帧、下一帧再继续。
-   664    *
-   665    * 不能像旧版那样直接跳过：制作组把 WAITFOR 当帧循环的节流器用
-   666    * （旋龍 554 的 `L12DEC → 0x130D8 → WAITFOR "WaitTarget" → JMP L12DEC` 整圈没有
-   667    * 别的 WAIT），跳过会让整圈在同一帧里空转到 20 万条指令预算、被当成死循环截断。
-   668    */
    669   waitFor(name: string): void {
    670     this.calls.push(`waitfor:${name}`);
  ──
    669   waitFor(name: string): void {
    670     this.calls.push(`waitfor:${name}`);
-   671     if (!this.frameMode) {
-   672       // 同步模型：没有真实帧循环，把虚拟时钟推 1 帧（与原作"每帧轮询"同粒度）。
-   673       this.tickClock(1);
-   674       this.vm.beginFrame();
-   675       return;
-   676     }
-   677     if (this.vm.callDepthNow > 1) {
-   678       // 嵌套 invoke（syscall 0x310–0x314）跨不了帧，退化成同步推一帧（同 wait()）。
-   679       this.nestedWaits++;
-   680       this.tickClock(1);
-   681       this.vm.beginFrame();
-   682       return;
-   683     }
-   684     this.vm.requestWait(1);
    685   }
    686 
  ──
    715   }
    716 
-   717   /**
-   718    * `0x129` / `0x10D`：阵营/方向 → 该方主将句柄。
-   719    *
-   720    * 证据（magic_so.dis.txt，55 个调用点全是同一形状）：
-   721    * `LDG 5; PUSHI 1; XOR; SYSCALL 0x129|0x10D argc=1` ⇒ 实参是 `g5 ^ 1`，
-   722    * 即"对面那一侧"，不是句柄（旧实现把它当句柄 ⇒ 一律返回 0，
-   723    * 旋龍 554 因此把 dummy 生成在 (0,0)、整技能 0 命中）。
-   724    * `g5` 在本 runtime 里是 `direction`（1 = 目标在左），所以：
-   725    * 实参 == direction ⇒ 本方，否则 ⇒ 敌方。若实参本身就是合法句柄（防御），原样返回。
-   726    */
-   727   sideUnitHandle(direction: number): number {
-   728     if (this.byHandle.has(direction) || this.objects.has(direction)) return direction;
-   729     const dir = Math.abs(direction | 0) & 1;
-   730     const same = dir === (this.direction & 1);
-   731     const side: Side = same ? this.side : this.side === 'A' ? 'B' : 'A';
-   732     const unit =
-   733       this.unitList.find((u) => u.side === side && u.isGeneral) ?? this.unitList.find((u) => u.side === side);
-   734     return unit ? (this.byUnit.get(unit) ?? 0) : 0;
-   735   }
-   736 
    737   unitSide(handle: number): number {
    738     const u = this.byHandle.get(handle);
  ──
    822     const o = this.objects.get(handle);
    823     if (!o) return;
-   824     // 中途改向/改速：先把"按旧速度飞到现在的位移"结算进 x/y，再把起点挪到当前帧。
-   825     // 否则 posOf() 会拿新速度从 born 重新外推 ⇒ 物件瞬移（旋龍的 dummy 每帧被 0x19 改一次）。
-   826     if (this.clockValue > o.born) {
-   827       const dt = this.clockValue - o.born;
-   828       if (o.angle >= 0 && o.speed !== 0) {
-   829         o.x += o.vx * o.speed * dt;
-   830         o.y += o.vy * o.speed * dt;
-   831       }
-   832       o.born = this.clockValue;
-   833     }
    834     o.angle = ((angle % 256) + 256) % 256;
    835     o.speed = speed;
  ──
    946     if (this.sounds.length < 8) this.sounds.push(`${tag}:${volume}`);
    947     this.soundsEmitted++;
-   948     emitSfx({
-   949       name,
-   950       volume,
-   951       unit,
-   952       source: unit === undefined ? 'syscall:0x301' : 'syscall:0x300',
-   953       clock: this.clockValue,
-   954     });
+   899     // Cocos 差异：AudioBus.SfxInput 只收 `unit: Unit` 对象（用于 3D 定位），脚本的
+   900     // `unit` 是槽位序号，硬塞会把事件打歪；source/clock 也只有 web 版 audio_bus 认。
+   901     emitSfx({ name, volume, source: 'script' });
    955   }
    956 
  ──
   1202   /** 调试：把物件坐标导出成 `[(x,y,res)]`。 */
   1203   dumpObjects(): string {
-  1204     const arr = [...this.objects.values()].slice(0, 12);
+  1151     // Cocos 差异：Babel loose spread 不会展开 Map.values()，必须用 Array.from（K7d）。
+  1152     const arr = Array.from(this.objects.values()).slice(0, 12);
  ──

## smartscript/syscalls.ts  (DIFF)

-    53   /**
-    54    * `0x129`（`0x43B375`）/ `0x10D`（`0x43A7AC`）的唯一实参是**阵营/方向**
-    55    * （MAGIC.SO 的 55 个调用点全是 `LDG 5; PUSHI 1; XOR`，即 `g5 ^ 1`），
-    56    * 返回该方主将的句柄（原作是"该方主将/其身体物件"）。解析不出返回 0。
-    57    * 可选：`battle.ts` 的 damage-only 通道（只跑同步 `Hurt`，不会碰到这两条 syscall）
-    58    * 没实现它，`case 0x10d/0x129` 里按 0 处理。
-    59    */
-    60   sideUnitHandle?(direction: number): number;
     61   isUnit(handle: number): boolean;
     62   unitSide(handle: number): number;
  ──
    217     }
    218     case 0x019: {
-   219       // `0x41FD98`（`export/script/syscall_handlers.asm.txt:466-494`）证实三参是
-   220       // **(句柄A, 句柄B, 数值)**：两个句柄都过 `0x421a80` 解析、都非零才 `0x4225f8(A,B,arg3)`。
-   221       // 旧实现把第 2 个**句柄**当成 motion 数存进 `o.motion`，参数序是错的 —— 这里改成把
-   222       // 第 3 参（数值）记进 `motion`；`0x4225f8` 的本体不在 export 里（原 EXE 未提取），
-   223       // 所以**不实施**"A 追 B"的运动：试实现后旋龍的 dummy 会朝一个我们解析不到真目标的
-   224       // 全局句柄（`g3`）飞走，效果从 15 hits / 8 dmg 掉到 6 hits / 0 dmg（见 project/117）。
    225       const o = ctx.objectOf(a(0));
  ──
    225       const o = ctx.objectOf(a(0));
-   226       if (o) o.motion = a(2);
+   212       if (o) o.motion = a(1);
    227       return undefined;
    228     }
  ──
    326     case 0x10c:
    327       return r(ctx.unitSide(a(0)));
-   328     case 0x10d:
-   329       // handler 0x420518 → `0x43A7AC(arg1)`。MAGIC.SO 里 0x10D 的 24 个调用点**全部**
-   330       // 是 `LDG 5; PUSHI 1; XOR; SYSCALL 0x10D`（例：magic_so.dis.txt:10745、10890、
-   331       // 11664），即实参是阵营/方向（g5^1）而不是句柄；返回值随后喂给 `0x11`
-   332       // （在"该方主将的位置"生成物件）与 `0x105/0x106`。原作该方主将的"身体物件"，
-   333       // 本模型单位/物件共用句柄空间 ⇒ 直接给单位句柄。
-   334       return r(ctx.sideUnitHandle?.(a(0)) ?? 0);
+   314     case 0x10d: {
+   315       // 活动物件数组遍历：index ，物件句柄（越界返，0。
+   316       const obj = ctx.objectOf(a(0));
+   317       return r(obj ? obj.handle : 0);
+   318     }
    335     case 0x111:
    336       return r(Math.round(ctx.targetPx().x));
  ──
    376       return undefined;
    377     case 0x129:
-   378       // handler 0x420809 → `0x43B375(arg1)`；31 个调用点同样全是 `g5 ^ 1`（阵营/方向），
-   379       // 例如旋龍 554 的 magic_so.dis.txt:10736 → `STL loc8` → 后续 0x105/0x106 读该方
-   380       // 主将坐标、`0x11(loc8, 2501, 0, 0)` 在主将位置上生成 dummy。
-   381       return r(ctx.sideUnitHandle?.(a(0)) ?? 0);
+   362       return r(ctx.isUnit(a(0)) ? a(0) : ctx.handleOfObject(a(0)));
  ──
