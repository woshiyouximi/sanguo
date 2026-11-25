// 一次性探针：对拍 web city_model.js 与 cocos CityModel.ts 的 deployTargets（關卡出征）
// 用法：node work/gate_target/probe.mjs
import fs from 'node:fs';

const ROOT = new URL('../../game/', import.meta.url);
const read = (rel) => JSON.parse(fs.readFileSync(new URL(rel, ROOT), 'utf8'));

const SCEN = read('data/scenarios.json');
const GENS = read('data/generals.json');
const ITEMS = read('data/items.json');
const WISES = read('data/wises.json');
const GAR = read('data/garrison.json');

const W = await import(new URL('web/city_model.js', ROOT));
const C = await import(new URL('cocos/assets/scripts/CityModel.ts', ROOT));
const Saves = await import(new URL('web/saves.js', ROOT));

const scen = SCEN[0];
const save = Saves.newCampaign(scen);
for (const c of scen.cities) W.ensureCityState(save, c);

const ctx = { generals: GENS, scenario: scen, scenIdx: 0, items: ITEMS, wises: WISES, garrison: GAR };
const def = (n) => scen.cities.find((c) => c.NAME === n);

const wp = W.deployTargets(save, def('北平'), ctx);
const cp = C.deployTargets(save, def('北平'), ctx);
console.log('web 北平 :', JSON.stringify(wp));
console.log('coco北平 :', JSON.stringify(cp));
console.log('parity   :', JSON.stringify(wp) === JSON.stringify(cp));

// 代縣
console.log('web 代縣 :', JSON.stringify(W.deployTargets(save, def('代縣'), ctx).map((r) => r.name)));
// 無 garrison 資料時
const ctxNoGar = { generals: GENS, scenario: scen, scenIdx: 0, items: ITEMS, wises: WISES };
console.log('no-gar   :', JSON.stringify(W.deployTargets(save, def('北平'), ctxNoGar)));
console.log('coco no-g:', JSON.stringify(C.deployTargets(save, def('北平'), ctxNoGar)));
// 占了易京之后：北平 → 南皮
const save2 = JSON.parse(JSON.stringify(save));
save2.owned.push('易京');
save2.cities['易京'].owner = save2.king || '公孫瓚';
const wp2 = W.deployTargets(save2, def('北平'), ctx);
console.log('占易京后北平 web :', JSON.stringify(wp2.map((r) => r.name)));
console.log('占易京后北平 coco:', JSON.stringify(C.deployTargets(save2, def('北平'), ctx).map((r) => r.name)));
// 開發仍禁
const dev = W.develop(save, def('易京'), { ...ctx });
console.log('開發 易京:', JSON.stringify(dev));
// 情報列仍是「關卡」
const intel = W.intel(save, def('北平'), ctx);
console.log('情報 rows:', JSON.stringify(intel.rows.map((r) => [r.name, r.gate, r.owner, r.troops])));
// garrison 数值是不是 110
console.log('garrison 易京:', JSON.stringify(GAR[0].cities['易京']));
