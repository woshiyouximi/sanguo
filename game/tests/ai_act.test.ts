// @ts-nocheck —— 被测模块 web/ai_model.js 是浏览器端的无类型 ESM（tsconfig 没有 allowJs），
// 本文件的验收口径是 `node --test`，断言一律 assert/strict。
//
// C2：R73 多路 AI（planMonth）+ R74 ACT 九项（actXxx）。
// 全部纯函数断言：没有 DOM、没有 fetch、没有 localStorage；随机一律显式注入。

import test from 'node:test';
import assert from 'node:assert/strict';

import * as AI from '../web/ai_model.js';

// ---------------------------------------------------------------- 夹具
/** 一座城（字段对齐 city 结构；DEFENSE 是剧本城市行才有的字段，world.cities 里没有） */
function mkCity(o = {}) {
  return {
    owner: '', troops: 0, money: 0, pop: 100000, flags: 0, rate: 1, major: '', officers: [], DEFENSE: 0,
    ...o,
  };
}
/** 一个最小 world（给 actXxx 直调用；adj 用普通对象，neighborsOf 支持对象/Map/paths） */
function mkWorld(cities, extra = {}) {
  return { playerId: '玩家', cities, adj: null, paths: [], rng: () => 0, ...extra };
}
/** 剧本城市行（scenarios.json 的 cities 形状），planMonth 的第二个参数 */
function rowsOf(cities) {
  return Object.keys(cities).map((NAME) => {
    const c = cities[NAME];
    return {
      NAME,
      KING: c.owner || '',
      MAJOR: c.major || '',
      POPULATION: c.pop,
      DEFENSE: c.DEFENSE || 0,
      MONEY: c.money,
      RATE: c.rate,
      FLAGS: c.flags,
      _index: 0,
    };
  });
}
/** save + 剧本行 → planMonth（ctx.adj 必给，否则没有邻城） */
function plan(cities, ctx = {}) {
  const save = { king: '玩家', month: 1, cities, forces: {} };
  return AI.planMonth(save, rowsOf(cities), { seed: 7, ...ctx });
}
const zero = () => 0;

/** 单城势力 A，无敌邻，几乎什么都不发生 —— 各测试在上面加料 */
function solo(o = {}) {
  return { 許昌: mkCity({ owner: 'A', troops: 100, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }], ...o }) };
}

// ================================================================ 接口与常量
test('R73 导出面：ACT 九项一 ACT 一函数，KIND 覆盖任务书要求的七类', () => {
  for (const fn of ['actNop', 'actSupplyGold', 'actFlee', 'actMoveGeneral', 'actAttackPlayer',
    'actAttackAI', 'actCheat', 'actJoin', 'actOccupyEmpty', 'planMonth', 'executeMonth', 'executeAction']) {
    assert.equal(typeof AI[fn], 'function', fn);
  }
  assert.deepEqual(Object.keys(AI.ACT_IMPL).map(Number).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  for (const a of AI.ALL_ACTS) assert.equal(typeof AI.ACT_IMPL[a], 'function');
  for (const k of ['attack', 'reinforce', 'recruit', 'develop', 'search', 'defend', 'supply']) {
    assert.ok(AI.ALL_KINDS.includes(k), k);
  }
  // ACT_KIND 只映射 ACT 表里真有的项（徵兵/開墾/搜索在 ACT 表里没有，见 §11）
  for (const k of Object.values(AI.ACT_KIND)) assert.ok(AI.ALL_KINDS.includes(k), k);
  assert.equal(AI.MONTH_ACTION_MAX, 1);   // 0x40D751 → 0x40CC10 → 0x40D52F 一月一条
});

test('R73 seedRng：同种子同序列、落在 [0,1)、不同种子不同序列', () => {
  const a = AI.seedRng(7);
  const b = AI.seedRng(7);
  const c = AI.seedRng(8);
  const sa = [a(), a(), a()];
  const sb = [b(), b(), b()];
  const sc = [c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa.concat(sc)) assert.ok(v >= 0 && v < 1, String(v));
});

// ================================================================ prepareMonth（存档 → world）
test('R73 prepareMonth：save 出兵/金/民，剧本行出 DEFENSE/FLAGS/RATE，owner 可由 KING 推', () => {
  const save = { king: '玩家', month: 3, cities: { 許昌: { owner: 'A', troops: 7, money: 9, pop: 11 } } };
  const rows = [{ NAME: '許昌', KING: 'A', MAJOR: '甲', POPULATION: 500, DEFENSE: 141, RATE: 3, FLAGS: 0 }];
  const w = AI.prepareMonth(save, rows, {});
  assert.equal(w.cities['許昌'].owner, 'A');
  assert.equal(w.cities['許昌'].troops, 7);
  assert.equal(w.cities['許昌'].money, 9);
  assert.equal(w.cities['許昌'].pop, 11);          // 存档优先
  assert.equal(w.cities['許昌'].DEFENSE, 141);     // 只在剧本行
  assert.equal(w.cities['許昌'].rate, 3);
  assert.equal(w.playerId, '玩家');
  assert.equal(w.month, 3);
  // 没有存档条目时退回剧本行
  const w2 = AI.prepareMonth({}, rows, {});
  assert.equal(w2.cities['許昌'].pop, 500);
  assert.equal(w2.cities['許昌'].major, '甲');
});

test('R73 prepareMonth：save.owned 里的城算玩家的（用于老存档不做 owner 回写的情况）', () => {
  const w = AI.prepareMonth({ king: '玩家', owned: ['許昌'], cities: { 許昌: { troops: 1 } } }, [], {});
  assert.equal(w.cities['許昌'].owner, '玩家');
});

// ================================================================ planMonth：纯度/确定性/节奏
test('R73 planMonth 是纯函数：不修改 save / cities（JSON 快照前后一致）', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 600, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
  };
  const save = { king: '玩家', month: 1, cities, forces: {} };
  const rows = rowsOf(cities);
  const before = JSON.stringify([save, rows]);
  AI.planMonth(save, rows, { seed: 3, adj: { 許昌: ['江夏'], 江夏: ['許昌'] } });
  assert.equal(JSON.stringify([save, rows]), before);
});

test('R73 planMonth 确定性：同一 (save, cities, seed) 两次输出逐字段一致', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 600, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
  };
  const ctx = { seed: 11, adj: { 許昌: ['江夏'], 江夏: ['許昌'] } };
  const save = { king: '玩家', month: 1, cities, forces: {} };
  const a = AI.planMonth(save, rowsOf(cities), ctx);
  const b = AI.planMonth(save, rowsOf(cities), ctx);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.length >= 1);
});

test('R73 planMonth 跳过玩家势力', () => {
  const cities = {
    許昌: mkCity({ owner: '玩家', troops: 40, money: 600, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
  };
  assert.deepEqual(plan(cities), []);
});

test('R73 planMonth：每势力默认 1 条（原作一月一动作），maxPerForce 可放开且带 rank', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 600, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
    洛陽: mkCity({ troops: 0 }),   // 空城
  };
  const adj = { 許昌: ['江夏', '洛陽'], 江夏: ['許昌'], 洛陽: ['許昌'] };
  const one = plan(cities, { adj });
  assert.equal(one.length, 1);
  assert.equal(one[0].force, 'A');
  const many = plan(cities, { adj, maxPerForce: 5 });
  assert.ok(many.length > 1 && many.length <= 5);
  assert.deepEqual(many.map((a) => a.rank), many.map((_, i) => i + 1));
  for (let i = 1; i < many.length; i++) assert.ok(many[i - 1].rate >= many[i].rate);
  for (const a of many) assert.equal(a.force, 'A');
});

test('R73 compareAction 全序：Rate 降 → act 降 → score 降 → 城名升', () => {
  const rows = [
    { rate: 100, act: 5, score: 9, from: 'A', to: 'B' },
    { rate: 200, act: 4, score: 1, from: 'A', to: 'C' },
    { rate: 200, act: 7, score: 1, from: 'A', to: 'C' },
    { rate: 200, act: 4, score: 5, from: 'A', to: 'D' },
  ];
  const sorted = rows.slice().sort(AI.compareAction);
  assert.deepEqual(sorted.map((r) => `${r.rate}/${r.act}/${r.score}`), ['200/7/1', '200/4/5', '200/4/1', '100/5/9']);
  assert.equal(AI.compareAction(rows[0], rows[0]), 0);
});

// ================================================================ R74 逐项：ACT=1 補金
test('R74 ACT=1 補金：穷城从本势力最富的城拨款，Rate 22..30，planMonth 会选中', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 270, money: 5000, pop: 400000, DEFENSE: 999, officers: [1, 2, 3, 4, 5].map((i) => ({ name: `將${i}`, str: 60, int: 50, status: '登' })) }),
    洛陽: mkCity({ owner: 'A', troops: 10, money: 100, officers: [{ name: '乙', str: 50, int: 40, status: '登' }] }),
  };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), {});
  const list = AI.actSupplyGold({ world: w, force: 'A', rand: zero });
  assert.equal(list.length, 1);
  const a = list[0];
  assert.equal(a.act, AI.ACT.GOLD);
  assert.equal(a.kind, 'supply');
  assert.equal(a.from, '許昌');
  assert.equal(a.to, '洛陽');
  assert.equal(a.gold, 400);                       // min(5000-500, 500-100)
  assert.ok(a.rate >= 22 && a.rate <= 30);
  assert.match(a.reason, /補金/);
  const acts = plan(cities);
  assert.equal(acts.length, 1);
  assert.equal(acts[0].act, AI.ACT.GOLD);
  assert.equal(acts[0].kind, 'supply');
});

// ================================================================ ACT=2 逃跑/回防
test('R74 ACT=2 逃跑：0 兵且邻敌 ≥30 兵 → 把金搬到最安全的自家城，planMonth 会选中', () => {
  const cities = {
    前線: mkCity({ owner: 'A', troops: 0, money: 300 }),
    後方: mkCity({ owner: 'A', troops: 200, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    敵城: mkCity({ owner: 'B', troops: 50, major: '丙', officers: [{ name: '丙', str: 70, int: 60, status: '登' }] }),
  };
  const adj = { 前線: ['敵城', '後方'], 後方: ['前線'], 敵城: ['前線'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const list = AI.actFlee({ world: w, force: 'A' });
  assert.equal(list.length, 1);
  const a = list[0];
  assert.equal(a.act, AI.ACT.FLEE);
  assert.equal(a.kind, 'defend');
  assert.equal(a.from, '前線');
  assert.equal(a.to, '後方');
  assert.equal(a.gold, 300);
  assert.equal(a.rate, AI.RATE_BAND.FLEE);
  const picks = plan(cities, { adj }).filter((a) => a.force === 'A');   // 敵城那边也会出牌
  assert.equal(picks.length, 1);
  assert.equal(picks[0].act, AI.ACT.FLEE);
  assert.equal(picks[0].kind, 'defend');
});

// ================================================================ ACT=3 移動武將
test('R74 ACT=3 移動武將：0 将城从 ≥2 将的城调 1 人，planMonth 会选中', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 100, money: 100, officers: [{ name: '甲', str: 70, int: 60, status: '登' }, { name: '乙', str: 65, int: 55, status: '登' }] }),
    洛陽: mkCity({ owner: 'A', troops: 10, money: 100 }),
  };
  const adj = { 許昌: ['洛陽'], 洛陽: ['許昌'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const list = AI.actMoveGeneral({ world: w, force: 'A' });
  assert.equal(list.length, 1);
  const a = list[0];
  assert.equal(a.act, AI.ACT.MOVE_GENERAL);
  assert.equal(a.kind, 'reinforce');
  assert.equal(a.from, '許昌');
  assert.equal(a.to, '洛陽');
  assert.deepEqual(a.generals, ['甲']);
  assert.ok(a.rate >= 24 && a.rate <= 28);
  const picks = plan(cities, { adj });
  assert.equal(picks[0].act, AI.ACT.MOVE_GENERAL);
  assert.deepEqual(picks[0].generals, ['甲']);
});

test('R74 ACT=3 增援：前线 0 兵（不能自己出兵）→ 从大后方调将并带 1..5 单位兵', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 300, money: 100, officers: [{ name: '甲', str: 70, int: 60, status: '登' }, { name: '乙', str: 65, int: 55, status: '登' }] }),
    洛陽: mkCity({ owner: 'A', troops: 0, money: 100, officers: [{ name: '丙', str: 60, int: 50, status: '登' }] }),
    敵城: mkCity({ owner: 'B', troops: 10, major: '丁', officers: [{ name: '丁', str: 60, int: 50, status: '登' }] }),
  };
  const adj = { 許昌: ['洛陽'], 洛陽: ['許昌', '敵城'], 敵城: ['洛陽'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const list = AI.actMoveGeneral({ world: w, force: 'A' });
  const a = list.find((x) => x.sub === 'troops');
  assert.ok(a, '应当有带兵增援的候选');
  assert.equal(a.act, AI.ACT.MOVE_GENERAL);
  assert.equal(a.kind, 'reinforce');
  assert.equal(a.from, '許昌');
  assert.equal(a.to, '洛陽');
  assert.equal(a.troops, 100);          // 5 单位 × 20
  assert.deepEqual(a.generals, ['甲']);
  const picks = plan(cities, { adj });
  assert.equal(picks[0].sub, 'troops');
  assert.equal(picks[0].kind, 'reinforce');
});

// ================================================================ ACT=4 / 5 攻擊
test('R74 ACT=4 攻擊player：Rate 硬常量 200，出兵 1..5 单位，reason 带守军/城防/兵力比', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }], DEFENSE: 120 }),
  };
  const adj = { 許昌: ['江夏'], 江夏: ['許昌'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const list = AI.actAttackPlayer({ world: w, force: 'A', rand: zero });
  assert.equal(list.length, 1);
  const a = list[0];
  assert.equal(a.act, AI.ACT.ATTACK_PLAYER);
  assert.equal(a.kind, 'attack');
  assert.equal(a.rate, 200);
  assert.equal(a.troops, 100);          // 5 单位 × 20
  assert.equal(a.cand.b, 5);            // 原作量纲
  assert.match(a.reason, /城防 120/);
  assert.match(a.reason, /兵力比 100:40/);   // 10 守军 + 120/4 城防
  const picks = plan(cities, { adj });
  assert.equal(picks[0].act, AI.ACT.ATTACK_PLAYER);
});

test('R74 ACT=5 攻擊ai：Rate 硬常量 100，且不打玩家城', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: 'B', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
    玩家城: mkCity({ owner: '玩家', troops: 10, major: '丙', officers: [{ name: '丙', str: 60, int: 60, status: '登' }] }),
  };
  const adj = { 許昌: ['江夏', '玩家城'], 江夏: ['許昌'], 玩家城: ['許昌'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const ai = AI.actAttackAI({ world: w, force: 'A', rand: zero });
  assert.equal(ai.length, 1);
  assert.equal(ai[0].act, AI.ACT.ATTACK_AI);
  assert.equal(ai[0].rate, 100);
  assert.equal(ai[0].to, '江夏');
  assert.match(ai[0].reason, /攻擊ai/);
  const pl = AI.actAttackPlayer({ world: w, force: 'A', rand: zero });
  assert.equal(pl.length, 1);
  assert.equal(pl[0].to, '玩家城');
});

// ================================================================ ACT=6 cheat
test('R74 ACT=6 cheat：只在 rules.cheat 开着时产生，Rate 15，planMonth 会选中', () => {
  const cities = solo({ troops: 10, money: 100 });
  const off = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { rules: { cheat: false } });
  assert.deepEqual(AI.actCheat({ world: off, force: 'A' }), []);
  const on = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { rules: { cheat: true } });
  const list = AI.actCheat({ world: on, force: 'A' });
  assert.equal(list.length, 1);
  assert.equal(list[0].act, AI.ACT.CHEAT);
  assert.equal(list[0].kind, 'cheat');
  assert.equal(list[0].rate, AI.RATE_BAND.CHEAT);
  const picks = plan(cities, { rules: { cheat: true } });
  assert.equal(picks[0].act, AI.ACT.CHEAT);
});

// ================================================================ ACT=7 聯合
test('R74 ACT=7 聯合：同势力两座邻城对半分兵，打玩家 200，planMonth 选 7 而不是单城 4', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    陳留: mkCity({ owner: 'A', troops: 40, money: 100, major: '丁', officers: [{ name: '丁', str: 70, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
  };
  const adj = { 許昌: ['陳留', '江夏'], 陳留: ['許昌', '江夏'], 江夏: ['許昌', '陳留'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const joins = AI.actJoin({ world: w, force: 'A', rand: zero });
  assert.ok(joins.length >= 1);
  const a = joins[0];
  assert.equal(a.act, AI.ACT.JOIN);
  assert.equal(a.kind, 'attack');
  assert.equal(a.rate, 200);           // 聯合打玩家 = 0xC8
  assert.equal(a.joinCity, '陳留');
  assert.equal(a.cand.b + a.cand.a, 5);        // need=5 → half=2 + 3
  assert.equal(a.troops, 100);
  const picks = plan(cities, { adj });
  assert.equal(picks.length, 1);
  assert.equal(picks[0].act, AI.ACT.JOIN);     // 同 Rate 200：act 大的（聯合）胜
});

test('R74 ACT=7 聯合打 AI 是 Rate 50（打不过单城攻 AI 的 100）', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    陳留: mkCity({ owner: 'A', troops: 40, money: 100, major: '丁', officers: [{ name: '丁', str: 70, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: 'B', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
  };
  const adj = { 許昌: ['陳留', '江夏'], 陳留: ['許昌', '江夏'], 江夏: ['許昌', '陳留'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const joins = AI.actJoin({ world: w, force: 'A', rand: zero });
  assert.equal(joins[0].rate, 50);
  const picks = plan(cities, { adj });
  assert.equal(picks[0].act, AI.ACT.ATTACK_AI);
});

// ================================================================ ACT=8 佔領空城
test('R74 ACT=8 佔領空城：相邻空城 Rate 40（80/(距离+1)），planMonth 会选中', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    洛陽: mkCity({ troops: 0 }),
  };
  const adj = { 許昌: ['洛陽'], 洛陽: ['許昌'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const list = AI.actOccupyEmpty({ world: w, force: 'A', rand: zero });
  assert.equal(list.length, 1);
  const a = list[0];
  assert.equal(a.act, AI.ACT.OCCUPY);
  assert.equal(a.kind, 'attack');
  assert.equal(a.rate, 40);
  assert.equal(a.to, '洛陽');
  assert.equal(a.troops, 20);          // 空城 rand(2)+1 = 1 单位
  const picks = plan(cities, { adj });
  assert.equal(picks[0].act, AI.ACT.OCCUPY);
});

// ================================================================ ACT=0 不明
test('R74 ACT=0 不明：actNop 永远空，planMonth 不会产出 act 0 + kind none', () => {
  assert.deepEqual(AI.actNop(), []);
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 600, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
  };
  const acts = plan(cities, { adj: { 許昌: ['江夏'], 江夏: ['許昌'] }, maxPerForce: 9 });
  assert.ok(acts.length > 0);
  for (const a of acts) assert.ok(!(a.act === 0 && a.kind === 'none'), JSON.stringify(a));
});

// ================================================================ ACT 表之外的三种内政
test('R73 徵兵：金 ≥500 且兵 < 上限才有候选，Rate 33..35，planMonth 会选中', () => {
  const cities = solo({ troops: 10, money: 600 });
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), {});
  const list = AI.actRecruit({ world: w, force: 'A', rand: zero });
  assert.equal(list.length, 1);
  const a = list[0];
  assert.equal(a.kind, 'recruit');
  assert.equal(a.act, AI.ACT.NONE);      // ACT 表九项里没有徵兵
  assert.equal(a.gold, 500);
  assert.equal(a.troops, 40);
  assert.ok(a.rate >= 33 && a.rate <= 35);
  const picks = plan(cities);
  assert.equal(picks[0].kind, 'recruit');
  // 兵满 / 没钱 → 没有候选
  const full = AI.prepareMonth({ king: '玩家', cities: solo({ troops: 150, money: 600 }) }, rowsOf(solo({ troops: 150, money: 600 })), {});
  assert.deepEqual(AI.actRecruit({ world: full, force: 'A' }), []);
  const poor = AI.prepareMonth({ king: '玩家', cities: solo({ troops: 10, money: 100 }) }, rowsOf(solo({ troops: 10, money: 100 })), {});
  assert.deepEqual(AI.actRecruit({ world: poor, force: 'A' }), []);
});

test('R73 開墾：只有不挨敌的城才开垦，金 −400 人口 +3000 防 +6，planMonth 会选中', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 150, money: 1000, officers: [1, 2, 3, 4, 5].map((i) => ({ name: `將${i}`, str: 60, int: 50, status: '登' })) }),
  };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), {});
  const list = AI.actDevelop({ world: w, force: 'A' });
  assert.equal(list.length, 1);
  const a = list[0];
  assert.equal(a.kind, 'develop');
  assert.equal(a.gold, 400);
  assert.ok(a.rate >= 26 && a.rate <= 32);
  assert.match(a.reason, /人口 \+3000/);
  const picks = plan(cities);
  assert.equal(picks[0].kind, 'develop');
  // 前线城不开垦
  const front = { 許昌: mkCity({ owner: 'A', troops: 150, money: 1000 }), 敵城: mkCity({ owner: 'B', troops: 500, major: '丙' }) };
  const fw = AI.prepareMonth({ king: '玩家', cities: front }, rowsOf(front), { adj: { 許昌: ['敵城'], 敵城: ['許昌'] } });
  assert.deepEqual(AI.actDevelop({ world: fw, force: 'A' }), []);
});

test('R73 搜索：不挨敌 + 金 ≥200 + 城内 <5 将，Rate 18..24，planMonth 会选中', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 10, money: 300, pop: 400000 }),
  };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), {});
  const list = AI.actSearch({ world: w, force: 'A' });
  assert.equal(list.length, 1);
  const a = list[0];
  assert.equal(a.kind, 'search');
  assert.equal(a.gold, 200);
  assert.ok(a.rate >= 18 && a.rate <= 24);
  const picks = plan(cities);
  assert.equal(picks[0].kind, 'search');
});

test('R73 ctx.kinds 白名单：有邻敌时默认出 attack，限 develop/search 后同局面出内政', () => {
  // 有邻敌 → 攻AI 100 必压过内政 18..32；这是原作 Rate 机制的直接后果
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 100, officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    陳留: mkCity({ owner: 'A', troops: 10, money: 2000 }),   // 后方，不挨敌 → 可以内政
    敵城: mkCity({ owner: 'B', troops: 10, major: '丁', officers: [{ name: '丁', str: 50, int: 50, status: '登' }] }),
  };
  const adj = { 許昌: ['敵城', '陳留'], 陳留: ['許昌'], 敵城: ['許昌'] };
  const open = plan(cities, { adj });
  assert.ok(open.some((a) => a.kind === 'attack'));
  assert.ok(!open.some((a) => a.kind === 'develop'), '默认不开内政月');
  const peace = plan(cities, { adj, kinds: ['develop', 'search'], maxPerForce: 5 })
    .filter((a) => a.force === 'A');
  assert.deepEqual(peace.map((a) => a.kind).sort(), ['develop', 'search']);
  assert.ok(peace.every((a) => a.from === '陳留' && a.rate >= 18 && a.rate <= 32));
});

// ================================================================ 执行侧
test('R73 executeAction 徵兵：金 −500 兵 +40，返回值带 before/after', () => {
  const cities = solo({ troops: 10, money: 600 });
  const acts = plan(cities);
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), {});
  const res = AI.executeAction(w, acts[0], {});
  assert.equal(res.ok, true);
  assert.equal(res.troops, 40);
  assert.equal(res.before, 10);
  assert.equal(res.after, 50);
  assert.equal(w.cities['許昌'].money, 100);
  assert.equal(w.cities['許昌'].troops, 50);
});

test('R73 executeAction 開墾/搜索：人口 +3000 与金 −200 分别落地；搜索能从 talentPool 招到人', () => {
  const dcities = { 許昌: mkCity({ owner: 'A', troops: 150, money: 1000 }) };
  const dw = AI.prepareMonth({ king: '玩家', cities: dcities }, rowsOf(dcities), {});
  const dev = AI.executeAction(dw, plan(dcities)[0], {});
  assert.equal(dev.ok, true);
  assert.equal(dev.pop, 3000);
  assert.equal(dw.cities['許昌'].pop, 103000);
  assert.equal(dw.cities['許昌'].money, 600);

  const scities = { 許昌: mkCity({ owner: 'A', troops: 10, money: 300, pop: 400000 }) };
  const sw = AI.prepareMonth({ king: '玩家', cities: scities }, rowsOf(scities), { talentPool: [{ name: '姜維' }] });
  const search = AI.executeAction(sw, plan(scities)[0], {});
  assert.equal(search.ok, true);
  assert.equal(search.found, '姜維');
  assert.equal(sw.cities['許昌'].money, 100);
  assert.equal(sw.cities['許昌'].officers.length, 1);
  assert.equal(sw.cities['許昌'].officers[0].name, '姜維');
  assert.equal(sw.cities['許昌'].major, '姜維');
});

test('R73 executeAction 增援：将真的搬到目标城，兵也从后方搬过去', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 300, money: 100, officers: [{ name: '甲', str: 70, int: 60, status: '登' }, { name: '乙', str: 65, int: 55, status: '登' }] }),
    洛陽: mkCity({ owner: 'A', troops: 0, money: 100, officers: [{ name: '丙', str: 60, int: 50, status: '登' }] }),
    敵城: mkCity({ owner: 'B', troops: 10, major: '丁', officers: [{ name: '丁', str: 60, int: 50, status: '登' }] }),
  };
  const adj = { 許昌: ['洛陽'], 洛陽: ['許昌', '敵城'], 敵城: ['洛陽'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const action = plan(cities, { adj })[0];
  const res = AI.executeAction(w, action, {});
  assert.equal(res.ok, true);
  assert.equal(res.officer, '甲');
  assert.equal(res.troops, 100);
  assert.equal(w.cities['許昌'].troops, 200);
  assert.equal(w.cities['洛陽'].troops, 100);
  assert.deepEqual(w.cities['洛陽'].officers.map((o) => o.name).sort(), ['丙', '甲'].sort());
});

test('R73 executeAction 補金：錢從 donor 到穷城（ACT=1 语义不变）', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 270, money: 5000, pop: 400000, DEFENSE: 999, officers: [1, 2, 3, 4, 5].map((i) => ({ name: `將${i}`, str: 60, int: 50, status: '登' })) }),
    洛陽: mkCity({ owner: 'A', troops: 10, money: 100, officers: [{ name: '乙', str: 50, int: 40, status: '登' }] }),
  };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), {});
  const res = AI.executeAction(w, plan(cities)[0], {});
  assert.equal(res.ok, true);
  assert.equal(w.cities['許昌'].money, 4600);
  assert.equal(w.cities['洛陽'].money, 500);
});

test('R73 executeMonth：与 runMonth 同形（reports/executed），每势力一条，cand 一定存在', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 600, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
  };
  const adj = { 許昌: ['江夏'], 江夏: ['許昌'] };
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), { adj });
  const res = AI.executeMonth(w, plan(cities, { adj }), { rng: zero });
  assert.equal(res.executed.length, 1);
  const item = res.executed[0];
  assert.equal(item.force, 'A');
  assert.equal(item.cand.act, AI.ACT.ATTACK_PLAYER);
  assert.equal(item.result.kind, 'battle');
  assert.equal(item.result.attacker, 'A');
  assert.equal(item.result.defender, '玩家');
  assert.equal(item.result.troops, 100);
  // 出兵的城已经扣过兵（0x40D52F 在下命令这一刻扣；扣的是候选量纲 b=5，不是 5×20）
  assert.equal(w.cities['許昌'].troops, 35);
  assert.equal(res.reports.length, 1);
  assert.equal(res.reports[0].force, 'A');
  assert.equal(res.reports[0].stages.attack, 1);
  assert.equal(res.reports[0].immediate.length, 0);
});

test('R73 executeMonth：徵兵会在月报的 immediate 里留痕（老月报那行不用改）', () => {
  const cities = solo({ troops: 10, money: 600 });
  const w = AI.prepareMonth({ king: '玩家', cities }, rowsOf(cities), {});
  const res = AI.executeMonth(w, plan(cities), { rng: zero });
  assert.equal(res.reports[0].immediate.length, 1);
  assert.equal(res.reports[0].immediate[0].city, '許昌');
  assert.equal(res.reports[0].immediate[0].troops, 40);
  assert.equal(w.cities['許昌'].troops, 50);
  assert.equal(w.cities['許昌'].money, 100);
});

// ================================================================ 文案
test('R73 describePlan：每种 kind 一行中文，九种 kind 互不相同且带势力名', () => {
  const kinds = ['attack', 'reinforce', 'recruit', 'develop', 'search', 'defend', 'supply', 'cheat'];
  const texts = kinds.map((kind) => AI.describePlan({
    force: 'A', kind, from: '許昌', to: '江夏', troops: 100, gold: 400, generals: ['甲'], sub: kind === 'attack' ? 'player' : '',
  }));
  assert.equal(new Set(texts).size, kinds.length);
  for (const t of texts) assert.match(t, /^A /);
});

test('R73 describeCandidate/describeAction：act=0 + kind 走新文案，act 4 的旧文案一字不动', () => {
  const w = mkWorld({
    許昌: mkCity({ owner: 'A', troops: 40, major: '甲' }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙' }),
  }, { adj: { 許昌: ['江夏'], 江夏: ['許昌'] } });
  const kindCand = { act: 0, kind: 'recruit', from: '許昌', to: '許昌', gold: 500, troops: 40, rate: 34 };
  assert.match(AI.describeCandidate(w, kindCand), /徵兵/);
  assert.match(AI.describeAction(w, kindCand), /徵 兵/);
  const attackCand = { act: 4, from: '許昌', to: '江夏', a: 130, b: 5, c: 0, rate: 200 };
  assert.equal(AI.describeCandidate(w, attackCand), 'ACT=攻擊player, 從許昌40人 -> 江夏10人, 出兵5人，Rate=200');
  assert.equal(AI.describeAction(w, attackCand), 'A 攻 擊 player：許昌 → 江夏（出兵 100）');
});

// ================================================================ 全表覆盖（九项都能被 planMonth 产出）
test('R74 九项 ACT 都能被 planMonth 产出（逐项 act 编号 + kind 断言）', () => {
  const scenarios = [
    // [期望 act, cities, adj, ctx]
    [AI.ACT.GOLD, {
      許昌: mkCity({ owner: 'A', troops: 270, money: 5000, pop: 400000, DEFENSE: 999, officers: [1, 2, 3, 4, 5].map((i) => ({ name: `將${i}`, str: 60, int: 50, status: '登' })) }),
      洛陽: mkCity({ owner: 'A', troops: 10, money: 100, officers: [{ name: '乙', str: 50, int: 40, status: '登' }] }),
    }, {}],
    [AI.ACT.FLEE, {
      前線: mkCity({ owner: 'A', troops: 0, money: 300 }),
      後方: mkCity({ owner: 'A', troops: 200, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
      敵城: mkCity({ owner: 'B', troops: 50, major: '丙', officers: [{ name: '丙', str: 70, int: 60, status: '登' }] }),
    }, { 前線: ['敵城', '後方'], 後方: ['前線'], 敵城: ['前線'] }],
    [AI.ACT.MOVE_GENERAL, {
      許昌: mkCity({ owner: 'A', troops: 100, money: 100, officers: [{ name: '甲', str: 70, int: 60, status: '登' }, { name: '乙', str: 65, int: 55, status: '登' }] }),
      洛陽: mkCity({ owner: 'A', troops: 10, money: 100 }),
    }, { 許昌: ['洛陽'], 洛陽: ['許昌'] }],
    [AI.ACT.ATTACK_PLAYER, {
      許昌: mkCity({ owner: 'A', troops: 40, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
      江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
    }, { 許昌: ['江夏'], 江夏: ['許昌'] }],
    [AI.ACT.ATTACK_AI, {
      許昌: mkCity({ owner: 'A', troops: 40, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
      江夏: mkCity({ owner: 'B', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
    }, { 許昌: ['江夏'], 江夏: ['許昌'] }],
    [AI.ACT.CHEAT, solo({ troops: 10, money: 100 }), {}, { rules: { cheat: true } }],
    [AI.ACT.JOIN, {
      許昌: mkCity({ owner: 'A', troops: 40, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
      陳留: mkCity({ owner: 'A', troops: 40, money: 100, major: '丁', officers: [{ name: '丁', str: 70, int: 60, status: '登' }] }),
      江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
    }, { 許昌: ['陳留', '江夏'], 陳留: ['許昌', '江夏'], 江夏: ['許昌', '陳留'] }],
    [AI.ACT.OCCUPY, {
      許昌: mkCity({ owner: 'A', troops: 40, money: 100, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
      洛陽: mkCity({ troops: 0 }),
    }, { 許昌: ['洛陽'], 洛陽: ['許昌'] }],
  ];
  const seen = new Set();
  for (const [want, cities, adj = {}, extra = {}] of scenarios) {
    const acts = plan(cities, { adj, ...extra }).filter((a) => a.force === 'A');
    assert.ok(acts.length >= 1, `act ${want} 没有产出`);
    assert.equal(acts[0].act, want, `act ${want} 没被选中，选中的是 ${acts[0].act}`);
    seen.add(want);
  }
  assert.equal(seen.size, 8);   // 1..8 全都在 planMonth 的产出里出现过
});

test('R73 势力灭亡后不再规划：城里没有它的 owner 就从 planMonth 里消失', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 600, major: '甲', officers: [{ name: '甲', str: 70, int: 60, status: '登' }] }),
    洛陽: mkCity({ owner: 'B', troops: 40, money: 600, major: '丁', officers: [{ name: '丁', str: 70, int: 60, status: '登' }] }),
  };
  const acts = plan(cities);
  assert.equal(acts.length, 2);
  assert.deepEqual(acts.map((a) => a.force).sort(), ['A', 'B']);
  // B 的城没了 → 只剩 A
  delete cities['洛陽'];
  assert.deepEqual(plan(cities).map((a) => a.force), ['A']);
});
