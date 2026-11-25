// @ts-nocheck
// 理由：本測試直接驅動 web/saves.js、web/city_model.js 這兩個瀏覽器端 JS（無 .ts 型別來源），
// 型別外殼見 game/web/saves.d.ts、game/web/city_model.d.ts；斷言全在執行期由 node:test 驗。
// 型別嚴格檢查留給 src/**（`npm.cmd exec -- tsc --noEmit` 其餘檔案必須 0 錯）。
/**
 * city_rules.test.ts — 內政與徵兵規則回歸測試（純 Node，不碰 DOM／瀏覽器）
 *
 * 跑法：  node --test game/tests/city_rules.test.ts
 *        cd game && node --test tests/city_rules.test.ts
 *
 * 覆蓋（對應 F:\sanguo\work\briefs\B1_city.md 的 R8／R10／R12／R18／R9）：
 *   R8  一月一令閘門（lastActionMonth / clearMonthLock / ?unlimited=1 除錯口）
 *   R12 預備兵池（上限 min(POP/2500+110,600)）＋ 步／騎分列徵兵（消耗預備兵，不花金）
 *   R18 唯一物品（ONLYONE）全局只出一次：構造「兩次搜索」
 *   R10 自治：設定 → 施行（批量開發＋日誌）→ 換月 lazy tick
 *   R9  增量常量總表 INCR（每條都有出處狀態）
 *   背景 hall_01..06 的挑選規則與檔案存在性
 *
 * 只用 game/data/*.json 與 web/saves.js、web/city_model.js；等級口徑同
 * game/cocos/assets/scripts/DeployRoot.ts 的 levelOf（資料表沒有等級 ⇒ 20 級）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as Saves from '../web/saves.js';
import * as M from '../web/city_model.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');
const ITEMS = readJson('../data/items.json');
const WISES = readJson('../data/wises.json');
const S0 = SCEN[0];
const ctx = () => ({ generals: GENS, scenario: S0, scenIdx: 0, items: ITEMS, wises: WISES });
const cdef = (n) => S0.cities.find((c) => c.NAME === n);
const ONLYONE = ITEMS.filter((it) => it.Attrib === 'ONLYONE').map((it) => Number(it.Sequence));

/** 新開一局（同 city_selftest.mjs 的 fresh()，但每個 test 各自一份，互不污染） */
function fresh() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  return save;
}
const st = (save, city) => save.cities[city];

/* ======================================================================
 * R8 一月一令
 * ==================================================================== */
test('R8 新檔可下令、下令後鎖住、換月自動解鎖', () => {
  const save = fresh();
  assert.equal(save.lastActionMonth, 0, '新檔 lastActionMonth 應為 0（ensureExtras 補欄位）');
  assert.equal(M.monthLocked(save), false, '新檔不該被鎖');

  assert.equal(M.markMonthActed(save), true, '下令要回報「真的記了」');
  assert.equal(save.lastActionMonth, Number(save.month), 'lastActionMonth 應等於當前月號');
  assert.equal(M.monthLocked(save), true, '下令後本月必須鎖住');
  assert.equal(M.LOCK_HINT, '本月已行動', '按鈕置灰提示與 04c 的口徑一致');

  save.month = Number(save.month) + 1;          // 推進一月＝原作換月流水線清位
  assert.equal(M.monthLocked(save), false, '換月後自然解鎖（lastActionMonth !== month）');

  M.markMonthActed(save);
  M.clearMonthLock(save);                        // campaign.html advanceMonth() 的顯式清位
  assert.equal(save.lastActionMonth, 0);
  assert.equal(M.monthLocked(save), false);
});

test('R8 ?unlimited=1 只是除錯口：不鎖、也不寫存檔', () => {
  const save = fresh();
  M.markMonthActed(save);
  assert.equal(M.monthLocked(save, true), false, 'unlimited 時永遠不鎖（截圖／批量跑用）');
  assert.equal(M.markMonthActed(save, true), false, 'unlimited 時不記錄');
  assert.equal(save.lastActionMonth, Number(save.month), '既有記錄不被 unlimited 呼叫改寫');
  assert.match(M.UNLIMITED_HINT, /不是玩法/, '提示必須寫明不是玩法');
});

/* ======================================================================
 * R12 預備兵池
 * ==================================================================== */
test('R12 預備兵上限＝min(POP/2500+110, 600)（04c §2.2 +0x82）', () => {
  assert.equal(M.prepCapOf(172000), 178, '代縣 172,000 人 ⇒ 68+110 = 178');
  assert.equal(M.prepCapOf(250000), 210, '250,000 人 ⇒ 100+110 = 210');
  assert.equal(M.prepCapOf(2000000), 600, '人口再多也封頂 600');
  assert.equal(M.prepCapOf(0), 110, '空城仍有 110 底數');
  assert.equal(M.prepCapOf(172000), M.troopCapOf(172000), '預備兵與部隊兵是同一條公式（同一個 +0x82）');
  assert.equal(M.RECRUIT.PREP_DIV, 2500);
  assert.equal(M.RECRUIT.PREP_BASE, 110);
  assert.equal(M.RECRUIT.CAP, 600);
});

test('R12 新檔／老檔都會把預備兵補成滿池，且 clamped', () => {
  const save = fresh();
  const d = cdef('代縣');
  const cap = M.prepCapOf(st(save, '代縣').pop);
  assert.equal(st(save, '代縣').prep, cap, '第一次觸碰給滿池（等同開局預備兵已滿）');
  assert.deepEqual(M.prepStateOf(save, d), { prep: cap, cap }, 'prepStateOf 回 {現有, 上限}');

  st(save, '代縣').prep = cap + 999;             // 壞檔：超出上限
  M.ensureCityState(save, d);
  assert.equal(st(save, '代縣').prep, cap, 'ensureCityState 會把超出的預備兵夾回上限');
});

test('R12 部隊徵兵：消耗預備兵 1:1、不花金（面板 0x489138..0x489170）', () => {
  const save = fresh();
  const d = cdef('代縣');
  const before = { ...st(save, '代縣') };
  const gold0 = save.gold;
  const caps = M.armCaps(save, d, ctx());
  assert.equal(caps.total, 600, '部隊兵硬上限 600');
  assert.equal(caps.inf + caps.cav, caps.total, '步＋騎 上限相加＝600（各自固定，不隨對方浮動）');

  const r = M.enlist(save, d, { arm: 'inf', n: 40 }, ctx());
  assert.equal(r.ok, true);
  assert.equal(r.n, 40);
  assert.equal(r.taken, 40, '1 預備兵 → 1 兵（INCR.prepPerTroop = 1，推測）');
  assert.equal(st(save, '代縣').prep, before.prep - 40, '預備兵要真的被扣掉');
  assert.equal(st(save, '代縣').inf, before.inf + 40, '步兵＋40');
  assert.equal(st(save, '代縣').troops, before.troops + 40, '總兵數＋40');
  assert.equal(save.gold, gold0, '徵兵不花金（原作面板沒有金）');
  assert.equal(st(save, '代縣').inf + st(save, '代縣').cav, st(save, '代縣').troops, 'inf+cav===troops 恆等式');
});

test('R12 步／騎分列：等級不明（20 級）徵不到騎兵，+10 級才解鎖', () => {
  const save = fresh();
  const d = cdef('代縣');
  // 新開一局代縣沒有常駐武將（generals.json 裡是「野」），這裡補兩個進名單才測得到騎兵上限
  for (const g of GENS.filter((x) => x && x.NAME && x.NAME !== '盜賊').slice(0, 2)) {
    M.addToRoster(save, '代縣', g.NAME);
  }
  const roster = M.rosterOf(save, '代縣', ctx());   // 注意：rosterOf 收「城名」字串，不是 cityDef
  assert.ok(roster.length >= 2, '代縣要有武將，否則這條測不到');

  const lowCaps = M.armCaps(save, d, ctx());                       // 沒有 level ⇒ 20 級
  assert.equal(lowCaps.cav, 0, '20 級 ⇒ (20−20)×5 = 0 騎兵上限');
  const denied = M.enlist(save, d, { arm: 'cav', n: 10 }, ctx());
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'arm-full', '騎兵上限 0 時要回 arm-full，不能偷偷轉成步兵');

  const c30 = { ...ctx(), level: 30 };                             // ?lv=30 的口徑
  const caps30 = M.armCaps(save, d, c30);
  assert.equal(caps30.cav, Math.min(600, roster.length * 50), '30 級 ⇒ 每將 clamp((30−20)×5,0,100)=50');
  assert.ok(caps30.cav > 0);

  const ok = M.enlist(save, d, { arm: 'cav', n: 20 }, c30);
  assert.equal(ok.ok, true);
  assert.equal(st(save, '代縣').cav, 20);
  assert.equal(st(save, '代縣').inf + st(save, '代縣').cav, st(save, '代縣').troops);
  assert.equal(M.cavalryCapOf(30), 50);
  assert.equal(M.troopMaxOf(30), 100);
  assert.equal(M.troopMaxOf(15), 75, '未滿 20 級 ⇒ 等級×5');
});

test('R12 徵兵邊界：預備兵不足、預備兵為 0、上限封頂', () => {
  const save = fresh();
  const d = cdef('代縣');
  st(save, '代縣').prep = 10;
  const r = M.enlist(save, d, { arm: 'inf', n: 100 }, ctx());
  assert.equal(r.ok, true);
  assert.equal(r.n, 10, '要多少給多少，上限＝預備兵剩下多少');
  assert.equal(st(save, '代縣').prep, 0);

  const none = M.enlist(save, d, { arm: 'inf', n: 100 }, ctx());
  assert.equal(none.ok, false);
  assert.equal(none.reason, 'no-prep', '預備兵 0 ⇒ no-prep');

  st(save, '代縣').inf = 300;
  st(save, '代縣').cav = 300;
  st(save, '代縣').troops = 600;
  st(save, '代縣').prep = 500;
  const full = M.enlist(save, d, { arm: 'inf', n: 100 }, ctx());
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'troops-full', '總兵數滿 600 ⇒ troops-full');
});

test('R12 換月補預備兵：第一次只記帳，之後每月補上限的 10%', () => {
  const save = fresh();
  const d = cdef('代縣');
  const cap = M.prepCapOf(st(save, '代縣').pop);
  const first = M.refillPrep(save, d);
  assert.equal(first.first, true, '開局第一次結算只記帳');
  assert.equal(first.gained, 0, '第一次不補兵（否則開局白拿一次）');

  st(save, '代縣').prep = 0;
  save.month = Number(save.month) + 1;
  const r = M.refillPrep(save, d);
  assert.equal(r.gained, Math.max(1, Math.floor(cap * 0.1)), '補 max(1, floor(上限×10%))');
  assert.equal(st(save, '代縣').prep, r.gained);

  const same = M.refillPrep(save, d);
  assert.equal(same.gained, 0, '同一個月只結算一次');
});

/* ======================================================================
 * R12 移動：步／騎分列搬兵
 * ==================================================================== */
test('R12 移動也維持 inf+cav===troops（步優先搬）', () => {
  const save = fresh();
  const src0 = { ...st(save, '北平') };
  const dst0 = { ...st(save, '襄平') };
  const r = M.move(save, cdef('北平'), { to: '襄平', troops: 60 }, ctx());
  assert.equal(r.ok, true);
  assert.equal(r.troops, 60);
  const src = st(save, '北平');
  const dst = st(save, '襄平');
  assert.equal(src.troops, src0.troops - 60);
  assert.equal(dst.troops, dst0.troops + 60);
  assert.equal(src.inf + src.cav, src.troops, '出發城恆等式');
  assert.equal(dst.inf + dst.cav, dst.troops, '目的城恆等式');
  assert.equal(src.cav, Math.max(0, src0.cav - Math.max(0, 60 - src0.inf)), '步不夠才動騎兵');
});

/* ======================================================================
 * R18 唯一物品（ONLYONE）
 * ==================================================================== */
test('R18 items.json 的 16 件唯一物品全部在掉落池裡（預設狀態）', () => {
  assert.equal(ONLYONE.length, 16, 'items.json 應有 16 件 Attrib=ONLYONE');
  const base = M.searchPools(ITEMS);
  const seqs = new Set([...base.treasure, ...base.talisman].map((it) => Number(it.Sequence)));
  for (const seq of ONLYONE) assert.ok(seqs.has(seq), `唯一物品 ${seq} 應在池子裡（還沒被搜到時）`);
  assert.equal(base.talisman.length, 22, '兵符／陣法書 22 件');
  assert.equal(base.treasure.length, 50, '寶物 50 件');
});

test('R18 已持有的唯一物品直接不進池（對齊 capture.ts 的 dropWeight）', () => {
  const all = M.searchPools(ITEMS);
  const held = M.searchPools(ITEMS, ONLYONE);
  assert.equal(held.talisman.length + held.treasure.length, all.talisman.length + all.treasure.length - 16,
    '16 件唯一物品全部被擋掉');
  const seqs = new Set([...held.treasure, ...held.talisman].map((it) => Number(it.Sequence)));
  for (const seq of ONLYONE) assert.ok(!seqs.has(seq), `唯一物品 ${seq} 不該進池`);

  // 開局背包（DEFAULT_BAG）裡就有 45 号方天畫戟 ⇒ 新檔就不該再搜到它
  assert.ok(M.DEFAULT_BAG.includes(45), '預設背包包含 45');
  const withBag = M.searchPools(ITEMS, M.DEFAULT_BAG);
  assert.ok(!withBag.treasure.some((it) => Number(it.Sequence) === 45), '背包裡的唯一物品不再進池');
  assert.equal(withBag.treasure.length, all.treasure.length - 1, '只少那 1 件');
});

test('R18 兩次搜索：唯一物品搜到一次後，同一局再也搜不到', () => {
  const save = fresh();
  save.gold = 400000;
  const c = ctx();
  // 掉落池只剩這一件唯一物品 ⇒ 第一次搜到它以後，池子裡再也沒有寶物可出
  c.items = ITEMS.filter((it) => Number(it.Sequence) === 45);

  let first = null;
  for (let i = 0; i < 400 && !first; i += 1) {
    const r = M.search(save, cdef('代縣'), c);
    if (r.kind === 'treasure') first = r;
  }
  assert.ok(first, '400 次內應該搜到那件唯一物品');
  assert.equal(Number(first.seq), 45, '第一次搜到的就是 45 号方天畫戟');
  assert.ok(save.foundItems.includes(45), '搜到的唯一物品要記進 foundItems');

  let again = 0;
  for (let i = 0; i < 400; i += 1) {
    const r = M.search(save, cdef('代縣'), c);
    if (r.kind === 'treasure' || Number(r.seq) === 45) again += 1;
  }
  assert.equal(again, 0, '第二次搜索起：400 次都搜不到同一件唯一物品');
  assert.equal(M.searchPools(c.items, M.ownedItemSeqs(save, c)).treasure.length, 0,
    'ownedItemSeqs 已經把它算進 held，池子空了');

  // 對照：普通寶物還在池裡時，held 只擋唯一物品那件
  const other = ITEMS.find((it) => it.Rate > 0 && it.Attrib !== 'ONLYONE'
    && Number(it.Sequence) !== 45 && M.searchPools([it]).treasure.length === 1);
  assert.ok(other, '要找到一件非唯一的普通寶物當對照');
  const both = M.searchPools([ITEMS.find((it) => Number(it.Sequence) === 45), other], [45]);
  assert.equal(both.treasure.length, 1, '45 被擋掉，普通寶物照樣進池');
  assert.equal(Number(both.treasure[0].Sequence), Number(other.Sequence));
});

test('R18 rememberFound / ownedItemSeqs：去重、上限 200、背包與 foundItems 合併', () => {
  const save = fresh();
  for (let i = 0; i < 250; i += 1) M.rememberFound(save, i + 1);
  M.rememberFound(save, 1);
  M.rememberFound(save, 0);
  M.rememberFound(save, -3);
  assert.equal(save.foundItems.filter((n) => n === 1).length, 1, '重複不重記');
  assert.ok(save.foundItems.every((n) => n > 0), '只收正數');
  M.ensureExtras(save);
  assert.equal(save.foundItems.length, 200, 'ensureExtras 把 foundItems 夾到最多 200 條');

  const c = { ...ctx(), bag: [7, 8, 999] };
  const owned = M.ownedItemSeqs(save, c);
  assert.ok(owned.includes(999), '背包（items.html 的 bag）算已擁有');
  assert.ok(owned.includes(200), 'foundItems 也算已擁有');
  assert.equal(new Set(owned).size, owned.length, '去重');
});

/* ======================================================================
 * R10 自治
 * ==================================================================== */
test('R10 自治設定：setAuto / isAuto / autoCities', () => {
  const save = fresh();
  assert.equal(M.isAuto(save, '襄平'), false);
  M.setAuto(save, '襄平', true);
  M.setAuto(save, '北平', true);
  assert.equal(M.isAuto(save, '襄平'), true);
  assert.deepEqual(M.autoCities(save, S0.cities).sort(), ['北平', '襄平'].sort(), '照劇本順序回');
  M.setAuto(save, '北平', false);
  assert.equal(M.isAuto(save, '北平'), false);
  assert.equal(M.AUTONOMY.CMD, '自治');
  assert.equal(M.AUTONOMY.NO_CITY, '沒有設定自治的城市!!');
  assert.equal(M.AUTONOMY.DONE, '執行城市自治完畢!!');
});

test('R10 自治施行：只代行「不是當前所在城」的自治城，不扣金（原作開發免費）並逐城寫日誌', () => {
  const save = fresh();
  const gold0 = save.gold;
  const pop0 = st(save, '襄平').pop;
  const def0 = st(save, '襄平').def;
  M.setAuto(save, '襄平', true);
  M.setAuto(save, '代縣', true);

  const none = M.runAutonomy(save, S0.cities, ctx(), { from: '代縣' });
  assert.equal(none.ran.length, 1, '代縣是當前城 ⇒ 不代行自己');
  assert.equal(none.ran[0].city, '襄平');
  // R85：`0x427B9E` 只印字、不動 `city+0x92` ⇒ 開發 0 金（見 project/133 §1）
  assert.equal(M.DEV.COST, 0, '開發成本已按原作改 0');
  assert.equal(save.gold, gold0, '自治代行不扣金');
  assert.ok(st(save, '襄平').pop > pop0, '人口要漲');
  assert.ok(st(save, '襄平').def > def0, '防禦要漲');
  assert.match(none.text, /執行城市自治完畢!!/, '結算串用原作 0x427865');
  const logs = M.recentLog(save, 20, '襄平');
  assert.ok(logs.some((e) => /^襄平城自治：開墾 \+\d+ 人口、\+\d+ 防禦。$/.test(e.text)),
    '日誌格式：某城自治：開墾 +N 人口、+D 防禦。');

  const onlySelf = { ...fresh() };
  M.setAuto(onlySelf, '代縣', true);
  const empty = M.runAutonomy(onlySelf, S0.cities, ctx(), { from: '代縣' });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'none');
  assert.equal(empty.text, '沒有設定自治的城市!!', '沒有可代行的城 ⇒ 原作 0x42771A');
});

test('R10 自治：開發免費 ⇒ 金 0 也照跑（R85 原作 `0x427B9E` 不動 +0x92）', () => {
  const save = fresh();
  save.gold = 0;
  M.setAuto(save, '襄平', true);
  const r = M.runAutonomy(save, S0.cities, ctx(), { from: '代縣' });
  assert.equal(r.ok, true, '開發 0 金 ⇒ 沒錢也能代行');
  assert.equal(r.ran.length, 1);
  assert.equal(r.skipped.length, 0);
  assert.equal(M.recentLog(save, 10, '襄平').filter((e) => e.cmd === '自治').length, 1, '做事就要寫日誌');
});

test('R10 換月 lazy tick：一個月只跑一次（順便補預備兵）', () => {
  const save = fresh();
  M.setAuto(save, '襄平', true);
  st(save, '襄平').prep = 0;
  save.month = 2;
  const t1 = M.autonomyTick(save, S0.cities, ctx());
  assert.equal(t1.first, true, '第一次 tick 記帳');
  assert.equal(save.autoMonth, 2);
  assert.ok(t1.auto && t1.auto.ran.length === 1, '自治在換月後代行一次');
  assert.ok(t1.refilled.some((x) => x.city === '襄平'), '預備兵也在這裡補');

  const t2 = M.autonomyTick(save, S0.cities, ctx());
  assert.equal(t2.auto, null, '同一個月不會重跑');
  assert.equal(t2.refilled.length, 0);
});

/* ======================================================================
 * R9 增量常量總表
 * ==================================================================== */
test('R9 INCR 表：24 條，每條都有數值＋出處狀態＋出處說明', () => {
  const rows = M.incrRows();
  assert.equal(rows.length, 24, 'INCR 應有 24 條');
  assert.deepEqual(M.INCR_GRADES, ['依據', '推測', '新設計']);
  for (const row of rows) {
    assert.equal(typeof row.v, 'number', `${row.key} 要有數值`);
    assert.ok(M.INCR_GRADES.includes(row.grade), `${row.key} 的 grade 必須是 依據/推測/新設計`);
    assert.ok(typeof row.src === 'string' && row.src.length >= 8, `${row.key} 要寫出處`);
  }
  const tally = { 依據: 0, 推測: 0, 新設計: 0 };
  for (const row of rows) tally[row.grade] += 1;
  assert.deepEqual(tally, { 依據: 9, 推測: 1, 新設計: 14 }, '出處分布：9 有依據 / 1 推測 / 14 新設計（R85 devGold 由新設計轉依據）');
});

test('R9 DEV/RECRUIT/SEARCH/EFF 全部由 INCR 派生（沒有第二份魔數）', () => {
  assert.equal(M.DEV.COST, M.incrVal('devGold'));
  assert.equal(M.DEV.POP, M.incrVal('devPop'));
  assert.equal(M.DEV.DEF, M.incrVal('devDef'));
  assert.equal(M.RECRUIT.COST, M.incrVal('recruitGold'));
  assert.equal(M.RECRUIT.CAP, M.incrVal('troopsCap'));
  assert.equal(M.RECRUIT.PREP_PER_TROOP, M.incrVal('prepPerTroop'));
  assert.equal(M.SEARCH.COST, M.incrVal('searchGold'));
  assert.equal(M.SEARCH.WEIGHTS.talent, M.incrVal('searchWTalent'));
  assert.equal(M.EFF.DIV, M.incrVal('effDiv'));
  assert.equal(M.incrVal('不存在的鍵'), 0, '缺鍵回 0');
});

/* ======================================================================
 * 殿內背景
 * ==================================================================== */
test('背景 hall_01..06：按城規模挑、人口 30 萬以上上一檔', () => {
  for (let rate = 1; rate <= 5; rate += 1) {
    assert.equal(M.hallIndexOf({ RATE: rate, POPULATION: 100000 }), rate, `RATE=${rate} ⇒ hall_0${rate}`);
  }
  assert.equal(M.hallIndexOf({ RATE: 2, POPULATION: 310000 }), 6, '大城（人口≥30 萬）用殿內最華的一張');
  assert.equal(M.hallIndexOf({}), 1, '缺欄位時退回 hall_01');
  assert.equal(M.hallIndexOf({ RATE: 9 }), 5, 'RATE 超出 1..5 clamp 到 5');
  // 注意：這是 **web** 的 city_model.js，web 頁面仍用 AI 的 hall_0N.jpg（檔案在 web/assets/bg/env/）。
  // Cocos 的 CityModel.ts 走的是 bg/policy/palais_0N（見下方 existsSync）。
  assert.equal(M.hallImageOf({ RATE: 3 }), 'assets/bg/env/hall_03.jpg');
});

test('背景素材都在（6 張殿內圖＋5 張原作 POLICY 圖）', () => {
  for (let n = 1; n <= 6; n += 1) {
    const url = new URL(`../web/assets/bg/env/hall_0${n}.jpg`, import.meta.url);
    assert.ok(existsSync(url), `hall_0${n}.jpg 存在`);
  }
  for (let n = 1; n <= 5; n += 1) {
    const url = new URL(`../web/assets/bg/policy/palais_0${n}.png`, import.meta.url);
    assert.ok(existsSync(url), `原作 palais_0${n}.png 已收進素材目錄`);
  }
  assert.ok(existsSync(new URL('../web/assets/bg/env/ui_btn_wood_normal.png', import.meta.url)));
  assert.ok(existsSync(new URL('../web/assets/bg/env/ui_panel_bamboo.png', import.meta.url)));
});
