import { createWorld, step, settle, TICK_HZ } from './src/core/battle.ts';
import type { World } from './src/core/battle.ts';
import { loadData } from './src/data.ts';

const data = loadData({ dir: new URL('./data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') }) as any;

function run(channel: string, n: number) {
  const t0 = process.hrtime.bigint();
  let ticks = 0, kills = 0;
  for (let i = 0; i < n; i++) {
    const w = createWorld({
      data, seed: 1000 + i, terrain: 3, damageChannel: channel,
      a: { general: { name: '關羽', str: 99, int: 85, level: 5 }, troop: '弩兵', formation: '方形', soldiers: 100 },
      b: { general: { name: '黃巾', str: 60, int: 40, level: 3 }, troop: '黃巾', formation: '雁形', soldiers: 100 },
    } as any);
    let k = 0;
    const limit = 180 * TICK_HZ;
    while (!w.over && k < limit) { step(w); k++; }
    const s: any = settle(w);
    ticks += k; kills += (s?.kills ?? 0);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { channel, n, ms: Math.round(ms), perBattle: +(ms / n).toFixed(1), ticks, kills };
}

console.log(JSON.stringify(run('legacy', 20)));
console.log(JSON.stringify(run('script', 20)));
