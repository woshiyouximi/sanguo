# m4 派工：按原作重写战斗行动模型（默认待機 / AI / 同排扫描 / 攻击锁 / 抖动 / 轴向基向量）

**依据（必读，全部已落地为文件）**
- `F:\sanguo\project\173_原作战斗行为真相.md`（539 行，m1）：开局命令字、AI、攻击动画、补间、能打就不走、80/10/10 基向量、接敌帧数。
- `F:\sanguo\project\174_原作开局布阵.md`（357 行，m2）：场地 71×14、阵形落位公式、A 侧镜像 71−x、主将落点、骑兵按 mode 分配、九阵最近距离。
- 证据：`work\orig_battle_behavior\`（21 份反汇编摘录 + 蒙特卡洛）、`work\orig_formation\`（ASCII 对照 + `verify.py` / `probe_ours.ts`）。

## 一句话目标
把「我们现在自己定的行动规则」换成「原作的行为」：**开局不动 → AI/玩家下令 → 能打就不走（同排射程扫描）→ 走一格（轴向 80/10/10 + 抖动补间）→ 出手 anim4 占 75% 周期**。

## 允许改的文件（只有这些）
- `game/src/core/battle.ts`
- `game/src/core/army_cmd.ts`
- 新建 `game/src/core/battle_ai.ts`
- `game/tests/battle_ai.test.ts`、`game/tests/action_model.test.ts`（新建）
- `game/data/formations.json`（只改 `slot_rule.formula` 里 70→71，别动坐标）
- 报告 `project/177_战斗行动模型.md`
- **禁改**：`game/src/view/**`（动画相位与抖动由 lead 做）、`game/web/**`、`game/cocos/**`、`project/44|31|37a`

## 必做项（逐条，按报告地址实现）
1. **默认待機**（`battle.ts:2153` / `army_cmd.ts:734`）：无命令时 `plan = null`，单位站着不动。删掉「无命令就 `defaultStepPlan` 自动前压」。
2. **新建 `core/battle_ai.ts`**：每 `AI_PERIOD = 60` tick 决策一次（开局第 1 帧就执行一次），加权随机：
   - `w0 = 100`（什么都不做）；突擊权重 +12，兵种相克时再 +150，`army.status===4` 时 +1000（见 `project/173` Q3 的表与地址）；
   - 选中「进攻」时执行**两条命令的组合**：`0x44497F` 只写槽 0 = 1（全軍前進），`0x4448B2` 写槽 1..7 = 7（全軍突擊）；
   - 必须能被 `world.aiSides` 开关控制（只对 true 的一侧跑），且**不影响同 seed 无 AI 的对局**。
3. **能打就不走 = 同排扫描**（`battle.ts:2094 adjacentEnemy`）：改成 `0x43BBE6` 语义——同行 `y` 相同、只沿 ±x、范围 `1..射程`；空格继续扫，带 `0x2000` 位的跳过，**遇友军视为挡视线直接失败**（返回 null），命中敌人返回该单位。
4. **攻击锁 `u.atkLock`**（`+0x38`）：主将恒 1，士兵查表 1..3（`0x4862BC+0x1C`）；替代现在的 `ATTACK_COOLDOWN` 固定值。注意它和闸门 `+0x34`（40/46）、状态 `+0x2c` 是三个独立字段。
5. **补间抖动**（`battle.ts` 的 `commitStep`/`advanceSlides`）：目标像素点 = 格心 + `±rand()%0x30-0x18`（x）、`±rand()%0x24-0x12`（y），clamp ±120/±90 px，`v = delta/40` 线性积分；没走成时 40 帧滑回格心（`0x43C084`）。**必须走 `world.rng()`**，不许另开随机源。
6. **80/10/10 的基向量改轴向**：`planToward` 现在是 `sign(dx),sign(dy)` 的对角基向量，导致 42.7% 斜前；原作散开阶段的基向量是**轴向**（正前/正后/正上/正下之一），空场正前应 79.9%、斜前 20.1%、上下 0。
7. **布阵修正（m2 §7）**：
   - `formationCells` A 侧镜像 `GRID_W - 1 - gx` → `GRID_W - gx`（71−x）；
   - 人数不在 {10,50,100,200} 时按 `slot.weights` + `slot.modes` 累积取整：`k_m = floor(P_m*N/200) − floor(P_{m−1}*N/200)`，不要拿 200 档切片；
   - 骑兵按 `kc_m = w_m * N_骑 / 200` 每 mode 取前 kc 个（现在取末尾 N 个，落在外圈）；
   - 主将 = `anchorX + shift`（A 侧 `71 − 该值`）、`gy = 6`，被占才按 `0x442D38` 挪格（`X≤1 → +0x20`、`X≥0x70 → −0x20`、否则 `X≥0x36 ? +1 : −1`）；
   - `formations.json.slot_rule.formula` 70 → 71。
8. **接敌时间验收**：方形 N=100 双方各推进 ⇒ 最近距离 31 格 ⇒ 30 步 × 40 tick = **1200 tick / 40 s**（单侧 680..1000 tick 是 m1 的估计区间，以 m2 的 31 格为准）。写一条测试钉住「无命令时 40 tick 内位移 0」「AI 发令后 600 tick 内出现接触」。

## 验收（缺一不可，数字写进报告）
1. `npm.cmd exec -- tsc --noEmit` **exit 0**、`tsc -p tsconfig.build.json` exit 0。
2. 全量 `node --test tests/*.test.ts` **pass（当前基线 1318，l1/l2 收工后以最新为准）**，不许靠放宽断言；若某条旧断言与新语义冲突，逐条在报告 §旧断言 table 里写「改前 / 改后 / 依据（地址）」。
3. 每条新语义配**阴性对照**：把该条改回旧行为，对应测试必须红。
4. 数值证据：无命令 600 tick 位移 0；AI 开启后接触 tick 分布（≥20 seeds）；同排扫描的命中/被友军挡住各一例；抖动位移的 min/max/均值。
5. 不许动 `view/**`，但要在报告里列出「view 侧还需要配合改什么」（lead 会做）。

## 纪律
- 只改上面清单里的文件；收工必须把这四项贴进回答：`tsc` 两次 exit code、全量 tests/pass/fail、新测试条数、报告路径。
- 不确定的标 `[推测]`，并在报告 §存疑 列出来。