
import { createWorld, step, requestRetreat, GRID_W } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const w = createWorld({
  data,
  seed: 7,
  a: { troop: 6, formation: 1, soldiers: 10, morale: 60, general: { name: '劉備', str: 82, int: 79, level: 2 } },
  b: { troop: 10, formation: 3, soldiers: 110, morale: 60, general: { name: '守備隊', str: 38, int: 26, level: 5 } },
  aiSides: { B: true },
});
for (let t = 0; t < 300; t++) step(w);
console.log('before retreat tick', w.tick, 'units A', w.units.filter((u) => u.side === 'A').length, 'aliveA', w.sides.A.aliveCount, 'over', w.over);
requestRetreat(w, 'A');
let overAt = -1;
for (let t = 0; t < 6000; t++) {
  step(w);
  if (w.over) { overAt = t; break; }
}
const leftA = w.units.filter((u) => u.side === 'A');
console.log(JSON.stringify({
  overAt,
  over: w.over,
  winner: w.winner,
  endReason: w.endReason,
  tick: w.tick,
  leftA: leftA.length,
  aSample: leftA.slice(0, 5).map((u) => ({ gx: +u.x.toFixed(2), gy: +u.y.toFixed(2), flee: !!u.flee, gen: !!u.isGeneral, alive: u.alive, soldiers: u.soldiers ?? null })),
  fled: w.fled,
}));
