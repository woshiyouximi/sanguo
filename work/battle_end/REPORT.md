# 战斗结束/胜负判定改为原作口径（主将生死）

任务来源：用户实测反馈「胜负条件是错的，原版胜负是以武将死亡，你做的似乎是以士兵为0」。
结论：**已改**。现在只有三条路能结束战斗 —— 主将阵亡 / 一方全军离场（撤退·被俘）/ 11880 tick 硬时限；
**士兵清零不再结束战斗**，到点双方主将都活着 = 平手（原作 reason 0x10），不再按剩余兵力判胜。

---

## 一、原作证据（地址 + 引文）

### 1. 结束标志是一个全局位寄存器 `[0x4B4C34]`，不是 `[0x4A665C]`

`0x443CA8(bits)`（`work/orig_numbers/text_dis.tsv` 0x443CA8–0x443CEA）：

```c
if ((bits & 1) || (bits & 2)) {              // 撤退/被俘位
    if (([0x4B4C34] & 4) || ([0x4B4C34] & 8)) return;   // 已有主将阵亡位 → 整条丢弃
}
[0x4B4C34] |= bits;
```

`0x443CEB()` = `return [0x4B4C34]`。位义：

| 位 | 含义 | 谁置的 |
|---|---|---|
| 1 / 2 | A / B 撤退（或被俘） | `0x43EAA0`–`0x43EB47` 退场倒计时归零 |
| 4 / 8 | A / B 主将阵亡 | `0x43DB9A` 末尾（`unit+0x40` 判阵营） |
| 0x100 / 0x200 | 脚本强制结果 | `0x443CF5`，全 EXE 唯一调用点 `0x4209C3`（战役脚本 opcode），**与士兵数无关** |
| 0x1000 | 战斗结束触发 | 上面两条 + 时限到点 |

### 2. 主将阵亡 = 立即结束，不等本回合打完

- `0x43F27B`（`OM_DEATH` 处理器，`docs/04b3_单挑流程.md:408-424`）：`0x43DB9A` 死亡标记 → `0x43DC56` 击退一格
  → `0x4447B7(army)` 全军转 cmd 8 → `army+0x80 |= 4`（主将殒命）→ `[0x4A665C] |= 3`。
- `0x43DB9A` 自己就置结果位 4/8（见上表）。
- `0x441E61` 在 `0x441EC2` 判 `if ([0x4A6660]==1 || [0x4A6664]==1 || ([0x4A665C]&1)) goto 0x4422CB`
  ⇒ 直接跳过战场更新，当帧进结算（`docs/04b3_单挑流程.md:26,462-464`）。
- `0x4447B7` 只改命令/退场位（`army+0x2c |= 0x4000/0x8000`），**不写士兵数、不写士气、不写名册 status**。

### 3. 理由选择器 `0x44411B`：到点时没有 4/8/1/2 就是平手

`0x44411B`–`0x4442D3`（每帧调用）：

```c
if (--[0x4AC35C] <= 0) { [0x4AC35C]=0; 0x443CA8(0x1000); }     // 0x444126 时限 11880
if ([0x4B4C34] & 0x1000) {
    if (4 && 8) reason = 0x10;
    else if (4) reason = 4;  else if (8) reason = 8;
    else if (0x100) reason = 0x100;  else if (0x200) reason = 0x200;
    else if (1 && 2) reason = 0x10;
    else if (1) reason = 1;  else if (2) reason = 2;
    else reason = 0x10;                                          // 0x44423C 兜底 = 平手
    [0x4B4C34] = reason;
    0x443D29(unitB); 0x443D29(unitA);   // 数剩余兵力，仅供战后统计
    [0x4A6670] = 1; 发消息 0x38(reason);
}
```

⇒ **原始实现里没有「剩余兵力多者胜」**；`0x33F` 那两个 `0x443D29` 只是战后统计。
旧实现 `battle.ts` 时限分支的 `aN > bN ? 'A' : ...` 是自造规则（`project/177_战斗行动模型.md:227` 曾按此写）。

### 4. 士兵为 0 不结束

`project/177_战斗行动模型.md:48`：`army+0x5c <= 0` 只清命令可用位 bit1|2|8（不能前進/突擊/撤退），
战斗继续；全 EXE 没有「士兵为 0 即结束」的写法，也没有士气崩溃结束分支。

### 5. 另一条入口 `0x447037`（名册口径，与上面的结果位最终统一）

`docs/04b_战斗系统.md:464-477`、`work/dis_battle_result_447037.txt`：

```c
flag = 0;
if (mode == 0) { if (0x410A1B([0x4A668C]) == 0) flag |= 1;   // 我方已无 status==0 的条目（武将）
                 if (0x410A1B([0x4A6690]) == 0) flag |= 2; }
else flag = 1;                                                // 非 0 → 强制我方败
```

`0x410A1B(army*)` = `for (i<count) if (entry[i].status == 0) return 1; return 0;` —— 判**名册武将**，不是兵。
主循环尾 `0x447CD2`：两侧都还有在场武将 → 继续；否则 `0x447037(0)` 收尾写 `[0x4A8144]=4`。
每侧同时只上 1 个将领单位（`project/168_战场每侧单位数.md:18-26`），主将死 = 该侧无在场武将，
两条入口结论一致。撤退/被俘的具体 reason（1/2/0x10）由上面的结果位给出。

### 6. 结算分派 `0x447424`

`work/dis_battle_settle2_447424.txt`：reason 1/2（撤退）→ 战功 mode 2（击退）；reason 4/8（主将阵亡）→ mode 1（歼灭）。
⇒ 撤退不该记成「大胜」，`settleMode()` 的 `enemyGone` 原来把「兵尽」也算进来，是错的。

---

## 二、现状（改前，行号）

`game/src/core/battle.ts`（改前行号）：

```ts
// :2941-2967 checkOver()
const aGen = world.sides.A.general.alive, bGen = world.sides.B.general.alive;
if (!aGen || !bGen) { finish(world, aGen ? 'A' : bGen ? 'B' : 'draw', 'general'); return; }
const aLeft = world.units.some(u => u.side === 'A') /* 同 B */;
if (world.fled.A && !aLeft) { finish(world, 'B', 'retreat'); return; }
if (world.fled.B && !bLeft) { finish(world, 'A', 'retreat'); return; }

const aN = world.sides.A.aliveCount;   // ← 这是士兵数！battle.ts:2803
const bN = world.sides.B.aliveCount;
if (aN === 0 || bN === 0) finish(world, aN>0?'A':bN>0?'B':'draw', 'troops');   // ← 错：兵尽即结束
if (!world.over && world.tick >= BATTLE_TICK_LIMIT)                            // ← 错：按兵力判胜
  finish(world, aN>bN?'A':bN>aN?'B':'draw', 'time');
```

- `aliveCount`（`battle.ts:2803`）= `units.filter(u => u.side===side && u.alive && !u.isGeneral).length`，纯士兵数。
- `World.endReason` 含 `'troops'` 档（`:559`），UI 与战后桥接都按它分支。
- `settleMode()` 的 `enemyGone = !loser.general.alive || loser.aliveCount <= 0` ⇒ 兵尽也会被记「歼灭」。
- 战后桥接把 `'retreat' | 'time'` 折成 `'troops'` 再传给 `capture.ts`（旧 `:3584-3590`）。

消费端核查（关键结论：**两端 UI 都不自己判胜负**）：

- `game/web/main.js:1080` `win = !!settleRes && settleRes.winner === 'A'`；`:1093-1102` 写 `save.lastBattle.won`。
  结算面板只读 core 的 `over/winner/endReason`；`forceEnd()`（`:1784-1852`）是 `?end=` 调试面，不走正常路径。
- `game/cocos/assets/scripts/BattleRoot.ts:883-899` 只画兵条；`BattleHud.ts:978,1130` 只用 tick 推时间牌。
- `game/src/core/roster.ts:638-644` `needSurrenderPanel(cards, opts)`：`opts.won === false` 直接 false；
  `:595` `surrenderCandidates` 同样以 `won` 为门。权威信号 = `save.lastBattle.won`（`:882-895`）。

---

## 三、改法（改后行号）

### `game/src/core/battle.ts`

1. `checkOver()`（`:2966-2987`）重写为三条出口，行号见注释：

```ts
function checkOver(world: World): void {
  const aGen = world.sides.A.general.alive;
  const bGen = world.sides.B.general.alive;
  if (!aGen || !bGen) { finish(world, aGen ? 'A' : bGen ? 'B' : 'draw', 'general'); return; }
  const aLeft = world.units.some((u) => u.side === 'A');
  const bLeft = world.units.some((u) => u.side === 'B');
  if (world.fled.A && !aLeft) { finish(world, world.fled.B && !bLeft ? 'draw' : 'B', 'retreat'); return; }
  if (world.fled.B && !bLeft) { finish(world, 'A', 'retreat'); return; }
  if (world.tick >= BATTLE_TICK_LIMIT) finish(world, 'draw', 'time');   // 双方主将都活着 ⇒ 平手
}
```

- 删掉 `aliveCount === 0` 结束分支；删掉时限按兵力判胜。
- 双侧同时撤光 → `draw`（原作 `1&&2 → reason 0x10`）。
- 兵尽仍可打：`aliveCount===0` 只影响 `army+0x5c` 的命令位（core 里对应"不能前进/突击/撤退"），不再触发 `finish`。

2. `World.endReason`（`:564`）收窄为 `'general' | 'retreat' | 'time' | null`，删掉 `'troops'` 档。
3. `finish()`（`:2935`）签名同步收窄。
4. `SettleResult.won`（`:771`，值 = `winner === 'A'`，`:3554` 计算、`:3699` 输出）成为唯一胜者门信号，
   文档注明 web `lastBattle.won` / `needSurrenderPanel` / 战报文案都用它。
5. `settleMode()`（`:3517-3531`）：`enemyGone` → `enemyGeneralDown = !loser.general.alive`；
   **兵尽不算殲敵**，所以「主将活着的全军撤退」不会误记「大胜 mode 4」，只记 mode 2 击退（与 `0x447424` 一致）。
6. 战后桥接（`:3609-3619`）原样传 `endReason`，不再折成 `'troops'`。

### `game/src/core/capture.ts`

- `PostBattleWorld.endReason`（`:132`）同步为 `'general' | 'retreat' | 'time' | null`；
  `resolvePostBattle` 本就不读它（只看 `winner`），行为不变。

### Cocos 镜像

`node work\cocos_sync\sync_core3.mjs` 同步，`--diff-only` 复检 **23 文件 0 差异**；镜像 `core/battle.ts`、`core/capture.ts` 已更新。

---

## 四、测试

### 新增 `game/tests/battle_end.test.ts`（6 条，全 pass）

1. 敌将阵亡 → `winner='A'`、`endReason='general'`、`status.B=3`、`settle().won === true`；
2. 我方主将阵亡 → B 胜、`status.A=3`、`won === false`；
3. **一方小兵清零但主将活着 → 不结束**：`aliveCount===0` 且 `over===false`，再 step 5 帧仍继续；
   双方兵尽也继续；直到把 B 将 `alive=false` 才结束；
4. `requestRetreat('B')` → 全军离场后 A 胜、`endReason='retreat'`、`status.B=2`；
4b. 双侧同时撤退 → `draw`、`endReason='retreat'`、`status {A:0,B:0}`；
5. `settle().won` 与 `needSurrenderPanel([card], {won})` 三态一致（胜 true / 败 false / 撤退胜 true）。

### 既有测试适配（都是旧口径「兵尽即结束」的假设）

| 文件 | 改法 |
|---|---|
| `game/tests/action_model.test.ts` | 时限两条重写：11879 不结束 / 11880 `endReason='time'`；另加「A4 vs B2 到点仍平手」，证明不看兵力 |
| `game/tests/battle.test.ts` | 镜像测试改为「A/B 各 ≤75%，平手合法」；地形测试改为机制级 `hitChance` 断言（`+10` 战力确实进命中判定） |
| `game/tests/battle_r81.test.ts` | R23、R63 删兵后补 `w.sides.B.general.alive=false` 收尾 |
| `game/tests/battle_feedback.test.ts` | R84 预算改 `BATTLE_TICK_LIMIT + 2` |
| `game/tests/roll_consumers.test.ts` | R115 预算改 `BATTLE_TICK_LIMIT + 2`，败方加 3 名副将（主将阵亡后处置名单仍非空） |
| `game/tests/smartscript_audio.test.ts` | R80 预算改 `BATTLE_TICK_LIMIT + 2`（str60 两将打到时限平手） |
| `game/tests/stepcav.test.ts` | R22 预算改 `BATTLE_TICK_LIMIT + 2` |
| `game/tests/core_smoke.test.ts` | `END_REASONS = ['general','retreat','time']` |
| `game/tests/postbattle.test.ts` | 构造 `endReason` 时按 draw/dead/retreat 选值 |
| `r33add / smartscript.session / capture / stepcav` 占位串 | `'troops'` → `'retreat'` |

### 计数（可复跑）

```
cd F:\sanguo\game
node --test "tests/*.test.ts"
→ tests 1792 / pass 1791 / fail 0 / todo 1
```

改前基线 1786（1785 pass + 1 todo）→ +6 条新测试 = 1792，无红。
日志：`work/battle_end/full_test_2.log`（前一次 `full_test_1.log`）。

### 探针（`work/battle_end/`，可复跑，只读 core）

- `probe_end.mjs`：镜像 100v100 6 seeds → 全部 11880 tick 平手（双方兵 0、两将都活，hp 68~101）；
  60v60 seeds 11-14 → 全部主将阵亡 A 胜（tick 3248/3466/3634/3432）；
  40v40 seed 61 → 到点平手；troop4v12 seed 7 → 主将阵亡 A 胜 tick 4284。
- `probe_dist.mjs`：20/30/40/60/100 兵各 8 局分布；roll seeds 11..16 中 5 局主将阵亡、1 局平手，
  `captures+executed+released = 0`（主将阵亡 → 不进退废名单，`capture.ts:442`）。
- `probe_power.mjs`：地形 0 `powerA=160`、地形 3 `powerA=170`，单次伤害都恒为 3
  ⇒ +10 战力不跨 `trunc(p/48)` 台阶；地形真正生效点是 `hitChance`（+10/300）。

复跑示例：`cd F:\sanguo && node work\battle_end\probe_end.mjs`。

---

## 五、双端是否都吃到

- 判定全在 `game/src/core/battle.ts`，`web`（`game/web/main.js`）与 Cocos（`BattleRoot.ts` / `BattleHud.ts`）
  都只读 `world.over / winner / endReason` 与 `settle()`，**两端没有另立胜负判据**。
- core 已用同步器写进 `game/cocos/assets/scripts/core/`，`--diff-only` 0 差异 ⇒ 双端同源。
- `SettleResult.won` 新增后，web 的 `save.lastBattle.won` 与 `roster.needSurrenderPanel` 仍同源；
  `game/web/main.js` 未改（禁改区），无需改。

## 六、需要 lead 构建 / 验机

1. **Web**：刷新后打一场「把敌兵清光但敌将还活着」的仗 —— 应继续战斗而不是立刻结算；
   再把敌将打死 → 立即结算、我方胜、战报「我軍大獲全勝!!」级文案、俘虏面板出现。
2. **Cocos / MuMu**：同上两条；另验「我方主将阵亡 → 立刻进结算、我方败、`lastBattle.won=false`、
   不弹招降面板（`needSurrenderPanel` 的 `won:false` 门）」。
3. **极限局**：双方兵尽、两将都活 → 打到 198 秒（11880 tick）应结算为平手（`endReason='time'`，
   战报「雙方平手」），旧版会按剩余兵力判胜。
4. **撤退**：主动撤退 → 全军离场后判负、`status=2`；注意 `?end=great` 调试面在「清兵留将」时
   现在显示 mode 2「击退」而非「大胜」（`game/web/main.js` 禁改，仅调试用）。

## 七、改动文件

- `game/src/core/battle.ts`（判定 / 类型 / 结算 mode / 桥接 / 注释）
- `game/src/core/capture.ts`（`PostBattleWorld.endReason` 类型）
- `game/cocos/assets/scripts/core/battle.ts`、`.../capture.ts`（同步器生成，未手改）
- `game/tests/battle_end.test.ts`（新增）
- `game/tests/`：`battle.test.ts`、`battle_r81.test.ts`、`battle_feedback.test.ts`、`roll_consumers.test.ts`、
  `smartscript_audio.test.ts`、`stepcav.test.ts`、`action_model.test.ts`、`core_smoke.test.ts`、
  `postbattle.test.ts`、`r33add.test.ts`、`smartscript.session.test.ts`、`capture.test.ts`
- `work/battle_end/`：本报告 + `probe_end.mjs` / `probe_dist.mjs` / `probe_terrain.mjs` / `probe_power.mjs` + 全量日志
