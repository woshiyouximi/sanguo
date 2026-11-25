// 临时基准：量单局成本，决定 --n 与并行度（非交付物）
import { loadData } from '../game/src/data.ts';
import { createWorld, step, TICK_HZ } from '../game/src/core/battle.ts';

const dir = new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const t0 = Date.now();
const data = loadData({ dir });
console.log('loadData ms', Date.now() - t0);

function run(seed, a, b) {
  const w = createWorld({ data, seed, a, b });
  const limit = 180 * TICK_HZ;
  let n = 0;
  while (!w.over && n < limit) { step(w); n++; }
  return { winner: w.winner, tick: w.tick, reason: w.endReason, aN: w.sides.A.aliveCount, bN: w.sides.B.aliveCount };
}

// 热身
for (let i = 0; i < 3; i++) run(1000 + i, { troop: 2, formation: 0 }, { troop: 10, formation: 0 });

const cases = [
  ['大刀vs黄巾', { troop: 2, formation: 0 }, { troop: 10, formation: 0 }],
  ['镜像铁锤', { troop: 4, formation: 0 }, { troop: 4, formation: 0 }],
  ['长枪vs弓骑', { troop: 1, formation: 3 }, { troop: 3, formation: 3 }],
];
for (const [name, a, b] of cases) {
  const t = Date.now();
  const N = 20;
  let ticks = 0, wins = 0;
  for (let i = 0; i < N; i++) {
    const r = run(2000 + i, a, b);
    ticks += r.tick;
    if (r.winner === 'A') wins++;
  }
  const ms = Date.now() - t;
  console.log(`${name}: ${N} 局 ${ms}ms → ${(ms / N).toFixed(1)}ms/局, 平均 ${(ticks / N / TICK_HZ).toFixed(1)}s, A胜 ${wins}/${N}`);
}
