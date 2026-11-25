/**
 * parity.mjs — 「AI 回寫的人事能不能跨月活下來」對拍（Cocos ↔ web）
 *
 * 背景（project/106 §7.2）：`GameState.normalize()` 以前用 `stringArray()` 收 `cities[*].officers`，
 * AiRunner 回寫的 `{name,str,int,loyal,status}` 物件在**下一次讀檔**時被整批濾掉 → 城裡人事每月
 * 退回 garrison.json。本腳本用同一份「舊形存檔」在兩側各跑 3 個月，逐月比較每城 officers 的 JSON。
 *
 * 三個指標（都必須 0 不一致）：
 *   [A] web 世界 ↔ Cocos 存檔   —— 任務書要的那一條：web 版 `game/web/ai_model.js` 算出來的月末人事，
 *                                  跟 Cocos 版「AiRunner 回寫 + GameState 存檔往返（localStorage →
 *                                  normalize → loadSave）」讀回來的人事逐欄比對。web 側的月末人事取
 *                                  **AI 世界**（`world.cities[*].officers`）而不是它自己的存檔：web 的
 *                                  `saves.js#citySummaryOf()` 把 `cities[*].officers` 定義成「在城武將數」
 *                                  （數字，見 saves.js:884/918），跟 Cocos 的同名欄位（物件陣列）**同名
 *                                  不同義**，拿它比就變成比「人數 vs 陣列」，見報告 §偏離。
 *   [B] Cocos 世界 ↔ web 世界    —— 同一 seed/同一 meta 下兩份 AiModel 移植產物是否一致（排除對拍驅動）。
 *   [C] Cocos 世界 ↔ Cocos 存檔  —— 存檔往返零丟失，也就是本 bug 的判據（修復前這裡會全紅）。
 *
 * 陰性對照：拿最後一個月 Cocos 存檔的 officers，故意把一名武將的 `str` +1，再跑同一個 diff，
 * 必須恰好紅 1 個欄位 —— 證明這套 diff 真的能紅，不是「怎麼比都 0」。
 *
 * 驅動方式：兩側用**同一段**「一月」序列（照抄 AiRunner.runMonth 的順序：buildMeta → ensureMeta →
 * buildForces/syncOwned → prepareMonth → planMonth → executeMonth → 逐條 resolveBattle/captureKingIn →
 * checkForceDeaths → monthlyDrift），只是換 `MOD`（`build/AiModel.js` 或 `game/web/ai_model.js`）。
 * Cocos 側另外真的調一次 `AiRunner.runMonth()` + `GameState.persistSave()` + `resetCache()` + `loadSave()`
 * —— 那才是產品路徑。指標 [C] 能過，就說明「驅動抄得對」；[B] 能過，就說明兩份移植一致。
 *
 * 跑法：`node work/cocos_officers85/parity.mjs`（先 `node work/cocos_officers85/build.mjs`）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as GS from './build/GameState.js';
import * as Runner from './build/AiRunner.js';
import * as CocosAI from './build/AiModel.js';
import * as WebAI from '../../game/web/ai_model.js';
import * as Saves from '../../game/web/saves.js';
import { store } from './build/_cc.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const MONTHS = 3;
const KNOWN = ['name', 'str', 'int', 'loyal', 'status'];

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const scenarios = readJson('game/data/scenarios.json');
const garrisons = readJson('game/data/garrison.json');
const generals = readJson('game/data/generals.json');
const SCENARIO = scenarios[0];
const GARRISON = (() => {
  const list = Object.keys(garrisons).map((k) => garrisons[k]);
  const hit = list.find((g) => g && Number(g.scenario) === Number(SCENARIO.id));
  if (hit) return hit;
  const byIndex = garrisons[String(Number(SCENARIO.id) - 1)];
  return byIndex || garrisons[String(Object.keys(garrisons)[0])];
})();

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/* ── 初始化：一份「舊形」存檔（只有兵/民/金，沒有 owner/officers） ───────────────── */

function buildFixture() {
  const cityRows = Array.isArray(SCENARIO.cities) ? SCENARIO.cities : [];
  const garrisonCities = (GARRISON && GARRISON.cities) || {};
  const cityByName = new Map();
  for (const row of cityRows) if (row && row.NAME) cityByName.set(row.NAME, row);

  // 勢力：按 garrison.owner 的城數排序，取第 2 名當玩家（第 1 名留給 AI 打）
  const byOwner = new Map();
  for (const name of Object.keys(garrisonCities)) {
    const owner = String((garrisonCities[name] && garrisonCities[name].owner) || '');
    if (!owner) continue;
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(name);
  }
  const ranked = Array.from(byOwner.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const pick = ranked.length > 1 ? ranked[1] : ranked[0];
  const player = pick ? pick[0] : '玩家';
  const owned = pick ? pick[1].slice() : [];

  const cities = {};
  for (const row of cityRows) {
    if (!row || !row.NAME) continue;
    // 与 GameState.initCampaign() 同式：兵 = min(600, floor(人口/2500)+110)
    cities[row.NAME] = {
      troops: Saves.cityTroops(row),
      pop: Saves.num(row.POPULATION),
      money: Saves.num(row.MONEY),
    };
  }
  const save = {
    owned,
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    month: 1,
    gold: 1200,
    seeded: true,
    cities,
    armies: [],
    armySeq: 0,
    king: player,
  };
  return { save, cityRows, cityByName, garrisonCities, player, owned, generals };
}

/* ── 驱动：照抄 AiRunner.runMonth 的一月序列，只换 MOD ─────────────────────────── */

function officerRowIndex(world) {
  const map = new Map();
  const cities = world && world.cities && typeof world.cities === 'object' ? world.cities : {};
  for (const name of Object.keys(cities)) {
    const list = cities[name] && cities[name].officers;
    if (!Array.isArray(list)) continue;
    for (const o of list) {
      const n = o && typeof o.name === 'string' ? o.name : '';
      if (n && !map.has(n)) map.set(n, o);
    }
  }
  return (name) => map.get(name) || null;
}

function officersByCity(world) {
  const out = {};
  const cities = world && world.cities && typeof world.cities === 'object' ? world.cities : {};
  for (const name of Object.keys(cities)) {
    const list = cities[name] && cities[name].officers;
    if (Array.isArray(list) && list.length) out[name] = list;
  }
  return out;
}

function generalIndex(rows) {
  const map = new Map();
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const name = typeof row.NAME === 'string' ? row.NAME : typeof row.name === 'string' ? row.name : '';
    if (name && !map.has(name)) map.set(name, row);
  }
  return (name) => map.get(name) || null;
}

/** 跑一个月，返回月末 AI 世界（`world.cities[*].officers` 就是 web 侧的人事真相） */
function driverMonth(MOD, save, fx, ctx, month) {
  const meta = Runner.buildMeta(fx.cityRows, { garrisonOf: ctx.garrisonOf });
  Runner.ensureMeta(save, meta);

  const ownedList = Array.isArray(save.owned) ? save.owned.filter((n) => typeof n === 'string') : [];
  if (!save.king) save.king = ctx.playerId || (ownedList.length ? Runner.PLAYER_FORCE : '');
  const playerId = ctx.playerId || save.king;

  const metaByName = new Map();
  for (const m of meta) if (m && m.NAME) metaByName.set(m.NAME, m);

  const cities = save.cities && typeof save.cities === 'object' ? save.cities : (save.cities = {});
  const owners = {};
  for (const name of Object.keys(cities)) {
    owners[name] = String((cities[name] && cities[name].owner) || '')
      || String((metaByName.get(name) || {}).owner || '');
  }
  MOD.buildForces(save, owners);
  MOD.syncOwned(save);

  const seed = (month + 1) * 7919;
  const rand = MOD.seedRng(seed);
  const ownerOf = (name) => String((cities[name] && cities[name].owner) || '')
    || String((metaByName.get(name) || {}).owner || '');
  const wctx = {
    playerId,
    rules: { cheat: false },
    rand,
    seed,
    ownerOf,
    paths: ctx.paths,
    capOf: ctx.capOf,
  };
  const world = MOD.prepareMonth(save, meta, wctx);
  const actions = MOD.planMonth(save, meta, wctx);
  const res = MOD.executeMonth(world, actions, { rng: rand });
  const executed = Array.isArray(res && res.executed) ? res.executed : [];
  const attackPlayer = MOD.ACT && MOD.ACT.ATTACK_PLAYER;
  for (const row of executed) {
    const cand = row && row.cand;
    const result = row && row.result;
    if (!result || result.ok === false) continue;
    const to = String((cand && cand.to) || '');
    const act = Math.trunc(Number((cand && cand.act) || 0) || 0);
    // 与 AiRunner 同规则：打玩家的仗不结算，留给宿主守城战
    const guest = result.kind === 'battle' && to !== ''
      && (act === attackPlayer || MOD.forceOf(world, to) === playerId);
    if (guest) continue;
    if (result.kind !== 'battle') continue;
    const rb = MOD.resolveBattle(world, result, rand);
    if (rb && rb.captured === true) {
      MOD.captureKingIn(world, to, { major: rb.oldMajor, owner: rb.defender });
    }
  }
  MOD.checkForceDeaths(world);

  // 漂移：只写 save 的 tire/morale/loyal 表，但会影响下个月的 AI 判断 → 两侧都要走
  const worldOfficer = officerRowIndex(world);
  const rowOf = generalIndex(fx.generals);
  MOD.monthlyDrift(save, officersByCity(world), { rowOf: (n) => worldOfficer(n) || rowOf(n) });
  return world;
}

/* ── 比较 ───────────────────────────────────────────────────────────────────── */

/** 歸一成固定鍵序的 JSON 友善物件（5 個已知鍵 → 其餘鍵按字面排序原樣接上） */
function canonOfficers(list) {
  if (!Array.isArray(list)) return [];
  return list.map((raw) => {
    if (typeof raw === 'string') return { name: raw, str: 0, int: 0, loyal: 0, status: '登' };
    const r = raw && typeof raw === 'object' ? raw : {};
    const out = {
      name: typeof r.name === 'string' ? r.name : '',
      str: Math.trunc(Number(r.str) || 0),
      int: Math.trunc(Number(r.int) || 0),
      loyal: Math.trunc(Number(r.loyal) || 0),
      status: typeof r.status === 'number' ? r.status : String(r.status === undefined ? '登' : r.status) || '登',
    };
    const extra = Object.keys(r).filter((k) => KNOWN.indexOf(k) < 0).sort();
    for (const k of extra) out[k] = r[k];
    return out;
  });
}

function snapshotOfficers(cities) {
  const out = {};
  const src = cities && typeof cities === 'object' ? cities : {};
  for (const name of Object.keys(src)) out[name] = canonOfficers(src[name] && src[name].officers);
  return out;
}

/**
 * 復刻「修復前」的 GameState.normalize()：`if (Array.isArray(c.officers)) city.officers = stringArray(c.officers)`，
 * 而 stringArray() 只留 typeof === 'string' 的項 → AI 回寫的物件陣列會被整批丟掉。
 * 拿它跟 web 世界比，必須「全紅」；這也是這套對拍真的抓得到原 bug 的證據（陰性對照證明 diff 會紅，
 * 這一條證明紅的就是那個 bug 本身）。
 */
function legacyOfficersView(cities) {
  const out = {};
  const src = cities && typeof cities === 'object' ? cities : {};
  for (const name of Object.keys(src)) {
    const list = src[name] && src[name].officers;
    const kept = [];
    if (Array.isArray(list)) {
      for (const item of list) if (typeof item === 'string') kept.push(item);
    }
    out[name] = canonOfficers(kept);
  }
  return out;
}

function newMetric(name) {
  return { name, cityMonths: 0, officerEntries: 0, fieldChecks: 0, mismatches: 0, examples: [] };
}

function noteExample(metric, where, detail) {
  if (metric.examples.length < 5) metric.examples.push(`${where}: ${detail}`);
}

/** 逐城比 officers：先比 canonical JSON，不同再逐条/逐字段定位 */
function diffOfficers(metric, left, right, where) {
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const city of names) {
    const a = left[city] || [];
    const b = right[city] || [];
    metric.cityMonths += 1;
    metric.officerEntries += Math.max(a.length, b.length);
    metric.fieldChecks += Math.max(a.length, b.length) * KNOWN.length;
    const ja = JSON.stringify(a);
    const jb = JSON.stringify(b);
    if (ja === jb) continue;
    if (a.length !== b.length) {
      metric.mismatches += 1;
      noteExample(metric, where, `${city} 人數 ${a.length} ≠ ${b.length}`);
    }
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      const oa = a[i];
      const ob = b[i];
      const keys = new Set([...Object.keys(oa), ...Object.keys(ob)]);
      for (const k of keys) {
        if (JSON.stringify(oa[k]) === JSON.stringify(ob[k])) continue;
        metric.mismatches += 1;
        noteExample(metric, where, `${city}[${i}].${k}: ${JSON.stringify(oa[k])} ≠ ${JSON.stringify(ob[k])}`);
      }
    }
    if (a.length !== b.length) {
      const longer = a.length > b.length ? a.slice(n) : b.slice(n);
      for (const o of longer) {
        metric.mismatches += 1;
        noteExample(metric, where, `${city} 多出/少掉 武將 ${JSON.stringify(o.name)}`);
      }
    }
  }
  return metric;
}

/* ── 主流程 ─────────────────────────────────────────────────────────────────── */

const fx = buildFixture();
const ctx = {
  playerId: fx.player,
  paths: SCENARIO.paths,
  garrisonOf: (name) => fx.garrisonCities[name] || null,
  capOf: (name) => {
    const row = fx.cityByName.get(name);
    return row ? GS.garrisonOf(row) : 0;
  },
};

// 舊形存檔進 localStorage → loadSave 讀出來（這一步就是 bug 現場：過去 officers 在這裡被洗掉）
store.set(GS.SAVE_KEY, JSON.stringify(fx.save));
GS.resetCache();
let saveCocos = GS.loadSave();

const mWebVsSaved = newMetric('[A] web 世界 ↔ Cocos 存档');
const mWorlds = newMetric('[B] Cocos 世界 ↔ web 世界');
const mSavedVsWorld = newMetric('[C] Cocos 世界 ↔ Cocos 存档');
const mBugRepro = newMetric('[L] 假如还是旧 normalize（stringArray 白名单）↔ web 世界');

const startOfficers = snapshotOfficers(saveCocos.cities);
const startCount = Object.keys(startOfficers).reduce((n, k) => n + startOfficers[k].length, 0);
const rows = [];
let finalWebWorld = null; // 最後一個月的 web 世界（陰性對照的基準，見下方）

for (let month = 1; month <= MONTHS; month += 1) {
  saveCocos.month = month;
  const before = snapshotOfficers(saveCocos.cities);
  const sDriverCocos = clone(saveCocos);
  const sDriverWeb = clone(saveCocos);

  // Cocos 產品路徑：AiRunner.runMonth（內部含 ensureMeta/applyWorld）→ 存檔 → 冷啟動讀檔
  const outcome = Runner.runMonth(saveCocos, fx.cityRows, fx.generals, {
    ...ctx,
    seed: (month + 1) * 7919,
  });
  GS.persistSave();
  const rawSaved = JSON.parse(String(store.get(GS.SAVE_KEY) || '{}'));
  GS.resetCache();
  saveCocos = GS.loadSave();

  const worldCocos = driverMonth(CocosAI, sDriverCocos, fx, ctx, month);
  const worldWeb = driverMonth(WebAI, sDriverWeb, fx, ctx, month);

  const persisted = snapshotOfficers(saveCocos.cities);
  const cocosWorld = snapshotOfficers(worldCocos.cities);
  const webWorld = snapshotOfficers(worldWeb.cities);
  finalWebWorld = webWorld;

  diffOfficers(mWebVsSaved, webWorld, persisted, `M${month}`);
  diffOfficers(mWorlds, cocosWorld, webWorld, `M${month}`);
  diffOfficers(mSavedVsWorld, cocosWorld, persisted, `M${month}`);
  // 拿「修復前」的 normalize 再看一次同一份存檔 → 必須全紅，否則說明這套對拍抓不到原 bug
  diffOfficers(mBugRepro, webWorld, legacyOfficersView(rawSaved.cities), `M${month}`);

  let moved = 0;
  for (const city of Object.keys(persisted)) {
    if (JSON.stringify(persisted[city]) !== JSON.stringify(before[city] || [])) moved += 1;
  }
  const total = Object.keys(persisted).reduce((n, k) => n + persisted[k].length, 0);
  rows.push({
    month,
    cities: Object.keys(persisted).length,
    officers: total,
    movedCities: moved,
    executed: outcome && Array.isArray(outcome.executed) ? outcome.executed.length : 0,
    incoming: outcome && Array.isArray(outcome.incoming) ? outcome.incoming.length : 0,
  });
}

/* ── 陰性對照：故意改一個欄位，diff 必須紅 ───────────────────────────────────── */

const lastSnapshot = snapshotOfficers(saveCocos.cities);
const tampered = clone(lastSnapshot);
let tamperAt = null;
for (const city of Object.keys(tampered)) {
  if (tampered[city].length) {
    tampered[city][0].str += 1;
    tamperAt = `${city}/${tampered[city][0].name}.str`;
    break;
  }
}
const mNegative = newMetric('[N] 陰性對照（故意 str+1）');
const webWorldFinal = finalWebWorld;
if (!webWorldFinal) throw new Error('陰性對照缺少最後一個月的 web 世界');
diffOfficers(mNegative, webWorldFinal, tampered, 'neg');

/* ── 輸出 ───────────────────────────────────────────────────────────────────── */

const fmt = (m) => `城×月 ${m.cityMonths} / 條目 ${m.officerEntries} / 欄位 ${m.fieldChecks} / **不一致 ${m.mismatches}**`;
console.log('');
console.log('=== 跨月人事對拍（Cocos ↔ web） ===');
console.log(`劇本 ${SCENARIO.id}・${Object.keys(SCENARIO.cities || {}).length || SCENARIO.cities.length} 城・玩家勢力「${fx.player}」（${fx.owned.length} 城）・${MONTHS} 個月`);
console.log(`初始存檔：舊形（cities 只有 troops/pop/money）→ loadSave 後 officers 條目 ${startCount}`);
for (const r of rows) {
  console.log(`  第 ${r.month} 月：${r.cities} 城・武將 ${r.officers} 條・有變動的城 ${r.movedCities}・executed ${r.executed}・incoming ${r.incoming}`);
}
for (const m of [mWorlds, mSavedVsWorld, mWebVsSaved]) {
  console.log(`${m.name}：${fmt(m)}`);
  for (const ex of m.examples) console.log(`    · ${ex}`);
}
console.log(`${mNegative.name}：${fmt(mNegative)}${tamperAt ? `（改的是 ${tamperAt}）` : '（**沒有武將可改**）'}`);
for (const ex of mNegative.examples) console.log(`    · ${ex}`);
console.log(`${mBugRepro.name}：${fmt(mBugRepro)}（要求 >0：舊 normalize 會把人事物件整批丟掉，這條就是原 bug）`);
for (const ex of mBugRepro.examples) console.log(`    · ${ex}`);

const totalMismatch = mWorlds.mismatches + mSavedVsWorld.mismatches + mWebVsSaved.mismatches;
const movedTotal = rows.reduce((n, r) => n + r.movedCities, 0);
console.log('');
console.log(`合計不一致 ${totalMismatch}（要求 0）；陰性對照不一致 ${mNegative.mismatches}（要求 >0）；舊 normalize 復現不一致 ${mBugRepro.mismatches}（要求 >0）；3 個月有武將變動的城-月 ${movedTotal}（要求 >0）`);

const report = {
  scenario: SCENARIO.id,
  months: MONTHS,
  player: fx.player,
  initialOfficers: startCount,
  monthsRows: rows,
  metrics: [mWorlds, mSavedVsWorld, mWebVsSaved, mNegative, mBugRepro].map((m) => ({
    name: m.name,
    cityMonths: m.cityMonths,
    officerEntries: m.officerEntries,
    fieldChecks: m.fieldChecks,
    mismatches: m.mismatches,
    examples: m.examples,
  })),
  negativeControl: { tamperedField: tamperAt, mismatches: mNegative.mismatches },
  legacyBugRepro: mBugRepro.mismatches,
  passed: totalMismatch === 0 && mNegative.mismatches > 0 && mBugRepro.mismatches > 0 && movedTotal > 0,
};
fs.writeFileSync(path.join(here, 'parity-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const fail = [];
if (totalMismatch !== 0) fail.push(`不一致 ${totalMismatch} ≠ 0`);
if (mNegative.mismatches <= 0) fail.push('陰性對照沒紅（diff 可能失效）');
if (mBugRepro.mismatches <= 0) fail.push('舊 normalize 復現沒紅（這套對拍抓不到原 bug）');
if (movedTotal <= 0) fail.push('3 個月內沒有任何武將變動（對拍等於空轉）');
if (fail.length) {
  console.error(`PARITY FAIL：${fail.join('；')}`);
  process.exitCode = 1;
} else {
  console.log('PARITY OK');
}
