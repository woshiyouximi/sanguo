/**
 * item7_verify.mjs — 名冊「狀態」口徑回歸（P1-6 淳于瓊）。
 *
 * 跑法（cc mock 在 work/cocos_book/_sim/node_modules）：
 *   cd F:\sanguo\work\ui_p2\verify
 *   $env:NODE_PATH='F:\sanguo\work\cocos_book\_sim\node_modules'; node item7_verify.mjs
 *
 * 前提：`_sim/` 由 `tsc -p tsconfig.sim.json` 用「改後的 GeneralBook.ts」現編（不是 work/cocos_book 的舊 _sim）。
 *
 * 驗的東西：
 *   ① 劇本 index 1（189 年 · 劉備 / 平原）淳于瓊在名冊是「在野」不是「在職」；
 *   ② 證明舊兜底確實錯：generals.json 淳于瓊靜態 Status='登'，但 status_by_times[1]='野'；
 *   ③ 全 401 將：名冊狀態 === 運行時口徑（有守將記錄→記錄 status，否則 status_by_times[scenIdx]）逐將比對；
 *   ④ 平原 7 名守將：4 登 / 3 野，名冊與 garrison.json 一致（與 OfficersOfCity.statusOfGeneral 同源）。
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const GB = require('./_sim/GeneralBook.js');
const DATA = 'F:/sanguo/game/cocos/assets/bundles/res/data';

const readJson = (name) => JSON.parse(readFileSync(`${DATA}/${name}.json`, 'utf8'));
const generals = readJson('generals');
const magics = readJson('magics');
const wises = readJson('wises');
const garrison = readJson('garrison')[1];
const scenario = readJson('scenarios')[1];

const PLAYER = '劉備';
const cities = scenario.cities;
const ownerOf = (city) => {
  const rec = garrison.cities[city];
  return rec && typeof rec.owner === 'string' ? rec.owner : '';
};
const officersByCity = {};
for (const city of cities) officersByCity[city.NAME] = garrison.cities[city.NAME]?.officers ?? [];
const owned = cities.filter((c) => ownerOf(c.NAME) === PLAYER).map((c) => c.NAME);
const save = { force: PLAYER, king: PLAYER, owned };

const rows = GB.buildBook({ generals, magics, wises, save, officersByCity, ownerOf, scenIdx: 1 });
const rowOf = new Map(rows.map((r) => [r.name, r]));
const rawOf = new Map(generals.map((g) => [g.NAME, g]));

let total = 0;
let failed = 0;
const ok = (label, cond, actual) => {
  total += 1;
  if (cond) {
    console.log(`  PASS  ${label}`);
    return true;
  }
  failed += 1;
  console.log(`  FAIL  ${label}${actual === undefined ? '' : `  → ${JSON.stringify(actual)}`}`);
  return false;
};
const same = (label, expected, actual) => ok(`${label}（期望 ${JSON.stringify(expected)}）`, JSON.stringify(expected) === JSON.stringify(actual), actual);

console.log(`fixture：劇本 index 1 · ${PLAYER} ${owned.length} 城 · ${generals.length} 將 · 名冊 ${rows.length} 行`);

/* ① 淳于瓊 */
console.log('\n── ① 淳于瓊（P1-6 的樣本）──');
const chunyu = rowOf.get('淳于瓊');
same('① 淳于瓊 status = 野', '野', chunyu.status);
same('① 淳于瓊 statusText = 在野', '在野', chunyu.statusText);
same('① 淳于瓊 所屬城 = 平原', '平原', chunyu.city);
same('① 淳于瓊 不計入在職', false, chunyu.status === '登');

/* ② 舊兜底確實性 */
console.log('\n── ② 舊兜底（rec.Status）確實會錯 ──');
const rawChunyu = rawOf.get('淳于瓊');
same("② generals.json 靜態 Status = 登", '登', rawChunyu.Status);
same('② status_by_times[1] = 野', '野', rawChunyu.status_by_times[1]);
same('② CityModel.statusOf 口徑（與 OfficersOfCity 同源）= 野', '野', (await import('./_sim/CityModel.js')).statusOf(rawChunyu, 1));

/* ③ 全量逐將比對運行時口徑 */
console.log('\n── ③ 401 將逐將比對（名冊 vs 運行時口徑）──');
const norm = (s) => (s === '登' || s === '1' ? '登' : s === '俘' || s === '2' ? '俘' : s === '野' || s === '8' ? '野' : '未');
const officerStatus = new Map();
for (const list of Object.values(officersByCity)) {
  for (const o of list) if (o && o.name) officerStatus.set(o.name, String(o.status ?? ''));
}
let mismatch = 0;
const bad = [];
for (const raw of generals) {
  const row = rowOf.get(raw.NAME);
  const expected = norm(officerStatus.has(raw.NAME) ? officerStatus.get(raw.NAME) : (raw.status_by_times?.[1] ?? raw.Status));
  if (row.status !== expected) {
    mismatch += 1;
    bad.push(`${raw.NAME}: book=${row.status} expected=${expected}`);
  }
}
ok('③ 401 行狀態全部與運行時口徑一致', mismatch === 0, bad.slice(0, 5));

/* ④ 平原守將分布 */
console.log('\n── ④ 平原守將分布（garrison.json 7 人）──');
const plainRows = rows.filter((r) => r.city === '平原');
same('④ 平原在冊人數 = 7', 7, plainRows.length);
same('④ 平原 在職數 = 4', 4, plainRows.filter((r) => r.status === '登').length);
same('④ 平原 在野數 = 3', 3, plainRows.filter((r) => r.status === '野').length);
console.log('        ' + plainRows.map((r) => `${r.name}(${r.statusText})`).join(' · '));

console.log('\n==============================================');
console.log(`斷言 ${total} 條，通過 ${total - failed}，失敗 ${failed}`);
if (failed === 0) console.log('item7 全部通過 ✅');
else console.log(`item7 有 ${failed} 條失敗 ❌`);
process.exitCode = failed === 0 ? 0 : 1;
