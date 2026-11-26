// @ts-nocheck —— 被测模块是浏览器端的无类型 ESM（tsconfig 没有 allowJs），验收口径是 `node --test`，
// 断言一律 assert/strict。全部纯函数断言：没有 DOM、没有 localStorage 真身、不依赖当前时间（ts 传死值）。
//
// 覆盖三件事（对应 project/181 的三列对照表）：
//   1. 纪元：`web/era.js` —— 原作是「西元 209年 3月」/ 内政面板「209年」，我们以前是「第N年M月」。
//      本文件把「内部仍是年/月两个整数、只有显示改公元、锚点 184 可覆盖」钉死。
//   2. 存档行：`web/saves.js` 的 `slotTitle()` / `slotLineParts()` / `slotLine()` ——
//      原作 4 段 `記錄NN ｜ 君主名 ｜ 城數NN ｜ 武將NNN ｜ 時間NNN年`（A_save_t0035.png）。
//      **老的 `slotParts()` 9 段形状一个字都不许动**（saves_r70:594-623 钉着），这里顺手回归一下。
//   3. 内政 8 栏：`city_model.js civicFields()` —— 时间/君主/城数/关数/武将数/总兵数/金钱/人口，
//      时间只到年、无千分位、关数是 `owned ∩ gate` 的城数。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as era from '../web/era.js';
import * as S from '../web/saves.js';
import * as M from '../web/city_model.js';

const RAW = JSON.parse(fs.readFileSync(new URL('../data/scenarios.json', import.meta.url), 'utf8'));
const SCEN = RAW.map((s, i) => ({ ...s, i, id: Number(s.id) || i + 1, name: `劇本${i + 1}` }));
const S0 = SCEN[0];

const readWeb = (name) => fs.readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');

/** 去掉整行注释（只给「代码里不许出现 xxx」这类断言用，免得注释里的示例命中） */
const stripComments = (src) => String(src).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

/** 内存版 localStorage（saves.js 的 storage 参数可注入） */
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _dump: () => Object.fromEntries(m),
  };
}

// ============================================================ 1. 纪元
test('era: 原作年月匾「西元 209年 3月」', () => {
  // 第 26 年 3 月 = 184 + 25 = 209 年（A_map_date_zoom_t0130.png 逐字）
  assert.equal(era.eraText(26, 3), '西元 209年 3月');
  assert.equal(era.eraText(1, 1), '西元 184年 1月');
  // 绝对月序版：第 26 年 3 月 = (26-1)*12+3 = 303
  assert.equal(era.eraTextOfMonth(303), '西元 209年 3月');
  assert.deepEqual(era.yearMonthOf(303), { year: 26, month: 3 });
  // 坏月份夹回 1..12，不会显示「13 月」
  assert.equal(era.eraText(26, 13), '西元 209年 12月');
  assert.equal(era.eraText(26, 0), '西元 209年 1月');
});

test('era: 只到年的三种写法', () => {
  assert.equal(era.eraYear(26), '西元 209年');      // 带「西元」
  assert.equal(era.yearField(26), '209年');         // 内政面板「时间」（不带西元、不带月）
  assert.equal(era.yearFieldOfMonth(303), '209年');
  assert.equal(era.slotTimeText(26), '209年');      // 存档行「時間209年」
  assert.equal(era.adYearOfMonth(303), 209);
});

test('era: pad2 / pad3 左补零（超宽不截断）', () => {
  assert.equal(era.pad2(1), '01');
  assert.equal(era.pad2(10), '10');
  assert.equal(era.pad2(0), '00');
  assert.equal(era.pad2(100), '100');
  assert.equal(era.pad3(5), '005');
  assert.equal(era.pad3(202), '202');
  assert.equal(era.pad3(1234), '1234');
  assert.equal(era.padN(7, 4), '0007');
});

test('era: 公元锚点 184 且可覆盖（[推测] 第1年=黄巾之乱184年）', () => {
  assert.equal(era.getAnchor(), 184);
  assert.equal(era.toADYear(1), 184);
  assert.equal(era.toADYear(26), 209);
  try {
    assert.equal(era.setAnchor(200), 200);
    assert.equal(era.toADYear(1), 200);
    assert.equal(era.eraText(1, 1), '西元 200年 1月');
    assert.equal(era.yearField(26), '225年');
    // 坏值不把纪元弄坏
    assert.equal(era.setAnchor('x'), 200);
    assert.equal(era.setAnchor(0), 200);
    assert.equal(era.setAnchor(-5), 200);
  } finally {
    assert.equal(era.resetAnchor(), 184);
  }
  assert.equal(era.toADYear(26), 209);
  // 非数字/0 当第 1 年，绝不出现 NaN 年
  assert.equal(era.toADYear(undefined), 184);
  assert.equal(era.toADYear(0), 184);
  assert.equal(era.eraText(undefined, undefined), '西元 184年 1月');
});

test('era: era.js 是纯函数模块（无 DOM / fetch / storage）且挂 window.SG.era', () => {
  const src = readWeb('era.js');
  assert.ok(!/document\./.test(src), 'era.js 不该碰 DOM');
  assert.ok(!/fetch\(/.test(src), 'era.js 不该 fetch');
  assert.ok(!/localStorage\s*\./.test(src), 'era.js 不该碰 localStorage');
  assert.ok(!/^\s*import\s/m.test(src), 'era.js 不该 import 别的模块（避免循环依赖）');
  assert.ok(/window\.SG/.test(src), '要挂 window.SG.era');
  assert.ok(/typeof window !== 'undefined'/.test(src), 'Node 下不能因为 window 不存在而炸');
});

// ============================================================ 2. 存档行
test('saves: 行标题「記錄01」…「記錄10」（两位补零）', () => {
  assert.equal(S.SLOT_LABEL, '記錄');
  assert.equal(S.slotTitle(0), '記錄01');
  assert.equal(S.slotTitle(9), '記錄10');
  assert.equal(S.slotTitle(5), '記錄06');
  assert.equal(S.slotTitle(3, '记录'), '记录04');   // 简体转写可换，只影响标签
});

/** 一局刚开局（第1年1月）的存档，走真实 newCampaign + prepareSnapshot */
function bootCampaign(ts = 1700000000000) {
  const save = S.newCampaign(S0, { ts });
  return S.prepareSnapshot(save, S0.cities, {});
}

test('saves: 原作 4 段（君主名 ｜ 城數NN ｜ 武將NNN ｜ 時間NNN年）', () => {
  const snap = bootCampaign();
  const store = { v: S.STORE_VERSION, last: 0, slots: new Array(S.SLOT_COUNT).fill(null) };
  const entry = S.writeSlot(store, 0, snap, { scenarioName: S0.name, ts: 1700000000123 });
  assert.ok(entry, 'writeSlot 不该失败');

  const p = S.slotLineParts(entry, 0);
  assert.equal(p.length, 4, '原作是 4 段，不是老 slotParts 的 9 段');
  assert.equal(p[0], snap.monarch, '第 1 段是君主名，没有「君主」二字前缀');
  assert.ok(!p[0].startsWith('君主'));
  assert.match(p[1], /^城數\d{2}$/, '城數 2 位补零');
  assert.equal(p[1], `城數${era.pad2(snap.owned.length)}`);
  assert.match(p[2], /^武將\d{3}$/, '武將 3 位补零');
  assert.match(p[3], /^時間\d+年$/, '時間只有年');
  assert.equal(p[3], '時間184年', '第 1 年 = 184 年（A_save_t0035 的「時間210年」同格式）');
  assert.ok(!p[3].includes('西元'), '存档行不带「西元」');
  assert.ok(!p[3].includes('月'), '存档行不带月');

  // 一行文字：段间 ` ｜ `
  assert.equal(S.slotLine(entry, 0), p.join(' ｜ '));
  assert.ok(S.slotLine(entry, 0).includes(' ｜ '));

  // 空槽
  assert.deepEqual(S.slotLineParts(null, 4), ['空']);
  assert.equal(S.slotLine(null, 4), '空');
});

test('saves: 老槽（无 adYear）从 year/month 现算，不出现 undefined 年', () => {
  assert.equal(S.slotLineParts({ monarch: '金旋', ownedCount: 1, generalCount: 2, month: 303 }, 0)[3], '時間209年');
  // 只有 year、没有 month 的老档也要能算
  assert.equal(S.slotLineParts({ monarch: '金旋', ownedCount: 1, generalCount: 2, year: 26 }, 0)[3], '時間209年');
  assert.equal(S.slotLineParts({ monarch: '', ownedCount: 0, generalCount: 0, month: 1 }, 0)[0], '—');
});

test('saves: metaFromSnapshot 带 adYear 镜像', () => {
  const snap = bootCampaign();
  const meta = S.metaFromSnapshot(snap, 0);
  assert.equal(meta.year, 1);
  assert.equal(meta.adYear, 184);
  assert.equal(meta.time, '第1年1月', '老口径 monthLabel 不动（R70 钉着）');
});

test('saves: 同一局可占多个槽（原作 記錄07=211年 / 記錄08=210年）', () => {
  const st = mockEmptyStore();
  // 同一局：同一个君主金旋，城數01、武將002，只是月份不同
  const mk = (month, gen) => {
    const snap = bootCampaign();
    snap.month = month;
    snap.year = S.yearOf(month);
    snap.monarch = '金旋';
    snap.owned = [S0.cities[0].NAME];
    snap.generalLevel = Object.fromEntries(Array.from({ length: gen }, (_, k) => [`將${k}`, 1]));
    return S.prepareSnapshot(snap, S0.cities, {});
  };
  const a = S.writeSlot(st, 6, mk((211 - 184) * 12 + 1, 2), { scenarioName: S0.name, ts: 1700000000001 });
  const b = S.writeSlot(st, 7, mk((210 - 184) * 12 + 1, 1), { scenarioName: S0.name, ts: 1700000000002 });
  assert.ok(a && b);
  assert.ok(st.slots[6] && st.slots[7], '两格都留着，后写的没覆盖前写的');
  assert.equal(S.slotLineParts(a, 6)[0], S.slotLineParts(b, 7)[0], '同一个君主');
  assert.equal(S.slotLineParts(a, 6)[3], '時間211年');
  assert.equal(S.slotLineParts(b, 7)[3], '時間210年');
  assert.equal(S.slotLineParts(a, 6)[1], '城數01');
  assert.equal(S.slotLineParts(b, 7)[2], '武將001');

  // 存盘→读盘一圈，两个槽都还在（normalizeStore 不去重）
  const storage = memStorage();
  S.saveStore(st, storage);
  const back = S.loadStore(storage);
  assert.ok(back.slots[6] && back.slots[7]);
  assert.equal(S.slotLineParts(back.slots[6], 6)[3], '時間211年');
  assert.equal(S.slotLineParts(back.slots[7], 7)[3], '時間210年');
});

function mockEmptyStore() {
  return { v: S.STORE_VERSION, last: 0, slots: new Array(S.SLOT_COUNT).fill(null) };
}

test('saves: 老的 slotParts() 9 段形状没被改动', () => {
  const snap = bootCampaign();
  const entry = S.metaFromSnapshot(snap, 0);
  const p = S.slotParts(entry, 0);
  assert.equal(p.length, 9);
  assert.equal(p[0], '槽1');
  assert.equal(p[2], '第1年1月');
  assert.deepEqual(S.slotParts(null, 4), ['槽5', '空']);
});

test('saves: 原作没有删除入口，月推进提示是「內政時間到了....」', () => {
  assert.equal(S.SLOT_DELETE_UI, false, '存/读档对话框不显示删除按钮');
  assert.equal(S.advanceNotice, '內政時間到了....');
  assert.equal(S.advanceNotice.slice(-4), '....', '四个半形点，不是省略号');
  assert.ok(!S.advanceNotice.includes('…'));
  assert.ok(!S.advanceNotice.includes('。'));
  // 简体转写也备着，但只有「内政」两个字不同
  assert.equal(S.advanceNoticeSimp.replace('内', '內').replace('时间', '時間').replace('时', '時').replace('间', '間'), S.advanceNotice);
});

// ============================================================ 3. 内政 8 栏
const DEFS = [
  { NAME: 'A', POPULATION: 126500, MONEY: 100, RATE: 3, DEFENSE: 100 },
  { NAME: 'B', POPULATION: 40000, MONEY: 80, RATE: 3, DEFENSE: 100 },
  { NAME: 'G', POPULATION: 0, MONEY: 0, RATE: 0, DEFENSE: 100 },   // 关：RATE=0 + POPULATION=0
];

/** 金旋那一格：时间 209年 / 城數 1 / 關數 0 / 武將數 1人 / 總兵數 30人 / 金錢 3198 / 人口 126500人 */
function civicSave(over = {}) {
  return {
    v: 3, month: 303, year: 26, gold: 3198, monarch: '金旋',
    owned: ['A'], cities: { A: { troops: 30, pop: 126500 } },
    ...over,
  };
}
const GEN = [{ NAME: '金旋', CITY: 'A' }, { NAME: '鞏志', CITY: 'A' }];

test('civicFields: 8 栏对得上 A_city_t0030（时间只到年、无千分位、人只在三栏）', () => {
  const cv = M.civicFields(civicSave(), DEFS, { generals: GEN, scenIdx: 0 });
  assert.deepEqual(Object.keys(cv).filter((k) => !['cityNames', 'gateNames'].includes(k)).sort(),
    ['adYear', 'cityCount', 'gateCount', 'generalCount', 'gold', 'monarch', 'pop', 'timeText', 'troopCount', 'year'].sort());
  assert.equal(cv.timeText, '209年');
  assert.equal(cv.adYear, 209);
  assert.equal(cv.monarch, '金旋');
  assert.equal(cv.cityCount, 1);
  assert.equal(cv.gateCount, 0);
  assert.equal(cv.generalCount, 2, '武将数 = 在我方城内的武将（含本城常驻）');
  assert.equal(cv.troopCount, 30);
  assert.equal(cv.gold, 3198);
  assert.equal(cv.pop, 126500);
  // 无千分位：显示层直接 String()，这里保证回的是纯数字
  assert.equal(String(cv.pop).includes(','), false);
  assert.equal(String(cv.gold).includes(','), false);
  assert.equal(typeof cv.pop, 'number');
});

test('civicFields: 关数 = owned 里的 gate（RATE=0），城数关数互斥且相加=owned 数', () => {
  const cv = M.civicFields(civicSave({ owned: ['A', 'B', 'G'] }), DEFS, { generals: GEN, scenIdx: 0 });
  assert.equal(cv.cityCount, 2);
  assert.equal(cv.gateCount, 1);
  assert.equal(cv.cityCount + cv.gateCount, 3);
  assert.deepEqual(cv.cityNames, ['A', 'B']);
  assert.deepEqual(cv.gateNames, ['G']);
  // G 没有运行态 ⇒ 守军按 gateTroopsOf() 的 110 估（不是 troopCapOf(0) 的巧合）
  assert.equal(cv.troopCount, 30 + M.troopCapOf(40000) + 110);
  // 关的人口是 0，不额外加
  assert.equal(cv.pop, 126500 + 40000);
});

test('civicFields: 只读 —— 不会顺手把城态实体化/写回存档', () => {
  const save = civicSave({ owned: ['A', 'B'] });
  const before = JSON.stringify(save);
  M.civicFields(save, DEFS, { generals: GEN, scenIdx: 0 });
  assert.equal(JSON.stringify(save), before);
  assert.equal(save.cities.B, undefined, '没跑过 ensureCityState 的城不该被建出来');
});

test('civicFields: 缺 ctx / 空存档不炸', () => {
  const cv = M.civicFields(civicSave(), DEFS, undefined);
  assert.equal(cv.generalCount, 0);
  assert.equal(cv.timeText, '209年');
  const empty = M.civicFields({}, [], null);
  assert.equal(empty.cityCount, 0);
  assert.equal(empty.gateCount, 0);
  assert.equal(empty.troopCount, 0);
  assert.equal(empty.timeText, '184年');
});

// ============================================================ 4. city.html 静态契约
test('city.html: 内政 8 栏的 id 与标签都在，且不再有千分位', () => {
  const html = readWeb('city.html');
  for (const id of ['fvTime', 'fvKing', 'fvCity', 'fvGate', 'fvGens', 'fvTroops', 'fvGold', 'fvPop']) {
    assert.ok(html.includes(`id="${id}"`), `缺 #${id}`);
  }
  // [F16] 「金」這個字要能看出是國庫還是本城金：兩處都要寫明，不能只寫一個「金」
  for (const k of ['時間', '君主', '城數', '關數', '武將數', '總兵數', '國庫', '人口']) {
    assert.ok(html.includes(`<span class="k">${k}</span>`), `缺「${k}」标签`);
  }
  assert.ok(html.includes('<span class="k">本城金</span>'), 'HUD 的「金」chip 要標明是本城金');
  assert.ok(!/<span class="k">金錢<\/span>/.test(html), '舊的「金錢」標籤（口徑不明）應已改掉');
  assert.ok(!/toLocaleString\('en-US'\)/.test(stripComments(html)), '数字不该再过 en-US 千分位');
  assert.ok(html.includes("from './era.js'"), 'city.html 要 import era.js');
  assert.ok(/era\.eraTextOfMonth\(save\.month\)/.test(html), '页头年月走纪元');
  assert.ok(/M\.civicFields\(save, scenario\?\.cities \|\| \[\], ctx\)/.test(html), '渲染要调 civicFields');
  // 布局骨架没被换掉：命令的容器与结果面板还在（F7 后主区 #grid + 副区 #subgrid）
  assert.ok(html.includes('id="grid"') && html.includes('id="log"'));
  assert.ok(html.includes('id="subgrid"'), '副令（情報／移動）區塊要存在');
});
