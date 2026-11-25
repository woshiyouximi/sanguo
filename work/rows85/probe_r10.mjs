// 量測 city_rules R10「自治施行」在真隨機下的偶發紅率（不進 tests/）
import { readFileSync } from 'node:fs';
import * as Saves from '../../game/web/saves.js';
import * as M from '../../game/web/city_model.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const GENS = readJson('../../game/data/generals.json');
const ITEMS = readJson('../../game/data/items.json');
const WISES = readJson('../../game/data/wises.json');
const SCEN = readJson('../../game/data/scenarios.json');
const S0 = SCEN[0];
const ctx = () => ({ generals: GENS, scenario: S0, scenIdx: 0, items: ITEMS, wises: WISES });

function fresh() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  return save;
}

const N = Number(process.argv[2] || 20000);
let bad = 0;
const kinds = new Map();
for (let i = 0; i < N; i++) {
  const save = fresh();
  const gold0 = Saves.num(save.gold);
  save.auto = { 襄平: 1 };
  M.setAuto(save, '襄平', true, ctx());
  const pop0 = save.cities['襄平'].pop;
  const def0 = save.cities['襄平'].def;
  const r = M.runAutonomy(save, S0.cities, ctx(), { from: '代縣' });
  const st = save.cities['襄平'];
  const why = [];
  if (r.ran.length !== 1) why.push(`ran=${r.ran.length}`);
  if (r.skipped.length !== 0) why.push(`skipped=${JSON.stringify(r.skipped)}`);
  if (Saves.num(save.gold) !== gold0 - M.DEV.COST) why.push(`gold=${Saves.num(save.gold)} (want ${gold0 - M.DEV.COST})`);
  if (!(st.pop > pop0)) why.push(`pop ${pop0}→${st.pop}`);
  if (!(st.def > def0)) why.push(`def ${def0}→${st.def}`);
  if (why.length) {
    bad += 1;
    const key = why.join(' | ').replace(/\d+/g, '#');
    kinds.set(key, (kinds.get(key) || 0) + 1);
    if (bad <= 3) console.log(i, why.join(' | '));
  }
}
console.log(`bad=${bad}/${N} (${((bad / N) * 100).toFixed(3)}%)`);
for (const [k, v] of kinds) console.log('  ', v, k);
