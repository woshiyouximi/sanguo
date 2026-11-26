/**
 * R217 技力/體力自動恢復的原作口径（`work/jili/REPORT.md` §2/§4.1）。
 *
 * 原作 `0x43E847`：`army+0x8c += army+0x88`（参数 30/50/70 技力、40/60/80 体力），
 * 越过 `0x1770`(6000) 回 1 点；bit0（体力）成立时技力分支整段不走。
 * ⇒ 60Hz 下技力 L1/L2/L3 = 0.30/0.50/0.70 点/秒，没带军师技时恒 0。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { ARMY_FLAG } from '../src/core/strategy.ts';
import { createWorld, step } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function world(): World {
  return createWorld({
    data,
    seed: 7,
    a: { soldiers: 8, troop: 0, formation: 0 },
    b: { soldiers: 8, troop: 0, formation: 0 },
  });
}

function runTicks(w: World, n: number): void {
  for (let i = 0; i < n; i += 1) step(w);
}

test('没带军师技：技力与体力都不自动恢复（原作口径，用户看到的「不回」是正常的）', () => {
  const w = world();
  const g = w.sides.A.general;
  g.mp = Math.max(1, g.mpMax - 10);
  g.hp = Math.max(1, g.maxHp - 10);
  const mp0 = g.mp;
  const hp0 = g.hp;
  runTicks(w, 600);
  assert.equal(g.mp, mp0);
  assert.equal(g.hp, hp0);
});

test('恢复技力 L1（参数 30）：第 201 tick 回第 1 点，之后每 200 tick 一点', () => {
  const w = world();
  const army = w.army!.A;
  army.flags |= ARMY_FLAG.mpRegen;
  army.mpRegen = 30;
  army.mpRegenAcc = 0;
  const g = w.sides.A.general;
  g.mp = 0;
  runTicks(w, 200);
  assert.equal(g.mp, 0, '199/200 tick 时累加器还没越过 6000');
  runTicks(w, 1);
  assert.equal(g.mp, 1, '第 201 tick 越线');
  runTicks(w, 200);
  assert.equal(g.mp, 2);
  runTicks(w, 200);
  assert.equal(g.mp, 3);
});

test('恢复技力不会超过上限', () => {
  const w = world();
  const army = w.army!.A;
  army.flags |= ARMY_FLAG.mpRegen;
  army.mpRegen = 70;
  army.mpRegenAcc = 0;
  const g = w.sides.A.general;
  g.mp = g.mpMax - 1;
  runTicks(w, 2000);
  assert.equal(g.mp, g.mpMax);
});

test('两个旗标同时置上时体力优先，技力整段不走（0x43E857 → jmp 0x43E960）', () => {
  const w = world();
  const army = w.army!.A;
  army.flags |= ARMY_FLAG.hpRegen | ARMY_FLAG.mpRegen;
  army.hpRegen = 80;
  army.mpRegen = 80;
  army.hpRegenAcc = 0;
  army.mpRegenAcc = 0;
  const g = w.sides.A.general;
  g.hp = Math.max(1, g.maxHp - 5);
  g.mp = 0;
  const hp0 = g.hp;
  runTicks(w, 400);
  assert.ok(g.hp > hp0, '体力必须回');
  assert.equal(g.mp, 0, '技力分支被体力分支短路');
});
