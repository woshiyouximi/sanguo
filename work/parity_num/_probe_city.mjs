/** 临时探针：定位 ensureCityState 的 pop 分歧来源 */
import { compile, loadCjs, loadEsm, readJson } from './build_sim.mjs';

compile('tsconfig.city.json');
const WEB = await loadEsm('game/web/city_model.js');
const COC = loadCjs('cocos_city/CityModel.js');
const SCEN = readJson('game/data/scenarios.json');
const sc = SCEN[0];
const def = sc.cities.find((c) => c.NAME === '襄平');
console.log('def key  =', JSON.stringify(def));
console.log('POPULATION typeof', typeof def.POPULATION, 'raw', JSON.stringify(def.POPULATION));
console.log('MONEY', JSON.stringify(def.MONEY), 'DEFENSE', JSON.stringify(def.DEFENSE), 'RATE', JSON.stringify(def.RATE));

const mk = () => ({
  gold: 1000, month: 3, scenario: sc.id, owned: [], cities: {}, roster: {}, appointed: {},
  searchLog: [], foundItems: [], auto: {}, autoMonth: 0, lastActionMonth: 0, tire: {}, morale: {},
});
const sw = mk(); const scv = mk();
console.log('web ensureExtras keys', Object.keys(WEB.ensureExtras(sw) || {}));
console.log('coc ensureExtras keys', Object.keys(COC.ensureExtras(scv) || {}));
console.log('web after ensureExtras cities', JSON.stringify(sw.cities));
console.log('coc after ensureExtras cities', JSON.stringify(scv.cities));
console.log('web ensureCityState', JSON.stringify(WEB.ensureCityState(sw, def)));
console.log('coc ensureCityState', JSON.stringify(COC.ensureCityState(scv, def)));
console.log('web troopCapOf(POP)', WEB.troopCapOf(def.POPULATION), 'coc', COC.troopCapOf(def.POPULATION));
console.log('web prepCapOf(89100)', WEB.prepCapOf(89100), 'coc', COC.prepCapOf(89100));
console.log('WEB.num?', typeof WEB.num, 'COC.num?', typeof COC.num);
