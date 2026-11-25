import { loadData } from './src/data.ts';
import { createWorld, step } from './src/core/battle.ts';
const data = loadData({ dir: './data' });
const w = createWorld({ data, seed: 500, a: { troop: 0, formation: 0 }, b: { troop: 0, formation: 0 } });
const gen = (side) => w.units.find(u => u.side === side && u.isGeneral);
for (let i = 0; i < 340; i++) {
  step(w);
  if (i % 40 === 0) {
    const ag = gen('A'), bg = gen('B');
    const bFront = Math.max(...w.units.filter(u => u.side === 'B' && u.alive && !u.isGeneral).map(u => u.x));
    const aFront = Math.min(...w.units.filter(u => u.side === 'A' && u.alive && !u.isGeneral).map(u => u.x));
    console.log(`t${i} A=${w.sides.A.aliveCount} B=${w.sides.B.aliveCount} | B前锋到A将 ${(ag.x - bFront).toFixed(1)} | A前锋到B将 ${(aFront - bg.x).toFixed(1)} | Ag ${ag.x.toFixed(1)},${ag.y.toFixed(1)} Bg ${bg.x.toFixed(1)},${bg.y.toFixed(1)}`);
  }
}
