// @ts-nocheck —— 被测模块 web/ai_model.js、web/saves.js 是浏览器端的无类型 ESM（仓库 tsconfig
// 没有 allowJs，campaign.html 也靠在浏览器里跑），tsc 类型检查不覆盖它们；本文件的验收口径是
// `node --test`，断言一律是 assert/strict，没有任何一条因为类型而放宽。
//
// B2：大地图 AI / 势力（R73 / R74 / R75 / R76 / R78+R4 / R63 / R65）。
// 全部是纯函数断言：没有 DOM、没有 fetch、没有 localStorage。

import test from 'node:test';
import assert from 'node:assert/strict';

import * as AI from '../web/ai_model.js';
import * as Saves from '../web/saves.js';

// ---------------------------------------------------------------- 夹具
/** 一座城（字段对齐 city 结构：owner=+0x10 troops=+0x30 money=+0x92 pop=+0x8A flags=+0x9E */
function mkCity(o = {}) {
  return {
    owner: '', troops: 0, money: 0, pop: 100000, flags: 0, rate: 1, major: '', officers: [],
    ...o,
  };
}
/** 一个最小 world：adj 用普通对象（ai_model 的 neighborsOf 支持 Map/对象/paths 三种来源） */
function mkWorld(cities, extra = {}) {
  return {
    playerId: '玩家', cities, adj: null, paths: [], rng: () => 0, ...extra,
  };
}
const zero = () => 0;
const near1 = () => 0.999999;

// ================================================================ R75 出兵数（0x40C635）
test('R75 dispatchTroops：有太守的城 → 目标兵数+rand(3)+1，再依次 min(上限,5,我方-1)', () => {
  const w = mkWorld({
    許昌: mkCity({ owner: 'A', troops: 100, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙', officers: [{ name: '乙', str: 60, int: 60, status: '登' }] }),
  }, { adj: { 許昌: ['江夏'], 江夏: ['許昌'] } });
  // 10 + rand(3)+1 = 11..13 → 被 5 夹住
  assert.equal(AI.dispatchTroops(w, '許昌', '江夏', zero), 5);
  assert.equal(AI.dispatchTroops(w, '許昌', '江夏', near1), 5);
});

test('R75 dispatchTroops：空城只派 rand(2)+1 = 1..2 人', () => {
  const w = mkWorld({
    許昌: mkCity({ owner: 'A', troops: 100, major: '甲' }),
    洛陽: mkCity({ troops: 0 }),
  }, { adj: { 許昌: ['洛陽'], 洛陽: ['許昌'] } });
  assert.equal(AI.dispatchTroops(w, '許昌', '洛陽', zero), 1);
  assert.equal(AI.dispatchTroops(w, '許昌', '洛陽', near1), 2);
});

test('R75 边界：城里 0 兵 → 0（原式 src[0x30]-1 = -1）', () => {
  const w = mkWorld({
    許昌: mkCity({ owner: 'A', troops: 0, major: '甲' }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙' }),
  }, { adj: { 許昌: ['江夏'], 江夏: ['許昌'] } });
  assert.equal(AI.dispatchTroops(w, '許昌', '江夏', zero), 0);
});

test('R75 边界：将只有 3 兵 → 2（min(5, 3-1)）', () => {
  const w = mkWorld({
    許昌: mkCity({ owner: 'A', troops: 3, major: '甲' }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙' }),
  }, { adj: { 許昌: ['江夏'], 江夏: ['許昌'] } });
  assert.equal(AI.dispatchTroops(w, '許昌', '江夏', zero), 2);
  // 1 兵 → 0，不能负数出兵
  w.cities['許昌'].troops = 1;
  assert.equal(AI.dispatchTroops(w, '許昌', '江夏', zero), 0);
});

test('R75 dispatchTroops：0x40C511 可投入上限生效（limit=2 → 出兵 2）', () => {
  const w = mkWorld({
    許昌: mkCity({ owner: 'A', troops: 100, major: '甲' }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '乙' }),
  }, { adj: { 許昌: ['江夏'], 江夏: ['許昌'] }, limitOf: () => 2 });
  assert.equal(AI.dispatchTroops(w, '許昌', '江夏', zero), 2);
});

// ================================================================ R76 Rate 权重
test('R76 scoreTarget：打玩家 200 / 打 ai 100 / 占空城 80/(d+1)', () => {
  const w = mkWorld({
    許昌: mkCity({ owner: 'A', troops: 50, major: '甲' }),
    江夏: mkCity({ owner: '玩家', troops: 5, major: '丙' }),
    宛: mkCity({ owner: 'B', troops: 5, major: '丁' }),
    洛陽: mkCity({ troops: 0 }),
  }, { adj: { 許昌: ['江夏', '宛', '洛陽'], 江夏: ['許昌'], 宛: ['許昌'], 洛陽: ['許昌'] } });

  assert.deepEqual(AI.scoreTarget(w, '許昌', '江夏'), { act: AI.ACT.ATTACK_PLAYER, rate: 200 });
  assert.deepEqual(AI.scoreTarget(w, '許昌', '宛'), { act: AI.ACT.ATTACK_AI, rate: 100 });
  // 相邻 = 跳数 1 → 80/(1+1) = 40
  assert.deepEqual(AI.scoreTarget(w, '許昌', '洛陽'), { act: AI.ACT.OCCUPY, rate: 40 });

  // 距离由 world.distanceOf 提供时按 d 走：d=3 → 80/4 = 20
  const far = mkWorld(w.cities, { ...w, distanceOf: () => 3 });
  assert.deepEqual(AI.scoreTarget(far, '許昌', '洛陽'), { act: AI.ACT.OCCUPY, rate: 20 });
});

// ================================================================ R73 ArgMaxRate + 哨兵 800
test('R73 argMaxRate：空表 → 0 / 取最大值 / 并列取后出现（联合压单城）/ 哨兵 800 → 无行动', () => {
  const t = AI.createTable();
  assert.equal(AI.argMaxRate(t), 0);
  assert.equal(AI.pickCandidate(t), null);

  for (const [act, rate] of [[AI.ACT.ATTACK_AI, 100], [AI.ACT.ATTACK_PLAYER, 200], [AI.ACT.OCCUPY, 40]]) {
    AI.addCandidate(t, { act, from: 'A', to: 'B', rate });
  }
  assert.equal(AI.argMaxRate(t), 1);
  assert.equal(AI.pickCandidate(t).act, AI.ACT.ATTACK_PLAYER);

  // 并列：两条 100，取后出现的下标 1 —— 0x468740 未定位，[推测] 取「后出现」；
  // 这么取的直接后果就是「聯合打玩家(200)」能压过「單城攻玩家(200)」，否则 ACT=7 恒为死代码
  const tie = AI.createTable();
  AI.addCandidate(tie, { act: AI.ACT.ATTACK_AI, from: 'A', to: 'B', rate: 100 });
  AI.addCandidate(tie, { act: AI.ACT.ATTACK_AI, from: 'A', to: 'C', rate: 100 });
  assert.equal(AI.argMaxRate(tie), 1);

  // 哨兵：插入一条 rate=800 的行后，argMax 返回 rows.length（= [0x4C39A0] = 无行动）
  const sent = AI.createTable();
  AI.addCandidate(sent, { act: AI.ACT.ATTACK_AI, from: 'A', to: 'B', rate: 100 });
  AI.addCandidate(sent, { act: AI.ACT.NONE, from: 'A', to: 'A', rate: AI.RATE.SENTINEL });
  assert.equal(AI.argMaxRate(sent), 2);
  assert.equal(AI.argMaxRate(sent), AI.tableSize(sent));
  assert.equal(AI.pickCandidate(sent), null);
});

test('R73 候选表上限 = 0x40（64 条，[0x4C39A0]）', () => {
  const t = AI.createTable();
  for (let i = 0; i < 70; i += 1) AI.addCandidate(t, { act: AI.ACT.OCCUPY, from: 'A', to: 'B', rate: 1 });
  assert.equal(AI.tableSize(t), 64);
  assert.equal(AI.MAX_CANDIDATES, 0x40);
  assert.equal(AI.addCandidate(t, { act: AI.ACT.OCCUPY, from: 'A', to: 'B', rate: 1 }), false);
});

// ================================================================ R73 四段式 + 每势力每月一个动作
test('R73 planForceMonth：四段都跑（内政/征兵/攻城/调将），ArgMax 选攻打玩家', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 60, money: 3000, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }, { name: '乙', str: 70, int: 70, status: '登' }] }),
    陳留: mkCity({ owner: 'A', troops: 10, money: 50, major: '', officers: [] }),
    江夏: mkCity({ owner: '玩家', troops: 5, major: '丙', officers: [{ name: '丙', str: 60, int: 60, status: '登' }] }),
  };
  const w = mkWorld(cities, { adj: { 許昌: ['江夏', '陳留'], 陳留: ['許昌'], 江夏: ['許昌'] } });
  const r = AI.planForceMonth(w, 'A', { rng: zero });

  assert.ok(r.stages.domestic >= 1, '陳留金 50 < 500 → 应从許昌補金');
  assert.equal(r.stages.recruit, 1, '許昌金 3000 兵 60 < 上限 150 → 即时徵兵一条');
  assert.ok(r.stages.attack >= 1, '許昌 → 江夏（玩家）');
  assert.equal(r.stages.move, 1, '陳留 0 武将 → 从許昌调 1 人');
  assert.equal(r.chosen.act, AI.ACT.ATTACK_PLAYER);
  assert.equal(r.chosen.rate, 200);
  assert.equal(r.chosen.b, 5);
  // 四段按原作顺序：徵兵在攻城之前已经把兵加到 100
  assert.equal(AI.troopsOf(w, '許昌'), 100);
});

test('R73 runMonth：每个 AI 势力每月只执行一个动作，玩家势力跳过', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 60, money: 3000, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 5, major: '丙', officers: [{ name: '丙', str: 60, int: 60, status: '登' }] }),
  };
  const w = mkWorld(cities, { adj: { 許昌: ['江夏'], 江夏: ['許昌'] } });
  const res = AI.runMonth(w, { playerId: '玩家', rng: zero });
  assert.equal(res.executed.length, 1);
  assert.equal(res.executed[0].force, 'A');
  assert.equal(res.executed[0].cand.act, AI.ACT.ATTACK_PLAYER);
  assert.equal(res.executed[0].result.ok, true);
  assert.equal(res.executed[0].result.kind, 'battle');
  // 出兵在 executeCandidate 里就从出发城扣掉（0x40D52F）
  assert.equal(AI.troopsOf(w, '許昌'), 95);
});

// ================================================================ R74 ACT 9 项
test('R74 ACT 表 9 项（0x487248，cp950 原字串）', () => {
  assert.equal(AI.ACT_NAMES.length, 9);
  assert.deepEqual(AI.ACT_NAMES, [
    '不明', '補金', '逃跑', '移動武將', '攻擊player', '攻擊ai', 'cheat', '聯合', '佔領空城',
  ]);
  assert.deepEqual(AI.ALL_ACTS, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(AI.ACT.NONE, 0);
  assert.equal(AI.ACT.GOLD, 1);
  assert.equal(AI.ACT.FLEE, 2);
  assert.equal(AI.ACT.MOVE_GENERAL, 3);
  assert.equal(AI.ACT.ATTACK_PLAYER, 4);
  assert.equal(AI.ACT.ATTACK_AI, 5);
  assert.equal(AI.ACT.CHEAT, 6);
  assert.equal(AI.ACT.JOIN, 7);
  assert.equal(AI.ACT.OCCUPY, 8);
  assert.equal(AI.ADDR.ACT_TABLE, 0x487248);
});

test('R74 ACT=1 補金：窮城从自家富城撥款，Rate 22..30，执行后钱到位', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 3000, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    陳留: mkCity({ owner: 'A', troops: 20, money: 0, major: '', officers: [] }),
  };
  const w = mkWorld(cities, { adj: { 許昌: ['陳留'], 陳留: ['許昌'] } });
  const t = AI.createTable();
  AI.planDomestic(w, 'A', t, {});
  const gold = t.rows.filter((r) => r.act === AI.ACT.GOLD);
  assert.equal(gold.length, 1);
  assert.equal(gold[0].from, '許昌');
  assert.equal(gold[0].to, '陳留');
  assert.ok(gold[0].rate >= AI.RATE_BAND.GOLD_MIN && gold[0].rate <= AI.RATE_BAND.GOLD_MAX);

  const res = AI.executeCandidate(w, gold[0], {});
  assert.equal(res.ok, true);
  assert.equal(res.kind, 'domestic');
  assert.equal(w.cities['陳留'].money, gold[0].a);
  assert.equal(w.cities['許昌'].money, 3000 - gold[0].a);
});

test('R74 ACT=2 逃跑：0 兵的城被敌城贴住 → 撤往自家后方，把金带走', () => {
  const cities = {
    陳留: mkCity({ owner: 'A', troops: 0, money: 400, major: '', officers: [] }),
    許昌: mkCity({ owner: 'A', troops: 80, money: 100, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 50, major: '丙' }),
  };
  const w = mkWorld(cities, { adj: { 陳留: ['許昌', '江夏'], 許昌: ['陳留'], 江夏: ['陳留'] } });
  const t = AI.createTable();
  AI.planDomestic(w, 'A', t, {});
  const flee = t.rows.filter((r) => r.act === AI.ACT.FLEE);
  assert.equal(flee.length, 1);
  assert.equal(flee[0].from, '陳留');
  assert.equal(flee[0].rate, AI.RATE_BAND.FLEE);
  const res = AI.executeCandidate(w, flee[0], {});
  assert.equal(res.ok, true);
  assert.equal(w.cities['陳留'].money, 0);
  assert.equal(w.cities[flee[0].to].money, 100 + 400);
});

test('R74 ACT=3 移動武將：空武将城从 2 武将城调 1 人，执行后太守补齐', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 60, money: 1000, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }, { name: '乙', str: 70, int: 60, status: '登' }] }),
    陳留: mkCity({ owner: 'A', troops: 20, money: 1000, major: '', officers: [] }),
  };
  const w = mkWorld(cities, { adj: { 許昌: ['陳留'], 陳留: ['許昌'] } });
  const t = AI.createTable();
  AI.planMoveGeneral(w, 'A', t);
  const mv = t.rows.filter((r) => r.act === AI.ACT.MOVE_GENERAL);
  assert.equal(mv.length, 1);
  assert.equal(mv[0].from, '許昌');
  assert.equal(mv[0].to, '陳留');
  assert.ok(mv[0].rate >= AI.RATE_BAND.MOVE_MIN && mv[0].rate <= AI.RATE_BAND.MOVE_MAX);
  const res = AI.executeCandidate(w, mv[0], {});
  assert.equal(res.ok, true);
  assert.equal(w.cities['許昌'].officers.length, 1);
  assert.equal(w.cities['陳留'].officers.length, 1);
  assert.equal(w.cities['陳留'].major, res.officer);
});

test('R74 ACT=6 cheat：只有 rules.cheat 开启才产生（原作触发条件未定位）', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 10, money: 100, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
  };
  const off = mkWorld(cities, { adj: { 許昌: [] }, rules: { cheat: false } });
  const t1 = AI.createTable();
  AI.planDomestic(off, 'A', t1, {});
  assert.equal(t1.rows.filter((r) => r.act === AI.ACT.CHEAT).length, 0);

  const on = mkWorld(structuredClone(cities), { adj: { 許昌: [] }, rules: { cheat: true } });
  const t2 = AI.createTable();
  AI.planDomestic(on, 'A', t2, {});
  const cheat = t2.rows.filter((r) => r.act === AI.ACT.CHEAT);
  assert.equal(cheat.length, 1);
  assert.equal(cheat[0].rate, AI.RATE_BAND.CHEAT);
  const res = AI.executeCandidate(on, cheat[0], {});
  assert.equal(res.ok, true);
  assert.equal(on.cities['許昌'].money, 100 + AI.COST.RECRUIT_GOLD);
});

test('R74 ACT=7 聯合：两座自家城夹同一目标 → 各出一半兵，打玩家 200 / 打 ai 50', () => {
  const mk = (dstOwner) => mkWorld({
    許昌: mkCity({ owner: 'A', troops: 20, money: 1000, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    陳留: mkCity({ owner: 'A', troops: 20, money: 1000, major: '乙', officers: [{ name: '乙', str: 70, int: 70, status: '登' }] }),
    江夏: mkCity({ owner: dstOwner, troops: 40, major: '丙', officers: [{ name: '丙', str: 60, int: 60, status: '登' }] }),
  }, { adj: { 許昌: ['江夏', '陳留'], 陳留: ['江夏', '許昌'], 江夏: ['許昌', '陳留'] } });

  const wp = mk('玩家');
  const tp = AI.createTable();
  AI.planAttack(wp, 'A', tp, { rng: zero });
  const joins = tp.rows.filter((r) => r.act === AI.ACT.JOIN);
  assert.equal(joins.length, 2, '两座城各产生一条联合候选');
  assert.equal(joins[0].rate, AI.RATE.JOIN_PLAYER);
  assert.equal(joins[0].rate, 200);
  assert.equal(joins[0].joinCity, '陳留');
  assert.equal(joins[0].a + joins[0].b, 5, '联合总出兵 = 需要的 5');
  const res = AI.executeCandidate(wp, joins[0], {});
  assert.equal(res.ok, true);
  assert.equal(res.kind, 'battle');
  assert.equal(res.troops, 5 * AI.TROOP_UNIT);

  const wa = mk('B');
  const ta = AI.createTable();
  AI.planAttack(wa, 'A', ta, { rng: zero });
  const joinAi = ta.rows.filter((r) => r.act === AI.ACT.JOIN);
  assert.equal(joinAi[0].rate, AI.RATE.JOIN_AI);
  assert.equal(joinAi[0].rate, 50);
});

test('R74 同月重复开战不重复结算：出手时记下的势力 vs 结算时的城主', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 30, money: 0, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    江夏: mkCity({ owner: 'B', troops: 10, major: '丁', officers: [{ name: '丁', str: 50, int: 50, status: '登' }] }),
  };
  const w = mkWorld(cities, { adj: { 許昌: ['江夏'], 江夏: ['許昌'] } });
  const res = AI.runMonth(w, { playerId: '玩家', rng: zero });
  const a = res.executed.find((x) => x.force === 'A');
  assert.ok(a, 'A 应出手');
  const cmd = a.result;
  // executeCandidate 在下命令这一刻记下攻守双方（结算可能晚于别人抢城）
  assert.equal(cmd.attacker, 'A');
  assert.equal(cmd.defender, 'B');
  // 假设同月另一家已经替 A 抢下了江夏 → 这条候选不该再打一遍
  w.cities['江夏'].owner = 'A';
  const held = w.cities['江夏'].troops;   // B 也在同一月出兵，被 executeCandidate 扣过了
  const bat = AI.resolveBattle(w, cmd, zero);
  assert.equal(bat.ok, true);
  assert.equal(bat.skipped, true);
  assert.equal(bat.captured, false);
  assert.equal(bat.reason, 'already-own');
  assert.equal(w.cities['江夏'].troops, held, '兵力不能因为重复开战被改');
  assert.equal(w.cities['江夏'].owner, 'A');
});

test('R74 ACT=8 佔領空城：runMonth 选中空城并直接易主', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 30, money: 0, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    洛陽: mkCity({ owner: '', troops: 0 }),
  };
  const w = mkWorld(cities, { adj: { 許昌: ['洛陽'], 洛陽: ['許昌'] } });
  const res = AI.runMonth(w, { playerId: '玩家', rng: zero });
  assert.equal(res.executed.length, 1);
  assert.equal(res.executed[0].cand.act, AI.ACT.OCCUPY);
  assert.equal(res.executed[0].cand.rate, 40);
  const bat = AI.resolveBattle(w, res.executed[0].result, zero);
  assert.equal(bat.ok, true);
  assert.equal(bat.captured, true);
  assert.equal(bat.empty, true);
  assert.equal(w.cities['洛陽'].owner, 'A');
  assert.equal(w.cities['洛陽'].troops, 1 * AI.TROOP_UNIT);
});

test('R74 ACT=0 不明 永不产生：四个规划器产出的候选里没有 act 0', () => {
  const cities = {
    許昌: mkCity({ owner: 'A', troops: 40, money: 3000, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }, { name: '乙', str: 70, int: 60, status: '登' }] }),
    陳留: mkCity({ owner: 'A', troops: 0, money: 10, major: '', officers: [] }),
    江夏: mkCity({ owner: '玩家', troops: 30, major: '丙' }),
    宛: mkCity({ owner: 'B', troops: 30, major: '丁' }),
    洛陽: mkCity({ troops: 0 }),
  };
  const wonly = mkWorld(cities, {
    adj: { 許昌: ['江夏', '宛', '洛陽', '陳留'], 陳留: ['許昌', '江夏'], 江夏: ['許昌', '陳留'], 宛: ['許昌'], 洛陽: ['許昌'] },
  });
  const t = AI.createTable();
  AI.planDomestic(wonly, 'A', t, {});
  AI.planAttack(wonly, 'A', t, { rng: zero });
  AI.planMoveGeneral(wonly, 'A', t);
  assert.ok(t.rows.length > 0);
  assert.equal(t.rows.filter((r) => r.act === AI.ACT.NONE).length, 0);
  // 打玩家、打 ai、占空城、補金、逃跑、調將都出现过（cheat 需 rules.cheat，联合另测）
  const acts = new Set(t.rows.map((r) => r.act));
  for (const a of [1, 2, 3, 4, 5, 8]) assert.ok(acts.has(a), `ACT ${a} 应出现`);
});

test('R74 每项有独立日志文案，且调试串照 0x40BECB 格式', () => {
  const w = mkWorld({
    許昌: mkCity({ owner: 'A', troops: 40, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 10, major: '丙' }),
  }, { adj: { 許昌: ['江夏'], 江夏: ['許昌'] } });
  const cand = { act: AI.ACT.ATTACK_PLAYER, from: '許昌', to: '江夏', b: 5, rate: 200 };
  assert.equal(AI.describeCandidate(w, cand), 'ACT=攻擊player, 從許昌40人 -> 江夏10人, 出兵5人，Rate=200');
  assert.match(AI.describeAction(w, cand), /攻 擊 player：許昌 → 江夏/);

  const join = { act: AI.ACT.JOIN, from: '許昌', to: '江夏', a: 2, b: 3, rate: 200, joinCity: '陳留' };
  assert.match(AI.describeCandidate(w, join), /聯合陳留/);
  assert.match(AI.describeAction(w, join), /聯 合：許昌 \+ 陳留 → 江夏/);

  const texts = [
    { act: AI.ACT.GOLD, from: '許昌', to: '江夏', a: 100 },
    { act: AI.ACT.FLEE, from: '許昌', to: '江夏', a: 100 },
    { act: AI.ACT.MOVE_GENERAL, from: '許昌', to: '江夏' },
    { act: AI.ACT.ATTACK_AI, from: '許昌', to: '江夏', b: 5 },
    { act: AI.ACT.CHEAT, from: '許昌', to: '許昌', a: 500, b: 40 },
    { act: AI.ACT.OCCUPY, from: '許昌', to: '洛陽', b: 1 },
    { act: AI.ACT.NONE, from: '許昌', to: '江夏' },
  ].map((c) => AI.describeAction(w, c));
  for (const t of texts) assert.ok(typeof t === 'string' && t.length > 0);
  assert.equal(new Set(texts).size, texts.length, '9 项文案互不相同');
});

// ================================================================ R76 优先级（Rate 排序）
test('R76 优先级：打玩家 200 > 打 ai 100 > 联合打 ai 50 > 占空城 40', () => {
  const build = () => mkWorld({
    許昌: mkCity({ owner: 'A', troops: 40, money: 1000, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    陳留: mkCity({ owner: 'A', troops: 40, money: 1000, major: '乙', officers: [{ name: '乙', str: 70, int: 70, status: '登' }] }),
    江夏: mkCity({ owner: '玩家', troops: 20, major: '丙' }),
    宛: mkCity({ owner: 'B', troops: 20, major: '丁' }),
    洛陽: mkCity({ troops: 0 }),
  }, { adj: { 許昌: ['江夏', '宛', '洛陽', '陳留'], 陳留: ['江夏', '許昌'], 江夏: ['許昌', '陳留'], 宛: ['許昌'], 洛陽: ['許昌'] } });

  const w = build();
  const t = AI.createTable();
  AI.planAttack(w, 'A', t, { rng: zero });
  const rates = t.rows.map((r) => r.rate);
  assert.ok(rates.includes(200));
  assert.ok(rates.includes(100));
  assert.ok(rates.includes(40));
  // 200 的两条：單城攻玩家 与 聯合打玩家（陳留+許昌夾江夏）。ArgMax 并列取后出现
  // → 聯合 胜出（[推测]，理由见 ai_model.js 的 argMaxRate 注释：否则 ACT=7 是死代码）
  assert.equal(AI.pickCandidate(t).act, AI.ACT.JOIN);
  assert.equal(AI.pickCandidate(t).rate, 200);
  assert.deepEqual(
    [AI.pickCandidate(t).from, AI.pickCandidate(t).joinCity].sort(),
    ['許昌', '陳留'].sort(),
    '联合部队来自 許昌 + 陳留 两城',
  );

  // 把合作城从邻接里摘掉 → 只剩單城攻玩家 200
  w.adj = { 許昌: ['江夏', '宛', '洛陽'], 陳留: ['許昌'], 江夏: ['許昌'], 宛: ['許昌'], 洛陽: ['許昌'] };
  const t1 = AI.createTable();
  AI.planAttack(w, 'A', t1, { rng: zero });
  assert.equal(AI.pickCandidate(t1).act, AI.ACT.ATTACK_PLAYER);

  // 打玩家的城换成 AI 的 → 选打 ai 100
  w.cities['江夏'].owner = 'B';
  const t2 = AI.createTable();
  AI.planAttack(w, 'A', t2, { rng: zero });
  assert.equal(AI.pickCandidate(t2).act, AI.ACT.ATTACK_AI);

  // 只剩空城 → 占空城 40
  w.cities['江夏'].owner = '';
  w.cities['宛'].owner = '';
  const t3 = AI.createTable();
  AI.planAttack(w, 'A', t3, { rng: zero });
  assert.equal(AI.pickCandidate(t3).act, AI.ACT.OCCUPY);
});

// ================================================================ R78 + R4 势力归属 / 君主灭亡
test('R78 buildForces/syncOwned：城→势力与 save.owned 双向对齐', () => {
  const save = {
    king: 'A',
    owned: ['許昌', '不存在城'],
    cities: {
      許昌: mkCity({ owner: 'A', troops: 10 }),
      洛陽: mkCity({ owner: 'A', troops: 10 }),
      江夏: mkCity({ owner: 'B', troops: 10 }),
      陳留: mkCity({ owner: '', troops: 10 }),
    },
  };
  const forces = AI.buildForces(save, {});
  assert.deepEqual(forces['A'].cities.sort(), ['洛陽', '許昌'].sort());
  assert.deepEqual(forces['B'].cities, ['江夏']);
  assert.equal(forces['A'].alive, true);

  AI.syncOwned(save);
  assert.deepEqual(save.owned, ['許昌']);
  assert.equal(save.cities['洛陽'].owner, '', 'owner===king 但不在 owned 的城要清成空城');
  assert.equal(save.cities['許昌'].owner, 'A');
});

test('R78 君主阵亡（默认）→ 势力灭亡，城归最近的势力；opts.inherit 才是「换 id 续命」', () => {
  const mkCities = () => ({
    洛陽: mkCity({ owner: '董卓', troops: 5, major: '董卓', officers: [{ name: '董卓', str: 90, int: 80, status: '登' }, { name: '華雄', str: 85, int: 60, status: '登' }] }),
    長安: mkCity({ owner: '董卓', troops: 5, major: '華雄', officers: [{ name: '華雄', str: 85, int: 60, status: '登' }] }),
    許昌: mkCity({ owner: 'A', troops: 50, major: '甲' }),
  });
  const adj = { 洛陽: ['許昌', '長安'], 長安: ['洛陽'], 許昌: ['洛陽'] };
  const mkForces = () => ({
    董卓: { id: '董卓', king: '董卓', alive: true, cities: ['洛陽', '長安'], flag: 0, ts: 0 },
    A: { id: 'A', king: 'A', alive: true, cities: ['許昌'], flag: 0, ts: 0 },
  });
  // 默认：君主死了势力就灭了（任务书 R78），城按「最近的势力」改嫁
  const w1 = mkWorld(mkCities(), { adj, forces: mkForces() });
  const r1 = AI.captureKingIn(w1, '洛陽', { major: '董卓', owner: '董卓' });
  assert.equal(r1.killed, true);
  assert.equal(r1.force, '董卓');
  assert.equal(r1.extinguished, true);
  assert.equal(r1.heir, '');
  assert.equal(w1.forces['董卓'].alive, false);
  assert.equal(w1.cities['洛陽'].owner, 'A');
  assert.equal(w1.cities['長安'].owner, 'A', '两块地都归最近的势力');
  // 可选规则 opts.inherit=true：同势力 STR+INT 最高的在职武將继位（[推测]，正式流程不开）
  const w2 = mkWorld(mkCities(), { adj, forces: mkForces() });
  const r2 = AI.captureKingIn(w2, '洛陽', { major: '董卓', owner: '董卓', inherit: true });
  assert.equal(r2.heir, '華雄');
  assert.equal(r2.extinguished, false);
  assert.equal(w2.cities['洛陽'].owner, '華雄');
  assert.equal(w2.cities['長安'].owner, '華雄');
  assert.equal(w2.forces['董卓'].alive, false);
  assert.equal(w2.forces['華雄'].alive, true);
});

test('R78 君主阵亡 + 无继任者 → 势力灭亡，城归最近的势力', () => {
  const cities = {
    宛: mkCity({ owner: '嚴白虎', troops: 5, major: '嚴白虎', officers: [{ name: '嚴白虎', str: 70, int: 50, status: '登' }] }),
    許昌: mkCity({ owner: 'A', troops: 50, major: '甲', officers: [{ name: '甲', str: 80, int: 70, status: '登' }] }),
    新野: mkCity({ owner: '', troops: 0 }),
  };
  const w = mkWorld(cities, {
    adj: { 宛: ['許昌', '新野'], 許昌: ['宛'], 新野: ['宛'] },
    forces: {
      嚴白虎: { id: '嚴白虎', king: '嚴白虎', alive: true, cities: ['宛'], flag: 0, ts: 0 },
      A: { id: 'A', king: 'A', alive: true, cities: ['許昌'], flag: 0, ts: 0 },
    },
  });
  const res = AI.captureKingIn(w, '宛', { major: '嚴白虎', owner: '嚴白虎' });
  assert.equal(res.killed, true);
  assert.equal(res.extinguished, true);
  assert.equal(res.heir, '');
  assert.equal(w.cities['宛'].owner, 'A', '最近的势力是許昌的 A');
  assert.equal(w.forces['嚴白虎'].alive, false);
});

test('R78 城数归零 → checkForceDeaths 判灭亡；applyKingDeaths 按名字批处理', () => {
  const w = mkWorld({ 許昌: mkCity({ owner: 'A', troops: 10, major: '甲' }) }, {
    forces: {
      A: { id: 'A', king: 'A', alive: true, cities: ['許昌'], flag: 0, ts: 0 },
      殘: { id: '殘', king: '殘', alive: true, cities: [], flag: 0, ts: 0 },
    },
  });
  assert.deepEqual(AI.checkForceDeaths(w), ['殘']);
  assert.equal(w.forces['殘'].alive, false);

  const w2 = mkWorld({
    宛: mkCity({ owner: '張角', troops: 5, major: '張角', officers: [{ name: '張角', str: 80, int: 70, status: '登' }] }),
    許昌: mkCity({ owner: 'A', troops: 50, major: '甲' }),
  }, {
    adj: { 宛: ['許昌'], 許昌: ['宛'] },
    forces: {
      張角: { id: '張角', king: '張角', alive: true, cities: ['宛'], flag: 0, ts: 0 },
      A: { id: 'A', king: 'A', alive: true, cities: ['許昌'], flag: 0, ts: 0 },
    },
  });
  const out = AI.applyKingDeaths(w2, ['張角']);
  assert.equal(out.length, 1);
  assert.equal(out[0].force, '張角');
  assert.equal(out[0].extinguished, true);
  assert.equal(w2.cities['宛'].owner, 'A');
});

test('R78 太守 != 城主：别家武将在别人城里挂名守城，不判君主阵亡', () => {
  const w = mkWorld({
    洛陽: mkCity({ owner: '董卓', troops: 5, major: '董卓', officers: [{ name: '董卓', str: 90, int: 80, status: '登' }] }),
    樊城: mkCity({ owner: 'A', troops: 9, major: '董卓', officers: [{ name: '董卓', str: 90, int: 80, status: '登' }] }),
    許昌: mkCity({ owner: 'A', troops: 50, major: '甲' }),
  }, {
    adj: { 洛陽: ['樊城'], 樊城: ['洛陽', '許昌'], 許昌: ['樊城'] },
    forces: {
      董卓: { id: '董卓', king: '董卓', alive: true, cities: ['洛陽'], flag: 0, ts: 0 },
      A: { id: 'A', king: 'A', alive: true, cities: ['樊城', '許昌'], flag: 0, ts: 0 },
    },
  });
  // 樊城 原本是 A 的城，太守却是 董卓 → 破樊城不该把董卓判死
  const res = AI.captureKingIn(w, '樊城', { major: '董卓', owner: 'A' });
  assert.equal(res.killed, false);
  assert.equal(w.forces['董卓'].alive, true);
  assert.equal(w.cities['洛陽'].owner, '董卓');
  // 而 洛陽 原本就是董卓的城，太守也是他 → 才算君主阵亡
  const res2 = AI.captureKingIn(w, '洛陽', { major: '董卓', owner: '董卓' });
  assert.equal(res2.killed, true);
  assert.equal(res2.extinguished, true);
});

test('R78 占空城不会判君主阵亡；不传 owner 就不猜（回归：破城后太守已被改写成攻方主将）', () => {
  const mk = () => mkWorld({
    北平: mkCity({ owner: '公孫瓚', troops: 145, major: '公孫瓚', officers: [{ name: '公孫瓚', str: 80, int: 70, status: '登' }] }),
    易京: mkCity({ owner: '', troops: 110 }),
  }, {
    adj: { 北平: ['易京'], 易京: ['北平'] },
    forces: { 公孫瓚: { id: '公孫瓚', king: '公孫瓚', alive: true, cities: ['北平'], flag: 0, ts: 0 } },
  });
  // 空城：原城主是 '' → 没人可死（曾经这里把攻方君主判死，剧本 1 一次灭 8 家）
  const w1 = mk();
  w1.cities['易京'].owner = '公孫瓚';        // resolveBattle 占城后的样子
  w1.cities['易京'].major = '公孫瓚';        // 连太守都改成了攻方主将
  assert.equal(AI.captureKingIn(w1, '易京', { major: '', owner: '' }).killed, false);
  assert.equal(w1.forces['公孫瓚'].alive, true);
  // 调用方漏传 owner：不猜，直接不判（宁可漏判也不误杀）
  const w2 = mk();
  assert.equal(AI.captureKingIn(w2, '易京', { major: '公孫瓚' }).killed, false);
  assert.equal(w2.forces['公孫瓚'].alive, true);
});

test('R78 玩家君主阵亡：playerId 跟着走（默认灭亡时清空，inherit 时换给继任者）', () => {
  const mkCities = () => ({
    許昌: mkCity({ owner: '玩家', troops: 5, major: '玩家', officers: [{ name: '玩家', str: 90, int: 90, status: '登' }, { name: '副將', str: 60, int: 60, status: '登' }] }),
    江夏: mkCity({ owner: 'B', troops: 50, major: '丁' }),
  });
  const adj = { 許昌: ['江夏'], 江夏: ['許昌'] };
  const mkForces = () => ({
    玩家: { id: '玩家', king: '玩家', alive: true, cities: ['許昌'], flag: 0, ts: 0 },
    B: { id: 'B', king: 'B', alive: true, cities: ['江夏'], flag: 0, ts: 0 },
  });
  // 默认：玩家君主阵亡 = 玩家势力灭亡，城归最近的势力；playerId 不能被留成已灭的 id
  const w1 = mkWorld(mkCities(), { adj, forces: mkForces() });
  const r1 = AI.captureKingIn(w1, '許昌', { major: '玩家', owner: '玩家' });
  assert.equal(r1.killed, true);
  assert.equal(r1.extinguished, true);
  assert.equal(w1.cities['許昌'].owner, 'B');
  assert.notEqual(w1.playerId, '玩家');

  // opts.inherit=true：换 id 续命，playerId 跟着换到继任者
  const w2 = mkWorld(mkCities(), { adj, forces: mkForces() });
  const r2 = AI.captureKingIn(w2, '許昌', { major: '玩家', owner: '玩家', inherit: true });
  assert.equal(r2.heir, '副將');
  assert.equal(r2.extinguished, false);
  assert.equal(w2.playerId, '副將', '玩家勢力換 id 後 playerId 要跟著換');
  assert.equal(w2.cities['許昌'].owner, '副將');
});

// ================================================================ R63 战绩累加（0x4084C9）
test('R63 updateRecord：胜累加、连胜+1、最高连胜取 max、败清连胜', () => {
  const s = { wins: 0, losses: 0, streak: 0, bestStreak: 0 };
  assert.deepEqual(Saves.updateRecord(s, true), { wins: 1, losses: 0, streak: 1, bestStreak: 1 });
  assert.deepEqual(Saves.updateRecord(s, true), { wins: 2, losses: 0, streak: 2, bestStreak: 2 });
  assert.deepEqual(Saves.updateRecord(s, false), { wins: 2, losses: 1, streak: 0, bestStreak: 2 });
  assert.deepEqual(Saves.updateRecord(s, true), { wins: 3, losses: 1, streak: 1, bestStreak: 2 });
  // 平局：连胜清 0，胜负场不动，最高连胜不退
  assert.deepEqual(Saves.updateRecord(s, 'draw'), { wins: 3, losses: 1, streak: 0, bestStreak: 2 });
  assert.deepEqual(Saves.recordOf(s), { wins: 3, losses: 1, streak: 0, bestStreak: 2 });
});

test('R63 recordOf/recordText：HUD 文案带连胜与最佳连胜', () => {
  assert.equal(Saves.recordText({ wins: 2, losses: 1, streak: 0, bestStreak: 1 }), '2 勝 1 敗');
  assert.equal(Saves.recordText({ wins: 2, losses: 1, streak: 2, bestStreak: 2 }), '2 勝 1 敗 · 2 連勝（最佳 2）');
  assert.equal(Saves.recordText({ wins: 5, losses: 1, streak: 1, bestStreak: 4 }), '5 勝 1 敗（最佳 4）');
  assert.deepEqual(Saves.recordOf({}), { wins: 0, losses: 0, streak: 0, bestStreak: 0 });
});

test('R63 newCampaign 新档带 streak/bestStreak 字段', () => {
  const sc = { id: 1, name: '群雄割據', cities: [{ NAME: '甲城', POPULATION: 50000, MONEY: 300 }, { NAME: '乙城', POPULATION: 40000, MONEY: 200 }] };
  const save = Saves.newCampaign(sc, { seed: 1 });
  assert.equal(save.streak, 0);
  assert.equal(save.bestStreak, 0);
  assert.equal(Saves.recordText(save), '0 勝 0 敗');
});

// ================================================================ R65 月度漂移（0x41B1BF）
test('R65 monthlyDrift：疲劳 −1；≥60 士气 −1；<70 士气 +1；士气 <40 忠诚 −1；否则 <90 忠诚 +1', () => {
  // ① 疲劳 5 → 4，士气 80 不漂，忠诚 95 不漂
  const s1 = { tire: { 甲: 5 }, morale: { 甲: 80 }, loyal: { 甲: 95 } };
  const d1 = AI.monthlyDrift(s1, { 許昌: ['甲'] });
  assert.equal(s1.tire['甲'], 4);
  assert.equal(s1.morale['甲'], 80);
  assert.equal(s1.loyal['甲'], 95);
  assert.equal(d1.tire.down, 1);

  // ② 疲劳 70 → 69，士气 80 ≥60 → 79
  const s2 = { tire: { 甲: 70 }, morale: { 甲: 80 }, loyal: { 甲: 95 } };
  AI.monthlyDrift(s2, { 許昌: ['甲'] });
  assert.equal(s2.tire['甲'], 69);
  assert.equal(s2.morale['甲'], 79);
  assert.equal(s2.loyal['甲'], 95);

  // ③ 士气 30 <70 → 31，但 31 <40 → 忠诚 95 → 94
  const s3 = { tire: { 甲: 0 }, morale: { 甲: 30 }, loyal: { 甲: 95 } };
  const d3 = AI.monthlyDrift(s3, { 許昌: ['甲'] });
  assert.equal(s3.morale['甲'], 31);
  assert.equal(s3.loyal['甲'], 94);
  assert.equal(d3.spirit.up, 1);
  assert.equal(d3.loyal.down, 1);

  // ④ 士气 50 ≥40 → 忠诚 <90 才 +1：士气 50 → 51（<70 自然 +1），忠诚 89 → 90
  const s4 = { tire: {}, morale: { 甲: 50 }, loyal: { 甲: 89 } };
  AI.monthlyDrift(s4, { 許昌: ['甲'] });
  assert.equal(s4.morale['甲'], 51);
  assert.equal(s4.loyal['甲'], 90);
});

test('R65 monthlyDrift parts:\'loyal\'：只漂忠诚，不动疲劳/士气（campaign.html 用这一段）', () => {
  const s = { tire: { 甲: 70 }, morale: { 甲: 80 }, loyal: { 甲: 95 } };
  const d = AI.monthlyDrift(s, { 許昌: ['甲'] }, { parts: 'loyal' });
  assert.equal(s.tire['甲'], 70);
  assert.equal(s.morale['甲'], 80);
  assert.equal(s.loyal['甲'], 95);
  assert.equal(d.tire.down, 0);
  assert.equal(d.spirit.down + d.spirit.up, 0);
});

test('R65 monthlyDrift：没有存档值时用原作初值（士气 80 / 忠诚 90 / 疲劳 0），rowOf 可覆盖忠诚', () => {
  const s = {};
  const d = AI.monthlyDrift(s, { 許昌: ['丙'] }, { rowOf: () => ({ LOYAL: 50 }) });
  // 疲劳 0 不再往下减（0x41B302 只在 >0 时减），所以不写回任何值
  assert.equal(d.tire.down, 0);
  assert.equal(s.tire['丙'], undefined);
  assert.equal(s.morale['丙'], 80);
  assert.equal(s.loyal['丙'], 51, 'garrison LOYAL 50 <90 → +1');
  assert.equal(d.loyal.up, 1);
  assert.equal(AI.GENERAL_INIT.spirit, 0x50);
  assert.equal(AI.GENERAL_INIT.loyal, 0x5a);
});

test('R65 常量对齐 04b5 §2.4 的硬地址阈值（0x3c / 0x46 / 0x28 / 0x5a）', () => {
  assert.equal(AI.DRIFT.TIRE_HIGH, 0x3c);
  assert.equal(AI.DRIFT.SPIRIT_LOW, 0x46);
  assert.equal(AI.DRIFT.SPIRIT_CRIT, 0x28);
  assert.equal(AI.DRIFT.LOYAL_HIGH, 0x5a);
  assert.equal(AI.DRIFT.LOYAL_MAX, 99);
});

// ================================================================ 总入口地址表（报告可核）
test('ADDR：AI 相关硬地址与原作一致（0x40D751 / 0x40C635 / 0x40CC10 / 0x320 哨兵）', () => {
  assert.equal(AI.ADDR.AI_ENTRY, 0x40d751);
  assert.equal(AI.ADDR.DISPATCH, 0x40c635);
  assert.equal(AI.ADDR.ARGMAX, 0x40cc10);
  assert.equal(AI.ADDR.PLAN_DOMESTIC, 0x40bfce);
  assert.equal(AI.ADDR.PLAN_RECRUIT, 0x40c1e4);
  assert.equal(AI.ADDR.PLAN_ATTACK, 0x40caf1);
  assert.equal(AI.ADDR.PLAN_MOVE, 0x40c34d);
  assert.equal(AI.ADDR.JOIN, 0x40c8ec);
  assert.equal(AI.ADDR.SCAN_CITIES, 0x40cbb6);
  assert.equal(AI.RATE.SENTINEL, 0x320);
  assert.equal(AI.DISPATCH_MAX, 5);
});
