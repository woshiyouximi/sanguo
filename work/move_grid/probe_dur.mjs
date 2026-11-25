import { loadData } from '../../game/src/data.ts';
import { createWorld, step } from '../../game/src/core/battle.ts';
const data = loadData();
function fresh(seed = 11, soldiers = 60) {
  return createWorld({ data, seed, a: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'A', str: 60, int: 70 } }, b: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'B', str: 60, int: 70 } } });
}
const w = fresh();
let t = 0;
const snap = [];
while (!w.over && t < 20000) { step(w); t++; if (t % 2000 === 0) snap.push([t, w.stats.hitsA + w.stats.hitsB, w.stats.blocks, w.sides.A.aliveCount, w.sides.B.aliveCount, w.sides.A.general.hp, w.sides.B.general.hp]); }
console.log('over', w.over, 't', t, 'reason', w.endReason, 'winner', w.winner);
console.log('stats', JSON.stringify({ hits: w.stats.hitsA + w.stats.hitsB, attacks: w.stats.attacksA + w.stats.attacksB, blocks: w.stats.blocks, kills: w.stats.killsInf + w.stats.killsCav + w.stats.killsInfB + w.stats.killsCavB }));
console.log(snap.map((r) => r.join('/')).join('\n'));
