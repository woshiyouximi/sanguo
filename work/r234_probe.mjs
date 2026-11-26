
import { createWorld, step } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';
const data = loadData({ dir: 'F:/sanguo/game/data/' });
const w = createWorld({ data, seed: 7,
  a: { troop: 6, formation: 1, soldiers: 10, morale: 60, general: { name: '劉備', str: 82, int: 79, level: 2 } },
  b: { troop: 10, formation: 3, soldiers: 110, morale: 60, general: { name: '守備隊', str: 38, int: 26, level: 5 } },
  aiSides: { B: true } });
for (let t = 0; t < 30; t += 1) step(w);
console.log('tick', w.tick, 'unitsA', w.units.filter(u=>u.side==='A').length);
w.fled.A = true;
w.fledTick = { ...w.fledTick, A: w.tick - 900 };
console.log('before', JSON.stringify({fled:w.fled, fledTick:w.fledTick, tick:w.tick, over:w.over}));
step(w);
console.log('fledAfter', JSON.stringify(w.fled), 'delta', w.tick - w.fledTick.A);
console.log('fledTickAfter', JSON.stringify(w.fledTick));
console.log('after', JSON.stringify({over:w.over, winner:w.winner, reason:w.endReason, tick:w.tick}));
