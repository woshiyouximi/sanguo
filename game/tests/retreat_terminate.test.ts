// [R234] 撤退必须能收场：内核兜底 + 回归。
//
// 制作人实测：全军撤退后战斗停住（命令全灰、提示全軍撤退，但既不结束也不响应）。
// 内核 checkOver() 的撤退出口要求「该侧一个单位都不剩」；只要有一个单位被卡在场地里
// 走不出去，就永远不满足。这里用一个 900 tick 的宽限兜底，并钉住「撤退一定在有限 tick 内结束」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, requestRetreat } from '../src/core/battle.ts';
import { loadData } from '../src/data.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });

function makeWorld(seed: number, aSoldiers = 10) {
  return createWorld({
    data,
    seed,
    a: { troop: 6, formation: 1, soldiers: aSoldiers, morale: 60, general: { name: '劉備', str: 82, int: 79, level: 2 } },
    b: { troop: 10, formation: 3, soldiers: 110, morale: 60, general: { name: '守備隊', str: 38, int: 26, level: 5 } },
    aiSides: { B: true },
  });
}

test('R234 撤退令要记下下达时刻（fledTick）', () => {
  const w = makeWorld(7);
  for (let t = 0; t < 120; t += 1) step(w);
  assert.equal(w.fledTick.A, -1, '没下过撤退令时是 -1');
  assert.equal(requestRetreat(w, 'A'), true);
  assert.equal(w.fledTick.A, w.tick, 'fledTick 记录下达时的 tick');
});

test('R234 撤退一定在有限 tick 内结束（多 seed 回归）', () => {
  for (const seed of [1, 7, 21, 20261124]) {
    const w = makeWorld(seed);
    for (let t = 0; t < 300; t += 1) step(w);
    requestRetreat(w, 'A');
    let overAt = -1;
    for (let t = 0; t < 2400; t += 1) {
      step(w);
      if (w.over) { overAt = t; break; }
    }
    assert.ok(overAt >= 0, `seed ${seed}：撤退后 2400 tick 内必须结束`);
    assert.equal(w.over, true);
    assert.ok(['retreat', 'general'].includes(String(w.endReason)), `seed ${seed}：结束理由应是撤退/主将，实得 ${w.endReason}`);
  }
});

test('R234 走不出场地时宽限 900 tick 兜底判负', () => {
  const w = makeWorld(7);
  for (let t = 0; t < 30; t += 1) step(w);
  // 模拟「撤退令已下、但队伍卡在场地里」：把时钟往前推，让 900 tick 宽限已过
  // （fledTick 必须是真实 tick，不能是负数——那样会被 `>= 0` 的防护挡掉）
  w.fled.A = true;
  w.tick = 1000;
  w.fledTick = { ...w.fledTick, A: 0 };
  const unitsA = w.units.filter((u) => u.side === 'A').length;
  assert.ok(unitsA > 0, '前置：场上还有 A 方单位（否则走的是正常撤退分支）');
  step(w);
  assert.equal(w.over, true, '宽限到点必须收场');
  assert.equal(w.winner, 'B');
  assert.equal(w.endReason, 'retreat');
});

test('R234 双方都在撤且超时 → 平手', () => {
  const w = makeWorld(7);
  for (let t = 0; t < 30; t += 1) step(w);
  w.fled = { A: true, B: true };
  w.tick = 1000;
  w.fledTick = { A: 0, B: 0 };
  step(w);
  assert.equal(w.over, true);
  assert.equal(w.winner, 'draw');
});
