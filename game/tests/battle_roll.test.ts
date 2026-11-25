/**
 * R115 验收：原作乱数流（`0x450132`）接进战斗内核的方向抽样。
 *
 * 依据：
 *  - `project/133_原作数值真值.md` §4.1：`rand()` / `rand()%n`（`0x450117`）逐条语义；
 *  - `project/173_原作战斗行为真相.md` :378「扫描先看哪一侧 = `0x450132() & 1`」；
 *    :400-408 方位抽样 `0x43C2A5` 按 `rand()%n` 无放回抽权重。
 *
 * 这里只验「接线正确、可复现、流消耗次数对得上、分布对得上」；逐帧与原作录像对拍属于
 * `project/165` 的 D4 门禁，不在本文件。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld, hitRoll, sampleStepOffsets, step } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import { SangoRng, sangoRng } from '../src/core/sango_rng.ts';
import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 只消耗 rng、不产生副作用的占位函数（验证 roll 分支时用） */
const noRng = (): number => 0.5;

function makeWorld(seed: number, roll: SangoRng | undefined): World {
  return createWorld({
    data,
    seed,
    roll,
    a: { soldiers: 8, troop: 0, formation: 0 },
    b: { soldiers: 8, troop: 0, formation: 0 },
  });
}

const posOf = (w: World): string => w.units.map((u) => `${u.x.toFixed(3)},${u.y.toFixed(3)}`).join('|');

// ---------------------------------------------------------------------------
// 缺省行为不变
// ---------------------------------------------------------------------------

test('R115 不给 `roll` 时与 R208 之前逐位相同（world.roll === null）', () => {
  const w = makeWorld(21, undefined);
  assert.equal(w.roll, null);
  // 同一 seed 两场一致
  assert.equal(posOf(w), posOf(makeWorld(21, undefined)));
});

// ---------------------------------------------------------------------------
// 流消耗次数 = 权重抽样次数（`rand()%n` 一次抽一格）
// ---------------------------------------------------------------------------

test('R115 方位抽样的流消耗 = 非零权重个数（一档一格）', () => {
  const one = sangoRng(5);
  sampleStepOffsets(1, 0, [1, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], noRng, one);
  const ref1 = sangoRng(5);
  ref1.int(1);
  assert.equal(one.stateA, ref1.stateA);
  assert.equal(one.stateB, ref1.stateB);

  const two = sangoRng(5);
  sampleStepOffsets(1, 0, [1, 1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], noRng, two);
  const ref2 = sangoRng(5);
  ref2.int(1);
  ref2.int(1);
  assert.equal(two.stateA, ref2.stateA);
  assert.equal(two.stateB, ref2.stateB);

  // 两轮都抽：第一组 2 档 + 第二组 1 档 = 3 次
  const three = sangoRng(5);
  sampleStepOffsets(1, 0, [1, 1, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0], noRng, three);
  const ref3 = sangoRng(5);
  ref3.int(1);
  ref3.int(1);
  ref3.int(1);
  assert.equal(three.stateA, ref3.stateA);
  assert.equal(three.stateB, ref3.stateB);
});

test('R115 没有 `roll` 时仍只消耗 rng（不碰 SangoRng）', () => {
  const roll = sangoRng(9);
  const before = roll.snapshot();
  sampleStepOffsets(1, 0, [1, 1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], noRng, null);
  assert.deepEqual(roll.snapshot(), before);
});

// ---------------------------------------------------------------------------
// 分布：前线小队 80/10/10 的「第一格」应以正前为主
// ---------------------------------------------------------------------------

test('R115 方位分布：80/10/10 两万次，正前 ≥ 70% 且三档都出现', () => {
  // 基向量 (1,0)（横屏下的「正前」），第一组权重 = 原作小队前進 [80,10,10,0,…]
  const solo = sampleStepOffsets(1, 0, [1, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], noRng, sangoRng(1));
  assert.equal(solo.first.length, 1);
  const forward = `${solo.first[0]!.dx},${solo.first[0]!.dy}`;

  const roll = sangoRng(0x51c0);
  const counts = new Map<string, number>();
  const N = 20000;
  for (let i = 0; i < N; i += 1) {
    const { first } = sampleStepOffsets(1, 0, [80, 10, 10, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], noRng, roll);
    assert.ok(first.length >= 1, '至少抽出一档');
    const key = `${first[0]!.dx},${first[0]!.dy}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const share = (counts.get(forward) ?? 0) / N;
  assert.ok(share > 0.7 && share < 0.9, `正前占比 ${(share * 100).toFixed(2)}%`);
  assert.equal(counts.size, 3, `应抽出 3 个方向，实际 ${[...counts.keys()].join(' ')}`);
});

// ---------------------------------------------------------------------------
// 命中掷骰：`0x43D400 HitRoll` 的 `rand()%300 < p`
// ---------------------------------------------------------------------------

test('R115 命中掷骰走 `roll.int(300)`：一次命中判定消耗一次原作抽', () => {
  const w = makeWorld(21, sangoRng(13));
  engage(w);
  const a = w.units.find((u) => u.side === 'A')!;
  const b = w.units.find((u) => u.side === 'B')!;
  const ref = sangoRng(13);
  for (let i = 0; i < 25; i += 1) hitRoll(w, a, b);
  // 25 次判定里若没踩到连击位，就正好 25 抽
  const draws = 25;
  for (let i = 0; i < draws; i += 1) ref.int(300);
  const gotA = w.roll!.stateA;
  const gotB = w.roll!.stateB;
  assert.equal(gotA, ref.stateA);
  assert.equal(gotB, ref.stateB);
});

test('R115 不带 `roll` 时命中掷骰仍只消耗 rng（旧行为，roll 为 null）', () => {
  const w = makeWorld(21, undefined);
  engage(w);
  const a = w.units.find((u) => u.side === 'A')!;
  const b = w.units.find((u) => u.side === 'B')!;
  assert.equal(w.roll, null);
  let calls = 0;
  const orig = w.rng;
  w.rng = () => {
    calls += 1;
    return orig();
  };
  hitRoll(w, a, b);
  assert.ok(calls >= 1 && calls <= 2, `rng 抽了 ${calls} 次`);
});


test('R115 同一 roll 种子两场逐 tick 一致，不同种子会分叉', () => {
  const a = engage(makeWorld(21, sangoRng(7)));
  const b = engage(makeWorld(21, sangoRng(7)));
  for (let i = 0; i < 240; i += 1) step(a);
  for (let i = 0; i < 240; i += 1) step(b);
  assert.equal(posOf(a), posOf(b));
  assert.equal(a.roll!.stateA, b.roll!.stateA);
  assert.equal(a.roll!.stateB, b.roll!.stateB);
  assert.ok(a.units.some((u) => u.x !== 0 || u.y !== 0), '确实动过');

  const c = engage(makeWorld(21, sangoRng(8)));
  for (let i = 0; i < 240; i += 1) step(c);
  assert.notEqual(a.roll!.stateA, c.roll!.stateA);
});

test('R115 带 `roll` 的整场战斗跑得完（3000 tick 内出胜负，不卡死）', () => {
  const w = engage(makeWorld(21, sangoRng(3)));
  for (let i = 0; i < 3000 && !w.over; i += 1) step(w);
  assert.ok(w.over || w.tick === 3000);
});
