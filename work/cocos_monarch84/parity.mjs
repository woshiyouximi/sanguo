#!/usr/bin/env node
/**
 * Cocos 版《君主與勢力》模組 ↔ web 版 `monarch_model.js` 的逐欄位對拍。
 *
 * 動機（project/106 §2）：Cocos 側的 `assets/scripts/MonarchModel.ts` 是
 * `game/web/monarch_model.js`（616 行）的 1:1 移植。這種「換語言重寫一份」的移植
 * 最怕的就是「看起來一樣、邊界差一點」。所以這裡不靠讀碼判斷，而是把兩份實作
 * 丟進同一個 node 進程，餵同一批輸入，逐欄位比對：
 *
 *   5 劇本 × 60 城 × 20 事件 = 6000 次事件對拍
 *   每次都比較「函數返回值」＋「事件跑完之後的整份存檔」
 *
 * 事件覆蓋：繼承（inheritForce）／滅亡（extinguish）／讓位（abdicate/讓位候選）／
 * 漂移（recordDrift/driftSummary/driftText）／君主死亡（kingDeath 四條分支）／
 * 勢力聚合（forceRoster/forceDetail）／開局播種（seedMonarch）。
 *
 * 另外三張附加表（不計入 6000）：
 *   A. 34 個同名導出是否兩邊都在（同名導出 = 任務書的硬要求）
 *   B. 純函數掃描：normOfficer/normStatus/clanOf/decideFate/monthTag/troopCapOf… 對
 *      5 劇本 generals.json 全部武將行 + 一批人工構造的髒輸入
 *   C. 勢力色板：`forceColorIndex/forceColorOf/forceColorMap` 對 web `saves.js` 的
 *      14 家固定色 + 14 備色 + 中性灰 + 玩家金（Cocos 側這段是從 saves.js:113-186 搬的）
 *
 * 用法：
 *   node work/cocos_monarch84/parity.mjs            # 跑完整對拍，0 不一致 → exit 0
 *   node work/cocos_monarch84/parity.mjs --quiet    # 只印匯總表
 *   node work/cocos_monarch84/parity.mjs --json     # 額外印出 parity_result.json 內容
 *
 * 產物：
 *   work/cocos_monarch84/_unit_monarch.mjs   ← MonarchModel.ts 的內聯編譯產物（不進 Cocos）
 *   work/cocos_monarch84/parity_result.json  ← 統計數字（報告 project/106 直接引用）
 *
 * 為什麼用 `ts.transpileModule` 而不是 `tsc -p`：`tsconfig.check.json` 是 noEmit，
 * 而 Cocos 工程裡沒有 node 可跑的 outDir。這裡只要「去掉型別」即可，模組本身零依賴
 * （`MonarchModel.ts` 不 import 'cc'，也不 import 任何本地檔案），transpile 出來的
 * ESM 與 Cocos 打包後執行的語義一致。與 `work/cocos_map84/probe.mjs` 同一套做法。
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');                 // F:\sanguo
const GAME = path.join(ROOT, 'game');
const SRC_TS = path.join(GAME, 'cocos', 'assets', 'scripts', 'MonarchModel.ts');
const OUT_MJS = path.join(HERE, '_unit_monarch.mjs');
const OUT_JSON = path.join(HERE, 'parity_result.json');
const DATA_DIR = path.join(GAME, 'cocos', 'assets', 'bundles', 'res', 'data');
const WEB_MODEL = path.join(GAME, 'web', 'monarch_model.js');
const WEB_SAVES = path.join(GAME, 'web', 'saves.js');

const QUIET = process.argv.includes('--quiet');
const SHOW_JSON = process.argv.includes('--json');

const require = createRequire(import.meta.url);

/* ==========================================================================
 * §1 編譯 Cocos 側（MonarchModel.ts → ESM）
 * ======================================================================== */

const ts = require(path.join(GAME, 'node_modules', 'typescript', 'lib', 'typescript.js'));
const tsSource = readFileSync(SRC_TS, 'utf8');
const transpiled = ts.transpileModule(tsSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    removeComments: false,
    inlineSourceMap: false,
  },
  fileName: 'MonarchModel.ts',
});
writeFileSync(OUT_MJS, transpiled.outputText, 'utf8');

const CC = await import(pathToFileURL(OUT_MJS).href);        // Cocos 編譯產物
const WEB = await import(pathToFileURL(WEB_MODEL).href);     // web 真源
const SAVES = await import(pathToFileURL(WEB_SAVES).href);   // web 色板/開局播種

/* ==========================================================================
 * §2 資料：5 劇本 × 60 城 + 守將表 + 武將表
 * ======================================================================== */

const readJson = (name) => JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8'));
const scenarios = readJson('scenarios.json');
const garrisonTable = readJson('garrison.json');
const generalsTable = readJson('generals.json');

const generalByName = new Map();
for (const row of Array.isArray(generalsTable) ? generalsTable : []) {
  if (row && typeof row.NAME === 'string') generalByName.set(row.NAME, row);
}

const garrisonOfScenario = (si) => {
  if (!Array.isArray(garrisonTable)) return null;
  return garrisonTable.find((x) => x && x.scenario === si) ?? garrisonTable[si] ?? null;
};

/* ==========================================================================
 * §3 比對工具
 * ======================================================================== */

const problems = [];   // { kind, where, path, web, cocos }
let leaves = 0;        // 逐欄位（葉子）比較次數

const typeName = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** 深比較：物件比 key 集合（含值為 undefined 的 key，避免「少設一個欄位」被 JSON 吃掉） */
function deepCompare(a, b, label, pathStr = '', sink = problems) {
  const ta = typeName(a);
  const tb = typeName(b);
  if (ta !== tb) {
    leaves += 1;
    sink.push({ where: label, path: pathStr || '.', web: `${ta}:${brief(a)}`, cocos: `${tb}:${brief(b)}` });
    return;
  }
  if (ta === 'number') {
    leaves += 1;
    if (!Object.is(a, b)) sink.push({ where: label, path: pathStr || '.', web: a, cocos: b });
    return;
  }
  if (ta === 'string' || ta === 'boolean' || ta === 'null' || ta === 'undefined' || ta === 'bigint') {
    leaves += 1;
    if (!Object.is(a, b)) sink.push({ where: label, path: pathStr || '.', web: brief(a), cocos: brief(b) });
    return;
  }
  if (ta === 'function') {
    leaves += 1;
    if (a !== b) sink.push({ where: label, path: pathStr || '.', web: 'function', cocos: 'function' });
    return;
  }
  if (ta === 'array') {
    leaves += 1;
    if (a.length !== b.length) {
      sink.push({
        where: label,
        path: `${pathStr}.length`,
        web: a.length,
        cocos: b.length,
      });
    }
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i += 1) deepCompare(a[i], b[i], label, `${pathStr}[${i}]`, sink);
    return;
  }
  // 物件
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  leaves += 1;
  const onlyWeb = ka.filter((k) => !kb.includes(k));
  const onlyCocos = kb.filter((k) => !ka.includes(k));
  if (onlyWeb.length) {
    sink.push({ where: label, path: `${pathStr}{keys}`, web: `僅 web 有 ${onlyWeb.join(',')}`, cocos: '—' });
  }
  if (onlyCocos.length) {
    sink.push({ where: label, path: `${pathStr}{keys}`, web: '—', cocos: `僅 Cocos 有 ${onlyCocos.join(',')}` });
  }
  for (const key of ka) {
    if (!kb.includes(key)) continue;
    deepCompare(a[key], b[key], label, `${pathStr}.${key}`, sink);
  }
}

function brief(v) {
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  if (typeof v === 'object' && v !== null) return Array.isArray(v) ? `[${v.length}]` : `{${Object.keys(v).length}}`;
  return String(v);
}

/** 一次「事件」的記帳：同一事件裡的所有比較共用一個 sink，方便定位 */
function eventSink(kind, si, cityName, step) {
  return { kind, where: `${kind} | S${si + 1}/${cityName}/#${step}`, items: [] };
}

function flush(sink) {
  if (!sink.items.length) return;
  for (const item of sink.items) problems.push({ kind: sink.kind, where: sink.where, path: item.path, web: item.web, cocos: item.cocos });
}

/* ==========================================================================
 * §4 存檔夾具：照 web `saves.newCampaign` 的形狀造（+ garrison.json 的守將）
 * ======================================================================== */

function buildBaseSave(si) {
  const sc = scenarios[si];
  const g = garrisonOfScenario(si);
  const cities = {};
  const officersByCity = {};
  for (const c of sc.cities) {
    const name = String(c.NAME ?? '');
    if (!name) continue;
    const gs = g && g.cities ? g.cities[name] : null;
    cities[name] = {
      owner: typeof c.KING === 'string' ? c.KING : '',
      troops: gs && Number.isFinite(gs.garrison) ? gs.garrison : 0,
      pop: Number.isFinite(c.POPULATION) ? c.POPULATION : 0,
      money: Number.isFinite(c.MONEY) ? c.MONEY : 0,
    };
    officersByCity[name] = gs && Array.isArray(gs.officers) ? gs.officers.map((o) => ({ ...o })) : [];
  }
  const owned = sc.cities.slice(0, 3).map((c) => String(c.NAME));
  // 與 web `saves.newCampaign` 同規則：owned 裡第一座 KING 為非空字串的城 = 開國君主
  let seedKing = '';
  for (const name of owned) {
    const c = sc.cities.find((x) => x && x.NAME === name);
    if (c && typeof c.KING === 'string' && c.KING) { seedKing = c.KING.trim(); break; }
  }
  const save = {
    month: 1,
    gold: 1200,
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    owned,
    cities,
    armies: [],
    king: seedKing,
    monarch: seedKing,
    force: seedKing,
    monarchSince: 1,
    forces: {},
    fate: {},
    drift: null,
    loyal: {},
    tire: {},
    morale: {},
  };
  return { save, officersByCity, cityList: sc.cities, seedKing };
}

/** 該劇本裡出現過的所有勢力 id（含玩家） */
function forceIdsOf(base) {
  const set = new Set();
  for (const st of Object.values(base.save.cities)) {
    const owner = st.owner;
    if (typeof owner === 'string' && owner) set.add(owner);
  }
  if (base.seedKing) set.add(base.seedKing);
  return [...set].sort();
}

/** 每座城都在職的武將名（給 succession/decideFate 這類要吃名單的函數） */
const officersOf = (base, cityName) => base.officersByCity[cityName] ?? [];

/* ==========================================================================
 * §5 20 個事件（任務書要求「20 次繼承/滅亡/讓位/漂移事件」）
 *
 * 每個事件都：
 *   ① 從同一份 base 存檔深拷貝兩份 → ② 分別餵 web / Cocos → ③ 比返回值 + 比跑完的存檔
 * `step` 只用來做「確定性變化」（同一顆種子重跑結果一致），不引入隨機源。
 * ======================================================================== */

const MODES = ['mirror:setMonarch', 'mirror:setMonarch-empty', 'mirror:abdicate-ok', 'mirror:abdicate-bad', 'mirror:inherit-ai', 'mirror:inherit-player', 'mirror:kingDeath-inherit', 'mirror:kingDeath-extinct', 'mirror:kingDeath-notMonarch', 'mirror:kingDeath-alreadyDead', 'mirror:extinguish', 'mirror:extinguish-dead', 'query:forceRoster', 'query:forceDetail', 'query:abdicateCandidates', 'query:successionList', 'query:decideFate', 'mirror:recordDrift', 'query:driftText', 'seal:seedMonarch'];

async function runEvent(kind, si, base, cityName, step, forces) {
  const sink = eventSink(kind, si, cityName, step);
  const officers = officersOf(base, cityName);
  const ids = forces;
  const player = base.seedKing || ids[0] || '';
  const enemy = ids.find((f) => f !== player) || player;
  const pick = (arr, n) => (arr.length ? arr[n % arr.length] : '');
  const heirOf = (n) => (officers.length ? String(officers[n % officers.length].name) : (`路人${n}`));
  const month = 1 + ((step * 7 + si * 13 + cityName.length) % 120);

  const saveW = structuredClone(base.save);
  const saveC = structuredClone(base.save);

  const push = (label, wv, cv) => deepCompare(wv, cv, label, '', sink.items);

  switch (kind) {
    /* ---- 君主欄位 ------------------------------------------------------ */
    case 'mirror:setMonarch': {
      const name = heirOf(step);
      const opts = step % 5 === 0 ? { month, force: enemy } : { month };
      push('setMonarch.ret', WEB.setMonarch(saveW, name, opts), CC.setMonarch(saveC, name, opts));
      break;
    }
    case 'mirror:setMonarch-empty': {
      const name = step % 2 === 0 ? '' : '   ';
      const opts = step % 3 === 0 ? { month, keepKing: true } : { month };
      push('setMonarchEmpty.ret', WEB.setMonarch(saveW, name, opts), CC.setMonarch(saveC, name, opts));
      break;
    }
    /* ---- 讓位 ---------------------------------------------------------- */
    case 'mirror:abdicate-ok': {
      const heir = heirOf(step);
      push('abdicate.ret', WEB.abdicate(saveW, heir, { month }), CC.abdicate(saveC, heir, { month }));
      break;
    }
    case 'mirror:abdicate-bad': {
      const heir = ['', saveW.monarch, '不存在的人'][step % 3];
      push('abdicateBad.ret', WEB.abdicate(saveW, heir, { month }), CC.abdicate(saveC, heir, { month }));
      break;
    }
    /* ---- 繼承（AI / 玩家） --------------------------------------------- */
    case 'mirror:inherit-ai': {
      const heir = heirOf(step);
      push('inheritAI.ret', WEB.inheritForce(saveW, enemy, heir, { month }), CC.inheritForce(saveC, enemy, heir, { month }));
      break;
    }
    case 'mirror:inherit-player': {
      const heir = heirOf(step + 1);
      push('inheritPlayer.ret', WEB.inheritForce(saveW, player, heir, { month }), CC.inheritForce(saveC, player, heir, { month }));
      break;
    }
    /* ---- 君主死亡四條分支 ---------------------------------------------- */
    case 'mirror:kingDeath-inherit': {
      const opts = { month, remaining: 2, officers };
      push('kingDeath.inherit', WEB.kingDeath(saveW, player, opts), CC.kingDeath(saveC, player, opts));
      break;
    }
    case 'mirror:kingDeath-extinct': {
      const opts = { month, remaining: 0, officers };
      push('kingDeath.extinct', WEB.kingDeath(saveW, enemy, opts), CC.kingDeath(saveC, enemy, opts));
      break;
    }
    case 'mirror:kingDeath-notMonarch': {
      const opts = { month, remaining: 1, dead: '張三', officers };
      push('kingDeath.notMonarch', WEB.kingDeath(saveW, player, opts), CC.kingDeath(saveC, player, opts));
      break;
    }
    case 'mirror:kingDeath-alreadyDead': {
      WEB.extinguish(saveW, enemy, { month, officers });
      CC.extinguish(saveC, enemy, { month, officers });
      const opts = { month, remaining: 1, officers };
      push('kingDeath.alreadyDead', WEB.kingDeath(saveW, enemy, opts), CC.kingDeath(saveC, enemy, opts));
      break;
    }
    /* ---- 滅亡 ---------------------------------------------------------- */
    case 'mirror:extinguish': {
      const opts = { month, dead: saveW.monarch, officers };
      push('extinguish.ret', WEB.extinguish(saveW, enemy, opts), CC.extinguish(saveC, enemy, opts));
      // 二次呼叫 → 'already-dead' 分支（存檔已改，兩邊都在同一狀態上再跑一次）
      push('extinguish.again', WEB.extinguish(saveW, enemy, opts), CC.extinguish(saveC, enemy, opts));
      break;
    }
    case 'mirror:extinguish-dead': {
      const opts = { month, dead: '', officers };
      push('extinguish.player', WEB.extinguish(saveW, player, opts), CC.extinguish(saveC, player, opts));
      push('driftAfterExtinct', WEB.driftText(saveW), CC.driftText(saveC));
      break;
    }
    /* ---- 勢力聚合 ------------------------------------------------------ */
    case 'query:forceRoster': {
      push('forceRoster.default', WEB.forceRoster(saveW), CC.forceRoster(saveC));
      const opts = { cities: base.cityList, ownerOf: (n) => (saveW.cities[n]?.owner ?? ''), officersByCity: base.officersByCity };
      push('forceRoster.opts', WEB.forceRoster(saveW, opts), CC.forceRoster(saveC, { ...opts, ownerOf: (n) => (saveC.cities[n]?.owner ?? '') }));
      break;
    }
    case 'query:forceDetail': {
      const optsW = { cities: base.cityList, officersByCity: base.officersByCity, rowOf: (n) => generalByName.get(n) ?? null };
      push('forceDetail.player', WEB.forceDetail(saveW, player, optsW), CC.forceDetail(saveC, player, optsW));
      push('forceDetail.enemy', WEB.forceDetail(saveW, enemy, optsW), CC.forceDetail(saveC, enemy, optsW));
      push('forceDetail.missing', WEB.forceDetail(saveW, '無此勢力', optsW), CC.forceDetail(saveC, '無此勢力', optsW));
      break;
    }
    case 'query:abdicateCandidates': {
      const optsW = { cities: base.cityList, officersByCity: base.officersByCity };
      push('abdicateCandidates.default', WEB.abdicateCandidates(saveW), CC.abdicateCandidates(saveC));
      push('abdicateCandidates.opts', WEB.abdicateCandidates(saveW, optsW), CC.abdicateCandidates(saveC, optsW));
      break;
    }
    case 'query:successionList': {
      push('successionList.list', WEB.successionList(enemy, officers, { dead: enemy, king: '' }), CC.successionList(enemy, officers, { dead: enemy, king: '' }));
      push('successionList.pick', WEB.pickSuccessor(enemy, officers, { dead: enemy }), CC.pickSuccessor(enemy, officers, { dead: enemy }));
      push('successionList.empty', WEB.successionList(enemy, [], {}), CC.successionList(enemy, [], {}));
      break;
    }
    case 'query:decideFate': {
      const w = officers.map((o, i) => WEB.decideFate(o, { loyal: 40 + i, limit: 60 }));
      const c = officers.map((o, i) => CC.decideFate(o, { loyal: 40 + i, limit: 60 }));
      push('decideFate.batch', w, c);
      push('decideFate.noLoyal', WEB.decideFate({ name: '王五' }), CC.decideFate({ name: '王五' }));
      break;
    }
    /* ---- 漂移 ---------------------------------------------------------- */
    case 'mirror:recordDrift': {
      const drift = {
        tire: { down: step % 4, skipped: step % 2 },
        spirit: { down: step % 3, up: (step + 1) % 3, skipped: step % 2 },
        loyal: { down: step % 5, up: (step + 2) % 4, skipped: step % 3 },
        names: 3 + (step % 10),
      };
      push('recordDrift.ret', WEB.recordDrift(saveW, drift, month), CC.recordDrift(saveC, drift, month));
      push('driftSummary', WEB.driftSummary(saveW), CC.driftSummary(saveC));
      push('driftText', WEB.driftText(saveW), CC.driftText(saveC));
      push('monthTag', WEB.monthTag(month), CC.monthTag(month));
      break;
    }
    case 'query:driftText': {
      const bags = [
        { month: 1, tire: { down: 2 }, spirit: { up: 1, down: 1 }, loyal: { up: 3 }, names: 7 },
        { month: 24, tire: {}, spirit: {}, loyal: {}, names: 2 },
        { month: 'bad', tire: { down: -5 }, spirit: { up: 0 }, loyal: { down: 0 }, names: -1 },
        null,
      ];
      const w = bags.map((b) => { saveW.drift = b; return [WEB.driftSummary(saveW), WEB.driftText(saveW)]; });
      const c = bags.map((b) => { saveC.drift = b; return [CC.driftSummary(saveC), CC.driftText(saveC)]; });
      push('driftBag', w, c);
      break;
    }
    /* ---- 開局播種（對 web saves.newCampaign） --------------------------- */
    case 'seal:seedMonarch': {
      // ① Cocos seedMonarch：先放好 owned，再播種
      const shaped = { owned: [...saveC.owned], cities: structuredClone(saveC.cities) };
      const got = CC.seedMonarch(shaped, base.cityList);
      // ② web 真源：newCampaign（同一份 cities）
      const ref = SAVES.newCampaign({ id: si + 1, cities: base.cityList }, { gold: 0, ts: 0 });
      push('seedMonarch.king', ref.king, shaped.king);
      push('seedMonarch.monarch', ref.monarch, shaped.monarch);
      push('seedMonarch.force', ref.force, shaped.force);
      push('seedMonarch.monarchSince', ref.monarchSince, shaped.monarchSince);
      push('seedMonarch.forces', ref.forces, shaped.forces);
      push('seedMonarch.fate', ref.fate, shaped.fate);
      push('seedMonarch.drift', ref.drift, shaped.drift);
      push('seedMonarch.return', String(ref.monarch || ''), got);
      break;
    }
    default:
      throw new Error(`unknown event kind: ${kind}`);
  }

  // 事件跑完：整份存檔逐欄位再比一次（web 與 Cocos 都是「就地改 save」語義）
  push('save.after', saveW, saveC);
  flush(sink);
  return sink.items.length;
}

/* ==========================================================================
 * §6 附加表 A：同名導出（34 個）
 * ======================================================================== */

const WEB_EXPORTS = Object.keys(WEB).sort();
const exportRows = WEB_EXPORTS.map((name) => ({
  name,
  web: typeof WEB[name],
  cocos: typeof CC[name],
  ok: typeof WEB[name] === typeof CC[name],
}));
const missingExports = exportRows.filter((r) => !r.ok);
for (const row of missingExports) {
  problems.push({ kind: 'exports', where: '同名導出', path: row.name, web: row.web, cocos: row.cocos });
}

/* ==========================================================================
 * §7 附加表 B：純函數掃描（全武將表 + 髒輸入）
 * ======================================================================== */

const DIRTY = [
  undefined, null, '', '   ', 0, -0, 1, -1, NaN, Infinity, -Infinity, true, false,
  [], [1, 2], {}, { NAME: '公孫瓚' }, { name: '諸葛亮', str: '77', int: null, loyal: 'x' },
  { name: '司馬懿', Loyal: 44, status: 2 }, { name: '夏侯惇', LOYAL: 71, Status: 8 },
  { name: '孫堅', loyalKing: '孫策', status: '俘虜' }, { name: '曹操', status: '未發現' },
  { name: 'X', str: Infinity, int: -Infinity, loyal: NaN }, { name: 123 },
  { name: '張飛', status: 1 }, { name: '關羽', Status: '在野' }, { name: '' },
];

let pureChecks = 0;
const pureSink = [];
const pureProblemSink = [];
const scanPure = (label, w, c) => {
  pureChecks += 1;
  deepCompare(w, c, `pure:${label}`, '', pureProblemSink);
};

// ① 全部武將行（5 劇本 generals.json 的每一行，以及 garrison 的每一名守將）
const allOfficerRows = [];
for (const row of Array.isArray(generalsTable) ? generalsTable : []) {
  if (row && typeof row.NAME === 'string') allOfficerRows.push(row);
}
for (const g of Array.isArray(garrisonTable) ? garrisonTable : []) {
  for (const officers of Object.values((g && g.cities) || {})) {
    if (Array.isArray(officers?.officers)) allOfficerRows.push(...officers.officers);
  }
}
for (const row of [...allOfficerRows, ...DIRTY]) {
  scanPure('normOfficer', WEB.normOfficer(row), CC.normOfficer(row));
  scanPure('normStatus', WEB.normStatus(row?.status ?? row?.Status), CC.normStatus(row?.status ?? row?.Status));
  scanPure('isEmployed', WEB.isEmployed(row), CC.isEmployed(row));
  scanPure('clanOf', WEB.clanOf(row?.name ?? row?.NAME ?? row), CC.clanOf(row?.name ?? row?.NAME ?? row));
  scanPure('decideFate', [WEB.decideFate(row), WEB.decideFate(row, { loyal: 55 }), WEB.decideFate(row, { limit: 0 })],
    [CC.decideFate(row), CC.decideFate(row, { loyal: 55 }), CC.decideFate(row, { limit: 0 })]);
  scanPure('successionScore', WEB.successionScore(row, '公孫瓚'), CC.successionScore(row, '公孫瓚'));
}

// ② 姓名/月份/帶兵上限/殘將文案
const NAMES = ['', ' ', '公孫瓚', '公孫越', '公明', '諸葛亮', '諸葛', '司馬懿', '孫堅', '孫', '夏侯惇',
  '第五倫', '第五', '歐陽修', '歐陽', 'A', 'AB', '一二三', '盜賊', '盜賊頭', ' 公孫  ', '公孫 越'];
for (const a of NAMES) {
  scanPure('clanOf', WEB.clanOf(a), CC.clanOf(a));
  for (const b of NAMES) scanPure('sameClan', WEB.sameClan(a, b), CC.sameClan(a, b));
}
for (const m of [undefined, null, 0, 1, 12, 13, 24, 25, 100, -3, 2.7, '7', 'x', NaN, Infinity]) {
  scanPure('monthTag', WEB.monthTag(m), CC.monthTag(m));
  scanPure('intOr', WEB.intOr(m, 5, 1, 99), CC.intOr(m, 5, 1, 99));
}
for (const lv of [undefined, null, 0, -5, 1, 7, 10, 12.9, 20, 21, 99, 150, '12', 'x', NaN, Infinity]) {
  scanPure('troopCapOf', WEB.troopCapOf(lv), CC.troopCapOf(lv));
}
for (const fates of [[], null, undefined, [{ name: '甲', fate: 'surrender', loyal: 30 }],
  [{ name: '甲', fate: 'surrender', loyal: 30 }, { name: '乙', fate: 'wild', loyal: 88 }],
  [{ name: '甲', fate: 'wild', loyal: 88 }], [{ name: '甲', fate: 'surrender' }, { name: '乙', fate: 'surrender', loyal: 61 }]]) {
  scanPure('fateText', WEB.fateText(fates), CC.fateText(fates));
}
for (const v of DIRTY) {
  scanPure('str', WEB.str(v), CC.str(v));
  scanPure('num', WEB.num(v), CC.num(v));
}
scanPure('MONARCH_SRC', WEB.MONARCH_SRC, CC.MONARCH_SRC);
scanPure('FATE', WEB.FATE, CC.FATE);
scanPure('FATE_TEXT', WEB.FATE_TEXT, CC.FATE_TEXT);
scanPure('STATUS_TEXT', WEB.STATUS_TEXT, CC.STATUS_TEXT);
problems.push(...pureProblemSink);
const pureLeaves = leaves;

/* ==========================================================================
 * §8 附加表 C：勢力色板（Cocos §7 ↔ web saves.js）
 * ======================================================================== */

const paletteProblems = [];
let paletteChecks = 0;
const paletteSink = [];
const scanColor = (label, w, c) => {
  paletteChecks += 1;
  deepCompare(w, c, `palette:${label}`, '', paletteSink);
};

scanColor('FORCE_PALETTE', SAVES.FORCE_PALETTE, CC.FORCE_PALETTE);
scanColor('FORCE_RESERVE', SAVES.FORCE_RESERVE, CC.FORCE_RESERVE);
scanColor('FORCE_COLOR_NEUTRAL', SAVES.FORCE_COLOR_NEUTRAL, CC.FORCE_COLOR_NEUTRAL);
scanColor('FORCE_GOLD', SAVES.FORCE_GOLD, CC.FORCE_GOLD);
scanColor('FORCE_EDGE', SAVES.FORCE_EDGE, CC.FORCE_EDGE);

// 每一家（14 固定 + 劇本裡全部 + 一批假名走 hash 備色路徑）
const colorNames = new Set();
for (const sc of scenarios) {
  for (const c of sc.cities) if (typeof c.KING === 'string' && c.KING) colorNames.add(c.KING.trim());
}
for (const entry of SAVES.FORCE_PALETTE) colorNames.add(entry.force ?? entry.name ?? String(entry));
for (let i = 0; i < 240; i += 1) colorNames.add(`假勢力${i}`);
for (const n of ['', ' ', '公孫瓚', '公孫瓚 ', 'x'.repeat(80), 0, null, undefined]) colorNames.add(n);
for (const name of colorNames) {
  scanColor(`index(${brief(name)})`, SAVES.forceColorIndex(name), CC.forceColorIndex(name));
  scanColor(`color(${brief(name)})`, SAVES.forceColorOf(name), CC.forceColorOf(name));
}
// forceColorMap：按城列表順序去重
const cityNames = scenarios[0].cities.map((c) => String(c.NAME));
const forceOfFn = (n) => (scenarios[0].cities.find((c) => c.NAME === n)?.KING ?? '');
scanColor('forceColorMap', SAVES.forceColorMap(cityNames, forceOfFn), CC.forceColorMap(cityNames, forceOfFn));
problems.push(...paletteSink);

/* ==========================================================================
 * §9 主迴圈：5 劇本 × 60 城 × 20 事件
 * ======================================================================== */

const t0 = Date.now();
let cityRuns = 0;
let eventRuns = 0;
const perMode = new Map(MODES.map((m) => [m, 0]));
const rows = [];

for (let si = 0; si < scenarios.length; si += 1) {
  const base = buildBaseSave(si);
  const forces = forceIdsOf(base);
  const cities = (scenarios[si].cities || []).map((c) => String(c.NAME));
  let scenarioEvents = 0;
  let scenarioLeaves = 0;
  const leavesBefore = leaves;
  const problemsBefore = problems.length;

  for (const cityName of cities) {
    cityRuns += 1;
    for (let step = 0; step < MODES.length; step += 1) {
      const kind = MODES[step];
      await runEvent(kind, si, base, cityName, step, forces);
      eventRuns += 1;
      scenarioEvents += 1;
      perMode.set(kind, (perMode.get(kind) ?? 0) + 1);
    }
  }

  scenarioLeaves = leaves - leavesBefore;
  rows.push({
    scenario: si + 1,
    cities: cities.length,
    forces: forces.length,
    seedKing: base.seedKing,
    events: scenarioEvents,
    leaves: scenarioLeaves,
    mismatches: problems.length - problemsBefore,
  });
}

const elapsed = Date.now() - t0;

/* ==========================================================================
 * §9b 陰性對照（negative control）：證明「比對器真的會抓到差異」
 *
 * 0 不一致有兩種可能：①兩份實作真的等價；②比對器壞了，什麼都比對不出來。
 * 所以拿三組**已知必須有差異**的輸入再比一次，三組都必須報出不一致。
 * 這一節不影響 exit code 的語義：控制組沒抓到差異才是真的錯（視為 harness bug）。
 * ======================================================================== */

const controlProblems = [];
const controlSink = [];
const controlLeaves = [];
function control(label, a, b) {
  const before = controlSink.length;
  const leavesBefore = leaves;
  deepCompare(a, b, `control:${label}`, '', controlSink);
  controlLeaves.push(leaves - leavesBefore);
  controlProblems.push({ label, detected: controlSink.length > before });
}

{
  // 用真資料跑一次，再把結果「人工改壞」一格 —— 改的正好是這個模組最關鍵的三種欄位
  const base = buildBaseSave(0);
  const realDeath = WEB.kingDeath(structuredClone(base.save), base.seedKing, {
    month: 5,
    remaining: 2,
    officers: officersOf(base, '北平'),
  });
  control('返回值少一格 heir', realDeath, { ...realDeath, heir: '' });
  control('返回值多一格 extraneous', realDeath, { ...realDeath, extra: 1 });
  control('勢力名單少一家', WEB.forceRoster(structuredClone(base.save)), WEB.forceRoster(structuredClone(base.save)).slice(1));
  control('存檔君主名不同', base.save, { ...structuredClone(base.save), monarch: '錯的君主' });
  // 注意：`forceDetail` 的 officers 來自 `opts.officersByCity`（預設 `{}` → 空名單），
  // 所以控制組一定要把守將表傳進去，否則「改壞 officers[0]」其實改在空陣列上。
  const realDetail = WEB.forceDetail(structuredClone(base.save), base.seedKing, {
    cities: base.cityList,
    officersByCity: base.officersByCity,
  });
  control('勢力明細忠誠差 1', realDetail, {
    ...realDetail,
    officers: realDetail.officers.map((o, i) => (i === 0 && o ? { ...o, loyal: (o.loyal ?? 0) + 1 } : o)),
  });
}
const controlOk = controlProblems.every((c) => c.detected);
if (!controlOk) {
  for (const c of controlProblems) {
    if (!c.detected) problems.push({ kind: 'harness', where: '陰性對照', path: c.label, web: '有差異', cocos: '比對器沒抓到' });
  }
}

/* ==========================================================================
 * §10 匯總
 * ======================================================================== */

const eventsByFamily = {
  '君主欄位（setMonarch）': MODES.filter((m) => m.includes('setMonarch')),
  '讓位（abdicate/讓位候選）': MODES.filter((m) => m.includes('abdicate')),
  '繼承（inheritForce/kingDeath）': MODES.filter((m) => m.includes('inherit') || m.includes('kingDeath')),
  '滅亡（extinguish）': MODES.filter((m) => m.includes('extinguish')),
  '漂移（recordDrift/driftText）': MODES.filter((m) => m.includes('Drift') || m.includes('drift')),
  '勢力聚合（roster/detail/succession/decideFate）': MODES.filter((m) => m.startsWith('query:') && !m.includes('Drift') && !m.includes('drift')),
  '開局播種（seedMonarch）': MODES.filter((m) => m.startsWith('seal:')),
};

const summary = {
  generatedAt: new Date().toISOString(),
  source: {
    web: 'game/web/monarch_model.js',
    cocos: 'game/cocos/assets/scripts/MonarchModel.ts',
    cocosLines: tsSource.split(/\r?\n/).length,
    webLines: readFileSync(WEB_MODEL, 'utf8').split(/\r?\n/).length,
  },
  main: {
    scenarios: scenarios.length,
    cities: cityRuns,
    eventsPerCity: MODES.length,
    events: eventRuns,
    leaves,
    mismatches: problems.length,
    elapsedMs: elapsed,
  },
  perScenario: rows,
  exports: { total: WEB_EXPORTS.length, matched: exportRows.filter((r) => r.ok).length, missing: missingExports },
  pure: { calls: pureChecks, leaves: pureLeaves, problems: pureProblemSink.length },
  palette: { checks: paletteChecks, names: colorNames.size, problems: paletteSink.length },
  negativeControl: { cases: controlProblems.length, detected: controlProblems.filter((c) => c.detected).length, detail: controlProblems },
  families: Object.fromEntries(Object.entries(eventsByFamily).map(([k, v]) => [k, v])),
  problems: problems.slice(0, 40),
  problemCount: problems.length,
};

writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

const line = (s = '') => { if (!QUIET) console.log(s); };

console.log('Cocos 君主與勢力 ↔ web monarch_model.js 對拍');
console.log(`  真源   ${WEB_MODEL}（${summary.source.webLines} 行）`);
console.log(`  移植   ${SRC_TS}（${summary.source.cocosLines} 行）`);
console.log('');
console.log('  劇本   城   事件   葉子欄位   不一致   種子君主');
for (const r of rows) {
  console.log(
    `  S${r.scenario}  ${String(r.cities).padStart(3)}  ${String(r.events).padStart(5)}  ${String(r.leaves).padStart(9)}  ${String(r.mismatches).padStart(7)}   ${r.seedKing || '（無主）'}`,
  );
}
console.log('');
console.log(`  主對拍     ：${scenarios.length} 劇本 × ${cityRuns / scenarios.length} 城 × ${MODES.length} 事件 = ${eventRuns} 次`);
console.log(`  葉子欄位   ：${leaves}`);
console.log(`  不一致     ：${problems.length}`);
console.log(`  同名導出   ：${summary.exports.matched}/${summary.exports.total}`);
console.log(`  純函數掃描 ：${pureChecks} 次呼叫`);
console.log(`  勢力色板   ：${paletteChecks} 次比對（${colorNames.size} 個勢力名）`);
console.log(`  陰性對照   ：${summary.negativeControl.detected}/${summary.negativeControl.cases} 組都抓到差異`);
console.log(`  耗時       ：${elapsed} ms`);
if (!QUIET) {
  console.log('');
  for (const [family, members] of Object.entries(eventsByFamily)) {
    const n = members.reduce((acc, m) => acc + (perMode.get(m) ?? 0), 0);
    console.log(`  ${family}：${members.length} 種事件 / ${n} 次`);
  }
}
if (problems.length) {
  console.log('');
  console.log(`  ✗ 前 ${Math.min(40, problems.length)} 條不一致：`);
  for (const p of problems.slice(0, 40)) {
    console.log(`    [${p.kind}] ${p.where} ${p.path}`);
    console.log(`        web=${JSON.stringify(p.web)}  cocos=${JSON.stringify(p.cocos)}`);
  }
} else {
  console.log('');
  console.log('  ✓ 0 不一致');
}
console.log('');
console.log(`  明細：${OUT_JSON}`);
if (SHOW_JSON) console.log(JSON.stringify(summary, null, 2));

// 給 CI / lead 用的退出碼：0 = 完全一致
process.exit(problems.length === 0 ? 0 : 1);
