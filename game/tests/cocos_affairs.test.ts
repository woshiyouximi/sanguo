// @ts-nocheck
// 理由：直接驅動 `cocos/assets/scripts/CityModel.ts`（Cocos 內政純邏輯模組，無 cc 依賴）與
// `web/saves.js`（瀏覽器端 JS，無 .ts 型別來源）；斷言全在執行期由 node:test 驗。
/**
 * cocos_affairs.test.ts — Cocos 側內政 4 P0 + 2 P1 回歸測試（純邏輯，不依賴 cc 引擎）
 *
 * 跑法：  cd game && node --test tests/cocos_affairs.test.ts
 *
 * 背景：work/affairs_audit/REPORT.md 查出 Cocos 內政與 web 真源（city.html + city_model.js）
 * 有 4 個 P0 與 2 個 P1 偏差。本檔逐條釘死修後行為：
 *   P0-1 搜索命中寶物/兵符 → 真的寫進背包（localStorage['sanguo_items_v1']，與 web bagAdd 同鍵同格式）
 *   P0-2 scenIdx 不再恆 0：《討伐董卓》(scenIdx=1) 平原 = 關羽、劉備、張角、張飛、簡雍
 *   P0-3 prepFromMoney（F13）：100 金 = 1 預備兵，換月結算走它；?loose=1 才走舊 10% 白補
 *   P0-4 逐將年令（F2）+ 隨軍過濾（F3）+ 正月門（非正月只讀）
 *   P1-1 開發用玩家選的執行將（舊碼永遠用太守），與 web 同公式同數字
 *   P1-2 searchSeq/searchNonce 落盤：重進內政頁後第 61 次搜索不再重放舊種子
 *
 * 不變量：本檔**不** import 'cc'（CityModel.ts 零 import，可直接 node import）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Saves from '../web/saves.js';
import * as M from '../cocos/assets/scripts/CityModel.ts';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');
const ITEMS = readJson('../data/items.json');
const WISES = readJson('../data/wises.json');

/** city.html:459-513 的啟動順序（與 work/affairs_audit/lib.mjs 同款） */
function fresh(scenIdx = 0) {
  const scen = SCEN[scenIdx];
  const save = Saves.newCampaign(scen);
  M.ensureExtras(save);
  for (const c of scen.cities) M.ensureCityState(save, c);
  M.migrateGold(save, scen.cities);
  save.month = 1;
  return save;
}

function ctx(scenIdx = 0, extra = {}) {
  return {
    generals: GENS,
    items: ITEMS,
    wises: WISES,
    scenario: SCEN[scenIdx],
    scenIdx,
    ...extra,
  };
}

const cityDef = (name, scenIdx = 0) => SCEN[scenIdx].cities.find((c) => c.NAME === name);
const namesOf = (list) => list.map((g) => g.NAME);
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ============================================================================
 * P0-1 搜索道具 → 背包（同鍵同格式；物品頁看得到）
 * ========================================================================== */
test('P0-1 搜索命中寶物/兵符 → bagAddRaw 寫出 sanguo_items_v1 同鍵同格式、背包 +1', () => {
  assert.equal(M.BAG_KEY, 'sanguo_items_v1', '與 web ItemsPanel.ts:92 ITEM_SAVE_KEY 同鍵');
  const save = fresh(0);
  save.owned = ['襄平'];
  save.cities['襄平'].money = 999999;
  const c = ctx(0, { quiet: true, free: true });
  let hit = null;
  for (let i = 0; i < 240 && !hit; i += 1) {
    const r = M.search(save, cityDef('襄平', 0), c);
    if (r.ok && (r.kind === 'treasure' || r.kind === 'talisman') && M.num(r.seq) > 0) hit = r;
  }
  assert.ok(hit, '240 次搜索內應命中寶物/兵符');

  // bagAddRaw = web city.html:613-623 的 bagAdd：讀 raw → JSON.parse → withBagItem → stringify
  const raw = null; // 物品頁預設存檔（12 件）之前：localStorage 為空
  const next = M.bagAddRaw(raw, hit.seq);
  const parsed = JSON.parse(next);
  assert.ok(Array.isArray(parsed.bag), '同格式：{ equip, bag }');
  assert.equal(typeof parsed.equip, 'object');
  assert.equal(parsed.bag.length, 13, '空存檔 = 預設 12 件 + 新 1 件');
  assert.ok(parsed.bag.includes(M.num(hit.seq)), '背包含新道具序號');
  assert.ok(parsed.bag.every((n) => typeof n === 'number' && n > 0), '序號都是正整數');

  // 同件重複入手不重複 push（withBagItem 語義）
  const again = M.bagAddRaw(next, hit.seq);
  assert.deepEqual(JSON.parse(again).bag, parsed.bag, '重複入手不重複 push');
  assert.ok(M.bagSeqsOf(next).includes(M.num(hit.seq)), 'bagSeqsOf 讀得回來');

  // foundItems 仍保留（日誌/圖鑑用），且與背包不是同一份
  assert.ok((save.foundItems ?? []).includes(M.num(hit.seq)), 'foundItems 仍記（日誌用）');
});

/* ============================================================================
 * P0-2 scenIdx 貫通：roster / wildPool 按劇本取（舊碼恆 0）
 * ========================================================================== */
test('P0-2 scenIdx=1（討伐董卓）平原 = 關羽、劉備、張角、張飛、簡雍；scenIdx=0 不是', () => {
  const rosterAt = (scenIdx) => {
    const save = fresh(scenIdx);
    save.owned = ['平原'];
    save.roster = {};
    save.appointed = {};
    return namesOf(M.rosterOf(save, '平原', ctx(scenIdx)));
  };

  const r0 = rosterAt(0);
  assert.ok(r0.includes('張角'), `scenIdx=0 應含 張角（實得 ${r0.join('、')}）`);
  assert.ok(r0.includes('廖化'), `scenIdx=0 應含 廖化（實得 ${r0.join('、')}）`);
  assert.ok(r0.includes('裴元紹'), `scenIdx=0 應含 裴元紹（實得 ${r0.join('、')}）`);

  const r1 = rosterAt(1);
  for (const want of ['關羽', '劉備', '張角', '張飛', '簡雍']) {
    assert.ok(r1.includes(want), `scenIdx=1 應含 ${want}（實得 ${r1.join('、')}）`);
  }
  for (const reject of ['廖化', '裴元紹']) {
    assert.ok(!r1.includes(reject), `scenIdx=1 不應含 ${reject}（實得 ${r1.join('、')}）`);
  }

  // wildPool 也按劇本（在野將的 CITY/STATUS 用 city_by_times/status_by_times）
  const wildAt = (scenIdx) => {
    const save = fresh(scenIdx);
    save.owned = ['平原'];
    save.roster = {};
    save.appointed = {};
    return namesOf(M.wildPool(save, '平原', ctx(scenIdx)));
  };
  const w0 = wildAt(0);
  assert.ok(w0.includes('杜遠'), `scenIdx=0 平原在野應含 杜遠（實得 ${w0.join('、')}）`);
  const w1 = wildAt(1);
  assert.ok(w1.includes('淳于瓊'), `scenIdx=1 平原在野應含 淳于瓊（實得 ${w1.join('、')}）`);
  assert.ok(!w1.includes('杜遠'), `scenIdx=1 平原在野不應含 杜遠（實得 ${w1.join('、')}）`);
});

/* ============================================================================
 * P0-3 prepFromMoney（F13「錢變兵」）+ 換月結算口徑
 * ========================================================================== */
test('P0-3 prepFromMoney：250 金 → 2 預備兵（剩 50 金）；上限只扣實際轉換金', () => {
  const save = fresh(0);
  save.owned = ['襄平'];
  const def = cityDef('襄平', 0);
  const st = save.cities['襄平'];

  st.money = 250;
  st.prep = 0;
  const cap = M.prepStateOf(save, def).cap;
  let r = M.prepFromMoney(save, def);
  assert.equal(r.ok, true);
  assert.equal(r.n, 2, 'floor(250/100) = 2');
  assert.equal(r.cost, 200);
  assert.equal(st.money, 50, '只扣實際轉換的 200 金');
  assert.equal(st.prep, 2);

  st.prep = cap - 1;
  st.money = 99999;
  r = M.prepFromMoney(save, def);
  assert.equal(r.n, 1, 'n = min(floor(money/100), cap-prep) → 被 cap 夾住');
  assert.equal(st.prep, cap, '補到上限為止');
  assert.equal(st.money, 99999 - 100, '只扣 100 金');

  st.prep = 0;
  st.money = 99;
  r = M.prepFromMoney(save, def);
  assert.equal(r.n, 0, '不足 100 金不轉換');
  assert.equal(st.money, 99);

  // 有城的 100 金 → 1 預備兵（正例）
  st.money = 5000;
  st.prep = 0;
  r = M.prepFromMoney(save, def);
  assert.equal(r.n, Math.min(50, cap), '5000 金最多 50 兵，受 cap 夾');
  assert.equal(st.prep, r.n);
  assert.equal(st.money, 5000 - r.n * 100);
});

test('P0-3 換月結算：autonomyTick 預設走 prepFromMoney（不再白補 10%）；?loose=1 才走舊 refillPrep', () => {
  const def0 = cityDef('襄平', 0);
  const base = () => {
    const save = fresh(0);
    save.owned = ['襄平'];
    save.month = 2;
    save.autoMonth = 1; // 上次結算在 1 月 → 本月該結算
    save.cities['襄平'].prep = 0;
    return save;
  };

  // 預設（原作線）：金 → 預備兵
  const save = base();
  const st = save.cities['襄平'];
  st.money = 5000;
  const cap = M.prepStateOf(save, def0).cap;
  const expect = Math.min(50, cap);
  const tick = M.autonomyTick(save, [def0], ctx(0));
  assert.equal(st.prep, expect, '預備兵 +floor(5000/100)（受 cap 夾）');
  assert.equal(st.money, 5000 - expect * 100, '金按實際轉換扣');
  assert.equal(tick.refilled.length, 1);
  assert.equal(tick.refilled[0].gained, expect);

  // ?loose=1（舊除錯線）：不花金、按上限 10% 白補（refillPrep 記在 st.prepMonth 上）
  const looseSave = base();
  const looseSt = looseSave.cities['襄平'];
  looseSt.money = 5000;
  looseSt.prepMonth = 1; // 上次結算在 1 月（首月只記帳不補兵）
  const looseCap = M.prepStateOf(looseSave, def0).cap;
  const looseTick = M.autonomyTick(looseSave, [def0], ctx(0), { loose: true });
  assert.equal(looseSt.money, 5000, '舊線不花金');
  assert.ok(looseSt.prep >= 1, `舊線白補 ${looseSt.prep}（cap ${looseCap}）`);
  assert.equal(looseTick.refilled[0].gained, looseSt.prep);
});

/* ============================================================================
 * P0-4 逐將年令（F2）+ 隨軍過濾（F3）+ 正月門
 * ========================================================================== */
test('P0-4/F2 逐將年令：同將同年第二次行動被拒，換將不受影響，新年解鎖', () => {
  const save = fresh(0);
  save.month = 1; // 第 1 年
  assert.equal(M.yearIndexOf(save), 1);
  assert.equal(M.actedLocked(save, '關羽'), false);
  assert.equal(M.markActed(save, '關羽'), true, '第一次行動成功');
  assert.equal(M.actedLocked(save, '關羽'), true);
  assert.equal(M.markActed(save, '關羽'), false, '同將同年第二次行動被拒（舊誤移植 F7 允許 12 次/年/城）');
  assert.deepEqual(M.actedNames(save).sort(), ['關羽']);

  assert.equal(M.markActed(save, '張飛'), true, '另一名將不受影響');
  assert.deepEqual(M.actedNames(save).sort(), ['張飛', '關羽'].sort());

  save.month = 13; // 第 2 年
  assert.equal(M.yearIndexOf(save), 2);
  assert.equal(M.actedLocked(save, '關羽'), false, '換年解鎖');
  assert.equal(M.actedNames(save).length, 0);
  assert.equal(M.markActed(save, '關羽'), true, '新年可再行動一次');
});

test('P0-4 正月門：非正月只讀；正月可下；出征/自治收束窗口後只讀', () => {
  const save = fresh(0);
  save.month = 2;
  assert.equal(M.isAffairsMonth(save), false);
  assert.equal(M.readOnly(save), true, '非正月只讀（web readOnly() 口徑）');
  assert.ok(M.OFF_MONTH_HINT.includes('非正月'));

  save.month = 13; // 次年正月
  assert.equal(M.isAffairsMonth(save), true);
  assert.equal(M.readOnly(save), false, '正月可下');

  M.markMonthActed(save, false); // 出征/自治
  assert.equal(M.readOnly(save), true, '窗口已收束 → 只讀');
});

test('P0-4/F3 隨軍（away）將不能內政；syncAway 依我軍部隊重建、回城歸還', () => {
  const save = fresh(0);
  save.owned = ['平原'];
  save.roster = {};
  save.appointed = {};

  // 舊檔的 save.away：id 非空 → 視為在途
  save.away = { 張角: 'a1' };
  let roster = namesOf(M.rosterOf(save, '平原', ctx(0)));
  assert.ok(!roster.includes('張角'), `隨軍的 張角 不應在城內名單（實得 ${roster.join('、')}）`);
  assert.ok(roster.includes('廖化'), '沒隨軍的照舊在城內');

  // syncAway：只按 save.armies 的 side==='A' 重建（敵軍 B 不算）
  save.armies = [
    { id: 'a1', side: 'A', general: '張角', officers: ['廖化'] },
    { id: 'b1', side: 'B', general: '呂布', officers: [] },
  ];
  M.syncAway(save);
  assert.equal(save.away['張角'], 'a1', '我軍主將在途');
  assert.equal(save.away['廖化'], 'a1', '我軍隨將在途');
  assert.equal(save.away['呂布'], undefined, '敵將不算隨軍');
  roster = namesOf(M.rosterOf(save, '平原', ctx(0)));
  assert.ok(!roster.includes('張角') && !roster.includes('廖化'));

  // 部隊回城（armies 空）→ away 歸還，名單重新出現
  save.armies = [];
  M.syncAway(save);
  assert.equal(save.away['張角'], undefined);
  assert.equal(save.away['廖化'], undefined);
  roster = namesOf(M.rosterOf(save, '平原', ctx(0)));
  assert.ok(roster.includes('張角') && roster.includes('廖化'), '回城歸還');
});

/* ============================================================================
 * P1-1 開發執行將：與 web 同公式同數字；不同執行將結果不同
 * ========================================================================== */
test('P1-1 開發執行將：太守諸葛亮/執行呂布 與 太守呂布/執行諸葛亮 都與 web 同數字', async () => {
  const W = await import('../web/city_model.js');
  const CITY = '南皮';
  const scenIdx = 1;
  const def = cityDef(CITY, scenIdx);

  const makeScene = (major) => {
    const save = fresh(scenIdx);
    save.owned = [CITY];
    const st = save.cities[CITY];
    st.money = 0;
    st.pop = 300000;
    st.def = 300;
    save.appointed = { [CITY]: { major } };
    return save;
  };

  const run = (major, exec) => {
    const cSave = makeScene(major);
    const wSave = clone(makeScene(major));
    let c;
    let w;
    M.setRng(() => 0.5);
    try {
      c = M.develop(cSave, def, ctx(scenIdx, { exec }));
    } finally {
      M.setRng(null);
    }
    W.setRng(() => 0.5);
    try {
      w = W.develop(wSave, def, {
        generals: GENS,
        items: ITEMS,
        wises: WISES,
        scenario: SCEN[scenIdx],
        scenIdx,
        exec,
      });
    } finally {
      W.setRng(null);
    }
    return { c, w };
  };

  // 太守 諸葛亮(100) / 執行 呂布(42)：web +6840 民 / +55 防
  const a = run('諸葛亮', '呂布');
  assert.equal(a.c.ok, true);
  assert.equal(a.c.pop, a.w.pop, `Cocos 人口增量應 = web（${a.c.pop} vs ${a.w.pop}）`);
  assert.equal(a.c.def, a.w.def, `Cocos 防禦增量應 = web（${a.c.def} vs ${a.w.def}）`);
  assert.equal(a.c.eff, a.w.eff);
  assert.deepEqual([a.c.pop, a.c.def], [6840, 55], 'web 基準：太守諸葛亮/執行呂布 = +6840/+55');

  // 太守 呂布(42) / 執行 諸葛亮(100)：web +9354 民 / +27 防
  const b = run('呂布', '諸葛亮');
  assert.equal(b.c.pop, b.w.pop);
  assert.equal(b.c.def, b.w.def);
  assert.deepEqual([b.c.pop, b.c.def], [9354, 27], 'web 基準：太守呂布/執行諸葛亮 = +9354/+27');

  // 執行將不同 → 結果不同（舊碼 :1167 永遠用太守，兩組會相同）
  assert.notDeepEqual([a.c.pop, a.c.def], [b.c.pop, b.c.def], '不同執行將必須不同結果');

  // 執行將與太守相同時退回太守（ctx.exec 缺省）
  const cNoExec = (() => {
    const save = makeScene('呂布');
    let r;
    M.setRng(() => 0.5);
    try {
      r = M.develop(save, def, ctx(scenIdx));
    } finally {
      M.setRng(null);
    }
    return r;
  })();
  const cExecMajor = (() => {
    const save = makeScene('呂布');
    let r;
    M.setRng(() => 0.5);
    try {
      r = M.develop(save, def, ctx(scenIdx, { exec: '呂布' }));
    } finally {
      M.setRng(null);
    }
    return r;
  })();
  assert.deepEqual([cNoExec.pop, cNoExec.def], [cExecMajor.pop, cExecMajor.def], '沒指定執行將 = 太守執行');
});

/* ============================================================================
 * P1-2 searchSeq/searchNonce 落盤
 * ========================================================================== */
test('P1-2 searchSeq 落盤：重進內政頁後第 61 次搜索不再重放舊種子', () => {
  const CITY = '襄平';
  const scenIdx = 0;
  const def = cityDef(CITY, scenIdx);
  // free：不扣金；quiet 不設 → 每次搜索都寫一條日誌（searchLog 上限 60，正是舊 bug 的來源）
  const c = ctx(scenIdx, { free: true });

  const save = fresh(scenIdx);
  save.owned = [CITY];
  save.month = 1;
  save.cities[CITY].money = 999999;
  for (let i = 0; i < 65; i += 1) {
    assert.equal(M.search(save, def, c).ok, true);
  }
  assert.equal(M.searchCount(save, CITY), 65, '記憶體裡第 65 次');
  assert.equal(save.searchLog.length, 60, '日誌只留 60 條（舊 bug 的來源）');
  const s61 = M.searchSeed(CITY, 1, 60, M.searchNonce(save)); // 歷史第 61 次用的種子（count 從 60 起）

  const reenter = () => {
    const s = fresh(scenIdx);
    s.owned = [CITY];
    s.month = 1;
    s.cities[CITY].money = 999999;
    return s;
  };

  // 修後：persist 把 searchSeq 一起寫進 sanguo_city_v1，重進頁面照舊 65
  const fixed = reenter();
  fixed.searchSeq = clone(save.searchSeq);
  fixed.searchNonce = save.searchNonce;
  fixed.searchLog = clone(save.searchLog);
  M.ensureExtras(fixed);
  assert.equal(M.searchCount(fixed, CITY), 65, 'searchSeq 落盤 → 不會被截成 60');
  const fixedNext = M.search(fixed, def, c);
  assert.equal(fixedNext.ok, true);
  assert.notEqual(fixedNext.seed, s61, '第 66 次種子不應等於歷史第 61 次');

  // 舊 bug 再現：只帶 searchLog（沒有 searchSeq）→ 從 60 條日誌重算成 60 → 又回到第 61 次的種子
  const bug = reenter();
  bug.searchLog = clone(save.searchLog);
  M.ensureExtras(bug);
  assert.equal(M.searchCount(bug, CITY), 60, '舊行為：只能從日誌數到 60');
  const bugNext = M.search(bug, def, c);
  assert.equal(bugNext.seed, s61, '舊 bug：重進頁面後第 61 次搜索重放同一個種子');
  assert.notEqual(bugNext.seed, fixedNext.seed, '兩條路徑的種子必須分岔');

  // JSON 往返（localStorage）不掉精度
  const round = JSON.parse(JSON.stringify({ searchSeq: save.searchSeq, searchNonce: save.searchNonce }));
  assert.deepEqual(round.searchSeq, clone(save.searchSeq));
  assert.equal(round.searchSeq[CITY], 65);
});
