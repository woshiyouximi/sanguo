// @ts-nocheck
// 理由：本測試直接驅動 web/city_model.js、web/saves.js（瀏覽器端無型別 ESM，tsconfig 沒有 allowJs），
// 並對 web/campaign.html 做靜態結構斷言。型別嚴格檢查留給 src/**（tsc --noEmit 其餘檔案必須 0 錯）。
/**
 * rows85.test.ts — R85 收口：網頁側八行黃燈（R5/R6/R9/R11/R13/R15/R20/R57）＋ P0 死檔回歸
 *
 * 跑法：  cd game && node --test tests/rows85.test.ts
 *
 * 為什麼有這支：這八行原本是「自訂 / 未定位」，本檔把每一行的**裁決**釘成可執行斷言：
 *   R5  月內倒計時／年度進位 —— 原作只有「計時器驅動換月＋月內狀態標誌」，無回合內多日 ⇒ 特徵對齊＝不做
 *   R6  城規模 RATE 1..5 —— 全 EXE 無 `+0x6C` 寫入點、唯一用途是 5 行完全相同的權重表 ⇒ 特徵對齊＝不做
 *   R9  開發增量 —— 0x427A84（人口）/0x427947（防禦）的真公式：rand()%mod + 執行武將能力×係數，再過太守智力縮放
 *   R11 搜索順序  —— 0x426D8C 兩段式：先擲武將（50），武將成功即返回；否則物品輪盤兜底
 *   R13 三命令    —— campaign.html 補「武將資料」「內政終了」入口（勢力地圖抽屜原本就有）＋ `?cmd=` 入口
 *   R15 金錢公式  —— 年度稅收 0x423824：每城 floor(pop*75/10000)+2250；無俸祿、無月度複利
 *   R20 搜索隨機  —— 真隨機 nonce（頁面注入）＋ setRng/setSearchNonce 可控入口；同 nonce 仍可完全復現
 *   R57 戰鬥不掉寶 —— 勝方無條件擲掉落輪盤在原作是**負證據**；本檔釘住 web 側「結算後背包件數不變」
 *   R86 P0 死檔   —— 模組層呼叫不得讀到後文 let/const（`surState` TDZ 崩在模組求值期 → 整頁死）
 *
 * 斷言都能「改壞→紅」：每條在報告 `project\108_黃燈九行收口.md` 有對應的手工變異記錄。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Saves from '../web/saves.js';
import * as M from '../web/city_model.js';

const readText = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const readJson = (rel) => JSON.parse(readText(rel));

// 變異驗證用後門：ROWS85_CAMPAIGN=<path> 可把「被審計的 campaign.html」指向別的檔案
// （例：work/rows85/prefix_campaign.html = 把 TDZ 那行插回去的壞檔），正常跑不設這個變數。
const CAMPAIGN = process.env.ROWS85_CAMPAIGN
  ? readFileSync(process.env.ROWS85_CAMPAIGN, 'utf8')
  : readText('../web/campaign.html');
// [F-03/F-14] 「一個月的推進」已收進 core 單源 src/core/advance_month.ts（網頁 campaign.html
// 的 advanceMonth 只留 UI 適配、Cocos GameState.advanceMonth 也調同一支）；R5/R15 的
// 「換月 / 年稅」斷言改掃 core 那份實作 —— 兩端共用同一份公式才是這幾條的本意。
const CORE_MONTH = readText('../src/core/advance_month.ts');

const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');
const ITEMS = readJson('../data/items.json');
const WISES = readJson('../data/wises.json');

const S0 = SCEN[0];
const ctx = () => ({ generals: GENS, scenario: S0, scenIdx: 0, items: ITEMS, wises: WISES });
const cdef = (n) => S0.cities.find((c) => c.NAME === n);
function fresh() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  return save;
}
/** 把 rng 注入成一串固定數（尾端重複最後一個），用完自動還原成真隨機 */
function withRng(values, fn) {
  let i = 0;
  const seq = values.slice();
  M.setRng(() => (i < seq.length ? seq[i++] : seq[seq.length - 1]));
  try {
    return fn(() => i);
  } finally {
    M.setRng(null);
  }
}

// ─────────────────────────────────────────────────────────────
// 靜態解析小工具（只認行首 0 縮進的宣告＝模組層）
// ─────────────────────────────────────────────────────────────
const LINES = CAMPAIGN.split(/\r?\n/);
const lineOf = (re) => {
  for (let i = 0; i < LINES.length; i++) if (re.test(LINES[i])) return i + 1;
  return -1;
};

/** 取模組層 `function name(...)` 的 body（大括號配平；找不到回 null） */
function fnBody(src, name) {
  const lines = src.split(/\r?\n/);
  const head = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`);
  for (let i = 0; i < lines.length; i++) {
    if (!head.test(lines[i])) continue;
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth === 0 && j > i) return lines.slice(i, j + 1).join('\n');
      if (depth === 0 && j === i && /\}\s*$/.test(lines[j])) return lines[i];
    }
  }
  return null;
}

/**
 * R86/P0 的 TDZ 審計（原型：work/rows85/tdz_audit.mjs）。
 *
 * 為什麼要它：`if (gameStarted && boot.battle) settleBattleReturn();` 原本寫在 :1185（模組層），
 * 它經 openSurrenderSheet() 讀到 `let surState`（宣告在檔尾）→ 模組求值期 TDZ →
 * 本檔後面全部不執行 → 死頁；而且崩在 autosave 之前，槽快照永遠舊 ⇒ boot.battle 永遠 true。
 *
 * 演算法：①行首 0 縮進的 let/const/var 記「後文宣告」；②行首 0 縮進的 function body；
 * ③行首無縮進的行上，**全行**掃 `名(`（原 bug 行以 `if (` 開頭，只看行首識別字會漏）；
 * ④對每個呼叫做 BFS（深度 ≤3）：callee body 出現「宣告行 > 呼叫行」的名字 ⇒ 一條 hit。
 */
function tdzHits(src) {
  const lines = src.split(/\r?\n/);
  const late = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
    if (m) late.set(m[1], i + 1);
  }
  const bodies = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
    if (!m) continue;
    let depth = 0;
    let end = i;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth === 0 && j > i) {
        end = j;
        break;
      }
    }
    bodies.set(m[1], lines.slice(i, end + 1).join('\n'));
  }
  const calls = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || /^\s/.test(line)) continue;
    if (/^(?:function|class|import|export|\/\/|\/\*|\*)/.test(line)) continue;
    for (const m of line.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (bodies.has(m[1])) calls.push({ name: m[1], line: i + 1 });
    }
  }
  const hits = [];
  for (const c of calls) {
    const seen = new Set([c.name]);
    let queue = [c.name];
    let depth = 0;
    while (queue.length && depth < 3) {
      const level = queue.splice(0, queue.length);
      const next = [];
      for (const fn of level) {
        const body = bodies.get(fn);
        if (!body) continue;
        for (const [nm, ln] of late) {
          if (ln <= c.line) continue;
          if (new RegExp(`(^|[^\\w$.])${nm.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(body)) {
            hits.push({ callSite: c.line, via: fn, lateRef: nm, lateLine: ln });
          }
        }
        for (const m of body.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
          if (bodies.has(m[2]) && !seen.has(m[2])) {
            seen.add(m[2]);
            next.push(m[2]);
          }
        }
      }
      queue = queue.concat(next);
      depth++;
    }
  }
  return hits;
}

// ─────────────────────────────────────────────────────────────
// R86 / P0：模組層 TDZ（打完仗回大地圖 → 死頁）
// ─────────────────────────────────────────────────────────────
test('R86/P0：模組層呼叫不得引用後文 let/const（surState 死檔）', () => {
  const hits = tdzHits(CAMPAIGN);
  const brief = hits.map((h) => `:${h.callSite} → ${h.via}() 讀 ${h.lateRef}(:${h.lateLine})`);
  assert.deepEqual(brief, [], '模組求值期就呼叫、卻讀到後文 let ⇒ TDZ 崩在初始化，整頁死');
});

test('R86/P0：settleBattleReturn 的每個呼叫點都在 surState 宣告之後', () => {
  const surLine = lineOf(/^let\s+surState\b/);
  assert.ok(surLine > 0, 'surState 必須是模組層 let（招降面板狀態）');
  const calls = [];
  LINES.forEach((ln, i) => {
    if (/^\s*\/\//.test(ln)) return;
    if (/^(?:export\s+)?(?:async\s+)?function\s+settleBattleReturn\s*\(/.test(ln)) return;
    if (/\bsettleBattleReturn\s*\(/.test(ln)) calls.push(i + 1);
  });
  assert.ok(calls.length > 0, 'settleBattleReturn 必須有呼叫點（回大地圖結算）');
  for (const c of calls) assert.ok(c > surLine, `:${c} 呼叫 settleBattleReturn 早於 surState 宣告(:${surLine}) ⇒ TDZ`);
});

test('R86/P0：view 只在檔頭宣告一次，且在 resizeCanvas / fit 之前', () => {
  const decls = [];
  LINES.forEach((ln, i) => {
    if (/^(?:let|const|var)\s+view\b/.test(ln)) decls.push(i + 1);
  });
  assert.equal(decls.length, 1, `view 只能宣告一次（重複宣告＝SyntaxError）；實測 :${decls.join(',')}`);
  const resizeLine = lineOf(/^function resizeCanvas\s*\(/);
  const fitLine = lineOf(/^function fit\s*\(/);
  assert.ok(resizeLine > 0 && fitLine > 0, 'resizeCanvas / fit 必須存在');
  assert.ok(decls[0] < resizeLine, `view(:${decls[0]}) 必須早於 resizeCanvas(:${resizeLine})`);
  assert.ok(decls[0] < fitLine, `view(:${decls[0]}) 必須早於 fit(:${fitLine})`);
  // 早期 resize（DOMContentLoaded 前就可能觸發）要先擋住未初始化的 view
  assert.match(fnBody(CAMPAIGN, 'resizeCanvas'), /if \(!cv \|\| !view\) return;/, 'resizeCanvas 少了 view 守衛');
  assert.match(fnBody(CAMPAIGN, 'fit'), /if \(!stage\) return;/, 'fit 少了 stage 守衛');
});

// ─────────────────────────────────────────────────────────────
// R5：月內倒計時／年度進位 — 原作只有「計時器驅動換月＋月內狀態標誌」⇒ 特徵對齊＝不做
// 依據：0x4C30E0 全文 8 處引用（讀/寫都在換月流水線 0x41B690 與「日期」掃格顯示 0x41B84E）；
//       歸零 → [0x4A64FC]=1（年進位）＋ [0x4A64BC]=0（本月下令標誌）＋ 內政時間到提示；
//       玩家側效果 = 一月一次行動，界面只顯示「年」。
// ─────────────────────────────────────────────────────────────
test('R5：換月是一月一步（原作沒有回合內多日），並帶年度進位', () => {
  // [F-03/F-14] 換月 / 年進位已收進 core 單源：頁面 advanceMonth 逐月呼叫 advanceOneMonth()，
  // 換月那三行在 src/core/advance_month.ts 內（Cocos GameState.advanceMonth 也走同一支）。
  const body = fnBody(CAMPAIGN, 'advanceMonth');
  assert.ok(body, 'campaign.html 必須有 advanceMonth');
  assert.match(body, /advanceOneMonth\(save,/, '月流水收進 core 單源（頁面只留 UI）');
  assert.match(CORE_MONTH, /const month = Math\.max\(1, int\(state\.month\) \|\| 1\) \+ 1;/, '一次推進 = 一個月');
  assert.match(CORE_MONTH, /state\.lastActionMonth = 0;/, '換月要清月令鎖（＝原作 [0x4A64BC]=0）');
  assert.match(CORE_MONTH, /const yearStart = isYearStart\(month\);/, '正月要觸發年度進位（＝原作 [0x4A64FC]=1）');
  // 原作沒有「回合內日/小節」計數器，web 也不該冒出這種狀態
  assert.doesNotMatch(CAMPAIGN, /\bsave\.(day|hour|turnStep)\b/, '不應存在回合內日/時序狀態');
});

test('R5：月令鎖就是「本月是否已下令」，換月即解鎖', () => {
  const save = fresh();
  save.month = 13; // 2 年 1 月（isYearStart）
  assert.equal(M.monthLocked(save), false, '新月份未行動 ⇒ 未鎖');
  M.markMonthActed(save);
  assert.equal(M.monthLocked(save), true, '下令後鎖住（＝原作 [0x4A64BC]=1）');
  M.clearMonthLock(save);
  assert.equal(M.monthLocked(save), false, '換月解鎖');
  assert.equal(Saves.isYearStart(13), true, '13 月＝2 年正月 ⇒ 年度進位點');
  assert.equal(Saves.isYearStart(12), false);
});

// ─────────────────────────────────────────────────────────────
// R6：城規模 RATE 1..5 遊戲中不變、無升級 ⇒ 特徵對齊＝不做
// 依據：全 EXE 唯一的字操作是 0x426D95 `movsx ecx, word ptr [eax+0x6c]`（搜索權重表索引），
//       而 0x48a260 的 5 行權重完全相同 ⇒ RATE 對玩法無影響；無 `+0x6C` 寫入點。
// ─────────────────────────────────────────────────────────────
test('R6：RATE 只驅動外觀/索引，不參與任何成長或升級', () => {
  assert.equal(M.hallIndexOf({ RATE: 1, POPULATION: 79500 }), 1);
  assert.equal(M.hallIndexOf({ RATE: 3, POPULATION: 79500 }), 3);
  assert.equal(M.hallIndexOf({ RATE: 5, POPULATION: 79500 }), 5, 'RATE 5 就是 5，不因人口被抬到 6');
  assert.equal(M.hallIndexOf({ RATE: 9, POPULATION: 79500 }), 5, '越界夾到 5');
  // 高人口只影響「城郭等級」外觀（0x406056 由人口重算 +0x44），與 RATE 無關
  assert.equal(M.hallIndexOf({ RATE: 1, POPULATION: 500000 }), 6);
  assert.equal(M.isGate({ RATE: 0, POPULATION: 79500 }), true, 'RATE 0＝關卡');
  assert.equal(M.isGate({ RATE: 3, FLAGS: 1 }), true, 'FLAGS 1＝關卡（+0x9E）');
  assert.equal(M.isGate({ RATE: 3, POPULATION: 79500, FLAGS: 4 }), false);
  // 沒有「城池升級」這種 API（原作沒有 +0x6C 寫入點）
  assert.deepEqual(Object.keys(M).filter((k) => /upgrade|promote|growCity/i.test(k)), []);
  assert.doesNotMatch(CAMPAIGN, /\.RATE\s*=[^=]/, 'campaign.html 不得改寫 RATE');
});

// ─────────────────────────────────────────────────────────────
// R9：開發增量換成原作公式（0x427A84 人口 / 0x427947 防禦 / 0x427B9E 外殼）
// 人口 = rand()%3000 + 執行武將INT*100，再過太守智力縮放 base*(INT-70)*2/300（向零截斷）
// 防禦 = rand()%12  + 執行武將STR*0.4，同一段縮放
// ─────────────────────────────────────────────────────────────
test('R9：開發增量 = 原作隨機區間 + 執行武將能力，經太守智力縮放', () => {
  assert.equal(M.DEV.POP, 3000, 'rand()%0xBB8');
  assert.equal(M.DEV.DEF, 12, 'rand()%0xC');
  assert.equal(M.DEV.POP_CAP, 1000000, '原作人口硬上限 0xF4240');
  assert.equal(M.DEV.DEF_CAP, 999, '原作防禦上限 0x3E7');
  assert.equal(M.DEV_FORMULA.PER_INT, 100, 'INT*1000/10 = INT*100');
  assert.equal(M.DEV_FORMULA.PER_STR, 0.4, 'STR*4/10');
  assert.equal(M.MAJOR_RULE.PIVOT, 70, '太守智力基準 0x46');
  assert.equal(M.MAJOR_RULE.DEN, 300, '2/0x12C');

  // 代縣太守劉焉 INT 78 / STR 42；rng 0.5 → rand()%3000 = 1500、rand()%12 = 6
  const save = fresh();
  save.gold = 100000;
  const d = cdef('代縣');
  assert.equal(d.MAJOR, '劉焉');
  const r = withRng([0.5], () => M.develop(save, d, ctx()));
  // popBase = 1500 + 78*100 = 9300 → 9300 + trunc(9300*8*2/300) = 9300+496 = 9796
  assert.equal(r.pop, 9796, '人口增量必須等於原作公式');
  // defBase = 6 + trunc(42*0.4) = 6+16 = 22 → 22 + trunc(22*8*2/300) = 22+1 = 23
  assert.equal(r.def, 23, '防禦增量必須等於原作公式');
  assert.equal(r.cost, M.DEV.COST, '開發仍記帳一筆成本（原作免費，此處保留收費並在報告登記）');
  assert.equal(r.eff, M.majorFactor(78));
});

test('R9：無太守城沒有能力項，只剩隨機區間（襄平）', () => {
  const save = fresh();
  save.gold = 100000;
  const d = cdef('襄平');
  assert.equal(d.MAJOR, '', '襄平無太守');
  const r = withRng([0.5], () => M.develop(save, d, ctx()));
  // popBase = 1500，intel 0 → 1500 + trunc(1500*(-70)*2/300) = 1500-700 = 800
  assert.equal(r.pop, 800);
  assert.equal(r.def, 4); // 6 + trunc(6*-70*2/300) = 6-2
});

test('R9：飽和、上限夾制與「無事發生」靜默', () => {
  const save = fresh();
  save.gold = 100000;
  const d = cdef('代縣');
  const st = M.ensureCityState(save, d);
  st.pop = M.DEV.POP_CAP - 5;
  const r = withRng([0.5], () => M.develop(save, d, ctx()));
  assert.equal(r.ok, true);
  assert.equal(r.pop, 5, '人口夾在原作硬上限 1,000,000');
  st.pop = M.DEV.POP_CAP;
  st.def = M.DEV.DEF_CAP;
  assert.equal(M.develop(save, d, ctx()).reason, 'saturated');

  // rng=0 且無執行武將 ⇒ 人口/防禦都是 0 ⇒ 原作外殼 0x427B9E 靜默（不扣金）
  const save2 = fresh();
  save2.gold = 100000;
  const gold0 = save2.gold;
  const r2 = withRng([0], () => M.develop(save2, cdef('襄平'), ctx()));
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'nothing');
  assert.equal(save2.gold, gold0, '什麼都沒發生就不扣金');
});

// ─────────────────────────────────────────────────────────────
// R11：搜索兩段式（0x426D8C）—— 先擲武將 50%，武將成功即返回；否則物品輪盤兜底
// 權重表 0x48a260 的 RATE 1..5 五行相同：(50,30,20,33,66)，只有「武將 vs 物品」這一刀有用
// ─────────────────────────────────────────────────────────────
test('R11：搜索先擲武將（50%），中了就不擲物品', () => {
  assert.deepEqual(M.SEARCH.STAGE1, { talent: 50, item: 50 }, '原作 0x48a260 前三格 50/30/20 ⇒ 只分「武將 / 物品」');
  const save = fresh();
  save.gold = 100000;
  save.month = 5;
  const d = cdef('襄平');
  assert.ok(M.wildPool(save, d.NAME, ctx()).length > 0, '襄平要有在野武將可招（否則本條測不到第一段）');

  // 搜索自己用 mulberry32(hash(nonce,city,month,count))，所以用 nonce 挑「第一顆骰子」的落點。
  const rolls = [];
  for (let nonce = 1; nonce <= 200; nonce++) {
    rolls.push({ nonce, first: M.mulberry32(M.searchSeed('襄平', 5, 0, nonce))() });
  }
  // 關鍵區間 [0.30, 0.50)：舊的四選一口徑在這裡抽不到武將（talent 只佔 30），新兩段式必中武將。
  const mid = rolls.find((r) => r.first >= 0.3 && r.first < 0.5);
  assert.ok(mid, '需要一個第一骰落在 [0.3,0.5) 的 nonce 才能區分新舊口徑');

  const s1 = fresh();
  s1.gold = 100000;
  s1.month = 5;
  M.setSearchNonce(s1, mid.nonce);
  const r = M.search(s1, d, ctx());
  assert.equal(r.stage, 'talent', `第一骰 ${mid.first.toFixed(3)} < 0.5 ⇒ 必走武將段`);
  assert.equal(r.kind, 'talent');
  assert.match(r.text, /將軍加入我方。$/);
  assert.ok(
    M.rosterOf(s1, '襄平', ctx()).some((g) => g.NAME === r.general.NAME),
    '武將要真的入列',
  );

  const hi = rolls.find((r) => r.first >= 0.5);
  assert.ok(hi);
  const s2 = fresh();
  s2.gold = 100000;
  s2.month = 5;
  M.setSearchNonce(s2, hi.nonce);
  const r2 = M.search(s2, d, ctx());
  assert.equal(r2.stage, 'item', `第一骰 ${hi.first.toFixed(3)} ≥ 0.5 ⇒ 落物品輪盤`);
  assert.notEqual(r2.kind, 'talent', '物品段不可能再給武將（兩段互斥）');
});

test('R11：武將段沒中才落物品輪盤 —— 40 個 nonce 逐一對齊第一骰', () => {
  const d = cdef('襄平');
  let talent = 0;
  let item = 0;
  for (let nonce = 1; nonce <= 40; nonce++) {
    const save = fresh();
    save.gold = 100000;
    save.month = 5;
    M.setSearchNonce(save, nonce);
    const first = M.mulberry32(M.searchSeed('襄平', 5, 0, nonce))();
    const r = M.search(save, d, ctx());
    const want = first < 0.5 ? 'talent' : 'item';
    assert.equal(r.stage, want, `nonce=${nonce} 第一骰 ${first.toFixed(3)} ⇒ 應走 ${want}`);
    assert.ok(['talent', 'treasure', 'talisman', 'none'].includes(r.kind));
    if (r.kind === 'talent') {
      talent++;
      assert.match(r.text, /將軍加入我方。$/);
    } else {
      item++;
      assert.doesNotMatch(r.text, /將軍加入我方/);
    }
  }
  assert.ok(talent > 0 && item > 0, `兩段都要被走到過（實測 talent=${talent} item=${item}）`);
});

test('R11：在野池空時短路（不消耗第一段那顆骰子，結果與舊口徑一致）', () => {
  const save = fresh();
  save.gold = 100000;
  save.month = 5;
  const d = cdef('襄平');
  const empty = { ...ctx(), generals: [] };
  assert.equal(M.wildPool(save, '襄平', empty).length, 0);
  let talent = 0;
  for (let nonce = 1; nonce <= 40; nonce++) {
    const s = fresh();
    s.gold = 100000;
    s.month = 5;
    M.setSearchNonce(s, nonce);
    const r = M.search(s, d, empty);
    assert.equal(r.stage, 'item', '沒有在野武將 ⇒ 必落物品段');
    if (r.kind === 'talent') talent++;
  }
  assert.equal(talent, 0, '池空不可能招到武將');
});

// ─────────────────────────────────────────────────────────────
// R20：搜索隨機不可復現（原作 rand()）—— 頁面注入真隨機 nonce，測試用可控入口釘死
// ─────────────────────────────────────────────────────────────
test('R20：種子由 nonce 參與 —— 換 nonce 就換結果，同 nonce 完全可復現', () => {
  assert.notEqual(M.searchSeed('襄平', 5, 0, 1), M.searchSeed('襄平', 5, 0, 2));
  assert.equal(M.searchSeed('襄平', 5, 0, 7), M.searchSeed('襄平', 5, 0, 7));

  const mk = (nonce) => {
    const s = fresh();
    s.gold = 100000;
    s.month = 5;
    if (nonce != null) M.setSearchNonce(s, nonce);
    return s;
  };
  const a = mk(42);
  const b = mk(42);
  const ra = withRng([0.9, 0.9], () => M.search(a, cdef('襄平'), ctx()));
  const rb = withRng([0.9, 0.9], () => M.search(b, cdef('襄平'), ctx()));
  assert.equal(ra.seed, rb.seed, '同 nonce 同 (city,month,count) ⇒ 同種子（測試可復現）');
  assert.equal(ra.text, rb.text);

  // nonce 跟著存檔走（可列舉，city.html 讀同一份存檔就吃得到）
  const s3 = mk(null);
  assert.equal(M.searchNonce(s3), 0, '缺省 0：純函式與舊測試完全可重現');
  assert.equal(M.setSearchNonce(s3, 123456), 123456);
  assert.equal(JSON.parse(JSON.stringify(s3)).searchNonce, 123456, 'nonce 必須進得了存檔 JSON');
});

test('R20：setRng 可注入、randomNonce 是真隨機且 32 位', () => {
  const save = fresh();
  save.gold = 100000;
  const d = cdef('襄平');
  save.month = 5;
  const lo = withRng([0.1], () => M.develop(save, d, ctx()));
  const save2 = fresh();
  save2.gold = 100000;
  const hi = withRng([0.9], () => M.develop(save2, d, ctx()));
  assert.notEqual(lo.pop, hi.pop, 'setRng 必須真的改變抽樣（否則 R9/R11 的釘值都假的）');

  const n1 = M.randomNonce();
  const n2 = M.randomNonce();
  for (const n of [n1, n2]) {
    assert.equal(Number.isInteger(n), true);
    assert.ok(n >= 0 && n <= 0xffffffff, `nonce 必須是 32 位無號整數，實測 ${n}`);
  }
  assert.notEqual(n1, n2, '連續兩個 nonce 不該相同（2^-32 幻覺級）');
});

// ─────────────────────────────────────────────────────────────
// R15：金錢產出＝年度稅收 0x423824（每城 pop×75/10000 + 2250）；無月稅、無複利、無俸祿
// ─────────────────────────────────────────────────────────────
test('R15：年度稅收公式 = (人口×75)/10000 + 2250', () => {
  assert.deepEqual(M.TAX, { POP_NUM: 75, POP_DEN: 10000, FLAT: 2250 }, '原作 0x4B / 0x2710 / 0x8CA');
  assert.equal(M.annualTax(0), 2250, '空城也給固定額（原作先加 0x8CA 再算人口項）');
  assert.equal(M.annualTax(79500), 2250 + 596, '79500×75/10000 = 596.25 → 向下取整 596');
  assert.equal(M.annualTax(133333), 2250 + 999, '133333×75 = 9999975 → 999（整數除法）');
  assert.equal(M.annualTax(-5), 2250, '負人口不倒扣');
});

test('R15：換月不再發月稅、不再收俸祿（原作兩個寫點都不存在）', () => {
  // [F-03/F-14] 年稅 / 帳本已收進 core 單源 src/core/advance_month.ts；頁面 advanceMonth 不再自算，
  // 所以公式斷言改掃 core。舊的自訂公式（月度複利 / 俸祿 / 人口自然增長）兩邊都不許回來。
  const body = fnBody(CAMPAIGN, 'advanceMonth');
  assert.match(CORE_MONTH, /annualTax\(city\.pop\)/, '歲入要走 annualTax（純函式，可測）');
  assert.match(CORE_MONTH, /const yearStart = isYearStart\(month\);/, '稅收只在正月');
  assert.match(CORE_MONTH, /!isGateDef\(def\)/, '關卡不徵稅（原作跳過 0x405499 為真的城）');
  assert.doesNotMatch(body, /\* 1\.01\) \+ 20/, '月度複利 money*1.01+20 必須刪掉');
  assert.doesNotMatch(body, /officers \* 3/, '俸祿（武將數×3）必須刪掉：原作沒有任何俸祿寫點');
  assert.doesNotMatch(body, /Math\.floor\(st\.pop \/ 5000\) \* 4/, '舊的 Σ floor(pop/5000)*4 必須刪掉');
  // 人口寫點清單：原作 .text 沒有「每城每月 +N%」這種自然增長（04c §7-4 明寫未定位），
  // 人口只由「開發」與兩處衰減事件（0x40F607 / 0x40F727，觸發語義 [推測]）改變。
  // 早先的 `st.pop = Math.floor(st.pop * 1.01)` 是自訂近似（六十個月會吹到 1.8 倍），已於 R170 移除。
  assert.doesNotMatch(body, /st\.pop \* 1\.01/, '人口自然增長 1%/月 是自訂近似，必須刪掉（project\\31 §一之補13）');
  assert.doesNotMatch(CORE_MONTH, /\* 1\.01\) \+ 20|officers \* 3|st\.pop \* 1\.01/, 'core 也不得帶回舊自訂公式');
});

// ─────────────────────────────────────────────────────────────
// R13：內政三命令（武將資料 / 勢力地圖 / 內政終了）
// 原作 0x48B228 / 0x48B434 / 0x48B420；city.html 邊界外不改，故在 campaign.html 補入口。
// ─────────────────────────────────────────────────────────────
test('R13：三條命令都有入口（武將資料 / 勢力地圖 / 內政終了）', () => {
  for (const id of ['btnGenerals', 'btnForces', 'btnEndMonth']) {
    assert.match(CAMPAIGN, new RegExp(`id="${id}"`), `頁頭缺少 #${id}`);
  }
  // 三個按鈕的文字就是原作那三條命令（04c §2.3）
  assert.match(CAMPAIGN, /id="btnGenerals"[^>]*>武將資料</);
  assert.match(CAMPAIGN, /id="btnForces"[^>]*>勢力地圖</);
  assert.match(CAMPAIGN, /id="btnEndMonth"[^>]*>內政終了</);
  // 武將資料浮層
  assert.match(CAMPAIGN, /id="generalSheet"/);
  assert.match(CAMPAIGN, /id="genRows"/);
  assert.match(CAMPAIGN, /function openGeneralSheet\(\)/, '缺 openGeneralSheet');
  assert.match(CAMPAIGN, /function renderGeneralSheet\(\)/, '缺 renderGeneralSheet');
  assert.match(CAMPAIGN, /function generalRowsAll\(\)/, '缺 generalRowsAll（全勢力武將表）');
  // 內政終了 = 只把 T 重設 3600、回大地圖（原作 0x427FE0 → 0x41BBF5；不推進月份）
  assert.match(CAMPAIGN, /function endMonth\(\)/);
  const endMonthBody = fnBody(CAMPAIGN, 'endMonth');
  assert.match(endMonthBody, /clockT = CLOCK_TICKS_PER_YEAR;/, '內政終了要把 T 重設 3600');
  assert.doesNotMatch(endMonthBody, /advanceMonth\(/, '內政終了不得推進月份（原作 0x41BBF5）');
  // 接線
  assert.match(CAMPAIGN, /\$\('btnGenerals'\)\.addEventListener\('click'/, 'btnGenerals 沒接線');
  assert.match(CAMPAIGN, /\$\('btnEndMonth'\)\.addEventListener\('click'/, 'btnEndMonth 沒接線');
  // 深鏈入口（city.html 的返回按鈕不帶參數，故另留 ?cmd=）
  assert.match(CAMPAIGN, /qs\.get\('cmd'\)/, '缺 ?cmd= 入口');
  assert.match(CAMPAIGN, /bootCmd === 'general'/, '?cmd=general 沒接');
  assert.match(CAMPAIGN, /bootCmd === 'endmonth'/, '?cmd=endmonth 沒接');
});

test('R13：內政終了 = 本月已下令（月令鎖住、再點只提示）', () => {
  const save = fresh();
  save.month = 5;
  assert.equal(M.monthLocked(save), false);
  M.markMonthActed(save);
  assert.equal(M.monthLocked(save), true, '收束後本月不能再下令');
  M.markMonthActed(save);
  assert.equal(M.monthLocked(save), true, '重複收束不改變狀態');
  assert.equal(M.LOCK_HINT, '本月已行動');
});

// ─────────────────────────────────────────────────────────────
// R86 發佈衛生：調試口 gate（project/115_发布卫生.md §6）
// ─────────────────────────────────────────────────────────────
test('R86：調試查詢鍵在非 dev 模式被剔除（devflags.js 先於 module 載入）', () => {
  const iFlag = CAMPAIGN.indexOf('<script src="./devflags.js"></script>');
  const iMod = CAMPAIGN.indexOf('<script type="module">');
  assert.ok(iFlag > 0, '必須載入 devflags.js（它只掛 window.SGDev）');
  assert.ok(iMod > iFlag, 'devflags.js 必須在 module 之前載入，否則 SGDev 還是 undefined');
  assert.match(CAMPAIGN, /function gateQuery\(raw\)/, '缺 gateQuery');
  assert.match(CAMPAIGN, /const qs = gateQuery\(new URLSearchParams\(location\.search\)\)/,
    '所有讀取點都走同一個已過濾的 qs');
  for (const k of ['demo', 'panel', 'probe', 'adv', 'saves', 'sur', 'unlimited', 'seed',
    'level', 'sel', 'bg', 'routes', 'kinds', 'maxacts', 'auto', 'forceatk', 'read', 'pick',
    'force', 'marchdemo', 'v1check', 'marchdbg', 'aidbg']) {
    assert.ok(new RegExp(`'${k}'`).test(fnBody(CAMPAIGN, 'gateQuery') + CAMPAIGN.slice(
      CAMPAIGN.indexOf('const DEV_QUERY_KEYS'), CAMPAIGN.indexOf('const DEV_FLAG'))),
    `DEV_QUERY_KEYS 漏了 ${k}`);
  }
  // 頁面之間的協議鍵不能被 gate 掉
  const list = CAMPAIGN.slice(CAMPAIGN.indexOf('const DEV_QUERY_KEYS'), CAMPAIGN.indexOf('const DEV_FLAG'));
  for (const keep of ['city', 'from', 'lv', 'bsoldiers']) {
    assert.ok(!new RegExp(`'${keep}'`).test(list), `協議鍵 ${keep} 不該被剔掉`);
  }
});

// ─────────────────────────────────────────────────────────────
// R57：戰鬥不掉落任何物品（原作負證據 04b2 §5.1）
// 缺陷本體在 game/src/core/capture.ts:452（勝方無條件擲一次掉落輪盤），**不在本 agent 的可寫集**。
// 本檔只釘住 web 側能被觀察到的部分：結算出的 drops 沒有任何消費者、背包件數不會因戰鬥改變。
// ─────────────────────────────────────────────────────────────
test('R57：戰鬥掉落沒有任何下游消費者（背包不因戰鬥改變）', () => {
  const CITY_MODEL = readText('../web/city_model.js');
  // campaign.html 只有一處提到 drops，是「遷移時不要吃掉 main.js 的鍵」的註釋，不是消費
  assert.doesNotMatch(CAMPAIGN, /save\.drops\s*=/, 'campaign.html 不得寫 save.drops');
  const live = LINES.map((t, i) => [i + 1, t]).filter(([, t]) => /\bdrops\b/.test(t)
    && !/^\s*(\*|\/\/|\/\*)/.test(t));
  assert.deepEqual(live, [], 'campaign.html 對 drops 只能有註釋，不能有可執行引用');
  assert.doesNotMatch(CITY_MODEL, /drops/, 'city_model.js 不該知道 drops');
  assert.doesNotMatch(CAMPAIGN, /withBagItem\s*\(/, 'campaign.html 不得直接把東西塞進背包（背包只由 items.html 寫）');
  // city_model 只提供 withBagItem 這個純函式（items.html 用），自己不呼叫
  const bagCalls = CITY_MODEL.split('\n').map((t, i) => [i + 1, t])
    .filter(([, t]) => /withBagItem\s*\(/.test(t) && !/^\s*export function withBagItem\(/.test(t));
  assert.deepEqual(bagCalls, [], 'city_model.js 不得自己呼叫 withBagItem（掉落/搜索都只記 foundItems）');
});

test('R57：背包件數在「搜索找到物品」後不變（掉落只進 foundItems，不進背包）', () => {
  const save = fresh();
  save.gold = 100000;
  save.month = 5;
  const bag = [{ Sequence: 1 }, { Sequence: 4 }];
  const raw = JSON.stringify({ equip: null, bag: bag.map((x) => x.Sequence) });
  const before = M.parseItemsSave(raw).bag.length;

  // 找一個會出物品的 nonce（第一骰 ≥ 0.5 且物品輪盤命中）
  const d = cdef('襄平');
  let got = null;
  for (let nonce = 1; nonce <= 200 && !got; nonce++) {
    const s = fresh();
    s.gold = 100000;
    s.month = 5;
    M.setSearchNonce(s, nonce);
    const r = M.search(s, d, ctx());
    if (r.kind === 'treasure' || r.kind === 'talisman') {
      got = { nonce, r, serialized: JSON.stringify(s) };
    }
  }
  assert.ok(got, '200 個 nonce 內應能搜到一件物品');
  // 搜索只把物品序號記進 foundItems（R18 去重），背包（另一個鍵）不動
  assert.ok((got.r.item && got.r.seq) || got.r.kind === 'none');
  assert.equal(M.parseItemsSave(raw).bag.length, before, '背包件數不變');
  assert.doesNotMatch(got.serialized, /"bag"\s*:/, '搜索不得寫背包結構');
});

