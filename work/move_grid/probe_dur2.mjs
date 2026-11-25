import { loadData } from '../../game/src/data.ts';
const data = loadData();
const oldB = await import('../../game/cocos/assets/scripts/core/battle.ts');
const newB = await import('../../game/src/core/battle.ts');
function opts(seed) { return { data, seed, a: { troop: 2 }, b: { troop: 10 } }; }
for (const [tag, B] of [['old(0.09/tick)', oldB], ['new(1格/40tick)', newB]]) {
  const secs = [];
  for (const seed of [7, 1, 2, 3, 4]) {
    const w = B.createWorld(opts(seed));
    let t = 0;
    while (!w.over && t < 30000) { B.step(w); t++; }
    secs.push((t / 30).toFixed(1));
  }
  console.log(tag, 'seed7/1/2/3/4 sec =', secs.join(' / '));
}
