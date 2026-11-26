// 临时探针 2：不同兵力的结局分布 / 地形对局 / roll 结算复现
import { loadData } from '../../game/src/data.ts';
import { createWorld, step, settle } from '../../game/src/core/battle.ts';
import { sangoRng } from '../../game/src/core/sango_rng.ts';
import { engage } from '../../game/tests/_engage.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const troopIdx = (n) => data.troops.names.indexOf(n);

function run(opts, maxTicks = 12060) {
  const w = engage(createWorld({ data, ...opts }));
  let n = 0;
  while (!w.over && n < maxTicks) {
    step(w);
    n++;
  }
  return w;
}

for (const soldiers of [20, 30, 40, 60, 100]) {
  const tally = { A: 0, B: 0, draw: 0, none: 0 };
  for (let i = 0; i < 8; i++) {
    const w = run({ seed: 500 + i, a: { soldiers, troop: 0, formation: 0 }, b: { soldiers, troop: 0, formation: 0 } });
    tally[w.winner ?? 'none']++;
  }
  console.log(`mirror ${soldiers}v${soldiers}:`, JSON.stringify(tally));
}

const aTroop = troopIdx('弩兵');
const bTroop = troopIdx('朴刀');
for (const terrain of [0, 3]) {
  const tally = { A: 0, B: 0, draw: 0, none: 0 };
  for (let i = 0; i < 20; i++) {
    const w = run({ seed: 4000 + i, terrain, a: { troop: aTroop, soldiers: 40 }, b: { troop: bTroop, soldiers: 40 } });
    tally[w.winner ?? 'none']++;
  }
  console.log(`crossbow terrain=${terrain}:`, JSON.stringify(tally));
}

for (const seed of [11, 12, 13, 14, 15, 16]) {
  const w = engage(
    createWorld({ data, seed: 7, roll: sangoRng(seed), a: { troop: 4, formation: 0 }, b: { troop: 12, formation: 1 } }),
  );
  let n = 0;
  while (!w.over && n < 12060) {
    step(w);
    n++;
  }
  const post = settle(w).post;
  console.log(
    `roll=${seed} over=${w.over} winner=${w.winner} end=${w.endReason} tick=${w.tick} cap=${post?.captures.length} exec=${post?.executed.length} rel=${post?.released.length}`,
  );
}
