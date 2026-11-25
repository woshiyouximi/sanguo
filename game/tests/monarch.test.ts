// @ts-nocheck
/**
 * tests/monarch.test.ts — R4 君主 / R78 势力·灭亡·继承 / R65 漂移摘要 的纯逻辑测试。
 *
 * 被测文件：`web/monarch_model.js`（无 DOM / 无 localStorage，可在 node 里直接跑）。
 * 每个用例都对着一条原作依据或一条已登记的近似（[推测]/[新设计]）：
 *   · `0x40975E` 君主不可俘 → 君主只有「阵亡 / 让位」两条退场路径
 *   · city+0x10 = 城归属，`0x4A64F0` = 玩家君主编号
 *   · generals.json 的 `Force` 是兵种适性，**不许**被当成势力
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../web/monarch_model.js';

/** 一座城（scenarios.json 形状） */
function mkCity(name, king = '') {
  return { NAME: name, KING: king, MAJOR: '', WISE: '', POPULATION: 10000, DEFENSE: 50, MONEY: 100, RATE: 3 };
}

/** 一份最小存档：有势力表、城归属、武将表 */
function mkSave(over = {}) {
  const cities = {
    洛陽: { owner: '何進', troops: 300, pop: 20000, money: 300 },
    虎牢關: { owner: '何進', troops: 200, pop: 9000, money: 120 },
    譙: { owner: '孔岫', troops: 180, pop: 8000, money: 90 },
    北平: { owner: '公孫瓚', troops: 260, pop: 12000, money: 140 },
  };
  return {
    month: 7,
    king: '何進',
    monarch: '何進',
    force: '何進',
    monarchSince: 1,
    owned: ['洛陽', '虎牢關'],
    cities,
    forces: {
      何進: { id: '何進', king: '何進', flag: 26, alive: true, cities: ['洛陽', '虎牢關'], ts: 0 },
      孔岫: { id: '孔岫', king: '孔岫', flag: 12, alive: true, cities: ['譙'], ts: 0 },
      公孫瓚: { id: '公孫瓚', king: '公孫瓚', flag: 3, alive: true, cities: ['北平'], ts: 0 },
    },
    ...over,
  };
}

const ALL_CITIES = [mkCity('洛陽'), mkCity('虎牢關'), mkCity('譙'), mkCity('北平')];

/** 何進势力的在职武将（曹操/袁紹 是真实家臣；盧植 是部下） */
const HEJIN_OFFICERS = [
  { name: '何進', str: 61, int: 41, loyal: 100, status: '登' },
  { name: '曹操', str: 82, int: 91, loyal: 72, status: '登' },
  { name: '袁紹', str: 74, int: 70, loyal: 65, status: '登' },
  { name: '盧植', str: 70, int: 84, loyal: 88, status: '登' },
];

// ---------------------------------------------------------------------------
// §1 君主/势力三字段
// ---------------------------------------------------------------------------
test('R4 setMonarch 一次写齐 monarch / force / monarchSince / king', () => {
  const s = mkSave({ monarch: '', force: '', monarchSince: 0, king: '' });
  const r = M.setMonarch(s, '何進', { month: 1 });
  assert.equal(r.ok, true);
  assert.equal(s.monarch, '何進');
  assert.equal(s.force, '何進');
  assert.equal(s.monarchSince, 1);
  assert.equal(s.king, '何進');
  assert.equal(r.prev, '');
  assert.equal(r.changed, true);
});

test('R4 monarchOf / forceIdOf 对老档回退到 save.king', () => {
  const old = { king: '孫堅', cities: {}, forces: {} };
  assert.equal(M.monarchOf(old), '孫堅');
  assert.equal(M.forceIdOf(old), '孫堅');
  assert.equal(M.forceNameOf(old), '孫堅');
  // 新档优先读新字段
  assert.equal(M.monarchOf({ king: '孫堅', monarch: '孫策', force: '孫堅' }), '孫策');
  assert.equal(M.forceIdOf({ king: '孫堅', monarch: '孫策', force: '孫堅' }), '孫堅');
  // 空档不抛
  assert.equal(M.monarchOf(null), '');
  assert.equal(M.forceIdOf(undefined), '');
});

test('R4 势力名不随君主变（继承后 force 仍是初代君主名）', () => {
  const s = mkSave();
  M.inheritForce(s, '何進', '曹操', { month: 9 });
  assert.equal(M.forceIdOf(s), '何進');
  assert.equal(M.monarchOf(s), '曹操');
});

// ---------------------------------------------------------------------------
// §2 同族/继承
// ---------------------------------------------------------------------------
test('R78 clanOf 先吃复姓：公孫越 与 公孫瓚 同族，孫堅 与 孫策 同族', () => {
  assert.equal(M.clanOf('公孫越'), '公孫');
  assert.equal(M.clanOf('諸葛亮'), '諸葛');
  assert.equal(M.clanOf('孫堅'), '孫');
  assert.equal(M.clanOf(''), '');
  assert.equal(M.sameClan('公孫越', '公孫瓚'), true);
  assert.equal(M.sameClan('孫策', '孫堅'), true);
  assert.equal(M.sameClan('曹操', '曹仁'), true);
  assert.equal(M.sameClan('曹操', '袁紹'), false);
  // 「公」与「公孫」不是一家
  assert.equal(M.sameClan('公孫瓚', '公明'), false);
});

test('R78 武将状态：数字 1/2/8 与 登/俘/野 等价，未知按在職', () => {
  assert.equal(M.normStatus(1), '登');
  assert.equal(M.normStatus(2), '俘');
  assert.equal(M.normStatus(8), '野');
  assert.equal(M.normStatus('野'), '野');
  assert.equal(M.normStatus('俘虜'), '俘');
  assert.equal(M.normStatus('登'), '登');
  assert.equal(M.normStatus(undefined), '登');
  assert.equal(M.normStatus('亂碼'), '登');
});

test('R78 normOfficer 只认 LoyalKing —— 绝不把 Force（兵种适性）当势力', () => {
  const o = M.normOfficer({ NAME: '公孫越', STR: 64, INT: 40, LOYAL: 71, Force: '騎', UseForce: '弩', LoyalKing: '公孫瓚' });
  assert.equal(o.name, '公孫越');
  assert.equal(o.str, 64);
  assert.equal(o.int, 40);
  assert.equal(o.loyal, 71);
  assert.equal(o.loyalKing, '公孫瓚');
  assert.equal('force' in o, false, 'Force 是兵种适性，不能出现在武将档案里');
  assert.equal('Force' in o, false);
  // 字符串也能收
  assert.equal(M.normOfficer('華佗').name, '華佗');
  assert.equal(M.normOfficer(null), null);
});

test('R78 继承排序：同族 > 忠诚 > 能力', () => {
  const officers = [
    { name: '何進', str: 61, int: 41, loyal: 100, status: '登' }, // 死者本人，应排除
    { name: '曹操', str: 82, int: 91, loyal: 72, status: '登' },  // 能力最高，但不同族
    { name: '盧植', str: 70, int: 84, loyal: 88, status: '登' },  // 忠诚更高
    { name: '何苗', str: 40, int: 30, loyal: 55, status: '登' },  // 同族但能力低
  ];
  const list = M.successionList('何進', officers, { dead: '何進' });
  assert.deepEqual(list.map((o) => o.name), ['何苗', '盧植', '曹操']);
  assert.equal(list[0].clan, true);
  assert.equal(M.pickSuccessor('何進', officers, { dead: '何進' }), '何苗');
});

test('R78 继承排除俘虏与在野；无人可继 → 空串', () => {
  const officers = [
    { name: '何進', str: 1, int: 1, status: '登' },
    { name: '張三', str: 90, int: 90, status: '俘' },
    { name: '李四', str: 80, int: 80, status: '野' },
  ];
  assert.equal(M.pickSuccessor('何進', officers, { dead: '何進' }), '');
  assert.deepEqual(M.successionList('何進', officers, { dead: '何進' }), []);
  // 空表不抛
  assert.equal(M.pickSuccessor('何進', null, { dead: '何進' }), '');
});

// ---------------------------------------------------------------------------
// §3 让位 / 继承
// ---------------------------------------------------------------------------
test('R4 让位：换 monarch 与 monarchSince，势力 id 与城池不变', () => {
  const s = mkSave();
  const r = M.abdicate(s, '曹操', { month: 8 });
  assert.equal(r.ok, true);
  assert.equal(r.from, '何進');
  assert.equal(r.to, '曹操');
  assert.equal(s.monarch, '曹操');
  assert.equal(s.monarchSince, 8);
  assert.equal(s.force, '何進', '势力名不变');
  assert.equal(s.forces['何進'].king, '曹操', 'forces.king 也要跟着换');
  assert.deepEqual(s.forces['何進'].cities, ['洛陽', '虎牢關']);
  // 非法动作不落档
  assert.equal(M.abdicate(s, '曹操', { month: 9 }).ok, false);
  assert.equal(M.abdicate(s, '', { month: 9 }).ok, false);
  assert.equal(M.monarchOf(s), '曹操');
});

test('R4 让位候选：只列本势力在职武将，排除现任君主', () => {
  const s = mkSave();
  const cities = [mkCity('洛陽'), mkCity('虎牢關'), mkCity('譙')];
  const byCity = {
    洛陽: [{ name: '何進', str: 61, int: 41, loyal: 100, status: '登' }, { name: '曹操', str: 82, int: 91, loyal: 72, status: '登' }],
    虎牢關: [{ name: '盧植', str: 70, int: 84, loyal: 88, status: '登' }, { name: '華佗', str: 30, int: 92, loyal: 60, status: '野' }],
    譙: [{ name: '孔岫', str: 50, int: 50, loyal: 90, status: '登' }], // 別家勢力，不该出现
  };
  const list = M.abdicateCandidates(s, { cities, officersByCity: byCity });
  assert.deepEqual(list.map((o) => o.name), ['盧植', '曹操'], '同族优先，其次忠誠 88 > 72');
  assert.equal(list[0].city, '虎牢關');
});

test('R78 继承：势力 id / 旗色 / 城列表不变，只换君主；我方同步 monarch', () => {
  const s = mkSave();
  const r = M.inheritForce(s, '何進', '盧植', { month: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.player, true);
  assert.equal(s.forces['何進'].king, '盧植');
  assert.equal(s.forces['何進'].alive, true);
  assert.deepEqual(s.forces['何進'].cities, ['洛陽', '虎牢關']);
  assert.equal(s.forces['何進'].flag, 26);
  assert.equal(M.monarchOf(s), '盧植');
  assert.equal(s.monarchSince, 10);
  assert.equal(s.force, '何進');
  // AI 势力继承不动玩家字段
  M.inheritForce(s, '孔岫', '華佗', { month: 10 });
  assert.equal(s.forces['孔岫'].king, '華佗');
  assert.equal(M.monarchOf(s), '盧植');
});

// ---------------------------------------------------------------------------
// §4 灭亡
// ---------------------------------------------------------------------------
test('R78 残将归宿：低忠诚愿降，高忠诚/同族在野（LOYAL_SURRENDER=60 为 [推测]）', () => {
  assert.equal(M.MONARCH_SRC.LOYAL_SURRENDER, 60);
  assert.equal(M.decideFate({ name: '甲', loyal: 30 }), 'surrender');
  assert.equal(M.decideFate({ name: '乙', loyal: 59 }), 'surrender');
  assert.equal(M.decideFate({ name: '丙', loyal: 60 }), 'wild');
  assert.equal(M.decideFate({ name: '丁', loyal: 95 }), 'wild');
  // 同族不事二主
  assert.equal(M.decideFate({ name: '公孫越', loyal: 20, loyalKing: '公孫瓚' }), 'wild');
  assert.equal(M.FATE_TEXT.surrender, '投降');
  assert.equal(M.FATE_TEXT.wild, '在野');
});

test('R78 灭亡：forces.alive=false / cities=[] / endedAt，残将写进 save.fate', () => {
  const s = mkSave();
  const r = M.extinguish(s, '孔岫', {
    month: 12,
    dead: '孔岫',
    officers: [
      { name: '孔岫', str: 50, int: 50, loyal: 90, status: '登' }, // 君主本人已死，不算残将
      { name: '華佗', str: 30, int: 92, loyal: 92, status: '登' },
      { name: '張三', str: 40, int: 40, loyal: 30, status: '登' },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'extinct');
  assert.equal(s.forces['孔岫'].alive, false);
  assert.deepEqual(s.forces['孔岫'].cities, []);
  assert.equal(s.forces['孔岫'].endedAt, 12);
  assert.deepEqual(r.surrender, ['張三']);
  assert.deepEqual(r.wild, ['華佗']);
  assert.equal(s.fate['華佗'].fate, 'wild');
  assert.equal(s.fate['張三'].fate, 'surrender');
  assert.equal(s.fate['孔岫'], undefined, '君主本人不进残将表');
  // 幂等：已亡势力再灭不炸
  const again = M.extinguish(s, '孔岫', { month: 13 });
  assert.equal(again.ok, true);
  assert.equal(again.reason, 'already-dead');
});

test('R78 我方势力灭亡：monarch/force 清空（顶栏回「未選」）', () => {
  const s = mkSave();
  M.extinguish(s, '何進', { month: 15, dead: '何進', officers: [] });
  assert.equal(M.monarchOf(s), '');
  assert.equal(M.forceIdOf(s), '');
  assert.equal(s.forces['何進'].alive, false);
});

test('R78 君主阵亡且无城 → 灭亡；还有城 → 同势力继承（势力名/城不变）', () => {
  // 有城 + 有继任
  const a = mkSave();
  const ra = M.kingDeath(a, '何進', { month: 9, dead: '何進', remaining: 1, officers: HEJIN_OFFICERS });
  assert.equal(ra.dead, true);
  assert.equal(ra.extinct, false);
  assert.equal(ra.reason, 'inherit');
  assert.ok(['曹操', '袁紹', '盧植'].includes(ra.heir));
  assert.equal(a.forces['何進'].king, ra.heir);
  assert.deepEqual(a.forces['何進'].cities, ['洛陽', '虎牢關']);
  assert.equal(a.forces['何進'].flag, 26);
  // 无城 → 灭
  const b = mkSave();
  const rb = M.kingDeath(b, '孔岫', { month: 11, dead: '孔岫', remaining: 0, officers: [{ name: '華佗', loyal: 92, status: '登' }] });
  assert.equal(rb.extinct, true);
  assert.equal(b.forces['孔岫'].alive, false);
  assert.deepEqual(rb.fates.map((f) => f.name), ['華佗']);
  // 已亡势力重复调用是 no-op
  const rc = M.kingDeath(b, '孔岫', { month: 12, dead: '孔岫', remaining: 0 });
  assert.equal(rc.dead, false);
  assert.equal(rc.reason, 'already-dead');
  // 没有 force id 不写入
  assert.equal(M.kingDeath(mkSave(), '', {}).reason, 'no-force');
});

// ---------------------------------------------------------------------------
// §5 势力聚合
// ---------------------------------------------------------------------------
test('R78 forceRoster：势力 → 城 → 武将，0 城势力按灭亡算，我方排最前', () => {
  const s = mkSave();
  const byCity = {
    洛陽: [{ name: '何進', str: 61, int: 41, loyal: 100, status: '登' }, { name: '曹操', str: 82, int: 91, loyal: 72, status: '登' }],
    虎牢關: [{ name: '盧植', str: 70, int: 84, loyal: 88, status: '登' }],
    譙: [{ name: '孔岫', str: 50, int: 50, loyal: 90, status: '登' }, { name: '華佗', str: 30, int: 92, loyal: 92, status: '野' }],
    北平: [{ name: '公孫瓚', str: 75, int: 60, loyal: 95, status: '登' }, { name: '公孫越', str: 64, int: 40, loyal: 71, status: '登' }],
  };
  const roster = M.forceRoster(s, { cities: ALL_CITIES, officersByCity: byCity });
  assert.deepEqual(roster.map((r) => r.id), ['何進', '公孫瓚', '孔岫']);
  const he = roster[0];
  assert.equal(he.player, true);
  assert.equal(he.monarch, '何進');
  assert.equal(he.flag, 26);
  assert.deepEqual(he.cities, ['洛陽', '虎牢關']);
  assert.equal(he.cityCount, 2);
  assert.equal(he.officerCount, 3, '只算在职（曹操/盧植/何進）');
  assert.equal(he.officers.length, 3);
  const kong = roster.find((r) => r.id === '孔岫');
  assert.equal(kong.cityCount, 1);
  assert.equal(kong.officerCount, 1, '華佗是在野，不算在职');
  // 声明存续但 0 城 → 灭亡（洛阳/虎牢关 已被打掉，只剩别家的城）
  const dead = mkSave({ forces: { 何進: { id: '何進', king: '何進', flag: 26, alive: true, cities: [], ts: 0 } } });
  const r2 = M.forceRoster(dead, { cities: [mkCity('譙'), mkCity('北平')], officersByCity: byCity });
  assert.equal(r2.find((r) => r.id === '何進').alive, false);
  assert.equal(r2.find((r) => r.id === '何進').declared, true);
});

test('R78 forceDetail：武将忠誠/士氣/疲勞读存档，覆盖 generals.json 的 LOYAL', () => {
  const s = mkSave({ loyal: { 曹操: 41 }, morale: { 曹操: 55 }, tire: { 曹操: 62 } });
  const byCity = { 洛陽: [{ name: '曹操', str: 82, int: 91, loyal: 72, status: '登' }] };
  const d = M.forceDetail(s, '何進', {
    cities: [mkCity('洛陽')],
    officersByCity: byCity,
    rowOf: (name) => (name === '曹操' ? { NAME: '曹操', STR: 82, INT: 91, LOYAL: 72 } : null),
  });
  assert.equal(d.id, '何進');
  const cao = d.officers[0];
  assert.equal(cao.loyal, 41, '存档忠诚优先于 LOYAL');
  assert.equal(cao.spirit, 55);
  assert.equal(cao.tire, 62);
  assert.equal(cao.statusText, '在職');
  // 没存档时退回 LOYAL
  const d2 = M.forceDetail(mkSave(), '孔岫', {
    cities: [mkCity('譙')],
    officersByCity: { 譙: [{ name: '華佗', status: '野' }] },
    rowOf: () => ({ LOYAL: 92 }),
  });
  assert.equal(d2.officers[0].loyal, 92);
  assert.equal(d2.officers[0].statusText, '在野');
  assert.equal(M.forceDetail(mkSave(), '不存在'), null);
});

// ---------------------------------------------------------------------------
// §6 R65 漂移摘要
// ---------------------------------------------------------------------------
test('R65 recordDrift 把月度漂移记进存档，driftText 可直接上战报/城详情', () => {
  const s = mkSave();
  const rec = M.recordDrift(s, {
    tire: { down: 3 },
    spirit: { down: 1, up: 2, skipped: 0 },
    loyal: { down: 1, up: 12, skipped: 0 },
    names: 18,
  }, 8);
  assert.equal(rec.month, 8);
  assert.equal(s.drift.loyalUp, 12);
  assert.equal(s.drift.names, 18);
  assert.equal(M.driftText(s), '第1年8月：疲勞 -3 · 士氣 +2/-1 · 忠誠 +12/-1（18 人）');
  // 无变化
  M.recordDrift(s, { tire: { down: 0 }, spirit: { down: 0, up: 0 }, loyal: { down: 0, up: 0 }, names: 2 }, 9);
  assert.equal(M.driftText(s), '第1年9月：全員無變化（2 人）');
  // 空档不抛
  assert.equal(M.driftSummary({}), null);
  assert.equal(M.driftText({}), '');
});

test('R65 monthTag 与 HUD 同口径（第 13 月 = 第2年1月）', () => {
  assert.equal(M.monthTag(1), '第1年1月');
  assert.equal(M.monthTag(13), '第2年1月');
  assert.equal(M.monthTag(0), '第1年1月');
});

// ---------------------------------------------------------------------------
// §7 R75 出兵上限 / 战报文本
// ---------------------------------------------------------------------------
test('R75 troopCapOf = min(等级×5,100)，与 deploy.html:323 的 SOLDIER_CAP 同口径', () => {
  assert.equal(M.troopCapOf(1), 5);
  assert.equal(M.troopCapOf(10), 50);
  assert.equal(M.troopCapOf(20), 100);
  assert.equal(M.troopCapOf(30), 100);
  assert.equal(M.troopCapOf(0), 5, '等级非法按 1 级算 → 5');
  assert.equal(M.troopCapOf(-5), 5);
  assert.equal(M.troopCapOf('12'), 60);
  assert.equal(M.troopCapOf(undefined), 5);
});

test('R78 fateText 一行写完残将归宿', () => {
  assert.equal(M.fateText([]), '殘將 0 人（城中已無武將）');
  assert.equal(
    M.fateText([{ name: '張三', fate: 'surrender' }, { name: '華佗', fate: 'wild' }]),
    '殘將 2 人：降 1（張三） / 在野 1（華佗）',
  );
  assert.equal(M.fateText([{ name: '甲', fate: 'surrender' }]), '殘將 1 人：降 1（甲）');
});

// ---------------------------------------------------------------------------
// §8 R4 新开局：saves.newCampaign 从剧本 KING 种君主（campaign.html 的 ensureKing 也走同一口径）
// ---------------------------------------------------------------------------
import * as Saves from '../web/saves.js';

/** 一个最小剧本（scenarios.json 形状，够 newCampaign 用） */
function mkScenario(rows) {
  return {
    id: 1,
    cities: rows.map(([name, king]) => ({
      NAME: name, KING: king, MAJOR: '', WISE: '',
      POPULATION: 12000, DEFENSE: 60, MONEY: 200, RATE: 3,
    })),
  };
}

test('R4 新开局从剧本首城的 KING 种 monarch / force / monarchSince', () => {
  // 首城是空城（KING 缺失/数字转换残留）时，取第一座有 KING 的城
  const sc = mkScenario([['許昌', 0], ['洛陽', '何進'], ['虎牢關', '何進'], ['譙', '孔岫']]);
  const s = Saves.newCampaign(sc, { ts: 1 });
  assert.equal(s.monarch, '何進');
  assert.equal(s.force, '何進');
  assert.equal(s.monarchSince, 1);
  assert.equal(s.king, '何進');
  // 新局还没有势力表/残将归宿/漂移摘要，交给 campaign 反建
  assert.deepEqual(s.forces, {});
  assert.deepEqual(s.fate, {});
  assert.equal(s.drift, null);
});

test('R4 开场三城 KING 不一致时，君主取「第一座有 KING 的城」而不是硬编码', () => {
  const sc = mkScenario([['北平', '公孫瓚'], ['易京', '公孫瓚'], ['鄴', '韓馥']]);
  const s = Saves.newCampaign(sc, { ts: 1 });
  assert.equal(s.monarch, '公孫瓚');
  assert.deepEqual(s.owned, ['北平', '易京', '鄴']);
  assert.equal(s.force, '公孫瓚');
});

test('R4 opts.king 显式给君主时优先于剧本 KING（用于「换君主」重开）', () => {
  const sc = mkScenario([['洛陽', '何進'], ['虎牢關', '何進']]);
  const s = Saves.newCampaign(sc, { ts: 1, king: '曹操' });
  assert.equal(s.monarch, '曹操');
  assert.equal(s.force, '曹操');
  assert.equal(s.king, '曹操');
});

test('R4 老档（只有 king、没有三栏）经 setMonarch 迁移后，势力 id 不跟着君主名变', () => {
  const s = mkSave({ monarch: undefined, force: undefined, monarchSince: undefined });
  assert.equal(M.monarchOf(s), '何進', 'monarchOf 回退到 king');
  assert.equal(M.forceIdOf(s), '何進');
  // 继承后：君主换人，势力 id 仍是 何進（城 owner / 旗色不变）
  const r = M.inheritForce(s, '何進', '曹操', { month: 9 });
  assert.equal(r.ok, true);
  assert.equal(M.monarchOf(s), '曹操');
  assert.equal(M.forceIdOf(s), '何進');
  assert.equal(s.forces['何進'].king, '曹操');
  // 老档字段缺失也不抛
  assert.equal(M.monarchOf({}), '');
  assert.equal(M.forceIdOf({}), '');
});

