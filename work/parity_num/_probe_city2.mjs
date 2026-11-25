/** 临时探针 2：逐表对比 CityModel 常量与纯函数，定位结构性差异 */
import { compile, loadCjs, loadEsm, readJson, diffDeep } from './build_sim.mjs';

compile('tsconfig.city.json');
const WEB = await loadEsm('game/web/city_model.js');
const COC = loadCjs('cocos_city/CityModel.js');
const SCEN = readJson('game/data/scenarios.json');
const GENS = readJson('game/data/generals.json');
const ITEMS = readJson('game/data/items.json');
const WISES = readJson('game/data/wises.json');
const sc = SCEN[0];
const ctx = { generals: GENS, items: ITEMS, wises: WISES, scenario: sc, scenIdx: 0, bag: [], level: undefined };

const NAMES = ['DEV', 'RECRUIT', 'SEARCH', 'EFF', 'ARMS', 'ARM_NAMES', 'CMD_ORDER', 'CMD_EXTRA', 'CMD_META',
  'INCR_GRADES', 'PATH_SENTINEL', 'FLAG_GATE', 'BAG_KEY', 'DEFAULT_BAG', 'MOVE', 'APPOINT', 'AUTONOMY'];
const show = (label, a, b) => {
  const box = diffDeep(a, b);
  if (!box.misses.length) return;
  console.log(`\n### ${label}  不一致 ${box.misses.length}`);
  for (const m of box.misses.slice(0, 12)) console.log(`   ${m.path}  web=${JSON.stringify(m.web)}  cocos=${JSON.stringify(m.cocos)}`);
};
for (const n of NAMES) show(`const ${n}`, WEB[n], COC[n]);
show('incrRows()', WEB.incrRows(), COC.incrRows());
for (const k of ['devGold', 'prepGainPct', 'cavCapMax', 'effMax']) show(`incrVal(${k})`, WEB.incrVal(k), COC.incrVal(k));

// searchSeq / searchCount
const mk = () => ({
  gold: 1000, month: 3, scenario: sc.id, owned: [], cities: {}, roster: {}, appointed: {},
  searchLog: [], foundItems: [], auto: {}, autoMonth: 0, lastActionMonth: 0, tire: {}, morale: {},
});
const sw = mk(); const scv = mk();
WEB.ensureExtras(sw); COC.ensureExtras(scv);
show('ensureExtras save keys', Object.keys(sw).sort(), Object.keys(scv).sort());
const def = sc.cities.find((c) => c.NAME === '襄平');
show('searchCount(before)', WEB.searchCount(sw, '襄平'), COC.searchCount(scv, '襄平'));
show('searchSeed(成都,7,3)', WEB.searchSeed('成都', 7, 3), COC.searchSeed('成都', 7, 3));
show('searchSeed(成都,7,3,1)', WEB.searchSeed('成都', 7, 3, 1), COC.searchSeed('成都', 7, 3, 1));
show('ownedItemSeqs', WEB.ownedItemSeqs(sw, ctx), COC.ownedItemSeqs(scv, ctx));
show('parseItemsSave({bag:[3,"7",0,-1,3]})', WEB.parseItemsSave({ bag: [3, '7', 0, -1, 3], equip: { a: 1 } }), COC.parseItemsSave({ bag: [3, '7', 0, -1, 3], equip: { a: 1 } }));
show('withBagItem({bag:[3]},49)', WEB.withBagItem({ bag: [3] }, 49), COC.withBagItem({ bag: [3] }, 49));
show('clearMonthLock', (() => { const s = mk(); WEB.markMonthActed(s, false); return [WEB.clearMonthLock(s), s]; })(), (() => { const s = mk(); COC.markMonthActed(s, false); return [COC.clearMonthLock(s), s]; })());
show('setAuto(代縣)', (() => { const s = mk(); return [WEB.setAuto(s, '代縣', true), s.auto]; })(), (() => { const s = mk(); return [COC.setAuto(s, '代縣', true), s.auto]; })());
show('intel', WEB.intel(Object.assign(mk(), { cities: {} }), def, ctx), COC.intel(Object.assign(mk(), { cities: {} }), def, ctx));
