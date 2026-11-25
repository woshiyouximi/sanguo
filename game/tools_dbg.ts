import { loadData } from './src/data.ts';
import { createWorld, step, formationCells } from './src/core/battle.ts';
const data = loadData({ dir: './data' });
const w = createWorld({ data, seed: 500, a: { troop: 0, formation: 0 }, b: { troop: 0, formation: 0 } });
const a = w.units.filter(u => u.side === 'A');
const b = w.units.filter(u => u.side === 'B');
const xs = (arr) => arr.map(u => u.x);
console.log('A x range', Math.min(...xs(a)).toFixed(1), Math.max(...xs(a)).toFixed(1), 'n', a.length);
console.log('B x range', Math.min(...xs(b)).toFixed(1), Math.max(...xs(b)).toFixed(1), 'n', b.length);
console.log('A y range', Math.min(...a.map(u=>u.y)).toFixed(1), Math.max(...a.map(u=>u.y)).toFixed(1));
console.log('B y range', Math.min(...b.map(u=>u.y)).toFixed(1), Math.max(...b.map(u=>u.y)).toFixed(1));
for (let i = 0; i < 400 && !w.over; i++) {
  step(w);
  if (i % 40 === 0) console.log('t', i, 'A', w.sides.A.aliveCount, 'B', w.sides.B.aliveCount, 'Ag', w.sides.A.general.hp, 'Bg', w.sides.B.general.hp);
}
console.log('over', w.over, w.winner, w.endReason, 'tick', w.tick);
