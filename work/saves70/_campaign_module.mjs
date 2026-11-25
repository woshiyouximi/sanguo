
import * as Saves from './saves.js';
// 一月一令的判定/记位只在 city_model.js 里实现一份，这里直接复用（纯逻辑，无 DOM）
import * as CM from './city_model.js';
// R73–R76 / R78 / R65 的 AI 纯逻辑（候选表、四段规划、ArgMaxRate、势力归属、月度漂移）。
// 全部在 ai_model.js 里实现，这里只做「存档 ↔ world」搬运与显示；tests/campaign_ai.test.ts 直接测那份。
import * as AI from './ai_model.js';
// R4/R78/R65/R75 的君主·勢力·滅亡·繼承·漂移摘要純邏輯（無 DOM，tests/monarch.test.ts 直接測）
import * as MM from './monarch_model.js';
// 守將真值：5 劇本 × 60 城的守軍/太守/駐將（src/core/garrison.ts 的 dist 產物）
import { battleSetup, defenderBattleParams, defendersOf, garrisonOf, levelFromExp } from '../dist/core/garrison.js';
// 武將等級/學習（R68）：月末補學走 core/unlock.ts 的 monthlyLearnCheck（純邏輯，無 DOM）
import { createLearnState, monthlyLearnCheck } from '../dist/core/unlock.js';

const stage = document.getElementById('stage');
const $ = (id) => document.getElementById(id);
function fit() {
  const s = Math.min(window.innerWidth / 750, window.innerHeight / 1334);
  // 先按"缩放后的尺寸"把布局盒摆到视口中央，再 scale（transform-origin: top left）。
  // 只把 body 宽高改成 750s×1334s 是不够的：stage 仍是 750x1334 的 flex 子元素，
  // 溢出时 flex 居中会把左上角顶出视口（1200x900 下标题被裁掉就是这个原因）。
  stage.style.position = 'absolute';
  stage.style.left = Math.round((window.innerWidth - 750 * s) / 2) + 'px';
  stage.style.top = Math.round((window.innerHeight - 1334 * s) / 2) + 'px';
  stage.style.transform = `scale(${s})`;
  document.body.style.width = 750 * s + 'px';
  document.body.style.height = 1334 * s + 'px';
  resizeCanvas();
}
window.addEventListener('resize', fit);

const qs = new URLSearchParams(location.search);
// 行軍開關：預設開；?march=0 回到「點城直接出征」的舊行為，方便對比
const MARCH_ON = qs.get('march') !== '0';
// R8 调试开关：?unlimited=1 关掉「一月一令」，只给截图/自测/批量数据用，默认关闭。
const UNLIMITED = qs.get('unlimited') === '1';
const MARCH_DBG = qs.get('marchdbg') === '1';
// ?aidbg=1：把每月 AI 月報（君主/四段計數/候選/ArgMax 結果）寫進 #marchdbg（--dump-dom 可讀）
const AI_DBG = qs.get('aidbg') === '1';
// ?seed=N：把 Math.random 换成可复现的 mulberry32（只用于调试/截图，正式流程仍用 Math.random）
const seedParam = Number.parseInt(qs.get('seed') ?? '', 10);
if (Number.isFinite(seedParam) && seedParam > 0) {
  let s = seedParam >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 疲勞（原作 general+0x3A）
// [[FATIGUE_CORE]] 與 game/web/main.js 的同名塊保持一致（純函數、無 DOM）；tests/fatigue.test.ts
// 會從兩個檔案抽出本段直接執行並比對，避免頁面各寫一套。疲勞不進攻力/命中，只做戰後累加、
// 每月衰減，以及「≥60 → 士氣 -1」的間接影響（docs/04b5 §Q2）。
const TIRE_MAX = 100;
const TIRE_HIGH = 60; // 原作 0x41B34E cmp 0x3c
function tireClamp(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(TIRE_MAX, Math.max(0, Math.trunc(v))) : 0;
}
function tireAdd(cur, gain) {
  const add = Number(gain);
  return Math.min(TIRE_MAX, tireClamp(cur) + (Number.isFinite(add) ? Math.max(0, Math.trunc(add)) : 0));
}
// 戰後增量：原作 0x41048D 有秒數 idiv 10 + 15；沒有秒數 15 + rand()%8。
function tireGain(sec, rng) {
  const s = Number(sec);
  if (Number.isFinite(s) && s >= 0) return 15 + Math.trunc(s / 10);
  const r = typeof rng === 'function' ? Number(rng()) : 0;
  const k = Number.isFinite(r) ? Math.min(7, Math.max(0, Math.floor(r * 8))) : 0;
  return 15 + k;
}
function tireNormalize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (typeof name !== 'string' || !name) continue;
    const v = Number(value);
    if (Number.isFinite(v)) out[name] = Math.min(TIRE_MAX, Math.max(0, Math.trunc(v)));
  }
  return out;
}
function tireOf(save, name) {
  const map = tireNormalize(save && save.tire);
  return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : 0;
}
// 戰後：雙方主將各抽一次（秒數已知時兩次相同；未知時是兩個 rand()%8，和原作兩次取样一致）。
function tireBattle(save, aName, bName, sec, rng) {
  const tire = tireNormalize(save && save.tire);
  const gainA = tireGain(sec, rng);
  const gainB = tireGain(sec, rng);
  const beforeA = tire[aName] ?? 0;
  const beforeB = tire[bName] ?? 0;
  const afterA = tireAdd(beforeA, gainA);
  tire[aName] = afterA;
  const afterB = bName === aName ? afterA : tireAdd(beforeB, gainB);
  if (bName !== aName) tire[bName] = afterB;
  if (save && typeof save === 'object') save.tire = tire;
  return { gainA, gainB, beforeA, beforeB, afterA, afterB };
}
// 每月：原作 0x41B1BF 先 -1，再用減後的值判 ≥60 → 士氣 -1（所以 60→59 不觸發、61→60 觸發）。
// officersByCity 是本勢力各城在職武將；save.tire 裡殘留的名字（敵將/已離隊）也一併衰減。
function tireMonthly(save, officersByCity) {
  const tire = tireNormalize(save && save.tire);
  const cities = (save && save.cities) || {};
  const lists = officersByCity && typeof officersByCity === 'object' ? officersByCity : {};
  const names = new Set();
  const employed = new Set();
  for (const list of Object.values(lists)) {
    if (!Array.isArray(list)) continue;
    for (const name of list) {
      if (typeof name !== 'string' || !name) continue;
      names.add(name);
      employed.add(name);
    }
  }
  for (const name of Object.keys(tire)) names.add(name);
  let decayed = 0;
  let high = 0;
  for (const name of names) {
    const cur = tire[name] ?? 0;
    if (cur > 0) { tire[name] = cur - 1; decayed += 1; }
    if (employed.has(name) && tire[name] >= TIRE_HIGH) high += 1;
  }
  let moraleLoss = 0;
  let moraleSkipped = 0;
  for (const [city, list] of Object.entries(lists)) {
    if (!Array.isArray(list)) continue;
    let hits = 0;
    for (const name of list) if (typeof name === 'string' && tire[name] >= TIRE_HIGH) hits += 1;
    if (!hits) continue;
    const st = cities[city];
    if (st && typeof st === 'object' && Number.isFinite(Number(st.morale))) {
      st.morale = Math.max(0, Math.trunc(Number(st.morale)) - hits);
      moraleLoss += hits;
    } else {
      moraleSkipped += hits;
    }
  }
  if (save && typeof save === 'object') save.tire = tire;
  return { decayed, high, moraleLoss, moraleSkipped };
}
// [[/FATIGUE_CORE]]

// [[MORALE_CORE]] 士氣（原作 general+0x38，0..100）：**武將級**，不是城池級。
// 這一段必須在 main.js 與 campaign.html 各存一份（純函數、無 DOM）；tests/morale.test.ts 會從
// 兩個檔案抽出本段直接執行並比對兩份行為一致，避免頁面與測試各寫一套。
// 出處：docs/04b5 §Q2（新將 0x42D468 mov word [..+0x38],0x50 = 80；每月 0x41B1BF 的士氣分支）
// 與 docs/04b §2.5（戰力第 5 段 (士氣−50)/5，idiv 向零截斷）。
const MORALE_MAX = 100;
const MORALE_DEFAULT = 60;   // 本作存檔缺省（原作新將是 80；沿用 60 是為了不讓老檔一讀檔就變強/變弱）
// 與 FATIGUE_CORE 的 TIRE_HIGH 同值；MORALE_CORE 可能被單獨抽出執行，所以不引用外部常數。
const MORALE_TIRE_HIGH = 60;
// [新設計] 低迷自然恢復門檻：原作 0x41B1BF 是「疲勞 <60 且士氣 <70 → 士氣 +1」，
// 本作改成士氣 <30 才 +1，讓「疲勞高 → 士氣掉 → 打不動 → 休整幾個月才回」形成真閉環。
// 原作未確認，標 [新設計]。
const MORALE_LOW = 30;
// [新設計] 戰敗懲罰：原作 0x447520 只對 status=3（被俘）的武將扣 0x14=20 點士氣；
// 「戰敗方主將一律 −10」是本作簡化，不是原作數值，標 [新設計]。
const MORALE_DEFEAT_LOSS = 10;
function moraleClamp(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(MORALE_MAX, Math.max(0, Math.trunc(v))) : MORALE_DEFAULT;
}
function moraleNormalize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (typeof name !== 'string' || !name) continue;
    if (value === null || typeof value === 'boolean' || value === '') continue;
    const v = Number(value);
    if (Number.isFinite(v)) out[name] = Math.min(MORALE_MAX, Math.max(0, Math.trunc(v)));
  }
  return out;
}
function moraleOf(save, name) {
  const map = moraleNormalize(save && save.morale);
  return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : MORALE_DEFAULT;
}
// 寫單個武將士氣：回傳夾取後的值；save 壞掉時只回值、不寫（純函數更好測）。
function moraleSet(save, name, value) {
  const v = moraleClamp(value);
  if (!save || typeof save !== 'object' || typeof name !== 'string' || !name) return v;
  const map = moraleNormalize(save.morale);
  map[name] = v;
  save.morale = map;
  return v;
}
// 出戰：core 的 powerOf 讀 world.sides[side].morale（battle.ts:381），而 createWorld 會重建
// GeneralState，只認 cfg 裡的幾個字段；所以兩處都要在 createWorld 之後寫一次：
//   rt.morale        → 戰力第 5 段
//   rt.general.morale → HUD/戰報（純顯示，core 不讀）
function moraleApply(world, side, value) {
  const v = moraleClamp(value);
  const rt = world && world.sides ? world.sides[side] : null;
  if (!rt) return v;
  rt.morale = v;
  if (rt.general) rt.general.morale = v;
  return v;
}
// 每月：疲勞（已由 tireMonthly 先 -1）≥60 → 該武將士氣 -1（下限 0）；否則士氣 <30 → +1。
// 只動「在職武將」（officersByCity）；save.tire 裡殘留的敵將/離隊名字不碰士氣。
function moraleMonthly(save, officersByCity) {
  const lists = officersByCity && typeof officersByCity === 'object' ? officersByCity : {};
  // 不依賴 FATIGUE_CORE 的 tireNormalize：兩段在測試裡是各自獨立抽取執行的
  // （tests/morale.test.ts 只抽 MORALE_CORE），所以這裡自己容錯一次。
  const rawTire = save && save.tire && typeof save.tire === 'object' ? save.tire : {};
  const tireAt = (name) => {
    const v = Number(rawTire[name]);
    return Number.isFinite(v) ? Math.min(MORALE_MAX, Math.max(0, Math.trunc(v))) : 0;
  };
  const names = new Set();
  for (const list of Object.values(lists)) {
    if (!Array.isArray(list)) continue;
    for (const name of list) if (typeof name === 'string' && name) names.add(name);
  }
  let high = 0;
  let loss = 0;
  let recovered = 0;
  for (const name of names) {
    const cur = moraleOf(save, name);
    if (tireAt(name) >= MORALE_TIRE_HIGH) {
      high += 1;
      const after = moraleSet(save, name, cur - 1);
      if (after < cur) loss += cur - after;
    } else if (cur < MORALE_LOW) {
      const after = moraleSet(save, name, cur + 1);
      if (after > cur) recovered += 1;
    }
  }
  return { high, loss, recovered };
}
// 戰敗：主將士氣 -10（下限 0）。回傳實際扣了幾點（士氣已 0 時回 0），供戰報/測試。
function moraleDefeat(save, names) {
  const list = Array.isArray(names) ? names : [names];
  let changed = 0;
  for (const name of list) {
    if (typeof name !== 'string' || !name) continue;
    const cur = moraleOf(save, name);
    const after = moraleSet(save, name, cur - MORALE_DEFEAT_LOSS);
    if (after < cur) changed += cur - after;
  }
  return changed;
}
// 遷移：舊近似把士氣記在「城池」上（怪怪的，且 saves.js 的 cityState 根本沒這欄位）。
// 這裡只把 `cities[*].morale` 改名成 `cityMorale` 保留數值，**絕不**搬成武將士氣
// （兩者同名會打架：武將級才是真的）。回傳搬了幾座城，供啟動提示/測試。
function moraleMigrateCities(save) {
  const cities = save && save.cities;
  if (!cities || typeof cities !== 'object') return 0;
  let moved = 0;
  for (const st of Object.values(cities)) {
    if (!st || typeof st !== 'object' || Array.isArray(st)) continue;
    if (!Object.prototype.hasOwnProperty.call(st, 'morale')) continue;
    const v = Number(st.morale);
    if (!Object.prototype.hasOwnProperty.call(st, 'cityMorale')) {
      st.cityMorale = Number.isFinite(v)
        ? Math.min(MORALE_MAX, Math.max(0, Math.trunc(v)))
        : MORALE_DEFAULT;
    }
    delete st.morale;
    moved += 1;
  }
  return moved;
}
// [[/MORALE_CORE]]
// 這次讀檔把幾座城的城池級 morale 改名了（boot 時提示用；loadSlot 不清零也不重複提示）
let cityMoraleMoved = 0;

// ---------------------------------------------------------------- 數據：5 個劇本
const [scenRaw, sysRaw, generals, garRaw, magics, wises] = await Promise.all([
  fetch('../data/scenarios.json').then((r) => r.json()),
  fetch('../data/sango_system.json').then((r) => r.json()).catch(() => ({})),
  fetch('../data/generals.json').then((r) => r.json()),
  // 守將表缺了也要能開：kingOf/majorOf 會退回 scenarios.json 的 KING/MAJOR
  fetch('../data/garrison.json').then((r) => r.json()).catch(() => null),
  // 武將技/軍師技：`createLearnState()` 要用 name 反查（core/unlock.ts:295 learnTableOf）。
  // 缺了就是「學不到東西」（pendingLearn 全空），不會拋錯。
  fetch('../data/magics.json').then((r) => r.json()).catch(() => []),
  fetch('../data/wises.json').then((r) => r.json()).catch(() => []),
]);
// sango_system.json：Times01 = "Times1.INI, 黃巾之亂"，名称取逗号后的部分
function systemName(sys, i) {
  const raw = sys?.['Times0' + (i + 1)];
  if (typeof raw !== 'string') return '';
  const cut = raw.indexOf(',');
  return (cut >= 0 ? raw.slice(cut + 1) : raw).trim();
}
const SCEN = scenRaw.map((s, i) => ({
  ...s,
  i,
  id: Number(s.id) || i + 1,
  name: systemName(sysRaw, i) || s?.system?.TIME || `劇本${i + 1}`,
  year: Number(s?.system?.YEAR) || 184,
  kings: Array.isArray(s.kings) ? s.kings : [],
  cities: Array.isArray(s.cities) ? s.cities : [],
  paths: Array.isArray(s.paths) ? s.paths : [],
}));

// ---------------------------------------------------------------- 守將真值（garrison.json）
// 和 deploy.html 同一份 GDATA 形狀：scenarios 給 garrisonOf 兜底算，generals 給它認人。
const GDATA = {
  scenarios: SCEN,
  generals,
  garrison: garRaw,
  // R68 學習流程（core/unlock.ts）按 SEQUENCE 反查技名，缺了只會學不到、不會拋
  magics: Array.isArray(magics) ? magics : (magics?.magics || []),
  wises: Array.isArray(wises) ? wises : (wises?.wises || []),
};
// garrison.json 是靜態資料（不隨存檔變），按「劇本下標 + 城名」快取，免得每次 render
// 都對 60 座城重算一遍。
const GARR_CACHE = new Map();
function garrisonIn(name) {
  const key = currentScenarioIdx() + '\u0000' + name;
  if (!GARR_CACHE.has(key)) {
    let g = null;
    try { g = garrisonOf(GDATA, currentScenarioIdx(), name); } catch { g = null; }
    GARR_CACHE.set(key, g);
  }
  return GARR_CACHE.get(key);
}

/**
 * R78 在野名冊：`buildWorld()` 為了讓 AI 有人可用，把城內所有人一律標成「登」，
 * 但君主繼承、殘將處置要看真實的 `+0x91 & 1`（garrison.json 的 status：登/野/俘）。
 * 這裡回傳「明確不是 1（在職）」的名字集合；名冊上沒有的人（AI 調動/自訂）一律當在職。
 */
function wildRoster() {
  const m = new Set();
  for (const c of ALL) {
    for (const o of garrisonIn(c.NAME)?.officers || []) {
      // normStatus() 回 '登'/'俘'/'野'（不是數字），只有 '登' 才算在職
      if (o?.name && MM.normStatus(o.status) !== '登') m.add(o.name);
    }
  }
  return m;
}

/**
 * 勢力名。劇本 1 有 12 座城的 KING 是轉換殘留的數字 1..12，garrison.json 已寫成
 * owner:""；原作裡這種城就是空城，所以只認字符串，數字一律當空城（不印「勢力 1」）。
 */
function kingOf(name) {
  const g = garrisonIn(name);
  if (g && typeof g.owner === 'string' && g.owner) return g.owner;
  // garrison.owner 是空串時再退回劇本 KING：劇本 1 有 21 座城 garrison 沒寫 owner，
  // 但 KING 是正常勢力名（另一批 12 座是數字殘留，下面 typeof 會濾掉）。
  const k = cityOf(name)?.KING;
  return typeof k === 'string' ? k : '';
}

/** 太守：掛名的那位（洛陽＝何進），不是「最強守將」（曹操） */
function majorOf(name) {
  const g = garrisonIn(name);
  if (g && typeof g.major === 'string' && g.major) return g.major;
  const m = cityOf(name)?.MAJOR;
  return typeof m === 'string' ? m : '';
}

/** 守將名單：每次取前 count 名（N≥2 時太守一定入選，見 docs/30 §5） */
function guardsOf(name, count = 3) {
  const list = typeof defendersOf === 'function' ? defendersOf(GDATA, currentScenarioIdx(), name, count) : [];
  return (Array.isArray(list) ? list : []).map((o) => o && o.name).filter(Boolean);
}

// ---------------------------------------------------------------- 狀態
let scenario = SCEN[0];
let ALL = scenario.cities;
let cities = ALL;            // 全部 60 城都进列表与地图
let adj = new Map();         // 道路图（按当前剧本重建）
let save = null;
let store = null;            // sanguo_saves_v1 容器
let activeSlot = 1;          // 1..10，界面上的"槽 N"
let gameStarted = false;     // false = 只是背景预览，还没真正开局
let boot = { mode: 'new', migrated: false, synced: false, slot: 1, battle: false };
let pendingScenario = 0;     // 剧本浮层里当前选中的剧本
let confirmAction = null;
let confirmCancel = null;    // 確認浮層「取消」時要跑的動作（行軍抵達＝退兵）
let marchDebug = [];         // ?marchdbg=1 的每月 armies 快照
let aiDebugLog = [];         // ?aidbg=1 的每月 AI 月報
let selected = null;
let snapshotUpgrade = null;   // R70：{from,to,steps} — 讀到舊版快照時記一次，開局後提示

const storage = (() => { try { return window.localStorage; } catch { return null; } })();
const scenarioNameOf = (id) => SCEN.find((s) => s.id === Number(id))?.name || '';

function buildAdj(sc) {
  const m = new Map();
  for (const c of sc.cities) m.set(c.NAME, new Set());
  for (const p of sc.paths) {
    if ((p.Length || 0) >= 30000) continue;   // 哨兵路径：画了线但不可走
    if (!m.has(p.Start) || !m.has(p.End)) continue;
    m.get(p.Start).add(p.End);
    m.get(p.End).add(p.Start);
  }
  return m;
}

// ---------------------------------------------------------------- 行軍（與 src/core/march.ts 同構）
// 瀏覽器不能直接 import .ts（dist 由建置流程產生，本輪不動），所以把純邏輯鏡像一份。
// 改這裡時請同步 game/src/core/march.ts；tests/march.test.ts 測的是那份。
const MARCH_PER_MONTH = 1 / 3;
const SENTINEL_LENGTH = 30000;
// R75：出征兵力不再固定 100，改由主將帶兵上限 dispatchCapOf(城) 決定（min(等級×5,100)）。

/** 相邻两城之间的一条可走路；跳过哨兵，非相邻返回 null */
function marchPath(a, b) {
  if (!a || !b || a === b) return null;
  for (let i = 0; i < scenario.paths.length; i++) {
    const p = scenario.paths[i];
    if (!p || (Number(p.Length) || 0) >= SENTINEL_LENGTH) continue;
    if ((p.Start === a && p.End === b) || (p.Start === b && p.End === a)) return i;
  }
  return null;
}

/** 原作按道路长度计月：近的 1 个月、中的 2 个月、远的 3 个月 */
function marchMonths(pi) {
  const len = Number(scenario.paths[pi]?.Length) || 0;
  return Math.max(1, Math.min(3, Math.ceil(len / 100)));
}

/** 每月进度：标准 1/3，近路按倍率加到 1 个月到 */
function marchStep(pi) {
  return MARCH_PER_MONTH * (3 / marchMonths(pi));
}

function clamp01(n) {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function cityOf(name) {
  return ALL.find((c) => c.NAME === name) || null;
}

/** 折线上按 progress 插值；方向由 army.from 决定（从路的终点出发时反向） */
function armyPos(a) {
  const p = scenario.paths[a.pathIndex];
  if (!p) return [0, 0];
  const raw = Array.isArray(p.points) ? p.points : [];
  const pts = raw
    .filter((q) => Array.isArray(q) && q.length >= 2 && Number.isFinite(Number(q[0])) && Number.isFinite(Number(q[1])))
    .map((q) => [Number(q[0]), Number(q[1])]);
  if (pts.length < 2) {
    const s = cityOf(p.Start), e = cityOf(p.End);
    if (s?.pos_xy) pts.push([s.pos_xy[0], s.pos_xy[1]]);
    if (e?.pos_xy) pts.push([e.pos_xy[0], e.pos_xy[1]]);
  }
  if (!pts.length) return [0, 0];
  if (pts.length === 1) return pts[0];
  const t = clamp01(Number(a.progress));
  const along = a.from === p.End && a.from !== p.Start ? 1 - t : t;
  let total = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d); total += d;
  }
  if (total <= 0) return pts[0];
  let want = along * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const k = segs[i] > 0 ? Math.min(1, want / segs[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    want -= segs[i];
  }
  return pts[pts.length - 1];
}

/** 推进一个月（原地改 progress），到达的进 arrived；已到的不再前进 */
function advanceArmies(list) {
  const arrived = [], still = [];
  for (const a of list) {
    const p = Number.isFinite(Number(a.progress)) ? clamp01(Number(a.progress)) : 0;
    if (p < 1) a.progress = clamp01(p + marchStep(a.pathIndex));
    (a.progress >= 1 ? arrived : still).push(a);
  }
  return { arrived, still };
}

/** 同一条路、相向、进度交错 → 路上相遇 */
function armiesIntercept(a, b) {
  if (!a || !b || a.id === b.id || a.side === b.side) return false;
  if (a.pathIndex !== b.pathIndex || a.from !== b.to || a.to !== b.from) return false;
  const pa = clamp01(Number(a.progress));
  const pb = clamp01(Number(b.progress));
  if (pa <= 0 || pb <= 0 || pa >= 1 || pb >= 1) return false;
  return pa + pb >= 1;
}

function nextArmyId() {
  save.armySeq = Saves.intOr(save.armySeq, 0, 0) + 1;
  return `m${save.month}-${save.armySeq}`;
}

function removeArmy(id) {
  save.armies = (save.armies || []).filter((a) => a.id !== id);
}

function applyScenario(idx) {
  const i = Number.isInteger(idx) && idx >= 0 && idx < SCEN.length ? idx : 0;
  scenario = SCEN[i];
  ALL = scenario.cities;
  cities = ALL;
  adj = buildAdj(scenario);
  selected = null;
  renderScenarioStrip();
}

function currentScenarioIdx() {
  const i = SCEN.indexOf(scenario);
  return i >= 0 ? i : 0;
}

// 从"我方任一城"出发的最少道路数
function distFromOwned(target) {
  const seen = new Set(save.owned);
  let frontier = save.owned.slice();
  let d = 0;
  while (frontier.length && d < 30) {
    if (frontier.includes(target)) return d;
    const next = [];
    for (const n of frontier) {
      for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); next.push(m); }
    }
    frontier = next; d++;
  }
  return 99;
}

const mine = (n) => save.owned.includes(n);
function troopsOf(name) { return save.cities[name]?.troops ?? 0; }
/**
 * R75 出兵數上限：本城主將的帶兵上限 `min(等級×5, 100)`。
 * 與 deploy.html:323 的 `SOLDIER_CAP`、原作 0x409FB6/0x409FD8 同一個口徑；
 * 舊版固定 `DISPATCH_TROOPS = 100`，等於不管主將等級都給滿編（R75 的缺口）。
 */
function dispatchCapOf(name) {
  const g = localGeneral(name) || defenderOf(name);
  return MM.troopCapOf(g ? generalLevelOf(g.name) : 1);
}

// ---------------------------------------------------------------- 勢力歸屬（R78 + R4）
/**
 * 靜態勢力表：garrison.json 的 owner（`""` 或數字 KING 一律當空城），只做兜底。
 * 動態歸屬一律走 forceAt()：AI 打下一座城會改 `save.cities[城].owner`，
 * 靜態表只負責「第一次見到這座城時它是誰的」。
 */
function staticOwners() {
  const out = {};
  for (const c of ALL) out[c.NAME] = kingOf(c.NAME);
  return out;
}
/** 當前歸屬：存檔 owner 優先（AI 攻打會變），沒有才退回劇本靜態值；'' = 空城 */
function forceAt(n) {
  const st = save && save.cities ? save.cities[n] : null;
  if (st && typeof st.owner === 'string' && st.owner) return st.owner;
  // 存檔 owner 是空串時也要退回靜態表：garrison.json 的 owner 才是「這城屬於誰」的權威，
  // 劇本 cities[].KING 有 27 座是空的（轉換殘留），只認它會讓地圖幾乎全是無主色。
  return kingOf(n);
}
/**
 * 把「城 → 勢力」寫進存檔並與 save.owned 對齊（main.js 的戰鬥寫回只認 owned，
 * 所以玩家這一側永遠以 owned 為準，同時把 owner 補成君主）。
 */
function refreshForces() {
  if (!save) return;
  // 顺序要紧：city+0x10 是归属的权威，先把 save.owned 的归属对齐到君主，
  // 再按城反建势力表；否则「玩家拿到的城」会同时挂在原势力的城链上，
  // 后面 AI 就会拿着过期的链去规划我方城池（表现为 AI 打自己人）。
  AI.syncOwned(save);
  AI.buildForces(save, staticOwners());
  AI.syncOwned(save);
}

// ---------------------------------------------------------------- R70 勢力分色 / 寫檔快照
/** 玩家势力 id（原作靠「玩家君主编号 +0x54」判断谁是玩家；这里是 save.force） */
function playerForceId() {
  try { return MM.forceIdOf(save) || ''; } catch { return ''; }
}
/** 这城是不是玩家这边的（自己占的，或归属玩家势力） */
function isPlayerForce(force) {
  const me = playerForceId();
  return Boolean(force && me && force === me);
}
/** 城 → '#RRGGBB'：14 家色板在 web/saves.js（FORCE_PALETTE），这里只查不算 */
function forceColorAt(name) {
  return Saves.forceColorOf(forceAt(name));
}
/** '#RRGGBB' + alpha → 'rgba(...)'（画半透明填充/深色描边用）；坏值退回中性灰 */
function withAlpha(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 6 ? parseInt(h, 16) : NaN;
  if (!Number.isFinite(n)) return `rgba(138,132,120,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * R70 写档前的城摘要查询：纯逻辑在 saves.js（prepareSnapshot / fillCitySummaries），
 * 这里只提供 garrison.json 的太守/军师/城内武将（字段口径见 saves.js citySummaryOf 的表，
 * 对齐 docs/07b 段2「城池」记录）。
 */
function cityInfoOf(name) {
  const cd = cityOf(name);
  const g = garrisonIn(name);
  const roster = (CM.rosterOf(save, name, { scenIdx: currentScenarioIdx(), generals: GDATA.generals }) || [])
    .map((x) => (x && typeof x === 'object' ? x.NAME : x))
    .filter((n) => typeof n === 'string' && n);
  return {
    owner: forceAt(name),
    major: CM.majorOf(save, cd) || majorOf(name),
    wise: CM.wiseOf(save, cd) || (g && typeof g.wise === 'string' ? g.wise : '') || String(cd?.WISE || ''),
    roster,
  };
}
/** 写档用的 snapshot：升级格式 + 60 城摘要 + 400 将等级/经验 + 14 家势力表 */
function snapshotForSave() {
  ensureGeneralLevels();
  // R70：原作段 4 是固定 512 槽，等級/經驗屬於「每個武將」，不是只記在場那幾個。
  // ensureGeneralLevels 只補在冊武將（實測 142），這裡把 generals.json 其餘（不含盜賊）也按
  // BaseEXP 補齊到 400 —— 換劇本/換君主時，武將等級才不會被重新算一次。
  for (const g of (GDATA.generals || [])) {
    if (!g || !g.NAME || g.NAME === '盜賊') continue;
    if (save.generalLevel[g.NAME] == null) {
      const exp = Math.max(0, Math.trunc(Saves.num(g.BaseEXP)));
      save.generalLevel[g.NAME] = generalLevelOf(g.NAME);
      save.generalExp[g.NAME] = exp;
    }
  }
  refreshForces();
  return Saves.prepareSnapshot(save, ALL, { info: cityInfoOf }) || save;
}

// ---------------------------------------------------------------- 武將等級 / 學習（R68 口徑統一）
/**
 * 原作等級只在存檔（SSAV，R70 明確不做）裡；`data/generals.json` **沒有 LEVEL 欄位**，
 * 只有 `BaseEXP`（實測 400 名武將全是 200、`盜賊` 9999）。所以權威順序是：
 *   1. 存檔 `save.generalLevel[名]` —— 唯一可成長的來源，換月/升級都寫這裡；
 *   2. `?level=N` —— 除錯覆蓋，**不落檔**（只想對照戰鬥平衡時用）；
 *   3. `levelFromExp(BaseEXP)` —— 200 → Lv2（帶兵 10）、9999 → Lv12（帶兵 60）。
 * 這條是**唯一**的等級來源：campaign 的出征/守城與 deploy.html（`?lv=`）都讀同一張表。
 * [新設計] 「存檔優先、BaseEXP 兜底」這個次序本身沒有反匯編證據（原作直接讀 SSAV 的等級欄位）。
 */
const LEVEL_OVERRIDE = (() => {
  const v = Number(qs.get('level'));
  return Number.isFinite(v) && v >= 1 ? Math.min(99, Math.trunc(v)) : 0;
})();

/** `generals.json` 的一行（備 HP/MP/EXP 給 `defenderBattleParams`） */
function generalRow(name) {
  if (!name) return null;
  return (GDATA.generals || []).find((g) => g && g.NAME === name) || null;
}

/** 武將等級：存檔 → `?level=` → `levelFromExp(BaseEXP)` → 1 */
function generalLevelOf(name) {
  if (LEVEL_OVERRIDE) return LEVEL_OVERRIDE;
  const raw = save?.generalLevel ? Number(save.generalLevel[name]) : NaN;
  if (Number.isFinite(raw) && raw >= 1) return Math.min(99, Math.trunc(raw));
  const exp = Number(generalRow(name)?.BaseEXP);
  const lv = levelFromExp(Number.isFinite(exp) ? exp : 0);
  return Math.max(1, Math.min(99, lv || 1));
}

/** 武將經驗（顯示/升級判定用）：存檔 → `BaseEXP` → 0 */
function generalExpOf(name) {
  const raw = save?.generalExp ? Number(save.generalExp[name]) : NaN;
  if (Number.isFinite(raw) && raw >= 0) return Math.trunc(raw);
  const exp = Number(generalRow(name)?.BaseEXP);
  return Number.isFinite(exp) && exp >= 0 ? Math.trunc(exp) : 0;
}

/** 當前劇本的武將等級/經驗寫進存檔（只補缺，不覆蓋已有值；`?level=` 不落檔） */
function ensureGeneralLevels() {
  if (!save) return;
  if (!save.generalLevel || typeof save.generalLevel !== 'object' || Array.isArray(save.generalLevel)) {
    save.generalLevel = {};
  }
  if (!save.generalExp || typeof save.generalExp !== 'object' || Array.isArray(save.generalExp)) {
    save.generalExp = {};
  }
  for (const c of ALL) {
    for (const o of garrisonIn(c.NAME)?.officers || []) {
      if (!o || !o.name) continue;
      if (!(Number(save.generalLevel[o.name]) >= 1)) save.generalLevel[o.name] = generalLevelOf(o.name);
      if (!Number.isFinite(Number(save.generalExp[o.name]))) save.generalExp[o.name] = generalExpOf(o.name);
    }
  }
}

/**
 * 武將名 → `defenderBattleParams()` 吃的「generals 行 + 運行期等級」。
 * `defenderBattleParams` 優先讀 `general.level`（`core/garrison.ts:433`），
 * 存檔等級就從這裡進 `min(5L,100)+clamp((L-20)*5,0,100)` 那兩條式子。
 */
function battleRowOf(name) {
  const row = generalRow(name) || {};
  return { ...row, level: generalLevelOf(name) };
}

/**
 * 月末補學（`core/unlock.ts:436` `monthlyLearnCheck` = `applyLearn(state, pendingLearn(state))`）。
 * 原作「升級補學」有地址（0x40A183/0x40A227 → `onLevelUp`），月末兜底是 `[推測]`（見 unlock.ts:434 註解）；
 * 任務書要求把這條流程掛起來，所以這裡只補我方城的武將，結果寫回 `save.learned`。
 * @returns {Array<{name:string, got:Array<{kind:string,seq:number,name:string,learn:number}>}>}
 */
function monthlyLearn(target) {
  const out = [];
  if (!target) return out;
  if (!target.learned || typeof target.learned !== 'object' || Array.isArray(target.learned)) target.learned = {};
  for (const city of target.owned || []) {
    for (const o of garrisonIn(city)?.officers || []) {
      if (!o || !o.name || o.name === '盜賊') continue;
      const known = target.learned[o.name] || {};
      const state = createLearnState(GDATA, o.name, generalLevelOf(o.name), {
        magic: known.magic,
        wise: known.wise,
      });
      const got = monthlyLearnCheck(state);
      if (!got.length) continue;
      target.learned[o.name] = { magic: state.magic.slice(), wise: state.wise.slice() };
      out.push({ name: o.name, got });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 啟動：讀存檔位 / 舊檔遷移
store = Saves.loadStore(storage);

// ?demo=1：完全沒有存檔時鋪 5 個示範槽（僅截圖/演示用，正常流程不會觸發）
if (qs.get('demo') === '1' && !Saves.hasAny(store)) seedDemoSlots(store);

const legacy = Saves.readLegacy(storage);
const legacyOk = !!(legacy && (Array.isArray(legacy.owned) || legacy.seeded === true));

let bootSlot = Saves.lastUsed(store) + 1;
if (!store.slots[bootSlot - 1] && Saves.hasAny(store)) {
  const newest = Saves.newestSlot(store);
  if (newest >= 0) bootSlot = newest + 1;
}

const curEntry = store.slots[bootSlot - 1];
if (curEntry && curEntry.snapshot) {
  const snap = curEntry.snapshot;
  // main.js 只認 sanguo_campaign_v1：戰鬥寫回後它的 ts 會比槽裡的 snapshot 新
  const sameScenario = !legacyOk || !legacy.scenario || !snap.scenario
    || Number(legacy.scenario) === Number(snap.scenario);
  const legacyNewer = legacyOk && sameScenario && Saves.num(legacy.ts) > Saves.num(snap.ts);
  save = Saves.deepClone(legacyNewer ? legacy : snap);
  activeSlot = bootSlot;
  gameStarted = true;
  boot = {
    mode: 'continue', migrated: false, synced: legacyNewer, slot: bootSlot,
    battle: legacyNewer && isBattleDelta(snap, legacy),
  };
} else if (legacyOk) {
  // 舊版單檔 → 槽 1（任務 ⑤）；失敗就退回"新遊戲"
  const migrated = Saves.migrateLegacy({ storage, now: Date.now(), scenarioNameOf });
  if (migrated.migrated) {
    store = migrated.store;
    save = Saves.deepClone(migrated.snapshot);
    activeSlot = 1;
    gameStarted = true;
    boot = { mode: 'continue', migrated: true, synced: false, slot: 1, battle: false };
  }
}

if (!save) {
  // 首訪：先拿劇本 1 鋪一張背景，真正開局的劇本由玩家在浮層裡選
  save = Saves.newCampaign(SCEN[0]);
  activeSlot = Math.min(Saves.SLOT_COUNT, Math.max(1, Saves.lastUsed(store) + 1));
  boot = { mode: 'new', migrated: false, synced: false, slot: activeSlot, battle: false };
}

save = normalizeCampaign(save);
// 舊近似把士氣記在城池上：遷移時只改名成 cityMorale，不搬成武將士氣（同名會打架）。
if (cityMoraleMoved > 0) {
  notice(`存檔遷移：${cityMoraleMoved} 座城的城池級 morale 已改名 cityMorale；士氣自本版起為武將級`, 12000);
}
const bootScen = SCEN.findIndex((s) => s.id === Number(save.scenario));
applyScenario(bootScen >= 0 ? bootScen : 0);
save.scenario = scenario.id;
ensureCityState();
save.ts = Saves.num(save.ts);
// R4：老檔沒有 king → 按 owned 第一座城的 KING 補；補不出來留空（頂欄顯示「未選」＋換君主）
ensureKing();

const selParam = qs.get('sel');
if (selParam && ALL.some((c) => c.NAME === selParam)) selected = selParam;

if (gameStarted) {
  if (boot.migrated) {
    Saves.writeLegacy(save, storage);
    // 遷移只搬了舊鍵的值（可能只有 1 座城）。立刻補寫一次完整快照：60 城摘要、14 家勢力、
    // 400 將等級都會在這次寫入補齊，槽位列表才不會顯示「城 1 / 勢力 0」。
    autosave(false);
    notice('偵測到舊版存檔（sanguo_campaign_v1），已自動遷移到槽 1', 12000);
  } else if (snapshotUpgrade) {
    autosave(false);   // 升級後的快照立刻寫回該槽，下次開就不用再升
    notice(`舊存檔格式已自動升級：v${snapshotUpgrade.from} → v${snapshotUpgrade.to}（槽 ${boot.slot}）`, 12000);
  } else if (boot.synced) {
    autosave(!save.ts);
    notice((boot.battle ? '戰鬥結果已寫回，' : '進度已同步，') + `自動存到槽 ${activeSlot}`, 12000);
  } else {
    Saves.writeLegacy(save, storage);
  }
}
refreshBadge();

// ---------------------------------------------------------------- 存檔位：寫 / 讀 / 刪
function slotNo() {
  const n = Math.trunc(Saves.num(activeSlot)) || 1;
  return Math.min(Saves.SLOT_COUNT, Math.max(1, n));
}

function refreshBadge() {
  const b = $('slotBadge');
  if (b) b.textContent = gameStarted ? `槽 ${slotNo()}` : '未開局';
}

/** 只鏡像舊鍵（main.js 的戰鬥寫回通道），不寫槽 */
function persist() {
  if (!gameStarted || !save) return;
  save.ts = Date.now();
  Saves.writeLegacy(save, storage);
}

/** 寫入"最近使用的槽"（預設槽 1）。stamp=false 時保留 snapshot 自帶的 ts（戰鬥寫回用） */
function autosave(stamp = true) {
  if (!gameStarted || !save) return null;
  if (stamp || !save.ts) save.ts = Date.now();
  const n = slotNo();
  activeSlot = n;
  // R70：写档前补 60 城摘要 / 400 将等级 / 势力表（纯逻辑在 saves.js）
  const snap = snapshotForSave();
  const entry = Saves.writeSlot(store, n - 1, snap, { scenarioName: scenario.name, ts: save.ts });
  if (!entry) return null;
  Saves.saveStore(store, storage);
  Saves.writeLegacy(snap, storage);
  refreshBadge();
  return entry;
}

function saveToSlot(index) {
  const i = Saves.slotIndex(index);
  if (i < 0) return;
  if (!gameStarted) return notice('尚未開局：先選劇本開始新遊戲。');
  save.ts = Date.now();
  const snap = snapshotForSave();
  const entry = Saves.writeSlot(store, i, snap, { scenarioName: scenario.name, ts: save.ts });
  if (!entry) return notice('存檔失敗：槽位無效。');
  Saves.saveStore(store, storage);
  Saves.writeLegacy(snap, storage);
  activeSlot = i + 1;
  refreshBadge();
  renderSlotRows();
  const msg = `已存入槽 ${i + 1} · ${scenario.name} · ${Saves.monthLabel(save.month)}`;
  flash(msg);
  notice(msg);
}

function loadSlot(index) {
  const i = Saves.slotIndex(index);
  if (i < 0) return;
  const entry = store.slots[i];
  if (!entry || !entry.snapshot) return notice(`槽 ${i + 1} 是空的。`);
  const snap = Saves.deepClone(entry.snapshot);
  const si = SCEN.findIndex((s) => s.id === Number(snap.scenario));
  applyScenario(si >= 0 ? si : 0);
  cityMoraleMoved = 0;
  save = normalizeCampaign(snap);
  save.scenario = scenario.id;
  save.ts = Saves.num(save.ts) || Saves.num(entry.ts) || Date.now();
  ensureCityState();
  ensureKing();   // R4：換了槽也要重算君主（老檔按城補）
  selected = null;
  activeSlot = i + 1;
  gameStarted = true;
  store.last = activeSlot;
  Saves.saveStore(store, storage);
  Saves.writeLegacy(save, storage);
  closeOverlays();
  refreshBadge();
  render();
  resizeCanvas();
  notice(`已讀取槽 ${i + 1} · ${scenario.name} · ${Saves.monthLabel(save.month)} · 城 ${save.owned.length}`);
}

function deleteSlot(index) {
  const i = Saves.slotIndex(index);
  if (i < 0) return;
  if (!store.slots[i]) return notice(`槽 ${i + 1} 是空的。`);
  const wasActive = slotNo() === i + 1;
  Saves.clearSlot(store, i);
  Saves.saveStore(store, storage);
  // 全部槽都刪光：連舊鍵一起清，避免下次啟動又被當成"舊版存檔"遷移回來
  if (!Saves.hasAny(store)) Saves.clearLegacy(storage);
  renderSlotRows();
  refreshBadge();
  const msg = wasActive
    ? `已刪除槽 ${i + 1}；進行中的進度會在下次自動存檔時重新寫入槽 ${slotNo()}`
    : `已刪除槽 ${i + 1}`;
  flash(msg);
  notice(msg);
}

// ---------------------------------------------------------------- 浮層
function hideSheets() {
  document.querySelectorAll('.sheet').forEach((el) => { el.hidden = true; });
  $('scrim').hidden = true;
}
function openSheet(id) {
  hideSheets();
  $('scrim').hidden = false;
  $(id).hidden = false;
}
function closeOverlays() {
  hideSheets();
  confirmAction = null;
  confirmCancel = null;
}

function notice(msg, ms = 9000) {
  const el = $('notice');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(notice._t);
  notice._t = setTimeout(() => { el.hidden = true; }, ms);
}

const SAVE_TIP = '存＝寫入該槽（覆蓋） · 讀＝回到該槽 · 刪＝清空 · 雙擊槽位可改名。<br>' +
  '存檔格式 v2（自動升級舊檔） · 新遊戲只覆蓋目前使用中的槽，其他槽不動。';

function openSaveSheet() {
  const el = $('saveMsg');
  if (el) {
    clearTimeout(flash._t);
    el.innerHTML = SAVE_TIP;
    el.classList.remove('on');
  }
  renderSlotRows();
  openSheet('saveSheet');
}

/** 浮層打開時 notice 會被 scrim 蓋住，所以在浮層 footer 再顯示一次結果 */
function flash(msg) {
  const el = $('saveMsg');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(flash._t);
  flash._t = setTimeout(() => {
    el.innerHTML = SAVE_TIP;
    el.classList.remove('on');
  }, 7000);
}

function renderSlotRows() {
  const rows = [];
  for (let i = 0; i < Saves.SLOT_COUNT; i++) {
    const e = store.slots[i];
    const active = gameStarted && slotNo() === i + 1;
    if (!e) {
      rows.push(`<div class="slot empty${active ? ' on' : ''}">
        <div class="sl">
          <div class="l1"><b>槽 ${i + 1}</b> · 空</div>
          <div class="l2">可存入目前進度</div>
        </div>
        <div class="sbtns">
          <button type="button" data-slot="${i}" data-do="save">存</button>
          <button type="button" disabled>讀</button>
          <button type="button" disabled>刪</button>
        </div>
      </div>`);
      continue;
    }
    const p = Saves.slotParts(e, i);   // [槽N, 剧本, 第X年Y月, 城N, X勝Y敗, 时间, 君主X, 勢力N, 將N]
    const tag = active ? '<span class="tag">使用中</span>' : '';
    const slotName = typeof e.slotName === 'string' && e.slotName ? ` · <span class="nm">${e.slotName}</span>` : '';
    const monarch = String(e.monarch || '').trim();
    const dot = Saves.forceColorOf(monarch);   // 君主=势力 id 时的旗色，和地图同一张色板
    rows.push(`<div class="slot${active ? ' on' : ''}" data-slot="${i}" title="雙擊可改名">
      <div class="sl">
        <div class="l1"><i class="fdot" style="background:${dot}"></i><b>槽 ${i + 1}</b>${slotName} · ${p[1]}${tag}</div>
        <div class="l2">${p[2]} · ${p[3]} · ${p[4]} · ${p[5]}</div>
        <div class="l3">${p[6]} · ${p[7]}${Saves.intOr(e.extinctCount, 0) ? `（亡 ${Saves.intOr(e.extinctCount, 0)}）` : ''} · ${p[8]}</div>
      </div>
      <div class="sbtns">
        <button type="button" data-slot="${i}" data-do="save">存</button>
        <button type="button" data-slot="${i}" data-do="load">讀</button>
        <button type="button" data-slot="${i}" data-do="del">刪</button>
      </div>
    </div>`);
  }
  $('slotRows').innerHTML = rows.join('');
  $('saveSub').textContent = gameStarted
    ? `自動存檔：推進一月 / 戰鬥寫回 → 槽 ${slotNo()}；手動可存到任一槽 · 存檔格式 v${Saves.SNAPSHOT_VERSION}`
    : `目前沒有進行中的存檔；先在「新遊戲」選劇本開局 · 存檔格式 v${Saves.SNAPSHOT_VERSION}`;
}

/* ---------------- R4 開局選君主 ---------------- */
// 劇本 [KING] 只有 NAME/FLAGNUM/SELECT/Type 四欄（docs/03c），沒有獨立國號欄位：
// 群英傳2 的「勢力」就是君主本人，所以頂欄「勢力」顯示君主名，旗號另外標在卡片上。
let pickMode = 'scenario';   // 'scenario' 選劇本 | 'king' 新檔選君主 | 'fix' 老檔補君主
let pendingKing = '';

// 用 function 宣告（會提升）：`?demo=1` 在建槽時（boot 段，約 :1048）就會呼叫 kingFlagOf，
// 若這裡寫 `const kingRoster = ...` 會踩 TDZ（Cannot access 'kingRoster' before initialization）。
function kingRoster(sc = scenario) {
  return (Array.isArray(sc?.kings) ? sc.kings : []).filter((k) => k && typeof k.NAME === 'string' && k.NAME);
}
/** 君主名下所有城（原文 KING 是字符串；數字 KING 是轉換殘留，按空城處理） */
function citiesOfKing(name, sc = scenario) {
  return (sc?.cities || [])
    .filter((c) => typeof c.KING === 'string' && c.KING === name)
    .map((c) => c.NAME);
}
function kingFlagOf(name, sc = scenario) {
  const k = kingRoster(sc).find((x) => x.NAME === name);
  return k ? Saves.intOr(k.FLAGNUM, 0, 0) : 0;
}
/** 選君主浮層裡正在看的劇本 */
function pickScenario() {
  return pickMode === 'fix' ? scenario : (SCEN[pendingScenario] || scenario);
}
/**
 * 頂欄：君主 <名> · 勢力 <國號/旗>；老檔補不出來就顯示「未選」並給「換君主」入口。
 * R4：君主名與勢力分開顯示（繼承後兩者不同名，勢力 id 不變）；R65：下面一行月度漂移結果。
 */
function renderKingBar() {
  const king = MM.monarchOf(save);
  const fid = MM.forceIdOf(save);
  $('kingName').textContent = king || '未選';
  const flag = Saves.intOr(save?.forces?.[fid]?.flag, king ? kingFlagOf(king) : 0, 0);
  $('kingdomName').textContent = fid ? (flag ? `${fid} · 旗${flag}` : fid) : '—';
  $('kingEdit').hidden = !gameStarted;
  $('dbgUnlimited').hidden = !UNLIMITED;
  $('btnForces').hidden = !gameStarted;
  const drift = save?.drift;
  const hasDrift = Boolean(gameStarted && drift && Saves.intOr(drift.month, 0, 0));
  $('driftbar').hidden = !hasDrift;
  $('driftLine').textContent = hasDrift ? MM.driftText(save) : '—';
}
/**
 * 老檔沒有 king：先取 owned 裡第一座「有主」的城的 KING（原作 04c §2.1：城→勢力 = city+0x10），
 * 逐城 KING 不一致時取 owned 裡最常見的那個；都沒有就留空（允許之後在頂欄重選）。
 * 舊版只看 owned[0]，開局三城第一座是空城時君主會一直「未選」→ AI 會把我方城當成 ACT 5 打，
 * 而不是 ACT 4「攻擊player」。
 */
function ensureKing() {
  if (!MM.monarchOf(save)) {
    const tally = new Map();
    for (const n of save.owned || []) {
      const k = kingOf(n);
      if (typeof k === 'string' && k) tally.set(k, (tally.get(k) || 0) + 1);
    }
    let best = '', bestN = 0;
    for (const [k, c] of tally) if (c > bestN) { best = k; bestN = c; }
    // R4：monarch / force / monarchSince 三欄一起補；勢力 id 沿用已有的（繼承後可能與君主名不同）
    if (best) MM.setMonarch(save, best, { month: Saves.intOr(save.monarchSince, save.month, 1), force: save.force || best });
  } else if (!MM.forceIdOf(save)) {
    MM.setMonarch(save, MM.monarchOf(save), { month: Saves.intOr(save.monarchSince, save.month, 1) });
  }
  refreshForces();   // R78：君主定了才建得出勢力表（城→勢力）
  return MM.monarchOf(save);
}
/** 老檔「換君主」：只改 king 欄位與頂欄，不動已佔的城 */
function applyKingToSave(name) {
  save.king = typeof name === 'string' ? name : '';
  // R4：monarch/force/monarchSince 三欄一起補（勢力 id ＝ 君主本人；劇本 KING 沒有國號欄）
  MM.setMonarch(save, save.king, { month: Saves.intOr(save.monarchSince, save.month, 1) });
  refreshForces();
  pushLog(save.king ? `君主：${save.king}（勢力 ${save.king}）` : '君主：未選', 'info');
  persist();
  autosave();
  render();
  notice(save.king ? `君主已設為 ${save.king}` : '已清除君主');
}

/* ---------------- R4 君主屬性 / R78 勢力一覽 / 讓位 / 滅亡 ---------------- */
// 原作文檔：君主編號存放 04c §2.1（city+0x10、玩家 0x4A64F0）；君主不可俘 0x40975E；
// 劇本 KING 段只有 NAME/FLAGNUM → 「勢力」就是君主本人，繼承時只換君主、不換勢力 id。

/** 全部 60 城的守將（garrison.json）。勢力聚合用它算「武將數」，只算在職 */
function officersByCityAll() {
  const out = {};
  for (const c of ALL) {
    const list = garrisonIn(c.NAME)?.officers;
    out[c.NAME] = Array.isArray(list) ? list : [];
  }
  return out;
}

/** 某勢力的城（按當前歸屬，city+0x10 走 forceAt） */
function forceCities(id) {
  return ALL.filter((c) => forceAt(c.NAME) === id).map((c) => c.NAME);
}

/** 勢力一覽的即時資料（每次開抽屜重算；60 城 × 守將，量很小） */
function forceRosterNow() {
  return MM.forceRoster(save, {
    cities: ALL,
    ownerOf: (n) => forceAt(n),
    officersByCity: officersByCityAll(),
  });
}

/** 君主屬性卡（點頁頭的君主名） */
function monarchCardHtml() {
  const name = MM.monarchOf(save);
  if (!name) {
    return '<div class="scard"><div class="scn">未選君主</div>'
      + '<div class="scm">這份存檔還沒有君主（老檔）。點下面的「換君主」補登，或開新遊戲。</div></div>';
  }
  const row = generalRow(name) || {};
  const lv = generalLevelOf(name);
  const st = MM.officerStatus(save, {
    name, str: Saves.num(row.STR), int: Saves.num(row.INT),
    loyal: Number.isFinite(Number(row.LOYAL)) ? Number(row.LOYAL) : null, status: '登',
  }, row);
  const id = MM.forceIdOf(save);
  const cities = forceCities(id);
  const force = save.forces?.[id] || {};
  const officers = officersByCityAll();
  let count = 0;
  for (const n of cities) count += (officers[n] || []).filter((o) => MM.isEmployed(o)).length;
  const since = Saves.intOr(save.monarchSince, save.month, 1);
  return `<div class="scard on">
      <div class="scn">${name}${force.flag ? ` · 旗${force.flag}` : ''}</div>
      <div class="scm">勢力 ${id || '—'} · 君主自 ${MM.monthTag(since)} 起</div>
      <div class="scm">武 ${st.str || '—'} · 智 ${st.int || '—'} · 等級 ${lv}</div>
      <div class="scm">忠誠 ${st.loyal} · 士氣 ${st.spirit} · 疲勞 ${st.tire}</div>
      <div class="sct">名下 ${cities.length} 城 · ${count} 名在職武將${cities.length ? `（${cities.slice(0, 5).join('、')}${cities.length > 5 ? '…' : ''}）` : ''}</div>
    </div>
    <div class="scard"><div class="scm">原作：君主隨城破陣亡 → 同勢力在職武將繼位（勢力名/旗色不變）；無人可繼或城已丟光 → 勢力滅亡，殘將按忠誠與 LoyalKing 定投降/在野。</div>
      <div class="sct">君主不可俘（0x40975E），所以只有「陣亡」與「讓位」兩條退場路徑。</div></div>`;
}

function openMonarchSheet() {
  if (!gameStarted) return notice('尚未開局：先選劇本開始新遊戲。');
  const name = MM.monarchOf(save);
  $('monTtl').textContent = name ? `君 主 · ${name}` : '君 主';
  $('monSub').textContent = name
    ? `勢力 ${MM.forceIdOf(save) || '—'} · 即位 ${MM.monthTag(Saves.intOr(save.monarchSince, save.month, 1))}`
    : '這份存檔沒有君主';
  $('monBody').innerHTML = monarchCardHtml();
  $('monFoot').textContent = name ? '「讓位」＝同勢力在職武將裡換一位君主（勢力不變）' : '';
  $('btnAbdicate').hidden = !name;
  openSheet('monarchSheet');
}

/** 讓位浮層：只列本勢力在職武將（排除現任君主），照忠誠/能力排序 */
function openThroneSheet() {
  if (!gameStarted) return;
  const cands = MM.abdicateCandidates(save, {
    cities: ALL,
    ownerOf: (n) => forceAt(n),
    officersByCity: officersByCityAll(),
  });
  $('throneSub').textContent = `勢力 ${MM.forceIdOf(save) || '—'} · 現任 ${MM.monarchOf(save) || '—'} · ${cands.length} 位可繼位`;
  $('throneRows').innerHTML = cands.length
    ? cands.map((o) => `<div class="scard" data-heir="${o.name}">
        <div class="scn">${o.name}${o.clan ? ' · 同族' : ''}</div>
        <div class="scm">武 ${o.str} · 智 ${o.int} · 忠誠 ${o.loyal ?? '—'} · 駐 ${o.city}</div>
        <div class="sct">繼位後勢力仍為 ${MM.forceIdOf(save) || '—'}</div>
      </div>`).join('')
    : '<div class="scard"><div class="scn">沒有可讓位的武將</div><div class="scm">本勢力名下城池裡沒有其他在職武將（俘虜/在野不算）。</div></div>';
  $('throneFoot').textContent = cands.length ? '選一位 → 立即寫存檔' : '';
  openSheet('throneSheet');
}

/** 讓位：合法動作，落存檔（monarch / monarchSince / forces[id].king） */
function doAbdicate(heir) {
  const res = MM.abdicate(save, heir, { month: save.month });
  if (!res.ok) return notice(res.reason === 'same' ? '他已經是君主了。' : '讓位失敗：沒有可繼位的武將。');
  pushLog(`${res.force} 讓 位：${res.from} → ${res.to}（勢 力 不 變）`, 'info');
  persist();
  autosave();
  closeOverlays();
  render();
  notice(`${res.from} 讓位給 ${res.to}，勢力 ${res.force} 存續`);
}

/** 勢力一覽（抽屜）：每勢力 城數 / 在職武將 / 君主 / 是否滅亡 */
function renderForceSheet() {
  const rows = forceRosterNow();
  const alive = rows.filter((r) => r.alive).length;
  $('forceTtl').textContent = '勢 力 一 覽';
  $('forceSub').textContent = `${rows.length} 家 · 存續 ${alive} · 滅亡 ${rows.length - alive} · 城 ${ALL.length}`;
  $('btnForceBack').hidden = true;
  $('forceRows').innerHTML = rows.map((r) => {
    const tag = r.player ? '我方' : (r.alive ? '存續' : '已滅亡');
    const cls = r.alive ? (r.player ? ' on' : '') : ' off';
    return `<div class="scard${cls}" data-force="${r.id}">
      <div class="scn">${r.name}${r.flag ? ` · 旗${r.flag}` : ''}</div>
      <div class="scm">君主 ${r.monarch || '—'} · ${tag}${r.endedAt ? `（${MM.monthTag(r.endedAt)} 亡）` : ''}</div>
      <div class="sct">城 ${r.cityCount} · 在職武將 ${r.officerCount}${r.surrenderCount ? ` · 降將 ${r.surrenderCount}` : ''}</div>
    </div>`;
  }).join('') || '<div class="scard"><div class="scn">沒有勢力</div></div>';
  $('forceFoot').textContent = '點一家看城池與武將明細（含忠誠/士氣/疲勞）';
}

/** 勢力明細：城列表 + 武將（忠誠/士氣/疲勞/狀態/殘將歸宿） */
function renderForceDetail(id) {
  const detail = MM.forceDetail(save, id, {
    cities: ALL,
    ownerOf: (n) => forceAt(n),
    officersByCity: officersByCityAll(),
    rowOf: (name) => generalRow(name),
  });
  if (!detail) return;
  $('forceTtl').textContent = `勢 力 · ${detail.name}`;
  $('forceSub').textContent = `君主 ${detail.monarch || '—'}${detail.flag ? ` · 旗${detail.flag}` : ''} · ${detail.alive ? '存續' : '已滅亡'}${detail.endedAt ? `（${MM.monthTag(detail.endedAt)}）` : ''}`;
  $('btnForceBack').hidden = false;
  const cityBits = detail.cities.length ? detail.cities.join('、') : '（無城池）';
  const officers = detail.officers.length
    ? detail.officers.map((o) => `<div class="scard">
        <div class="scn">${o.name}${o.status !== '登' ? ` · ${o.statusText}` : ''}</div>
        <div class="scm">武 ${o.str || '—'} · 智 ${o.int || '—'} · 忠誠 ${o.loyal} · 士氣 ${o.spirit} · 疲勞 ${o.tire}</div>
        ${o.fate ? `<div class="sct">殘將歸宿：${MM.FATE_TEXT[o.fate] || o.fate}</div>` : ''}
      </div>`).join('')
    : '<div class="scard"><div class="scm">名下沒有在職武將</div></div>';
  $('forceRows').innerHTML = `<div class="scard"><div class="scn">城池 ${detail.cityCount}</div><div class="scm">${cityBits}</div></div>`
    + `<div class="scard"><div class="scn">武將 ${detail.officers.length}</div><div class="scm">在職 ${detail.officerCount} · 殘將歸宿見每張卡</div></div>`
    + officers;
  $('forceFoot').textContent = '← 回一覽 可返回';
}

function openForceSheet() {
  if (!gameStarted) return notice('尚未開局：先選劇本開始新遊戲。');
  renderForceSheet();
  openSheet('forceSheet');
}

/**
 * R78 滅亡（真實流程的唯一出口）：forces.alive=false / cities=[] / endedAt，
 * 殘將按 Loyal / LoyalKing 定投降或在野，写 save.fate，并出战报行 + UI 提示。
 * 城池归属由调用方（破城/换主）负责；本函数只记录。
 */
function forceExtinct(forceId, deadName, opts = {}) {
  if (!forceId || !save?.forces || !save.forces[forceId]) return null;
  const wasPlayer = forceId === MM.forceIdOf(save);
  const f = save.forces[forceId];
  const res = MM.extinguish(save, forceId, {
    month: save.month,
    dead: deadName || f.king || forceId,
    officers: Array.isArray(opts.officers) ? opts.officers : [],
  });
  if (!res?.ok) return null;
  pushLog(`${forceId} 勢 力 滅 亡：名下已無城池${wasPlayer ? '（我方）' : ''}`, 'lost');
  if (res.fates.length) pushLog(MM.fateText(res.fates), 'lost');
  if (wasPlayer) {
    notice(`我方勢力「${forceId}」滅亡：君主 ${deadName || f.king || forceId} 陣亡，殘將 ${res.fates.length} 人按忠誠定去留`, 14000);
  } else if (res.fates.length) {
    notice(`${forceId} 勢力滅亡，${MM.fateText(res.fates)}`, 12000);
  }
  return res;
}


function showPicker(mode = 'scenario', idx) {
  pendingScenario = Number.isInteger(idx) ? idx : currentScenarioIdx();
  pickMode = mode === 'king' ? 'king' : (mode === 'fix' ? 'fix' : 'scenario');
  const src = pickScenario();
  const roster = kingRoster(src);
  // 補登時預選現任君主；換人時預選第一個還有城的君主
  const cur = pickMode === 'fix' && save?.king && roster.some((k) => k.NAME === save.king) ? save.king : '';
  pendingKing = pickMode === 'scenario' ? ''
    : (cur || roster.find((k) => citiesOfKing(k.NAME, src).length)?.NAME || '');
  renderPickCards();
  const hasGame = gameStarted;
  $('pickX').hidden = !hasGame;
  $('btnPickCancel').hidden = !hasGame;
  updatePickChrome();
  openSheet('pickSheet');
}

function renderPickCards() {
  if (pickMode === 'scenario') {
    $('pickCards').innerHTML = SCEN.map((s, i) => {
      const first = s.cities.slice(0, 3).map((c) => c.NAME).join(' · ');
      return `<div class="scard${i === pendingScenario ? ' on' : ''}" data-pick="${i}">
        <div class="scn">${s.name}</div>
        <div class="scm">${s.year} 年 · ${s.kings.length} 勢力 · ${s.cities.length} 城 · ${s.paths.length} 條道路</div>
        <div class="sct">開局三城：${first}</div>
      </div>`;
    }).join('');
    return;
  }
  // R4：君主選擇 —— 只列 [KING] 裡的君主，每張卡給 名字 / 勢力 / 起始城數
  const sc = pickScenario();
  const kings = kingRoster(sc);
  $('pickCards').innerHTML = kings.map((k) => {
    const cs = citiesOfKing(k.NAME, sc);
    const flag = Saves.intOr(k.FLAGNUM, 0, 0);
    const on = k.NAME === pendingKing;
    return `<div class="scard${on ? ' on' : ''}${cs.length ? '' : ' off'}" data-king="${k.NAME}"${cs.length ? '' : ' data-off="1"'}>
      <div class="scn">${k.NAME}</div>
      <div class="scm">勢力 ${k.NAME}${flag ? ` · 旗${flag}` : ''} · 起始 ${cs.length} 城</div>
      <div class="sct">${cs.length
        ? `城池：${cs.slice(0, 4).join(' · ')}${cs.length > 4 ? ` 等 ${cs.length} 城` : ''}`
        : '此劇本名下無城（不可選）'}</div>
    </div>`;
  }).join('') || '<div class="sub">此劇本沒有可選君主。</div>';
}

/** 君主浮層的標題/按鈕/警告文案（三種模式共用） */
function updatePickChrome() {
  const kingMode = pickMode !== 'scenario';
  $('pickTtl').textContent = pickMode === 'fix' ? '選 擇 君 主（補 登）'
    : (kingMode ? '選 擇 君 主' : '選 擇 劇 本');
  const sc = pickScenario();
  $('pickSub').textContent = kingMode
    ? `《${sc?.name || ''}》${kingRoster(sc).length} 位君主 · 選定後其名下城池全部歸你`
    : '切換後依該劇本的城池與道路重建地圖，並給前三城';
  const n = pendingKing ? citiesOfKing(pendingKing, sc).length : 0;
  $('btnPickStart').textContent = pickMode === 'scenario' ? '選 君 主 →'
    : (pickMode === 'fix' ? '確 定' : '開 始 新 遊 戲');
  $('btnPickStart').disabled = kingMode && !n;
  $('pickWarn').textContent = pickMode === 'fix'
    ? '老檔補登君主：只寫存檔的 king 欄位，不會重設你已佔的城。'
    : (pickMode === 'king'
      ? `已選 ${pendingKing || '—'}：名下 ${n} 城全部歸你（兵/民/金沿用劇本原始值）。`
      : (gameStarted
        ? `開始新遊戲會覆蓋槽 ${slotNo()} 中進行中的進度（${scenario.name} · ${Saves.monthLabel(save.month)}），其他槽位不受影響。`
        : '目前沒有任何存檔，選好劇本後直接開始。'));
}

function confirmBox(title, msg, ok, onCancel) {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent = msg;
  confirmAction = typeof ok === 'function' ? ok : null;
  confirmCancel = typeof onCancel === 'function' ? onCancel : null;
  openSheet('confirmSheet');
}

function startNewGame(idx, king) {
  applyScenario(idx);
  save = Saves.newCampaign(scenario, { ts: Date.now() });
  save.scenario = scenario.id;
  // R4：君主決定「我是誰」——名下所有城歸玩家；沒給君主時退回舊行為（前三城）
  const k = typeof king === 'string' ? king : '';
  if (k) {
    // R4 三欄：monarch=君主名 / force=勢力 id / monarchSince=即位月（新開局都是同一人）
    MM.setMonarch(save, k, { month: 1 });
    const own = citiesOfKing(k);
    save.owned = own.slice();
    for (const n of own) {
      const c = cities.find((x) => x.NAME === n);
      if (c) save.cities[n] = Saves.cityState(c);
    }
  }
  // 換新檔＝新的月份開始，月令狀態歸零
  save.lastActionMonth = 0;
  ensureCityState();
  ensureKing();   // R4 + R78：君主定了才建得出勢力表（沒給君主時按 owned 首城補）
  selected = null;
  gameStarted = true;
  activeSlot = slotNo();
  const snap = snapshotForSave();   // R70：新檔也直接落 60 城摘要 + 勢力表
  Saves.writeSlot(store, activeSlot - 1, snap, { scenarioName: scenario.name, ts: save.ts });
  Saves.saveStore(store, storage);
  Saves.writeLegacy(snap, storage);
  closeOverlays();
  refreshBadge();
  render();
  resizeCanvas();
  notice(`新遊戲：《${scenario.name}》君主 ${save.king || '—'} · ${Saves.monthLabel(save.month)} · 已存槽 ${activeSlot}`);
}

// ?demo=1 的示範槽：只為截圖展示 10 槽的排版，正常啟動不會進來
function seedDemoSlots(st) {
  const now = Date.now();
  const demo = [
    { sc: 0, month: 1, gold: 1200, wins: 0, losses: 0, extra: 0, age: 0.02 },
    { sc: 1, month: 18, gold: 3820, wins: 4, losses: 1, extra: 2, age: 3 },
    { sc: 3, month: 26, gold: 6410, wins: 7, losses: 3, extra: 4, age: 9 },
    { sc: 2, month: 9, gold: 2140, wins: 2, losses: 0, extra: 0, age: 26 },
    { sc: 4, month: 41, gold: 9120, wins: 11, losses: 5, extra: 6, age: 51 },
    { sc: 0, month: 30, gold: 5200, wins: 6, losses: 2, extra: 5, age: 2 },
    { sc: 1, month: 52, gold: 7600, wins: 9, losses: 4, extra: 8, age: 14 },
    { sc: 2, month: 7, gold: 1500, wins: 1, losses: 1, extra: 1, age: 35 },
    { sc: 3, month: 63, gold: 11200, wins: 14, losses: 6, extra: 10, age: 70 },
    { sc: 4, month: 22, gold: 3300, wins: 3, losses: 2, extra: 3, age: 120 },
  ];
  // 400 將的等級/經驗：按 generals.json 的 BaseEXP 走 levelFromExp（與 ensureGeneralLevels 同口徑）
  const levels = {};
  for (const g of generals) {
    if (!g || !g.NAME || g.NAME === '盜賊') continue;
    const exp = Math.trunc(Number(g.BaseEXP) || 0);
    levels[g.NAME] = { level: Math.max(1, Math.min(99, levelFromExp(exp) || 1)), exp };
  }
  demo.forEach((d, i) => {
    const sc = SCEN[d.sc];
    if (!sc) return;
    const snap = Saves.newCampaign(sc, { ts: now - Math.round(d.age * 3600e3) });
    snap.month = d.month;
    snap.gold = d.gold;
    snap.wins = d.wins;
    snap.losses = d.losses;
    snap.defWins = Math.floor(d.wins / 2);
    for (const c of sc.cities.slice(3, 3 + d.extra)) snap.owned.push(c.NAME);
    // 君主：取「已佔各城靜態歸屬」裡出現最多的那家（與 ensureKing 同口徑）；
    // 都沒有就退回劇本第一座城的 KING。?demo=1 不跑 boot 流程，這三欄得自己補。
    const tally = new Map();
    for (const n of snap.owned) {
      const o = snap.cities[n] && snap.cities[n].owner;
      if (typeof o === 'string' && o) tally.set(o, (tally.get(o) || 0) + 1);
    }
    let monarch = '';
    let bestN = 0;
    for (const [k2, cnt] of tally) if (cnt > bestN) { monarch = k2; bestN = cnt; }
    if (!monarch && typeof sc.cities[0]?.KING === 'string') monarch = sc.cities[0].KING;
    if (monarch) { snap.king = monarch; snap.monarch = monarch; snap.force = monarch; snap.monarchSince = 1; }
    for (const [name, lv] of Object.entries(levels)) {
      snap.generalLevel[name] = lv.level;
      snap.generalExp[name] = lv.exp;
    }
    // 势力表：按城反建（?demo=1 不跑 AI，手工建一份，槽位摘要才有「勢力N/亡N」）
    Saves.fillCitySummaries(snap, sc.cities);
    snap.forces = {};
    for (const c of sc.cities) {
      const f = snap.cities[c.NAME] && snap.cities[c.NAME].owner;
      if (!f) continue;
      if (!snap.forces[f]) snap.forces[f] = { id: f, king: f, flag: kingFlagOf(f, sc), alive: true, cities: [], ts: 0 };
      snap.forces[f].cities.push(c.NAME);
    }
    snap.log = [{ t: Saves.monthLabel(d.month), s: '示範存檔（?demo=1）', k: 'info' }];
    Saves.writeSlot(st, i, Saves.prepareSnapshot(snap, sc.cities), { scenarioName: sc.name, ts: snap.ts });
  });
  st.last = 1;
  Saves.saveStore(st, storage);
}

// ---------------------------------------------------------------- 渲染
function renderScenarioStrip() {
  const cur = currentScenarioIdx();
  $('scName').textContent = scenario.name;
  $('scstrip').innerHTML = SCEN.map((s, i) =>
    `<div class="sc${i === cur ? ' on' : ''}" data-sc="${i}"><b>${s.name}</b><small>${s.year} 年</small></div>`).join('');
}

function render() {
  $('scName').textContent = scenario.name;
  $('ym').textContent = `${Math.floor((save.month - 1) / 12) + 1} 年 ${((save.month - 1) % 12) + 1} 月`;
  $('gold').textContent = save.gold.toLocaleString();
  $('ct').textContent = save.owned.length;
  $('rec').textContent = Saves.recordText(save) + (save.defWins ? ` · 守 ${save.defWins}` : '');
  renderKingBar();
  // R8 一月一令：本月已经下过令 → 徵兵/開發/出征 全部置灰（推進一月不受限）
  const locked = CM.monthLocked(save, UNLIMITED);
  const dis = locked ? ' disabled' : '';
  const sub = (normal) => locked ? CM.LOCK_HINT : normal;

  $('list').innerHTML = cities.map((c) => {
    const st = save.cities[c.NAME];
    const cls = ['city', mine(c.NAME) ? 'mine' : '', selected === c.NAME ? 'target' : ''].join(' ').trim();
    const force = forceAt(c.NAME);
    const color = Saves.forceColorOf(force);
    return `<div class="${cls}" data-name="${c.NAME}">
      <div class="n"><i class="fdot" style="background:${color}"></i>${c.NAME}<span>${mine(c.NAME) ? '我方' : (force || '無主')}</span></div>
      <div class="s"><b>${st.troops}</b> 兵 · 防 ${c.DEFENSE ?? '—'}</div>
      <div></div><div class="s">${st.pop.toLocaleString()} 人 · $${st.money.toLocaleString()}</div>
    </div>`;
  }).join('');

  const acts = [];
  const isMine = selected && mine(selected);
  if (selected && isMine) {
    acts.push(`<div class="btn" data-act="recruit"${dis}><span>徵 兵</span><small>${sub('金 500 → 兵 +40')}</small></div>`);
    acts.push(`<div class="btn" data-act="develop"${dis}><span>開 發</span><small>${sub('金 400 → 民 +3000')}</small></div>`);
    acts.push(`<div class="btn primary" data-act="city"><span>內 政</span><small>內政八命令</small></div>`);
    if (MARCH_ON) {
      const cap = dispatchCapOf(selected);   // R75：按主將帶兵上限（原固定 100）
      const ready = troopsOf(selected) >= cap && !locked;
      acts.push(`<div class="btn primary" data-act="dispatch" ${ready ? '' : 'disabled'}>` +
        `<span>出 征</span><small>${locked ? CM.LOCK_HINT : (ready ? '選相鄰敵城 · 兵 ' + cap : '守軍不足 ' + cap)}</small></div>`);
    }
  } else if (selected) {
    const g = commander();
    const d = distFromOwned(selected);
    const ok = d === 1 && !locked;
    // `?march=0` 是回歸對照用的舊入口：那時點敵城＝直接進 index.html 野戰（不經過出征編成）。
    // 默認（MARCH_ON）走 `march` → deploy.html 出征編成，兩條都在。
    const attackAct = MARCH_ON ? 'march' : 'march_direct';
    acts.push(`<div class="btn primary" data-act="${attackAct}" ${ok ? '' : 'disabled'}>` +
      `<span>出 征</span><small>${locked ? CM.LOCK_HINT : (ok
        ? `目標 ${selected}${g ? ' · 主將 ' + g.name : ''}${MARCH_ON ? '' : ' · 直接野戰'}`
        : (d >= 99 ? '與我方領土不接壤' : `需 ${d} 段路，先打近的`))}</small></div>`);
  }
  const income = save.owned.reduce((s, n) => s + Math.floor((save.cities[n]?.pop || 0) / 5000) * 4, 0);
  acts.push(`<div class="btn full" data-act="advance"><span>推進一月</span><small>稅收 +${income}</small></div>`);
  $('actions').innerHTML = acts.join('');

  $('hint').textContent = selected
    ? (isMine
      ? `內政：${selected} 兵 ${troopsOf(selected)} · 民 ${save.cities[selected].pop.toLocaleString()} · 金 ${save.cities[selected].money.toLocaleString()}`
      : (() => {
        // 敵城：太守/守將/守軍都走 garrison.json，不再拿防御值當武力代理
        const names = guardsOf(selected, 3);
        const chief = garrisonIn(selected)?.officers?.[0]?.name || '無人';
        return `出征 ${selected}：勢力 ${forceAt(selected) || '無主'} · 太守 ${majorOf(selected) || '—'} · 主將 ${chief}`
          + `（守軍 ${troopsOf(selected)} 兵 · 守將 ${names.length ? names.join('、') : '無人'}）`;
      })())
    : '點城選中；自己的城可內政，別人的城可出征。';

  if ($('mapwrap').style.display !== 'none') drawMap();
  renderLog();
}

// 戰報面板：最近 8 條，新的在上
function renderLog() {
  const box = $('logrows');
  if (!box) return;
  const rows = (save.log || []).slice(-8).reverse();
  box.innerHTML = rows.length
    ? rows.map((r) => `<div class="logrow ${r.k || ''}"><span class="m">${r.t}</span><span>${r.s}</span></div>`).join('')
    : '<div class="logrow"><span class="m">—</span><span>尚無戰事。推進一月，等敵軍上門。</span></div>';
}

function toast(msg) {
  $('hint').textContent = msg;
  $('hint').style.color = '#F3E0B4';
  setTimeout(() => { $('hint').style.color = ''; render(); }, 1200);
}

// ---------------------------------------------------------------- 行軍：出兵 / 目標選擇
function openMarchTargets() {
  if (!MARCH_ON || !selected || !mine(selected)) return;
  const targets = [...(adj.get(selected) || [])]
    .filter((n) => !mine(n))
    .map((n) => {
      const pi = marchPath(selected, n);
      const c = cityOf(n);
      return pi === null ? null : {
        name: n, pi, len: Number(scenario.paths[pi].Length) || 0,
        months: marchMonths(pi), troops: troopsOf(n),
        // 全部走 garrison.json：勢力/太守/守將名單（空的城顯示空城 + 無人）
        king: forceAt(n), major: majorOf(n), guards: guardsOf(n, 3),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.len - b.len) || a.name.localeCompare(b.name));

  const cap = dispatchCapOf(selected);   // R75：出兵數 = 主將帶兵上限
  const leader = localGeneral(selected) || defenderOf(selected);
  $('marchSub').textContent = `${selected} 周邊 ${targets.length} 個目標 · 出征 ${cap} 兵${leader ? ` · 主將 ${leader.name}` : ''}`;
  $('marchTargets').innerHTML = targets.length
    ? targets.map((t) => `<div class="scard" data-march="${t.name}">
      <div class="scn">${t.name}</div>
      <div class="scm">${t.major ? `${t.king ? '勢力 ' + t.king : '空城'} · 太守 ${t.major}` : (t.king ? '勢力 ' + t.king : '空城')}</div>
      <div class="scm">守將 ${t.guards.length ? t.guards.join('、') : '無人'}</div>
      <div class="scm">守軍 ${t.troops} 兵 · 道路 ${t.len} · ${t.months} 個月</div>
      <div class="sct">抵達城下再決戰</div>
    </div>`).join('')
    : '<div class="scard"><div class="scn">沒有可出征的相鄰城</div><div class="scm">先打下接壤的敵城，或切回列表看道路</div></div>';
  $('marchFoot').textContent = `出征兵力 ${cap}${leader ? `（${leader.name} Lv${generalLevelOf(leader.name)}，上限 等級×5）` : ''} · 本城守軍 ${troopsOf(selected)}`;
  openSheet('marchSheet');
}

function dispatchArmy(to) {
  if (!MARCH_ON || !save || !selected) return;
  const from = selected;
  const pi = marchPath(from, to);
  if (pi === null) return toast('沒有可走的路：只能打相鄰城。');
  const cap = dispatchCapOf(from);   // R75：不再固定 100，按主將帶兵上限
  if (troopsOf(from) < cap) return toast(`守軍不足 ${cap} 兵（主將帶兵上限），先徵兵再出征。`);
  save.cities[from].troops -= cap;
  save.armies.push({
    id: nextArmyId(), side: 'A', from, to, pathIndex: pi, progress: 0,
    troops: cap, general: (localGeneral(from) || defenderOf(from))?.name,
  });
  pushLog(`我 軍 出 征：${from} → ${to}（${cap} 兵，${marchMonths(pi)} 個月）`, 'info');
  CM.markMonthActed(save, UNLIMITED);   // R8：派兵出征也算本月已下令
  persist();   // 進戰鬥前先鏡像到舊鍵，回來時 main.js 的寫回會被偵測到
  closeOverlays();
  render();
  notice(`已從 ${from} 出征 ${to}：${cap} 兵在途，${marchMonths(pi)} 個月到城下`);
}

// ---------------------------------------------------------------- 地圖繪製
// 底图 map_sheet.png 是 1280×960，60 城的 pos_xy 就是它的像素坐标（已用
// work/bg_align_probe.py 逐点验证过），所以绘图坐标系直接用图片像素尺寸。
const IMG = { w: 1280, h: 960 };
const MAP = { x0: 0, y0: 0, x1: IMG.w, y1: IMG.h };
const USE_BG = qs.get('bg') !== '0';          // ?bg=0：关掉底图，看旧的纯色版，方便对比
const USE_ROUTES = qs.get('routes') === '1';  // 底图已把道路烘进像素，默认不再叠 116 条线
let view = { w: 750, h: 900, pad: 40 };

function plotRect() {
  // 等比 fit（V1 4:3 letterbox 裁决 A）：地图区实测 750×695，1280×960 等比放进
  // 750×695 → s = min(750/1280, 695/960) = 0.58594，图实得 750×562.5，
  // 上下各留 66.25px 给装裱带（见 drawBands）。这里**不能**再乘 0.965：
  // 旧系数会让图缩到 723×542，城点与底图仍对齐但四周多出无意义黑边。
  // toScreen() 与命中半径不随此改动，命中用的还是同一套坐标。
  const s = Math.min(view.w / IMG.w, view.h / IMG.h);
  const w = IMG.w * s, h = IMG.h * s;
  return { x: (view.w - w) / 2, y: (view.h - h) / 2, w, h, s };
}
// 底图与蒙版摆到和绘制矩形完全重合的位置，保证城点零错位
function syncBg() {
  const img = $('bgmap'), veil = $('bgveil');
  if (!img || !veil) return;
  if (!USE_BG || img.style.display === 'none') { veil.style.display = 'none'; return; }
  const r = plotRect();
  for (const el of [img, veil]) {
    el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
    el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
  }
  veil.style.display = '';
}

function resizeCanvas() {
  const cv = $('map');
  const box = $('mapwrap');
  if (!box || box.style.display === 'none') return;
  const w = box.clientWidth || 750, h = box.clientHeight || 900;
  cv.width = w; cv.height = h;
  view.w = w; view.h = h;
  syncBg();
  drawMap();
}
function toScreen(x, y) {
  const r = plotRect();
  return [r.x + (x - MAP.x0) * r.s, r.y + (y - MAP.y0) * r.s];
}

// 命中測試：螢幕座標 → 最近城（40px 內）。點擊與自檢共用同一條路徑。
const HIT_R = 40;
function hitCity(px, py) {
  let best = null, bd = 1e9;
  for (const c of ALL) {
    const [sx, sy] = toScreen(c.pos_xy[0], c.pos_xy[1]);
    const d = (sx - px) ** 2 + (sy - py) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best && bd < HIT_R * HIT_R ? best : null;
}

// ---------------------------------------------------------------- 裝裱帶（V1）
// 原作是 4:3 滿屏；豎屏地圖區 750×695 按 1280×960 等比 fit 後，圖只佔 750×562.5，
// 上下各剩 66.25px（[新设计]：原作沒有 letterbox，這層是為豎屏補的）。
// 要求：不留純黑 / 純透明；用原作 PNG 拼（cityart/rail_gold 金線、orn_corner 雲紋角飾），
// 不用 AI 圖。s 與城點座標不受影響。
const DECOR = { rail: undefined, orn: undefined };
function decorImage(key, src) {
  if (DECOR[key] === undefined) {
    const img = new Image();
    // 圖是异步載入的：載完補畫一次，避免首帧只看到沒有壓線的帶
    img.onload = () => { try { drawMap(); } catch { /* 画布未就绪时下一帧会重画 */ } };
    img.src = src;
    DECOR[key] = img;
  }
  return DECOR[key];
}

function drawBands(g) {
  const r = plotRect();
  const topH = Math.max(0, r.y);
  const botY = r.y + r.h;
  const botH = Math.max(0, view.h - botY);
  if (topH < 1 && botH < 1) return;              // 視窗剛好 4:3：不需要裝裱帶
  const rail = decorImage('rail', 'assets/cityart/rail_gold.png');
  const bandGrad = (y, h) => {
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, '#1D1710');
    grd.addColorStop(0.55, '#15110C');
    grd.addColorStop(1, '#100D09');
    return grd;
  };
  const band = (y, h) => {
    if (h < 1) return;
    g.save();
    g.fillStyle = bandGrad(y, h);
    g.fillRect(0, y, view.w, h);
    // 絹紋：極淡橫線，讓帶子有織物質感而不死黑
    g.globalAlpha = 0.045;
    g.fillStyle = '#D8B36A';
    for (let yy = y + 3; yy < y + h - 2; yy += 4) g.fillRect(0, yy, view.w, 1);
    g.restore();
  };
  band(0, topH);
  band(botY, botH);
  // 金線壓邊：rail_gold.png 是 111×12 原作金線，水平鋪滿；未載入時退回 1px 金線。
  // 內側一條 12px 實線（貼着圖邊），外側再壓一條 4px 細線，像卷軸的上下軸。
  const RAIL_W = 111, RAIL_H = 12;
  const drawRail = (cy, h = RAIL_H) => {
    if (rail && rail.complete && rail.naturalWidth > 0) {
      g.save();
      g.globalAlpha = 0.92;
      for (let x = 0; x < view.w; x += RAIL_W) g.drawImage(rail, x, cy - h / 2, RAIL_W, h);
      g.restore();
    } else {
      g.fillStyle = 'rgba(200,164,96,.55)';
      g.fillRect(0, cy - 0.5, view.w, 1);
    }
  };
  // 下带若夠高（≥58px），R70 圖例會直接寫進帶裡（見 drawMap 末尾），此時帶只留
  // 一條與地圖分界的金線，不再放外側細線/菱形/折角，免得压住图例文字。
  const legendBand = botH >= 58;
  if (topH >= RAIL_H + 4) drawRail(r.y - 9);
  if (botH >= RAIL_H + 4) drawRail(botY + (legendBand ? 6 : 9), legendBand ? 10 : RAIL_H);
  if (topH >= 16) drawRail(7, 4);
  if (botH >= 16 && !legendBand) drawRail(view.h - 7, 4);
  // 圖片邊界壓一條極細金線，讓底圖與裝裱帶有「接口」而不是硬切
  g.save();
  g.strokeStyle = 'rgba(216,179,106,.30)';
  g.lineWidth = 1;
  g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  g.restore();
  // 四角回紋：手繪金線折角（不用 cityart/orn_corner 的红色角框——那是城卡片 UI，
  // 红色会跟势力色打架）。canvas 外角各一个，像卷轴的包角。
  const bracket = (x, y, fx, fy, len = 15) => {
    g.save();
    g.strokeStyle = 'rgba(216,179,106,.52)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y + fy * len);
    g.lineTo(x, y);
    g.lineTo(x + fx * len, y);
    g.stroke();
    g.restore();
  };
  if (topH >= 18) { bracket(9, 9, 1, 1); bracket(view.w - 9, 9, -1, 1); }
  if (botH >= 18 && !legendBand) { bracket(9, view.h - 9, 1, -1); bracket(view.w - 9, view.h - 9, -1, -1); }
  // 帶中央的小菱形印記（金），給上下帶一個視覺中心（下帶放圖例時不用）
  g.save();
  g.fillStyle = 'rgba(216,179,106,.55)';
  const gem = (cx, cy) => {
    g.beginPath();
    g.moveTo(cx, cy - 4); g.lineTo(cx + 4, cy); g.lineTo(cx, cy + 4); g.lineTo(cx - 4, cy);
    g.closePath(); g.fill();
  };
  if (topH >= 14) gem(view.w / 2, topH / 2);
  if (botH >= 14 && !legendBand) gem(view.w / 2, botY + botH / 2);
  g.restore();
}

// ---------------------------------------------------------------------------
// 原作城圖元（4 档）—— `export/png/SHAPE/MAP/CITY01..04.png`
// ---------------------------------------------------------------------------
const CITY_ICON_K = 0.65;                       // 49×35 的最大档缩到 ~32×23，压在 1280 图上不糊
const CITY_ICON = [null, null, null, null, null];
let cityTierTable = null;

function cityIcon(tier) {
  let img = CITY_ICON[tier];
  if (!img) {
    img = new Image();
    img.src = `assets/map/city_${tier}.png`;
    CITY_ICON[tier] = img;
  }
  return img;
}

/** 人口四分位 → 1..4 档（`[推测]`：原作没有"城等级"字段，用人口当规模代理） */
function cityTierOf(c) {
  if (!cityTierTable) {
    const pops = ALL.map((x) => Number(x.POPULATION) || 0).sort((a, b) => a - b);
    const at = (f) => pops[Math.min(pops.length - 1, Math.max(0, Math.floor(f * pops.length)))] || 0;
    cityTierTable = { q1: at(0.25), q2: at(0.5), q3: at(0.75) };
  }
  const p = Number(c.POPULATION) || 0;
  const t = cityTierTable;
  return p >= t.q3 ? 4 : p >= t.q2 ? 3 : p >= t.q1 ? 2 : 1;
}

function citySpriteOf(c) {
  return cityIcon(cityTierOf(c));
}
function drawMap() {
  const cv = $('map'); if (!cv) return;
  const g = cv.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, cv.width, cv.height);
  syncBg();
  // ?bg=0 时才画旧的夜色底纹；有底图时画布保持透明，让下面的 .bgmap 透出来
  if (!USE_BG) {
    const grd = g.createLinearGradient(0, 0, 0, cv.height);
    grd.addColorStop(0, '#11161D'); grd.addColorStop(1, '#0B0E12');
    g.fillStyle = grd; g.fillRect(0, 0, cv.width, cv.height);
  }
  // V1：上下裝裱帶畫在底色之後（否則 ?bg=0 的整屏漸變會把它蓋掉），
  // 底圖與城點都畫在 plotRect 裡，帶子不留純黑/透明
  drawBands(g);

  const byName = new Map(ALL.map((c) => [c.NAME, c]));
  // 路径：Length>=30000 是"画了线但不可走"的哨兵，画淡一点。
  // 底图已经把道路烘进像素了，二次叠加会脏，所以默认关，?routes=1 才开。
  if (USE_ROUTES) {
    g.lineWidth = 2;
    for (const p of scenario.paths) {
      const a = byName.get(p.Start), b = byName.get(p.End);
      if (!a || !b) continue;
      const sentinel = (p.Length || 0) >= 30000;
      g.strokeStyle = sentinel ? 'rgba(120,130,145,.16)' : 'rgba(216,179,106,.24)';
      g.beginPath();
      const pts = (p.points && p.points.length) ? p.points : [a.pos_xy, b.pos_xy];
      pts.forEach(([x, y], i) => {
        const [sx, sy] = toScreen(x, y);
        if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
      });
      g.stroke();
    }
  }
  // 城（R70：归属色改按势力取色；14 家色板集中在 web/saves.js FORCE_PALETTE）
  let li = 0;
  const ring = (x, y, radius, width, color) => {
    g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2);
    g.lineWidth = width; g.strokeStyle = color; g.stroke();
  };
  for (const c of ALL) {
    const [sx, sy] = toScreen(c.pos_xy[0], c.pos_xy[1]);
    li++;
    const force = forceAt(c.NAME);
    const color = Saves.forceColorOf(force);
    const player = mine(c.NAME) || isPlayerForce(force);
    const sel = selected === c.NAME;
    // 原作城圖元：`export/png/SHAPE/MAP/CITY01..04.png`（22×18 / 33×24 / 40×28 / 49×35），
    // 按人口四分位分 4 档（`[推测]`，见 project/58）。圖元本身不分陣營；
    // R70 起归属=「勢力色環」：14 家固定色板，玩家勢力多一圈金環，選中再疊一圈亮金。
    // 圖元外先描 1px 级深色底環 —— 底图是浅色高原/海面，没有它浅色势力会被吃掉。
    const spr = citySpriteOf(c);
    const ready = !!spr && spr.complete && spr.naturalWidth > 0;
    const r = ready ? (sel ? 17 : 14) : (sel ? 15 : 11);
    if (ready) {
      const k = 0.65;
      const w = spr.naturalWidth * k;
      const h = spr.naturalHeight * k;
      g.save();
      g.globalAlpha = 0.96;
      g.drawImage(spr, sx - w / 2, sy - h / 2, w, h);
      g.restore();
      ring(sx, sy, r + 4.4, 5.6, withAlpha(Saves.FORCE_EDGE, 0.66));   // 深色描底（色環內外各留 ~1.3px 暗邊）
      ring(sx, sy, r + 4.4, 3.0, color);                               // 勢力色環
    } else {
      g.beginPath(); g.arc(sx, sy, r + 3, 0, Math.PI * 2);
      g.fillStyle = withAlpha(color, 0.34);
      g.fill();
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      g.lineWidth = 1.2; g.strokeStyle = withAlpha(Saves.FORCE_EDGE, 0.9); g.stroke();
    }
    // 玩家勢力：金色外環（原作旗色不分「我方」，金環是本作標記 —— [新設計]）
    if (player) ring(sx, sy, r + (ready ? 8 : 6.5), 2.2, Saves.FORCE_GOLD);
    // 選中：再疊一圈更亮的金環
    if (sel) ring(sx, sy, r + (ready ? 11.5 : 9.5), 2.6, '#FFF1C8');
    // 城名压一层深色描边阴影，压在底图的浅色高原/海面上也能读
    g.save();
    g.shadowColor = 'rgba(5,7,10,.92)'; g.shadowBlur = 4;
    g.fillStyle = 'rgba(242,238,228,.96)';
    g.font = '600 17px "Noto Sans SC",sans-serif';
    g.textAlign = 'center';
    // 标签一上一下错开，缓解中原一带的拥挤
    g.fillText(c.NAME, sx, li % 2 ? sy - r - 8 : sy + r + 19);
    g.restore();
  }
  // 行軍部隊：小三角箭頭沿路畫，我方綠、敵方紅，標兵力；到城下標「抵達」
  for (const a of (MARCH_ON ? save.armies || [] : [])) {
    const own = a.side === 'A';
    const [sx, sy] = toScreen(...armyPos(a));
    // 箭頭角度取前後各 2% 進度的兩點，progress 0/1 時也不會 NaN
    const t0 = clamp01(Number(a.progress) - 0.02);
    const t1 = clamp01(Number(a.progress) + 0.02);
    const [x0, y0] = toScreen(...armyPos({ ...a, progress: t0 }));
    const [x1, y1] = toScreen(...armyPos({ ...a, progress: t1 }));
    const ang = Math.atan2(y1 - y0, x1 - x0) || 0;
    g.save();
    g.translate(sx, sy);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(13, 0); g.lineTo(-8, -8); g.lineTo(-3, 0); g.lineTo(-8, 8); g.closePath();
    g.fillStyle = own ? '#7FD1A8' : '#E8A08C';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(8,12,16,.85)';
    g.stroke();
    g.restore();
    // 标签底色，压在底图上也能读
    const label = a.progress >= 1 ? '抵達' : String(a.troops);
    g.font = '600 15px "Noto Sans SC",sans-serif';
    g.textAlign = 'center';
    const tw = g.measureText(label).width + 10;
    g.fillStyle = 'rgba(8,12,16,.78)';
    g.fillRect(sx - tw / 2, sy - 34, tw, 20);
    g.fillStyle = own ? '#A9E8C9' : '#F0B8A8';
    g.fillText(label, sx, sy - 19);
  }
  // 图例（R70）：色值同样来自 web/saves.js FORCE_PALETTE，避免「地图一套、图例一套」。
  // 14 家排两行（每行 7 家）；剧本 2 有 18 家 → 自动排三行。
  // V1：下装裱带够高（≥58px）且最多两行时，图例直接写进带里——带子就是图例条，
  // 不再盖住地图底部的桂陽/廬陵/夷州；行数多（剧本 2）时退回半透明底框。
  const seenForces = [];
  let unowned = 0;
  for (const c of ALL) {
    const f = forceAt(c.NAME);
    if (f && !seenForces.includes(f)) seenForces.push(f);
    if (!f) unowned++;
  }
  g.save();
  g.textAlign = 'left';
  const rows = [];
  for (let i = 0; i < seenForces.length; i += 7) rows.push(seenForces.slice(i, i + 7));
  const pr = plotRect();
  const bandTop = pr.y + pr.h;
  const botH = Math.max(0, view.h - bandTop);
  const inBand = botH >= 58 && rows.length <= 2;
  const boxW = cv.width - 32;
  const boxH = 44 + rows.length * 20;
  const boxY = cv.height - boxH - 10;
  // 带内模式下 titleY 落在金線分界下方；否则用浮框
  const titleY = inBand ? bandTop + 24 : boxY + 21;
  const rowTop = inBand ? bandTop + 43 : boxY + 44;
  const rowStep = inBand ? 19 : 20;
  if (!inBand) {
    g.fillStyle = 'rgba(8,12,16,.66)';
    g.beginPath();
    if (typeof g.roundRect === 'function') g.roundRect(16, boxY, boxW, boxH, 10);
    else g.rect(16, boxY, boxW, boxH);
    g.fill();
  }
  g.font = `600 ${inBand ? 13 : 14}px "Noto Sans SC",sans-serif`;
  g.fillStyle = Saves.FORCE_GOLD;
  g.fillText('● 金環＝我方', inBand ? 20 : 26, titleY);
  g.fillStyle = 'rgba(233,228,214,.66)';
  // 空城是劇本資料本身的常態（劇本1 有 39 座），必須講明「灰＝無主」，否則會以為配色漏了
  g.fillText(
    `色＝勢力（${seenForces.length} 家 · 固定 14 家色板）${unowned ? ` · 灰＝無主（${unowned} 城）` : ''}`,
    inBand ? 118 : 132, titleY,
  );
  g.font = `${inBand ? 12 : 13}px "Noto Sans SC",sans-serif`;
  let ly = rowTop;
  for (const row of rows) {
    let lx = inBand ? 20 : 26;
    for (const f of row) {
      const label = f.length > 4 ? f.slice(0, 4) : f;
      g.fillStyle = Saves.forceColorOf(f);
      g.beginPath(); g.arc(lx + 5, ly - 4, inBand ? 4.5 : 5, 0, Math.PI * 2); g.fill();
      g.lineWidth = 1; g.strokeStyle = withAlpha(Saves.FORCE_EDGE, 0.85); g.stroke();
      g.fillStyle = 'rgba(233,228,214,.88)';
      g.fillText(label, lx + 13, ly);
      lx += 13 + g.measureText(label).width + (inBand ? 13 : 14);
    }
    ly += rowStep;
  }
  g.restore();
}

$('map').addEventListener('click', (ev) => {
  const r = ev.target.getBoundingClientRect();
  const px = (ev.clientX - r.left) * (view.w / r.width);
  const py = (ev.clientY - r.top) * (view.h / r.height);
  const best = hitCity(px, py);
  if (best) { selected = best.NAME; render(); }
});

// ---------------------------------------------------------------- 互動
$('list').addEventListener('click', (e) => {
  const el = e.target.closest('.city'); if (!el) return;
  selected = el.dataset.name; render();
});

$('marchTargets').addEventListener('click', (e) => {
  const el = e.target.closest('[data-march]');
  if (!el) return;
  dispatchArmy(el.dataset.march);
});

$('actions').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'advance') { advanceMonth(1); return; }
  // R8 一月一令：本月已下过令 → 徵兵/開發/出征 全部拒绝（按钮已置灰，这里兜住键盘与旧 URL）
  if (['recruit', 'develop', 'dispatch', 'march', 'march_direct'].includes(act)
    && CM.monthLocked(save, UNLIMITED)) return toast(CM.LOCK_HINT);
  if (act === 'dispatch') { openMarchTargets(); return; }
  if (!selected) return;
  const st = save.cities[selected];
  if (act === 'city') {
    location.href = './city.html?city=' + encodeURIComponent(selected) + (UNLIMITED ? '&unlimited=1' : '');
    return;
  }
  if (act === 'recruit') {
    if (save.gold < 500) return toast('國庫不足：徵兵要 500 金。');
    save.gold -= 500; st.troops = Math.min(600, st.troops + 40);
    CM.markMonthActed(save, UNLIMITED); persist(); render(); return;
  }
  if (act === 'develop') {
    if (save.gold < 400) return toast('國庫不足：開發要 400 金。');
    save.gold -= 400; st.pop += 3000;
    CM.markMonthActed(save, UNLIMITED); persist(); render(); return;
  }
  if (act === 'march') {
    if (distFromOwned(selected) !== 1) return toast('不接壤：只能打與我方相鄰的城。');
    CM.markMonthActed(save, UNLIMITED);   // 出征＝本月已经下令
    persist();   // 進戰鬥前先鏡像到舊鍵，回來時 main.js 的寫回會被偵測到
    // 士氣（武將級）：出征頁會自己按「出發城主將」重算一次；這裡先帶一份，
    // 出征頁若算出不同主將就以它自己的為準（見 deploy.html 的 amorale 邏輯）。
    const from = (save.owned && save.owned[0]) || selected;
    const leader = localGeneral(from);
    const cap = dispatchCapOf(from);   // R75：出兵數 = 出發城主將的帶兵上限
    const dq = new URLSearchParams({
      city: selected,
      from,
    });
    if (leader) dq.set('amorale', String(moraleOf(save, leader.name)));
    // R68：出征頁的 `?lv=` 讀的就是這張等級表（`deploy.html:303`），別讓它退回自己的預設 20。
    if (leader) dq.set('lv', String(generalLevelOf(leader.name)));
    // R78/R75：敵軍兵力與等級用 campaign 的 enemySetup 算好再透傳，deploy.html 只讀不重算，
    // 免得出征頁與大地圖兩邊各算一套（deploy 側已改成「優先讀 ?bsoldiers=」）。
    const enemy = enemySetup(selected, Math.min(cap, troopsOf(from)));
    dq.set('bsoldiers', String(enemy.enemyTroops));
    dq.set('blevel', String(enemy.enemyLevel));
    if (UNLIMITED) dq.set('unlimited', '1');
    location.href = './deploy.html?' + dq.toString();
    return;
  }
  if (act === 'march_direct') {
    // 舊「點城直接開戰」的野戰入口（?march=0 的回歸對照用）：
    // 敵將不再是 DEFENSE/8 的代理值，而是 garrison.json 裡該城的真守將。
    const q = marchDirectQuery(selected);
    CM.markMonthActed(save, UNLIMITED);
    persist();
    location.href = './index.html?' + q.toString();
  }
});

$('btnSave').addEventListener('click', () => openSaveSheet());
$('btnNewGame').addEventListener('click', () => showPicker());
$('scrim').addEventListener('click', () => {
  // 首訪的選劇本浮層不能點背景關掉，否則玩家無路可走
  if (!gameStarted && !$('pickSheet').hidden) return;
  const cancel = (!$('confirmSheet').hidden && confirmCancel) ? confirmCancel : null;
  closeOverlays();
  if (cancel) cancel();
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
  const cancel = (!$('confirmSheet').hidden && confirmCancel) ? confirmCancel : null;
  closeOverlays();
  if (cancel) cancel();
}));
$('btnConfirmOk').addEventListener('click', () => {
  const fn = confirmAction;
  closeOverlays();
  if (fn) fn();
});

$('slotRows').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-do]');
  if (!b || b.disabled) return;
  const i = Number(b.dataset.slot);
  if (b.dataset.do === 'save') saveToSlot(i);
  else if (b.dataset.do === 'load') loadSlot(i);
  else if (b.dataset.do === 'del') deleteSlot(i);
});

// R70 槽位命名：双击非空槽改名（留空＝回到「槽 N」）；只改元数据，不动 snapshot
$('slotRows').addEventListener('dblclick', (ev) => {
  const row = ev.target.closest('.slot');
  if (!row || row.classList.contains('empty')) return;
  const i = Saves.slotIndex(Number(row.dataset.slot));
  if (i < 0 || !store.slots[i]) return;
  const cur = typeof store.slots[i].slotName === 'string' ? store.slots[i].slotName : '';
  const name = window.prompt(`槽 ${i + 1} 的名稱（留空＝自動：君主 + 劇本）`, cur);
  if (name === null) return;
  if (!Saves.renameSlot(store, i, name)) return;
  Saves.saveStore(store, storage);
  renderSlotRows();
});

$('pickCards').addEventListener('click', (ev) => {
  if (pickMode !== 'scenario') {
    const k = ev.target.closest('[data-king]');
    if (!k || k.dataset.off === '1') return;
    pendingKing = k.dataset.king || '';
    renderPickCards();
    updatePickChrome();
    return;
  }
  const el = ev.target.closest('[data-pick]');
  if (!el) return;
  pendingScenario = Number(el.dataset.pick) || 0;
  renderPickCards();
  updatePickChrome();
});
$('btnPickStart').addEventListener('click', () => {
  if (pickMode === 'scenario') { showPicker('king'); return; }
  if (pickMode === 'fix') { applyKingToSave(pendingKing); return; }
  if (pendingKing) startNewGame(pendingScenario, pendingKing);
});
$('btnPickCancel').addEventListener('click', () => {
  if (pickMode !== 'scenario') { showPicker('scenario'); return; }
  closeOverlays();
});
// R4：老檔沒君主 / 想換君主 → 補登浮層（只改存檔 king 欄位，不動已佔的城）
$('kingEdit').addEventListener('click', () => {
  if (gameStarted) showPicker('fix');
});

// R4 君主屬性：點頂欄「君主 某某」或勢力名
$('kingName').addEventListener('click', () => { if (gameStarted) openMonarchSheet(); });
$('kingdomName').addEventListener('click', () => { if (gameStarted) openForceSheet(); });
// R78 勢力一覽
$('btnForces').addEventListener('click', () => { if (gameStarted) openForceSheet(); });
// R4 讓位
$('btnAbdicate').addEventListener('click', () => { closeOverlays(); openThroneSheet(); });
$('throneRows').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-heir]');
  if (el) doAbdicate(el.dataset.heir);
});
// R78 勢力一覽 → 明細（點卡片）；明細 → 返回
$('forceRows').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-force]');
  if (el) renderForceDetail(el.dataset.force);
});
$('btnForceBack').addEventListener('click', () => renderForceSheet());

// 頂部劇本卡片：切換（有進行中的存檔先確認會覆蓋）
$('scstrip').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-sc]');
  if (!el) return;
  const i = Number(el.dataset.sc);
  if (i === currentScenarioIdx()) { notice(`目前劇本：《${scenario.name}》`); return; }
  if (!gameStarted) { showPicker('king', i); return; }
  confirmBox('切 換 劇 本',
    `切換到《${SCEN[i].name}》會覆蓋目前進行中的存檔（槽 ${slotNo()} · ${Saves.monthLabel(save.month)}），並從該劇本的第 1 年 1 月重新開局。其他槽位不受影響。`,
    () => showPicker('king', i));
});

// ---------------------------------------------------------------- 戰報 / AI 出兵（v6）
function stamp(month) {
  const m = month ?? save.month;
  return `${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
}

function pushLog(text, kind) {
  save.log = save.log || [];
  save.log.push({ t: stamp(), s: text, k: kind || 'info' });
  if (save.log.length > 8) save.log = save.log.slice(-8);
}

// ---------------------------------------------------------------- AI 月規劃（R73–R76）
// 原作 0x40D751 每勢力每月跑一遍：0x40BE20 清空候選表 → 0x40CBB6 沿 king+0x338 城鏈
// 逐城調 PlanDomestic(0x40BFCE) → PlanRecruit(0x40C1E4) → PlanAttack(0x40CAF1) →
// PlanMoveGeneral(0x40C34D) → 0x40CC10 取 Rate 最大（哨兵 0x320=800）→ 0x40D52F 執行。
// 四段順序、Rate 表（200/100/80/(d+1)/50-200）、出兵數公式（0x40C635）全在 ai_model.js。

/** 存檔 + 劇本 → ai_model.js 的 world。每月重建一次：城兵/金/歸屬每月都在變 */
function buildWorld(rng) {
  const citiesW = {};
  for (const c of ALL) {
    const st = save.cities[c.NAME] || {};
    const g = garrisonIn(c.NAME);
    citiesW[c.NAME] = {
      owner: forceAt(c.NAME),
      troops: Saves.num(st.troops),
      money: Saves.num(st.money),
      pop: Saves.num(st.pop),
      flags: Saves.num(c.FLAGS),
      rate: Saves.num(c.RATE),
      major: (g && typeof g.major === 'string' ? g.major : '') || (typeof c.MAJOR === 'string' ? c.MAJOR : ''),
      // 城內武將鏈（city+0x24）：garrison.json 的在職者。status 原本只有 登/野，
      // 這裡把「掛名太守」也算在職（原作 +0x91 & 1），否則史實上太守不在名單裡就沒人可用。
      officers: (Array.isArray(g?.officers) ? g.officers : [])
        .filter((o) => o && o.name)
        .map((o) => ({ name: o.name, str: Saves.num(o.str), int: Saves.num(o.int), status: '登' })),
    };
  }
  return {
    playerId: typeof save.king === 'string' ? save.king : '',
    cities: citiesW,
    adj,
    paths: scenario.paths,
    forces: save.forces,
    rng,
    capOf: (name) => Saves.cityTroops(cityOf(name) || {}),
    rules: { cheat: false },   // ACT=6 cheat 的觸發條件原作未定位，預設關閉
  };
}

/** world 的改動寫回存檔（兵/金/太守/歸屬），並清掉被攻陷城的殘留狀態 */
function applyWorld(w) {
  for (const name of Object.keys(w.cities || {})) {
    const st = save.cities[name];
    const src = w.cities[name];
    if (!st || !src) continue;
    st.troops = Math.max(0, Math.trunc(Saves.num(src.troops)));
    st.money = Math.max(0, Math.trunc(Saves.num(src.money)));
    if (typeof src.owner === 'string') st.owner = src.owner;
  }
  save.forces = w.forces && typeof w.forces === 'object' ? w.forces : save.forces;
  if (typeof w.playerId === 'string' && w.playerId) save.king = w.playerId;
  AI.syncOwned(save);
}

/**
 * 一個月的 AI（R73 全流程）。返回 { incoming, lines }：
 *   incoming = 打玩家的那些候選（由調用方起兵或就地守城，不在这里结算）
 *   lines    = 月報文字（?aidbg=1 時寫進 #marchdbg）
 * 打 AI / 占空城在这里就地结算（0x40D52F 之后的战斗走 resolveBattle）。
 */
function runAiMonth(force) {
  const world = buildWorld();
  // R78：滅亡時要按「這個勢力原本有哪些武將」算殘將去向，仗打完城已經換主、武將也跟著走了，
  // 所以在任何戰鬥之前先按勢力攤平一份武將快照。
  const troopSnap = {};
  const wild = wildRoster();   // 在野者不算「殘將」，滅亡時不記去向
  for (const id of AI.forceOrder(world)) {
    const list = [];
    for (const n of AI.citiesOf(world, id)) {
      for (const o of world.cities[n]?.officers || []) {
        if (o?.name && wild.has(o.name)) continue;
        list.push(o);
      }
    }
    troopSnap[id] = list;
  }
  // R73 主入口（c2-ai 交付版）：planMonth 純決策 → executeMonth 執行。
  // 種子只取 month → 同月同結果（決定性）；playerId/adj/paths/rules 由這裡的存檔與地圖給。
  const actions = AI.planMonth(
    { king: world.playerId, month: Saves.num(save.month) },
    world.cities,
    {
      playerId: world.playerId, adj, paths: scenario.paths, rules: world.rules,
      seed: (Saves.num(save.month) + 1) * 7919,
      // [新設計] 調試口子：?kinds=develop,recruit 或 ?maxacts=2 讓內政動作在實數據裡看得見。
      // 不給就完全照原作 Rate 形狀（攻擊 100/200 永遠壓過內政 18..35），不是改 Rate。
      ...(qs.kinds ? { kinds: String(qs.kinds).split(',').filter(Boolean) } : {}),
      ...(qs.maxacts ? { maxPerForce: Math.max(1, Math.min(6, Saves.num(qs.maxacts))) } : {}),
    },
  );
  const res = AI.executeMonth(world, actions, { rng: Math.random });
  const incoming = [];
  const lines = [];
  const tags = [];
  for (const item of res.executed) {
    const cand = item.cand;
    const result = item.result;
    if (!result || !result.ok) {
      lines.push(`  ${AI.ACT_NAMES[cand?.act] ?? '?'} 未 執 行：${result?.reason || 'no-result'}`);
      continue;
    }
    // c2-ai 的九项 ACT 里「徵兵/開墾/搜索」不在 ACT 表內（act=0），月報要改讀 kind 名
    tags.push(`${item.force}·${cand?.act === 0 && cand?.kind ? (AI.KIND_NAMES?.[cand.kind] || cand.kind) : (AI.ACT_NAMES[cand.act] ?? '?')}`);
    const defOwner = AI.forceOf(world, cand.to);
    if (result.kind === 'battle') {
      // 打玩家：不在这里结算——行军模式起兵、非行军模式跳守城战。
      // ACT=7 联合打玩家 也走这条路（原作联合只是多凑几支部队，打谁还是守城战）。
      if (cand.act === AI.ACT.ATTACK_PLAYER || (defOwner && defOwner === world.playerId)) {
        incoming.push({
          from: cand.from, to: cand.to, et: Math.max(1, result.troops),
          gt: troopsOf(cand.to), p: 1, def: cityOf(cand.to)?.DEFENSE || 0,
          joinCity: cand.joinCity || '',
        });
      } else {
        const r = AI.resolveBattle(world, result, Math.random);
        pushLog(`${AI.describeAction(world, cand)} → ${r.captured ? '得 手' : '敗 退'}（守 ${r.def} 兵）`,
          r.captured ? 'win' : 'lost');
        // R78：太守 == 君主 且 這座城本來就是他的 → 君主陣亡 → 繼承 / 滅亡（kingFell 自己寫戰報）
        if (r.captured) kingFell(r.defender, r.oldMajor, { world });
        lines.push(`  ${AI.describeCandidate(world, cand)} → ${r.captured ? '得手' : '敗退'}`);
        continue;
      }
    } else {
      pushLog(AI.describeAction(world, cand), 'info');
    }
    lines.push('  ' + AI.describeCandidate(world, cand).replace(/\n/g, ' / '));
  }
  // 徵兵是掃描期即時動作（ACT 表 9 项里没有「徵兵」），只进月报不占候选
  for (const r of res.reports) {
    if (r.immediate && r.immediate.length) {
      lines.push(`  ${r.force} 徵 兵 ${r.immediate.map((x) => `${x.city}+${x.troops}`).join(' ')}`);
    }
  }
  // 城打光了 → 势力灭亡（要在 applyWorld 之前改 world.forces，不然存不进存档）
  const gone = AI.checkForceDeaths(world);
  for (const id of gone) forceExtinct(id, world.forces?.[id]?.king || id, { officers: troopSnap[id] || [] });
  applyWorld(world);
  if (tags.length) pushLog(`AI 月 報：${tags.length} 個勢力行動（${tags.join('、')}）`, 'info');
  // ?forceatk=1：跳過 ArgMax，直接讓最想打的勢力出兵一次（調試/截圖用）
  if (force) {
    const extra = forceAttack(world);
    if (extra) incoming.push(extra);
  }
  return { incoming, lines };
}

/** ?forceatk=1：在全部 AI 勢力的「打玩家」候選裡挑 Rate 最高的一條直接執行 */
function forceAttack(world) {
  const table = AI.createTable();
  for (const f of AI.forceOrder(world)) {
    if (f === world.playerId) continue;
    AI.planAttack(world, f, table, { rng: Math.random });
  }
  const rows = table.rows.filter((r) => r.act === AI.ACT.ATTACK_PLAYER);
  if (!rows.length) return null;
  rows.sort((a, b) => (b.rate - a.rate) || a.from.localeCompare(b.from));
  const cand = rows[0];
  const res = AI.executeCandidate(world, cand, {});
  if (!res.ok) return null;
  applyWorld(world);
  return { from: cand.from, to: cand.to, et: Math.max(1, res.troops), gt: troopsOf(cand.to), p: 1, def: cityOf(cand.to)?.DEFENSE || 0 };
}

// 守將：本城 garrison.json 裡最強的駐將（按 STR+INT 降序，officers[0]）；
// 沒有駐將才退回我方最高統帥。舊版按 generals.json 的 CITY 欄找人，那欄只在
// 劇本 1 有效，切到 2..5 就會認錯人。
function defenderOf(cityName) {
  const chief = garrisonIn(cityName)?.officers?.[0];
  if (chief && chief.name) return chief;
  return commander();
}

// 我方最高統帥：只看「我方城」的駐將（同樣走 garrison.json，五個劇本都準）
function commander() {
  let best = null;
  for (const n of save?.owned || []) {
    for (const o of garrisonIn(n)?.officers || []) {
      if (!o || !o.name || o.name === '盜賊') continue;
      if (!best || (o.str + o.int) > (best.str + best.int)) best = o;
    }
  }
  return best;
}

/**
 * 守軍的戰場參數：兵力一律用「存檔等級」重算。
 * `battleSetup()` 內部只看 generals.json 的 BaseEXP（全是 200 → Lv2），升級過的武將它不知道；
 * 原作口徑是 `帶兵數+騎兵數 = min(5L,100) + clamp((L−20)×5,0,100)`（`0x409FB6`/`0x409FD8`），
 * 所以這邊用 `defenderBattleParams(chief, battleRowOf(name))`（`battleRowOf` 帶 runtime level）重算，
 * 其餘欄位（敵將名/能力/武將清單）仍用 `battleSetup()` 的。
 */
function enemySetup(cityName, mySoldiers = 100) {
  const base = battleSetup(GDATA, currentScenarioIdx(), cityName, mySoldiers);
  const mine = Math.max(1, Math.min(100, Saves.num(mySoldiers) || 100));
  const chiefName = base.enemyGeneral?.name;
  const chief = chiefName ? garrisonIn(cityName)?.officers?.find((o) => o.name === chiefName) : null;
  if (!chief?.name) {
    // 空城（無守將）：原作不會有守城戰，沿用 `battleSetup()` 的「我軍六成」兜底
    return { ...base, enemyTroops: Math.max(1, Math.round(mine * 0.6)), enemyLevel: 1 };
  }
  const params = defenderBattleParams({ name: chief.name, str: chief.str, int: chief.int }, battleRowOf(chief.name));
  // 上陣兵數：原作 EXE 給的是「帶兵**上限**」`min(5L,100)+clamp((L−20)×5,0,100)`，不是守城上陣數。
  // 沒有 scenario 等級 → generals.json 的 BaseEXP 全是 200 → Lv2 → 上限只有 10，
  // 直接當上陣數會變成「我軍 100 vs 守軍 10」的假戰鬥。所以按既有口徑「守軍/6」折算
  // 上陣兵（`31_还原清单.md` 記為 [推测]，非原作實證），等級仍交給 `?blevel=`。
  const pool = troopsOf(cityName);
  const exeCap = Math.max(1, Math.min(200, params?.soldiers || 1));
  return {
    ...base,
    enemyTroops: Math.max(1, Math.min(100, pool > 0 ? Math.round(pool / 6) : exeCap)),
    enemyLevel: params?.level || 1,
  };
}

/**
 * 舊入口「點城直接開戰」（`?march=0`）的查詢串。
 * 抽成函式是為了讓 `?probe=1` 能在不跳頁的情況下把它印出來（驗收/截圖用）。
 */
function marchDirectQuery(cityName) {
  const leader = commander();
  // R75：出征兵數 = 主將帶兵上限（min(等級×5,100)），不再固定 100
  const cap = leader ? MM.troopCapOf(generalLevelOf(leader.name)) : MM.troopCapOf(1);
  const enemy = enemySetup(cityName, cap);
  const q = new URLSearchParams({
    city: cityName, from: 'campaign',
    soldiers: String(cap),
    // 守軍兵力改讀原作口徑（`0x409FB6`/`0x409FD8`）：帶兵數+騎兵數 = min(5L,100)+clamp((L-20)*5,0,100)，
    // 由 `enemySetup()` 用「存檔等級」算（舊式「守軍/6」對開局 300 兵恆等 60，從沒生效）。
    // 等級一起傳，`main.js` 的 `?blevel=` 才會把真等級套到 B 方（`main.js:612`）。
    bsoldiers: String(enemy.enemyTroops ?? 100),
    blevel: String(enemy.enemyLevel ?? 1),
    bgen: enemy.enemyGeneral.name,
    bstr: String(enemy.enemyGeneral.str),
    bint: String(enemy.enemyGeneral.int),
  });
  const g = leader;
  if (g) {
    q.set('gen', g.name);
    q.set('amorale', String(moraleOf(save, g.name)));
    // R68：我方主將等級也讀存檔（`main.js:466` 的 `?level=`）
    q.set('level', String(generalLevelOf(g.name)));
  }
  q.set('bmorale', String(moraleOf(save, enemy.enemyGeneral.name)));
  return q;
}
// 守城战入场 URL：防守方永远是 index.html 的 A 方（我方，背视），
// 敌军数值放 B 方；守军/敌军都压在 100 以内（战场上最多摆 100 个兵）。
// 来犯的敌将取 atk.from（出发的敌城）的 garrison.json 首席守将，
// 不再用 50 + 防御/8 的代理值。
function defendUrl(atk) {
  const g = defenderOf(atk.to);
  const chief = garrisonIn(atk.from)?.officers?.[0];
  // 敵將（來犯的）等級讀存檔，再按原作口徑算他的帶兵上限；
  // 但真的能帶上場的只有實際派的兵（atk.et），兩者取小 —— 這是 `battleSetup()` 的
  // `enemyTroops` 對「守軍」與「來犯軍」唯一的差別（守軍在上限內全上場）。
  const chiefLevel = chief?.name ? generalLevelOf(chief.name) : 1;
  const chiefParams = chief?.name
    ? defenderBattleParams({ name: chief.name, str: chief.str, int: chief.int }, battleRowOf(chief.name))
    : null;
  const sent = Math.max(1, Math.trunc(Saves.num(atk.et)) || 1);
  // 同上（見 `enemySetup()`）：`chiefParams.soldiers` 是**帶兵上限**，不是這支來犯軍的兵力，
  // 用它夾 `sent` 會把 60 人的來犯軍壓成 10 人。來犯兵力就用大地圖上真實行軍數。
  const enemyTroops = Math.max(1, Math.min(100, sent));
  const q = new URLSearchParams({
    defend: '1', city: atk.to, from: 'campaign',
    soldiers: String(Math.max(1, Math.min(100, atk.gt))),
    bsoldiers: String(enemyTroops),
    blevel: String(chiefLevel),
    bgen: chief?.name || '來犯之將',
    bstr: String(chief?.str ?? 70),
    bint: String(chief?.int ?? 70),
  });
  if (g) q.set('gen', g.name);
  if (g) q.set('amorale', String(moraleOf(save, g.name)));
  if (g) q.set('level', String(generalLevelOf(g.name)));   // R68：我方守將等級
  q.set('bmorale', String(moraleOf(save, chief?.name || '來犯之將')));
  return './index.html?' + q.toString();
}

// 批量推进（?adv=N）时不跳转，就地判定，好让 12 个月的战报一次性看到。
// 规则与真打一致的方向：守军越多、敌军越少越可能守住。
function resolveDefense(atk) {
  const my = Math.max(1, atk.gt);
  const en = Math.max(1, atk.et);
  const pw = Math.min(0.9, Math.pow(my / (my + en), 0.85) * 1.25);   // 守城方有城防加成
  const held = Math.random() < pw;
  const lost = held
    ? Math.min(my - 1, Math.round(my * (0.18 + Math.random() * 0.22)))
    : my;
  if (held) {
    save.cities[atk.to].troops = Math.max(10, my - lost);
    Saves.updateRecord(save, true);   // R63：0x4084C9 胜 → 胜场+1、连胜+1、最高连胜取 max
    save.defWins = (save.defWins || 0) + 1;
    pushLog(`守 住 ${atk.to}（我 ${my} 兵 對 敵 ${en} 兵，損 ${lost}）`, 'hold');
  } else {
    const former = forceAt(atk.to);   // 失守前的勢力（君主陣亡判定要用，必須在改 owner 之前抓）
    save.owned = save.owned.filter((n) => n !== atk.to);
    save.cities[atk.to].troops = Math.max(30, Math.round(en * 0.6));
    Saves.updateRecord(save, false);   // R63：败 → 败场+1、连胜清 0
    // 士氣（武將級）：批量推進的敗仗也算敗，守將 -10 [新設計]（與 main.js 的寫回同一口徑）
    const chief = defenderOf(atk.to);
    const moraleLost = chief ? moraleDefeat(save, chief.name) : 0;
    pushLog(`${atk.to} 失 守（我 ${my} 兵 對 敵 ${en} 兵${moraleLost ? `，${chief.name} 士氣 -${moraleLost}` : ''}）`, 'lost');
    // R78：失守城的太守若是君主本人 → 君主陣亡 → 繼承/滅亡（要在換 owner 之前判定）
    kingFell(former, garrisonIn(atk.to)?.major, { lostCity: atk.to });
    // 判定完再把城歸攻方勢力（不再是「無主」，否則會被 syncOwned 洗成空城）
    save.cities[atk.to].owner = forceAt(atk.from) || '';
  }
}

/**
 * R78 君主陣亡 → 繼承 / 滅亡（我方與 AI 走同一條路）。
 * 舊行為（本輪之前）：AI.captureKingIn — 繼任者取 STR+INT 最高（不認 LoyalKing）、預設不繼承直接滅、
 * 殘將沒有處置、玩家君主只記一條「（我方）— 勢力存續」。
 * 新行為：MM.kingDeath — 繼任者按「同族 > 忠誠 > 能力」（LoyalKing 參與）[推測]；沒有繼任者或城已丟光
 * → 滅亡，殘將按 Loyal / LoyalKing 定投降或在野並寫 save.fate；勢力 id / 旗 / 城全部不變。
 * 原作：君主不可俘（0x40975E）→ 只有「陣亡」「讓位」兩條退場；繼承判定點未定位，[推測]。
 * opts.lostCity：這一仗丟掉的城（buildWorld 時它還在 former 名下，要從 remaining 裡減掉）。
 */
function kingFell(formerOwner, deadName, opts = {}) {
  if (!save?.forces || !formerOwner) return null;
  if (save.forces[formerOwner]?.alive === false) return null;   // 已滅的勢力不重複判
  const world = opts.world || buildWorld();
  const owned = AI.citiesOf(world, formerOwner);
  const remaining = Math.max(0, owned.length - (opts.lostCity ? 1 : 0));
  // 繼承/殘將只看在職者（在野的華佗不會因為城破就變成孔岫的繼任者）
  const wild = wildRoster();
  const officers = [];
  for (const n of owned) {
    for (const o of world.cities[n]?.officers || []) {
      if (o?.name && wild.has(o.name)) continue;
      officers.push(o);
    }
  }
  const dead = deadName || save.forces[formerOwner]?.king || formerOwner;
  const wasPlayer = formerOwner === MM.forceIdOf(save);
  const res = MM.kingDeath(save, formerOwner, { month: save.month, dead, officers, remaining });
  if (!res?.dead) return res;
  if (res.extinct) {
    // 還有城卻沒有繼任者：城歸最近的勢力（原作判定點未定位，[推測]；與舊 extinguishForce 同口徑）
    let moved = 0;
    for (const n of AI.citiesOf(world, formerOwner)) {
      const near = AI.nearestForce(world, n, formerOwner);
      const st = save.cities[n];
      if (st) { st.owner = near || ''; if (near) moved += 1; }
      if (world.cities[n]) world.cities[n].owner = near || '';
    }
    pushLog(`${formerOwner} 君 主 陣 亡：勢 力 滅 亡${moved ? `，餘 ${moved} 城 歸 最 近 的 勢 力` : '（名下已無城池）'}`, 'lost');
    if (res.fates?.length) pushLog(MM.fateText(res.fates), 'lost');
    if (wasPlayer) notice(`我方勢力「${formerOwner}」因君主 ${dead} 陣亡而滅亡${res.fates?.length ? `；${MM.fateText(res.fates)}` : ''}`, 14000);
  } else {
    pushLog(`${formerOwner} 君 主 陣 亡：${res.heir} 繼 位（勢 力 存 續 · 名 號 不 變）`, 'lost');
    if (wasPlayer) notice(`君主 ${dead} 陣亡：${res.heir} 繼位，勢力「${formerOwner}」存續`, 12000);
  }
  // 只有「守城戰就地判定」這條路要立刻回寫 owned；AI 月流程裡 world 還沒 applyWorld，
  // 此時 syncOwned 會拿過期的 owned 去洗 owner，交給呼叫方的 applyWorld 收尾。
  if (!opts.world) AI.syncOwned(save);
  return res;
}

// 行軍模式：AI 出兵變成一支路上可見的部隊（side B），不再是直接判定。
// 同一座城已有在途部隊就不重複發；全場敵軍在途上限 3 支。
function spawnAiArmy(atk) {
  const pi = marchPath(atk.from, atk.to);
  if (pi === null) return null;
  if ((save.armies || []).some((a) => a.side === 'B' && a.from === atk.from && a.progress < 1)) return null;
  if ((save.armies || []).filter((a) => a.side === 'B').length >= 3) return null;
  const army = {
    id: nextArmyId(), side: 'B', from: atk.from, to: atk.to, pathIndex: pi,
    progress: 0, troops: atk.et, general: localGeneral(atk.from)?.name,
  };
  save.armies.push(army);
  pushLog(`敵 軍 出 動：${atk.from} → ${atk.to}（敵 ${atk.et} 兵，${marchMonths(pi)} 個月到）`, 'atk');
  return army;
}

// 某城的首席守将（garrison.json，五個劇本通用）。舊版按 generals.json 的 CITY 欄找人。
function localGeneral(cityName) {
  return garrisonIn(cityName)?.officers?.[0] || null;
}

/** 把行軍部隊包成 defendUrl / resolveDefense 認得的「來襲」物件 */
function armyAsAtk(a) {
  const c = cityOf(a?.from);
  return {
    from: a?.from || '', to: a?.to || '',
    et: Math.max(1, Saves.num(a?.troops)), gt: troopsOf(a?.to || ''),
    p: 0.5, def: c?.DEFENSE || 0,
  };
}

function clamp100(n) {
  return String(Math.max(1, Math.min(100, Math.round(Saves.num(n)) || 1)));
}

// 路上遭遇：沿用 index.html 的野戰，city 用我軍的目標城（勝負寫回同一份存檔）
function encounterUrl(a, b) {
  // 敵將 = b 軍出發城（b.from）的首席守將；舊版拿 a.to 的 DEFENSE 當武力代理
  const foe = garrisonIn(b?.from)?.officers?.[0];
  const q = new URLSearchParams({
    city: a.to, from: 'campaign', encounter: '1',
    soldiers: clamp100(a.troops), bsoldiers: clamp100(b.troops),
    bgen: foe?.name || '來犯之將',
    bstr: String(foe?.str ?? 70), bint: String(foe?.int ?? 70),
  });
  const g = defenderOf(a.to);
  if (g) q.set('gen', g.name);
  if (g) q.set('amorale', String(moraleOf(save, g.name)));
  q.set('bmorale', String(moraleOf(save, foe?.name || '來犯之將')));
  return './index.html?' + q.toString();
}

// 批量推進時的遭遇判定：兵力多的一方勝，勝方減半繼續、敗方消失。
// 交互模式不跑這裡（會跳真正的野戰），所以只影響 ?adv=N。
function resolveEncounter(a, b) {
  const win = Math.random() < Math.max(0.15, Math.min(0.85, Saves.num(a.troops) / (Saves.num(a.troops) + Saves.num(b.troops))));
  const w = win ? a : b, l = win ? b : a;
  removeArmy(w.id); removeArmy(l.id);
  w.troops = Math.round(Saves.num(w.troops) * 0.5);
  if (w.troops > 0) save.armies.push(w);
  if (w.side === 'A') { Saves.updateRecord(save, true); pushLog(`野 戰 勝：${a.from} 軍 擊 退 ${b.from} 軍（餘 ${w.troops} 兵）`, 'win'); }
  else { Saves.updateRecord(save, false); pushLog(`野 戰 敗：${b.from} 軍 擊 退 我 ${a.from} 軍`, 'lost'); }
}

/** 抵達 / 遭遇 / 攔截結算。回傳 true 表示已觸發跳轉（調用方要立刻 return）。 */
function handleMarchEvents(batch) {
  if (!MARCH_ON || !save) return false;
  const list = save.armies || [];

  // 1) 同一條路上相向而行的兩軍：進度交錯 → 遭遇
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!armiesIntercept(a, b)) continue;
      if (batch) { resolveEncounter(a, b); return false; }
      removeArmy(a.id); removeArmy(b.id);
      pushLog(`遭 遇 戰：${a.from} 軍 與 ${b.from} 軍 在 ${a.to} 道上相遇`, 'atk');
      autosave();
      render();
      confirmBox('遭 遇 戰', `${a.side === 'A' ? '我軍' : '敵軍'} ${a.troops} 兵 與 ${b.side === 'A' ? '我軍' : '敵軍'} ${b.troops} 兵 在往 ${a.to} 的路上撞上了。\n出戰則進入野戰；取消則兩軍各自退兵回城。`,
        () => { location.href = encounterUrl(a, b); },
        () => { refundArmy(a); refundArmy(b); autosave(); render(); });
      return true;
    }
  }

  // 2) 敵軍抵達我方城下 → 守城戰（沿用舊 defendUrl）
  const bArr = list.filter((a) => a.side === 'B' && a.progress >= 1);
  if (bArr.length) {
    if (batch) {
      for (const a of bArr) { resolveDefense(armyAsAtk(a)); removeArmy(a.id); }
      return false;
    }
    const atk = armyAsAtk(bArr[0]);
    removeArmy(bArr[0].id);
    pushLog(`敵 軍 抵 達：${atk.from} → ${atk.to}（敵 ${atk.et} 兵 對 我 ${atk.gt} 兵）`, 'atk');
    autosave();
    render();
    location.href = defendUrl(atk);
    return true;
  }

  // 3) 我軍抵達敵城下 → 進編成，再開戰（沿用 deploy.html 現路徑）
  const aArr = list.filter((a) => a.side === 'A' && a.progress >= 1);
  if (aArr.length) {
    const a = aArr[0];
    if (a.reported && batch) return false;
    if (!a.reported) {
      a.reported = true;
      pushLog(`我 軍 抵 達：${a.from} → ${a.to}（${a.troops} 兵 在城下待命）`, 'info');
    }
    if (batch) return false;
    autosave();
    render();
    const mine = localGeneral(a.from);
    const g = mine || defenderOf(a.to);
    confirmBox('抵 達 城 下', `${a.from} 的 ${a.troops} 兵 已到 ${a.to} 城下${g ? '，主將 ' + g.name : ''}。\n出戰＝進編成後決戰；退兵＝部隊回 ${a.from}（守軍 +${a.troops}）。`,
      () => {
        const q = new URLSearchParams({ city: a.to, from: a.from });
        if (mine) q.set('amorale', String(moraleOf(save, mine.name)));
        if (mine) q.set('lv', String(generalLevelOf(mine.name)));
        // R75/R78：敵軍兵力/等級用同一個 enemySetup 算好再透傳（deploy 只讀 ?bsoldiers=/?blevel=）
        const enemy = enemySetup(a.to, a.troops);
        q.set('bsoldiers', String(enemy.enemyTroops));
        q.set('blevel', String(enemy.enemyLevel));
        removeArmy(a.id); autosave();
        location.href = './deploy.html?' + q.toString();
      },
      () => { removeArmy(a.id); refundArmy(a); autosave(); render(); notice('已退兵回 ' + a.from); });
    return true;
  }
  return false;
}

/** 退兵：把部隊兵力還給出發城（上限 600，與徵兵同口徑） */
function refundArmy(a) {
  const st = save.cities?.[a?.from];
  if (!st) return;
  st.troops = Math.min(600, Saves.num(st.troops) + Math.max(0, Saves.num(a.troops)));
}

function marchSnapshot() {
  if (!MARCH_DBG) return;
  marchDebug.push({
    month: save.month,
    armies: (save.armies || []).map((a) => ({
      id: a.id, side: a.side, from: a.from, to: a.to,
      progress: Number((Number(a.progress) || 0).toFixed(4)), troops: a.troops,
    })),
  });
  const el = $('marchdbg');
  if (el) { el.hidden = false; el.textContent = JSON.stringify(marchDebug, null, 2); }
}

/** ?aidbg=1：每月 AI 月報（君主 / 四段候選數 / 每條候選 / ArgMax 結果）寫進 #marchdbg */
function aiDebug(lines) {
  if (!AI_DBG) return;
  aiDebugLog.push({ month: save.month, lines });
  const el = $('marchdbg');
  if (el) { el.hidden = false; el.textContent = JSON.stringify(aiDebugLog.slice(-12), null, 2); }
}

/**
 * ?probe=1：把「等級/預備兵/兩條戰鬥入口的查詢串」印進 #marchdbg（只讀，不改檔）。
 * 驗收用（截圖就能核對 `bsoldiers`/`blevel`/`level`/`lv` 到底送出了什麼）。
 */
function wireProbe() {
  const el = $('marchdbg');
  if (!el || !save) return;
  el.hidden = false;
  try {
    const mine0 = (save.owned || [])[0] || '';
    const levels = {};
    for (const n of save.owned || []) {
      for (const o of garrisonIn(n)?.officers || []) if (o?.name) levels[o.name] = generalLevelOf(o.name);
    }
    const names = Object.keys(levels);
    // 找一組「我方城 ↔ 敵城」，優先挑有守將的敵城（空城的 bsoldiers 走兜底，看不出等級）
    const hasChief = (n) => (garrisonIn(n)?.officers?.length || 0) > 0;
    const enemyList = ALL.filter((c) => !save.owned.includes(c.NAME)).map((c) => c.NAME);
    let myCity = mine0;
    let enemyCity = '';
    for (const n of save.owned || []) {
      const nb = [...(adj.get(n) || [])].filter((m) => !save.owned.includes(m));
      const pick = nb.find(hasChief) || nb[0];
      if (pick) { myCity = n; enemyCity = pick; break; }
    }
    if (!enemyCity || !hasChief(enemyCity)) enemyCity = enemyList.find(hasChief) || enemyCity;
    const atkDemo = { from: enemyCity || myCity, to: myCity, et: 100, gt: troopsOf(myCity) };
    const def = myCity ? cityOf(myCity) : null;
    el.textContent = JSON.stringify({
      month: save.month,
      levelOverride: LEVEL_OVERRIDE,
      levelSample: Object.fromEntries(names.slice(0, 3).map((n) => [n, levels[n]])),
      savedLevelCount: Object.keys(save.generalLevel || {}).length,
      expSample: { [Object.keys(save.generalExp || {})[0] || '']: (save.generalExp || {})[Object.keys(save.generalExp || {})[0]] },
      learnedNames: Object.keys(save.learned || {}).length,
      prep: def ? CM.prepStateOf(save, def) : null,
      march_direct: enemyCity ? './index.html?' + marchDirectQuery(enemyCity).toString() : '(無相鄰敵城)',
      defend: def ? defendUrl(atkDemo) : '(無城)',
      // R70：存檔/勢力自檢（槽數、當前君主、勢力總數/存活/滅亡、60 城摘要、400 將等級）
      saves: (() => {
        const f = Saves.forcesSummary(save);
        const g = Saves.generalsSummary(save);
        return {
          v: Saves.SNAPSHOT_VERSION,
          filled: store.slots.filter(Boolean).length,
          slot: slotNo(),
          slotParts: store.slots[slotNo() - 1] ? Saves.slotParts(store.slots[slotNo() - 1], slotNo() - 1) : null,
          monarch: save.monarch || '',
          forces: f.total, aliveForces: f.alive, extinct: f.extinct,
          cities: Object.keys(save.cities || {}).length,
          citySummary: (() => { const k = Object.keys(save.cities || {})[0]; return k ? save.cities[k] : null; })(),
          generals: g.total, leveled: g.leveled,
          upgrade: snapshotUpgrade,
        };
      })(),
    }, null, 2);
  } catch (e) {
    el.textContent = 'probe failed: ' + (e && (e.stack || e.message) || e);
  }
}

function advanceMonth(n) {
  if (!gameStarted) { notice('尚未開局：先選劇本開始新遊戲。'); return; }
  const fast = qs.get('auto') === '1';            // ?auto=1：舊的直接結算快進（測試/批量）
  const batch = n > 1 || fast;                    // ?adv=N：批量推进，不跳转
  const force = qs.get('forceatk') === '1';
  const marchMode = MARCH_ON && !fast;            // ?march=0 回退到「點城直接開戰」
  for (let i = 0; i < n; i++) {
    save.month += 1;
    // R8：換月＝月令狀態清零（原作每月流水線 0x41B69D 內 [0x4A64BC]=0）
    CM.clearMonthLock(save);
    let income = 0;
    for (const name of save.owned) {
      const st = save.cities[name];
      income += Math.floor(st.pop / 5000) * 4;
      st.pop = Math.floor(st.pop * 1.01);
      st.money = Math.floor(st.money * 1.01) + 20;
    }
    save.gold += income;

    // 守軍自然回補：上限 = min(人口/2500 + 110, 600)（與 Saves.cityTroops 同一個口徑），
    // 每月按上限的 2% 緩慢補，補到上限為止。舊版是無腦 +6，小城也會被堆到 600。
    let growCities = 0, growTroops = 0;
    for (const c of ALL) {
      const st = save.cities[c.NAME];
      if (!st) continue;
      const cap = Saves.cityTroops(c);
      const cur = Saves.num(st.troops);
      if (cur >= cap) continue;                      // 超上限的城不拉低，只是不再漲
      const step = Math.max(1, Math.ceil(cap * 0.02));  // 600 上限 → 每月 +12
      const add = Math.min(cap, cur + step) - cur;
      if (add <= 0) continue;
      st.troops = cur + add;
      growCities += 1;
      growTroops += add;
    }
    if (growCities) pushLog(`守 軍 回 補：${growCities} 城 +${growTroops} 兵（上限依人口）`, 'info');

    // 內政代行（R10，`web/city_model.js:994` `autonomyTick`）：換月 lazy tick ——
    //   · 每城補**預備兵**（原作 +0x82 上限 / +0x86 現值；Monthly 補上限的 10%）；
    //   · 玩家在城內政頁標了「自治」的城各做一次開發（`save.auto`，`runAutonomy`）。
    // AI 城不標自治（那會花玩家國庫），所以對敵方勢力只生效「預備兵補給」這半；
    // AI 的內政動作仍走 R73 的 ACT=1 補金 / ACT=6 cheat（原作 ACT 表 9 項裡沒有「開發」）。
    // 與 R73/R74 不衝突：預備兵寫 `city.prep`，AI 出兵扣的是 `city.troops`（兩個池）。
    const tick = CM.autonomyTick(save, scenario.cities, { generals: GDATA.generals });
    if (tick && tick.auto && tick.auto.ok) pushLog(tick.auto.text, 'info');

    // [新設計] 俸祿：原作是每月「給糧」，這裡簡化成從國庫支金。
    // 每名武將 3 金/月；付不出來就只付到 0 並記欠俸，不靜默扣成負數。
    let officers = 0;
    for (const n of save.owned) officers += (garrisonIn(n)?.officers || []).length;
    const salary = Math.ceil(officers * 3);
    if (salary > 0) {
      if (save.gold >= salary) {
        save.gold -= salary;
        pushLog(`俸 祿 支 出：-${salary} 金（${officers} 名武將 · 每名 3）`, 'info');
      } else {
        const paid = Math.max(0, Math.floor(save.gold));
        save.gold = 0;
        pushLog(`俸 祿 欠 缺：需 ${salary} 金 · 只付得出 ${paid} → 民心 −、士氣 動搖`, 'lost');
      }
    }

    // 疲勞（原作 0x41B1BF）：每月先 -1（下限 0），再用減後的值判 ≥60 → 該城士氣 -1。
    // 士氣欄位目前不在存檔結構裡（saves.js.cityState 只有 troops/pop/money），所以城沒有
    // morale 時只記 skipped，不憑空造一個士氣；有 morale 的存檔（測試/未來的存檔）才真的扣。
    const officersByCity = {};
    for (const n of save.owned) {
      const list = garrisonIn(n)?.officers;
      officersByCity[n] = Array.isArray(list)
        ? list.map((x) => (typeof x === 'string' ? x : x && x.name)).filter((x) => typeof x === 'string' && x)
        : [];
    }
    const fatigue = tireMonthly(save, officersByCity);
    // 士氣（武將級）：疲勞 ≥60 的武將 -1，低迷（<30）自然 +1。tireMonthly 仍只回舊欄位，
    // 這裡另外算一份，避免去改疲勞測試鎖住的回傳形狀。
    const morale = moraleMonthly(save, officersByCity);
    if (fatigue.decayed > 0 || fatigue.high > 0) {
      let tireLog = `疲 勞：${fatigue.decayed} 人 -1`;
      if (fatigue.high > 0) {
        tireLog += `；高疲勞 ${fatigue.high} 人 → 士氣 -${morale.loss}`;
      }
      pushLog(tireLog, 'info');
    }
    if (morale.recovered > 0) {
      pushLog(`士 氣：低迷 ${morale.recovered} 人自然 +1（[新設計]）`, 'info');
    }

    // R65 忠誠漂移（原作 0x41B42B / 0x41B49D）：士氣 <40 → 忠誠 −1，否則 <90 → +1。
    // 疲勞/士氣兩段已由上面的 TIRE_CORE / MORALE_CORE 做完（那兩段被 tests 跨檔鎖死，不能重複漂移），
    // 這裡只補忠誠這一段；rowOf 要拿 garrison.json 的原始 LOYAL 作為初值來源。
    // R65 補：原作忠誠結算對「全部君主」都跑一次，所以 AI 武將也要漂（只算有主城；
    // 空城的在野武將沒有君主可叛）。玩家那一段維持原樣，AI 只是把同一個函式多掃一遍。
    const loyalRow = new Map();
    const loyalAll = {};
    let driftNames = 0;
    for (const c of ALL) {
      if (!forceAt(c.NAME)) continue;   // 空城不漂
      const list = garrisonIn(c.NAME)?.officers;
      if (!Array.isArray(list)) continue;
      const names = [];
      for (const o of list) {
        if (o && typeof o === 'object' && o.name) { loyalRow.set(o.name, o); names.push(o.name); }
      }
      if (names.length) { loyalAll[c.NAME] = names; driftNames += names.length; }
    }
    const drift = AI.monthlyDrift(save, loyalAll, {
      parts: 'loyal',
      rowOf: (name) => loyalRow.get(name) || null,
    });
    // R65 结果写进存档（save.drift）→ 顶栏 #driftLine + 城详情可读；原作只改数值不存摘要 [新设计]
    MM.recordDrift(save, {
      tire: { down: fatigue.decayed },
      spirit: { down: morale.loss, up: morale.recovered },
      loyal: { down: drift.loyal.down, up: drift.loyal.up },
      names: driftNames,
    }, save.month);
    if (drift.loyal.down || drift.loyal.up || fatigue.decayed || morale.recovered) {
      pushLog(MM.driftText(save), 'info');
    }

    // R68 月末補學（`core/unlock.ts:436`）：等級已到的武將技/軍師技一次補齊，寫回 `save.learned`。
    // 原作「升級補學」有地址、月末兜底是 [推測]；只記一行，避免每個武將一行把戰報刷爆。
    const learned = monthlyLearn(save);
    if (learned.length) {
      const total = learned.reduce((a, x) => a + x.got.length, 0);
      const first = learned[0];
      const names = first.got.map((x) => x.name).join('、');
      pushLog(`學 習：${learned.length} 名武將 補 ${total} 技（${first.name} 習 ${names}）`, 'info');
    }

    if (marchMode) {
      // 先讓已在路上的部隊走一個月；本月新出的兵從 0 起步，不參與本次推進
      advanceArmies(save.armies);
      marchSnapshot();
      // R73：每勢力每月一遍四段規劃 → ArgMax(哨兵 800) → 執行（原作 0x40D751）
      const ai = runAiMonth(force);
      if (AI_DBG) aiDebug(ai.lines);
      for (const atk of ai.incoming) spawnAiArmy(atk);
      if (handleMarchEvents(batch) && !batch) return;   // 已 autosave 並跳轉
      continue;
    }

    const ai = runAiMonth(force);
    if (AI_DBG) aiDebug(ai.lines);
    if (!ai.incoming.length) continue;
    if (batch) {
      for (const atk of ai.incoming) {
        pushLog(`敵 軍 來 攻：${atk.from} → ${atk.to}（敵 ${atk.et} 兵 / 我 ${atk.gt} 兵）`, 'atk');
        resolveDefense(atk);
      }
      continue;
    }
    // 單月推進只能真打一場：同月其餘來攻就地結算（[新設計]，原作沒有「一次只打一場」的限制，
    // 但單步流程要跳一次守城戰，多出來的只能先算掉）
    for (const atk of ai.incoming.slice(1)) {
      pushLog(`敵 軍 來 攻：${atk.from} → ${atk.to}（就地結算）`, 'atk');
      resolveDefense(atk);
    }
    const atk = ai.incoming[0];
    pushLog(`敵 軍 來 攻：${atk.from} → ${atk.to}（敵 ${atk.et} 兵 / 我 ${atk.gt} 兵）`, 'atk');
    // 单月推进：先自动存档再跳守城战，打完由 main.js 写回旧键，下次进页面自动同步到槽
    autosave();
    render();
    location.href = defendUrl(atk);
    return;
  }
  autosave();   // 任務 ③：每次推進一月（含批量）自動存到最近使用的槽
  render();
}

// ---------------------------------------------------------------- 启动 UI
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  const tab = t.dataset.tab;
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
  $('mapwrap').style.display = tab === 'map' ? 'block' : 'none';
  $('list').style.display = tab === 'list' ? 'block' : 'none';
  if (tab === 'map') resizeCanvas();
}));

// 默认地图视图
$('mapwrap').style.display = 'block';
$('list').style.display = 'none';
render();   // 先把 footer 按鈕渲染出來，fit() 量到的地圖高度才對
fit();
render();
window.SG?.audio?.bgm('map');   // [audio] 大地图 BGM = 17 号曲（原作 0x447FF2；旧值 terrain:0 放的是 06 战斗曲，已纠正）
// [audio] 已删除全局 pointerdown click 音：37c 审计确认原作没有 UI 按钮音（ACCEPT 全是 MENU\ 资源名），
// 我们的 click 音是凭空加的，噪音还盖住地图交互。

// 首訪（無存檔）→ 選劇本 + 新遊戲；有存檔 → 直接繼續並顯示當前劇本
if (boot.mode === 'new') showPicker();

// 調試參數：?panel=saves|new、?read=N（讀第 N 槽）、?adv=N、?demo=1
const panel = (qs.get('panel') || '').toLowerCase();
const readN = Number.parseInt(qs.get('read') || '', 10);
if (Number.isInteger(readN) && readN >= 1 && readN <= Saves.SLOT_COUNT) loadSlot(readN - 1);
if (panel === 'saves' || panel === 'save') openSaveSheet();
else if (panel === 'new' || panel === 'scenario' || panel === 'pick') showPicker();
// R4 除錯入口：?pick=king&sc=N 進頁面直接開君主浮層（截圖/自測用，正常遊玩走「新遊戲」）
if ((qs.get('pick') || '').toLowerCase() === 'king') {
  const scN = Number.parseInt(qs.get('sc') || '0', 10);
  showPicker('king', Number.isInteger(scN) ? scN : 0);
}

// R4/R78 除錯入口（截圖/驗收用）：?panel=monarch|forces|throne 直接開對應浮層；
// ?demo=extinct|inherit 走一次**正式流程**造出滅亡/繼承的戰報與 UI 提示（不另寫假的字串）。
if ((panel === 'monarch' || panel === 'king') && gameStarted) openMonarchSheet();
else if ((panel === 'forces' || panel === 'force') && gameStarted) openForceSheet();
else if (panel === 'throne' && gameStarted) openThroneSheet();
const demoKind = (qs.get('demo') || '').toLowerCase();
if (gameStarted && demoKind === 'extinct') {
  // 韓馥只有鄴一座城（garrison.json：辛評 60 / 韓馥 61 / 潘鳳 56）→ 先按正式失守口徑把鄴判給
  // 最近的勢力，城歸零後才滅亡；殘將裡潘鳳（忠誠 56 < 60）投降、辛評（60）在野。
  // 想看「無繼任者直接滅」的樣本：?demo=extinct&force=孔岫（譙只有孔岫在職、華佗在野）。
  const id = qs.get('force') || '韓馥';
  const list = forceCities(id);
  const officers = [];
  for (const n of list) for (const o of garrisonIn(n)?.officers || []) officers.push({ ...o });
  for (const n of list) {
    const near = [...(adj.get(n) || [])].map((x) => forceAt(x)).find(Boolean) || '';
    save.cities[n].owner = near;
    pushLog(`${n} 失 守（${near || '無主'}）`, 'lost');
  }
  forceExtinct(id, id, { officers });
  render();
} else if (gameStarted && demoKind === 'inherit') {
  // 張角 6 城 → 君主在平原陣亡，還有 5 城 → 同勢力繼承（張梁/張寶同族，勢力名/旗不變）
  kingFell('張角', '張角', { lostCity: '平原' });
  render();
}

// ?marchdemo=mid|arrive|three：給截圖/驗收用的行軍種子（沿用 ?demo=1 的調試思路）
function seedMarchDemo(kind) {
  if (!save || !gameStarted) return;
  const put = (side, from, to, progress, troops) => {
    const pi = marchPath(from, to);
    if (pi === null) return null;
    const a = {
      id: nextArmyId(), side, from, to, pathIndex: pi, progress, troops,
      general: localGeneral(from)?.name, reported: false,
    };
    save.armies.push(a);
    return a;
  };
  save.armies = [];
  if (kind === 'mid') {          // 兩支部隊都在路上
    put('A', '代縣', '晉陽', 0.55, 100);
    put('B', '易京', '北平', 0.45, 120);
  } else if (kind === 'arrive') { // 我軍已到敵城下
    put('A', '北平', '易京', 0.8, 100);
  } else if (kind === 'three') {  // 從 0 起步，連推三個月看 progress
    put('A', '代縣', '晉陽', 0, 100);
    put('B', '易京', '北平', 0, 120);
  } else if (kind === 'encounter') { // 同一條路上相向而行，一個月後撞上
    put('A', '代縣', '晉陽', 0.3, 100);
    put('B', '晉陽', '代縣', 0.1, 120);
  }
  render();
}

const marchDemo = (qs.get('marchdemo') || '').toLowerCase();
if (marchDemo) seedMarchDemo(marchDemo);

const adv = Number(qs.get('adv') || 0);
if (adv > 0 && gameStarted) advanceMonth(adv);
else if (MARCH_ON && gameStarted) handleMarchEvents(false);   // 讀檔後殘留的抵達/遭遇
// ?probe=1：把接線結果（等級/預備兵/兩條戰鬥入口）印進 #marchdbg，驗收截圖用
if (qs.get('probe') === '1' && gameStarted) wireProbe();
// ?saves=1：開局後直接打開存檔浮層（R70 驗收截圖用；不帶這個參數就是正常玩法）
if (qs.get('saves') === '1' && gameStarted) setTimeout(openSaveSheet, 0);
// ?v1check=1：只給自檢腳本用（V1 letterbox 驗收）——把 plotRect/hitCity/城座標
// 掛到 window 上，讓 CDP 能算「60 城在自己螢幕座標上能不能被 hitCity 命中」。
if (qs.get('v1check') === '1') {
  window.__v1 = {
    plotRect: () => plotRect(),
    toScreen,
    view: () => ({ ...view }),
    canvas: () => { const cv = $('map'); const b = cv.getBoundingClientRect(); return { w: cv.width, h: cv.height, rect: { x: b.x, y: b.y, w: b.width, h: b.height } }; },
    cities: () => ALL.map((c) => ({ name: c.NAME, xy: c.pos_xy.slice() })),
    hit: (x, y) => { const c = hitCity(x, y); return c ? c.NAME : null; },
  };
}

// ---------------------------------------------------------------- 存檔物件整理
/** 只補默认值、不删任何未知键：main.js 的 captured/drops 等要原样留着 */
function normalizeCampaign(raw) {
  // R70：先走版本迁移（无版本老档 → v2，补 60 城摘要/400 将表/勢力表所需的骨架）。
  // 这一层是"读不出来的保险"，纯逻辑在 saves.js，页面只记一次 from→to 用来提示。
  const up = Saves.upgradeSnapshot(raw);
  if (up.from >= 0 && up.from < up.to) {
    snapshotUpgrade = { from: up.from, to: up.to, steps: up.steps.slice() };
  }
  const s = up.snapshot || {};
  s.owned = Array.isArray(s.owned) ? s.owned.filter((n) => typeof n === 'string') : [];
  s.cities = s.cities && typeof s.cities === 'object' && !Array.isArray(s.cities) ? s.cities : {};
  s.month = Saves.intOr(s.month, 1, 1);
  const gold = Number(s.gold);
  s.gold = Number.isFinite(gold) ? Math.max(0, Math.trunc(gold)) : 1200;
  s.wins = Saves.intOr(s.wins, 0, 0);
  s.losses = Saves.intOr(s.losses, 0, 0);
  s.defWins = Saves.intOr(s.defWins, 0, 0);
  s.log = Array.isArray(s.log) ? s.log.slice(-8) : [];
  // 行軍部隊：舊檔沒有就是空陣列；未知鍵一律原樣留著
  s.armies = Array.isArray(s.armies) ? s.armies.filter((a) => a && typeof a === 'object') : [];
  s.armySeq = Saves.intOr(s.armySeq, 0, 0);
  s.scenario = Saves.intOr(s.scenario, 1, 1);
  // 疲勞：老檔沒有就補空物件（不是刪檔），值一律夾到 0..100 的整數
  s.tire = tireNormalize(s.tire);
  // 士氣（武將級）：先處理舊近似留下的城池級 `cities[*].morale`（改名 cityMorale，不搬成武將士氣），
  // 再把武將級 `morale` 正規化成 { [武將名]: 0..100 }。缺省 60 由 moraleOf() 在讀取時給，
  // 這裡不預先塞滿名冊（將領會換、名冊會變，塞死反而讓遷移變複雜）。
  cityMoraleMoved += moraleMigrateCities(s);
  s.morale = moraleNormalize(s.morale);
  // R8 一月一令：上次下过令的月份（0＝沒下過；等於 s.month 就是本月已用）
  s.lastActionMonth = Saves.intOr(s.lastActionMonth, 0, 0);
  // R4 君主：老檔沒有就留空，由 ensureKing() 之後按 owned 第一座城補
  s.king = typeof s.king === 'string' ? s.king : '';
  // R4 君主實體三欄：monarch（君主名）/ force（勢力 id，繼承後與君主名可能不同）/ monarchSince（即位月）。
  // 舊檔只有 king（其實存的是勢力/君主同一名字）→ 從 king 補；之後 ensureKing() 會再正規化一次。
  s.monarch = typeof s.monarch === 'string' ? s.monarch : '';
  s.force = typeof s.force === 'string' ? s.force : '';
  if (!s.monarch && s.king) s.monarch = s.king;
  if (!s.force && s.monarch) s.force = s.monarch;
  s.monarchSince = Saves.intOr(s.monarchSince, s.month, 1);
  // R78 勢力表 {id:{id,king,flag,alive,cities,ts,endedAt}}：缺的由 refreshForces() 反建；
  // 已滅亡的條目不刪（UI 要看「曾存續/已滅亡」，原作史書也是留名的）。
  s.forces = s.forces && typeof s.forces === 'object' && !Array.isArray(s.forces) ? s.forces : {};
  // R78 殘將歸宿 {武將名:{fate:'surrender'|'wild', force, month}}
  s.fate = fateNormalize(s.fate);
  // R65 上月漂移摘要（UI 用；公式仍是 ai_model.monthlyDrift / 0x41B1BF，摘要是 [新設計]）
  s.drift = s.drift && typeof s.drift === 'object' && !Array.isArray(s.drift) ? s.drift : null;
  // R63 戰績：wins/losses 之外還有連勝與最高連勝（原作 0x4084C9）
  s.streak = Saves.intOr(s.streak, 0, 0);
  s.bestStreak = Saves.intOr(s.bestStreak, 0, 0);
  // R65 忠誠：武將級 { [武將名]: 0..99 }，老檔沒有就空物件（初值由 garrison.json 的 LOYAL 給）
  s.loyal = loyalNormalize(s.loyal);
  // R68 武將等級/經驗：{ [武將名]: 整數 }，缺的由 ensureGeneralLevels() 按 BaseEXP 補
  s.generalLevel = levelMapNormalize(s.generalLevel, 1, 99);
  s.generalExp = levelMapNormalize(s.generalExp, 0, 0x7fffffff);
  // R68 已學技能：{ [武將名]: { magic:[序號], wise:[序號] } }（月末補學的結果，見 monthlyLearn）
  s.learned = learnedNormalize(s.learned);
  // R70：内存里始终按当前格式记版本；60 城摘要（troops/pop/money/def/cav/inf/prep/太守/军师/roster）
  // 由 snapshotForSave() 在写档前刷新，不在这里做（这一层只保证"读得出来"）。
  s.v = Saves.SNAPSHOT_VERSION;
  return s;
}

/** 忠誠映射正規化：只留 0..99 的整數值（原作 LOYAL 上限 90 起漂，夾到 99 防溢出） */
function loyalNormalize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of Object.keys(raw)) {
    const v = Number(raw[k]);
    if (!Number.isFinite(v)) continue;
    out[k] = Math.min(AI.DRIFT.LOYAL_MAX, Math.max(0, Math.round(v)));
  }
  return out;
}

/** R78 殘將歸宿正規化：只留 {fate:'surrender'|'wild', force, month} 的完整項 */
function fateNormalize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (!v || typeof v !== 'object') continue;
    if (v.fate !== 'surrender' && v.fate !== 'wild') continue;
    out[k] = {
      fate: v.fate,
      force: typeof v.force === 'string' ? v.force : '',
      month: Saves.intOr(v.month, 0, 0),
    };
  }
  return out;
}

/** 名冊數值映射（等級/經驗）：只留 lo..hi 的整數值，壞值丟掉 */
function levelMapNormalize(raw, lo, hi) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of Object.keys(raw)) {
    const v = Number(raw[k]);
    if (!Number.isFinite(v)) continue;
    out[k] = Math.min(hi, Math.max(lo, Math.trunc(v)));
  }
  return out;
}

/** 已學技能映射：`{ 名: {magic:[], wise:[]} }`，非正整數序號一律丟 */
function learnedNormalize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const seqs = (list) => (Array.isArray(list) ? list : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1);
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    out[k] = { magic: seqs(v.magic), wise: seqs(v.wise) };
  }
  return out;
}

/** 每城运行时状态（兵/民/金）：缺了就用当前剧本数据补，已有的字段不重置 */
function ensureCityState() {
  const names = new Set(ALL.map((c) => c.NAME));
  const seen = new Set();
  save.owned = save.owned.filter((n) => names.has(n) && !seen.has(n) && (seen.add(n), true));
  for (const c of ALL) {
    const st = save.cities[c.NAME];
    if (!st || typeof st !== 'object' || Array.isArray(st)) {
      save.cities[c.NAME] = Saves.cityState(c);
      continue;
    }
    if (!Number.isFinite(Number(st.troops))) st.troops = Saves.cityTroops(c);
    if (!Number.isFinite(Number(st.pop))) st.pop = Saves.num(c.POPULATION);
    if (!Number.isFinite(Number(st.money))) st.money = Saves.num(c.MONEY);
  }
  // 行軍部隊：只修不刪——城名/路徑對不上的才丟，progress 夾在 0..1
  save.armies = (Array.isArray(save.armies) ? save.armies : []).filter((a) => {
    if (!a || typeof a !== 'object') return false;
    if (a.side !== 'A' && a.side !== 'B') return false;
    if (!names.has(a.from) || !names.has(a.to) || a.from === a.to) return false;
    const p = scenario.paths[a.pathIndex];
    if (!p) return false;
    const pair = (p.Start === a.from && p.End === a.to) || (p.Start === a.to && p.End === a.from);
    return pair;
  }).map((a) => {
    a.progress = Math.min(1, Math.max(0, Saves.num(a.progress)));
    a.troops = Math.max(1, Math.trunc(Saves.num(a.troops)));
    a.id = typeof a.id === 'string' && a.id ? a.id : nextArmyId();
    return a;
  });
  // R78：每城都補一個明確的歸屬（AI 打下的城會被改寫 owner；'' = 空城）
  for (const c of ALL) {
    const st = save.cities[c.NAME];
    if (st && typeof st.owner !== 'string') st.owner = kingOf(c.NAME);
  }
  refreshForces();
  // R68：等級/經驗表也一起落地（存檔優先，缺的按 BaseEXP 補；?level= 不落檔）
  ensureGeneralLevels();
}

/** 舊鍵與槽快照的差異是不是一次戰鬥寫回（勝負/城數有變） */
function isBattleDelta(a, b) {
  const owned = (x) => JSON.stringify(Array.isArray(x) ? x : []);
  return Saves.num(a?.wins) !== Saves.num(b?.wins)
    || Saves.num(a?.losses) !== Saves.num(b?.losses)
    || Saves.num(a?.defWins) !== Saves.num(b?.defWins)
    || owned(a?.owned) !== owned(b?.owned);
}
