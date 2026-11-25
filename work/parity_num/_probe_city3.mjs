/** 临时探针 3：定位 ownedItemSeqs / 物品 类分歧 */
import { compile, loadCjs, loadEsm, readJson, diffDeep } from './build_sim.mjs';

compile('tsconfig.city.json');
const WEB = await loadEsm('game/web/city_model.js');
const COC = loadCjs('cocos_city/CityModel.js');
const SCEN = readJson('game/data/scenarios.json');
const GENS = readJson('game/data/generals.json');
const ITEMS = readJson('game/data/items.json');
const WISES = readJson('game/data/wises.json');
const sc = SCEN[0];
const def = sc.cities.find((c) => c.NAME === '襄平');
const ctx = { generals: GENS, items: ITEMS, wises: WISES, scenario: sc, scenIdx: 0, bag: [3, 7], level: undefined };

const show = (label, a, b) => {
  const box = diffDeep(a, b);
  console.log(`\n### ${label}  ${box.misses.length ? `不一致 ${box.misses.length}` : 'OK'}`);
  for (const m of box.misses.slice(0, 16)) console.log(`   ${m.path}  web=${JSON.stringify(m.web)}  cocos=${JSON.stringify(m.cocos)}`);
};

const mk = () => ({
  gold: 1000, month: 3, scenario: sc.id, owned: [], cities: {}, roster: {}, appointed: {},
  searchLog: [], foundItems: [], auto: {}, autoMonth: 0, lastActionMonth: 0, tire: {}, morale: {},
  bag: [3, 7], searchNonce: 0x5eed1234,
});
const sw = mk(); const scv = mk();
WEB.ensureExtras(sw); COC.ensureExtras(scv);

show('bagSlotOf()', WEB.bagSlotOf?.(), COC.bagSlotOf?.());
show('parseBag([3,"7",0,-1,3])', WEB.parseBag?.([3, '7', 0, -1, 3]), COC.parseBag?.([3, '7', 0, -1, 3]));
show('ownedItemSeqs(empty)', WEB.ownedItemSeqs(sw, ctx), COC.ownedItemSeqs(scv, ctx));

// 搜索一次，看 kind/seq/物品编号
const sw2 = mk(); const scv2 = mk();
WEB.ensureExtras(sw2); COC.ensureExtras(scv2);
const rw = WEB.search(sw2, def, ctx);
const rc = COC.search(scv2, def, ctx);
show('search#1', rw, rc);
show('search#1 save', sw2, scv2);
show('ownedItemSeqs(after)', WEB.ownedItemSeqs(sw2, ctx), COC.ownedItemSeqs(scv2, ctx));
show('searchPools', WEB.searchPools(ITEMS, [], 0), COC.searchPools(ITEMS, [], 0));
