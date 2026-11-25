import { readFileSync } from 'node:fs';
import * as Saves from '../game/web/saves.js';
import * as M from '../game/web/city_model.js';

const scen = JSON.parse(readFileSync(new URL('../game/data/scenarios.json', import.meta.url), 'utf8'));
const gens = JSON.parse(readFileSync(new URL('../game/data/generals.json', import.meta.url), 'utf8'));
const items = JSON.parse(readFileSync(new URL('../game/data/items.json', import.meta.url), 'utf8'));
const s0 = scen[0];
const ctx = { generals: gens, scenario: s0, scenIdx: 0, items };

let save = Saves.newCampaign(s0);
M.ensureExtras(save);
for (const c of s0.cities) M.ensureCityState(save, c);
const cdef = (n) => s0.cities.find((c) => c.NAME === n);

console.log('gold', save.gold, 'owned', save.owned);
for (const city of ['代縣', '襄平', '北平']) {
  const d = cdef(city);
  console.log(city, 'roster', M.rosterOf(save, city, ctx).map((g) => g.NAME).join(','));
  console.log('  wildPool', M.wildPool(save, city, ctx).map((g) => g.NAME).join(','));
  console.log('  eff', M.efficiencyOf(save, d, ctx).toFixed(3), 'major', M.majorOf(save, d), 'wise', M.wiseOf(save, d));
}

const s2 = Saves.newCampaign(s0);
M.ensureExtras(s2);
for (const c of s0.cities) M.ensureCityState(s2, c);
for (const city of ['代縣', '襄平']) {
  for (let i = 0; i < 6; i += 1) {
    const r = M.search(s2, cdef(city), ctx);
    console.log(city, '#' + i, r.kind, r.text, 'gold=', s2.gold, 'roster', JSON.stringify(s2.roster));
    if (s2.gold < 200) break;
  }
}

const dev = M.develop(s2, cdef('代縣'), ctx);
console.log('develop', JSON.stringify(dev), JSON.stringify(s2.cities['代縣']));
const rec = M.recruit(s2, cdef('代縣'), ctx);
console.log('recruit', JSON.stringify(rec), JSON.stringify(s2.cities['代縣']));
console.log('neighbours 襄平', M.neighboursOf('襄平', s0));
console.log('deployTargets 代縣', JSON.stringify(M.deployTargets(s2, cdef('代縣'), ctx)));
console.log('intel 代縣', JSON.stringify(M.intel(s2, cdef('代縣'), ctx), null, 0));
console.log('pools', JSON.stringify(Object.fromEntries(Object.entries(M.searchPools(items)).map(([k, v]) => [k, v.length]))));
