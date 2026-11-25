import { loadData } from './src/data.ts';
import { createWorld, step } from './src/core/battle.ts';
const data = loadData({ dir: './data' });
const w = createWorld({ data, seed: 500, a: { troop: 0, formation: 0 }, b: { troop: 0, formation: 0 } });
let n = 0;
while (!w.over && n < 30 * 180) { step(w); n++; }
console.log('winner', w.winner, 'tick', w.tick, JSON.stringify(w.stats));
console.log('A', w.sides.A.aliveCount, 'B', w.sides.B.aliveCount, 'powerA', 150 + w.sides.A.troopBonus + w.sides.A.formationBonus, 'powerB', 150 + w.sides.B.troopBonus + w.sides.B.formationBonus);
