// @ts-nocheck —— 被测模块 web/saves.js 是浏览器端的无类型 ESM（tsconfig 没有 allowJs），
// 本文件的验收口径是 `node --test`，断言一律 assert/strict。
//
// R7：年度结算（每年正月）。原作依据（见 web/saves.js 顶部大注释）：
//   `0x4238AF: if ([0x4A64FC]==1) { [0x4BD390]++; call 0x423885; [0x4A64FC]=0; }`
//   `0x423885: call 0x423681; 0x423765; 0x42379E; 0x4237A6; if ([0x4A6444]==0) call 0x423824;`
//   —— 五个子函数语义在 docs 全库「未定位」（docs/04c_世界与内政.md:72-79、:491），
//      所以段 1-5 一律 `[推测]`，本测试只锁**结构、触发时机、账本口径与老档迁移**，
//      不锁任何「凭空发明」的数值（粮草/治安/年龄/老死：原作与数据都没有）。
//
// 全部纯函数断言：没有 DOM、没有 localStorage、没有随机、不依赖当前时间（ts 一律传死值）。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as S from '../web/saves.js';

// ---------------------------------------------------------------- 夹具

const RAW = JSON.parse(fs.readFileSync(new URL('../data/scenarios.json', import.meta.url), 'utf8'));
const SCEN = RAW.map((s, i) => ({ ...s, i, id: Number(s.id) || i + 1, name: `劇本${i + 1}` }));
const S0 = SCEN[0];

/** 内存版 localStorage（annualSettle 本身不碰 storage，这里只给 prepareSnapshot/writeSlot 用） */
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _dump: () => Object.fromEntries(m),
  };
}

/** 一个「已经玩了 12 个月」的存档：月 13 = 第 2 年正月，上一年账本齐 */
function yearOneDone() {
  const save = S.newCampaign(S0, { ts: 1700000000000 });
  save.month = 13;
  save.gold = 900;
  save.wins = 7;
  save.losses = 3;
  save.defWins = 2;
  save.ledger = { year: 1, months: 12, income: 480, salary: 180 };
  return save;
}

// ---------------------------------------------------------------- 1. 年 / 月换算

test('yearOf / monthOfYear：绝对月数 ↔ 年（1 起）/ 年内月（1..12）', () => {
  assert.equal(S.YEAR_MONTHS, 12);
  assert.deepEqual([1, 2, 12, 13, 24, 25, 36, 37].map(S.yearOf), [1, 1, 1, 2, 2, 3, 3, 4]);
  assert.deepEqual([1, 2, 12, 13, 24, 25, 36, 37].map(S.monthOfYear),
    [1, 2, 12, 1, 12, 1, 12, 1]);
  // 坏值/越界一律夹到 1（老档 month 缺失时不能算出 NaN 年）
  for (const bad of [0, -3, undefined, null, NaN, 'x', {}]) {
    assert.equal(S.yearOf(bad), 1);
    assert.equal(S.monthOfYear(bad), 1);
  }
  // 与显示层同一个式子：monthLabel 的年/月必须和这两个函数一致
  for (const m of [1, 12, 13, 25, 36]) {
    assert.equal(S.monthLabel(m), `第${S.yearOf(m)}年${S.monthOfYear(m)}月`);
  }
});

test('isYearStart：只有年内 1 月是正月（月 1 / 13 / 25 …）', () => {
  assert.deepEqual([1, 2, 12, 13, 24, 25, 37].map(S.isYearStart),
    [true, false, false, true, false, true, true]);
  assert.equal(S.isYearStart(0), true);       // 坏值夹到月 1
  assert.equal(S.isYearStart(undefined), true);
});

// ---------------------------------------------------------------- 2. 触发时机

test('annualSettle：非正月不结账、不改档（reason=not-january）', () => {
  const save = yearOneDone();
  save.month = 12;                            // 第 1 年 12 月
  const before = JSON.stringify(save);
  const res = S.annualSettle(save, { ts: 1000 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not-january');
  assert.equal(res.month, 12);
  assert.equal(res.year, 1);
  assert.equal(res.closed, 0);
  assert.equal(res.record, null);
  assert.equal(JSON.stringify(save), before, '非正月必须一个字节都不动');
});

test('annualSettle：开局第 1 年 1 月没有上一年可结（reason=first-year）', () => {
  const save = S.newCampaign(S0, { ts: 1 });
  assert.equal(save.month, 1);
  const res = S.annualSettle(save, { ts: 2 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'first-year');
  assert.equal(save.annual, undefined);
  assert.equal(save.ledger, undefined, '不能为了"看起来像结过账"而写空账本');
});

test('annualSettle：月 13（第 2 年正月）触发，结的是第 1 年', () => {
  const save = yearOneDone();
  const res = S.annualSettle(save, { ts: 1700000000777 });
  assert.equal(res.ok, true);
  assert.equal(res.month, 13);
  assert.equal(res.year, 2, '结算后所处的年');
  assert.equal(res.closed, 1, '刚结束、被结账的那一年');
  assert.equal(res.record, save.annual);
});

// ---------------------------------------------------------------- 3. 结账口径

test('annualSettle：账本取上一年 12 个月，入账/官俸/城池/名册/战绩/金 全部照抄存档', () => {
  const save = yearOneDone();
  save.cities['襄平'] = { ...(save.cities['襄平'] || {}), pop: 12000, owner: save.king };
  save.roster = { _moved: {}, 襄平: ['甲', '乙'], 北平: ['丙'] };
  const res = S.annualSettle(save, { ts: 1700000000777 });
  const r = res.record;
  assert.equal(r.v, 1);
  assert.equal(r.year, 1);
  assert.equal(r.intoYear, 2);
  assert.equal(r.at, 1700000000777);
  assert.deepEqual([r.months, r.income, r.salary], [12, 480, 180]);
  assert.equal(r.cities, 3, 'save.owned 的城数');
  assert.equal(r.officers, 3, 'roster 里所有城名册合计，_moved 不算');
  assert.deepEqual([r.wins, r.losses, r.defWins], [7, 3, 2]);
  assert.equal(r.gold, 900);
  assert.ok(r.pop > 0, '人口合计只读城池 pop');
  assert.equal(r.stages.length, 5);
});

test('annualSettle：结完清年进位标志、把账本翻到新一年重记', () => {
  const save = yearOneDone();
  save.yearFlag = 1;                           // [0x4A64FC]
  const res = S.annualSettle(save, { ts: 1 });
  assert.equal(res.ok, true);
  assert.equal(save.yearFlag, 0);              // 0x4238AF 末尾 `[0x4A64FC] = 0`
  assert.deepEqual(save.ledger, { year: 2, months: 0, income: 0, salary: 0 });
  assert.equal(save.year, 2);                  // 年冗余字段跟着 month 走
  assert.equal(save.annual.year, 1);
});

test('annualSettle：账本年份对不上（过期/被改过）就当空账，不补造数字', () => {
  const save = yearOneDone();
  save.ledger = { year: 3, months: 12, income: 9999, salary: 9999 };  // 账本年份对不上
  const r = S.annualSettle(save, { ts: 1 }).record;
  assert.deepEqual([r.months, r.income, r.salary], [0, 0, 0], '不能把今年的账当成去年的结');
});

test('annualSettle：老档（无 year/ledger/annual/roster）迁移：能结、不抛、不发明数值', () => {
  const save = S.newCampaign(S0, { ts: 5 });
  save.month = 25;                             // 第 3 年正月
  delete save.year;
  delete save.ledger;
  delete save.annual;
  delete save.roster;
  const res = S.annualSettle(save, { ts: 6 });
  assert.equal(res.ok, true);
  assert.equal(res.closed, 2);
  assert.deepEqual([res.record.months, res.record.income, res.record.salary], [0, 0, 0]);
  assert.equal(res.record.officers, 0);
  assert.equal(save.year, 3);
  assert.deepEqual(save.ledger, { year: 3, months: 0, income: 0, salary: 0 });
});

test('annualSettle：坏入参不抛（no-save / 空对象 / force 强结）', () => {
  assert.equal(S.annualSettle(null).ok, false);
  assert.equal(S.annualSettle(null).reason, 'no-save');
  assert.equal(S.annualSettle(undefined).ok, false);
  assert.equal(S.annualSettle(42, { force: true }).reason, 'no-save');
  const empty = {};
  const forced = S.annualSettle(empty, { force: true, ts: 9 });
  assert.equal(forced.ok, true, 'force 允许在非正月/空档上结一次（调试与测试用）');
  assert.equal(forced.record.at, 9);
  assert.equal(forced.record.months, 0);
});

test('annualSettle：同月重复调用不会把上一年收入记两遍（账本只认"上年"那一份）', () => {
  const save = yearOneDone();
  const a = S.annualSettle(save, { ts: 1 });
  const snap = JSON.stringify(save);
  const b = S.annualSettle(save, { ts: 2 });
  assert.equal(a.record.income, 480);
  assert.equal(b.ok, true);
  assert.equal(b.record.income, 0, '第二次账本已翻到新一年 → 记 0，不能重复记 480');
  assert.equal(b.record.months, 0);
  assert.equal(save.annual.year, 1);
  assert.notEqual(JSON.stringify(save), snap, '只有 at 变了（记录是覆盖写，不是累加）');
});

// ---------------------------------------------------------------- 4. 账本累计（月推进侧）

test('ledgerOf：老档就地建、跨年自动翻页、坏值夹回 0', () => {
  const save = S.newCampaign(S0, { ts: 1 });
  save.month = 5;
  assert.deepEqual(S.ledgerOf(save), { year: 1, months: 0, income: 0, salary: 0 });
  save.ledger.months = 3;
  save.ledger.income = 60;
  assert.equal(S.ledgerOf(save), save.ledger, '同一年的账本必须复用同一个对象（不能每调一次清空）');
  assert.deepEqual(save.ledger, { year: 1, months: 3, income: 60, salary: 0 });
  save.month = 13;                             // 翻年
  assert.deepEqual(S.ledgerOf(save), { year: 2, months: 0, income: 0, salary: 0 });
  save.ledger = { year: 2, months: -5, income: NaN, salary: 'x' };
  assert.deepEqual(S.ledgerOf(save), { year: 2, months: 0, income: 0, salary: 0 });
});

test('ledgerAdd：只累计、不改 save.gold（金钱产出公式未定位，不能重复发钱）', () => {
  const save = S.newCampaign(S0, { ts: 1 });
  save.gold = 1200;
  S.ledgerAdd(save, { income: 40, months: 1 });
  S.ledgerAdd(save, { income: 40, months: 1 });
  S.ledgerAdd(save, { salary: 9 });
  assert.deepEqual(save.ledger, { year: 1, months: 2, income: 80, salary: 9 });
  assert.equal(save.gold, 1200, '记账不动余额');
  S.ledgerAdd(save, { income: -100, salary: NaN, months: 'x' });   // 负值/坏值不许倒扣
  assert.equal(save.ledger.income, 80);
  assert.equal(save.ledger.salary, 9);
  assert.equal(save.ledger.months, 2);
});

test('ensureYear：年由 month 推出（真源是 month），幂等且不动别的键', () => {
  const save = S.newCampaign(S0, { ts: 1 });
  save.month = 37;
  save.custom = { keep: true };
  assert.equal(S.ensureYear(save), 4);
  assert.equal(save.year, 4);
  assert.equal(S.ensureYear(save), 4);
  save.month = 24;
  assert.equal(S.ensureYear(save), 2, 'month 改了年要跟着改，不能留旧值');
  assert.deepEqual(save.custom, { keep: true });
});

// ---------------------------------------------------------------- 5. 五段钩子的结构

test('YEAR_STAGES：五段、顺序与 0x423885 的 call 顺序逐字对齐，最后一段带 0x4A6444 门', () => {
  assert.equal(S.YEAR_STAGES.length, 5);
  assert.deepEqual(S.YEAR_STAGES.map((s) => s.id),
    ['0x423681', '0x423765', '0x42379E', '0x4237A6', '0x423824']);
  assert.deepEqual(S.YEAR_STAGES.map((s) => s.key),
    ['ledger', 'cities', 'officers', 'record', 'sweep']);
  assert.equal(S.YEAR_STAGES[4].gate, '0x4A6444');
  for (const st of S.YEAR_STAGES) {
    assert.ok(/^\[(推測|確認)\]$/.test(st.evidence), `${st.key} 的 evidence 必須是 [推測] 或 [確認]`);
    assert.ok(st.label.length > 0);
  }
  // R85：第五段 `0x423824` 已由 f2 指令級取證（pop×75/10000 + 2250 逐城），其餘四段語義仍未定位
  assert.equal(S.YEAR_STAGES[4].evidence, '[確認]');
  for (let i = 0; i < 4; i += 1) assert.equal(S.YEAR_STAGES[i].evidence, '[推測]');
  const save2 = yearOneDone();
  assert.deepEqual(S.annualSettle(save2, { ts: 1 }).record.stages.map((s) => s.id),
    S.YEAR_STAGES.map((s) => s.id), '結算記錄裡要留一份當時的段序（存檔可對賬）');
});

// ---------------------------------------------------------------- 6. 战报一行

test('annualText：单行、无换行、含年度结四要素；账本不满 12 月时附注', () => {
  const save = yearOneDone();
  save.ledger.months = 7;                      // 半途读的老档
  const r = S.annualSettle(save, { ts: 1 }).record;
  const t = S.annualText(r);
  assert.equal(t, r.text, 'annualSettle 返回的 text 与 annualText() 必须是同一串');
  assert.ok(!/[\r\n]/.test(t), '战报一行不能带换行');
  for (const kw of ['1年', '年 度 結 算', '歲入 480', '城 3', '將 0', '7 勝 3 敗']) {
    assert.ok(t.includes(kw), `战报缺「${kw}」：${t}`);
  }
  assert.ok(t.includes('賬本 7/12 月'));
  save.ledger.months = 12;
  const full = S.annualText(S.annualSettle(yearOneDone(), { ts: 1 }).record);
  assert.ok(!full.includes('賬本'), '满 12 月不加附注');
  // 空记录也不抛
  assert.ok(S.annualText(null).includes('年 度 結 算'));
  assert.ok(!/[\r\n]/.test(S.annualText({})));
});

// ---------------------------------------------------------------- 7. 存档结构兼容

test('存档结构：year/ledger/annual/lastPost 不被 upgradeSnapshot/prepareSnapshot 丢掉', () => {
  const save = yearOneDone();
  S.annualSettle(save, { ts: 1 });
  save.lastPost = { city: '襄平', joined: ['甲'], dead: ['乙'], month: 13 };
  const up = S.upgradeSnapshot(save);
  assert.ok(up.snapshot, '老/新档都要能升级');
  assert.equal(up.snapshot.year, 2);
  assert.deepEqual(up.snapshot.ledger, { year: 2, months: 0, income: 0, salary: 0 });
  assert.equal(up.snapshot.annual.year, 1);
  assert.deepEqual(up.snapshot.lastPost.joined, ['甲']);
  const snap = S.prepareSnapshot(save, S0.cities, { info: () => ({}) });
  assert.equal(snap.year, 2);
  assert.equal(snap.annual.year, 1);
  // 写进槽、读回来还在（落档验证的是 store 序列化这一层）
  const store = S.emptyStore();
  S.writeSlot(store, 0, snap, { scenarioName: '劇本1', ts: 1 });
  const back = S.getSnapshot(store, 0);
  assert.equal(back.year, 2);
  assert.equal(back.annual.months, 12);
  assert.equal(back.annual.income, 480);
  assert.deepEqual(back.lastPost.dead, ['乙']);
});

test('存档结构：v2 必填字段没被本轮改动（不把 year 塞进 SNAPSHOT_REQUIRED 以免全档重算）', () => {
  const save = yearOneDone();
  S.annualSettle(save, { ts: 1 });
  // 没结过年、也没有 year 字段的 v2 快照仍然算「当前结构」→ 不会被 rearrange/丢字段
  const plain = S.newCampaign(S0, { ts: 1 });
  const up = S.upgradeSnapshot(plain);
  assert.equal(up.changed, false, 'v2 快照不该因为新增年度字段而被判成要升级');
  assert.equal(up.snapshot, plain);
});
