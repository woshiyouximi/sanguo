/* 量測 webfix_r83:76-99 那條統計斷言的 flakiness：
 *   `hist.size < 30` 在「nonce 隨機」之下是隨機變數，先量出分佈再決定 R20 的落地方式。
 * 用法：node work/rows85/probe_hist.mjs [N]
 */
import fs from 'node:fs/promises';

const root = new URL('../../game/', import.meta.url);
const rd = async (p) => JSON.parse(await fs.readFile(new URL(p, root), 'utf8'));

const [SCEN_RAW, GENS, ITEMS, WISES] = await Promise.all([
  rd('data/scenarios.json'), rd('data/generals.json'), rd('data/items.json'), rd('data/wises.json'),
]);
const Saves = await import(new URL('web/saves.js', root).href);
const M = await import(new URL('web/city_model.js', root).href);

const SCEN = SCEN_RAW.map((s) => s);
const S0 = SCEN[0];
const ctx = () => ({ generals: [], scenario: S0, scenIdx: 0, items: REPEATABLE, wises: WISES });
const REPEATABLE = ITEMS.filter((it) => String(it.Attrib || '') !== 'ONLYONE');
const cdef = (n) => S0.cities.find((c) => c.NAME === n);

function fresh() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  return save;
}

const N = Number(process.argv[2] || 200);
const sizes = [];
const runs = [];
for (let t = 0; t < N; t += 1) {
  const save = fresh();
  save.gold = 1e9;
  M.setSearchNonce(save, (t * 2654435761) % 4294967296);   // 走「不同 nonce」而不是真隨機，量測才可重現
  const hist = new Map();
  let last = null; let run = 0; let maxRun = 0;
  for (let i = 0; i < 100; i += 1) {
    save.searchSeq['代縣'] = Math.min(i, 60);
    const r = M.search(save, cdef('代縣'), ctx());
    const key = `${r.kind}:${r.seq ?? ''}`;
    hist.set(key, (hist.get(key) || 0) + 1);
    if (key === last) run += 1; else { last = key; run = 1; }
    maxRun = Math.max(maxRun, run);
  }
  sizes.push(hist.size);
  runs.push(maxRun);
}

const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((acc, v) => acc + (v - mean) ** 2, 0) / a.length);
  return { min: s[0], p50: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)], max: s[s.length - 1], mean: +mean.toFixed(2), sd: +sd.toFixed(2) };
};
const bad = sizes.filter((n) => n >= 30).length;
console.log('N =', N);
console.log('hist.size  ', JSON.stringify(stat(sizes)));
console.log('hist.size >= 30 的比例 =', (bad / N * 100).toFixed(1) + '%');
console.log('maxRun     ', JSON.stringify(stat(runs)));
