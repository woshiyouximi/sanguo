/**
 * advance_month.test.ts — 「一個月的推進」core 單源回歸（F-03 / F-04 / F-14）
 *
 * 為什麼有這支：parity-sweep 報了三條雙端不一致 ——
 *   · F-03 Cocos 的 `autonomyTick` 只有開內政頁（CityPanel.open）才跑，web 是每月跑；
 *   · F-04 Cocos `GameState.advanceMonth` 還在給所有城白補守軍 2%，web 已刪；
 *   · F-14 Cocos 沒有年度結算 / ledger / 補學，web 有 `annualYearRollover` + `monthlyLearn`。
 * 修法是把整段「月流水」收進 `src/core/advance_month.ts` 一支純函數 `advanceOneMonth()`，
 * web（campaign.html）與 Cocos（GameState.advanceMonth）都只做薄適配。本檔釘住那支的行為：
 *   1. 金 → 預備兵：100 金 = 1 兵（`prepFromMoney` 同式），逐城、受預備兵上限約束；
 *   2. 自治代行對**每座城**生效（不是只有玩家剛開面板的那座）—— Adapter 模式與 core 保底各測一次；
 *   3. 守軍不再白補 2%（F-04）：月流水不碰 `troops`；
 *   4. 跨年觸發年度結算 + 年稅 + ledger（F-14），關城免稅；
 *   5. 非正月不發年稅，帳本只 +1 月；
 *   6. 同輸入同輸出（純函數可重放；`ts` 是唯一的時間注入點）；
 *   7. 疲勞 / 士氣漂移（與 campaign.html [[FATIGUE_CORE]]/[[MORALE_CORE]] 同式）；
 *   8. 月末補學寫回 `save.learned`（給了 `data` 才做，缺數據不憑空造技能）；
 *   9. 缺自治 bridge（Cocos 現行存檔沒有 prep 欄位）⇒ 標 `civic.mode='skipped'`，不靜默、不報錯；
 *  10. core 邊界：不 import 瀏覽器 / Cocos / node，不含守軍白補與 `save.gold +=` 舊寫點。
 *
 * 跑法：cd game && node --test tests/advance_month.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadData } from '../src/data.ts';
import {
  MORALE_DEFAULT,
  MORALE_LOW,
  TIRE_HIGH,
  YEAR_STAGES,
  advanceOneMonth,
  annualTax,
  isYearStart,
  monthOfYear,
  officersByCityOf,
  prepFromMoneyAll,
  troopCapOf,
  yearOf,
} from '../src/core/advance_month.ts';
import type { MonthSaveLike } from '../src/core/advance_month.ts';

const readText = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
/** 測試用 data（與 unlock.test.ts 同一口徑；SKILL/WISESKILL 表在 generals.json 裏） */
const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 一份最小可用的「存檔樣子的物件」（欄位名 = web campaign 存檔 ∩ Cocos CampaignSave） */
function makeSave(patch: Partial<MonthSaveLike> = {}): MonthSaveLike {
  return {
    month: 1,
    year: 1,
    yearFlag: 0,
    lastActionMonth: 0,
    owned: ['代縣', '晉陽'],
    cities: {
      代縣: { pop: 79500, money: 0, prep: 0, troops: 500 },
      晉陽: { pop: 30000, money: 0, prep: 0, troops: 300 },
    },
    gold: 0,
    tire: {},
    morale: {},
    learned: {},
    ledger: { year: 1, months: 0, income: 0, salary: 0 },
    ...patch,
  };
}

/** 深拷貝（純函數重放要兩份互不污染的輸入；存檔全是 JSON 值） */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/* ======================================================================
 * F-03 金 → 預備兵 / 自治代行
 * ==================================================================== */

test('F-03 月流水：金→預備兵 100:1（無自治適配器時走 core 保底）', () => {
  const save = makeSave({
    month: 3,
    owned: ['代縣'],
    cities: { 代縣: { pop: 79500, money: 250, prep: 0, troops: 500 } },
  });
  const report = advanceOneMonth(save, { ts: 0 });

  assert.equal(report.civic.mode, 'builtin', '沒有 civic 適配器但存檔有 prep 欄位 ⇒ core 自己做金→預備兵');
  const city = save.cities!['代縣']!;
  // 250 金 ⇒ floor(250/100)=2 兵、花 200 金、剩 50
  assert.equal(city.money, 50, '只花得掉的錢：2×100');
  assert.equal(city.prep, 2, '100 金 = 1 預備兵');
  assert.equal(report.civic.refilled, 1);
  assert.deepEqual(report.civic.refills, [{ city: '代縣', n: 2, cost: 200, prep: 2, cap: troopCapOf(79500) }]);
  assert.equal(troopCapOf(79500), 141, '預備兵上限 = min(pop/2500+110, 600)');
  // 錢變兵不發軍餉、不寫單一錢包（F16）
  assert.equal(save.gold, 0, '月流水不碰 save.gold');
});

test('F-03 自治代行對每座城生效（不只開面板那座）＋ 受預備兵上限約束', () => {
  const save = makeSave({
    month: 7,
    owned: ['甲城', '乙城', '丙城'],
    cities: {
      甲城: { pop: 79500, money: 1000, prep: 0 },      // cap 141，金可換 10
      乙城: { pop: 79500, money: 100000, prep: 141 },  // 已滿 ⇒ 不換
      丙城: { pop: 2500, money: 350, prep: 0 },        // cap 111，金可換 3
    },
  });
  const report = advanceOneMonth(save, { ts: 0 });

  assert.equal(report.civic.mode, 'builtin');
  assert.equal(report.civic.refilled, 2, '三座城裏兩座有餘額可換（不是只換一座）');
  assert.deepEqual(save.cities!['甲城'], { pop: 79500, money: 0, prep: 10 });
  assert.deepEqual(save.cities!['乙城'], { pop: 79500, money: 100000, prep: 141 }, '兵滿的城一分錢都不該動');
  assert.deepEqual(save.cities!['丙城'], { pop: 2500, money: 50, prep: 3 });
  // core 保底只做「錢變兵」，不做搜索/開發 ⇒ 要照實寫進 note（不假裝做過）
  assert.match(report.civic.note, /只做了「金→預備兵」/);
});

test('F-03 適配器模式：每月被呼叫一次、戰報與回報都用它的結果', () => {
  const save = makeSave({ month: 2, owned: ['代縣'], cities: { 代縣: { pop: 79500, money: 0 } } });
  const calls: Array<{ month: number; same: boolean }> = [];
  const report = advanceOneMonth(save, {
    ts: 0,
    civic: (state) => {
      calls.push({ month: Number(state.month), same: state === save });
      return {
        refilled: [{ city: '代縣', n: 5, cost: 500, prep: 5, cap: 141 }],
        auto: { ok: true, text: '代縣城自治：開墾 +100 人口、+5 防禦。' },
      };
    },
  });

  assert.equal(report.civic.mode, 'adapter', '有適配器時 core 不自己發錢換兵');
  assert.equal(calls.length, 1, '每個月只呼叫一次（冪等補跑靠 save.autoMonth 在適配器內部）');
  assert.deepEqual(calls[0], { month: 3, same: true }, '適配器拿到的是同一份存檔（就地結算）');
  assert.equal(report.civic.ok, true);
  assert.equal(report.civic.refilled, 1);
  assert.match(report.logs.join('\n'), /代縣城自治：開墾 \+100 人口、\+5 防禦。/);
  assert.equal(save.cities!['代縣']!.money, 0, '適配器模式下 core 不碰城金（金由適配器自己扣）');
});

/* ======================================================================
 * F-04 守軍不再白補 2%
 * ==================================================================== */

test('F-04 月流水不碰守軍：troops 一點都不漲（web 已刪的 2% 白補不許回來）', () => {
  const save = makeSave({ month: 4, owned: ['代縣'] });
  const before = clone(save.cities);
  const report = advanceOneMonth(save, { ts: 0 });
  assert.deepEqual(save.cities, before, '除了錢→預備兵，城狀態不該有任何變化（含 troops）');
  assert.equal(report.civic.mode, 'builtin', '本月只有「金→預備兵」跑過（金 0 ⇒ 0 座城）');
  assert.equal(report.civic.refilled, 0);
});

/* ======================================================================
 * F-14 年度結算 / 年稅 / ledger
 * ==================================================================== */

test('F-14 跨年（12→13 月）：年度結算 + 年稅進城金 + ledger 記一筆', () => {
  const save = makeSave({
    month: 12,
    year: 1,
    wins: 3,
    losses: 2,
    ledger: { year: 1, months: 12, income: 0, salary: 0 },
  });
  const report = advanceOneMonth(save, { ts: 12345 });

  assert.equal(report.month, 13);
  assert.equal(report.year, 2);
  assert.equal(report.yearStart, true);
  assert.equal(save.year, 2, 'ensureYear 把 save.year 對齊');

  // 年度結算：結掉第 1 年，記錄 12 個月帳本、城池/人口/武將/戰績
  assert.ok(report.annual, '正月必須跑年度結算');
  assert.equal(report.annual!.ok, true);
  assert.equal(report.annual!.record!.year, 1);
  assert.equal(report.annual!.record!.intoYear, 2);
  assert.equal(report.annual!.record!.months, 12, '上一年帳本記了 12 個月');
  assert.equal(report.annual!.record!.cities, 2);
  assert.equal(report.annual!.record!.pop, 109500);
  assert.equal(report.annual!.record!.wins, 3);
  assert.equal(report.annual!.record!.losses, 2);
  assert.equal(report.annual!.record!.stages.length, YEAR_STAGES.length, '五段鉤子要落檔');
  assert.equal(save.yearFlag, 0, '結算完要把年進位標誌歸零（原作 0x4A64FC=0）');
  assert.equal(save.annual!.year, 1);

  // 年稅：每城 pop×75/10000+2250，加進本城 money；income 只累計
  const tax1 = annualTax(79500);
  const tax2 = annualTax(30000);
  assert.equal(tax1, 2250 + 596);
  assert.equal(tax2, 2250 + 225);
  assert.equal(report.income, tax1 + tax2);
  // 年稅進本城 money 之後，同一條月流水的「金→預備兵」會把錢換成預備兵（100 金 = 1 兵，受上限約束）
  const prep1 = Math.floor(tax1 / 100);
  assert.equal(prep1, 28);
  assert.equal(save.cities!['代縣']!.money, tax1 - prep1 * 100, '年稅先進城金，再被換成預備兵');
  assert.equal(save.cities!['代縣']!.prep, prep1);
  assert.equal(save.cities!['晉陽']!.money, tax2 % 100);
  assert.equal(save.gold, 0, '年稅不寫單一錢包（F16）');

  // ledger：新一年從 0 記，本月 +1 月、income = 年稅
  assert.deepEqual(save.ledger, { year: 2, months: 1, income: tax1 + tax2, salary: 0 });
  assert.deepEqual(report.ledger, save.ledger);

  // 戰報順序：年結算一行 → 歲入一行
  const idxAnnual = report.logs.findIndex((line) => line.includes('年 度 結 算'));
  const idxIncome = report.logs.findIndex((line) => line.includes('歲 入'));
  assert.ok(idxAnnual >= 0, '年度結算要有一行戰報');
  assert.ok(idxIncome > idxAnnual, '歲入排在年結算之後（web 舊序）');
  assert.match(report.annual!.text, /^1年 年 度 結 算：歲入 0 金 · 城 2 · 將 0 · 戰績 3 勝 2 敗$/);
});

test('F-14 年稅：給了城定義時關城免稅（RATE=0 / POPULATION=0）', () => {
  const save = makeSave({
    month: 12,
    owned: ['代縣', '關城'],
    cities: { 代縣: { pop: 79500, money: 0 }, 關城: { pop: 5000, money: 0 } },
    ledger: { year: 1, months: 12, income: 0, salary: 0 },
  });
  const report = advanceOneMonth(save, {
    ts: 0,
    cityDefs: [
      { NAME: '代縣', RATE: 3, POPULATION: 79500 },
      { NAME: '關城', RATE: 0, POPULATION: 5000 },
    ],
  });
  assert.equal(report.income, annualTax(79500), '關城不徵稅（原作跳過 0x405499 為真的城）');
  assert.equal(save.cities!['關城']!.money, 0);
  // 這份存檔沒有 prep 欄位 ⇒ 沒有「金→預備兵」，稅金原樣留在城金裏
  assert.equal(save.cities!['代縣']!.money, annualTax(79500));
  assert.equal(report.civic.mode, 'skipped');
});

test('非正月：不發年稅、不跑年結算、帳本只 +1 月', () => {
  const save = makeSave({ month: 5, ledger: { year: 1, months: 3, income: 0, salary: 0 } });
  const report = advanceOneMonth(save, { ts: 0 });
  assert.equal(report.month, 6);
  assert.equal(isYearStart(6), false);
  assert.equal(report.annual, null, '非正月不跑年度結算');
  assert.equal(report.income, 0);
  assert.equal(save.cities!['代縣']!.money, 0);
  assert.equal(report.ledger.months, 4, '帳本每月 +1 月');
  assert.equal(report.ledger.year, 1);
});

/* ======================================================================
 * 純函數：同輸入同輸出（可重放）
 * ==================================================================== */

test('同輸入同輸出：兩份輸入跑出同一個 MonthReport 與同一份存檔', () => {
  const build = () => makeSave({
    month: 12,
    tire: { 甲: 80 },
    ledger: { year: 1, months: 12, income: 0, salary: 0 },
  });
  const a = build();
  const b = build();
  const ra = advanceOneMonth(a, { ts: 777 });
  const rb = advanceOneMonth(b, { ts: 777 });
  assert.deepEqual(ra, rb, '同輸入 ⇒ 同 MonthReport');
  assert.deepEqual(a, b, '同輸入 ⇒ 同存檔（純函數、沒有藏在模組級別的計數器）');
  // ts 是唯一的時間注入點：換 ts 只該影響年度記錄的 at
  const c = build();
  const rc = advanceOneMonth(c, { ts: 999 });
  assert.equal(rc.annual!.record!.at, 999);
  assert.equal(ra.annual!.record!.at, 777);
  assert.deepEqual(
    { ...rc, annual: { ...rc.annual, record: { ...rc.annual!.record, at: 0 } } },
    { ...ra, annual: { ...ra.annual, record: { ...ra.annual!.record, at: 0 } } },
    '除 at 外的所有輸出都與 ts 無關',
  );
});

/* ======================================================================
 * 疲勞 / 士氣 / 補學 / 降級
 * ==================================================================== */

test('疲勞每月 -1；高疲勞（≥60）扣士氣；低迷（<30）自然 +1', () => {
  const save = makeSave({
    month: 8,
    owned: ['代縣'],
    tire: { 甲: 100, 丙: 0 },
    morale: { 甲: MORALE_DEFAULT, 丙: MORALE_LOW - 5 },
    cities: { 代縣: { pop: 79500, money: 0, prep: 0, morale: 50 } },
  });
  const report = advanceOneMonth(save, { ts: 0, officersByCity: { 代縣: ['甲', '丙'] } });

  assert.equal(save.tire!['甲'], 99, '疲勞先 -1（下限 0）');
  assert.equal(report.fatigue.decayed, 1);
  assert.equal(report.fatigue.high, 1, '減後 99 仍 ≥ TIRE_HIGH');
  assert.equal(report.fatigue.moraleLoss, 1);
  assert.equal(save.cities!['代縣']!.morale, 49, 'city.morale 有值 ⇒ 高疲勞 -1');
  assert.equal(save.morale!['甲'], MORALE_DEFAULT - 1, '武將士氣 -1');
  assert.equal(save.morale!['丙'], MORALE_LOW - 4, '士氣 < MORALE_LOW ⇒ 自然 +1');
  assert.equal(report.morale.recovered, 1);
  assert.match(report.logs.join('\n'), /疲 勞：1 人 -1/);
  assert.match(report.logs.join('\n'), /士 氣：低迷 1 人自然 \+1/);
  assert.equal(TIRE_HIGH, 60, '門檻與 campaign.html [[FATIGUE_CORE]] 一致');
});

test('F-14 月末補學：給了 data 才補，寫回 save.learned 且冪等', () => {
  const save = makeSave({ month: 9, owned: ['代縣'], cities: { 代縣: { pop: 79500, money: 0, prep: 0 } } });
  const ctx = () => ({ ts: 0, data, officersByCity: { 代縣: ['丁奉'] }, levelOf: () => 1 });
  const r1 = advanceOneMonth(save, ctx());

  assert.equal(r1.learned.length, 1, '丁奉 1 級有可學的技/軍師技');
  assert.equal(r1.learned[0]!.name, '丁奉');
  assert.ok(r1.learned[0]!.got.length >= 2, '技與軍師技各至少補一條');
  const known = save.learned!['丁奉'];
  assert.ok(known && Array.isArray(known.magic) && Array.isArray(known.wise), 'save.learned 要落檔');
  assert.ok(known!.magic!.length > 0);
  assert.match(r1.logs.join('\n'), /學 習：1 名武將 補 \d+ 技/);

  const r2 = advanceOneMonth(save, ctx());
  assert.deepEqual(r2.learned, [], '第二次同級不該重複補學（冪等）');
  assert.doesNotMatch(r2.logs.join('\n'), /學 習：/);
});

test('缺 ctx.data：補學照實跳過，不憑空造技能', () => {
  const save = makeSave({ month: 9, owned: ['代縣'], cities: { 代縣: { pop: 79500, money: 0, prep: 0 } } });
  const report = advanceOneMonth(save, { ts: 0, officersByCity: { 代縣: ['丁奉'] } });
  assert.deepEqual(report.learned, []);
  assert.deepEqual(save.learned, {}, '沒有 generals 數據時不能寫 learned');
});

test('缺自治 bridge（Cocos 現行存檔沒有 prep）：civic.mode=skipped，不報錯、不靜默', () => {
  const save = makeSave({ month: 2, owned: ['代縣'], cities: { 代縣: { pop: 79500, money: 1000 } } });
  const report = advanceOneMonth(save, { ts: 0 });
  assert.equal(report.civic.mode, 'skipped', '沒有 prep 欄位也沒有適配器 ⇒ 照實標 skipped');
  assert.equal(report.civic.ok, false);
  assert.equal(report.civic.refilled, 0);
  assert.match(report.civic.note, /跳過自治代行/);
  assert.equal(save.cities!['代縣']!.money, 1000, '跳過時不該亂扣錢');
});

test('換月清月令鎖：lastActionMonth 歸零（＝ CM.clearMonthLock）', () => {
  const save = makeSave({ month: 3, lastActionMonth: 3 });
  advanceOneMonth(save, { ts: 0 });
  assert.equal(save.lastActionMonth, 0);
  assert.equal(save.month, 4);
});

/* ======================================================================
 * core 邊界（純函數、無 DOM/Cocos、無舊白補/舊錢包寫點）
 * ==================================================================== */

test('core 源碼邊界：不 import 瀏覽器/Cocos/node，也不含守軍白補與 save.gold 寫點', () => {
  const src = readText('../src/core/advance_month.ts');
  assert.doesNotMatch(src, /from ['"]cc['"]/, 'core 不能 import Cocos');
  assert.doesNotMatch(src, /\bdocument\./, 'core 不能碰 DOM');
  assert.doesNotMatch(src, /\blocalStorage\b/, 'core 不能自己存檔');
  assert.doesNotMatch(src, /from ['"]node:/, 'core 不能 import node 內建');
  assert.doesNotMatch(src, /cap \* 0\.02/, 'F-04 的 2% 白補不許回來');
  assert.doesNotMatch(src, /Math\.ceil\(cap/, 'F-04 的 2% 白補不許回來');
  assert.doesNotMatch(src, /city\.troops\s*[+\-*/]?=/, '月流水不寫城兵（F-04）');
  assert.doesNotMatch(src, /state\.gold\s*\+=/, '月流水不寫單一錢包（F16）');
});

/* ======================================================================
 * 小工具（供上面斷言用，也順便釘住兩端共用的計算口徑）
 * ==================================================================== */

test('共用口徑：年度軸 / 年稅 / 預備兵上限 / 在職武將名單', () => {
  assert.equal(yearOf(1), 1);
  assert.equal(yearOf(12), 1);
  assert.equal(yearOf(13), 2);
  assert.equal(monthOfYear(13), 1);
  assert.equal(isYearStart(13), true);
  assert.equal(annualTax(0), 2250, '空城也給固定額');
  assert.equal(annualTax(133333), 2250 + 999);
  assert.equal(troopCapOf(1_000_000), 510, '人口上限 100 萬 ⇒ 上限 = 400+110（600 只是公式外層 cap）');
  assert.deepEqual(officersByCityOf({
    owned: ['代縣', '晉陽'],
    cities: {
      代縣: { officers: ['關羽', { name: '張飛' }] },
      晉陽: {},
    },
  } as MonthSaveLike), { 代縣: ['關羽', '張飛'], 晉陽: [] });
  // 保底二次呼叫：錢已花光 ⇒ 不再產生 refill（冪等）
  const save = makeSave({ month: 3, owned: ['代縣'], cities: { 代縣: { pop: 79500, money: 250, prep: 0 } } });
  assert.equal(prepFromMoneyAll(save).length, 1);
  assert.equal(prepFromMoneyAll(save).length, 0);
});
