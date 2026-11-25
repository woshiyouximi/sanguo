// @ts-nocheck —— 被测 web/city_model.js、web/ai_model.js 是浏览器端无类型 ESM（tsconfig 没有 allowJs）；
// 本文件按 node:test 跑运行时断言，断言一律 assert/strict。
//
// R83 web 侧真 bug 守护：
//   A. 搜索种子被 MAX_LOG 截断：count 从被截断的 searchLog 数条数 → 第 61 次起种子冻结。
//      修法：save.searchSeq 存单调计数器；本文件钉「100 次同城同月 → 100 个种子 / 分布不退化」
//      以及「旧口径对照组仍会冻在 61 个种子」，确保测试真的能照见这个 bug。
//   B. R17 SearchType 等级窗（04b2 §5.3）：本移植原先只按 Rate 抽、从不读 Level。
//      修法：searchItemWeight + searchPools(level) + search() 的等级源；等级未知（0）时保持旧口径。
//   C. AI 九项 ACT 的分布：候选层必须真有 attack/develop/search，ctx.kinds 能选出内政月。
//      （「默认选中层全 attack」是原作 Rate=100 压过内政 18..35 的设计后果，见 79 报告 §3。）

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
const cdef = (name, sc = S0) => sc.cities.find((c) => c.NAME === name);

function fresh(sc = S0) {
  const save = Saves.newCampaign(sc);
  M.ensureExtras(save);
  for (const c of sc.cities) M.ensureCityState(save, c);
  save.gold = 1e9;
  save.month = 1;
  return save;
}

const ctxWith = (items, extra = {}) => ({
  generals: [], scenario: S0, scenIdx: 0, items, wises: WISES, ...extra,
});

/** 只留非 ONLYONE，避免 100 抽里唯一物品把池子抽空影响分布对照 */
const REPEATABLE = ITEMS.filter((it) => String(it.Attrib || '') !== 'ONLYONE');

// ================================================================ A. 搜索种子
test('R83 搜索计数器：同城同月 100 抽，searchSeq=100、searchLog 仍只留 60，种子 100 个', () => {
  const save = fresh();
  const seeds = new Set();
  for (let i = 0; i < 100; i += 1) {
    seeds.add(M.search(save, cdef('代縣'), ctxWith(REPEATABLE)).seed);
  }
  assert.equal(M.searchCount(save, '代縣'), 100);
  assert.equal(save.searchSeq['代縣'], 100);
  assert.equal(save.searchLog.length, M.SEARCH.MAX_LOG);
  assert.equal(seeds.size, 100, '100 次搜索必须是 100 个不同种子');
});

test('R83 搜索分布：100 抽产出 ≥30 种、最长同结果连击 ≤10（修复前是 25 种 / 连击 40）', () => {
  const save = fresh();
  const hist = new Map();
  let last = null;
  let run = 0;
  let maxRun = 0;
  for (let i = 0; i < 100; i += 1) {
    const r = M.search(save, cdef('代縣'), ctxWith(REPEATABLE));
    const key = `${r.kind}:${r.seq ?? ''}`;
    hist.set(key, (hist.get(key) || 0) + 1);
    if (key === last) run += 1;
    else { last = key; run = 1; }
    maxRun = Math.max(maxRun, run);
  }
  assert.ok(hist.size >= 30, `distinct outcomes=${hist.size}`);
  assert.ok(maxRun <= 10, `max run=${maxRun}`);
});

test('R83 对照：把 count 强行喂回旧口径（min(i,60)）时，100 抽只剩 61 个种子、连击 40', () => {
  // 旧实现 searchCount() = searchLog.filter(...).length，而 searchLog 只留 60 条，
  // 所以第 61 次起 count 恒为 60。这里每次把计数器重置成旧口径，复现同一现象；
  // 测试仍然打在修好的代码上（search() 读 searchSeq），只是输入换了。
  const save = fresh();
  const seeds = new Set();
  const hist = new Map();
  let last = null;
  let run = 0;
  let maxRun = 0;
  for (let i = 0; i < 100; i += 1) {
    save.searchSeq['代縣'] = Math.min(i, 60);
    const r = M.search(save, cdef('代縣'), ctxWith(REPEATABLE));
    seeds.add(r.seed);
    const key = `${r.kind}:${r.seq ?? ''}`;
    hist.set(key, (hist.get(key) || 0) + 1);
    if (key === last) run += 1;
    else { last = key; run = 1; }
    maxRun = Math.max(maxRun, run);
  }
  assert.equal(seeds.size, 61, '旧口径：0..60 共 61 个 count');
  assert.ok(maxRun >= 20, `旧口径：尾部 40 抽同一结果，实测 max run=${maxRun}`);
  assert.ok(hist.size < 30, `旧口径：distinct outcomes=${hist.size}（修复后 ≥30）`);
});

test('R83 老存档迁移：无 searchSeq 时按日志补到 60，下一抽从 61 起、不再冻结', () => {
  const save = {
    gold: 1e9,
    month: 1,
    searchLog: [
      { t: '', m: 1, city: '代縣', cmd: '徵兵', kind: 'info', text: '不是搜索' },
      ...Array.from({ length: 60 }, (_, i) => ({ t: '', m: 1, city: '代縣', cmd: '搜索', kind: 'none', text: `s${i}` })),
    ],
  };
  M.ensureExtras(save);
  assert.equal(save.searchLog.length, M.SEARCH.MAX_LOG);
  assert.equal(save.searchSeq['代縣'], 60, '日志只剩 60 条 ⇒ 迁移下限 60');
  assert.equal(M.searchCount(save, '代縣'), 60);
  const r = M.search(save, cdef('代縣'), ctxWith([]));
  assert.equal(r.ok, true);
  assert.equal(save.searchSeq['代縣'], 61, '下一抽必须从 61 起（旧实现会停在 60）');
  assert.equal(M.searchCount(save, '代縣'), 61);
});

test('R83 金不足：search 早退，不扣金也不动 searchSeq', () => {
  const save = fresh();
  save.gold = M.SEARCH.COST - 1;
  const before = JSON.stringify(save.searchSeq);
  const r = M.search(save, cdef('代縣'), ctxWith(REPEATABLE));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'gold');
  assert.equal(save.gold, M.SEARCH.COST - 1);
  assert.equal(JSON.stringify(save.searchSeq), before);
});

test('R83 多城独立：代縣 5 抽、襄平 3 抽，计数器各记各的', () => {
  const save = fresh();
  for (let i = 0; i < 5; i += 1) M.search(save, cdef('代縣'), ctxWith([]));
  for (let i = 0; i < 3; i += 1) M.search(save, cdef('襄平'), ctxWith([]));
  assert.equal(M.searchCount(save, '代縣'), 5);
  assert.equal(M.searchCount(save, '襄平'), 3);
  assert.equal(save.searchLog.length, 8);
});

test('R83 存档往返：searchSeq 跟着 writeSlot/getSnapshot 原样回来', () => {
  const save = fresh();
  for (let i = 0; i < 3; i += 1) M.search(save, cdef('代縣'), ctxWith([]));
  const store = { slots: Array(Saves.SLOT_COUNT).fill(null), last: 0 };
  assert.ok(Saves.writeSlot(store, 0, save, { scenarioName: '測試' }));
  const snap = Saves.getSnapshot(store, 0);
  assert.equal(snap.searchSeq['代縣'], 3);
  assert.equal(M.searchCount(snap, '代縣'), 3);
});

// ================================================================ B. R17 等级窗
test('R17 等级源：ctx.searchLevel > ctx.level > save.generalLevel > 武将行；未知=0，夹 1..99', () => {
  const save = { generalLevel: { 劉焉: 50 } };
  assert.equal(M.searchLevelOf(save, cdef('代縣'), { generals: GENS, searchLevel: 30, level: 40 }), 30);
  assert.equal(M.searchLevelOf(save, cdef('代縣'), { generals: GENS, level: 40 }), 40);
  assert.equal(M.searchLevelOf(save, cdef('代縣'), { generals: GENS }), 50);
  assert.equal(M.searchLevelOf({}, cdef('代縣'), { generals: [{ NAME: '劉焉', level: 7 }] }), 7);
  assert.equal(M.searchLevelOf({}, cdef('代縣'), { generals: [] }), 0);
  assert.equal(M.searchLevelOf({}, cdef('代縣'), { searchLevel: 200 }), 99);
});

test('R17 ST1 权重：|lv-Level|>4 → 0；窗内 Rate/差；同级 Rate；等级未知回 Rate', () => {
  const it = { Sequence: 1, Name: '測試', Rate: 20, SearchType: 1, Level: 10 };
  assert.equal(M.searchItemWeight(it, 10), 20);
  assert.equal(M.searchItemWeight(it, 12), 10);
  assert.equal(M.searchItemWeight(it, 14), 5);
  assert.equal(M.searchItemWeight(it, 15), 0);
  assert.equal(M.searchItemWeight(it, 5), 0);
  assert.equal(M.searchItemWeight(it, 0), 20);
  assert.equal(M.searchItemWeight({ ...it, Rate: 0 }, 10), 0);
  assert.equal(M.searchItemWeight({ ...it, Level: 0 }, 10), 20);
});

test('R17 ST2 权重：低于 Level-4 → 0；差 d 级 Rate/d；够级 Rate', () => {
  const it = { Sequence: 2, Name: '測試', Rate: 20, SearchType: 2, Level: 10 };
  assert.equal(M.searchItemWeight(it, 5), 0);
  assert.equal(M.searchItemWeight(it, 6), 5);
  assert.equal(M.searchItemWeight(it, 9), 20);
  assert.equal(M.searchItemWeight(it, 10), 20);
  assert.equal(M.searchItemWeight(it, 15), 20);
  assert.equal(M.searchItemWeight(it, 0), 20);
});

test('R17 池分区：已知等级 45 时含 45 号、等级 2 时不含；不传等级保持旧口径 22/50', () => {
  const p45 = M.searchPools(ITEMS, [], 45);
  assert.equal(p45.talisman.length, 22);
  assert.equal(p45.treasure.length, 35);
  assert.ok(p45.treasure.some((it) => Number(it.Sequence) === 45));
  const p2 = M.searchPools(ITEMS, [], 2);
  assert.equal(p2.talisman.length, 22);
  assert.equal(p2.treasure.length, 14);
  assert.ok(!p2.treasure.some((it) => Number(it.Sequence) === 45));
  const old = M.searchPools(ITEMS);
  assert.equal(old.talisman.length, 22);
  assert.equal(old.treasure.length, 50);
});

test('R17 search() 集成：只有 45 号（ST2/Lv45）时，等级 2 抽不到、等级 45 能抽到', () => {
  const item45 = ITEMS.find((it) => Number(it.Sequence) === 45);
  assert.ok(item45 && Number(item45.Level) === 45);
  const items = [item45];

  const low = fresh();
  const lowCtx = ctxWith(items, { level: 2 });
  for (let i = 0; i < 10; i += 1) {
    const r = M.search(low, cdef('代縣'), lowCtx);
    assert.notEqual(r.seq, 45, `等级 2 不该抽到 45，第 ${i} 抽 = ${JSON.stringify(r)}`);
  }

  const high = fresh();
  const highCtx = ctxWith(items, { level: 45 });
  let found = false;
  for (let i = 0; i < 40 && !found; i += 1) {
    found = M.search(high, cdef('代縣'), highCtx).seq === 45;
  }
  assert.ok(found, '等级 45 应在 40 抽内抽到 45 号');
});

// ================================================================ C. AI 分布
test('R83 AI 候选层：5 个剧本 month1 都同时存在 attack/develop/search 候选', () => {
  for (const sc of SCEN) {
    const save = fresh(sc);
    const acts = AI.planMonth(save, sc.cities, {
      playerId: save.king, seed: 7, paths: sc.paths, maxPerForce: 99,
    });
    const kinds = new Set(acts.map((a) => a.kind));
    for (const k of ['attack', 'develop', 'search']) {
      assert.ok(kinds.has(k), `scenario ${sc.id} 缺 ${k} 候选，实际=${[...kinds].join(',')}`);
    }
  }
});

test('R83 AI 白名单：真实剧本上 ctx.kinds=[develop,search] 能选出内政月（不是死代码）', () => {
  const sc = SCEN[0];
  const save = fresh(sc);
  const acts = AI.planMonth(save, sc.cities, {
    playerId: save.king, seed: 7, paths: sc.paths, kinds: ['develop', 'search'], maxPerForce: 99,
  });
  assert.ok(acts.length >= 2, `内政候选不足：${acts.length}`);
  for (const a of acts) assert.ok(['develop', 'search'].includes(a.kind), a.kind);
  assert.deepEqual([...new Set(acts.map((a) => a.kind))].sort(), ['develop', 'search']);
});
