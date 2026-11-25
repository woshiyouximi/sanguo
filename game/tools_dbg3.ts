import { loadData } from './src/data.ts';
import { createWorld, step } from './src/core/battle.ts';
const data = loadData({ dir: './data' });
for (const seed of [500, 501, 502]) {
  const w = createWorld({ data, seed, a: { troop: 0, formation: 0 }, b: { troop: 0, formation: 0 } });
  let n = 0;
  while (!w.over && n < 30 * 180) { step(w); n++; }
  const ag = w.units.find(u => u.side === 'A' && u.isGeneral);
  const bg = w.units.find(u => u.side === 'B' && u.isGeneral);
  console.log(`seed ${seed} winner=${w.winner} reason=${w.endReason} t=${(w.tick/30).toFixed(1)}s A=${w.sides.A.aliveCount} B=${w.sides.B.aliveCount} AgHp=${ag ? w.sides.A.general.hp : 'dead'} BgHp=${bg ? w.sides.B.general.hp : 'dead'} AgAlive=${w.sides.A.general.alive}`);
}
