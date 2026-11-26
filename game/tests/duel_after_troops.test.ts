/**
 * 兵尽后的主将单挑（R216 补丁）。
 *
 * R216 起「士兵清零」不再结束战斗（`checkOver()` 只剩主将阵亡 / 撤退 / 时限三条出口），
 * 但 `adjacentEnemy()` 只扫同一车道：两将兵尽后各自按旧令待机，永远进不了对方的
 * 扫描行 —— 实测白等 9170 tick（≈153s）到 198s 判平手。
 *
 * 补丁在 `army_cmd.armyStepPlan()`：对面兵尽时主将主动索敌（斜向逼近 + 并道），
 * 并在 `battle.ts yieldFriend()` 里允许与挡路的友军互换位置，挤出自军方阵。
 *
 * 复跑：`cd F:\sanguo\game && node --test tests/duel_after_troops.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld, step } from '../src/core/battle.ts';
import { installArmyOrders } from '../src/core/army_cmd.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

test('敌兵清零后主将互相索敌，以 general 结束而不是拖到 198s 时限', () => {
  const w = createWorld({
    data,
    seed: 20261124,
    month: 1,
    terrain: 0,
    a: { troop: 2, formation: 0, soldiers: 100, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
    b: { troop: 10, formation: 3, soldiers: 100, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
    aiSides: { B: true },
  });
  installArmyOrders(w);

  let wipedAt = -1;
  for (let t = 0; t < 12000 && !w.over; t += 1) {
    step(w);
    if (wipedAt < 0 && w.sides.B.aliveCount === 0) wipedAt = w.tick;
  }

  assert.ok(wipedAt > 0, '敌方士兵应在时限前被打光');
  assert.equal(w.over, true, '不应拖到 11880 tick 时限');
  assert.equal(w.endReason, 'general', '应由主将阵亡收尾，而不是 time/draw');
  assert.notEqual(w.winner, 'draw');
  assert.ok(w.tick < 11880, '总时长应明显短于 198s 时限');
});
