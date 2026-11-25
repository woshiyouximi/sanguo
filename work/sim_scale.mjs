// 临时基准：worker 池并行效率（非交付物）
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { loadData } from '../game/src/data.ts';
import { createWorld, step, TICK_HZ } from '../game/src/core/battle.ts';

const dir = new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

if (isMainThread) {
  const W = Number(process.argv[2] ?? 12);
  const TOTAL = Number(process.argv[3] ?? 240);
  const per = Math.ceil(TOTAL / W);
  const t0 = Date.now();
  let done = 0, wins = 0;
  const workers = [];
  for (let w = 0; w < W; w++) {
    const lo = w * per, hi = Math.min(TOTAL, lo + per);
    if (lo >= hi) break;
    const wk = new Worker(new URL(import.meta.url), { workerData: { lo, hi } });
    workers.push(wk);
    wk.on('message', (m) => { done += m.done; wins += m.wins; });
  }
  await Promise.all(workers.map((wk) => new Promise((res) => wk.on('exit', res))));
  const ms = Date.now() - t0;
  console.log(`W=${W} total=${TOTAL} → ${ms}ms, ${(TOTAL / (ms / 1000)).toFixed(2)} 局/s, winsA=${wins}`);
} else {
  const { lo, hi } = workerData;
  const data = loadData({ dir });
  let wins = 0, done = 0;
  for (let i = lo; i < hi; i++) {
    // 混合配置，避免同一配置被 JIT 特化
    const a = { troop: 2, formation: i % 9 };
    const b = { troop: 10, formation: (i * 7) % 9 };
    const w = createWorld({ data, seed: 3000 + i, a, b });
    let n = 0;
    while (!w.over && n < 180 * TICK_HZ) { step(w); n++; }
    if (w.winner === 'A') wins++;
    done++;
  }
  parentPort.postMessage({ done, wins });
}
