import { loadData } from '../../game/src/data.ts';
import { createWorld, step } from '../../game/src/core/battle.ts';
const data = loadData();
const out = [];
for (let sc = 0; sc < 3; sc++) {
  const scenario = data.scenarios[sc];
  const aName = String(scenario.kings[0].NAME), bName = String(scenario.kings[1].NAME);
  for (let terrain = 0; terrain < 12; terrain++) {
    for (const seed of [1, 2]) {
      const month = seed === 1 ? 7 : 1;
      const w = createWorld({ data, seed, terrain, month, a: { soldiers: 24, general: { name: aName, str: 80, int: 60, level: 1 } }, b: { soldiers: 24, general: { name: bName, str: 80, int: 60, level: 1 } } });
      let t = 0;
      while (!w.over && t < 3000 && w.stats.attacksA + w.stats.attacksB === 0) { step(w); t++; }
      out.push([sc, terrain, seed, t, w.over, w.endReason]);
    }
  }
}
const first = out.map((r) => r[3]);
console.log('firstAttack ticks: min', Math.min(...first), 'max', Math.max(...first), 'median', first.slice().sort((a, b) => a - b)[36]);
console.log('over before contact:', out.filter((r) => r[4]).length);
console.log(out.filter((r) => r[3] > 1200).slice(0, 5));
