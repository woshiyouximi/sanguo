// 内政审计探针公共夹具：数据加载 + 按 city.html 启动顺序造存档 + 双端模型导出
import fs from 'node:fs';

export const ROOT = 'F:/sanguo';
export const W = await import('file:///F:/sanguo/game/web/city_model.js');
export const C = await import('file:///F:/sanguo/game/cocos/assets/scripts/CityModel.ts');
export const Saves = await import('file:///F:/sanguo/game/web/saves.js');

const rd = (p) => JSON.parse(fs.readFileSync(`${ROOT}/game/${p}`, 'utf8'));

export const DATA = {
  scenarios: rd('data/scenarios.json'),
  generals: rd('data/generals.json'),
  items: rd('data/items.json'),
  wises: rd('data/wises.json'),
  system: rd('data/sango_system.json'),
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const deep = (o) => JSON.parse(JSON.stringify(o));
export const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) + '%' : '-');
export const pad = (s, n) => String(s).padEnd(n, ' ');
export const padl = (s, n) => String(s).padStart(n, ' ');
export function table(rows, head) {
  const cols = head.length;
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (r, f) => r.map((c, i) => (f ? padl(c, w[i]) : pad(c, w[i]))).join(' | ');
  console.log(line(head));
  console.log(w.map((x) => '-'.repeat(x)).join('-+-'));
  for (const r of rows) console.log(line(r));
}

// city.html:459-513 的启动顺序
export function makeSave({ scenIdx = 0, month = 1, owned, money = {}, gold = 0 } = {}) {
  const scen = DATA.scenarios[scenIdx];
  const save = Saves.newCampaign(scen, { gold });
  W.ensureExtras(save);
  for (const c of scen.cities) W.ensureCityState(save, c);
  W.migrateGold(save, scen.cities);
  if (owned) save.owned = owned.slice();
  save.month = month;
  for (const [name, m] of Object.entries(money)) {
    if (!save.cities[name]) throw new Error('no city ' + name);
    save.cities[name].money = m;
  }
  return save;
}

export function makeCtx(save, scenIdx = 0, extra = {}) {
  return {
    generals: DATA.generals,
    items: DATA.items,
    wises: DATA.wises,
    scenario: DATA.scenarios[scenIdx],
    scenIdx,
    bag: W.parseItemsSave(null).bag.slice(),
    ...extra,
  };
}

export const cityDef = (name, scenIdx = 0) => DATA.scenarios[scenIdx].cities.find((c) => c.NAME === name);
export const cityNames = (scenIdx = 0) => DATA.scenarios[scenIdx].cities.map((c) => c.NAME);

// scenIdx 剧本里每城在野武将数
export function wildByCity(scenIdx = 0) {
  const out = {};
  for (const g of DATA.generals) {
    const st = Array.isArray(g.status_by_times) ? g.status_by_times[scenIdx] : g.Status;
    const ct = Array.isArray(g.city_by_times) ? g.city_by_times[scenIdx] : g.CITY;
    if (st === '野' && ct) out[ct] = (out[ct] || 0) + 1;
  }
  return out;
}

export function cityStateOf(save, name) {
  return save.cities[name];
}

// 相邻城（和 city_model.neighboursOf 同口径：Length < PATH_SENTINEL 30000）
export function neighbourPairs(scenIdx = 0) {
  const scen = DATA.scenarios[scenIdx];
  const pairs = [];
  for (const p of scen.paths || []) {
    if (Number(p.Length) < 30000) pairs.push([p.Start, p.End]);
  }
  return pairs;
}

// 找一对相邻城 A→B，且两城都在剧本 cities 里（不含关）
export function findAdjacentPair(scenIdx = 0, preferWild = true) {
  const names = new Set(cityNames(scenIdx));
  const wild = wildByCity(scenIdx);
  const pairs = neighbourPairs(scenIdx).filter(([a, b]) => names.has(a) && names.has(b));
  pairs.sort((x, y) => (wild[y[0]] || 0) + (wild[y[1]] || 0) - (wild[x[0]] || 0) - (wild[x[1]] || 0));
  return preferWild ? pairs[0] : pairs[pairs.length - 1];
}

// 用固定 rng 跑，避免随机噪音（develop 的 randBelow 用 rngNext）
export function withRng(model, value, fn) {
  if (typeof model.setRng !== 'function') throw new Error('no setRng');
  model.setRng(typeof value === 'function' ? value : () => value);
  try {
    return fn();
  } finally {
    model.setRng(null);
  }
}

// 每次搜索/自治用独立 nonce，模拟「新开一局/读档」后的可复现种子
export function setNonce(model, nonce) {
  // web: save[SEARCH_NONCE_KEY] = nonce；Cocos 同名常量
  return nonce;
}

export function genByName(name) {
  return DATA.generals.find((g) => g.NAME === name) || null;
}

export function cityMajorName(name, scenIdx = 0) {
  const cd = cityDef(name, scenIdx);
  return cd && typeof cd.MAJOR === 'string' ? cd.MAJOR : '';
}
