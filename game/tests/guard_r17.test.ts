// @ts-nocheck —— 被测模块 web/city_model.js 是浏览器端无类型 ESM（tsconfig 没有 allowJs）；
// 本文件按 node:test 跑运行时断言，写法同 tests/city_rules.test.ts，断言一律 assert/strict。
//
// R17 假绿守护：37a 的「128 槽輪盤 0x408EE2，權重 Rate，SearchType 0/1/2 決定等級窗」当年是 ✅，
// 但没有任何测试断言过槽位数、池分区、权重比例、可抽次数上限。本文件钉的是**可证伪的行为**：
//   - 128 槽帳本：物品表 77 件（Sequence 1..77）+ 5 件 Rate=0 死槽 + 51 空槽 = 128；
//   - 池分区：Force/Battle>0 且 ST0 → 法寶；ST1/2 → 寶物；ST0 的 JEWEL_THING/Loyal → 寶物；其餘不進池；
//   - 權重：兩件 Rate 1 / 9 的寶物，抽取次數比 ≈1:9（不是等概率）；
//   - 次數上限：ONLYONE 全局只出 1 次，非 ONLYONE 可重複，已擁有 → 0 次。
// 注：原作 §5.3 的「SearchType 決定等級窗」在本移植裡**沒有實作**（searchPools 不看 Level），
// 這條屬於實作缺口而不是測試缺口，報告 `project/65_假绿守护.md` 單列，不在本文件假裝守護。

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

/** 空世界（無野將 → talent 權重歸零），只留物品輪盤 */
const ctxWith = (items, bag = []) => ({ generals: [], scenario: S0, scenIdx: 0, items, wises: WISES, bag });

function fresh() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  save.gold = 1e9;
  return save;
}

/** 搜 n 次（每次都換 month，避開 searchLog 上限 60 導致種子固定） */
function draws(save, items, n, bag = []) {
  const out = [];
  for (let i = 0; i < n; i++) {
    save.month = i + 1;
    out.push(M.search(save, cdef('代縣'), ctxWith(items, bag)));
  }
  return out;
}

const mkItem = (seq, rate, st, extra = {}) => ({
  Sequence: seq, Name: `測試${seq}`, Rate: rate, SearchType: st, TYPE: 'JEWEL_WEAPON',
  Force: 0, Battle: 0, Loyal: 0, Attrib: '', Level: 1, ...extra,
});

// ---------------------------------------------------------------- 槽數帳本
test('R17 128 槽輪盤帳本：77 件有碼 + 5 件 Rate=0 死槽 + 51 空槽 = 128', () => {
  assert.equal(ITEMS.length, 77, '物品表件數');
  const seqs = ITEMS.map((i) => Number(i.Sequence));
  assert.equal(new Set(seqs).size, 77, 'Sequence 必須唯一（下標即槽號）');
  for (const s of seqs) assert.ok(Number.isInteger(s) && s >= 1 && s <= 127, `Sequence ${s} 必須在 1..127（0 保留）`);

  const zero = ITEMS.filter((i) => Number(i.Rate) <= 0);
  assert.deepEqual(zero.map((i) => Number(i.Sequence)).sort((a, b) => a - b), [14, 15, 16, 17, 56],
    'Rate=0 的五件：直劍/短錐槍/銅殳/眉尖刀/黃鬃馬');

  const pools = M.searchPools(ITEMS);
  const poolSeqs = [...pools.talisman, ...pools.treasure].map((i) => Number(i.Sequence));
  assert.equal(new Set(poolSeqs).size, poolSeqs.length, '兩池不得重複收同一件');
  assert.equal(poolSeqs.length, 72, '可抽池 = 77 - 5 件死槽');
  // 帳本：可抽 72 槽 + 死槽 5 + 空槽（128 - 77）51 = 128
  assert.equal(poolSeqs.length + zero.length + (128 - ITEMS.length), 128);

  // 反向：五件死槽一件都不得混進池裡；其餘 72 件必須全在池裡（不重不漏）
  for (const s of [14, 15, 16, 17, 56]) assert.equal(poolSeqs.includes(s), false, `Rate=0 的 ${s} 不得進池`);
  const eligible = ITEMS.filter((i) => Number(i.Rate) > 0).map((i) => Number(i.Sequence)).sort((a, b) => a - b);
  assert.deepEqual([...poolSeqs].sort((a, b) => a - b), eligible, '所有 Rate>0 的物品都要能抽到');
});

// ---------------------------------------------------------------- 池分區
test('R17 池分區：ST0 特殊欄位→法寶、ST1/2→寶物，其餘不進池（不重不漏）', () => {
  /** 依 docs/04b2 §5.3 + city_model.searchPools 的規則獨立重算一遍，當作金標準 */
  function expectPool(it) {
    if (!(Number(it.Rate) > 0)) return null;
    const group = Number(it.SearchType) || 0;
    if (Number(it.Force) > 0 || Number(it.Battle) > 0) return group === 0 ? 'talisman' : null;
    if (group === 1 || group === 2) return 'treasure';
    if (it.TYPE === 'JEWEL_THING' || Number(it.Loyal) > 0) return 'treasure';
    return null;
  }
  const pools = M.searchPools(ITEMS);
  const actual = new Map();
  for (const it of pools.talisman) actual.set(Number(it.Sequence), 'talisman');
  for (const it of pools.treasure) actual.set(Number(it.Sequence), 'treasure');

  for (const it of ITEMS) {
    const seq = Number(it.Sequence);
    assert.equal(actual.get(seq) ?? null, expectPool(it), `物品 ${seq}（${it.Name}）分區錯誤`);
  }
  assert.equal(pools.talisman.length, 22, '法寶池 22 件');
  assert.equal(pools.treasure.length, 50, '寶物池 50 件');

  // 反向邊界：ST0、無 Force/Battle/Loyal、TYPE 也不是 JEWEL_THING → 兩個池都不收
  const orphan = mkItem(501, 5, 0, { TYPE: 'JEWEL_WEAPON' });
  const p = M.searchPools([orphan]);
  assert.equal(p.talisman.length, 0);
  assert.equal(p.treasure.length, 0, 'ST0 普通武器不該被塞進寶物池');
  // 對照：同一件加上 Force>0 就進法寶池
  assert.equal(M.searchPools([{ ...orphan, Force: 3 }]).talisman.length, 1);
});

// ---------------------------------------------------------------- 權重
test('R17 Rate 權重：Rate 2 與 Rate 18 的抽取次數比 ≈1:9（800 抽）', () => {
  const a = mkItem(201, 2, 1);
  const b = mkItem(202, 18, 1);
  const dead = mkItem(203, 0, 1); // Rate=0 不得被抽到
  const save = fresh();
  const rs = draws(save, [a, b, dead], 800);
  const treasure = rs.filter((r) => r.kind === 'treasure');
  const nA = treasure.filter((r) => r.seq === 201).length;
  const nB = treasure.filter((r) => r.seq === 202).length;
  const nDead = rs.filter((r) => r.seq === 203).length;

  assert.equal(nDead, 0, 'Rate=0 的物品永遠不該被抽到');
  assert.equal(nA + nB, treasure.length, '寶物抽取只能落在這兩件上');
  assert.ok(treasure.length >= 340 && treasure.length <= 460, `寶物/無 各 25 權重 → 約一半，實際 ${treasure.length}/800`);
  assert.ok(nA > 0 && nB > 0, `兩件都要出得來（Rate1=${nA}, Rate9=${nB}）`);
  // 期望 40 / 360；權重若被改成等概率會落在 ~200/~200（比值 1），這裡守 [5, 15]
  assert.ok(nA >= 20 && nA <= 75, `Rate=2 的抽取次數 ${nA} 偏離 10% 太遠`);
  const ratio = nB / nA;
  assert.ok(ratio >= 5 && ratio <= 15, `Rate 9:1 的權重比應 ≈9，實際 ${ratio.toFixed(2)}`);
});

// ---------------------------------------------------------------- 次數上限
test('R17 抽取上限：ONLYONE 全局只出 1 次，非 ONLYONE 可重複，已擁有 → 0 次', () => {
  const only = mkItem(301, 1000000, 1, { Attrib: 'ONLYONE' });
  const normal = mkItem(302, 1, 1);
  const save = fresh();
  const rs = draws(save, [only, normal], 120);
  const nOnly = rs.filter((r) => r.seq === 301).length;
  const nNormal = rs.filter((r) => r.seq === 302).length;

  assert.equal(nOnly, 1, 'ONLYONE 物品全局只能抽到 1 次');
  assert.ok(nNormal >= 3, `非 ONLYONE 可以重複抽到（實際 ${nNormal} 次）`);
  assert.equal(save.foundItems.filter((s) => Number(s) === 301).length, 1, 'foundItems 不得重複記同一件');
  assert.equal(M.searchPools([only, normal], save.foundItems).talisman.length, 0);
  assert.equal(M.searchPools([only, normal], save.foundItems).treasure.length, 1, '已擁有的 ONLYONE 被剔除後只剩普通件');

  // 邊界 0：一開始就擁有 ONLYONE → 120 抽裡 0 次，但普通件照出
  const save2 = fresh();
  const rs2 = draws(save2, [only, normal], 60, [301]);
  assert.equal(rs2.filter((r) => r.seq === 301).length, 0, '已擁有的 ONLYONE 不得再出');
  assert.ok(rs2.filter((r) => r.seq === 302).length >= 2);
});
