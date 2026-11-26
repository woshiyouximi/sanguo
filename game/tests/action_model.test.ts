/**
 * m4 行动模型验收测试（`project/177_战斗行动模型.md`）。
 *
 * 钉住 `project/173_原作战斗行为真相.md` 的 8 条必做 + n4 的硬时限（`project/180`）：
 *  1. 无命令就待機（不自动前压）；
 *  2. 同排射程扫描（0x43BBE6）：只沿 ±x、空格继续、0x2000 跳过、友军挡视线；
 *  3. 攻击锁 `+0x38`（0x43BCA7）：主将恒 1、士兵查表 1..3，锁定期照常走位只是不打人；
 *  4. 落点抖动（0x43BE42）：格心 ±24px/±18px（±0.25/±0.25 格）、逻辑格不受影响；
 *  5. 没走成 40 帧滑回格心（0x43C084）；
 *  6. 基向量轴向（0x43C4C0 / 0x43C888）：x 有差就不斜着走；
 *  7. 硬时限 5940 tick（0x4AC35C 0x2E68=11880 @60Hz）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  ATK_LOCK_BY_TROOP,
  BATTLE_SECONDS,
  BATTLE_TICK_LIMIT,
  createWorld,
  planDirected,
  planToward,
  step,
  STEP_W_STRAIGHT,
  unitCell,
  atkLockOf,
} from '../src/core/battle.ts';
import type { Unit, World } from '../src/core/battle.ts';
import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function make(opts: { soldiers?: number; troop?: number; seed?: number } = {}): World {
  return createWorld({
    data,
    seed: opts.seed ?? 5,
    a: { soldiers: opts.soldiers ?? 2, troop: opts.troop ?? 0, formation: 0 },
    b: { soldiers: opts.soldiers ?? 2, troop: 0, formation: 0 },
    aiSides: { A: false, B: false },
  });
}

const soldiersOf = (w: World, side: 'A' | 'B'): Unit[] =>
  w.units.filter((u) => u.side === side && u.alive && !u.isGeneral);

const genOf = (w: World, side: 'A' | 'B'): Unit => {
  const g = w.units.find((u) => u.side === side && u.isGeneral);
  assert.ok(g, `${side} 侧要有主将`);
  return g;
};

/** 把单位钉到某个逻辑格并清掉滑动/冷却，让这一 tick 一定能自主动作。 */
function put(u: Unit, gx: number, gy: number): void {
  u.x = gx;
  u.y = gy;
  u.prevX = gx;
  u.prevY = gy;
  u.slide = null;
  u.cd = 0;
  u.atkLock = 0;
  u.alive = true;
}

// ---------------------------------------------------------------------------
// 一、无命令就待機
// ---------------------------------------------------------------------------

test('待機：无命令时 40 tick 逻辑格与像素都不动（0x43AEB2 清槽 / 0x43C907 权重全 0）', () => {
  const w = make({ soldiers: 6 });
  const before = new Map(w.units.map((u) => [u, { cell: unitCell(u), x: u.x, y: u.y }]));
  for (let i = 0; i < 40; i++) step(w);
  for (const u of w.units) {
    const b = before.get(u)!;
    assert.deepEqual(unitCell(u), b.cell, `${u.side} 单位逻辑格不该动`);
    assert.equal(u.x, b.x, '像素 x 不该动');
    assert.equal(u.y, b.y, '像素 y 不该动');
  }
});

test('待機阴性对照：无命令 600 tick 一次攻击都没有（旧内核缺省自动前压会打出攻击）', () => {
  const w = make({ soldiers: 6 });
  for (let i = 0; i < 600 && !w.over; i++) step(w);
  assert.equal(w.stats.attacksA + w.stats.attacksB, 0, '没下令就谁也不该出手');
});

test('接敌验收：装了部队指令层并下令后，600~1200 tick 内真的接触（方形 N=100 最近 31 格）', () => {
  const w = createWorld({
    data,
    seed: 11,
    a: { soldiers: 50, troop: 0, formation: 0 },
    b: { soldiers: 50, troop: 0, formation: 0 },
    aiSides: { A: false, B: false },
  });
  engage(w);
  let contact = 0;
  for (let i = 0; i < 1200 && !w.over; i++) {
    step(w);
    if (w.stats.attacksA + w.stats.attacksB > 0) {
      contact = w.tick;
      break;
    }
  }
  assert.ok(contact > 0, '下令后 1200 tick 内必须接触');
  // 实测 575~985（见 project/177）；600 只是「31 格 × 两军对进」的理论下限附近
  assert.ok(contact >= 500, `接触不该早于 500 tick，实际 ${contact}`);
});

// ---------------------------------------------------------------------------
// 二、同排射程扫描（0x43BBE6）
// ---------------------------------------------------------------------------

function duel(): { w: World; a: Unit; b: Unit } {
  const w = make({ soldiers: 2 });
  const a = soldiersOf(w, 'A')[0]!;
  const b = soldiersOf(w, 'B')[0]!;
  for (const u of w.units) {
    u.slide = null;
    u.cd = 99;
    u.atkLock = 0;
  }
  put(genOf(w, 'A'), 2, 6);
  put(genOf(w, 'B'), 68, 6);
  put(a, 30, 6);
  put(b, 31, 6);
  return { w, a, b };
}

test('扫描命中：同排相邻格（±1）能打（0x43BBE6 i=1）', () => {
  const { w, a } = duel();
  step(w);
  assert.ok(w.stats.attacksA >= 1, `同排 +1 格该出手，实际 attacksA=${w.stats.attacksA}`);
  assert.ok(a.lastAttackTick === 1, '出手应记在 lastAttackTick');
});

test('扫描阴性：同排隔一格（距离 2 > 射程 1）打不到（空格 continue 但射程到 1 为止）', () => {
  const { w, b } = duel();
  put(b, 32, 6);
  step(w);
  assert.equal(w.stats.attacksA, 0, '射程 1 时 ±2 格不该打');
});

test('扫描阴性：不同排（y 不同）打不到（0x43BBE6 只沿 u+8 同一行扫）', () => {
  const { w, b } = duel();
  put(b, 31, 7);
  step(w);
  assert.equal(w.stats.attacksA, 0, '只沿同排 ±x 扫，换行不打');
});

test('扫描：status & 0x2000 的单位被跳过（0x43B50D(o)&0x2000 → continue）', () => {
  const { w, b } = duel();
  b.status = 0x2000;
  step(w);
  assert.equal(w.stats.attacksA, 0, '0x2000 该被跳过');
});

test('扫描：友军挡视线返回 null，即使射程够（0x43B663 非敌 → x=-99）', () => {
  const { w, a } = duel();
  const friend = soldiersOf(w, 'A')[1]!;
  put(friend, 31, 6);
  a.atkRange = 2; // 射程够到 32 格，但 31 格被友军挡
  step(w);
  assert.equal(w.stats.attacksA, 0, '友军挡在中间时不该越过它打后排');
});

// ---------------------------------------------------------------------------
// 三、攻击锁 +0x38（0x43BCA7）
// ---------------------------------------------------------------------------

test('攻击锁表：主将恒 1，士兵查 0x4862BC+0x1C（variant0 列）', () => {
  const w = make({ soldiers: 2, troop: 3 });
  assert.equal(atkLockOf(w, genOf(w, 'A')), 1, '主将恒 1（0x43EBA7 mov [u2+0x38],1）');
  const s = soldiersOf(w, 'A')[0]!;
  assert.equal(atkLockOf(w, s), ATK_LOCK_BY_TROOP[3], '士兵按兵种查表');
  assert.deepEqual(ATK_LOCK_BY_TROOP, [1, 1, 1, 3, 1, 2, 1, 1, 1, 1, 1, 3, 1], '13 条记录的 variant0 列');
});

test('攻击锁生效：出手后锁定 3 个行动周期，锁定期照常走位只是不打人', () => {
  const w = make({ soldiers: 2, troop: 3 });
  const a = soldiersOf(w, 'A')[0]!;
  const b = soldiersOf(w, 'B')[0]!;
  for (const u of w.units) {
    u.slide = null;
    u.cd = 99;
    u.atkLock = 0;
  }
  put(genOf(w, 'A'), 2, 6);
  put(a, 30, 6);
  // 用敌方主将当靶子（血厚，连打 4 刀不会死；士兵 1 血，第一刀就没了）
  b.alive = false;
  put(genOf(w, 'B'), 31, 6);
  genOf(w, 'B').cd = 999; // 靶子不许还手，否则一刀反杀我方 1 血士兵
  // 第一刀
  a.cd = 0;
  step(w);
  assert.equal(w.stats.attacksA, 1);
  assert.equal(a.atkLock, 3, '出手时写 +0x38 = 3（0x43D314）');
  // 锁定期：--+0x38 = 2、1（都 >0 → return 0 不探敌），到 0 的那个周期才重新探敌
  for (let i = 0; i < 2; i++) {
    a.cd = 0;
    step(w);
    assert.equal(w.stats.attacksA, 1, `锁定期第 ${i + 1} 周期不该出手（--+0x38 = ${2 - i}）`);
    assert.equal(a.atkLock, 2 - i, '每个行动周期减 1');
  }
  // 锁走完（--+0x38 == 0）→ 重新探敌
  a.cd = 0;
  step(w);
  assert.equal(w.stats.attacksA, 2, '锁定归零后应恢复探敌');
});

// ---------------------------------------------------------------------------
// 四、落点抖动 + 逻辑格（0x43BE42 / 0x43BF26）
// ---------------------------------------------------------------------------

test('抖动：视觉落点在格心 ±0.25 格内，unitCell 仍是逻辑格', () => {
  const w = make({ soldiers: 1 });
  const a = soldiersOf(w, 'A')[0]!;
  put(a, 10, 6);
  w.armyStepPlan = (ww, uu) =>
    uu === a ? planDirected(1, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance') : null;
  a.cd = 0;
  step(w);
  assert.ok(a.slide, '该有 40 帧滑动');
  assert.equal(a.slide!.gx, 11, '逻辑格立即到 11（0x43BF26 逻辑瞬移）');
  assert.equal(unitCell(a).gx, 11, '滑动期间 unitCell 读逻辑格');
  const dx = a.slide!.tx - 11;
  const dy = a.slide!.ty - 6;
  assert.ok(Math.abs(dx) <= 0.25 + 1e-9, `x 抖动 ≤ 24px(0.25 格)，实际 ${dx}`);
  assert.ok(Math.abs(dy) <= 0.25 + 1e-9, `y 抖动 ≤ 18px(0.25 格)，实际 ${dy}`);
});

test('抖动分布：200 次落点的 min/max/mean 落在 ±0.25/±0.25 区间内且均值近 0', () => {
  const w = make({ soldiers: 1 });
  const a = soldiersOf(w, 'A')[0]!;
  w.armyStepPlan = (ww, uu) =>
    uu === a ? planDirected(1, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance') : null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    put(a, 10, 6);
    a.cd = 0;
    step(w);
    assert.ok(a.slide, `第 ${i} 次该滑动`);
    // 格心 = 10 + (整数格 + 抖动)；用 slide.tx 与逻辑格比较
    const dx = a.slide!.tx - (a.slide!.gx ?? 11);
    min = Math.min(min, dx);
    max = Math.max(max, dx);
    sum += dx;
  }
  const mean = sum / N;
  assert.ok(min >= -0.25 - 1e-9, `min=${min} 不该小于 -0.25 格`);
  assert.ok(max <= 0.25 + 1e-9, `max=${max} 不该大于 0.25 格`);
  assert.ok(Math.abs(mean) < 0.02, `mean=${mean} 该接近 0`);
  assert.ok(max - min > 0.1, '抖动必须真的存在，不能退化成 0');
});

test('没走成：落点全出界 → 40 帧滑回格心（0x43C084），且不带抖动', () => {
  const w = make({ soldiers: 1 });
  const a = soldiersOf(w, 'A')[0]!;
  put(a, 0, 0);
  a.x = 0.2;
  a.y = 0.1;
  w.armyStepPlan = (ww, uu) =>
    uu === a ? planDirected(-1, -1, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance') : null;
  a.cd = 0;
  step(w);
  assert.ok(a.slide, '该有回位滑动');
  assert.equal(a.slide!.total, 40, '滑行时长写死 40 帧');
  assert.ok(Math.abs(a.slide!.tx) < 1e-9, `回格心 x=0（不带抖动），实际 ${a.slide!.tx}`);
  assert.ok(Math.abs(a.slide!.ty) < 1e-9, `回格心 y=0（不带抖动），实际 ${a.slide!.ty}`);
  assert.equal(a.slide!.gx, 0);
  assert.equal(a.slide!.gy, 0);
});

// ---------------------------------------------------------------------------
// 五、基向量轴向（0x43C4C0 / 0x43C888）
// ---------------------------------------------------------------------------

test('planToward 轴向：x 有差就只沿 x，x 对齐才沿 y（旧实现 (sign,sign) 斜着走）', () => {
  const p = planToward({ gx: 10, gy: 5 }, { gx: 20, gy: 9 }, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'toward')!;
  assert.equal(p.sx, 1);
  assert.equal(p.sy, 0, 'x 没对齐时不该有 y 分量');
  const q = planToward({ gx: 10, gy: 5 }, { gx: 10, gy: 9 }, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'toward')!;
  assert.equal(q.sx, 0);
  assert.equal(q.sy, 1, 'x 对齐后才走 y');
  assert.equal(planToward({ gx: 3, gy: 3 }, { gx: 3, gy: 3 }, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'toward'), null, '同一格无计划');
});

// ---------------------------------------------------------------------------
// 六、硬时限（0x4AC35C，project/180）
// ---------------------------------------------------------------------------

test('硬时限常量：11880 tick = 198 秒（原作风数，@60Hz 不再除 2）', () => {
  assert.equal(BATTLE_TICK_LIMIT, 11880);
  assert.equal(BATTLE_SECONDS, 198);
});

test('硬时限：11879 tick 还不到点，不结束', () => {
  const w = make({ soldiers: 4 });
  // 直接推进到时限前一帧：这一段只验边界，不靠长时间对打（对打可能先把主将打死）
  w.tick = BATTLE_TICK_LIMIT - 2;
  step(w);
  assert.equal(w.tick, BATTLE_TICK_LIMIT - 1);
  assert.equal(w.over, false, `${BATTLE_TICK_LIMIT - 1} tick 还不到时限`);
});

test('硬时限：11880 tick 到点结束且 endReason=time', () => {
  const w = make({ soldiers: 4 });
  w.tick = BATTLE_TICK_LIMIT - 1;
  step(w);
  assert.equal(w.tick, BATTLE_TICK_LIMIT);
  assert.equal(w.over, true, `${BATTLE_TICK_LIMIT} tick 必须结束`);
  assert.equal(w.endReason, 'time', "endReason 该是 'time'");
});

test('硬时限到点：双方主将都活着 ⇒ 平手，不看剩余兵力（0x44411B 的 reason 0x10）', () => {
  const w = createWorld({
    data,
    seed: 9,
    a: { soldiers: 4, troop: 0, formation: 0 },
    b: { soldiers: 2, troop: 0, formation: 0 },
    aiSides: { A: false, B: false },
  });
  w.tick = BATTLE_TICK_LIMIT - 1;
  step(w);
  assert.equal(w.over, true);
  assert.equal(w.endReason, 'time');
  assert.equal(w.winner, 'draw', 'A 4 兵 > B 2 兵也不判 A 胜：原作到点只按主将死活开理由码');
  assert.deepEqual(w.status, { A: 0, B: 0 });
});
