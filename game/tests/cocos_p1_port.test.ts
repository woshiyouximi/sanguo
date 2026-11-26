// @ts-nocheck
/**
 * [cocos-p1] 「內政/大地圖 P1」六項 web → Cocos 的移植契約。
 *
 * 為什麼是「讀源碼 + 正則」而不是 import：
 *   ① `game/cocos/assets/scripts/**` 不在 `game/src/core/**` 的同步範圍，測試 import 它會 TS1287；
 *   ② 這裡要守的是**接線**（Cocos 有沒有真的接上 web 的語義），不是某個純函數的返回值 ——
 *      讀源碼文本斷言才看得出「endInterior() 到底有沒有被 doAction 調用」「advanceMonth 裡
 *      還有沒有 `save.gold += income`」這種事。
 * 純函數（月份換算、武將上限）另外用「源碼公式 + 期望值」兩段守：公式來自源碼、期望值寫在這裡。
 *
 * 對應的 web 真源（同一個測試檔會一起驗，防止 web 那邊改了而 Cocos 沒跟）：
 *   F4  `web/campaign.html:2517-2533` `endMonth()` → `advanceMonth(12)`
 *   F7  `web/city_model.js:36-68` `CMD_ORDER` 7 項 / `CMD_SECONDARY` 2 項
 *   F10 `web/city_model.js` `runAutonomy()`：quiet 搜索只留人才日誌
 *   F16 `web/city_model.js:786-894` `nationalGold()` / `migrateGold()`
 *   F19 `web/city_model.js:197-214` `CITY_OFFICER_CAP = 10` + `officerCapState()`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const cocos = (name: string): string => read(`../cocos/assets/scripts/${name}`);
const web = (name: string): string => read(`../web/${name}`);

/** 取某個函式/方法的函式體（含簽名行到對應的 `}`），找不到回空字串。 */
function fnBody(src: string, name: string): string {
  const hit = new RegExp(`(?:function|private|public|protected)\\s+${name}\\s*\\(`).exec(src);
  if (!hit) return '';
  const at = hit.index;
  // 函式體的 `{`：優先取「這一行的最後一個非空白字元是 `{`」的那個，
  // 避開 `): { moved: number; to: string } {` 這種回傳型別裡的大括號。
  let open = -1;
  for (let p = src.indexOf('{', at); p >= 0; p = src.indexOf('{', p + 1)) {
    let q = p + 1;
    while (q < src.length && (src[q] === ' ' || src[q] === '\t')) q += 1;
    if (src[q] === '\n') {
      open = p;
      break;
    }
    if (src.indexOf('\n', p) < 0) break;
  }
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  return '';
}

/**
 * 把源碼裡的純函數抽出來**真的執行**（只適用沒有 module 依賴、或依賴可用 inject 補齊的函數）。
 * 用途：武將上限、月份換算這種「能純函數化」的，不要只驗公式字串，要驗真的回傳值。
 */
function evalFn(
  src: string,
  name: string,
  inject: Record<string, unknown> = {},
): (...args: unknown[]) => any {
  const body = fnBody(src, name);
  if (!body) throw new Error(`找不到 ${name}()`);
  const open = body.indexOf('{');
  // 去掉簽名裡的 TS 型別標註：`month: number` / `count: number | string | null` / `): number`
  const head = body.slice(0, open).replace(/:\s*[^,){]+/g, '');
  const code = `${head}${body.slice(open)}`;
  const keys = Object.keys(inject);
  return new Function(...keys, `return (${code});`)(...keys.map((k) => inject[k]));
}

/* ======================================================================
 * F4 內政終了 = 推進一年
 * ==================================================================== */
/*
 * F4 內政終了 = 原作 0x41BBF5：大地圖時間逐幀流動（T 一年 3600 tick），
 * T==0 進內政；「內政終了」只把 T 重設 3600 回大地圖，不跑月份模擬。
 */
test('[F4] web 真源：endMonth() 只把 T 重設 3600（與 Cocos endInterior 同語義）', () => {
  const html = web('campaign.html');
  const body = fnBody(html, 'endMonth');
  assert.ok(body.length > 100, 'campaign.html 找不到 endMonth()');
  assert.doesNotMatch(body, /advanceMonth\(/, '原作 0x41BBF5 不跑任何月份模擬');
  assert.match(body, /clockT = CLOCK_TICKS_PER_YEAR;/);
  assert.match(body, /clockAcc = 0;/);
  assert.match(body, /內 政 終 了/);
  // 大地圖時間：requestAnimationFrame + 60Hz 固定步長（原作每幀 T−1）
  assert.match(html, /requestAnimationFrame\(clockFrame\);/);
  assert.match(html, /CLOCK_TICKS_PER_YEAR = 3600;/);
  assert.match(html, /CLOCK_TICKS_PER_MONTH = 300;/);
});

test('[F4] Cocos GameState：正月→次年正月的月數公式 + 單月調試開關', () => {
  const src = cocos('GameState.ts');

  // 公式本體（web 逐幀時鐘：T 走滿 3600 tick＝一年；Cocos 要能從任意月份跑到次年正月）
  const fn = fnBody(src, 'monthsToNextJanuary');
  assert.ok(fn.length > 0, 'GameState.ts 缺 monthsToNextJanuary()');
  assert.match(fn, /return 12 - \(\(m - 1\) % 12\);/);

  // 期望值：正月 12、二月 11、……、十二月 1、次年正月再 12
  // 這裡真的執行源碼裡的 monthsToNextJanuary()（不是抄一份公式）。
  const steps = evalFn(src, 'monthsToNextJanuary') as (month: number) => number;
  assert.equal(steps(1), 12);
  assert.equal(steps(2), 11);
  assert.equal(steps(12), 1);
  assert.equal(steps(13), 12);
  // 壞月份（0 / 負數 / NaN）一律當正月處理，不能回 0 步
  assert.equal(steps(0), 12);
  assert.equal(steps(-3), 12);
  assert.equal(steps(Number.NaN), 12);

  // 單月調試開關（對照 web `?adv=1`）：localStorage 鍵 + advanceSteps 只用 1
  assert.match(src, /export const ADV_SINGLE_KEY = 'sanguo_adv_single';/);
  const single = fnBody(src, 'advSingleMonth');
  assert.match(single, /ADV_SINGLE_KEY/);
  const advSteps = fnBody(src, 'advanceSteps');
  assert.match(advSteps, /advSingleMonth\(\) \? 1 : monthsToNextJanuary\(month\)/);
});

test('[F4][R225] 時間由 update(dt) 的原作時鐘推進（endInterior 只重設 T）', () => {
  const src = cocos('CampaignRoot.ts');

  // 入口：advance 仍轉呼叫 endInterior()（原作 0x41BBF5 的那顆按鈕）
  const doAction = fnBody(src, 'doAction');
  assert.match(doAction, /kind === 'advance'[\s\S]{0,400}this\.endInterior\(\);/);

  // endInterior（原作 0x41BBF5）＝ 只把 T 重設 3600 + 恢復時鐘，**不跑模擬**
  const end = fnBody(src, 'endInterior');
  assert.ok(end.length > 100, 'CampaignRoot.ts 缺 endInterior()');
  assert.match(end, /this\.clockT = 3600;/);
  assert.match(end, /this\.clockPaused = false;/);
  assert.doesNotMatch(end, /for \(let i = 0; i < steps; i \+= 1\)/, 'endInterior() 不能再一次性跑 12 個月');

  // 時鐘本體：update(dt) → stepClock → monthTick（每月一次結算）
  assert.match(src, /update\(dt: number\): void \{/);
  assert.match(src, /this\.stepClock\(this\.clockSpeed\)/);
  assert.match(src, /this\.clockT = Math\.max\(0, this\.clockT - n\);/);
  assert.match(src, /private stepClock\(n: number\): void \{/);
  assert.match(src, /private monthTick\(\): boolean \{/);
  const tickStart = src.indexOf('private monthTick(): boolean {');
  assert.ok(tickStart > 0, '缺 monthTick()');
  const tick = src.slice(tickStart, src.indexOf('private enterInterior', tickStart));
  const a = tick.indexOf('GameState.advanceMonth(this.cities');
  const b = tick.indexOf('this.runMapAi()');
  assert.ok(a > 0 && b > a, 'monthTick() 的順序必須是 advanceMonth → runMapAi（行軍已移到 stepArmiesFrame）');
  // [R225b] 行軍改成逐幀：stepClock 每 tick 先 stepArmiesFrame(n)，monthTick 只做經濟/AI
  assert.match(src, /const step = armyStep\(scenario, army\.pathIndex\);/);
  assert.match(src, /private stepArmiesFrame\(n: number\): void \{/);
  assert.match(src, /months \* 300/);
  // 原作常量：一年 3600 tick（0x41B849）
  assert.match(src, /private clockT = 3600;/);
  // T==0 → 進內政（原作 0x41B6CF）
  assert.match(src, /private enterInterior\(\): void \{/);
  assert.match(src, /openCityPanel\(home\);/);

  // 按鈕文案仍是「內 政 終 了」
  assert.doesNotMatch(src, /title: '推進一月'/);
  assert.match(src, /title: '內 政 終 了'/);

});

test('[F4] Cocos 稅入預覽與 web annualTax 同口徑（跳過關城）', () => {
  const src = cocos('CampaignRoot.ts');
  const income = fnBody(src, 'income');
  assert.match(income, /Math\.floor\(state\.pop \* 75 \/ 10000\) \+ 2250/);
  assert.match(income, /GameState\.isGateCity\(def\)/);
  assert.doesNotMatch(income, /Math\.floor\(state\.pop \/ 5000\) \* 4/);
});

/* ======================================================================
 * F7 月令口徑：主令 7 + 副令 2（情報/移動不占月令）
 * ==================================================================== */

test('[F7] Cocos CityModel 命令表 = web 7 主令 + 2 副令，物品已併入武將資料', () => {
  const src = cocos('CityModel.ts');
  const order = src.match(/export const CMD_ORDER = (\[[^\]]*\]);/);
  assert.ok(order, 'CityModel.ts 缺 CMD_ORDER');
  assert.deepEqual(JSON.parse(order[1].replace(/'/g, '"')), ['搜索', '開發', '徵兵', '任命', '武將資料', '自治', '出征']);

  const sec = src.match(/export const CMD_SECONDARY = (\[[^\]]*\]);/);
  assert.ok(sec, 'CityModel.ts 缺 CMD_SECONDARY');
  assert.deepEqual(JSON.parse(sec[1].replace(/'/g, '"')), ['情報', '移動']);

  assert.match(src, /export const CMD_EXTRA: string\[\] = \[\];/);
  assert.match(src, /武將資料:\s*\{/);
  assert.doesNotMatch(src.match(/export const CMD_META[\s\S]*?\n\};/)?.[0] ?? '', /^\s*物品:/m);
});

test('[F2/F3] Cocos 逐將年令 + 隨軍過濾 + 正月門（舊 F7 逐令月配額已廢除）', () => {
  const src = cocos('CityModel.ts');

  // R21：舊的「主令每項每月一次」整套移除（那是對 F7 的誤讀）
  assert.doesNotMatch(src, /export function cmdOrderUsed/);
  assert.doesNotMatch(src, /export function markCmdOrder/);
  assert.doesNotMatch(src, /export function ordersUsedCount/);
  assert.doesNotMatch(src, /export function clearCmdOrders/);
  assert.doesNotMatch(src, /save\.cmdOrders/);

  // F2 逐將年令：save.acted[將] = 年序，一年一次／將
  const year = fnBody(src, 'yearIndexOf');
  assert.match(year, /Math\.floor\(\(intOr\(save && save\.month, 1, 1\) - 1\) \/ 12\) \+ 1;/);
  const locked = fnBody(src, 'actedLocked');
  assert.match(locked, /yearIndexOf\(save\)/);
  const mark = fnBody(src, 'markActed');
  assert.match(mark, /if \(actedLocked\(save, name\)\) return false;/);
  assert.match(mark, /\(save\.acted as Record<string, number>\)\[name\] = yearIndexOf\(save\);/);

  // ensureExtras 每次讀檔規範化 acted / away（不再清逐令配額；泛型簽名所以直接看源碼字串）
  assert.match(src, /save\.acted = acted;/);
  assert.match(src, /save\.away = away;/);
  assert.doesNotMatch(src, /clearCmdOrders\(save\)/);

  // F3 隨軍：awayNameSet 讀 save.away ∪ save.armies 我方(side 'A')；syncAway 按部隊重建
  const away = fnBody(src, 'awayNameSet');
  assert.match(away, /save\.away/);
  assert.match(away, /armyGeneralNames\(army\)/);
  assert.match(fnBody(src, 'armyGeneralNames'), /army\.side !== 'A'/);
  // syncAway 是泛型簽名（fnBody 抓不到），直接看源碼字串（全檔唯一）
  assert.match(src, /save\.away = next;/);

  // 正月門：非正月只讀（web city.html:543-549 的 readOnly 口徑）
  const ro = fnBody(src, 'readOnly');
  assert.match(ro, /if \(!isAffairsMonth\(save\)\) return true;/);
  const affairs = fnBody(src, 'isAffairsMonth');
  assert.match(affairs, /% 12\) \+ 1 === 1/);

  // rosterOf 用 away 過濾隨軍將
  assert.match(fnBody(src, 'rosterOf'), /awayNameSet\(save\)/);
});

test('[F7] Cocos CityPanel：九宮 = 7 主令 + 2 副令、正月門 + 逐將年令、情報不吃年令', () => {
  const src = cocos('CityPanel.ts');

  // cmdList 拼接 SECONDARY
  assert.match(src, /return \(\[\] as string\[\]\)\.concat\(M\.CMD_ORDER, M\.CMD_SECONDARY\);/);

  // 閘門：正月門 + 內政窗口收束（不再逐令月配額）
  const run = fnBody(src, 'runCommand');
  assert.match(run, /M\.readOnly\(save, false\)/);
  assert.match(run, /M\.OFF_MONTH_HINT/);
  assert.doesNotMatch(run, /M\.cmdOrderUsed\(/);
  assert.match(run, /case '武將資料':/);
  assert.doesNotMatch(run, /case '物品':/);

  // 情報是副令：不選將、不吃年令
  const intel = fnBody(src, 'cmdIntel');
  assert.doesNotMatch(intel, /this\.actedBy\(|this\.consume\(\)/);

  // 移動/任命不吃年令（web：移動是副令、任命免費）
  assert.doesNotMatch(fnBody(src, 'moveTo'), /this\.actedBy\(|this\.acted\(\)/);
  assert.doesNotMatch(fnBody(src, 'appointTo'), /this\.actedBy\(|this\.acted\(\)/);

  // 開發/搜索要選執行將、鎖該將今年年令（web pickExec → afterCommand(true, execName)）
  assert.match(src, /this\.pickExec\('開發', \(name\) => this\.developBy\(name\)\);/);
  assert.match(src, /this\.pickExec\('搜索', \(name\) => this\.searchBy\(name\)\);/);
  assert.match(fnBody(src, 'developBy'), /this\.actedBy\(name\)/);
  assert.match(fnBody(src, 'searchBy'), /this\.actedBy\(name\)/);

  // HUD 顯示「年令 n / 城內將數」（不再是月令 n/7）
  assert.match(src, /\['年令', `\$\{actedNow\} \/ \$\{roster\.length\}`/);
  assert.match(src, /const actedNow = M\.actedNames\(save\)\.length;/);
});

/* ======================================================================
 * F10 自治施行：代行搜索只出人才日誌、不耗月令
 * ==================================================================== */

test('[F10] Cocos runAutonomy 先跑免費安靜搜索，只記人才', () => {
  const src = cocos('CityModel.ts');
  const run = fnBody(src, 'runAutonomy');
  assert.match(run, /search\(save, def, Object\.assign\(\{\}, ctx \?\? \{\}, \{ quiet: true, free: true \}\)\)/);
  assert.match(run, /found\.kind === 'talent'/);
  assert.match(run, /自治搜索：\$\{found\.general\.NAME\}加入我方。/);

  // 搜索本身：free 不扣錢、quiet 不寫普通日誌
  const search = fnBody(src, 'search');
  assert.match(search, /const free = ctx\?\.free === true;/);
  assert.match(search, /if \(!free && cityMoneyOf\(save, cityDef\) < SEARCH\.COST\)/);
  assert.match(search, /if \(!free\) spendCityMoney\(save, cityDef, SEARCH\.COST\);/);
  assert.match(search, /if \(!quiet\) \{/);

  // 自治的退款落回本城 money（F16）
  assert.match(run, /addCityMoney\(save, def, r\.cost as number\)/);
});

/* ======================================================================
 * F16 國庫 = Σ 每城 money（舊存檔一次性遷移）
 * ==================================================================== */

test('[F16] Cocos GameState：讀檔即遷移舊錢包 → 主城 money，之後國庫 = Σ 每城', () => {
  const src = cocos('GameState.ts');

  const load = fnBody(src, 'loadSave');
  assert.match(load, /migrateGoldInPlace\(cached\)/);

  const mig = fnBody(src, 'migrateGoldInPlace');
  assert.match(mig, /if \(!save \|\| save\.goldMigrated === true\) return \{ moved: 0, to: '' \};/);
  assert.match(mig, /st\.money = Math\.max\(0, Math\.floor\(Number\(st\.money\) \|\| 0\)\) \+ wallet;/);
  assert.match(mig, /save\.gold = 0;/);
  assert.match(mig, /save\.goldMigrated = true;/);

  const nat = fnBody(src, 'nationalGold');
  assert.match(nat, /for \(const name of save\.owned\) total \+= cityMoney\(name\);/);

  const spend = fnBody(src, 'spendCityMoney');
  assert.match(spend, /if \(have < need\) return false;/);
  assert.match(spend, /st\.money = have - need;/);

  // 年稅不再進單一錢包（註解裡有舊碼字串，先去掉行註解再比）
  const advanceCode = fnBody(src, 'advanceMonth').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(advanceCode, /save\.gold \+= income;/);
  // 徵兵/開發扣本城 money
  assert.match(fnBody(src, 'recruit'), /state\.money = own - 500;/);
  assert.match(fnBody(src, 'develop'), /state\.money = own - 400;/);
});

test('[F16] Cocos CityPanel/CampaignRoot：存檔往返保住遷移標記，UI 讀國庫', () => {
  const panel = cocos('CityPanel.ts');
  assert.match(fnBody(panel, 'mergeSave'), /goldMigrated: gs\.goldMigrated === true,/);
  assert.match(fnBody(panel, 'persist'), /gs\.gold = 0;\s*\n\s*gs\.goldMigrated = true;/);
  assert.match(panel, /\[['"]金['"], fmt\(GameState\.nationalGold\(\)\), COLORS\.goldLight\]/);
  // [P1-2] searchSeq 跨屏保存（舊 cmdOrders 逐令配額已廢除）
  assert.match(panel, /searchSeq: save\.searchSeq/);
  assert.match(panel, /searchSeq: isRecord\(extras\.searchSeq\)/);

  const campaign = cocos('CampaignRoot.ts');
  assert.match(campaign, /國庫 \$\{GameState\.nationalGold\(\)\} 金/);
  assert.match(campaign, /gold: GameState\.nationalGold\(\),/);
  assert.doesNotMatch(campaign, /this\.save\.gold >= 500/);
});

/* ======================================================================
 * F19 武將上限 10：顯示 13/10 標紅、不裁切
 * ==================================================================== */

test('[F19] Cocos 武將上限 10，只標紅不裁切', () => {
  const model = cocos('CityModel.ts');
  assert.match(model, /export const CITY_OFFICER_CAP = 10;/);
  const cap = fnBody(model, 'officerCapState');
  assert.match(cap, /over: n > CITY_OFFICER_CAP/);

  // 真的執行源碼的 officerCapState()（num / CITY_OFFICER_CAP 由 inject 補）
  const capOf = evalFn(model, 'officerCapState', {
    num: (v: unknown) => Number(v),
    CITY_OFFICER_CAP: 10,
  }) as (n: unknown) => { n: number; cap: number; over: boolean };
  assert.deepEqual(capOf(9), { n: 9, cap: 10, over: false });
  assert.deepEqual(capOf(10), { n: 10, cap: 10, over: false });
  assert.deepEqual(capOf(13), { n: 13, cap: 10, over: true });
  assert.deepEqual(capOf(-2), { n: 0, cap: 10, over: false });

  const panel = cocos('CityPanel.ts');
  assert.match(panel, /const officer = M\.officerCapState\(roster\.length\);/);
  assert.match(panel, /\['武將', `\$\{officer\.n\} \/ \$\{officer\.cap\}`, officer\.over \? COLORS\.danger : COLORS\.text\]/);
  // 不准裁切：HUD 不能再出現「只顯示前 10 名」這種 slice
  assert.doesNotMatch(panel, /roster\.slice\(0, M\.CITY_OFFICER_CAP\)/);
});

/* ======================================================================
 * F28 城旗：Cocos 大地圖畫「城點」沒有城旗
 * ==================================================================== */

test('[F28] Cocos 無城旗（不適用）；勢力色板已在 MonarchModel', () => {
  const campaign = cocos('CampaignRoot.ts');
  assert.doesNotMatch(campaign, /cityFlag\s*\(/);
  assert.doesNotMatch(campaign, /\bFLAGS\b/);
  // 大地圖的城是用勢力色上色的圓點
  assert.match(campaign, /cityTintOf/);
  const monarch = cocos('MonarchModel.ts');
  assert.match(monarch, /FORCE_/);
});
