// @ts-nocheck —— 被测模块 web/saves.js 是浏览器端的无类型 ESM（tsconfig 没有 allowJs），
// 本文件的验收口径是 `node --test`，断言一律 assert/strict。
//
// R70 存档系统（10 槽容器 / 60 城摘要 / 400 将等级经验 / 老档自动升级）
// + R84 v3（字段语义对齐原作：year / ledger / generalStatus / weapon / horse / thing）
// + 势力分色板（14 家固定色 + 备色 + 无主中性色）。
// 全部纯函数断言：没有 DOM、没有 localStorage（存储用下面的内存桩）、没有随机。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as S from '../web/saves.js';

// ---------------------------------------------------------------- 夹具

/** scenarios.json 是 [{id,system,file,kings,cities,paths}]，没有 name（页面从 sysRaw.Times0N 取） */
const RAW = JSON.parse(fs.readFileSync(new URL('../data/scenarios.json', import.meta.url), 'utf8'));
const SCEN = RAW.map((s, i) => ({ ...s, i, id: Number(s.id) || i + 1, name: '劇本' + (i + 1) }));
const S0 = SCEN[0];

/** v3 相对 v2 新增的 7 个顶层字段（迁移/往返测试共用；顺序同 SNAPSHOT_REQUIRED） */
const V3_KEYS = ['year', 'yearFlag', 'ledger', 'generalStatus', 'weapon', 'horse', 'thing'];

/** 内存版 localStorage：getItem/setItem/removeItem 就够 saves.js 用 */
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _dump: () => Object.fromEntries(m),
  };
}

/** cityDefs 的 info 回调（入参是城名）：给每座城一个稳定的 owner/太守/军师/名册（不依赖 garrison.json） */
function infoOf(name) {
  const i = S0.cities.findIndex((c) => c.NAME === name);
  const force = ['公孫瓚', '劉焉', '張角', '韓馥'][i % 4];
  return {
    owner: i % 9 === 0 ? '' : force,       // 每 9 座留 1 座无主，顺带测空城
    major: i % 5 === 0 ? '' : '太守' + i,
    wise: i % 7 === 0 ? '' : '軍師' + i,
    roster: i % 3 === 0 ? [] : ['將甲' + i, '將乙' + i],
  };
}

/** 已写好 60 城摘要的快照（ts 固定，避免断言依赖当前时间） */
function preparedSnap() {
  const snap = S.newCampaign(S0, { ts: 1700000000000 });
  return S.prepareSnapshot(snap, S0.cities, { info: infoOf });
}

/** 把 v3 快照退回 v2 形状（去掉 v3 的 7 个键、v 改 2）—— 模拟本轮上线前写下的老档 */
function asV2(snap) {
  const out = JSON.parse(JSON.stringify(snap));
  for (const k of V3_KEYS) delete out[k];
  out.v = 2;
  return out;
}

// ---------------------------------------------------------------- 1. 结构完整性

test('newCampaign 产出的存档结构完整（v3 必填字段全在、60 城 3 城起家）', () => {
  const snap = S.newCampaign(S0, { ts: 1700000000000 });
  assert.equal(S.SNAPSHOT_VERSION, 3);              // R84：v2 → v3
  assert.deepEqual(S.SNAPSHOT_STEPS.map((h) => [h.from, h.to]), [[0, 2], [2, 3]]);
  assert.equal(snap.v, S.SNAPSHOT_VERSION);
  assert.equal(snap.month, 1);
  assert.equal(snap.gold, 1200);
  assert.equal(snap.scenario, 1);
  assert.equal(snap.ts, 1700000000000);
  assert.equal(Object.keys(snap.cities).length, 60);   // 原作段2 固定 64 槽，本作 60 城 → 60/64 差异
  assert.equal(snap.owned.length, 3);
  for (const c of S0.cities.slice(0, 3)) assert.ok(snap.owned.includes(c.NAME));
  // 400 将等级/经验、名册、任命、忠誠/疲勞/士氣、勢力表、殘將歸宿都要有容器
  const maps = ['roster', 'appointed', 'generalLevel', 'generalExp', 'learned', 'loyal', 'tire', 'morale',
    'forces', 'fate', 'generalStatus', 'weapon', 'horse', 'thing'];
  for (const k of maps) {
    assert.equal(typeof snap[k], 'object', k);
    assert.ok(snap[k] && !Array.isArray(snap[k]), k);
  }
  assert.deepEqual(snap.roster._moved, {});
  assert.equal(snap.drift, null);
  assert.deepEqual(snap.armies, []);
  // v3：时间 / 武将档案一次写全（缺一个 snapshotIsCurrent 就假，新开档会白跑迁移）
  assert.equal(snap.year, 1);
  assert.equal(snap.yearFlag, 0);
  assert.deepEqual(snap.generalStatus, {});
  assert.deepEqual(snap.weapon, {});
  assert.deepEqual(snap.horse, {});
  assert.deepEqual(snap.thing, {});
  // 账本故意不写：R7 语义「没结过账就没有账本」（yearsettle_r7:96 硬约束，迁移也不替人补）
  assert.equal(snap.ledger, undefined);
  // v3 且字段齐 → upgradeSnapshot 认为"无需升级"，不拷贝
  const up = S.upgradeSnapshot(snap);
  assert.equal(up.changed, false);
  assert.equal(up.from, 3);
  assert.equal(up.snapshot, snap);
});

test('prepareSnapshot 写出 60 城摘要：troops/pop/money/def/prep/太守/军师/roster 齐全', () => {
  const snap = preparedSnap();
  assert.equal(Object.keys(snap.cities).length, 60);
  for (const cd of S0.cities) {
    const st = snap.cities[cd.NAME];
    assert.ok(st, cd.NAME);
    for (const k of ['owner', 'major', 'wise', 'roster', 'officers', 'flag', 'troops', 'pop', 'money',
      'def', 'cav', 'inf', 'prep', 'prepCap', 'rate', 'flags', 'seq']) {
      assert.ok(k in st, cd.NAME + '.' + k);
    }
    assert.equal(typeof st.owner, 'string');
    assert.ok(Array.isArray(st.roster));
    // 步/骑拆分恒等式（本作 [新设计]，原作城池记录里没有 cav/inf）
    assert.equal(st.cav + st.inf, st.troops, cd.NAME);
    assert.ok(st.prep <= st.prepCap, cd.NAME);
    // 预备兵上限与原作 +0x086 同式
    assert.equal(st.prepCap, Math.min(Math.floor(cd.POPULATION / 2500) + 110, 600), cd.NAME);
    assert.equal(st.seq, cd._index);
    assert.equal(st.rate, Math.min(5, Math.max(1, Number(cd.RATE) || 1)));
  }
  // info 回调确实写进去了
  assert.equal(snap.cities[S0.cities[1].NAME].owner, '劉焉');
  assert.deepEqual(snap.cities[S0.cities[1].NAME].roster, ['將甲1', '將乙1']);
  // 无主城留空串（不是 undefined）
  assert.equal(snap.cities[S0.cities[0].NAME].owner, '');
});

test('prepareSnapshot 幂等：连跑两次不改变内容、第二次不拷贝', () => {
  const snap = preparedSnap();
  const json1 = JSON.stringify(snap);
  const again = S.prepareSnapshot(snap, S0.cities, { info: infoOf });
  assert.equal(again, snap);                       // v3 → 就地，不深拷贝
  assert.equal(JSON.stringify(snap), json1);
});

test('citySummaryOf 缺运行态时按剧本字段兜底（兵/民/金/防/prep 上限）', () => {
  const cd = S0.cities[5];
  const st = S.citySummaryOf(cd, {}, {});
  assert.equal(st.troops, S.cityTroops(cd));
  assert.equal(st.pop, cd.POPULATION);
  assert.equal(st.money, cd.MONEY);
  assert.equal(st.def, cd.DEFENSE);
  assert.equal(st.cav, 0);
  assert.equal(st.inf, st.troops);
  assert.equal(st.prep, st.prepCap);
  assert.equal(st.owner, typeof cd.KING === 'string' ? cd.KING : '');
  assert.equal(st.officers, 0);                    // 没给 roster → 0（不是 undefined）
  assert.equal(st.flag, 0);
  // 已有运行态优先，且 prep 夹进 0..cap、cav 不超过 troops
  const st2 = S.citySummaryOf(cd, { troops: 100, cav: 40, prep: 99999, pop: 2500000, money: 7, def: 9 }, {});
  assert.equal(st2.troops, 100);
  assert.equal(st2.cav, 40);
  assert.equal(st2.inf, 60);
  assert.equal(st2.prep, st2.prepCap);              // 2500000/2500+110 → 夹到 600
  assert.equal(st2.prepCap, 600);
  assert.equal(st2.money, 7);
  assert.equal(st2.def, 9);
});

test('fillCitySummaries 保留剧本外的旧城摘要（换剧本读档不丢数据）', () => {
  const snap = { v: 2, cities: { 舊城: { troops: 12, owner: '某' } }, owned: [] };
  const r = S.fillCitySummaries(snap, S0.cities, { info: infoOf });
  assert.equal(r.count, 61);          // 60 + 剧本外那 1 座
  assert.equal(r.filled, 60);
  assert.deepEqual(snap.cities.舊城, { troops: 12, owner: '某' });
});

// ---------------------------------------------------------------- 2. 老档迁移

test('老档（无 v、只有老字段）升级到 v3：补字段、留未知键、从 king 反向补 monarch/force', () => {
  const old = {
    month: 5, gold: 700, owned: ['北平'], cities: { 北平: { troops: 300 } },
    king: '公孫瓚', scenario: 1,
    captured: ['x'], drops: { 北平: ['青龍偃月刀'] },   // main.js 的未知键必须原样留着
  };
  const up = S.upgradeSnapshot(old);
  assert.equal(up.from, 0);
  assert.equal(up.to, 3);
  assert.equal(up.changed, true);
  assert.deepEqual(up.steps, ['v0→v2', 'v2→v3']);    // 逐跳：两跳都记
  assert.notEqual(up.snapshot, old);                 // 升级一定拷贝，不动内存里的原对象
  const s = up.snapshot;
  assert.equal(s.v, 3);
  assert.equal(s.monarch, '公孫瓚');                  // 从 king 补
  assert.equal(s.force, '公孫瓚');
  assert.equal(s.month, 5);
  assert.equal(s.gold, 700);
  assert.deepEqual(s.captured, ['x']);
  assert.deepEqual(s.drops, { 北平: ['青龍偃月刀'] });
  assert.equal(s.cities.北平.owner, '');             // 老城对象缺 owner → 补空串
  assert.deepEqual(s.log, []);
  assert.deepEqual(s.armies, []);
  assert.deepEqual(s.generalLevel, {});
  assert.deepEqual(s.generalExp, {});
  assert.deepEqual(s.roster, { _moved: {} });
  assert.equal(s.drift, null);
  // v3 补齐：月 5 → 第 1 年；武将档案容器空
  assert.equal(s.year, 1);
  assert.equal(s.yearFlag, 0);
  assert.equal(s.ledger, undefined);   // 没结过账 → 不造空账本（R7 语义）
  assert.deepEqual(s.generalStatus, {});
  assert.deepEqual(s.weapon, {});
  assert.deepEqual(s.horse, {});
  assert.deepEqual(s.thing, {});
  // 升级后的对象是"当前格式"：再升一次不做事
  const again = S.upgradeSnapshot(s);
  assert.equal(again.changed, false);
  assert.equal(again.snapshot, s);
});

test('v2 → v3：只有一跳、旧账本不被重建、剧本外旧城不补摘要', () => {
  const doc = asV2(preparedSnap());
  doc.month = 13;                                    // 第 2 年正月
  doc.ledger = { year: 1, months: 12, income: 480, salary: 180 };  // 上一年的账
  doc.annual = { year: 1, months: 12, income: 480, salary: 180 };  // R7 的可选键
  doc.lastPost = { slot: 2, ts: 5 };
  doc.generalLevel = { 甲: 7 };
  doc.learned = { 甲: { magic: [3], wise: [1] } };
  const up = S.upgradeSnapshot(doc);
  assert.equal(up.from, 2);
  assert.equal(up.to, 3);
  assert.equal(up.changed, true);
  assert.deepEqual(up.steps, ['v2→v3']);             // 只记比入参新的那一跳
  for (const k of V3_KEYS) assert.ok(k in up.snapshot, k);
  assert.notEqual(up.snapshot, doc);                 // v2 → v3 一定拷贝
  assert.equal(doc.year, undefined);                 // 原对象没被就地改
  const s = up.snapshot;
  assert.equal(s.v, 3);
  assert.equal(s.year, 2);                           // 由 month 重算（真源是 month）
  assert.deepEqual(s.ledger, { year: 1, months: 12, income: 480, salary: 180 });  // 只补不改
  // 已有字段一个不动
  assert.deepEqual(s.generalLevel, { 甲: 7 });
  assert.deepEqual(s.learned, { 甲: { magic: [3], wise: [1] } });
  assert.deepEqual(s.annual, { year: 1, months: 12, income: 480, salary: 180 });
  assert.deepEqual(s.lastPost, { slot: 2, ts: 5 });
  // 新容器空
  assert.deepEqual(s.generalStatus, {});
  assert.deepEqual(s.weapon, {});
  // 迁移结果已经是当前格式 → 再升一次不做事（幂等）
  const again = S.upgradeSnapshot(s);
  assert.equal(again.changed, false);
  assert.equal(again.snapshot, s);
});

test('v2 里的 v3 字段写坏了：非字符串丢弃、yearFlag 夹 0/1、ledger 取整', () => {
  const doc = asV2(preparedSnap());
  doc.year = 'x';
  doc.yearFlag = 7;                                  // 非 0/1 → 1
  doc.ledger = { year: 0, months: -1, income: 'x', salary: 12.7 };
  doc.generalStatus = { 甲: '登', 乙: '', 丙: 5, 丁: '   ' };   // 只留 甲
  doc.weapon = { 甲: '直劍', 乙: null };                        // 只留 甲
  doc.horse = 'bad';                                            // 非对象 → {}
  doc.thing = { 甲: '孫子兵法' };
  const s = S.upgradeSnapshot(doc).snapshot;
  assert.equal(s.year, 1);                           // month 1 → 第 1 年
  assert.equal(s.yearFlag, 1);
  assert.deepEqual(s.ledger, { year: 1, months: 0, income: 0, salary: 12 });
  assert.deepEqual(s.generalStatus, { 甲: '登' });
  assert.deepEqual(s.weapon, { 甲: '直劍' });
  assert.deepEqual(s.horse, {});
  assert.deepEqual(s.thing, { 甲: '孫子兵法' });
  // 已经是当前版（v3）时不再清洗 —— 与 v2 时代一致：清洗只发生在迁移路径
  const clean = preparedSnap();
  clean.generalStatus = { 丙: 5 };
  assert.equal(S.upgradeSnapshot(clean).changed, false);
});

test('坏输入不炸：null/字符串/数组 → from -1；空对象 → v0 补成 v3', () => {
  assert.equal(S.snapshotVersionOf(null), -1);
  assert.equal(S.snapshotVersionOf('x'), -1);
  assert.equal(S.snapshotVersionOf([]), -1);
  assert.equal(S.snapshotVersionOf({}), 0);
  assert.equal(S.snapshotVersionOf({ v: 7 }), 7);
  const bad = S.upgradeSnapshot(null);
  assert.equal(bad.from, -1);
  assert.equal(bad.snapshot, null);
  const empty = S.upgradeSnapshot({});
  assert.equal(empty.from, 0);
  assert.deepEqual(empty.steps, ['v0→v2', 'v2→v3']);
  assert.equal(empty.snapshot.v, 3);
  assert.equal(empty.snapshot.month, 1);
  assert.equal(empty.snapshot.gold, 1200);
  assert.equal(empty.snapshot.year, 1);
  assert.equal(empty.snapshot.ledger, undefined);    // 空对象也没有账本可写
  assert.deepEqual(empty.snapshot.generalStatus, {});
});

test('迁移时数值一律取整并夹范围（等级 1..99 / 经验 0..2^31-1 / 忠誠 0..99）', () => {
  const up = S.upgradeSnapshot({
    v: 0, month: 0, gold: -3, wins: 1.7, streak: -2, lastActionMonth: 'x',
    generalLevel: { 甲: 0, 乙: 500, 丙: '3.9', 丁: 'bad' },
    generalExp: { 甲: -5, 乙: 3e9, 丙: 12.8 },
    loyal: { 甲: 200, 乙: -1, 丙: 55.5 },
  });
  const s = up.snapshot;
  assert.equal(s.month, 1);
  assert.equal(s.gold, 1200);        // 负数不是"合法值"，退回默认
  assert.equal(s.wins, 1);
  assert.equal(s.streak, 0);
  assert.equal(s.lastActionMonth, 0);
  assert.deepEqual(s.generalLevel, { 甲: 1, 乙: 99, 丙: 3 });   // 丁 的坏值被丢掉
  assert.deepEqual(s.generalExp, { 甲: 0, 乙: 0x7fffffff, 丙: 12 });
  assert.deepEqual(s.loyal, { 甲: 99, 乙: 0, 丙: 55 });
});

test('迁移时不迁移城市摘要以外的东西：剧本外旧城对象原样保留', () => {
  const up = S.upgradeSnapshot({ cities: { 舊城: { troops: 5, pop: 9 }, 壞城: 'x' } });
  assert.deepEqual(up.snapshot.cities.舊城, { troops: 5, pop: 9, owner: '' });
  assert.deepEqual(up.snapshot.cities.壞城, {});   // 非对象城摘要按空对象处理，不丢键
});

test('prepareSnapshot 吃老档：先升 v3 再补 60 城摘要（剧本外旧城不碰）', () => {
  const old = { month: 5, king: 'K', scenario: 1, cities: { 舊城: { troops: 3 } } };
  const s = S.prepareSnapshot(old, S0.cities, { info: infoOf });
  assert.equal(s.v, 3);
  assert.equal(s.year, 1);
  assert.equal(s.ledger, undefined);                        // R7 语义：不替没结过账的档造账本
  assert.equal(Object.keys(s.cities).length, 61);          // 60 + 舊城
  assert.deepEqual(s.cities.舊城, { troops: 3, owner: '' });  // 剧本外：不加 officers/flag
  assert.equal(s.cities[S0.cities[1].NAME].officers, 2);
  assert.equal(old.v, undefined);                           // 入参未被就地改（v0 → 一定拷贝）
});

test('migrateLegacy：旧键整份搬进槽 1，已有槽则不迁移', () => {
  const st = memStorage();
  st.setItem(S.LEGACY_KEY, JSON.stringify({ month: 8, gold: 999, king: '董卓', scenario: 2 }));
  const r = S.migrateLegacy({ storage: st, now: 1700000000000, scenarioNameOf: () => '劇本2' });
  assert.equal(r.migrated, true);
  assert.equal(r.index, 0);
  assert.equal(r.entry.monarch, '董卓');            // 槽摘要直接从老档算出来
  const snap = S.getSnapshot(r.store, 0);
  assert.equal(snap.v, 3);                          // 存进槽的已经是升级后的 v3
  assert.equal(snap.month, 8);
  // 再调一次：已经有槽 → 不覆盖
  const r2 = S.migrateLegacy({ storage: st, now: 1700000000001 });
  assert.equal(r2.migrated, false);
  assert.equal(r2.reason, 'has-slots');
  // 没有旧档也不迁移
  const fresh = S.migrateLegacy({ storage: memStorage() });
  assert.equal(fresh.migrated, false);
  assert.equal(fresh.reason, 'no-legacy');
});

test('normalizeStore：老槽就地升级并重算摘要，未知顶层键/条目键都留着', () => {
  const oldEntry = {
    id: 'legacy', name: '舊槽', ts: 111, note: '玩家備註',
    snapshot: { month: 5, gold: 700, owned: ['X'], cities: { X: { troops: 3 } }, king: 'K', scenario: 1 },
  };
  const norm = S.normalizeStore({ v: 1, extra: 42, last: 1, slots: [oldEntry, 'bad', null] });
  assert.equal(norm.v, S.STORE_VERSION);
  assert.equal(norm.slots.length, 10);              // 补齐 10 槽
  assert.equal(norm.extra, 42);                     // 顶层未知键保留
  const e = norm.slots[0];
  assert.equal(e.note, '玩家備註');                  // 条目未知键保留
  assert.equal(e.snapshot.v, 3);                    // 老档升级了
  assert.equal(e.monarch, 'K');                     // 摘要重算
  assert.equal(e.cityCount, 1);
  assert.equal(e.year, 1);                          // v3 摘要：年
  assert.equal(e.cityOfficers, 0);                  // 老城摘要没有 officers → 0
  assert.equal(e.statusCount, 0);
  assert.equal(e.equipCount, 0);
  assert.equal(typeof e.forceCount, 'number');
  assert.equal(typeof e.generalCount, 'number');
  assert.equal(e.ts, 111);                          // ts 不被升级改掉
  assert.equal(norm.slots[1], null);                // 坏条目按空处理
  assert.equal(S.normalizeStore(null).slots.length, 10);
});

// ---------------------------------------------------------------- 3. v3 字段语义

test('武将状态：GENERAL_STATUS 对齐原作 1/2/8，statusOf 显式 > fate 退化 > 未知', () => {
  assert.deepEqual(S.GENERAL_STATUS, { PENDING: '未', ACTIVE: '登', CAPTIVE: '俘', WILD: '野', DEAD: '亡' });
  assert.deepEqual(S.GENERAL_STATUS_CODE, { 未: 0, 登: 1, 俘: 2, 野: 8, 亡: 9 });
  const snap = S.newCampaign(S0, { ts: 1 });
  assert.equal(S.statusOf(snap, '甲'), '');          // 没记录 = 未知，不是"在野"
  assert.equal(S.statusOf(snap, ''), '');
  assert.equal(S.statusOf(null, '甲'), '');
  S.setGeneralStatus(snap, '甲', '登');
  assert.equal(snap.generalStatus['甲'], '登');
  assert.equal(S.statusOf(snap, '甲'), '登');
  // 残将归宿（R78 fate）作为退化来源
  snap.fate = { 乙: { fate: 'wild', force: '', month: 3 }, 丙: { fate: 'surrender', force: '曹操', month: 4 } };
  assert.equal(S.statusOf(snap, '乙'), '野');
  assert.equal(S.statusOf(snap, '丙'), '登');
  // 显式记录优先于 fate
  S.setGeneralStatus(snap, '乙', '俘');
  assert.equal(S.statusOf(snap, '乙'), '俘');
  // 清空显式记录 → 退回 fate
  S.setGeneralStatus(snap, '乙', '');
  assert.equal(S.statusOf(snap, '乙'), '野');
  assert.ok(!('乙' in snap.generalStatus));
  // 名字空白/坏入参不炸
  assert.equal(S.setGeneralStatus(snap, '   ', '登'), '');
  assert.equal(S.setGeneralStatus(null, '甲', '登'), '');
});

test('装备三件套：equipOf/setEquip 往返，值可以是空串（卸下）', () => {
  const snap = S.newCampaign(S0, { ts: 1 });
  assert.deepEqual(S.equipOf(snap, '甲'), { weapon: '', horse: '', thing: '' });
  assert.deepEqual(S.setEquip(snap, '甲', { weapon: '直劍', horse: '黃鬃馬', thing: '孫子兵法' }),
    { weapon: '直劍', horse: '黃鬃馬', thing: '孫子兵法' });
  assert.deepEqual(snap.weapon, { 甲: '直劍' });
  assert.deepEqual(snap.horse, { 甲: '黃鬃馬' });
  assert.deepEqual(snap.thing, { 甲: '孫子兵法' });
  // 只改一件，其余不动；空串 = 卸下
  S.setEquip(snap, '甲', { horse: '' });
  assert.deepEqual(S.equipOf(snap, '甲'), { weapon: '直劍', horse: '', thing: '孫子兵法' });
  assert.ok(!('甲' in snap.horse));
  // 名字口径与 generals.json 一致（物品名，不是序号）
  assert.equal(typeof S.equipOf(snap, '甲').weapon, 'string');
  assert.deepEqual(S.equipOf(null, '甲'), { weapon: '', horse: '', thing: '' });
});

test('generalStatus/weapon/horse/thing 进槽往返一致（writeSlot 深拷贝 + JSON 幂等）', () => {
  const snap = preparedSnap();
  snap.generalStatus = { 甲: '登', 乙: '野' };
  snap.weapon = { 甲: '直劍' };
  snap.horse = { 乙: '黃鬃馬' };
  snap.thing = {};
  snap.year = 2;
  snap.month = 13;
  snap.yearFlag = 1;
  snap.ledger = { year: 1, months: 12, income: 480, salary: 180 };
  const store = S.emptyStore();
  S.writeSlot(store, 0, snap, { scenarioName: '劇本1', ts: 7 });
  const got = S.getSnapshot(store, 0);
  assert.deepEqual(got.generalStatus, { 甲: '登', 乙: '野' });
  assert.deepEqual(got.weapon, { 甲: '直劍' });
  assert.deepEqual(got.horse, { 乙: '黃鬃馬' });
  assert.deepEqual(got.ledger, { year: 1, months: 12, income: 480, salary: 180 });
  assert.equal(got.year, 2);
  assert.equal(got.yearFlag, 1);
  // prepareSnapshot 不丢这些（走的是"已是当前版 → 就地"路径）
  const again = S.prepareSnapshot(JSON.parse(JSON.stringify(snap)), S0.cities, { info: infoOf });
  assert.deepEqual(again.generalStatus, { 甲: '登', 乙: '野' });
  assert.deepEqual(again.weapon, { 甲: '直劍' });
  assert.deepEqual(again.ledger, { year: 1, months: 12, income: 480, salary: 180 });
  assert.equal(again.year, 2);
  assert.equal(JSON.stringify(again), JSON.stringify(snap));
  // 槽里的另一份是深拷贝
  got.generalStatus['甲'] = '亡';
  assert.equal(S.getSnapshot(store, 0).generalStatus['甲'], '登');
});

test('城摘要：officers = roster.length、flag 由 forces[owner].flag 派生、cityMorale 透传', () => {
  const snap = S.newCampaign(S0, { ts: 1 });
  snap.forces = { 公孫瓚: { id: '公孫瓚', king: '公孫瓚', flag: 7, alive: true, cities: [], ts: 0 } };
  for (const cd of S0.cities) snap.cities[cd.NAME].cityMorale = 55;   // 民心（R70 已有键）
  const prep = S.prepareSnapshot(snap, S0.cities, { info: infoOf });
  for (let i = 0; i < S0.cities.length; i++) {
    const cd = S0.cities[i];
    const st = prep.cities[cd.NAME];
    assert.equal(st.officers, st.roster.length, cd.NAME);
    assert.equal(st.officers, i % 3 === 0 ? 0 : 2, cd.NAME);
    assert.equal(st.cityMorale, 55, cd.NAME);        // 民心不被摘要冲掉
  }
  // 势力表里有旗号 → 派生；没有该势力 → 0
  assert.equal(prep.cities[S0.cities[4].NAME].flag, 7);    // 4 % 4 === 0 → 公孫瓚
  assert.equal(prep.cities[S0.cities[1].NAME].flag, 0);    // 劉焉 不在 forces
  // 调用方显式给 flag 时听调用方的
  const prep2 = S.prepareSnapshot(S.newCampaign(S0, { ts: 2 }), S0.cities, {
    info: (n) => ({ ...infoOf(n), flag: 3 }),
  });
  assert.equal(prep2.cities[S0.cities[1].NAME].flag, 3);
  // JSON 往返后仍然一致
  assert.equal(JSON.parse(JSON.stringify(prep)).cities[S0.cities[1].NAME].cityMorale, 55);
});

test('10 槽互不污染：各自的 year/状态/装备独立，clearSlot 与 renameSlot 不串味', () => {
  const store = S.emptyStore();
  const a = preparedSnap();
  a.generalStatus = { 甲: '登' };
  a.weapon = { 甲: '直劍' };
  const b = preparedSnap();
  b.generalStatus = { 甲: '野', 乙: '俘' };
  b.ledger = { year: 1, months: 5, income: 10, salary: 2 };
  const c = preparedSnap();
  c.month = 25;
  c.year = 3;
  c.thing = { 乙: '短錐槍' };
  S.writeSlot(store, 0, a, { ts: 1 });
  S.writeSlot(store, 5, b, { ts: 2 });
  S.writeSlot(store, 9, c, { ts: 3 });
  assert.deepEqual(S.getSnapshot(store, 0).generalStatus, { 甲: '登' });
  assert.deepEqual(S.getSnapshot(store, 5).generalStatus, { 甲: '野', 乙: '俘' });
  assert.deepEqual(S.getSnapshot(store, 9).generalStatus, {});
  assert.deepEqual(S.getSnapshot(store, 9).thing, { 乙: '短錐槍' });
  // 摘要各自独立
  assert.equal(store.slots[0].year, 1);
  assert.equal(store.slots[5].year, 1);
  assert.equal(store.slots[9].year, 3);
  assert.equal(store.slots[0].statusCount, 1);
  assert.equal(store.slots[5].statusCount, 2);
  assert.equal(store.slots[9].statusCount, 0);
  assert.equal(store.slots[0].equipCount, 1);
  assert.equal(store.slots[9].equipCount, 1);
  // 直接改槽 5 里的快照不影响槽 1（writeSlot 是深拷贝）
  S.slotAt(store, 5).snapshot.weapon = { 丙: '銅殳' };
  assert.deepEqual(S.getSnapshot(store, 0).weapon, { 甲: '直劍' });
  // clearSlot 只清自己
  assert.equal(S.clearSlot(store, 5), true);
  assert.equal(S.getSnapshot(store, 5), null);
  assert.deepEqual(S.getSnapshot(store, 0).generalStatus, { 甲: '登' });
  assert.deepEqual(S.getSnapshot(store, 9).thing, { 乙: '短錐槍' });
  // renameSlot 只改元数据
  const before = JSON.stringify(store.slots[0].snapshot);
  S.renameSlot(store, 0, '甲存檔');
  assert.equal(JSON.stringify(store.slots[0].snapshot), before);
  assert.equal(store.slots[0].name, '甲存檔');
  // 容器 JSON 往返后三槽仍各自独立
  const back = S.normalizeStore(JSON.parse(JSON.stringify(store)));
  assert.deepEqual(back.slots[0].snapshot.generalStatus, { 甲: '登' });
  assert.equal(back.slots[5], null);
  assert.deepEqual(back.slots[9].snapshot.thing, { 乙: '短錐槍' });
});

// ---------------------------------------------------------------- 4. 槽位与摘要

test('writeSlot 不碰 last；writeSlotAuto 才推进 last（自动存档目标不被手动存档接管）', () => {
  const store = S.emptyStore();
  assert.equal(store.last, 1);                       // 默认自动存档目标 = 槽 1
  const snap = preparedSnap();
  // 手动存到槽 4：条目照写，但 `store.last` 一个字节都不许动
  const e = S.writeSlot(store, 3, snap, { scenarioName: '劇本1', ts: 1700000000000 });
  assert.equal(e.id, 4);
  assert.equal(store.last, 1, '手动存档不得改自动存档目标（否则下一次 autosave 会盖掉它）');
  assert.equal(S.lastUsed(store), 0);
  assert.equal(S.hasAny(store), true);
  assert.equal(S.newestSlot(store), 3);
  assert.equal(S.slotAt(store, 2), null);
  assert.equal(S.writeSlot(store, 99, snap), null);
  assert.equal(S.writeSlot(store, 0, null), null);
  // 自动存档才推进 last（槽下标 0 基 → last 1 基）
  const a = S.writeSlotAuto(store, 6, snap, { ts: 1700000000001 });
  assert.equal(a.id, 7);
  assert.equal(store.last, 7);
  assert.equal(S.lastUsed(store), 6);
  // 显式 touchLast 与 writeSlotAuto 等价（给未来自定义路径留的口）
  S.writeSlot(store, 1, snap, { ts: 3, touchLast: true });
  assert.equal(store.last, 2);
  assert.equal(S.slotAt(store, 3).snapshot.gold, 1200);   // 手动写的那槽还在，没被覆盖
  // getSnapshot 是深拷贝：改返回值不影响槽里那份
  const got = S.getSnapshot(store, 3);
  assert.deepEqual(got, snap);
  got.gold = 1;
  assert.equal(store.slots[3].snapshot.gold, 1200);
  // clearSlot
  assert.equal(S.clearSlot(store, 3), true);
  assert.equal(S.clearSlot(store, 3), false);
  assert.equal(S.slotAt(store, 3), null);
  // 全清后 hasAny/newestSlot 归零（last 保持不动，仍是自动存档目标）
  S.clearSlot(store, 1); S.clearSlot(store, 6);
  assert.equal(S.hasAny(store), false);
  assert.equal(S.newestSlot(store), -1);
  assert.equal(store.last, 2);
});

test('bootSlot 推导：手动存档后自动存档仍写原槽（lead 复现的 4b 卡点）', () => {
  // 复刻 campaign.html:1124-1128 的启动推导（只读镜像，不依赖页面）
  const bootSlotOf = (st) => {
    let n = S.lastUsed(st) + 1;
    if (!st.slots[n - 1] && S.hasAny(st)) {
      const newest = S.newestSlot(st);
      if (newest >= 0) n = newest + 1;
    }
    return n;
  };
  const store = S.emptyStore();
  const snap = preparedSnap();
  // 玩家：自动存到槽 1 → 手动存到槽 2 → 再打下一个月（autosave）
  S.writeSlotAuto(store, 0, snap, { ts: 100 });
  assert.equal(bootSlotOf(store), 1);
  S.writeSlot(store, 1, snap, { ts: 200 });          // 手动存槽 2
  assert.equal(store.slots[1].ts, 200);
  assert.equal(bootSlotOf(store), 1, '自动存档目标仍是槽 1，不被手动存档带走');
  S.writeSlotAuto(store, bootSlotOf(store) - 1, snap, { ts: 300 });   // autosave()
  assert.equal(store.slots[0].ts, 300);              // 槽 1 被自动档刷新
  assert.equal(store.slots[1].ts, 200);              // 槽 2 的手动档毫发无伤
  assert.equal(store.last, 1);
  // 自动存档另开槽位后，bootSlot 才跟着走
  S.writeSlotAuto(store, 4, snap, { ts: 400 });
  assert.equal(bootSlotOf(store), 5);
  assert.equal(store.slots[1].ts, 200, '换自动存档槽也不影响老的手动档');
  // 老容器（上一版把 last 指向手动槽）读回来：bootSlot 指向手动槽，但那是历史数据，
  // normalizeStore 原样保留 last，下一次 autosave 会写它 —— 这是兼容代价，不是新逻辑。
  const legacyStore = JSON.parse(JSON.stringify(store));
  legacyStore.last = 2;                              // 旧 bug 落下的数据
  const old = S.normalizeStore(legacyStore);
  assert.equal(old.last, 2);
  assert.equal(bootSlotOf(old), 2);
});

test('槽摘要（R70 新增君主/勢力/將）与 slotParts 9 段', () => {
  const store = S.emptyStore();
  const snap = preparedSnap();
  // 造 14 家勢力 + 1 家滅亡，并给 400 将里 7 个写等级
  snap.forces = {};
  for (let i = 0; i < 14; i++) {
    snap.forces['勢力' + i] = { id: '勢力' + i, king: '君主' + i, alive: true, cities: [], ts: 0 };
  }
  snap.forces.亡國 = { id: '亡國', king: '亡国君', alive: false, cities: [], ts: 0 };
  snap.generalLevel = { 甲: 3, 乙: 5, 丙: 1, 丁: 9, 戊: 2, 己: 4, 庚: 6 };
  const e = S.writeSlot(store, 0, snap, { scenarioName: '黃巾之亂', ts: 1700000000000 });
  assert.equal(e.monarch, '公孫瓚');
  assert.equal(e.forceCount, 14);                   // 只算存活
  assert.equal(e.extinctCount, 1);                  // 滅亡单独记
  assert.equal(e.cityCount, 60);
  assert.equal(e.generalCount, 7);
  const p = S.slotParts(e, 0);
  assert.equal(p.length, 9);                        // 槽列表仍是 9 段，v3 摘要不进文本
  assert.equal(p[0], '槽1');
  assert.equal(p[1], '黃巾之亂');
  assert.equal(p[2], '第1年1月');
  assert.equal(p[3], '城3');
  assert.equal(p[4], '0勝0敗');
  assert.match(p[5], /^\d\d-\d\d \d\d:\d\d$/);
  assert.equal(p[6], '君主公孫瓚');
  assert.equal(p[7], '勢力14');
  assert.equal(p[8], '將7');
  assert.ok(S.slotSummary(e, 0).includes('君主公孫瓚'));
  assert.deepEqual(S.slotParts(null, 4), ['槽5', '空']);
});

test('metaFromSnapshot：v3 摘要 year/cityOfficers/statusCount/equipCount 正确', () => {
  const snap = preparedSnap();
  snap.month = 13;
  snap.year = 2;
  snap.generalStatus = { 甲: '登', 乙: '野', 丙: '俘' };
  snap.weapon = { 甲: '直劍' };
  snap.thing = { 乙: '孫子兵法' };
  const sumOfficers = S0.cities.reduce((n, c, i) => n + (i % 3 === 0 ? 0 : 2), 0);
  const meta = S.metaFromSnapshot(snap, 2, { ts: 9, scenarioName: '劇本1' });
  assert.equal(meta.id, 3);
  assert.equal(meta.year, 2);                        // 由 month 算（不是读 snap.year）
  assert.equal(meta.time, '第2年1月');
  assert.equal(meta.cityOfficers, sumOfficers);
  assert.equal(meta.statusCount, 3);
  assert.equal(meta.equipCount, 2);                  // 甲(武器) + 乙(宝物)
  assert.equal(meta.cityCount, 60);                  // 老摘要没被顶掉
  assert.equal(meta.generalCount, 0);
  assert.equal(meta.monarch, '公孫瓚');
  assert.equal(S.slotParts(meta, 2).length, 9);
  // 空/坏快照也不炸
  const empty = S.metaFromSnapshot({}, 0, {});
  assert.equal(empty.year, 1);
  assert.equal(empty.cityOfficers, 0);
  assert.equal(empty.statusCount, 0);
  assert.equal(empty.equipCount, 0);
});

test('renameSlot：去空白、截 20 字、空名回「槽 N」，只改元数据', () => {
  const store = S.emptyStore();
  const before = preparedSnap();
  S.writeSlot(store, 2, before, { ts: 1 });
  const snapBefore = JSON.stringify(store.slots[2].snapshot);
  const e = S.renameSlot(store, 2, '  我的存檔  ');
  assert.equal(e.slotName, '我的存檔');
  assert.equal(e.name, '我的存檔');
  assert.equal(JSON.stringify(store.slots[2].snapshot), snapBefore);   // 不动 snapshot
  S.renameSlot(store, 2, 'x'.repeat(50));
  assert.equal(store.slots[2].slotName.length, 20);
  S.renameSlot(store, 2, '   ');
  assert.equal(store.slots[2].slotName, '');
  assert.equal(store.slots[2].name, '槽 3');
  assert.equal(S.renameSlot(store, 9, 'x'), null);   // 空槽
  assert.equal(S.renameSlot(store, 99, 'x'), null);  // 越界
});

test('forcesSummary / generalsSummary：存亡分开数，將按等级/经验并集', () => {
  const snap = { force: '甲', forces: { 甲: { alive: true }, 乙: { alive: true }, 丙: { alive: false } }, generalLevel: { a: 3, b: 5 }, generalExp: { b: 200, c: 1 } };
  assert.deepEqual(S.forcesSummary(snap), { total: 3, alive: 2, aliveIds: ['甲', '乙'], extinct: ['丙'], player: '甲' });
  assert.deepEqual(S.generalsSummary(snap), { total: 3, leveled: 2, maxLevel: 5 });
  assert.deepEqual(S.forcesSummary(null), { total: 0, alive: 0, aliveIds: [], extinct: [], player: '' });
  assert.deepEqual(S.generalsSummary(null), { total: 0, leveled: 0, maxLevel: 0 });
});

// ---------------------------------------------------------------- 5. 序列化幂等

test('序列化 → 反序列化幂等：JSON 往返后结构不变、也不需要再迁移', () => {
  const snap = preparedSnap();
  snap.generalLevel = { 甲: 7 };
  snap.generalExp = { 甲: 999 };
  snap.generalStatus = { 甲: '登' };
  const json = JSON.stringify(snap);
  const back = JSON.parse(json);
  assert.deepEqual(back, snap);
  const up = S.upgradeSnapshot(back);
  assert.equal(up.changed, false);
  assert.equal(up.from, 3);
  assert.equal(JSON.stringify(S.prepareSnapshot(back, S0.cities, { info: infoOf })), json);
  // 存容器也幂等
  const store = S.emptyStore();
  S.writeSlot(store, 0, snap, { ts: 5 });
  const norm = S.normalizeStore(JSON.parse(JSON.stringify(store)));
  assert.deepEqual(norm, store);
});

// ---------------------------------------------------------------- 6. 数据口径（generals.json）

test('generals.json 的 Status/Weapon/Horse/Thing 与 v3 口径一致（名字不是序号）', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../data/generals.json', import.meta.url), 'utf8'));
  const rows = Array.isArray(raw) ? raw : Object.values(raw);
  assert.ok(rows.length > 300, String(rows.length));
  const allowed = new Set(Object.values(S.GENERAL_STATUS));
  const seen = new Set();
  for (const g of rows) {
    if (!g || typeof g !== 'object') continue;
    const st = g.Status;
    if (typeof st === 'string' && st) {
      assert.ok(allowed.has(st), (g.NAME || '?') + ':' + st);
      seen.add(st);
    }
    // 原作段4 +0x0C3/+0x0C1/+0x0C5 是 u16 序号 [推测]，但数据表给的是物品名 → 本档同样存名字
    for (const k of ['Weapon', 'Horse', 'Thing']) {
      if (g[k] === undefined || g[k] === null) continue;
      assert.equal(typeof g[k], 'string', (g.NAME || '?') + '.' + k);
    }
  }
  assert.deepEqual([...seen].sort(), ['登', '野', '未'].sort());   // 数据表只出现这 3 个
  assert.ok(seen.has(S.GENERAL_STATUS.ACTIVE));
  assert.ok(seen.has(S.GENERAL_STATUS.WILD));
});

// ---------------------------------------------------------------- 7. 势力色板

test('固定色板：29 家（劇本勢力全員）色值互不相同、同一勢力永遠同色', () => {
  // [F28] 差異清單行 229：14 色板對 18 家不夠用 → 撞色（曹操/王朗、馬騰/袁術）。
  // 現在按劇本勢力表逐家定色，5 個劇本的 29 家全部落在固定表，不再走哈希。
  const PAL = S.FORCE_PALETTE.length;
  assert.ok(PAL >= 28, `固定色板至少 28 家（差異 F28），實測 ${PAL}`);
  const colors = S.FORCE_PALETTE.map((e) => e.color);
  assert.equal(new Set(colors).size, PAL, '色值必須互不相同（禁止撞色）');
  for (const e of S.FORCE_PALETTE) {
    assert.match(e.color, /^#[0-9A-Fa-f]{6}$/);
    assert.equal(S.forceColorOf(e.force), e.color);
    assert.equal(S.forceColorOf(e.force), S.forceColorOf(e.force));   // 稳定
    assert.ok(S.forceColorIndex(e.force) < PAL, e.force);
  }
  // 29 家＝5 個劇本的勢力名并集（劇本1 的 14 家 + 劇本2..5 的 15 家）
  const FOURTEEN = ['公孫瓚', '劉焉', '張角', '韓馥', '龔景', '喬玄', '何進', '董卓', '孫堅', '陶謙', '孔岫', '丁原', '劉繇', '嚴白虎'];
  const LATER = ['袁紹', '曹操', '劉備', '孔融', '喬瑁', '馬騰', '袁術', '劉表', '王朗', '孫權', '張魯', '劉璋', '金旋', '孟獲', '徹里吉'];
  for (const f of FOURTEEN) assert.ok(S.forceColorIndex(f) < 14, f);
  for (const f of LATER) assert.ok(S.forceColorIndex(f) >= 14 && S.forceColorIndex(f) < PAL, f);
  assert.equal(new Set([...FOURTEEN, ...LATER].map((f) => S.forceColorOf(f))).size, 29, '29 家 29 色');
});

test('备色/中性色：表外势力用 14 个备色且稳定，空/无主用中性色', () => {
  assert.equal(S.FORCE_RESERVE.length, 14);
  const PAL = S.FORCE_PALETTE.length;
  // 表外名字（不在 29 家固定表里的）才会落备色段
  const extra = ['南蠻王', '張舉', '韓遂', '公孫度'];
  const idx = extra.map((f) => S.forceColorIndex(f));
  for (const i of idx) assert.ok(i >= PAL && i < PAL + 14, String(i));
  // 備色段只有 14 格，表外名字哈希可能撞號（原作勢力都在固定表，撞不到）；至少不能全是同一格
  assert.ok(new Set(idx).size >= 2, '備色哈希不應全部落同一格');
  for (const f of extra) assert.equal(S.forceColorOf(f), S.forceColorOf(f));
  for (const empty of ['', '   ', null, undefined]) assert.equal(S.forceColorOf(empty), S.FORCE_COLOR_NEUTRAL);
  // 表外势力不是中性灰：按名字哈希落备色，保证「同名同色」
  const unknown = S.forceColorOf('不存在的勢力');
  assert.ok(S.FORCE_RESERVE.includes(unknown));
  assert.equal(S.forceColorOf('不存在的勢力'), unknown);
  // 前後空白不影響歸屬
  assert.equal(S.forceColorOf('  公孫瓚  '), S.forceColorOf('公孫瓚'));
});

test('forceColorMap：按 60 城归属出「勢力→色」，空城/重复不占位', () => {
  const map = S.forceColorMap(['A', 'B', 'C', 'D'], (n) => ({ A: '公孫瓚', B: '', C: '劉焉', D: '公孫瓚' }[n]));
  assert.deepEqual(map, { 公孫瓚: S.forceColorOf('公孫瓚'), 劉焉: S.forceColorOf('劉焉') });
  assert.deepEqual(S.forceColorMap(null, () => 'x'), {});
});
