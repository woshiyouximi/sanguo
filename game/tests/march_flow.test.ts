/**
 * 出征兵數閉環（web/march_flow.js）自檢 + 接線契約。
 *
 * 跑法：
 *   cd F:\sanguo\game
 *   node --test tests/march_flow.test.ts
 *
 * 這條閉環修的兩個 P0（work/flow_audit/内政大地图_差异.md §5）：
 *   F23：deploy.html 出征兵力按「等級上限」自動填滿、不讀城兵 → 陳留 200 兵只帶出 10 兵（Lv.2×5），
 *        而且出征不從出發城扣兵；
 *   F24：攻城戰後完全不回寫兵損（main.js:1146-1154 只 push owned / losses+1）。
 * 所以這裡釘四件事：出征上限 = min(每將等級上限, 城兵)、扣兵只扣到零為止、
 * 戰損按 A 方存活比折算、倖存兵要還得回出發城。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import {
  DEPLOY_OFFICER_MAX,
  TROOP_HARD_CAP,
  casualtySplitOf,
  cityPoolOf,
  fieldCapOf,
  parseOfficerList,
  returnToCity,
  takeFromCity,
} from '../web/march_flow.js';

const GAME = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string): string => readFileSync(join(GAME, rel), 'utf8');

// ---------------------------------------------------------------------------
// 一、出征池 = 部隊兵 + 預備兵
// ---------------------------------------------------------------------------

test('TROOP_HARD_CAP / DEPLOY_OFFICER_MAX 與 campaign、deploy_queue 的常數一致', () => {
  // campaign.html 的 refundArmy() 也是 `Math.min(600, ...)`；deploy_queue.ts 的 DEPLOY_SLOTS = 5。
  assert.equal(TROOP_HARD_CAP, 600);
  assert.equal(DEPLOY_OFFICER_MAX, 5);
  const campaign = read('web/campaign.html');
  assert.match(campaign, /Math\.min\(600,/, 'campaign 的退兵上限必須還是 600');
  const dq = read('src/core/deploy_queue.ts');
  assert.match(dq, /export const DEPLOY_SLOTS = 5/, 'deploy_queue 的槽數必須還是 5');
});

test('cityPoolOf：部隊兵 + 預備兵 = 出征池，城兵不再被「等級上限》那類 UI 蓋掉', () => {
  const st = { troops: 200, prep: 300, pop: 120000, money: 400 };
  assert.deepEqual(cityPoolOf(st, { prepCap: 400 }), { troops: 200, prep: 300, prepCap: 400, pool: 500 });
});

test('cityPoolOf：缺 prep 欄位的老檔按「滿池」算（與 campaign 的 normalizeCityState 同口徑）', () => {
  const st = { troops: 110 };
  assert.deepEqual(cityPoolOf(st, { prepCap: 158 }), { troops: 110, prep: 158, prepCap: 158, pool: 268 });
});

test('cityPoolOf：城狀態整個缺失 → 用 fallbackTroops（Saves.cityTroops 的估值）', () => {
  assert.deepEqual(cityPoolOf(undefined, { fallbackTroops: 190, prepCap: 190 }), {
    troops: 190, prep: 190, prepCap: 190, pool: 380,
  });
  assert.deepEqual(cityPoolOf(null, { fallbackTroops: 0, prepCap: 0 }), {
    troops: 0, prep: 0, prepCap: 0, pool: 0,
  });
});

test('cityPoolOf：壞值（負數/字串/NaN/超上限）一律夾到 0..600，不 throw', () => {
  assert.equal(cityPoolOf({ troops: -50, prep: -1 }, { prepCap: 100 }).pool, 0);
  assert.equal(cityPoolOf({ troops: '80', prep: '20' }, { prepCap: 100 }).pool, 100);
  assert.equal(cityPoolOf({ troops: 9999, prep: 9999 }, { prepCap: 100 }).troops, 600);
  assert.equal(cityPoolOf({ troops: 10, prep: 90 }, { prepCap: 100 }).prep, 90, '預備兵不得超過上限');
  assert.equal(cityPoolOf({ troops: 'abc' }, {}).troops, 0, 'NaN 按 0（不是回退到 fallback）');
});

test('cityPoolOf：prepCap = 0 的城（人口資料缺失）就只有部隊兵，不做「無中生有」', () => {
  assert.deepEqual(cityPoolOf({ troops: 30 }, { prepCap: 0 }), { troops: 30, prep: 0, prepCap: 0, pool: 30 });
});

// ---------------------------------------------------------------------------
// 二、上陣上限 = min(每將等級上限, 城兵)  —— F23 的核心
// ---------------------------------------------------------------------------

test('fieldCapOf：等級上限與城兵取小（陳留 200 兵、Lv.2 的主將也只能帶 10）', () => {
  assert.equal(fieldCapOf(10, 200), 10, '城兵充足 → 每將等級上限');
  assert.equal(fieldCapOf(100, 40), 40, '城兵不足 → 城兵（不再按等級上限自動填滿）');
  assert.equal(fieldCapOf(200, 200), 200);
  assert.equal(fieldCapOf(0, 200), 0, '等級上限 0 就是 0');
  assert.equal(fieldCapOf(100, 0), 0, '空城帶不出兵');
});

test('fieldCapOf：壞值/負數夾到 0，不產生負上限', () => {
  assert.equal(fieldCapOf(-30, 50), 0);
  assert.equal(fieldCapOf(50, -30), 0);
  assert.equal(fieldCapOf('100', '40'), 40);
  assert.equal(fieldCapOf(NaN, 20), 0);
});

// ---------------------------------------------------------------------------
// 三、出征確認時扣兵
// ---------------------------------------------------------------------------

test('takeFromCity：先扣部隊兵，部隊兵夠就不碰預備兵', () => {
  const st = { troops: 200, prep: 300 };
  const r = takeFromCity(st, 100, { prepCap: 400 });
  assert.equal(r.ok, true);
  assert.equal(r.taken, 100);
  assert.equal(r.fromTroops, 100);
  assert.equal(r.fromPrep, 0);
  assert.deepEqual([r.troops, r.prep], [100, 300]);
  assert.equal(st.troops, 200, '純函數：不得就地改動傳進來的物件');
});

test('takeFromCity：部隊兵不夠才動預備兵（1 預備兵 = 1 兵）', () => {
  const r = takeFromCity({ troops: 30, prep: 50 }, 70, { prepCap: 50 });
  assert.deepEqual([r.fromTroops, r.fromPrep, r.troops, r.prep], [30, 40, 0, 10]);
  assert.equal(r.ok, true);
  // 連預備兵也不夠 → 整筆失敗（部隊兵優先的順序不影響「能不能扣」的判定）
  assert.equal(takeFromCity({ troops: 30, prep: 50 }, 81, { prepCap: 50 }).ok, false);
});

test('takeFromCity：剛好扣光（pool 全拿走）→ 城兵歸零，不是負數', () => {
  const r = takeFromCity({ troops: 10, prep: 5 }, 15, { prepCap: 5 });
  assert.deepEqual([r.ok, r.fromTroops, r.fromPrep, r.troops, r.prep, r.pool], [true, 10, 5, 0, 0, 0]);
});

test('takeFromCity：城兵不夠就整筆失敗，一個兵都不扣（不允許超分）', () => {
  const st = { troops: 10, prep: 5 };
  const r = takeFromCity(st, 16, { prepCap: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-enough');
  assert.equal(r.want, 16);
  assert.deepEqual([r.taken, r.fromTroops, r.fromPrep, r.troops, r.prep], [0, 0, 0, 10, 5]);
});

test('takeFromCity：n = 0 / 負數 / 壞值 → 什麼都不做（不會把兵「加」回城）', () => {
  for (const n of [0, -5, NaN, 'abc', null]) {
    const r = takeFromCity({ troops: 40, prep: 10 }, n as number, { prepCap: 10 });
    assert.equal(r.ok, true);
    assert.deepEqual([r.taken, r.troops, r.prep], [0, 40, 10], `n=${String(n)}`);
  }
});

test('takeFromCity：扣完的兩欄都留在合法範圍（連續出征不會累積誤差）', () => {
  let st = { troops: 117, prep: 43 };
  let left = 160;
  let guard = 0;
  while (left > 0 && guard < 50) {
    const n = Math.min(37, left);
    const r = takeFromCity(st, n, { prepCap: 43 });
    assert.equal(r.ok, true, `第 ${guard} 次扣兵`);
    st = { troops: r.troops, prep: r.prep };
    left -= n;
    guard += 1;
  }
  assert.deepEqual(st, { troops: 0, prep: 0 });
  assert.equal(takeFromCity(st, 1, { prepCap: 43 }).ok, false, '扣光後再出征必須失敗');
});

// ---------------------------------------------------------------------------
// 四、戰後回寫：按 A 方存活比折算 + 倖存兵還回出發城   —— F24 的核心
// ---------------------------------------------------------------------------

test('casualtySplitOf：上陣 100 活 60、兵團 178 → 按比例損 71（不是只損上陣那 40）', () => {
  const r = casualtySplitOf(178, 100, 60);
  assert.equal(r.lostFielded, 40);
  assert.equal(r.loss, 71, 'round(178 × 40 / 100) = 71');
  assert.equal(r.returned, 107);
  assert.equal(r.loss + r.returned, 178, '損 + 歸 = 出征池（不憑空多兵/少兵）');
});

test('casualtySplitOf：有傷亡就至少損 1（與守城 branch 的 Math.max(1, ...) 同款）', () => {
  const r = casualtySplitOf(100, 100, 99);
  assert.equal(r.lostFielded, 1);
  assert.equal(r.loss, Math.max(1, Math.round(100 * 1 / 100)));
  assert.equal(r.returned, 99);
});

test('casualtySplitOf：零傷亡 → 一兵不損（不會出現「打贏也掉 1 兵」的假損失）', () => {
  const r = casualtySplitOf(178, 100, 100);
  assert.deepEqual([r.loss, r.returned, r.lostFielded], [0, 178, 0]);
});

test('casualtySplitOf：全滅 → 出征池全損、帶不回任何兵', () => {
  const r = casualtySplitOf(178, 100, 0);
  assert.deepEqual([r.loss, r.returned], [178, 0]);
});

test('casualtySplitOf：上陣 0（防守方沒出場）按 1 處理，不除零', () => {
  const r = casualtySplitOf(50, 0, 0);
  assert.ok(Number.isFinite(r.loss));
  assert.deepEqual([r.loss, r.returned], [50, 0]);
});

test('casualtySplitOf：alive 比 start 大（結算異常）會被夾住 → 不返還超過出征池', () => {
  const r = casualtySplitOf(100, 100, 130);
  assert.deepEqual([r.lostFielded, r.loss, r.returned], [0, 0, 100]);
});

test('casualtySplitOf：出征池 0 / 負值 / 壞值 → 全 0，不產生負兵', () => {
  for (const pool of [0, -50, NaN]) {
    const r = casualtySplitOf(pool as number, 100, 60);
    assert.deepEqual([r.loss, r.returned], [0, 0], `pool=${String(pool)}`);
  }
});

test('casualtySplitOf：打仗前後總兵數守恆（城 + 出征 = 常數）', () => {
  const cityBefore = 300;
  const pool = 178;
  const r = casualtySplitOf(pool, 100, 61);
  // 出征時扣掉 pool、戰後把 returned 還回去：淨損失正好是 loss
  assert.equal(cityBefore - pool + r.returned, cityBefore - r.loss);
});

test('returnToCity：倖存兵回到部隊兵欄，硬上限 600', () => {
  assert.deepEqual(returnToCity({ troops: 100 }, 107), { before: 100, troops: 207, added: 107, overflow: 0 });
  const capped = returnToCity({ troops: 580 }, 107);
  assert.deepEqual(capped, { before: 580, troops: 600, added: 20, overflow: 87 });
});

test('returnToCity：n=0/負數不動城兵；缺欄位按 0；不就地改動傳入物件', () => {
  const st = { troops: 12 };
  assert.deepEqual(returnToCity(st, 0), { before: 12, troops: 12, added: 0, overflow: 0 });
  assert.deepEqual(returnToCity(st, -3), { before: 12, troops: 12, added: 0, overflow: 0 });
  assert.deepEqual(returnToCity(undefined, 5), { before: 0, troops: 5, added: 5, overflow: 0 });
  assert.deepEqual(st, { troops: 12 });
});

test('完整一仗（F23+F24 串起來）：200 兵的城 → 帶 100 出戰 → 損 40 → 城裡剩 160', () => {
  const city = { troops: 200, prep: 0 };
  const pool = cityPoolOf(city, { prepCap: 0 }).pool;
  const cap = fieldCapOf(100, pool);            // 等級上限 100、城兵 200 → 帶 100
  assert.equal(cap, 100);
  const take = takeFromCity(city, cap, { prepCap: 0 });
  assert.equal(take.ok, true);
  assert.equal(take.troops, 100, '出征那一刻城裡先扣掉 100');
  // 隨軍出征的就是剛扣走的 100（城裡沒帶走的不參與傷亡）
  const split = casualtySplitOf(cap, 100, 60);
  const back = returnToCity({ troops: take.troops }, split.returned);
  assert.equal(back.troops, 100 + 60, '城兵 = 100（剩）+ 60（倖存歸還）');
  assert.equal(back.troops, 200 - 40, '淨損失正好是 40');
  assert.equal(split.returned + split.loss, cap);
});

test('完整一仗（兵團線）：178 兵的兵團只上陣 100 → 戰損按 178 折算，不會只損上陣那部分', () => {
  // 兵團已在 dispatch 時從城裡扣走 178（campaign.html:2871），編成頁只把 100 推上場
  const split = casualtySplitOf(178, 100, 60);
  const back = returnToCity({ troops: 0 }, split.returned);
  assert.equal(split.loss, 71);
  assert.equal(back.troops, 107, '兵團倖存 107 回城');
  assert.equal(178 - split.loss, back.troops);
});

// ---------------------------------------------------------------------------
// 五、接線契約（source contract）：deploy.html / main.js 真的走這一層
// ---------------------------------------------------------------------------

test('deploy.html：import march_flow、出征上限讀城兵、確認時扣兵、URL 帶 home/marchpool', () => {
  const html = read('web/deploy.html');
  assert.match(html, /import \* as MF from '\.\/march_flow\.js'/, '必須 import 同一份純函數');
  assert.match(html, /MF\.cityPoolOf\(/, '出征池要由城狀態算');
  assert.match(html, /MF\.fieldCapOf\(/, '上陣上限 = min(每將上限, 城兵)');
  assert.match(html, /MF\.takeFromCity\(/, '確認出征時要從出發城扣兵');
  // UI 必須寫清「這一仗帶多少 / 出發城有多少」（F23 的驗收點），軍團線與城兵線各一種說法
  assert.match(html, /上陣 兵 <b>\$\{/, '必須顯示這一仗的上陣兵');
  assert.match(html, /城中有 <b>\$\{MARCH_POOL\}<\/b>/, '必須顯示出發城實有兵');
  assert.match(html, /兵團攜行 \$\{ARMY_TROOPS\} 兵/, '兵團線要寫明兵已在城下、不在城裡');
  // 回寫給 main.js 的參數（缺一不可：main.js 靠 home 找城、靠 marchpool 折算）
  assert.match(html, /home: HOME/, '出陣 URL 必須帶出發城');
  assert.match(html, /marchpool: String\(/, '出陣 URL 必須帶兵團總兵');
  // 兵團線不扣第二次（campaign 的 dispatchArmy 已扣）
  assert.match(html, /if \(MARCH_MODE === 'army'\) return \{ ok: true, taken: 0/, '兵團線必須跳過扣兵');
  // 出征令名冊（F22）
  assert.match(html, /MF\.parseOfficerList\(qs\.get\('officers'\)\)/, '必須吃 ?officers= 名冊');
});

test('main.js：讀 home/marchpool、攻城分支按存活比回寫、倖存兵還回出發城', () => {
  const js = read('web/main.js');
  assert.match(js, /import \{[^}]*casualtySplitOf[^}]*\} from '\.\/march_flow\.js'/, '必須 import 同一份純函數');
  assert.match(js, /QUERY\.get\('home'\)/, '出發城由 ?home= 帶進來（不能拿 from= 當城名，它是入口標記）');
  assert.match(js, /QUERY\.get\('marchpool'\)/, '兵團總兵由 ?marchpool= 帶進來');
  assert.match(js, /casualtySplitOf\(/, '攻城分支要按 A 方存活比折算');
  assert.match(js, /returnToCity\(/, '倖存兵要還回出發城');
  // 攻城分支必須在 DEFEND 分支之外（守城口徑不能被我改掉）
  const defend = js.indexOf('if (DEFEND) {');
  const attack = js.indexOf('// 攻城战（原流程）');
  assert.ok(defend > 0 && attack > defend, '攻城回寫要留在守城 branch 之後');
  assert.ok(js.indexOf('casualtySplitOf(') > attack, '存活比折算必須在攻城 branch 裡');
});
