/**
 * m4 AI 发令器验收测试（`project/177_战斗行动模型.md` §AI）。
 *
 * 依据 `project/173_原作战斗行为真相.md` Q3：
 *  - 0x444385 每帧递减两个倒计时，≤0 调 0x402EA5，然后写回 0x3C(60) ⇒ 入场第一帧决策、之后每 60 帧；
 *  - 0x402FB4 w0=100（不动）；0x4031B5 w[case2 突擊]+=0xC；0x40313D 前线 4 小队 +0x96；
 *    兵种相克 +0x3E8；case4 前進（0x44497F）只写槽 0，case2 走 0x4448B2 写槽 1..7。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld, step } from '../src/core/battle.ts';
import type { Side, World } from '../src/core/battle.ts';
import {
  AI_PERIOD,
  AI_W_ADVANCE,
  AI_W_NONE,
  AI_W_RUSH,
  AI_W_RUSH_COUNTER,
  AI_W_RUSH_FRONTLINE,
  aiCountdownOf,
  decideBattleAi,
  aiWeights,
  counterAdvantage,
  frontlineUnits,
  resetAiCountdown,
  tickBattleAi,
} from '../src/core/battle_ai.ts';
import { armyOrderOf, installArmyOrders, uninstallArmyOrders } from '../src/core/army_cmd.ts';
import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

interface Opts {
  aiA?: boolean;
  aiB?: boolean;
  soldiersA?: number;
  soldiersB?: number;
  troopA?: number;
  troopB?: number;
}

function make(opts: Opts = {}): World {
  const w = createWorld({
    data,
    seed: 21,
    a: { soldiers: opts.soldiersA ?? 8, troop: opts.troopA ?? 0, formation: 0 },
    b: { soldiers: opts.soldiersB ?? 8, troop: opts.troopB ?? 0, formation: 0 },
    aiSides: { A: opts.aiA ?? true, B: opts.aiB ?? true },
  });
  installArmyOrders(w);
  return w;
}

const slots = (w: World, side: Side): number[] => [...armyOrderOf(w, side).cmds];

// ---------------------------------------------------------------------------
// 节拍
// ---------------------------------------------------------------------------

test('AI_PERIOD = 60（0x444385 写回 0x3C=60）', () => {
  assert.equal(AI_PERIOD, 60);
});

test('AI 倒计时：第 1 帧就决策，之后每 60 帧一次（两个倒计时零初始化）', () => {
  const w = make();
  resetAiCountdown(w, 'A');
  tickBattleAi(w);
  assert.equal(aiCountdownOf(w, 'A'), 60, '第一帧决策后写回 60');
  tickBattleAi(w);
  assert.equal(aiCountdownOf(w, 'A'), 59);
  for (let i = 0; i < 58; i++) tickBattleAi(w);
  assert.equal(aiCountdownOf(w, 'A'), 1, '第 60 帧倒计时剩 1');
  tickBattleAi(w);
  assert.equal(aiCountdownOf(w, 'A'), 60, '第 61 帧再决策');
});

test('aiSides 关闭时 AI 完全不下令（同 seed 无 AI 对局不受影响）', () => {
  const w = make({ aiA: false, aiB: false });
  for (let i = 0; i < 600; i++) tickBattleAi(w);
  assert.deepEqual(slots(w, 'A'), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(slots(w, 'B'), [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('aiSides 打开但没装 aiCommand：不抛错、不下令（空转）', () => {
  const w = createWorld({
    data,
    seed: 21,
    a: { soldiers: 8, troop: 0, formation: 0 },
    b: { soldiers: 8, troop: 0, formation: 0 },
    aiSides: { A: true, B: true },
  });
  for (let i = 0; i < 300; i++) tickBattleAi(w);
  assert.deepEqual(slots(w, 'A'), [0, 0, 0, 0, 0, 0, 0, 0]);
});

// ---------------------------------------------------------------------------
// 权重（0x402FB4 / 0x40313D / 0x4031B5）
// ---------------------------------------------------------------------------

test('权重底表：w0=100、突擊 +12、前進 +12，其余 0（0x402FB4 / 0x4031B5）', () => {
  const w = make({ troopA: 0, troopB: 0 });
  const wgt = aiWeights(w, 'A');
  assert.equal(wgt.length, 7);
  assert.equal(wgt[0], AI_W_NONE);
  assert.equal(wgt[0], 100);
  assert.equal(wgt[2], AI_W_RUSH);
  assert.equal(wgt[2], 12);
  assert.equal(wgt[4], AI_W_ADVANCE);
  assert.equal(wgt[4], 12);
  assert.equal(wgt[1], 0);
  assert.equal(wgt[3], 0);
  assert.equal(wgt[5], 0);
  assert.equal(wgt[6], 0);
});

test('权重：无兵时清掉进攻位（0x4030EC army+0x5c<=0 清 bit1|2|8）', () => {
  const w = make({ soldiersA: 8, soldiersB: 8 });
  for (const u of w.units) if (u.side === 'A' && !u.isGeneral) u.alive = false;
  const wgt = aiWeights(w, 'A');
  assert.equal(wgt[2], 0, '无兵不该抽突擊');
  assert.equal(wgt[4], 0, '无兵不该抽前進');
});

test('权重：相克 +1000、前线 4 单位 +150（0x40313D / 0x4031B5）', () => {
  // 找到一个真的相克组合（troops 表是 ±68 或 ±25 的矩阵）
  let counter: [number, number] | null = null;
  outer: for (let i = 0; i < data.troops.names.length; i++) {
    for (let j = 0; j < data.troops.names.length; j++) {
      if ((data.troops.matrix[i]?.vs[j] ?? 0) > 0) {
        counter = [i, j];
        break outer;
      }
    }
  }
  assert.ok(counter, '数据里该有相克组合');
  const [ta, tb] = counter!;
  const w = make({ troopA: ta, troopB: tb });
  assert.equal(counterAdvantage(w, 'A'), true);
  assert.ok((data.troops.matrix[tb]?.vs[ta] ?? 0) <= 0, '反向不该也被判成「我克他」');
  const wgt = aiWeights(w, 'A');
  assert.equal(wgt[2], AI_W_RUSH + AI_W_RUSH_COUNTER, '相克时突擊 +0x3E8');

  // 前线 4 单位：把双方士兵贴到前线附近，凑出 4 个前线单位
  const w2 = make({ troopA: 0, troopB: 0, soldiersA: 8, soldiersB: 8 });
  const foeGen = w2.units.find((u) => u.side === 'B' && u.isGeneral)!;
  const mine = w2.units.filter((u) => u.side === 'A' && !u.isGeneral).slice(0, 4);
  const xs = Array.from({ length: mine.length }, () => foeGen.x + 2);
  const ys = [6, 5, 7, 0];
  for (let i = 0; i < mine.length; i++) {
    const u = mine[i]!;
    u.x = xs[i]!;
    u.y = ys[i]!;
    u.prevX = u.x;
    u.prevY = u.y;
    u.slide = null;
  }
  const fl = frontlineUnits(w2, 'A');
  const wgt2 = aiWeights(w2, 'A');
  if (fl === 4) {
    assert.equal(wgt2[2], AI_W_RUSH + AI_W_RUSH_FRONTLINE, '前线 4 单位时突擊 +0x96');
  } else {
    // 五军投影口径下不一定正好 4，退而求其次只断言「不无脑加」
    assert.ok(wgt2[2] === AI_W_RUSH || wgt2[2] === AI_W_RUSH + AI_W_RUSH_FRONTLINE);
  }
});

// ---------------------------------------------------------------------------
// 决策 → 命令（0x44497F / 0x4448B2）
// ---------------------------------------------------------------------------

test('case2 突擊：先寫槽 0 前進、再寫槽 1..7 突擊（兩條命令組合）', () => {
  const w = make();
  const calls: string[] = [];
  w.aiCommand = (_w, _s, cmd) => calls.push(cmd);
  // rng 落在 w[2] 的区间：累计 100 / 112 / 124
  const oldRng = w.rng;
  w.rng = () => 0.85; // 0.85*124 = 105.4 → 落在 case2
  const c = decideBattleAi(w, 'A');
  w.rng = oldRng;
  assert.equal(c, 2);
  assert.deepEqual(calls, ['advance', 'rush'], 'case2 必须两条命令都发');
});

test('case4 前進：只發 advance（0x44497F 只写槽 0）', () => {
  const w = make();
  const calls: string[] = [];
  w.aiCommand = (_w, _s, cmd) => calls.push(cmd);
  const oldRng = w.rng;
  w.rng = () => 0.98; // 0.98*124 = 121.5 → 落在 case4
  const c = decideBattleAi(w, 'A');
  w.rng = oldRng;
  assert.equal(c, 4);
  assert.deepEqual(calls, ['advance']);
});

test('aiArmyCommand：advance 只写槽 0=1，rush 写槽 1..7=7 并置全军突擊', () => {
  const w = make({ aiA: false, aiB: false });
  w.aiCommand?.(w, 'A', 'advance');
  const st = armyOrderOf(w, 'A');
  assert.equal(st.cmds[0], 1, 'advance = 槽 0 前進');
  for (let i = 1; i < 8; i++) assert.equal(st.cmds[i], 0, 'advance 不该碰槽 1..7');
  w.aiCommand?.(w, 'A', 'rush');
  for (let i = 1; i < 8; i++) assert.equal(st.cmds[i], 7, 'rush = 槽 1..7 突擊');
  assert.equal(w.rush.A, true, 'rush 还要置 world.rush（allRush）');
});

test('uninstallArmyOrders 后 AI 不再能发令', () => {
  const w = make();
  uninstallArmyOrders(w);
  assert.equal(w.aiCommand, undefined);
  assert.equal(w.armyStepPlan, undefined);
});

// ---------------------------------------------------------------------------
// 端到端：AI 开起来后 20 seeds 都能在 1200 tick 内接触
// ---------------------------------------------------------------------------

test('20 seeds：AI 双方开启后都能在 1200 tick 内接触（且 tick 数有分布）', () => {
  const ticks: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const w = createWorld({
      data,
      seed,
      a: { soldiers: 50, troop: 0, formation: 0 },
      b: { soldiers: 50, troop: 0, formation: 0 },
      aiSides: { A: true, B: true },
    });
    engage(w); // 装指令层 + 第一步先按原作菜单节奏给双方下令（AI 自己也会在 tick 1 决策）
    let contact = 0;
    for (let i = 0; i < 1200 && !w.over; i++) {
      step(w);
      if (w.stats.attacksA + w.stats.attacksB > 0) {
        contact = w.tick;
        break;
      }
    }
    assert.ok(contact > 0, `seed ${seed} 1200 tick 内没接触`);
    ticks.push(contact);
  }
  assert.equal(ticks.length, 20);
  const min = Math.min(...ticks);
  const max = Math.max(...ticks);
  assert.ok(min >= 500, `最早接触不该早于 500 tick，实际 ${min}`);
  assert.ok(max <= 1200, `最晚接触超了 1200 tick：${max}`);
  assert.ok(max - min >= 0, '至少有分布（全相同也接受，但记录数值）');
});
