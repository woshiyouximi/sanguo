/**
 * web 側接入驗證（不是測試套件的一部分，只是把 REPORT 的「改後」證據跑一次）：
 *
 *   ① 用 `game/dist/core/advance_month.js`（頁面 import 的那份構建產物）
 *   ② 把 web 的 `CM.autonomyTick` 當 `civic` 適配器傳進去（與 `campaign.html:5410-5418` 同形）
 *   ③ 斷言：換月 / 年稅進城金 / 金→預備兵（100:1）· 守軍不漲（F-04）· 年度結算+帳本（F-14）
 *
 * 執行：`cd F:\sanguo\game; node ..\work\month_pipeline\verify_web_adapter.mjs`
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo/game';
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));

const generals = readJson('generals.json');
const scenarios = readJson('scenarios.json');
const scenario = scenarios[0];

const { advanceOneMonth, annualTax } = await import('file:///F:/sanguo/game/dist/core/advance_month.js');
const CM = await import('file:///F:/sanguo/game/web/city_model.js');

const clone = (value) => JSON.parse(JSON.stringify(value));

/** 仿 web v3 戰役存檔（F16 遷移後：goldMigrated=true、錢在各城 money）。 */
function makeWebSave() {
  return {
    month: 12,
    year: 1,
    yearFlag: 0,
    gold: 0,
    goldMigrated: true,
    owned: ['襄平', '北平'],
    wins: 3,
    losses: 2,
    defWins: 0,
    ledger: { year: 1, months: 12, income: 0, salary: 0 },
    annual: null,
    tire: {},
    morale: {},
    learned: {},
    roster: {},
    lastActionMonth: 0,
    cities: {
      襄平: { troops: 141, pop: 79500, money: 2846, prep: 0 },
      北平: { troops: 145, pop: 89000, money: 2917, prep: 0 },
    },
  };
}

/** 仿 campaign.html 的 monthCtx（第 5410-5418 行）。 */
function webCtx(save) {
  return {
    cityDefs: scenario.cities,
    data: { generals },
    civic: () => CM.autonomyTick(save, scenario.cities, { generals }),
    officersByCity: {},
    ts: 1234567,
  };
}

const save = makeWebSave();
const before = clone(save);
const report = advanceOneMonth(save, webCtx(save));

// ---- 換月 + 年度結算（F-14）
assert.equal(save.month, 13, 'month 12 → 13');
assert.equal(report.yearStart, true);
assert.equal(report.annual?.ok, true, '跨年觸發年度結算');
assert.equal(report.annual.record.year, 1);
assert.equal(report.annual.record.intoYear, 2);
assert.equal(report.annual.record.months, 12);
assert.equal(report.annual.record.cities, 2);
assert.equal(save.yearFlag, 0, 'yearFlag 由 core 收回');

// ---- 年稅（正月，逐城 pop×75/10000+2250 進本城 money）
const tax1 = annualTax(79500);
const tax2 = annualTax(89000);
assert.equal(tax1, 2846);
assert.equal(tax2, 2917);
assert.equal(report.income, tax1 + tax2);

// ---- 金→預備兵（web 適配器 = CM.autonomyTick，對每座城都跑）
// 襄平：money 2846+2846=5692 → 上限 min(floor(79500/2500)+110,600)=141 → 56 兵、剩 92 金
assert.equal(save.cities['襄平'].prep, 56, '金→預備兵 100:1');
assert.equal(save.cities['襄平'].money, 92);
// 北平：money 2917+2917=5834 → 上限 min(floor(89000/2500)+110,600)=145 → 58 兵、剩 34 金
assert.equal(save.cities['北平'].prep, 58);
assert.equal(save.cities['北平'].money, 34);
assert.equal(report.civic.mode, 'adapter');
assert.equal(report.civic.ok, true);
// web `CM.autonomyTick` 本來就是對「劇本全城」跑 prepFromMoney（不只玩家城），與改前逐字同口徑。
assert.equal(report.civic.refilled, scenario.cities.length, 'civic 適配器對全部劇本城跑 prepFromMoney（同改前）');
assert.ok(save.cities['襄平'].prep > 0 && save.cities['北平'].prep > 0);

// ---- F-04：守軍不白補
assert.equal(save.cities['襄平'].troops, before.cities['襄平'].troops);
assert.equal(save.cities['北平'].troops, before.cities['北平'].troops);

// ---- 帳本 / 戰報順序
assert.deepEqual(report.ledger, { year: 2, months: 1, income: tax1 + tax2, salary: 0 });
assert.match(report.logs[0], /^1年 年 度 結 算：歲入 0 金 · 城 2 · 將 0 · 戰績 3 勝 2 敗$/);
assert.match(report.logs[1], /^歲 入：\+5763 金（正月 · 2 城 · 每城 人口×75\/10000 \+ 2250）$/);
assert.equal(save.annual.stages.length, 5, '年度五段（存進 save.annual 的是 record 本體）');

// ---- 純函數重放：同一份輸入 → 同一份輸出
const save2 = makeWebSave();
const report2 = advanceOneMonth(save2, webCtx(save2));
assert.deepEqual(report2, report);
assert.deepEqual(save2, save);

console.log('verify_web_adapter: OK');
console.log(`  month ${before.month} → ${save.month} · income ${report.income} 金 · ledger ${JSON.stringify(report.ledger)}`);
console.log(`  prep 襄平 ${save.cities['襄平'].prep} / 北平 ${save.cities['北平'].prep} · troops 不變（F-04）`);
console.log(`  logs: ${report.logs.length} 行 · civic.mode=${report.civic.mode} · annual.ok=${report.annual.ok}`);
