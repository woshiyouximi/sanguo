import { loadData } from '../../game/src/data.ts';
import { createWorld, step } from '../../game/src/core/battle.ts';
const data = loadData();
const secs = [];
for (const seed of [7, 1, 2, 3, 4, 5]) {
  const w = createWorld({ data, seed, a: { troop: 2 }, b: { troop: 10 } });
  let t = 0;
  while (!w.over && t < 60000) {
    step(w);
    t++;
  }
  secs.push(+(t / 30).toFixed(1));
  if (seed === 7) console.log('seed7 ticks', t, 'reason', w.endReason, 'winner', w.winner, 'attacks', w.stats.attacksA + w.stats.attacksB);
}
console.log('new durations s:', secs.join(' / '));
