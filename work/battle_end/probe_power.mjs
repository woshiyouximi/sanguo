// 临时探针 4：地形 0/3 下 弩兵 的实际战力与单次伤害
import { loadData } from '../../game/src/data.ts';
import { createWorld, basicDamage, powerOf, step } from '../../game/src/core/battle.ts';
import { engage } from '../../game/tests/_engage.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const troopIdx = (n) => data.troops.names.indexOf(n);

for (const terrain of [0, 3]) {
  const w = engage(createWorld({ data, seed: 4000, terrain, a: { troop: troopIdx('弩兵'), soldiers: 40 }, b: { troop: troopIdx('朴刀'), soldiers: 40 } }));
  step(w);
  const u = w.units.find((x) => x.side === 'A' && !x.isGeneral);
  const u2 = w.units.find((x) => x.side === 'A' && !x.isGeneral && x.kind === 'cavalry');
  let sum = 0;
  let buckets = {};
  for (let i = 0; i < 1000; i++) {
    const d = basicDamage(w, u);
    sum += d;
    buckets[d] = (buckets[d] ?? 0) + 1;
  }
  console.log(`terrain=${terrain} powerA=${powerOf(w, 'A')} dmgAvg=${(sum / 1000).toFixed(4)} dist=${JSON.stringify(buckets)} isCav=${!!u2}`);
}
