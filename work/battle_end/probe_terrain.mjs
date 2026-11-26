// 临时探针 3：小兵力下 弩兵 vs 朴刀 的结局分布（给 terrain 测试选样本）
import { loadData } from '../../game/src/data.ts';
import { createWorld, step } from '../../game/src/core/battle.ts';
import { engage } from '../../game/tests/_engage.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const troopIdx = (n) => data.troops.names.indexOf(n);
const aTroop = troopIdx('弩兵');
const bTroop = troopIdx('朴刀');

for (const soldiers of [8, 10, 12, 16, 20]) {
  for (const terrain of [0, 3]) {
    const tally = { A: 0, B: 0, draw: 0 };
    let kills = 0;
    for (let i = 0; i < 20; i++) {
      const w = engage(
        createWorld({ data, seed: 4000 + i, terrain, a: { troop: aTroop, soldiers }, b: { troop: bTroop, soldiers } }),
      );
      let n = 0;
      while (!w.over && n < 12060) {
        step(w);
        n++;
      }
      tally[w.winner ?? 'none']++;
      kills += w.stats.killsInf + w.stats.killsCav - (w.stats.killsInfB + w.stats.killsCavB);
    }
    console.log(`soldiers=${soldiers} terrain=${terrain}`, JSON.stringify(tally), 'killdiff', (kills / 20).toFixed(1));
  }
}
