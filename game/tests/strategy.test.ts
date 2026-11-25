// R37 策略派發 + 援軍 —— `game/src/core/strategy.ts` 的行为契约。
//
// 依据：`work/dis_battle_B_44D450.txt`（66 分支派发器全反汇编）+ `data/wises.json` 的
// `Execute` 列（= 分支号）+ `work/str_big5.tsv`（每条分支的原文字符串）。
// 见 `project/61_策略与援军.md`。
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import {
  ARMY_FLAG,
  QI_TIER_MUL,
  REGEN_PERIOD_TICKS,
  STRATEGY_ENGAGE_RANGE,
  STRATEGY_TABLE,
  pickStrategySeq,
  planReinforceGroups,
  planStrategy,
  reinforceTroopsOf,
  runStrategy,
  strategyDefOf,
  tickReinforce,
  tickStrategy,
} from '../src/core/strategy.ts';
import {
  cast,
  createWorld,
  powerOf,
  qiCostMul,
  requestRetreat,
  settle,
  step,
  tickSkills,
} from '../src/core/battle.ts';
import { garrisonOf } from '../src/core/garrison.ts';

import { engage as engageAll } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

type World = ReturnType<typeof createWorld>;
type Opts = Parameters<typeof createWorld>[0];

function mk(patch: Partial<Opts> = {}): World {
  // m4：默认待機后要显式下令，策略/援军才会在 tick 循环里被触发（旧内核缺省自动前压）。
  return engageAll(createWorld({ data, seed: 11, ...patch }));
}

/**
 * 某条分支（Execute）对应的 `WISE.SEQUENCE`。
 * `wises.json` 一条分支只有一行（`Execute` 唯一、`WiseLevel` 是该行的档位），
 * 所以给 `tier` 只是顺带校验档位没记错。
 */
function seqFor(exec: number, tier?: number): number {
  const row = data.wises.find((w) => w.Execute === exec);
  assert.ok(row, `wises.json 里找不到 Execute=${exec}`);
  if (tier !== undefined) {
    assert.equal(row!.WiseLevel, tier, `Execute=${exec} 的档位应为 ${tier}，实际 ${row!.WiseLevel}`);
  }
  return row!.SEQUENCE;
}

/** 把两侧各一个兵贴到一起（进入 `STRATEGY_ENGAGE_RANGE`），返回触发用的那个单位 */
function engage(w: World, side: 'A' | 'B' = 'A'): { unit: World['units'][number]; foe: World['units'][number] } {
  const unit = w.units.find((u) => u.side === side && u.alive && !u.isGeneral);
  const foe = w.units.find((u) => u.side !== side && u.alive && !u.isGeneral);
  assert.ok(unit && foe, '两侧都要有兵');
  unit!.x = foe!.x;
  unit!.y = foe!.y;
  return { unit: unit!, foe: foe! };
}

/** 直接走一遍 planStrategy → runStrategy，返回事件 */
function fire(w: World, side: 'A' | 'B', seq: number) {
  const army = w.army[side];
  army.seq = seq;
  army.used = false;
  const { unit } = engage(w, side);
  const pick = planStrategy(w, side, unit);
  assert.ok(pick, `planStrategy(${side}, seq=${seq}) 应返回指令`);
  return runStrategy(w, pick!);
}

// ---------------------------------------------------------------------------
// 一、策略表（67 条 = 66 条分支 + 跳表首项）
// ---------------------------------------------------------------------------

test('R37 策略表覆盖 Execute 1..67，顺序与跳表一致', () => {
  assert.equal(STRATEGY_TABLE.length, 67);
  for (let i = 0; i < 67; i++) {
    assert.equal(STRATEGY_TABLE[i]!.exec, i + 1, `第 ${i} 条的 exec 应为 ${i + 1}`);
    assert.ok(STRATEGY_TABLE[i]!.text.length > 0);
  }
  // 每条 Execute 都能在 wises.json 里找到至少一条军师技
  for (let exec = 1; exec <= 67; exec++) {
    assert.ok(data.wises.some((w) => w.Execute === exec), `wises.json 缺 Execute=${exec}`);
  }
});

test('R37 士气三档 = 15/25/40（0x0F/0x19/0x28）', () => {
  assert.deepEqual([1, 2, 3].map((e) => strategyDefOf(e)!.value), [15, 25, 40]);
  assert.deepEqual([4, 5, 6].map((e) => strategyDefOf(e)!.value), [15, 25, 40]);
  assert.equal(strategyDefOf(1)!.kind, 'morale-down');
  assert.equal(strategyDefOf(4)!.kind, 'morale-up');
});

test('R37 体力/技力三档 = 20-35-50 / 25-40-60 百分比', () => {
  assert.deepEqual([15, 16, 17].map((e) => strategyDefOf(e)!.value), [20, 35, 50]);
  assert.equal(strategyDefOf(15)!.kind, 'hp-up');
  assert.deepEqual([18, 19, 20].map((e) => strategyDefOf(e)!.value), [25, 40, 60]);
  assert.equal(strategyDefOf(18)!.kind, 'mp-up');
});

test('R37 恢复体力 40/60/80、恢复技力 30/50/70、喝阻 10/15/25、保留气力 66/50/25、经验 30/50/100', () => {
  assert.deepEqual([35, 36, 37].map((e) => strategyDefOf(e)!.value), [40, 60, 80]);
  assert.deepEqual([38, 39, 40].map((e) => strategyDefOf(e)!.value), [30, 50, 70]);
  assert.deepEqual([58, 59, 60].map((e) => strategyDefOf(e)!.value), [10, 15, 25]);
  assert.deepEqual([61, 62, 63].map((e) => strategyDefOf(e)!.value), [66, 50, 25]);
  assert.deepEqual([53, 54, 55].map((e) => strategyDefOf(e)!.value), [30, 50, 100]);
});

test('R37 状态位常量与反汇编 `army+0x84` 位掩码一致', () => {
  assert.equal(ARMY_FLAG.noRetreat, 0x4); // 敌軍無法退兵
  assert.equal(ARMY_FLAG.mayRetreat, 0x8); // 武將可以後退
  assert.equal(ARMY_FLAG.guardGeneral, 0x10); // 士兵可以保護主將
  assert.equal(ARMY_FLAG.qiSpeed, 0x20); // 集氣 speed 状态位
  assert.equal(ARMY_FLAG.fleeAnytime, 0x40); // 隨時撤退
  assert.equal(ARMY_FLAG.qiSave, 0x80); // 省氣
  assert.equal(ARMY_FLAG.sealMagic, 0x100); // 封武將技
  assert.equal(ARMY_FLAG.generalAtk, 0x200); // 強化武將
  assert.equal(ARMY_FLAG.defect, 0x400); // 說服敵將投靠
  assert.equal(ARMY_FLAG.hpRegen, 1);
  assert.equal(ARMY_FLAG.mpRegen, 2);
});

test('R37 集氣檔位係數覆盖 ±3 档且 0 档为 1', () => {
  assert.equal(QI_TIER_MUL[0], 1);
  assert.ok(QI_TIER_MUL[1]! > 1 && QI_TIER_MUL[3]! > QI_TIER_MUL[2]!);
  assert.ok(QI_TIER_MUL[-1]! < 1 && QI_TIER_MUL[-3]! < QI_TIER_MUL[-2]!);
  // 原作 `+0x90`：快速集氣 +1/+2/+3 = 130/150/200%，減緩 −1/−2/−3 = 76/66/50%
  assert.equal(QI_TIER_MUL[1], 1.3);
  assert.equal(QI_TIER_MUL[2], 1.5);
  assert.equal(QI_TIER_MUL[3], 2);
  assert.equal(QI_TIER_MUL[-1], 0.76);
  assert.equal(QI_TIER_MUL[-2], 0.66);
  assert.equal(QI_TIER_MUL[-3], 0.5);
});

// ---------------------------------------------------------------------------
// 二、planStrategy 的闸（= `0x44D450` 入口那套判定）
// ---------------------------------------------------------------------------

test('R37 没带军师技 → planStrategy 返回 null', () => {
  const w = mk();
  assert.equal(w.army.A.seq, null);
  const { unit } = engage(w, 'A');
  assert.equal(planStrategy(w, 'A', unit), null);
});

test('R37 未接战（敌人在视野外）→ 不派发', () => {
  const w = mk({ a: { strategy: seqFor(1, 1), soldiers: 30 } });
  const unit = w.units.find((u) => u.side === 'A' && !u.isGeneral)!;
  // 找一个离所有敌人都很远的我方单位：直接把敌人推到另一端
  for (const u of w.units) if (u.side === 'B') u.x = 0.4;
  unit.x = 40;
  unit.y = 6.5;
  assert.ok(planStrategy(w, 'A', unit) === null);
  assert.equal(STRATEGY_ENGAGE_RANGE > 0, true);
});

test('R37 接战 → 返回对应 seq / exec / 原文文案', () => {
  const w = mk({ a: { strategy: seqFor(3, 3) } });
  const { unit } = engage(w, 'A');
  const pick = planStrategy(w, 'A', unit)!;
  assert.equal(pick.exec, 3);
  assert.equal(pick.kind, 'morale-down');
  assert.equal(pick.value, 40);
  assert.equal(pick.seq, seqFor(3, 3));
  assert.equal(pick.text, '敵方士氣下降40點');
  assert.equal(pick.name, '降敵士氣');
});

test('R37 同一侧只派发一次（军在战斗中只结算一次）', () => {
  const w = mk({ a: { strategy: seqFor(4, 1) } });
  fire(w, 'A', seqFor(4, 1));
  const { unit } = engage(w, 'A');
  assert.equal(planStrategy(w, 'A', unit), null);
  assert.equal(w.army.A.used, true);
});

test('R37 战斗已结束 → 不派发', () => {
  const w = mk({ a: { strategy: seqFor(4, 1) } });
  const { unit } = engage(w, 'A');
  w.over = true;
  assert.equal(planStrategy(w, 'A', unit), null);
});

// ---------------------------------------------------------------------------
// 三、runStrategy 的落地效果
// ---------------------------------------------------------------------------

test('R37 降敵士氣 真扣敌方士气，并写 strategyEvents / log', () => {
  const w = mk({ a: { strategy: seqFor(3, 3) }, b: { morale: 80 } });
  const before = w.sides.B.morale;
  const ev = fire(w, 'A', seqFor(3, 3));
  assert.equal(w.sides.B.morale, Math.max(0, before - 40));
  assert.equal(w.strategyEvents.length, 1);
  assert.equal(w.strategyEvents[0]!.tick, w.tick);
  assert.equal(w.strategyUsed.A, seqFor(3, 3));
  assert.ok(w.log.some((l) => l.kind === 'strategy' && l.text === '敵方士氣下降40點'));
  assert.equal(ev.sfx, 'wise');
});

test('R37 鼓舞士氣 加自己，且士气夹 0..100', () => {
  const w = mk({ a: { strategy: seqFor(6, 3), morale: 90 } });
  const before = w.sides.A.morale;
  fire(w, 'A', seqFor(6, 3));
  assert.equal(w.sides.A.morale, Math.min(100, before + 40));
  assert.ok(w.sides.A.morale <= 100);
});

test('R37 增強攻擊 +10/20/30 直接进 powerOf', () => {
  const w = mk({ a: { strategy: seqFor(23, 3) } });
  const before = powerOf(w, 'A');
  fire(w, 'A', seqFor(23, 3));
  assert.equal(powerOf(w, 'A'), before + 30);
  assert.equal(w.army.A.atkMod, 30);
});

test('R37 強化士兵 让敌方 powerOf −10/20/30（原文写"我方防禦上昇"）', () => {
  const w = mk({ a: { strategy: seqFor(26, 3) } });
  const before = powerOf(w, 'B');
  fire(w, 'A', seqFor(26, 3));
  assert.equal(powerOf(w, 'B'), before - 30);
  assert.equal(w.army.B.atkMod, -30);
});

test('R37 混亂敵軍 双方各 ±5/10/15', () => {
  const w = mk({ a: { strategy: seqFor(29, 3) } });
  const own = powerOf(w, 'A');
  const foe = powerOf(w, 'B');
  fire(w, 'A', seqFor(29, 3));
  assert.equal(powerOf(w, 'A'), own + 15);
  assert.equal(powerOf(w, 'B'), foe - 15);
});

test('R37 十面埋伏 让敌方不能撤退（requestRetreat 返回 false）', () => {
  const w = mk({ a: { strategy: seqFor(44, 0) } });
  assert.equal(requestRetreat(w, 'B'), true);
  const w2 = mk({ a: { strategy: seqFor(44, 0) } });
  fire(w2, 'A', seqFor(44, 0));
  assert.equal(w2.army.B.flags & ARMY_FLAG.noRetreat, ARMY_FLAG.noRetreat);
  assert.equal(requestRetreat(w2, 'B'), false);
  assert.equal(w2.log.at(-1)!.text, '敵方無法退兵');
});

test('R37 十面埋伏 遇到骑马的敌将 → 被破解（不置 noRetreat）', () => {
  const rider = data.generals.find((g) => typeof g.Horse === 'string' && g.Horse.length > 0);
  assert.ok(rider, '武将表里要有骑马的人');
  const w = mk({
    a: { strategy: seqFor(44, 0) },
    b: { general: { name: rider!.NAME, str: rider!.STR, int: rider!.INT, level: 10 } },
  });
  fire(w, 'A', seqFor(44, 0));
  assert.equal(w.army.B.flags & ARMY_FLAG.noRetreat, 0);
  assert.ok(w.log.at(-1)!.text.includes('破解我方埋伏'));
});

test('R37 封武將技 → cast 走新 reason `sealed`', () => {
  const seq = data.magics[0]!.SEQUENCE;
  const w = mk({ b: { strategy: seqFor(64, 0) } });
  // 先把气/技力给够，让"封技前能放"这一半真的走通（否则先被 'qi' 闸拦下）
  w.sides.A.general.qi = 120000;
  w.sides.A.general.mp = w.sides.A.general.mpMax;
  const before = cast(w, 'A', seq, 30, 6);
  assert.equal(before.ok, true, `封技前应能放，reason=${before.reason}`);
  fire(w, 'B', seqFor(64, 0));
  assert.equal(w.army.A.flags & ARMY_FLAG.sealMagic, ARMY_FLAG.sealMagic);
  const after = cast(w, 'A', seq, 30, 6);
  assert.equal(after.ok, false);
  assert.equal(after.reason, 'sealed');
});

test('R37 保留氣力 让 qiCostMul 乘 66/50/25%', () => {
  const w = mk({ a: { strategy: seqFor(61, 1) } });
  const before = qiCostMul(w, 'A');
  fire(w, 'A', seqFor(61, 1));
  assert.ok(Math.abs(qiCostMul(w, 'A') - before * 0.66) < 1e-9);
});

test('R37 快速集氣 +1 档 → qiTier=1，回气速度 ×1.3', () => {
  const base = mk({ a: { strategy: seqFor(50, 1) } });
  const g0 = base.sides.A.general;
  const q0 = g0.qi;
  tickSkills(base);
  const plain = g0.qi - q0;

  const w = mk({ a: { strategy: seqFor(50, 1) } });
  fire(w, 'A', seqFor(50, 1));
  assert.equal(w.army.A.qiTier, 1);
  const g = w.sides.A.general;
  const q = g.qi;
  tickSkills(w);
  const fast = g.qi - q;
  assert.ok(fast > plain, `快速集氣应更快：${fast} vs ${plain}`);
  assert.ok(Math.abs(fast / plain - 1.3) < 0.05, `倍率应接近 1.3，实际 ${fast / plain}`);
});

test('R37 恢復體力 每 60 tick 回一次血，且不超上限', () => {
  const w = mk({ a: { strategy: seqFor(35, 1) } }); // 40
  fire(w, 'A', seqFor(35, 1));
  const g = w.sides.A.general;
  g.hp = Math.max(1, Math.floor(g.maxHp / 2));
  const hurt = g.hp;
  w.tick = REGEN_PERIOD_TICKS; // 对齐周期
  tickSkills(w);
  assert.ok(g.hp > hurt, `应回血：${hurt} → ${g.hp}`);
  g.hp = g.maxHp;
  w.tick = REGEN_PERIOD_TICKS * 2;
  tickSkills(w);
  assert.equal(g.hp, g.maxHp);
});

test('R37 增加經驗 进 settle() 的 expGain', () => {
  const w1 = mk({ b: { soldiers: 10 } });
  const w2 = mk({ b: { soldiers: 10 } });
  // 先派发（需要场上有敌人），再人工把局面压成"敌将阵亡"的一致状态
  fire(w2, 'A', seqFor(55, 3)); // +100%
  for (const w of [w1, w2]) {
    w.units = w.units.filter((u) => u.side !== 'B' || u.isGeneral);
    w.sides.B.general.alive = false;
    w.over = true;
    w.winner = 'A';
    w.endReason = 'general';
  }
  const s1 = settle(w1);
  const s2 = settle(w2);
  assert.equal(w2.army.A.expPct, 100);
  assert.ok(s1.expGain > 0, `基准经验应 > 0，实际 ${s1.expGain}`);
  assert.equal(s2.expGain, Math.round(s1.expGain * 2));
});

test('R37 亂陣 打散敵兵并把敌阵形归零', () => {
  const w = mk({ a: { strategy: seqFor(7, 0) } });
  const enemy = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
  const before = enemy.map((u) => ({ x: u.x, y: u.y }));
  w.sides.B.formation = 3;
  fire(w, 'A', seqFor(7, 0));
  const moved = enemy.filter((u, i) => u.x !== before[i]!.x || u.y !== before[i]!.y).length;
  assert.ok(moved > 0, '总得有兵被挪动');
  assert.equal(w.sides.B.formation, 0);
  assert.equal(w.log.at(-1)!.text, '敵方陣型潰散');
});

test('R37 喝阻敵軍 抽走敵兵但不计入战功（逃走 ≠ 陣亡）', () => {
  const w = mk({ a: { strategy: seqFor(59, 2) } }); // 15%
  const foeBefore = w.units.filter((u) => u.side === 'B' && !u.isGeneral).length;
  const killsBefore = w.stats.killsInf + w.stats.killsCav;
  fire(w, 'A', seqFor(59, 2));
  const foeAfter = w.units.filter((u) => u.side === 'B' && !u.isGeneral).length;
  assert.ok(foeAfter < foeBefore, `应抽走敵兵：${foeBefore} → ${foeAfter}`);
  assert.equal(w.stats.killsInf + w.stats.killsCav, killsBefore);
  assert.ok(w.log.at(-1)!.text.startsWith('敵方士兵逃走'));
});

test('R94 後選出陣（Execute 34）只立 chooseAfterFoe + 一句日志，不动数值', () => {
  const w = mk({ a: { strategy: seqFor(34, 0) } });
  const sig = JSON.stringify({ b: powerOf(w, 'B'), a: powerOf(w, 'A') });
  const ev = fire(w, 'A', seqFor(34, 0));
  // 改前：`ops.length === 1` 且只有 `note`（照抄原作 0x44DE44 那一句「成功」日誌）。
  // 改後：`['afterfoe', 'note']` —— 前面多出「敵方之後選將」旗標。依據 project/109 §5.3
  // 的語義（ATTRIB=1 戰前選擇）+ R94 的落地點 `deploy_queue.ts:chooseAfterFoe()`；
  // 原作零狀態寫入那部分照舊不造（不補兵、不改數值），所以 powerOf 仍完全不變。
  assert.deepEqual(ev.ops.map((o) => o.op), ['afterfoe', 'note']);
  assert.equal(w.army.A.chooseAfterFoe, true, '旗標立在派發方');
  assert.equal(JSON.stringify({ b: powerOf(w, 'B'), a: powerOf(w, 'A') }), sig);
});

// ---------------------------------------------------------------------------
// 四、tick 循环里的真实触发点
// ---------------------------------------------------------------------------

test('R37 step() 的 tick 循环里真触发策略（不是只写函数）', () => {
  const w = mk({
    a: { strategy: seqFor(3, 3), soldiers: 40 },
    b: { strategy: seqFor(17, 3), soldiers: 40 },
  });
  assert.equal(w.strategyEvents.length, 0);
  let firedAt = -1;
  for (let i = 0; i < 900 && !w.over; i++) {
    step(w);
    if (w.strategyEvents.length > 0 && firedAt < 0) firedAt = w.tick;
  }
  assert.ok(firedAt > 0, '应在某个 tick 触发');
  assert.ok(w.strategyEvents.length >= 1);
  assert.ok(w.log.some((l) => l.kind === 'strategy'));
  // 触发点一定发生在接战之后
  assert.ok(firedAt > 1);
});

test('R37 tickStrategy 不会给没带军师技的一侧派发', () => {
  const w = mk({ a: { strategy: seqFor(1, 1), soldiers: 40 }, b: { soldiers: 40 } });
  for (let i = 0; i < 400 && !w.over; i++) step(w);
  assert.equal(w.army.B.seq, null);
  assert.ok(w.strategyEvents.every((e) => e.side === 'A'));
});

// ---------------------------------------------------------------------------
// 五、援軍
// ---------------------------------------------------------------------------

function twoCities(): { city: string; from: string; scenario: number } {
  const sc = data.scenarios[0] as unknown as { id: number; cities: Array<Record<string, unknown>> };
  const withPos = sc.cities.filter((c) => Array.isArray(c.POS) && Array.isArray(c.POS) && String(c.NAME));
  const a = withPos[0]!;
  // 选一个离第一座最远的城，保证城距 > 1
  let best = withPos[1]!;
  let bestD = -1;
  for (const c of withPos.slice(1)) {
    const d = Math.hypot(Number((a.POS as number[])[0]) - Number((c.POS as number[])[0]), Number((a.POS as number[])[1]) - Number((c.POS as number[])[1]));
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return { city: String(a.NAME), from: String(best.NAME), scenario: Number(sc.id) };
}

test('R37 援軍兵數取自邻城預備兵（garrisonOf），不是写死的 100', () => {
  const { from, scenario } = twoCities();
  const g = garrisonOf(data, scenario, from);
  assert.ok(g && g.garrison > 0, `garrisonOf(${from}) 应有预备兵`);
  const { troops, basis } = reinforceTroopsOf(data, { side: 'B', from, scenario }, 100);
  const expected = Math.min(200, Math.max(30, Math.round(g!.garrison * 0.25)));
  assert.equal(troops, expected, `兵数应 = 预备兵 ${g!.garrison} × 25% 夹 30..200`);
  assert.ok(basis.startsWith('reserve:'), `要能说明来源，实际 ${basis}`);
  // 显式 troops 优先
  assert.equal(reinforceTroopsOf(data, { side: 'B', troops: 77 }, 100).troops, 77);
});

test('R37 援軍配置在建局时就定下兵数/城距/触发阈值', () => {
  const { city, from, scenario } = twoCities();
  const w = mk({ reinforce: [{ side: 'B', city, from, scenario, triggerRatio: 0.9 }] });
  assert.equal(w.reinforce.length, 1);
  const g = w.reinforce[0]!;
  assert.equal(g.side, 'B');
  assert.ok(g.troops >= 30 && g.troops <= 200);
  assert.ok((g.distance ?? 0) >= 1, `城距应 >= 1，实际 ${g.distance}`);
  assert.equal(g.arrived, false);
  assert.equal(g.scheduled, false);
  assert.equal(g.arriveTick, -1);
  assert.equal(g.triggerRatio, 0.9);
});

test('R37 援軍狀態機：低於閾值才出發 → arriveTick 入場 → 落在後排外側 + rally 提示', () => {
  const { city, from, scenario } = twoCities();
  const w = mk({
    b: { soldiers: 60 },
    reinforce: [{ side: 'B', city, from, scenario, triggerRatio: 0.9, delayTicks: 40 }],
  });
  const g = w.reinforce[0]!;
  const troops = g.troops;
  // 没掉兵 → 不出发
  tickReinforce(w);
  assert.equal(g.scheduled, false);
  // 让守方掉到阈值以下（`aliveCount` 由 `recompute()` 数，所以要走一 tick 的 step 才会刷新）
  const victims = w.units.filter((u) => u.side === 'B' && !u.isGeneral).slice(0, Math.ceil(w.sides.B.start * 0.3));
  for (const u of victims) u.alive = false;
  step(w); // tick 1：recompute → tickReinforce 在这里出发
  assert.equal(g.scheduled, true);
  assert.equal(g.arriveTick, 1 + 40);
  // 还没到点
  w.tick = g.arriveTick - 1;
  tickReinforce(w);
  assert.equal(g.arrived, false);
  // 到点入场
  const rearBefore = Math.min(...w.units.filter((u) => u.side === 'B' && u.alive && !u.isGeneral).map((u) => u.x));
  const unitsBefore = w.units.length;
  w.tick = g.arriveTick;
  tickReinforce(w);
  assert.equal(g.arrived, true);
  assert.equal(g.units.length, troops);
  assert.equal(w.units.length, unitsBefore + troops);
  // 入场位置在己方后排外侧（B 在 −x 侧）
  for (const u of g.units) assert.ok(u.x < rearBefore, `援軍应在后排外侧：${u.x} vs ${rearBefore}`);
  assert.ok(w.log.some((l) => l.kind === 'reinforce' && l.sfx === 'rally'));
  assert.ok(w.log.some((l) => l.kind === 'reinforce' && l.sfx === 'march'));
  // start/soldiers/aliveCount 同步增加（与 wises.addRearUnits 的不变式一致）
  assert.equal(w.sides.B.soldiers, 60 + troops);
});

test('R37 援軍在 step() 的 tick 循环里也会入场（接线到位）', () => {
  const { city, from, scenario } = twoCities();
  const w = mk({
    a: { soldiers: 30, strategy: seqFor(60, 3) },
    b: { soldiers: 30 },
    reinforce: [{ side: 'B', city, from, scenario, triggerRatio: 0.95, delayTicks: 1 }],
  });
  let arrived = false;
  for (let i = 0; i < 600 && !w.over; i++) {
    step(w);
    if (w.reinforce[0]!.arrived) {
      arrived = true;
      break;
    }
  }
  assert.ok(arrived, '援軍应在 tick 循环里入场');
  assert.ok(w.reinforce[0]!.units.length > 0);
});

test('R37 pickStrategySeq 按 WISESKILL + 等级挑档（AI 用）', () => {
  const caocao = data.generals.find((g) => g.NAME === '曹操');
  assert.ok(caocao, '需要曹操');
  const low = pickStrategySeq(data, '曹操', 1);
  const high = pickStrategySeq(data, '曹操', 40);
  assert.ok(low !== null && high !== null, `低/高级都该有可用军师技：${low}/${high}`);
  const tierOf = (seq: number) => data.wises.find((w) => w.SEQUENCE === seq)!.WiseLevel;
  assert.ok(tierOf(high!) >= tierOf(low!));
  assert.equal(pickStrategySeq(data, '不存在的人', 40), null);
});
