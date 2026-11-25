// R84 存档 v3 收口：可复跑的验证脚本（Node 18+，ESM）
// 用法：node work/saves84/verify_v3.mjs
//
// 它只「演示 + 断言」saves.js 的 v3 行为，不写 localStorage、不碰任何 game 资源：
//   1) v2 档 → v3：steps / filled / 旧字段与新字段
//   2) 老档（无 v）→ v3：两跳
//   3) 账本：没结过账不造空账本（R7 语义），已存在则原样保留 + 清洗
//   4) 城摘要新增 officers / flag，cityMorale 透传
//   5) 武将档案 generalStatus / weapon / horse / thing + 便捷 API
//   6) metaFromSnapshot 的 v3 摘要
//   7) 10 槽互不污染

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const S = await import(new URL('file://' + path.join(ROOT, 'game', 'web', 'saves.js').replace(/\\/g, '/')));
const RAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'game', 'data', 'scenarios.json'), 'utf8'));
const SCEN = RAW.map((s, i) => ({ ...s, i, id: Number(s.id) || i + 1, name: '劇本' + (i + 1) }));
const S0 = SCEN[0];

let pass = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass += 1; return true; }
  fails.push(label + (extra === undefined ? '' : '  got=' + JSON.stringify(extra)));
  return false;
}
function eq(a, expected, label) {
  return ok(JSON.stringify(a) === JSON.stringify(expected), label, a);
}
function infoOf(name) {
  const i = S0.cities.findIndex((c) => c.NAME === name);
  return {
    owner: i % 9 === 0 ? '' : ['公孫瓚', '劉焉', '張角', '韓馥'][i % 4],
    major: i % 5 === 0 ? '' : '太守' + i,
    wise: i % 7 === 0 ? '' : '軍師' + i,
    roster: i % 3 === 0 ? [] : ['將甲' + i, '將乙' + i],
  };
}
const V3_KEYS = ['year', 'yearFlag', 'ledger', 'generalStatus', 'weapon', 'horse', 'thing'];
function fresh() {
  return S.prepareSnapshot(S.newCampaign(S0, { ts: 1700000000000 }), S0.cities, { info: infoOf });
}

console.log('== 0. 版本 ==================================================');
console.log('SNAPSHOT_VERSION =', S.SNAPSHOT_VERSION, '/ STORE_VERSION =', S.STORE_VERSION, '/ SLOT_COUNT =', S.SLOT_COUNT);
console.log('SNAPSHOT_STEPS   =', JSON.stringify(S.SNAPSHOT_STEPS.map((h) => h.from + '→' + h.to)));
ok(S.SNAPSHOT_VERSION === 3, 'SNAPSHOT_VERSION 应为 3', S.SNAPSHOT_VERSION);

console.log('\n== 1. v2 档 → v3 ===========================================');
const cur = fresh();
const v2 = JSON.parse(JSON.stringify(cur));
for (const k of V3_KEYS) delete v2[k];
v2.v = 2;                              // 本轮上线前写下的档：没有 v3 字段
v2.ledger = { year: 1, months: 12, income: 480, salary: 180 };
v2.annual = { year: 1, months: 12, income: 480, salary: 180 };
v2.generalStatus = { 甲: '登', 乙: '', 丙: 5 };   // 故意塞坏值
v2.weapon = { 甲: '直劍', 乙: '   ' };
const up = S.upgradeSnapshot(v2);
console.log('from/to/changed =', up.from, up.to, up.changed);
console.log('steps           =', JSON.stringify(up.steps));
console.log('filled          =', JSON.stringify(up.filled));
console.log('year / yearFlag =', up.snapshot.year, up.snapshot.yearFlag);
console.log('ledger          =', JSON.stringify(up.snapshot.ledger));
console.log('generalStatus   =', JSON.stringify(up.snapshot.generalStatus));
console.log('weapon          =', JSON.stringify(up.snapshot.weapon));
ok(up.from === 2 && up.to === 3 && up.changed === true, 'v2→v3 应 changed 且 from/to=2/3');
eq(up.steps, ['v2→v3'], 'v2 档只记 v2→v3 一跳');
ok(up.snapshot !== v2, 'v2→v3 必须拷贝（不动内存里那份）');
ok(v2.year === undefined, '入参原对象不落地 year');
eq(up.snapshot.ledger, { year: 1, months: 12, income: 480, salary: 180 }, '已有账本原样保留（不跨年重建）');
eq(up.snapshot.generalStatus, { 甲: '登' }, '状态里的非字符串/空串被丢');
eq(up.snapshot.weapon, { 甲: '直劍' }, '装备名 trim 后保留');
ok(up.snapshot.annual && up.snapshot.annual.year === 1, 'R7 可选键 annual 不丢');
ok(S.upgradeSnapshot(up.snapshot).changed === false, '迁移结果再升一次不做事（幂等）');

console.log('\n== 2. 老档（无 v）→ v3 ======================================');
const legacy = { month: 5, gold: 700, king: '公孫瓚', scenario: 1, owned: ['北平'], cities: { 北平: { troops: 300 } }, captured: ['x'] };
const u0 = S.upgradeSnapshot(legacy);
console.log('steps =', JSON.stringify(u0.steps), ' filled =', JSON.stringify(u0.filled));
console.log('monarch/force =', u0.snapshot.monarch, '/', u0.snapshot.force, ' year =', u0.snapshot.year);
eq(u0.steps, ['v0→v2', 'v2→v3'], '无 v 老档走两跳');
ok(u0.snapshot.monarch === '公孫瓚' && u0.snapshot.force === '公孫瓚', '从 king 反补 monarch/force');
eq(u0.snapshot.captured, ['x'], '未知键原样保留');

console.log('\n== 3. 账本（R7 语义）=======================================');
const plain = S.newCampaign(S0, { ts: 1 });
console.log('newCampaign.ledger =', JSON.stringify(plain.ledger));
console.log('upgradeSnapshot(newCampaign).changed =', S.upgradeSnapshot(plain).changed);
ok(plain.ledger === undefined, '新开档没有账本（没结过账）');
ok(S.upgradeSnapshot(plain).changed === false, '新开档已是当前结构 → 不判要升级');
const neverSettled = S.upgradeSnapshot({ month: 3, king: 'K', scenario: 1 });
ok(neverSettled.snapshot.ledger === undefined, '迁移不给没结过账的档造空账本');
const dirty = S.upgradeSnapshot({ month: 3, ledger: { year: 0, months: -1, income: 'x', salary: 12.7 } });
console.log('脏账本清洗后 =', JSON.stringify(dirty.snapshot.ledger));
eq(dirty.snapshot.ledger, { year: 1, months: 0, income: 0, salary: 12 }, '已存在的账本按数值/年份清洗');

console.log('\n== 4. 城摘要：officers / flag / cityMorale ==================');
const snap4 = S.newCampaign(S0, { ts: 2 });
snap4.forces = { 公孫瓚: { id: '公孫瓚', king: '公孫瓚', flag: 7, alive: true, cities: [], ts: 0 } };
for (const c of S0.cities) snap4.cities[c.NAME].cityMorale = 55;
const prep = S.prepareSnapshot(snap4, S0.cities, { info: infoOf });
const c0 = prep.cities[S0.cities[0].NAME];
const c4 = prep.cities[S0.cities[4].NAME];
console.log('城0 =', JSON.stringify(c0));
console.log('城4.flag（公孫瓚在 forces 里，flag=7）=', c4.flag);
ok(c0.officers === 0, 'roster 为空 → officers 0', c0.officers);
ok(c4.officers === 2, 'roster 2 人 → officers 2', c4.officers);
ok(c4.flag === 7, '旗号从 forces[owner].flag 派生', c4.flag);
ok(prep.cities[S0.cities[1].NAME].flag === 0, '势力表里没有该势力 → flag 0');
ok(c0.cityMorale === 55 && c4.cityMorale === 55, '民心 cityMorale 透传（不被摘要冲掉）');
const prepFlag = S.prepareSnapshot(S.newCampaign(S0, { ts: 3 }), S0.cities, { info: (n) => ({ ...infoOf(n), flag: 3 }) });
ok(prepFlag.cities[S0.cities[1].NAME].flag === 3, '调用方显式给 flag 时听调用方的');

console.log('\n== 5. 武将档案 =============================================');
const snap5 = S.newCampaign(S0, { ts: 4 });
console.log('GENERAL_STATUS      =', JSON.stringify(S.GENERAL_STATUS));
console.log('GENERAL_STATUS_CODE =', JSON.stringify(S.GENERAL_STATUS_CODE));
S.setGeneralStatus(snap5, '呂布', '野');
S.setGeneralStatus(snap5, '關羽', '登');
S.setEquip(snap5, '關羽', { weapon: '青龍偃月刀', horse: '赤兔馬', thing: '春秋左傳' });
console.log('statusOf(呂布/關羽/張飛) =', S.statusOf(snap5, '呂布'), S.statusOf(snap5, '關羽'), JSON.stringify(S.statusOf(snap5, '張飛')));
console.log('equipOf(關羽) =', JSON.stringify(S.equipOf(snap5, '關羽')));
ok(S.statusOf(snap5, '呂布') === '野', 'statusOf 写读一致');
ok(S.statusOf(snap5, '張飛') === '', '没记录 → 空串（未知，不等于在野）');
eq(S.equipOf(snap5, '關羽'), { weapon: '青龍偃月刀', horse: '赤兔馬', thing: '春秋左傳' }, '三件套往返');
S.setGeneralStatus(snap5, '呂布', '俘');
snap5.fate = { 張遼: { fate: 'wild', force: '', month: 2 } };
ok(S.statusOf(snap5, '呂布') === '俘', '显式状态优先');
ok(S.statusOf(snap5, '張遼') === '野', 'fate=wild 退化到在野');
S.setEquip(snap5, '關羽', { horse: '' });
ok(S.equipOf(snap5, '關羽').horse === '', '空串 = 卸下');

console.log('\n== 6. metaFromSnapshot 摘要 ================================');
const meta = S.metaFromSnapshot(prep, 0, { ts: 9, scenarioName: '劇本1' });
console.log('year/cityOfficers/statusCount/equipCount =', meta.year, meta.cityOfficers, meta.statusCount, meta.equipCount);
console.log('cityCount/generalCount/forceCount       =', meta.cityCount, meta.generalCount, meta.forceCount);
console.log('slotParts（仍 9 段）=', JSON.stringify(S.slotParts(meta, 0)));
const sumOfficers = S0.cities.reduce((n, c, i) => n + (i % 3 === 0 ? 0 : 2), 0);
ok(meta.year === 1, 'year 由 month 算', meta.year);
ok(meta.cityOfficers === sumOfficers, 'cityOfficers = Σ cities[*].officers', meta.cityOfficers);
ok(meta.statusCount === 0 && meta.equipCount === 0, '空档案 → statusCount/equipCount 0');
ok(S.slotParts(meta, 0).length === 9, 'slotParts 仍是 9 段', S.slotParts(meta, 0).length);

console.log('\n== 7. 10 槽互不污染 ========================================');
const store = S.emptyStore();
const a = fresh(); a.generalStatus = { 甲: '登' }; a.weapon = { 甲: '直劍' };
const b = fresh(); b.generalStatus = { 甲: '野', 乙: '俘' }; b.ledger = { year: 1, months: 5, income: 10, salary: 2 };
S.writeSlotAuto(store, 0, a, { ts: 1 });
S.writeSlot(store, 5, b, { ts: 2 });
console.log('槽1 statusCount/equipCount =', store.slots[0].statusCount, store.slots[0].equipCount);
console.log('槽6 statusCount            =', store.slots[5].statusCount);
eq(S.getSnapshot(store, 0).generalStatus, { 甲: '登' }, '槽 1 状态');
eq(S.getSnapshot(store, 5).generalStatus, { 甲: '野', 乙: '俘' }, '槽 6 状态');
S.slotAt(store, 5).snapshot.weapon = { 丙: '銅殳' };
eq(S.getSnapshot(store, 0).weapon, { 甲: '直劍' }, '改槽 6 不影响槽 1');
S.clearSlot(store, 5);
ok(S.getSnapshot(store, 5) === null, 'clearSlot 只清自己');
eq(S.getSnapshot(store, 0).generalStatus, { 甲: '登' }, 'clearSlot 后槽 1 还在');
const back = S.normalizeStore(JSON.parse(JSON.stringify(store)));
eq(back.slots[0].snapshot.generalStatus, { 甲: '登' }, '容器 JSON 往返后槽 1 一致');
ok(back.slots[5] === null, '容器 JSON 往返后槽 6 仍空');

console.log('\n== 8. 自动存档目标（writeSlot 不碰 last）===================');
const bootSlotOf = (st) => {
  let n = S.lastUsed(st) + 1;
  if (!st.slots[n - 1] && S.hasAny(st)) {
    const newest = S.newestSlot(st);
    if (newest >= 0) n = newest + 1;
  }
  return n;
};
const st2 = S.emptyStore();
const s1 = fresh();
console.log('空容器 last =', st2.last, ' bootSlot =', bootSlotOf(st2));
S.writeSlotAuto(st2, 0, s1, { ts: 100 });          // 自动存到槽 1
console.log('autosave → last =', st2.last, ' bootSlot =', bootSlotOf(st2));
S.writeSlot(st2, 1, s1, { ts: 200 });              // 玩家手动存槽 2
console.log('手动存槽 2 后 last =', st2.last, ' bootSlot =', bootSlotOf(st2));
ok(st2.last === 1, '手动存档不改自动存档目标');
ok(bootSlotOf(st2) === 1, 'bootSlot 仍指向自动存档槽 1');
S.writeSlotAuto(st2, bootSlotOf(st2) - 1, s1, { ts: 300 });   // 下一次 autosave()
console.log('再 autosave 后 槽1.ts =', st2.slots[0].ts, ' 槽2.ts =', st2.slots[1].ts);
ok(st2.slots[0].ts === 300 && st2.slots[1].ts === 200, '槽 2 的手动档没被自动存档盖掉');
S.writeSlotAuto(st2, 4, s1, { ts: 400 });
ok(bootSlotOf(st2) === 5, '自动存档换槽后 bootSlot 跟着走');
ok(st2.slots[1].ts === 200, '换自动存档槽也不影响老手动档');

console.log('\n============================================================');
console.log('PASS', pass, '/ FAIL', fails.length);
for (const f of fails) console.log('  ✖', f);
if (fails.length) process.exitCode = 1;
