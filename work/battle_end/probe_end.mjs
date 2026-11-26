// 临时探针：看新口径下一场仗到底怎么结束（保留在 work/battle_end/ 供复跑）
// 跑法：cd F:\sanguo && node work/battle_end/probe_end.mjs
import { loadData } from '../../game/src/data.ts';
import { createWorld, step } from '../../game/src/core/battle.ts';
import { engage } from '../../game/tests/_engage.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function run(label, opts, maxTicks = 12060) {
  const w = engage(createWorld({ data, ...opts }));
  let n = 0;
  while (!w.over && n < maxTicks) {
    step(w);
    n++;
  }
  const g = w.sides;
  console.log(
    `${label} seed=${opts.seed} over=${w.over} end=${w.endReason} winner=${w.winner} tick=${w.tick} ` +
      `A_gen=${g.A.general.alive}(${Math.round(g.A.general.hp)}hp) B_gen=${g.B.general.alive}(${Math.round(g.B.general.hp)}hp) ` +
      `A_sol=${g.A.aliveCount} B_sol=${g.B.aliveCount}`,
  );
  return w;
}

for (let i = 0; i < 6; i++) run('mirror100', { seed: 500 + i, a: { troop: 0, formation: 0 }, b: { troop: 0, formation: 0 } });
for (let i = 0; i < 4; i++) run('60v60', { seed: 11 + i, a: { soldiers: 60 }, b: { soldiers: 60 } });
run('40v40', { seed: 61, a: { soldiers: 40, general: { str: 97, int: 75, level: 6 } }, b: { soldiers: 40, cavalry: 20, general: { str: 70, int: 88, level: 25 } } });
run('troop4v12', { seed: 7, a: { troop: 4, formation: 0 }, b: { troop: 12, formation: 1 } });
