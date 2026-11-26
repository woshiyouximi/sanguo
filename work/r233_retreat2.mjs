
import { createWorld, step, requestRetreat } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';
const data = loadData({ dir: 'F:/sanguo/game/data/' });

function run(aSoldiers, label) {
  const w = createWorld({
    data, seed: 7,
    a: { troop: 6, formation: 1, soldiers: aSoldiers, morale: 60, general: { name: '劉備', str: 82, int: 79, level: 2 } },
    b: { troop: 10, formation: 3, soldiers: 110, morale: 60, general: { name: '守備隊', str: 38, int: 26, level: 5 } },
    aiSides: { B: true },
  });
  // 等到我方小兵全死（只剩主将），最多 4000 tick
  let dead = -1;
  for (let t = 0; t < 4000; t++) {
    step(w);
    const soldiers = w.units.filter((u) => u.side === 'A' && u.alive && !u.isGeneral).length;
    if (soldiers === 0) { dead = t; break; }
    if (w.over) break;
  }
  const before = {
    deadAt: dead,
    over: w.over,
    unitsA: w.units.filter((u) => u.side === 'A').length,
    gen: (() => { const g = w.units.find((u) => u.side === 'A' && u.isGeneral); return g ? { alive: g.alive, gx: +g.x.toFixed(1), sold: g.soldiers } : null; })(),
    aliveCount: w.sides.A.aliveCount,
  };
  const issued = requestRetreat(w, 'A');
  let overAt = -1;
  for (let t = 0; t < 4000; t++) { step(w); if (w.over) { overAt = t; break; } }
  console.log(label, JSON.stringify({ before, issued, overAt, over: w.over, winner: w.winner, reason: w.endReason, tick: w.tick, leftA: w.units.filter((u) => u.side === 'A').length }));
}
run(10, 'A=10');
