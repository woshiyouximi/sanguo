/**
 * 開局三殼的純邏輯驗證（不需要 Creator）：劇本卡 / 勢力表 / RunSetup / 存檔槽文案 / 存讀檔。
 *
 * 跑法：`cd F:\sanguo\work\cocos_select; node model_assert.mjs`
 * 前置：`node ..\..\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json`
 * 執行期 `cc` 用 `_sim/node_modules/cc`（mock，補了 Color.fromHEX / director.loadScene）。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const M = require('./_sim/SelectModel.js');
const R = require('./_sim/RunSetup.js');
const S = require('./_sim/SaveSlots.js');

const DATA_FILE = fileURLToPath(new URL('../../game/cocos/assets/bundles/res/data/scenarios.json', import.meta.url));
const scenarios = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const data = { scenarios };
const storage = cc.__storage;
/** `SaveSlots` 要的是 `{getItem,setItem,removeItem}`；`cc.__storage` 是 Map，兩者分開用。 */
const slotStorage = cc.sys.localStorage;

let total = 0;
const failures = [];
const lines = [];

function ok(label, cond, actual) {
  total += 1;
  if (cond) {
    lines.push(`PASS ${label}${actual === undefined ? '' : ` (${JSON.stringify(actual)})`}`);
  } else {
    failures.push(`${label} — actual=${JSON.stringify(actual)}`);
    lines.push(`FAIL ${label} — actual=${JSON.stringify(actual)}`);
  }
}
function same(label, expected, actual) {
  ok(label, JSON.stringify(expected) === JSON.stringify(actual), actual);
}
function includes(label, haystack, needle) {
  ok(label, String(haystack).includes(needle), haystack);
}
function group(name) {
  lines.push('');
  lines.push(`== ${name} ==`);
}

function clearStorage() {
  storage.clear();
}

/* ====================================================================== */
group('§1 劇本卡（5 套）');
/* ====================================================================== */

const cards = M.scenarioCards(data);
same('cards.length', 5, cards.length);
same('scenarioCards(null) 不炸', [], M.scenarioCards(null));
same('scenarioCards({}) 不炸', [], M.scenarioCards({}));

const EXPECT = [
  { year: 184, name: '黃巾之亂', kings: 15, cities: 60, playable: 14, owned: 21 },
  { year: 189, name: '討伐董卓', kings: 19, cities: 60, playable: 18, owned: 27 },
  { year: 200, name: '群雄割據', kings: 9, cities: 60, playable: 8, owned: 36 },
  { year: 208, name: '赤壁之戰', kings: 9, cities: 60, playable: 8, owned: 35 },
  { year: 219, name: '三國鼎立', kings: 6, cities: 60, playable: 5, owned: 41 },
];

for (let i = 0; i < EXPECT.length; i += 1) {
  const card = cards[i];
  const exp = EXPECT[i];
  same(`劇本${i + 1} 名稱`, exp.name, card.name);
  same(`劇本${i + 1} 年份`, exp.year, card.year);
  same(`劇本${i + 1} 勢力數＝system.TotalKing`, exp.kings, card.forceCount);
  same(`劇本${i + 1} 城池數`, exp.cities, card.cityCount);
  same(`劇本${i + 1} 道路數`, scenarios[i].paths.length, card.pathCount);
  same(`劇本${i + 1} 開局三城`, 3, card.opening.length);
  ok(`劇本${i + 1} 開局三城有名`, card.opening.every((n) => typeof n === 'string' && n.length > 0), card.opening);
  same(
    `劇本${i + 1} 開局三城＝資料前三城`,
    scenarios[i].cities.slice(0, 3).map((c) => String(c.NAME ?? '').trim()),
    card.opening,
  );
  includes(`劇本${i + 1} 卡片文案有年份`, `${card.year} 年 · ${card.forceCount} 勢力 · ${card.cityCount} 城`, `${exp.year} 年 · ${exp.kings} 勢力 · 60 城`);
}

/* ====================================================================== */
group('§2 勢力表（城池 KING + kings[] 補 0 城）');
/* ====================================================================== */

for (let i = 0; i < EXPECT.length; i += 1) {
  const scenario = scenarios[i];
  const forces = M.scenarioForces(scenario);
  const exp = EXPECT[i];
  same(`劇本${i + 1} 勢力列數`, exp.kings, forces.length);
  same(`劇本${i + 1} 有城勢力數`, exp.playable, forces.filter((f) => f.selectable).length);
  ok(
    `劇本${i + 1} 無純數字髒勢力`,
    forces.every((f) => !/^[0-9]+$/.test(f.name)),
    forces.map((f) => f.name).filter((n) => /^[0-9]+$/.test(n)),
  );
  ok(
    `劇本${i + 1} 0 城勢力一律不可選`,
    forces.every((f) => f.cityCount > 0 || !f.selectable),
    forces.filter((f) => f.cityCount === 0).map((f) => [f.name, f.selectable]),
  );
  same(`劇本${i + 1} 各勢力城數總和（有主之城）`, exp.owned, forces.reduce((sum, f) => sum + f.cityCount, 0));
  ok(`劇本${i + 1} 有主之城 < 60（其餘是空 KING 空城）`, forces.reduce((sum, f) => sum + f.cityCount, 0) < exp.cities);
  ok(`劇本${i + 1} 每行名字非空`, forces.every((f) => f.name.length > 0));
  ok(`劇本${i + 1} 每行城池列表非空或有 0 城標記`, forces.every((f) => f.cities.length > 0 || f.cityCount === 0));
}

const s1 = M.scenarioForces(scenarios[0]);
same('劇本1 第 15 家是 0 城的盜賊', { name: '盜賊', cities: 0, selectable: false }, {
  name: s1[14].name,
  cities: s1[14].cityCount,
  selectable: s1[14].selectable,
});
same('劇本1 第一名是公孫瓚', '公孫瓚', s1[0].name);
same('defaultForceName(劇本1)', '公孫瓚', M.defaultForceName(scenarios[0]));
same('defaultForceName(劇本3)', '袁紹', M.defaultForceName(scenarios[2]));
same('defaultForceName(null) 不炸', '', M.defaultForceName(null));
ok('scenarioForces 過濾空 KING', M.scenarioForces(scenarios[0]).every((f) => f.name !== ''));

/* ====================================================================== */
group('§3 剧本查询 / 分页');
/* ====================================================================== */

for (let i = 0; i < EXPECT.length; i += 1) {
  same(`matchScenarioIndex(${EXPECT[i].name})`, i, M.matchScenarioIndex(data, EXPECT[i].name));
}
same('matchScenarioIndex 未知劇本', -1, M.matchScenarioIndex(data, '不存在的劇本'));
same('matchScenarioIndex(null) 不炸', -1, M.matchScenarioIndex(null, '黃巾之亂'));
same('pageCount(15,8)', 2, M.pageCount(15, 8));
same('pageCount(0,8)', 1, M.pageCount(0, 8));
same('clampPage(-1)', 0, M.clampPage(-1, 15, 8));
same('clampPage(9)', 1, M.clampPage(9, 15, 8));
same('pageSlice(1) 長度', 7, M.pageSlice(s1, 1, 8).length);
same('pageSlice 第 2 頁首行', s1[8].name, M.pageSlice(s1, 1, 8)[0].name);

/* ====================================================================== */
group('§4 RunSetup（單例 + localStorage 兜底）');
/* ====================================================================== */

clearStorage();
R.resetRunCache();
same('空 storage：scenarioIndex 回落 0', 0, R.scenarioIndex());
same('空 storage：playerForce 回落公孫瓚', '公孫瓚', R.playerForce());
same('空 storage：readRun 形狀', { scenarioIndex: 0, playerForce: '公孫瓚' }, R.readRun());

const picked = R.setRunSelection(2, '孫權');
same('寫入後回傳值', { scenarioIndex: 2, playerForce: '孫權' }, picked);
same('寫入後 scenarioIndex', 2, R.scenarioIndex());
same('寫入後 playerForce', '孫權', R.playerForce());
const rawRun = JSON.parse(storage.get('sanguo_run_v1'));
same('localStorage 版本', 1, rawRun.v);
same('localStorage 勢力', '孫權', rawRun.playerForce);
ok('選中勢力能在劇本3 的勢力表找到', M.scenarioForces(scenarios[2]).some((f) => f.name === '孫權' && f.selectable));

same('sanitize 負數', 0, R.sanitizeSelection({ scenarioIndex: -3, playerForce: '曹操' }).scenarioIndex);
same('sanitize 超界', 0, R.sanitizeSelection({ scenarioIndex: 99, playerForce: '曹操' }).scenarioIndex);
same('sanitize 空勢力名', '公孫瓚', R.sanitizeSelection({ scenarioIndex: 1, playerForce: '   ' }).playerForce);
same('sanitize 非字串勢力', '公孫瓚', R.sanitizeSelection({ scenarioIndex: 1, playerForce: 42 }).playerForce);
same('sanitize null 不炸', { scenarioIndex: 0, playerForce: '公孫瓚' }, R.sanitizeSelection(null));

R.resetRunCache();
storage.set('sanguo_run_v1', '{壞掉的 JSON');
same('壞 JSON：不拋、回落劇本 1', 0, R.scenarioIndex());
same('壞 JSON：回落公孫瓚', '公孫瓚', R.playerForce());

R.resetRunCache();
storage.set('sanguo_run_v1', JSON.stringify({ v: 1, scenarioIndex: '2', playerForce: '曹操' }));
same('字串 index 收斂成數字', 2, R.scenarioIndex());
same('字串 index 後勢力仍正確', '曹操', R.playerForce());

R.resetRunCache();
const throwingStorage = {
  getItem() {
    throw new Error('privacy mode');
  },
  setItem() {
    throw new Error('quota');
  },
  removeItem() {
    throw new Error('nope');
  },
};
same('getItem 丟錯：回落 0', 0, R.readRun(throwingStorage).scenarioIndex);
const written = R.writeRun({ scenarioIndex: 3, playerForce: '劉備' }, throwingStorage);
same('setItem 丟錯：記憶體仍生效', { scenarioIndex: 3, playerForce: '劉備' }, written);
same('setItem 丟錯：讀回仍生效', '劉備', R.playerForce());

R.clearRun();
same('clearRun 後回落 0', 0, R.scenarioIndex());
R.setScenarioCount(3);
R.resetRunCache();
storage.set('sanguo_run_v1', JSON.stringify({ v: 1, scenarioIndex: 4, playerForce: '曹操' }));
same('setScenarioCount(3) 後超界回落', 0, R.scenarioIndex());
R.setScenarioCount(5);

/* ====================================================================== */
group('§5 存檔槽摘要行（slotLines）');
/* ====================================================================== */

const emptyLines = S.slotLines(null, 10, 1);
same('空槽 l1', '槽 10', emptyLines.l1);
includes('空槽 l2 提示', emptyLines.l2, '空槽');
same('空槽 l3', '', emptyLines.l3);

const meta = {
  monarch: '曹操',
  cities: 9,
  month: 25,
  monthText: '第3年1月',
  wins: 4,
  losses: 2,
  generals: 17,
  scenario: '赤壁之戰',
  name: '試存檔',
};
const record = { at: Date.UTC(2026, 0, 2, 3, 4, 0), meta };
const filled = S.slotLines(record, 3, 3);
same('有檔 l1 含槽/名/使用中', '槽 3 · 試存檔 · 使用中', filled.l1);
ok('有檔 l2 格式', /^第3年1月 · 城9 · 4勝2敗 · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(filled.l2), filled.l2);
same('有檔 l3', '君主曹操 · 將17', filled.l3);
ok('非使用中槽不帶「使用中」', !S.slotLines(record, 4, 3).l1.includes('使用中'), S.slotLines(record, 4, 3).l1);
same('非法槽號 l1 回落', '槽 0', S.slotLines(null, 0, 1).l1);

const save = {
  king: '公孫瓚',
  owned: ['北平', '代縣'],
  month: 7,
  wins: 3,
  losses: 1,
  cities: { 北平: {}, 代縣: {} },
  roster: { 北平: ['張三', '李四'], 代縣: ['王五'] },
};
const m = S.metaOfSave(save, '黃巾之亂');
same('metaOfSave 君主', '公孫瓚', m.monarch);
same('metaOfSave 城數＝owned', 2, m.cities);
same('metaOfSave 月份文案', '第1年7月', m.monthText);
same('metaOfSave 將數', 3, m.generals);
same('metaOfSave 劇本', '黃巾之亂', m.scenario);
ok('dateText 格式', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(S.dateText(record.at)), S.dateText(record.at));
same('dateText(0)', '', S.dateText(0));

/* ====================================================================== */
group('§6 存讀檔：有/無存檔兩態都不崩');
/* ====================================================================== */

clearStorage();

const emptyLoad = S.loadFromSlot(1);
same('空槽讀取 ok=false', false, emptyLoad.ok);
includes('空槽讀取原因', emptyLoad.reason, '空');
same('空槽讀取 keys', 0, emptyLoad.keys.length);
same('非法槽位讀取', 0, S.loadFromSlot(99).slot);

storage.set('sanguo_campaign_v1', JSON.stringify(save));
const saved = S.saveToSlot(save, 1, { now: record.at, scenario: '黃巾之亂' });
ok('saveToSlot 回傳 record', saved !== null && saved.at === record.at, saved && saved.at);
same('存後已用槽數', 1, S.filledCount(S.readIndex()));
const afterSave = S.slotLines(S.slotRecord(S.readIndex(), 1), 1, 1);
includes('存後 l2 有城數', afterSave.l2, '城2');
same('存後 active 指向槽 1', 1, S.readIndex().active);
same('存後 l1 使用中', '槽 1 · 使用中', afterSave.l1);

const loaded = S.loadFromSlot(1);
same('讀取 ok', true, loaded.ok);
ok('讀取還原 ≥1 鍵', loaded.keys.length >= 1, loaded.keys);
ok('讀取後 campaign 仍在', typeof storage.get('sanguo_campaign_v1') === 'string');
same('讀取 meta 君主', '公孫瓚', loaded.meta ? loaded.meta.monarch : null);

ok('deleteSlot 回傳 true', S.deleteSlot(1) === true);
same('刪除後 slotRecord', null, S.slotRecord(S.readIndex(), 1));
same('刪除後已用槽數', 0, S.filledCount(S.readIndex()));

S.writePayload(slotStorage, 5, { sanguo_campaign_v1: '{壞' });
const dirty = S.loadFromSlot(5);
same('壞 payload 讀取 ok=false', false, dirty.ok);
includes('壞 payload 原因', dirty.reason, '損壞');

let loopOk = true;
for (let slot = 1; slot <= 10; slot += 1) {
  const text = S.slotLines(S.slotRecord(S.readIndex(), slot), slot, 1);
  if (!text.l1.startsWith('槽 ') || text.l2.length === 0) loopOk = false;
}
ok('10 個槽（有/無檔混合）都能出摘要行', loopOk);

/* ====================================================================== */
/* 輸出                                                                   */
/* ====================================================================== */

console.log(lines.join('\n'));
console.log('');
console.log(`斷言：${total} 條，通過 ${total - failures.length}，失敗 ${failures.length}`);
if (failures.length) {
  console.log('失敗明細：');
  for (const item of failures) console.log(` - ${item}`);
}
if (total < 40) {
  console.log(`斷言數不足 40（目前 ${total}）`);
  process.exitCode = 1;
} else {
  process.exitCode = failures.length ? 1 : 0;
}
