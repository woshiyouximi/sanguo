/**
 * saves_selftest.mjs — 存档位模块的离线自测（不启浏览器、不碰真实 localStorage）。
 *
 * 跑法：`node game/web/saves_selftest.mjs`
 * 覆盖任务书 ①–⑧：
 *   ① 空存档初始化 10 槽            ② 存→读回字段一致（含未知字段）
 *   ③ 删槽后为空                     ④ 覆盖写不产生额外槽
 *   ⑤ 旧 sanguo_campaign_v1 迁移槽1  ⑥ 切剧本后初始三城来自新剧本
 *   ⑦ snapshot 深拷贝                ⑧ 槽位越界 / 损坏 JSON 不崩
 */

import fs from 'node:fs';
import {
  SAVE_KEY, LEGACY_KEY, SLOT_COUNT,
  num, intOr, deepClone, monthLabel, clockLabel, slotIndex,
  emptyStore, normalizeStore, loadStore, saveStore, hasAny, lastUsed, newestSlot, slotAt,
  metaFromSnapshot, writeSlot, getSnapshot, clearSlot,
  readLegacy, writeLegacy, clearLegacy, migrateLegacy,
  cityTroops, cityState, newCampaign, slotParts, slotSummary,
} from './saves.js';

// ---------------------------------------------------------------------------
// 迷你测试框架
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
const failures = [];

function ok(no, name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`${no} ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    failures.push(`${no} ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`${no} ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(no, name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(no, name, a === e, a === e ? '' : `got ${a} want ${e}`);
}

/** 内存 localStorage（只实现 module 用到的三个方法） */
function memStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(k); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    _map: map,
  };
}

const readJSON = (url) => JSON.parse(fs.readFileSync(url, 'utf8'));
const SCEN = readJSON(new URL('../data/scenarios.json', import.meta.url));

// ---------------------------------------------------------------------------
// ① 空存档
// ---------------------------------------------------------------------------
{
  const st = memStorage();
  const store = loadStore(st);
  ok('01', '① 空存档初始化 10 槽', store.slots.length === SLOT_COUNT && store.slots.every((s) => s === null),
    `slots=${store.slots.length} 全空=${store.slots.every((s) => s === null)}`);
  ok('02', '① 默认最近使用槽 = 槽 1，且 hasAny=false',
    lastUsed(store) === 0 && store.last === 1 && hasAny(store) === false && newestSlot(store) === -1);
  ok('03', '① 空槽摘要 = 「槽1 · 空」', slotSummary(null, 0) === '槽1 · 空', slotSummary(null, 0));
}

// ---------------------------------------------------------------------------
// ② 存 → 读回（含未知字段）
// ---------------------------------------------------------------------------
const UNKNOWN = {
  captured: { 北平: { day: 3, by: '關羽' } },
  drops: ['鐵甲', '戰馬'],
  'weird-key': 42,
  nested: { list: [1, 2, { deep: true }] },
};

function sampleSave(over = {}) {
  return {
    seeded: true,
    scenario: 2,
    month: 9,
    gold: 3210,
    wins: 3,
    losses: 2,
    defWins: 1,
    owned: ['襄平', '北平', '代縣'],
    cities: {
      襄平: { troops: 141, pop: 74500, money: 2808 },
      北平: { troops: 145, pop: 89000, money: 2917 },
      代縣: { troops: 177, pop: 169000, money: 3517 },
    },
    log: [{ t: '第1年8月', s: '徵兵', k: 'act' }],
    ts: 1700000000000,
    ...deepClone(UNKNOWN),
    ...over,
  };
}

let store2;
{
  const st = memStorage();
  store2 = loadStore(st);
  const snap = sampleSave();
  const entry = writeSlot(store2, 0, snap, { ts: snap.ts, scenarioName: '討伐董卓' });
  saveStore(store2, st);

  ok('04', '② 写槽成功且默认名 = 槽 1', entry && entry.name === '槽 1' && entry.id === 1);
  eq('05', '② 元数据字段（剧本/月/金/城数/胜负/时间）',
    [entry.scenario, entry.scenarioName, entry.month, entry.gold, entry.ownedCount, entry.wins, entry.losses, entry.time],
    [2, '討伐董卓', 9, 3210, 3, 3, 2, '第1年9月']);

  const back = getSnapshot(store2, 0);
  ok('06', '② 存 → 读回整份一致（含未知字段）',
    JSON.stringify(back) === JSON.stringify(snap),
    `captured=${JSON.stringify(back?.captured)} drops=${JSON.stringify(back?.drops)}`);
  ok('07', '② 未知字段逐个点名', back['weird-key'] === 42 && back.nested.list[2].deep === true
    && back.captured['北平'].by === '關羽' && back.drops.length === 2);

  const disk = loadStore(st);
  ok('08', '② 落盘后重新 loadStore 仍保留未知字段',
    JSON.stringify(disk.slots[0].snapshot) === JSON.stringify(snap),
    `disk.captured=${disk.slots[0].snapshot?.captured ? '在' : '丢'}`);
}

// ---------------------------------------------------------------------------
// ⑦ 深拷贝
// ---------------------------------------------------------------------------
{
  const snap = sampleSave();
  const st = memStorage();
  const store = loadStore(st);
  writeSlot(store, 0, snap, { ts: snap.ts });

  snap.captured['北平'].day = 99;
  snap.owned.push('鄴');
  const stored = getSnapshot(store, 0);
  ok('09', '⑦ 写后改内存对象，不影响已存 snapshot',
    stored.captured['北平'].day === 3 && stored.owned.length === 3,
    `day=${stored.captured['北平'].day} owned=${stored.owned.length}`);

  stored.owned.push('許昌');
  stored.cities['襄平'].troops = 9;
  const again = getSnapshot(store, 0);
  ok('10', '⑦ 读出对象再改，也不反写 store',
    again.owned.length === 3 && again.cities['襄平'].troops === 141,
    `owned=${again.owned.length} troops=${again.cities['襄平'].troops}`);
}

// ---------------------------------------------------------------------------
// ④ 覆盖写
// ---------------------------------------------------------------------------
{
  const st = memStorage();
  const store = loadStore(st);
  writeSlot(store, 0, sampleSave({ month: 9 }));
  writeSlot(store, 0, sampleSave({ month: 21, gold: 8888, wins: 9 }));
  saveStore(store, st);
  const back = loadStore(st);
  ok('11', '④ 覆盖写不产生额外槽 / 槽数恒为 10',
    back.slots.length === SLOT_COUNT && back.slots.filter(Boolean).length === 1,
    `非空槽=${back.slots.filter(Boolean).length}`);
  ok('12', '④ 覆盖后内容与元数据都是新的',
    back.slots[0].month === 21 && back.slots[0].gold === 8888 && back.slots[0].wins === 9
    && back.slots[0].time === '第2年9月' && back.last === 1,
    `month=${back.slots[0].month} time=${back.slots[0].time}`);
}

// ---------------------------------------------------------------------------
// ③ 删槽
// ---------------------------------------------------------------------------
{
  const st = memStorage();
  const store = loadStore(st);
  writeSlot(store, 0, sampleSave());
  writeSlot(store, 1, sampleSave({ scenario: 3, month: 30 }));
  saveStore(store, st);

  const had = clearSlot(store, 1);
  saveStore(store, st);
  const back = loadStore(st);
  ok('13', '③ 删槽后该槽为空，其它槽不受影响',
    had === true && back.slots[1] === null && back.slots[0] !== null
    && slotSummary(back.slots[1], 1) === '槽2 · 空',
    `slot2=${slotSummary(back.slots[1], 1)}`);
  ok('14', '③ 再删一次返回 false（幂等）', clearSlot(back, 1) === false);
  ok('15', '③ 清空后 hasAny=false', !hasAny(emptyStore()) && hasAny(back));
}

// ---------------------------------------------------------------------------
// ⑤ 旧档迁移
// ---------------------------------------------------------------------------
const LEGACY_SAVE = sampleSave({ scenario: 2, month: 9, gold: 3210, ts: 1699999999000 });

{
  const st = memStorage({ [LEGACY_KEY]: JSON.stringify(LEGACY_SAVE) });
  const r = migrateLegacy({ storage: st, now: 1700000005000, scenarioNameOf: (id) => (id === 2 ? '討伐董卓' : '') });
  const back = loadStore(st);
  ok('16', '⑤ 旧 sanguo_campaign_v1 自动迁移到槽 1',
    r.migrated === true && r.index === 0 && back.last === 1 && back.slots.filter(Boolean).length === 1,
    `migrated=${r.migrated} last=${back.last}`);
  ok('17', '⑤ 迁移内容与旧档逐字段一致（未知字段也带过来）',
    JSON.stringify(back.slots[0].snapshot) === JSON.stringify(LEGACY_SAVE)
    && back.slots[0].snapshot.captured['北平'].day === 3,
    `time=${back.slots[0].time} 城=${back.slots[0].ownedCount}`);

  const r2 = migrateLegacy({ storage: st, now: 1700000006000 });
  ok('18', '⑤ 迁移幂等：已有槽时不再迁移、不覆盖',
    r2.migrated === false && r2.reason === 'has-slots'
    && JSON.stringify(loadStore(st).slots[0].snapshot) === JSON.stringify(LEGACY_SAVE));
}

// ---------------------------------------------------------------------------
// ⑧ 坏数据 / 越界
// ---------------------------------------------------------------------------
{
  const brokenStore = memStorage({ [SAVE_KEY]: '{这不是 JSON' });
  let threw = false;
  let store;
  try { store = loadStore(brokenStore); } catch { threw = true; }
  ok('19', '⑧ 损坏的 sanguo_saves_v1 不崩，退回 10 空槽',
    !threw && store && store.slots.length === SLOT_COUNT && !hasAny(store));

  const brokenLegacy = memStorage({ [LEGACY_KEY]: 'null' });
  ok('20', '⑧ 损坏/空的旧档不崩，readLegacy=null、迁移 no-legacy',
    readLegacy(brokenLegacy) === null && migrateLegacy({ storage: brokenLegacy }).reason === 'no-legacy');

  const st = memStorage();
  const s = loadStore(st);
  ok('21', '⑧ 槽位越界/非法入参全部安全返回',
    slotIndex(-1) === -1 && slotIndex(SLOT_COUNT) === -1 && slotIndex('abc') === -1
    && slotIndex('9') === 9
    && writeSlot(s, -1, sampleSave()) === null && writeSlot(s, SLOT_COUNT, sampleSave()) === null
    && writeSlot(s, 0, null) === null && writeSlot(s, 0, 'x') === null
    && getSnapshot(s, 99) === null && getSnapshot(s, -3) === null
    && clearSlot(s, 99) === false && slotAt(s, 'x') === null,
    'write/get/clear 均不抛');
  ok('22', '⑧ 坏 entries 容器被 normalize 成 10 槽且保留未知顶层键',
    (() => {
      const bad = normalizeStore({ v: 1, last: 99, slots: [{ snapshot: null }, 'x', { snapshot: { month: 4 } }, ...Array(9).fill(null)], note: 'keep' });
      return bad.slots.length === SLOT_COUNT && bad.last === SLOT_COUNT && bad.note === 'keep'
        && bad.slots[0] === null && bad.slots[2] !== null;
    })());
  ok('23', '⑧ saveStore 对 null/坏 store 不抛、只写空容器', (() => {
    const t = memStorage();
    const a = saveStore(null, t) === true;
    const b = saveStore({ slots: 'x' }, t) === true;
    const back = loadStore(t);
    return a && b && back.slots.length === SLOT_COUNT && !hasAny(back);
  })());
}

// ---------------------------------------------------------------------------
// ⑥ 剧本切换初始三城
// ---------------------------------------------------------------------------
{
  const s1 = SCEN[0];
  const s3 = SCEN[2];
  const c1 = newCampaign(s1, { ts: 1700000000000 });
  const c3 = newCampaign(s3, { ts: 1700000000000 });
  ok('24', '⑥ 新剧本初始三城来自该剧本 cities 的前三城',
    c1.owned.join() === s1.cities.slice(0, 3).map((c) => c.NAME).join()
    && c3.owned.join() === s3.cities.slice(0, 3).map((c) => c.NAME).join(),
    `S1=${c1.owned.join('/')} S3=${c3.owned.join('/')}`);
  ok('25', '⑥ 不同剧本的同一城数据不同（襄平 79500 vs 83500）',
    c1.cities['襄平'].pop === 79500 && c3.cities['襄平'].pop === 83500
    && c3.cities['襄平'].troops === cityTroops(s3.cities[0]),
    `S1.pop=${c1.cities['襄平'].pop} S3.pop=${c3.cities['襄平'].pop}`);
  ok('26', '⑥ 新游戏字段：1 月 / 1200 金 / 0 胜 / 60 城 / scenario 数字',
    c3.month === 1 && c3.gold === 1200 && c3.wins === 0 && c3.losses === 0
    && Object.keys(c3.cities).length === s3.cities.length && c3.scenario === s3.id
    && c3.log.length === 0 && c3.ts === 1700000000000,
    `cities=${Object.keys(c3.cities).length} scenario=${c3.scenario}`);
  ok('27', '⑥ 兵力公式与原 campaign 一致（襄平 79500 → 141，上限 600）',
    cityTroops(s1.cities[0]) === 141 && cityTroops({ POPULATION: 2000000 }) === 600
    && cityTroops({}) === 110,
    `troops=${cityTroops(s1.cities[0])} cap=${cityTroops({ POPULATION: 2000000 })}`);
}

// ---------------------------------------------------------------------------
// 摘要 / 时间格式 / 落盘往返
// ---------------------------------------------------------------------------
{
  const entry = metaFromSnapshot(sampleSave(), 0, { ts: 1700000000000, scenarioName: '討伐董卓' });
  ok('28', '摘要格式：槽N · 剧本 · 第X年Y月 · 城N · X勝Y敗 · 时间',
    /^槽1 · 討伐董卓 · 第1年9月 · 城3 · 3勝2敗 · \d{2}-\d{2} \d{2}:\d{2}$/.test(slotSummary(entry, 0)),
    slotSummary(entry, 0));
  ok('29', '月/时间标签边界：第 1 年 1 月 ↔ month 1，month 13 → 第 2 年 1 月',
    monthLabel(1) === '第1年1月' && monthLabel(13) === '第2年1月'
    && monthLabel(0) === '第1年1月' && monthLabel('x') === '第1年1月'
    && clockLabel(0) === '—' && clockLabel(undefined) === '—');
  ok('30', '数值工具：num/intOr 对空串与 null 收敛',
    num('') === 0 && num('12') === 12 && num(undefined) === 0
    && intOr('3.9', 1) === 3 && intOr('x', 7) === 7 && intOr(99, 0, 0, 10) === 10);

  // 落盘往返：槽 1..10 混写，重新 loadStore 后结构不变
  const st = memStorage();
  const store = loadStore(st);
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (i % 3 === 0) writeSlot(store, i, sampleSave({ month: i + 1, scenario: (i % 5) + 1 }), { ts: 1700000000000 + i });
  }
  saveStore(store, st);
  const back = loadStore(st);
  ok('31', '31 十个槽混写后落盘往返结构不变',
    back.slots.length === SLOT_COUNT
    && JSON.stringify(back.slots.map((e) => (e ? e.month : null)))
      === JSON.stringify(store.slots.map((e) => (e ? e.month : null)))
    && back.last === store.last,
    `非空槽=${back.slots.filter(Boolean).length} last=${back.last}`);

  const cleared = memStorage();
  saveStore(loadStore(cleared), cleared);
  clearLegacy(cleared);
  ok('32', '32 clearLegacy 后旧键不存在', cleared.getItem(LEGACY_KEY) === null);
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
const total = pass + fail;
console.log('');
if (failures.length) {
  console.log('失敗：');
  for (const f of failures) console.log('  ' + f);
}
console.log(`${pass} 過 / ${total} 條`);
process.exitCode = fail === 0 ? 0 : 1;
