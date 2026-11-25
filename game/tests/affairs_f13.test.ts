// @ts-nocheck
// 理由：直接驅動 web/saves.js、web/city_model.js（瀏覽器端 JS，無 .ts 型別來源），
// 斷言全在執行期由 node:test 驗；型別嚴格檢查留給 src/**。
/**
 * affairs_f13.test.ts — F13「錢變兵」回歸測試（內政/經濟修復第一條）
 *
 * 跑法：  cd game && node --test tests/affairs_f13.test.ts
 *
 * 原作口徑（project/210_原作战斗流程规格.md §1、work/flow_audit/内政大地图_差异.md L122-124）：
 *   城里每 100 金钱 = 1 预备兵，随时间自动转换，直到钱花光或兵满。
 *   n = min(floor(money / 100), prepCap − prep) ; money -= n*100 ; prep += n
 *
 * 覆蓋：
 *   1. 取整（250 金 → 2 兵、剩 50 金）
 *   2. 上限（預備兵快滿時只補到上限，金只扣實際轉換的數量）
 *   3. 清零（0 金 / 不足 100 金 → 不轉換）
 *   4. 換月結算（autonomyTick 預設走錢變兵，且**不再**白補 10%）
 *   5. ?loose=1 對照仍走舊的 refillPrep（10%）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Saves from '../web/saves.js';
import * as M from '../web/city_model.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');
const ITEMS = readJson('../data/items.json');
const WISES = readJson('../data/wises.json');
const S0 = SCEN[0];
const ctx = () => ({ generals: GENS, scenario: S0, scenIdx: 0, items: ITEMS, wises: WISES });
const cdef = (n) => S0.cities.find((c) => c.NAME === n);
const CITY = '襄平';

function fresh() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  return save;
}

/* ---------------------------------------------------------------- 1. 取整 */
test('F13 錢變兵：250 金 → 2 預備兵，剩 50 金（向下取整）', () => {
  const save = fresh();
  const def = cdef(CITY);
  const st = save.cities[CITY];
  st.money = 250;
  st.prep = 0;
  const cap = M.prepStateOf(save, def).cap;
  const r = M.prepFromMoney(save, def);
  assert.equal(r.ok, true);
  assert.equal(r.n, 2, 'floor(250/100) = 2');
  assert.equal(r.cost, 200);
  assert.equal(st.money, 50, '只扣實際轉換的 200 金');
  assert.equal(st.prep, 2);
  assert.equal(r.cap, cap);
});

/* ---------------------------------------------------------------- 2. 上限 */
test('F13 錢變兵：預備兵只剩 1 的空間時，只轉 1 個、金只扣 100', () => {
  const save = fresh();
  const def = cdef(CITY);
  const st = save.cities[CITY];
  const cap = M.prepStateOf(save, def).cap;
  st.prep = cap - 1;
  st.money = 99999;
  const r = M.prepFromMoney(save, def);
  assert.equal(r.n, 1, 'n = min(floor(money/100), cap-prep) → 被 cap 夾住');
  assert.equal(st.prep, cap, '補到上限為止');
  assert.equal(st.money, 99999 - 100, '只扣 100 金，不是全部');
});

/* ---------------------------------------------------------------- 3. 清零 */
test('F13 錢變兵：0 金與不足 100 金都不轉換', () => {
  const save = fresh();
  const def = cdef(CITY);
  const st = save.cities[CITY];
  st.prep = 0;

  st.money = 0;
  let r = M.prepFromMoney(save, def);
  assert.equal(r.ok, true);
  assert.equal(r.n, 0);
  assert.equal(st.prep, 0);
  assert.equal(st.money, 0);

  st.money = 99;
  r = M.prepFromMoney(save, def);
  assert.equal(r.n, 0, '99 金不足 1 個預備兵');
  assert.equal(st.money, 99, '不轉換就不扣金');
});

test('F13 錢變兵：預備兵已滿時金完全不動', () => {
  const save = fresh();
  const def = cdef(CITY);
  const st = save.cities[CITY];
  const cap = M.prepStateOf(save, def).cap;
  st.prep = cap;
  st.money = 5000;
  const r = M.prepFromMoney(save, def);
  assert.equal(r.n, 0);
  assert.equal(st.money, 5000);
  assert.equal(st.prep, cap);
});

/* ------------------------------------------------- 4. 換月結算（預設線） */
test('F13 換月：autonomyTick 預設把金換成預備兵，不再白補 10%', () => {
  const save = fresh();
  const def = cdef(CITY);
  const st = save.cities[CITY];
  const cap = M.prepStateOf(save, def).cap;
  // 先把預備兵壓到 0、金給 500：舊設計（10%）會白補 max(1,floor(cap*0.1)) 且不花金
  st.prep = 0;
  st.money = 500;
  save.month = 2;
  const t = M.autonomyTick(save, S0.cities, ctx());
  assert.equal(t.first, true, '首次 tick 的 first 語義不變');
  assert.equal(save.autoMonth, 2);
  const row = t.refilled.find((x) => x.city === CITY);
  assert.ok(row, 'refilled 仍要含這座城（城市列表靠它）');
  assert.equal(row.kind, 'money', '走的是錢變兵而不是 refillPrep');
  assert.equal(row.gained, 5, '500 金 → 5 預備兵');
  assert.equal(st.prep, 5);
  assert.equal(st.money, 0, '錢全部換成兵');
  assert.notEqual(row.gained, Math.max(1, Math.floor(cap * 0.1)), '不能是舊的 10% 白補');

  // 同月再 tick 一次：不重複結算
  const t2 = M.autonomyTick(save, S0.cities, ctx());
  assert.equal(t2.refilled.length, 0);
  assert.equal(t2.auto, null);
});

/* ------------------------------------------------- 5. ?loose=1 對照開關 */
test('F13 ?loose=1：refillPrep 舊行為（10%）仍可用來對照', () => {
  const save = fresh();
  const def = cdef(CITY);
  const st = save.cities[CITY];
  const cap = M.prepStateOf(save, def).cap;
  st.prep = 0;
  st.money = 500;
  st.prepMonth = 0; // 舊函式第一次只記帳
  save.month = 2;
  const t = M.autonomyTick(save, S0.cities, ctx(), { loose: true });
  const row = t.refilled.find((x) => x.city === CITY);
  assert.ok(row);
  assert.equal(row.kind, undefined, 'loose 走舊路徑，不帶 kind=money');
  assert.equal(st.money, 500, '舊路徑不花金');
  // refillPrep 首次（prepMonth=0）只記帳不補兵
  assert.equal(row.gained, 0);
  const t2 = M.autonomyTick(save, S0.cities, ctx(), { loose: true });
  assert.equal(t2.refilled.length, 0, '同月不再結算');
});
