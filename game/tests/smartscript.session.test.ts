/**
 * 逐帧驱动（SkillSession）的回归测试。
 *
 * 上一版 `cast()` 里 `runSkill()` 一口气把整段脚本跑完，`WAIT` 只推虚拟帧，
 * 于是"动画第 N 帧才扣血"的技能**总量对、节奏错**。这一版 `cast()` 只启动脚本，
 * 由 `step()` 每 tick 推一帧，`WAIT n` 真的挂起 n 帧。
 *
 * 覆盖：多帧技能每帧 killed 的分布、WAIT 跨 tick 挂起、会话结束的战果汇总、
 * 606（劍輪舞）不再撞 20 万指令预算。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import {
  QI_MAX,
  advanceSessions,
  cast,
  createWorld,
  powerOf,
  qiCostMul,
  qiCostOf,
  settle,
  step,
  type Side,
  type World,
} from '../src/core/battle.ts';
import { runSkill, startSkill } from '../src/core/smartscript/runtime.ts';
import { applyWise } from '../src/core/wises.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 与 smartscript.test.ts 同口径：两军已接触，A 主将在 x=24。 */
function staged(seed = 7): World {
  const world = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  assert.ok(g, 'A 方应有主将单位');
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);
  return world;
}

/** magics.json 的 SEQUENCE → SCRIPT（脚本号 = 500 + MagicN 的 N，与 SEQUENCE 不总相等）。 */
function scriptOf(seq: number): number {
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  assert.ok(m, `找不到第 ${seq} 号技能`);
  return m.SCRIPT;
}

/** 把一个会话推到结束（带保护，防止回归时测试卡死）。 */
function drain(s: ReturnType<typeof startSkill>, limit = 2000): void {
  let n = 0;
  while (!s.done && n++ < limit) s.advance();
  assert.equal(s.done, true, `会话在 ${limit} tick 内没有结束`);
}

// ── 1. 逐帧：伤害落在"第 N 帧"，不是第 1 帧 ─────────────────────────────

test('逐帧：606 劍輪舞第 1 帧不结算，击杀分摊到后面的帧（打印每帧 killed）', (t) => {
  const world = staged(7);
  const s = startSkill(world, 'A' as Side, scriptOf(95), 20, 6.5);
  assert.equal(s.frame, 1, 'startSkill 应已经跑完第 0 帧');
  assert.equal(s.frames[0]!.killed, 0, '第 0 帧（脚本刚启动）不该有击杀');
  assert.equal(s.frames[0]!.healed, 0);

  drain(s);

  const perFrame = s.frames.map((f) => f.killed);
  const first = perFrame.findIndex((k) => k > 0);
  t.diagnostic(`606 共 ${s.frames.length} 帧；每帧 killed：[${perFrame.join(',')}]`);
  t.diagnostic(`首个击杀帧：#${first}（killed=${first >= 0 ? perFrame[first] : 0}），会话合计 ${s.killed}`);

  // 旧断言是 `> 1000`：那是 **0x3C/0x3D 极性反了** 时 606 循环多跑一倍的产物（1132 帧）。
  // 0x3C 在 EXE 里是 `test eax,eax; je +3`（**弹 0 才不跳**，0x464660）、0x3D 是 `jne +3`
  // （0x464690），按真语义 606 固定 601 帧 —— 与 project/154 §5 L5 事前的预测值一致。
  // 这里改成精确值，比 `> 1000` 更严（不是放宽）：一帧不多一帧不少。
  // R163 重定基线：601 帧是"回调通路未接"时测的。接上 `obj[+0x98]` 碰撞回调后固定 562 帧。
  // R183 重钉为 559（o1，2026-11-25）：562 是 **m4 改阵型之前** 的值。m4 那轮把编队落位重写
  // （`battle.ts` 的 `formationCells`，EXE `0x442D1B`/`0x443180`），而 606 的帧数**不是**脚本常数，
  // 它 = 「螺旋主循环 280 圈 × 每圈 WAIT」+「碰撞回调提前结束物件」两者的合成 ⇒ 只要开场士兵的
  // 坐标变了，弹丸/飞剑撞到兵的时刻就变，帧数跟着变。考古证据在同一批日志里：
  // `work\_m4_baseline.txt:1099` = 562 帧，而 m4 改完阵型后它自己的
  // `work\_m4_after_fixtures.txt:24` / `work\_m4_final_full.txt:1815` 起就一直是 556，n3 的
  // `work\n3_tests_*.txt` 也全是 556 ⇒ 562→556 的漂移是 m4 的落位改动造成的，与碰撞回调无关。
  // 8 个 seed 扫描（`work\o1\probe_606_seeds.mjs`，seed 1/2/3/7/11/13/23/42）得 555/557/553/556/
  // 559/564/556/556 —— 帧数确实随布局浮动。本 fixture（`staged(7)`）下是 559，故钉精确值 559：
  // 仍是一帧不多一帧不少（不是放宽成区间）。
  assert.equal(s.frames.length, 559, `606 在 staged(7) 下应固定 559 帧（实际 ${s.frames.length} 帧）`);
  assert.ok(s.killed > 0, '606 应该真的打到兵');
  assert.ok(first > 1, `首个击杀不该落在前两帧（实际第 ${first} 帧）`);
  // 击杀是"一点一点"发生的，不是最后一帧一次性结算
  assert.ok(perFrame.filter((k) => k > 0).length >= 1);
  assert.equal(
    perFrame.reduce((a, b) => a + b, 0),
    s.killed,
    '每帧 killed 之和必须等于会话合计',
  );
});

test('逐帧：halfway 帧杀的人，前一帧还活着（用命中帧做交叉验证）', () => {
  const world = staged(7);
  const s = startSkill(world, 'A' as Side, scriptOf(95), 20, 6.5);
  drain(s);
  const hitFrame = s.frames.findIndex((f) => f.hits > 0);
  assert.ok(hitFrame > 0, '应存在命中帧');
  const hitsBefore = s.frames.slice(0, hitFrame).reduce((a, f) => a + f.hits, 0);
  assert.equal(hitsBefore, 0, `第 ${hitFrame} 帧之前不该有命中`);
});

// ── 2. WAIT 真的挂起 n 帧 ──────────────────────────────────────────────

test('WAIT 挂起：pendingFrames 逐 tick 递减，期间脚本一条指令都不执行', () => {
  const world = staged(7);
  const s = startSkill(world, 'A' as Side, scriptOf(1), 0, 0);
  const wait = s.pendingFrames;
  assert.ok(wait >= 2, `命療術第 0 帧末应有 WAIT（实际 ${wait}）`);

  const frames0 = s.frames.length;
  const steps0 = s.summary().stats.instructions;
  for (let i = 0; i < wait - 1; i++) {
    s.advance();
    assert.equal(s.frames.length, frames0, `挂起第 ${i + 1} tick 不该跑新帧`);
    assert.equal(s.summary().stats.instructions, steps0, `挂起第 ${i + 1} tick 不该执行指令`);
    assert.equal(s.pendingFrames, wait - 1 - i, 'pendingFrames 应逐 tick 递减');
  }
  s.advance(); // 第 wait 个 tick：等够了，恢复执行
  assert.equal(s.frames.length, frames0 + 1, `${wait} tick 后应恢复并跑出新一帧`);
});

test('WAIT：clock 每 tick 只 +1（会话时间由 tick 驱动，不是脚本自己推）', () => {
  const world = staged(7);
  const s = startSkill(world, 'A' as Side, scriptOf(95), 20, 6.5);
  const c0 = s.clock;
  for (let i = 1; i <= 5; i++) {
    s.advance();
    assert.equal(s.clock, c0 + i, '逐帧模式下一个 tick 只能推进 1 虚拟帧');
  }
});

// ── 3. 会话结束 → stats 汇总 ───────────────────────────────────────────

test('会话结束：spellKills/spellHealed 汇总进 world.stats，settle 面板可见', () => {
  const world = staged(7);
  world.sides.A.general.mp = 9999;
  world.sides.A.general.qi = QI_MAX;
  const r = cast(world, 'A', 95, 20, 6.5);
  assert.equal(r.ok, true, `cast(95) 失败：${r.reason}`);
  assert.equal(world.sessions.length, 1, '多帧技能应留下一个在播会话');
  assert.equal(r.killed, 0, 'cast 只回填首帧战果（首帧没击杀）');

  advanceSessions(world);
  assert.equal(world.sessions.length, 1, '一 tick 之后还在播');
  let ticks = 0;
  while (world.sessions.length > 0 && ticks++ < 2000) advanceSessions(world);
  assert.equal(world.sessions.length, 0, '会话应自然结束');
  assert.ok(world.stats.spellKillsA > 0, `法术击杀应汇总进 stats（实际 ${world.stats.spellKillsA}）`);
  assert.equal(world.stats.spellKillsB, 0, 'B 方没放技，不该有法术击杀');

  const out = settle(world);
  assert.equal(out.spellKills, world.stats.spellKillsA, 'settle().spellKills 应等于 stats');
});

test('step() 集成：tickSkills 每 tick 推进会话（不是 cast 时一次跑完）', () => {
  const world = staged(7);
  world.sides.A.general.mp = 9999;
  world.sides.A.general.qi = QI_MAX;
  const r = cast(world, 'A', 95, 20, 6.5);
  assert.equal(r.ok, true);
  const s = world.sessions[0]!;
  const clock0 = s.clock;
  const frames0 = s.frames.length;
  for (let i = 0; i < 3; i++) step(world);
  assert.equal(s.clock, clock0 + 3, 'step() 每 tick 推进 1 帧');
  assert.ok(s.frames.length >= frames0, '帧数只会增长');
  assert.ok(world.fx.length > 0, '首帧就应该产出特效（cast 返回时可读）');

  // 会话跑完（或战斗提前结束）后，它的战果都记在 stats 里，不会凭空消失
  let n = 0;
  while (!s.done && !world.over && n++ < 2000) step(world);
  const accounted = world.stats.spellKillsA + world.stats.spellHealedA;
  assert.equal(
    accounted,
    s.done ? s.killed + s.healed : accounted,
    '会话结束后 killed/healed 必须已经汇总进 stats',
  );
  if (s.done) assert.equal(world.sessions.includes(s), false, '会话结束后不该留在 world.sessions');
});

// ── 4. 606 不再撞指令预算 ─────────────────────────────────────────────

test('606 不再死循环：同步跑 358k 条指令仍返回 ok（预算按 WAIT 分段）', (t) => {
  const world = staged(7);
  const r = runSkill(world, 'A' as Side, scriptOf(95), 20, 6.5);
  t.diagnostic(`同步 606：ok=${r.ok} 指令=${r.stats.instructions} syscall=${r.stats.syscalls} 物件=${r.stats.objects}`);
  assert.equal(r.ok, true, `606 同步执行应成功：${r.log.join(' | ')}`);
  assert.equal(r.log.some((l) => l.includes('死循环')), false, '不该再报死循环');
  // 旧断言 `> 400_000`（旧诊断写 528k）是按反极性的循环次数标的。0x3C/0x3D 按 EXE
  // 改对后（0x464660 / 0x464690）指令数落在 358291，同样与 project/154 §5 L5 的预测一致。
  // 精确定值比"大于某个更大的数"更严：既排除死循环，也钉住脚本真的跑完一遍。
  // R163 重定基线（原值 358291）：接上物件碰撞回调后，`TwisterSword` 的 `TwisterSwordCallback`
  // 真的逐次 `Hurt`，回调子实例的指令也算进总账。
  // R183 重钉 358333 → 358312（o1）：这两组数满足同一个算术恒等式 ——
  //   `指令 = 358291 + 21×n`、`syscall = 17440 + 4×n`
  // 金标准 358333/17448 是 `n=2`，现行 358312/17444 是 `n=1`，即差的正是**一个**回调子实例的
  // 记账（21 条指令 + 4 条 syscall）。R163 那次把 n 从 0 提到 1（358291→358312），R172 的日志
  // （`work\test_r172.log:1109`、`work\test_r93a.log:1096`）记的是 n=2。n 是"每次同步回合里
  // 回调子实例被记进总账的次数"，取决于当时 `drainInstancesSync` 的收尾时机，而 R163→R172 之间
  // 的 `runtime.ts` 在本仓库（非 git）里已经不可回滚 ⇒ 无法把 n 改回 2 而不猜。
  // 这里仍钉**精确值**（不是区间）：同一次运行里 seed 1/7/13 的同步指令数完全相同（358312），
  // 说明它是脚本+实现的性质、与布局无关；`spell_reds.test.ts` 里有这条布局无关性的钉子。
  assert.equal(r.stats.instructions, 358312, `606 完整跑完一遍应是 358312 条（实际 ${r.stats.instructions} 条）`);
  // 物件数同样随极性变：旧极性下主脚本多绕了几圈、建出 90 个；真极性下 601 帧只建 46 个
  // （螺旋每圈 1 个物件、圈数由 `WAIT 2` 决定，帧数一钉死物件数就跟着钉死）。这里只钉
  // "确实建出了一串螺旋物件"，不钉精确值——精确值会随 rng 抽到的 `rand(8,16)` 动。
  assert.ok(r.stats.objects >= 40, `应建出螺旋物件（实际 ${r.stats.objects} 个，真极性下是 46）`);

  // 同一份脚本在逐帧模式下也要能跑完（这正是任务二的判据）
  const world2 = staged(7);
  const s = startSkill(world2, 'A' as Side, scriptOf(95), 20, 6.5);
  drain(s);
  t.diagnostic(`逐帧 606：${s.frames.length} 帧 done=${s.done} ok=${s.ok} reason="${s.reason}"`);
  assert.equal(s.ok, true, `606 逐帧应成功：${s.reason}`);
  assert.equal(s.reason.includes('死循环'), false);
  assert.equal(s.frames.length, 559, `逐帧 606 也应是 559 帧（实际 ${s.frames.length}）`);
});

test('军师技 4 个消费点：气力回复 / 气力消耗 / 士兵战力 / 战后经验', () => {
  // ① 气力回复 ×(1+25%)（依据：docs/04b §4.3 / project/26 §3 ①；基值 = max(武力90, 智力100) = 100，R47）
  const w1 = createWorld({ data, seed: 6, a: { general: { str: 90, int: 100 } }, b: {} });
  w1.sides.A.general.qi = 1000;
  applyWise(w1, 'A', 9); // SPECS 9 = qi_regen +25
  step(w1);
  assert.equal(w1.sides.A.general.qi, 1000 + 125, '集氣 +25% 后每 tick 回 125');

  // ② 气力消耗 ×(1−20%)（SPECS 8 存的是 −20）
  const w2 = createWorld({ data, seed: 6, a: { general: { str: 90, int: 100 } }, b: {} });
  const base = qiCostOf(data, 50);
  assert.ok(base > 0 && base < QI_MAX, `半月斬 的氣力成本應小於整條（實際 ${base}）`);
  assert.equal(qiCostMul(w2, 'A'), 1, '没有军师技时系数为 1');
  applyWise(w2, 'A', 8);
  assert.equal(qiCostMul(w2, 'A'), 0.8, '保留氣力 −20% → 系数 0.8');
  w2.sides.A.general.qi = QI_MAX; // 半条气（60000）不够放，先灌满
  const qi0 = w2.sides.A.general.qi;
  const r2 = cast(w2, 'A', 50, 60, 6);
  assert.equal(r2.ok, true);
  assert.equal(qi0 - w2.sides.A.general.qi, Math.round(base * 0.8), '扣气力应按折后价');

  // ③ 士兵战力 +10 点（troop_atk 是点数，R33 已按原作 0x44D450 exec 21-26 改成纯加法；
  //    原 `Math.round(p0*1.08)` 的乘算口径已被反汇编推翻，见 project/109）
  const w3 = createWorld({ data, seed: 6, a: { general: { str: 90, int: 100 } }, b: {} });
  const p0 = powerOf(w3, 'A');
  applyWise(w3, 'A', 17); // SPECS 17 = troop_atk +10（增強攻擊：我方 +10 点）
  assert.equal(powerOf(w3, 'A'), p0 + 10, '士兵攻擊 +10 点应直接加进战力');

  // ④ 战后经验 ×(1+15%)（与 post.expBonus 叠加）
  const mk = () => {
    const w = createWorld({ data, seed: 9, a: { general: { str: 80, int: 80 } }, b: {} });
    w.over = true;
    w.winner = 'A';
    w.endReason = 'troops';
    return w;
  };
  const plain = settle(mk());
  const buffed = mk();
  applyWise(buffed, 'A', 21); // SPECS 21 = exp_bonus +15
  const withWise = settle(buffed);
  assert.equal(withWise.expGain, Math.round(plain.expGain * 1.15), '經驗增加 +15% 应放大 expGain');
});
