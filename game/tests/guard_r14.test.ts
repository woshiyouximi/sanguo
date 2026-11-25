// @ts-nocheck —— 被测模块 web/city_model.js、web/ai_model.js、web/saves.js 是浏览器端无类型 ESM
// （tsconfig 没有 allowJs）；本文件按 node:test 跑运行时断言，写法同 tests/city_rules.test.ts。
//
// R14 假绿守护：37a 的「移動武將：9 鄰接，Rate = 80/(Length+1)」当年是 ✅，但
// campaign_ai.test.ts 只测了 ACT=3 的 happy path 与 rate 区间，city_rules.test.ts 只测了
// move 北平→襄平 的成功路径 —— **没有任何一条**断言过「非相鄰必拒絕」「Length>=30000 的
// 哨兵路不算路」「9 是上限」。
// 注意（實作缺口，報告單列）：本移植的畫面層 `M.move` 有相鄰判定，但 AI 的
// `planMoveGeneral` 完全不檢查 from/to 是否相鄰 —— 所以「9 鄰接」在 AI 調將這條路上沒有守護對象，
// 本文件守的是可通行路徑（neighboursOf）與玩家指令（move）這兩處真實行為。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Saves from '../web/saves.js';
import * as M from '../web/city_model.js';
import * as AI from '../web/ai_model.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');
const ITEMS = readJson('../data/items.json');
const WISES = readJson('../data/wises.json');
const S0 = SCEN[0];
const cdef = (name, scen = S0) => scen.cities.find((c) => c.NAME === name);
const ctx = (scen = S0, scenIdx = 0) => ({ generals: GENS, scenario: scen, scenIdx, items: ITEMS, wises: WISES });

function fresh(scen = S0) {
  const save = Saves.newCampaign(scen);
  M.ensureExtras(save);
  for (const c of scen.cities) M.ensureCityState(save, c);
  return save;
}

/** 金標準：只認 Length<30000 的路徑，雙向記鄰城 */
function adjFromPaths(scen) {
  const map = new Map();
  for (const p of scen.paths) {
    if (Number(p.Length) >= 30000) continue;
    for (const [a, b] of [[p.Start, p.End], [p.End, p.Start]]) {
      if (!map.has(a)) map.set(a, new Set());
      map.get(a).add(b);
    }
  }
  return map;
}

// ---------------------------------------------------------------- 鄰接表
test('R14 鄰接表：9 是上限；Length>=30000 的哨兵路不算路（5 劇本逐城比對金標準）', () => {
  let maxDeg = 0;
  for (const [i, scen] of SCEN.entries()) {
    const gold = adjFromPaths(scen);
    for (const c of scen.cities) {
      const got = M.neighboursOf(c.NAME, scen);
      assert.deepEqual([...got].sort(), [...(gold.get(c.NAME) || [])].sort(), `劇本${i + 1} ${c.NAME} 鄰城`);
      assert.ok(got.length <= 9, `劇本${i + 1} ${c.NAME} 鄰城 ${got.length} 超過 9`);
      assert.equal(got.includes(c.NAME), false, `${c.NAME} 不得把自己當鄰城`);
      assert.equal(new Set(got).size, got.length, `${c.NAME} 鄰城不得重複`);
      maxDeg = Math.max(maxDeg, got.length);
    }
  }
  assert.ok(maxDeg <= 9, `鄰接度上限 9（實際最大 ${maxDeg}）`);
  assert.ok(maxDeg >= 2, `鄰接表不該退化成鏈狀（實際最大 ${maxDeg}）`);

  // 具體邊界：襄平只有北平；北平與代縣之間畫了 Length=30000 的哨兵線，不是可走路
  assert.deepEqual(M.neighboursOf('襄平', S0), ['北平']);
  assert.equal(M.neighboursOf('北平', S0).includes('代縣'), false, 'Length>=30000 的哨兵路徑不得算鄰接');
  assert.ok(S0.paths.some((p) => Number(p.Length) >= 30000), '資料裡應存在哨兵路徑，否則這條斷言是空的');
});

// ---------------------------------------------------------------- move 拒絕路徑
test('R14 move 拒絕：非相鄰/非我方/目標是自己/空兵/無將/滿員 六種都要拒絕且不改狀態', () => {
  assert.equal(M.MOVE.COST, 0, '37a：MOVE{COST:0}');
  const save = fresh();
  const c = ctx();

  const snapshot = (names) => names.map((n) => JSON.stringify(save.cities[n]));
  const before = snapshot(['襄平', '北平', '代縣']);

  // 非相鄰：襄平→代縣（兩城之間沒有可走路）
  assert.deepEqual(M.move(save, cdef('襄平'), { to: '代縣', troops: 5 }, c), { ok: false, reason: 'not-adjacent' });
  // 目標是關卡（易京不可擁有）
  assert.deepEqual(M.move(save, cdef('北平'), { to: '易京', troops: 5 }, c), { ok: false, reason: 'not-owned' });
  // 目標是自己
  assert.deepEqual(M.move(save, cdef('襄平'), { to: '襄平', troops: 5 }, c), { ok: false, reason: 'target' });
  // 起點不是我方城
  assert.deepEqual(M.move(save, cdef('易京'), { to: '北平', troops: 5 }, c), { ok: false, reason: 'not-own-city' });
  // 0 兵且沒帶將 → empty（邊界 0）
  assert.deepEqual(M.move(save, cdef('襄平'), { to: '北平', troops: 0 }, c), { ok: false, reason: 'empty' });
  // 帶不存在的將 → absent
  assert.deepEqual(M.move(save, cdef('襄平'), { to: '北平', troops: 0, general: '查無此人' }, c), { ok: false, reason: 'absent' });

  assert.deepEqual(snapshot(['襄平', '北平', '代縣']), before, '所有被拒絕的移動都不得改動任何城的狀態');
});

test('R14 move 邊界：相鄰可走 / 超量只走本城全部 / 目的城滿 600 → full', () => {
  const save = fresh();
  const c = ctx();
  const from = save.cities['襄平'];
  const to = save.cities['北平'];
  const srcBefore = from.troops;
  const dstBefore = to.troops;

  // 相鄰：襄平→北平，正常走 5
  const r = M.move(save, cdef('襄平'), { to: '北平', troops: 5 }, c);
  assert.equal(r.ok, true);
  assert.equal(r.troops, 5, '回傳實際走掉的兵數');
  assert.equal(from.troops, srcBefore - 5);
  assert.equal(to.troops, dstBefore + 5);

  // 超量：想走 9999，本城只有 srcBefore-5 → 全走，不能變負數
  const left = from.troops;
  const r2 = M.move(save, cdef('襄平'), { to: '北平', troops: 9999 }, c);
  assert.equal(r2.ok, true);
  assert.equal(r2.troops, left);
  assert.equal(from.troops, 0, '本城不得變負');
  assert.equal(to.troops, dstBefore + 5 + left);

  // 目的城滿員：北平堆到 600 → full，且本城兵力不減
  to.troops = M.RECRUIT.CAP;
  to.inf = M.RECRUIT.CAP;
  to.cav = 0;
  from.troops = 10;
  from.inf = 10;
  from.cav = 0;
  const r3 = M.move(save, cdef('襄平'), { to: '北平', troops: 5 }, c);
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'full');
  assert.equal(from.troops, 10, '滿員被拒時本城兵力不得蒸發');
  assert.equal(to.troops, M.RECRUIT.CAP);
});

// ---------------------------------------------------------------- AI Rate 公式
test('R14 AI 調將 Rate = clamp(24+floor((cap-兵)/cap*4), 24, 28)：0/25/50/75/99/100/超上限', () => {
  const mkCity = (o = {}) => ({
    owner: '', troops: 0, money: 0, pop: 100000, flags: 0, rate: 1, major: '', officers: [], ...o,
  });
  const officers = [{ name: '甲', str: 80, int: 70, status: '登' }, { name: '乙', str: 70, int: 60, status: '登' }];
  const mk = (toTroops) => {
    const world = {
      playerId: '玩家',
      cities: {
        許昌: mkCity({ owner: 'A', troops: 100, major: '甲', officers }),
        陳留: mkCity({ owner: 'A', troops: toTroops }),
      },
      adj: { 許昌: ['陳留'], 陳留: ['許昌'] },
      paths: [],
      rng: () => 0,
      capOf: () => 100,
    };
    const t = AI.createTable();
    AI.planMoveGeneral(world, 'A', t);
    const row = t.rows.find((x) => x.act === AI.ACT.MOVE_GENERAL);
    assert.ok(row, `to.troops=${toTroops} 應產生一條調將候選`);
    return row;
  };

  assert.equal(mk(0).rate, 28, '空城缺兵 100% → 24+4');
  assert.equal(mk(25).rate, 27, '缺 75% → 24+3');
  assert.equal(mk(50).rate, 26, '缺 50% → 24+2');
  assert.equal(mk(75).rate, 25, '缺 25% → 24+1');
  assert.equal(mk(99).rate, 24, '缺 1% → floor(0.04)=0');
  assert.equal(mk(100).rate, 24, '滿員 → 24 下限');
  assert.equal(mk(600).rate, 24, '超上限也不得低於 24');
  for (const v of [0, 25, 50, 75, 99, 100, 600]) {
    assert.ok(mk(v).rate >= AI.RATE_BAND.MOVE_MIN && mk(v).rate <= AI.RATE_BAND.MOVE_MAX);
  }
});

// ---------------------------------------------------------------- AI 候選條件
test('R14 AI 調將候選：只挑自家 0 武將城、來源 ≥2 武將；無空城/無多將城 → 0 條', () => {
  const mkCity = (o = {}) => ({
    owner: '', troops: 0, money: 0, pop: 100000, flags: 0, rate: 1, major: '', officers: [], ...o,
  });
  const two = [{ name: '甲', str: 80, int: 70, status: '登' }, { name: '乙', str: 70, int: 60, status: '登' }];
  const one = [{ name: '丙', str: 60, int: 50, status: '登' }];
  const base = (cities, extra = {}) => ({
    playerId: '玩家', cities, adj: null, paths: [], rng: () => 0, ...extra,
  });

  // 正向：許昌 2 將、陳留 0 將 → 恰好一條 許昌→陳留
  const t = AI.createTable();
  AI.planMoveGeneral(base({
    許昌: mkCity({ owner: 'A', troops: 60, officers: two }),
    陳留: mkCity({ owner: 'A', troops: 20, officers: [] }),
  }), 'A', t);
  const rows = t.rows.filter((r) => r.act === AI.ACT.MOVE_GENERAL);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].from, '許昌');
  assert.equal(rows[0].to, '陳留');
  assert.deepEqual([rows[0].a, rows[0].b, rows[0].c], [1, 0, 0]);

  // 反向 1：沒有空武將城 → 0 條
  const t2 = AI.createTable();
  AI.planMoveGeneral(base({
    許昌: mkCity({ owner: 'A', troops: 60, officers: two }),
    陳留: mkCity({ owner: 'A', troops: 20, officers: one }),
  }), 'A', t2);
  assert.equal(t2.rows.length, 0, '沒有 0 武將城就不該調將');

  // 反向 2：有 2 將的城不存在 → 0 條
  const t3 = AI.createTable();
  AI.planMoveGeneral(base({
    許昌: mkCity({ owner: 'A', troops: 60, officers: one }),
    陳留: mkCity({ owner: 'A', troops: 20, officers: [] }),
  }), 'A', t3);
  assert.equal(t3.rows.length, 0, '來源城必須有 ≥2 在職武將');

  // 反向 3：只有別人的空城 → 0 條
  const t4 = AI.createTable();
  AI.planMoveGeneral(base({
    許昌: mkCity({ owner: 'A', troops: 60, officers: two }),
    陳留: mkCity({ owner: 'B', troops: 20, officers: [] }),
  }), 'A', t4);
  assert.equal(t4.rows.length, 0, '不得把將調進別人的城');
});
