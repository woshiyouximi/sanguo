// @ts-nocheck —— 被测模块 web/city_model.js、web/saves.js 是浏览器端的无类型 ESM（仓库 tsconfig
// 没有 allowJs，本文件按 node:test 跑运行时断言）；写法和 tests/city_rules.test.ts 一致，
// 断言一律 assert/strict，不因跳过类型检查而放宽任何一条。
//
// R1 假绿守护：37a 的「60 城，其中 12 座關卡（RATE=0/POP=0/DEF=100/FLAGS）」在 57 报告里是 ✅，
// 但当时没有任何测试调用过 `isGate`。本文件把「哪些城是關卡」钉成可证伪的行为断言：
//   - 5 個劇本 × (12 關 + 48 非關)，關卡名單逐字對齊 docs/04c §2.2；
//   - `isGate` 的 0/1 邊界（RATE=0 或 POP=0 任一成立）與字串欄位；
//   - 下游行為：關卡**是**合法部署目標（可以打、打完可以占，project/163）、情報列要標「關卡」
//     且不得把真城標成關卡。

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

/** docs/04c §2.2：每個劇本都是同一批 12 座關卡 */
const GATE_NAMES = ['易京', '樂陵', '界橋', '壺關', '定陶', '都陽', '官渡', '筑陽', '長板', '建平', '赤壁', '合肥'];

const cdef = (name, scen = S0) => scen.cities.find((c) => c.NAME === name);
const ctx = (scen = S0, scenIdx = 0) => ({ generals: GENS, scenario: scen, scenIdx, items: ITEMS, wises: WISES });

function fresh(scen = S0) {
  const save = Saves.newCampaign(scen);
  M.ensureExtras(save);
  for (const c of scen.cities) M.ensureCityState(save, c);
  return save;
}

// ---------------------------------------------------------------- 資料層
test('R1 五個劇本各 12 關卡：名單逐字一致，其餘 48 城不得被誤判', () => {
  assert.equal(SCEN.length, 5, '應有 5 個劇本');
  const expectNames = [...GATE_NAMES].sort();
  for (const [i, scen] of SCEN.entries()) {
    const tag = `劇本 ${i + 1}`;
    assert.equal(scen.cities.length, 60, `${tag} 應有 60 城`);
    const gates = scen.cities.filter((c) => M.isGate(c));
    const others = scen.cities.filter((c) => !M.isGate(c));

    assert.equal(gates.length, 12, `${tag} 關卡數`);
    assert.equal(others.length, 48, `${tag} 非關卡數`);
    assert.deepEqual(gates.map((c) => c.NAME).sort(), expectNames, `${tag} 關卡名單與 docs/04c 不一致`);

    // 關卡欄位不變量（RATE=0 / POP=0 / DEF=100 / MONEY=0 / FLAGS=2）
    for (const g of gates) {
      assert.equal(Number(g.RATE), 0, `${tag} ${g.NAME} RATE`);
      assert.equal(Number(g.POPULATION), 0, `${tag} ${g.NAME} POPULATION`);
      assert.equal(Number(g.DEFENSE), 100, `${tag} ${g.NAME} DEFENSE`);
      assert.equal(Number(g.MONEY), 0, `${tag} ${g.NAME} MONEY`);
    }
    // 反向：真城不得帶關卡特徵（RATE>=1 且 POP>0）
    for (const c of others) {
      assert.ok(Number(c.RATE) >= 1, `${tag} ${c.NAME} 不該是關卡（RATE=${c.RATE}）`);
      assert.ok(Number(c.POPULATION) > 0, `${tag} ${c.NAME} 不該是關卡（POP=${c.POPULATION}）`);
    }
  }
});

test('R1 isGate 邊界：RATE=0 或 POP=0 任一成立即關卡（0 / 1 分界 + 字串欄位）', () => {
  assert.equal(M.isGate({ RATE: 0, POPULATION: 0 }), true, '兩欄皆 0');
  assert.equal(M.isGate({ RATE: 0, POPULATION: 1 }), true, '只 RATE=0');
  assert.equal(M.isGate({ RATE: 1, POPULATION: 0 }), true, '只 POP=0');
  assert.equal(M.isGate({ RATE: 1, POPULATION: 1 }), false, '兩欄皆 >=1');
  assert.equal(M.isGate({ RATE: 3, POPULATION: 300000 }), false);
  assert.equal(M.isGate({ RATE: 5, POPULATION: 500000 }), false, 'RATE 上限 5 的大城不是關卡');
  // 舊存檔 / INI 讀進來的欄位可能是字串
  assert.equal(M.isGate({ RATE: '0', POPULATION: '120000' }), true);
  assert.equal(M.isGate({ RATE: '3', POPULATION: '120000' }), false);
  // 缺城防資料時 num(undefined)=0 → 按關卡處理（現行寬容解析，報告裡有記錄）
  assert.equal(M.isGate({}), true);
  assert.equal(M.isGate(null), true);
});

// ---------------------------------------------------------------- 下游行為
test('R1 部署目標：關卡是合法目標（北平→易京，守軍取 garrison.json）、非關卡鄰城保留（代縣→晉陽）', () => {
  const save = fresh();
  assert.deepEqual(save.owned.slice().sort(), ['代縣', '北平', '襄平'].sort(), '開局我方 3 城');
  const c = ctx();
  const gar = readJson('../data/garrison.json');

  // 北平的鄰城只有襄平（我方）與易京（關卡）→ 舊碼剔掉關卡後是 0 項，等於公孫瓚永遠沒法出征。
  const rows = M.deployTargets(save, cdef('北平'), c);
  assert.deepEqual(rows.map((r) => r.name), ['易京'], '關卡易京必須是部署目標（公孫瓚開局唯一出口）');
  assert.equal(rows[0].gate, true, 'gate 欄位要保留給 UI 畫「關」徽標');
  assert.equal(rows[0].owner, '', '關卡的 KING 是 1..12 序號，不得當勢力名（owner 一律空）');
  assert.equal(rows[0].troops, gar[0].cities['易京'].garrison, '關卡守軍取 garrison.json 的 garrison');

  // 代縣的鄰城是易京（關卡）+ 晉陽（無主真城）→ 兩個都要在
  const d = M.deployTargets(save, cdef('代縣'), c);
  assert.deepEqual(d.map((r) => r.name).sort(), ['晉陽', '易京'].sort(), '真城晉陽與關卡易京都要保留');
  assert.equal(d.find((r) => r.name === '晉陽').gate, false);

  // 反向掃全部 60 城：gate 必須等於 isGate；關卡 owner 只能是空串，真城不得是數字假勢力
  for (const city of S0.cities) {
    for (const row of M.deployTargets(save, city, c)) {
      assert.equal(row.gate, M.isGate(cdef(row.name)), `${city.NAME}→${row.name} gate 與 isGate 不一致`);
      if (row.gate) assert.equal(row.owner, '', `${row.name} 是關卡，owner 必須是空字串`);
      else assert.ok(!/^\d+$/.test(row.owner), `${row.name} 的 owner 不得是數字假勢力（got ${row.owner}）`);
    }
  }
});

test('R1 情報列：關卡 gate=true 且 owner=「關卡」，真城不得被標成關卡', () => {
  const save = fresh();
  const c = ctx();
  const rows = M.intel(save, cdef('北平'), c).rows;
  const byName = new Map(rows.map((r) => [r.name, r]));
  assert.equal(byName.get('襄平').gate, false);
  assert.equal(byName.get('襄平').owner, '我方');
  assert.equal(byName.get('易京').gate, true);
  assert.equal(byName.get('易京').owner, '關卡');

  // 反向：以 60 城為圓心各拉一次情報，gate 與 isGate 必須完全一致，且只有關卡能顯示「關卡」
  for (const city of S0.cities) {
    for (const row of M.intel(save, city, c).rows) {
      const real = M.isGate(cdef(row.name));
      assert.equal(row.gate, real, `${city.NAME} 的情報列 ${row.name} gate 與 isGate 不一致`);
      if (real) assert.equal(row.owner, '關卡', `${row.name} 是關卡，owner 應為「關卡」`);
      else assert.notEqual(row.owner, '關卡', `${row.name} 不是關卡，不得顯示「關卡」`);
    }
  }
});
