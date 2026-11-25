// @ts-nocheck —— 被测模块 web/city_model.js / web/saves.js 是浏览器端无类型 ESM（tsconfig 没有 allowJs）；
// 本文件按 node:test 跑运行时断言，写法同 tests/city_rules.test.ts，断言一律 assert/strict。
//
// R19 假绿守护：37a 的「Rate=0 的 5–6 件（Seq14-17 武器、Seq56 馬）永遠搜不到」当年是 ✅，
// 但 capture.test.ts 只测过战后 dropWeight 把 Rate=0 折成 0，**从来没有**测过搜索轮盘。
// 本文件钉的是：
//   - 五件死槽（直劍/短錐槍/銅殳/眉尖刀/黃鬃馬）不進任何池、300 抽 0 次；
//   - Rate 的 0 / 1 分界（0、-1、空字串、NaN 一律剔除；1 保留）；
//   - 池裡只有 Rate=0 時：每次都抽 none、foundItems 不增，但 200 金照扣（不是靜默跳過）；
//   - 反向：補一件 Rate=1 的寶物後真的抽得到（證明上面的 none 不是「輪盤整體壞了」）。

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
const cdef = (name) => S0.cities.find((c) => c.NAME === name);

/** docs/04b2 §5.5 點名的五件 Rate=0（名稱一起釘，防止資料表把 Rate 改回 >0） */
const DEAD = [
  [14, '直劍'], [15, '短錐槍'], [16, '銅殳'], [17, '眉尖刀'], [56, '黃鬃馬'],
];

const mkItem = (seq, rate, st, extra = {}) => ({
  Sequence: seq, Name: `測試${seq}`, Rate: rate, SearchType: st, TYPE: 'JEWEL_WEAPON',
  Force: 0, Battle: 0, Loyal: 0, Attrib: '', Level: 1, ...extra,
});

function fresh() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  save.gold = 1e9;
  return save;
}

function draws(save, items, n, bag = [], generals = []) {
  const out = [];
  for (let i = 0; i < n; i++) {
    save.month = i + 1;
    out.push(M.search(save, cdef('代縣'), { generals, scenario: S0, scenIdx: 0, items, wises: WISES, bag }));
  }
  return out;
}

// ---------------------------------------------------------------- 五件死槽
test('R19 五件 Rate=0 死槽：不進任何池，300 抽 0 次（Seq14-17 武器 + Seq56 馬）', () => {
  const zero = ITEMS.filter((i) => Number(i.Rate) <= 0).sort((a, b) => a.Sequence - b.Sequence);
  assert.deepEqual(zero.map((i) => [Number(i.Sequence), i.Name]), DEAD, 'Rate=0 的品項與名稱');

  const pools = M.searchPools(ITEMS);
  const poolSeqs = new Set([...pools.talisman, ...pools.treasure].map((i) => Number(i.Sequence)));
  for (const [seq, name] of DEAD) {
    assert.equal(poolSeqs.has(seq), false, `${name}（${seq}）不得進池`);
  }

  // 端到端：300 抽（每次換 month，避開 searchLog 上限 60 的種子固定）
  const save = fresh();
  const rs = draws(save, ITEMS, 300, [], GENS);
  for (const [seq, name] of DEAD) {
    assert.equal(rs.filter((r) => Number(r.seq) === seq).length, 0, `${name}（${seq}）居然被抽到了`);
    assert.equal(save.foundItems.some((s) => Number(s) === seq), false, `${name} 不得進 foundItems`);
  }
});

// ---------------------------------------------------------------- 0/1 邊界
test('R19 Rate 邊界：0 / -1 / 空字串 / NaN 一律剔除，只有 Rate>=1 才進池', () => {
  const items = [
    mkItem(601, 0, 1),
    mkItem(602, -1, 0, { Force: 5 }),
    mkItem(603, '', 2),
    mkItem(604, NaN, 1),
    mkItem(605, 1, 1),
  ];
  const pools = M.searchPools(items);
  const all = [...pools.talisman, ...pools.treasure].map((i) => Number(i.Sequence));
  assert.deepEqual(all, [605], '五件裡只有 Rate=1 那件能進池');
  assert.equal(pools.talisman.length, 0, 'Rate=-1 的法寶也不得進池');

  const save = fresh();
  const rs = draws(save, items, 200);
  for (const seq of [601, 602, 603, 604]) {
    assert.equal(rs.filter((r) => Number(r.seq) === seq).length, 0, `Rate<=0 的 ${seq} 不得被抽到`);
  }
  assert.ok(rs.some((r) => Number(r.seq) === 605), 'Rate=1 的 605 應有機會被抽到');
});

// ---------------------------------------------------------------- 池空 → none
test('R19 池裡只有 Rate=0：每抽都是 none、foundItems 不增，但 200 金照扣', () => {
  const deadItems = ITEMS.filter((i) => Number(i.Rate) <= 0);
  assert.equal(deadItems.length, 5);

  const save = fresh();
  const gold0 = save.gold;
  const rs = draws(save, deadItems, 30);
  assert.equal(rs.every((r) => r.kind === 'none'), true, '池空時只能抽 none');
  assert.equal(rs.every((r) => r.seq === undefined), true, 'none 不得帶物品序號');
  assert.equal(save.foundItems.length, 0, 'foundItems 不得增加');
  assert.equal(gold0 - save.gold, 30 * M.SEARCH.COST, '每次搜索仍要扣 200 金（不是靜默跳過）');
  assert.equal(M.SEARCH.COST, 200);

  // 反向對照：池裡補一件 Rate=1 的寶物 → 真的抽得到，金也照扣
  const alive = [...deadItems, mkItem(901, 1, 1)];
  const gold1 = save.gold;
  const rs2 = draws(save, alive, 40);
  assert.ok(rs2.filter((r) => Number(r.seq) === 901).length >= 1, '補上 Rate=1 後應抽得到 901');
  assert.equal(save.foundItems.filter((s) => Number(s) === 901).length, 1);
  assert.equal(gold1 - save.gold, 40 * M.SEARCH.COST);
});

// ---------------------------------------------------------------- 真實資料反向
test('R19 真實 300 抽：五件死槽 0 次，其餘至少 15 種物品能抽到且 Rate 全 > 0', () => {
  const save = fresh();
  const rs = draws(save, ITEMS, 300, [], GENS);
  const got = new Set(rs.map((r) => Number(r.seq)).filter((s) => Number.isFinite(s)));
  const deadSeqs = new Set(DEAD.map(([s]) => s));
  for (const s of got) assert.equal(deadSeqs.has(s), false, `死槽 ${s} 出現在抽取結果裡`);
  assert.ok(got.size >= 15, `輪盤應能抽到多種物品（實際 ${got.size} 種）`);
  for (const s of got) {
    const it = ITEMS.find((i) => Number(i.Sequence) === s);
    assert.ok(it, `抽到的 ${s} 必須在物品表裡`);
    assert.ok(Number(it.Rate) > 0, `抽到的 ${s} Rate 必須 >0（實際 ${it.Rate}）`);
  }
  assert.ok(save.foundItems.length >= Math.min(got.size, 1), 'foundItems 應記錄抽到的物品');
});
