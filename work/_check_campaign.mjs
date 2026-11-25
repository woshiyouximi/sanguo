
import * as Saves from './saves.js';
// 一月一令的判定/记位只在 city_model.js 里实现一份，这里直接复用（纯逻辑，无 DOM）
import * as CM from './city_model.js';
// 守將真值：5 劇本 × 60 城的守軍/太守/駐將（src/core/garrison.ts 的 dist 產物）
import { battleSetup, defendersOf, garrisonOf } from '../dist/core/garrison.js';

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
const [scenRaw, sysRaw, generals, garRaw] = await Promise.all([
  fetch('../data/scenarios.json').then((r) => r.json()),
  fetch('../data/sango_system.json').then((r) => r.json()).catch(() => ({})),
  fetch('../data/generals.json').then((r) => r.json()),
  // 守將表缺了也要能開：kingOf/majorOf 會退回 scenarios.json 的 KING/MAJOR
  fetch('../data/garrison.json').then((r) => r.json()).catch(() => null),
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
const GDATA = { scenarios: SCEN, generals, garrison: garRaw };
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
 * 勢力名。劇本 1 有 12 座城的 KING 是轉換殘留的數字 1..12，garrison.json 已寫成
 * owner:""；原作裡這種城就是空城，所以只認字符串，數字一律當空城（不印「勢力 1」）。
 */
function kingOf(name) {
  const g = garrisonIn(name);
  if (g) return typeof g.owner === 'string' ? g.owner : '';
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
let selected = null;

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
const DISPATCH_TROOPS = 100;

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
    notice('偵測到舊版存檔（sanguo_campaign_v1），已自動遷移到槽 1', 12000);
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
  const entry = Saves.writeSlot(store, n - 1, save, { scenarioName: scenario.name, ts: save.ts });
  if (!entry) return null;
  Saves.saveStore(store, storage);
  Saves.writeLegacy(save, storage);
  refreshBadge();
  return entry;
}

function saveToSlot(index) {
  const i = Saves.slotIndex(index);
  if (i < 0) return;
  if (!gameStarted) return notice('尚未開局：先選劇本開始新遊戲。');
  save.ts = Date.now();
  const entry = Saves.writeSlot(store, i, save, { scenarioName: scenario.name, ts: save.ts });
  if (!entry) return notice('存檔失敗：槽位無效。');
  Saves.saveStore(store, storage);
  Saves.writeLegacy(save, storage);
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

const SAVE_TIP = '存＝寫入該槽（覆蓋） · 讀＝回到該槽 · 刪＝清空。<br>新遊戲只覆蓋目前使用中的槽，其他槽不動。';

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
    const p = Saves.slotParts(e, i);   // [槽N, 剧本, 第X年Y月, 城N, X勝Y敗, 时间]
    const tag = active ? '<span class="tag">使用中</span>' : '';
    rows.push(`<div class="slot${active ? ' on' : ''}">
      <div class="sl">
        <div class="l1"><b>槽 ${i + 1}</b> · ${p[1]}${tag}</div>
        <div class="l2">${p[2]} · ${p[3]} · ${p[4]} · ${p[5]}</div>
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
    ? `自動存檔：推進一月 / 戰鬥寫回 → 槽 ${slotNo()}；手動可存到任一槽`
    : '目前沒有進行中的存檔；先在「新遊戲」選劇本開局';
}

/* ---------------- R4 開局選君主 ---------------- */
// 劇本 [KING] 只有 NAME/FLAGNUM/SELECT/Type 四欄（docs/03c），沒有獨立國號欄位：
// 群英傳2 的「勢力」就是君主本人，所以頂欄「勢力」顯示君主名，旗號另外標在卡片上。
let pickMode = 'scenario';   // 'scenario' 選劇本 | 'king' 新檔選君主 | 'fix' 老檔補君主
let pendingKing = '';

const kingRoster = (sc = scenario) => (Array.isArray(sc?.kings) ? sc.kings : [])
  .filter((k) => k && typeof k.NAME === 'string' && k.NAME);
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
/** 頂欄：君主 <名> · 勢力 <國號/旗>；老檔補不出來就顯示「未選」並給「換君主」入口 */
function renderKingBar() {
  const king = typeof save?.king === 'string' ? save.king : '';
  $('kingName').textContent = king || '未選';
  const flag = king ? kingFlagOf(king) : 0;
  $('kingdomName').textContent = king ? (flag ? `${king} · 旗${flag}` : king) : '—';
  $('kingEdit').hidden = !gameStarted;
  $('dbgUnlimited').hidden = !UNLIMITED;
}
/** 老檔沒有 king：按 owned 第一座城的 KING 補；補不出來留空（允許之後在頂欄重選） */
function ensureKing() {
  if (typeof save.king === 'string' && save.king) return save.king;
  const first = (save.owned || [])[0];
  const k = first ? kingOf(first) : '';
  save.king = typeof k === 'string' ? k : '';
  return save.king;
}
/** 老檔「換君主」：只改 king 欄位與頂欄，不動已佔的城 */
function applyKingToSave(name) {
  save.king = typeof name === 'string' ? name : '';
  pushLog(save.king ? `君主：${save.king}（勢力 ${save.king}）` : '君主：未選', 'info');
  persist();
  autosave();
  render();
  notice(save.king ? `君主已設為 ${save.king}` : '已清除君主');
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
    save.king = k;
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
  selected = null;
  gameStarted = true;
  activeSlot = slotNo();
  Saves.writeSlot(store, activeSlot - 1, save, { scenarioName: scenario.name, ts: save.ts });
  Saves.saveStore(store, storage);
  Saves.writeLegacy(save, storage);
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
  ];
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
    snap.log = [{ t: Saves.monthLabel(d.month), s: '示範存檔（?demo=1）', k: 'info' }];
    Saves.writeSlot(st, i, snap, { scenarioName: sc.name, ts: snap.ts });
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
  $('rec').textContent = `${save.wins} 勝 ${save.losses} 敗` + (save.defWins ? ` · 守 ${save.defWins}` : '');
  renderKingBar();
  // R8 一月一令：本月已经下过令 → 徵兵/開發/出征 全部置灰（推進一月不受限）
  const locked = CM.monthLocked(save, UNLIMITED);
  const dis = locked ? ' disabled' : '';
  const sub = (normal) => locked ? CM.LOCK_HINT : normal;

  $('list').innerHTML = cities.map((c) => {
    const st = save.cities[c.NAME];
    const cls = ['city', mine(c.NAME) ? 'mine' : '', selected === c.NAME ? 'target' : ''].join(' ').trim();
    return `<div class="${cls}" data-name="${c.NAME}">
      <div class="n">${c.NAME}<span>${mine(c.NAME) ? '我方' : (kingOf(c.NAME) || '無主')}</span></div>
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
      const ready = troopsOf(selected) >= DISPATCH_TROOPS && !locked;
      acts.push(`<div class="btn primary" data-act="dispatch" ${ready ? '' : 'disabled'}>` +
        `<span>出 征</span><small>${locked ? CM.LOCK_HINT : (ready ? '選相鄰敵城 · 兵 ' + DISPATCH_TROOPS : '守軍不足 ' + DISPATCH_TROOPS)}</small></div>`);
    }
  } else if (selected) {
    const g = commander();
    const d = distFromOwned(selected);
    const ok = d === 1 && !locked;
    acts.push(`<div class="btn primary" data-act="march" ${ok ? '' : 'disabled'}>` +
      `<span>出 征</span><small>${locked ? CM.LOCK_HINT : (ok
        ? `目標 ${selected}${g ? ' · 主將 ' + g.name : ''}`
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
        return `出征 ${selected}：勢力 ${kingOf(selected) || '無主'} · 太守 ${majorOf(selected) || '—'} · 主將 ${chief}`
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
        king: kingOf(n), major: majorOf(n), guards: guardsOf(n, 3),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.len - b.len) || a.name.localeCompare(b.name));

  $('marchSub').textContent = `${selected} 周邊 ${targets.length} 個目標 · 出征 ${DISPATCH_TROOPS} 兵`;
  $('marchTargets').innerHTML = targets.length
    ? targets.map((t) => `<div class="scard" data-march="${t.name}">
      <div class="scn">${t.name}</div>
      <div class="scm">${t.major ? `${t.king ? '勢力 ' + t.king : '空城'} · 太守 ${t.major}` : (t.king ? '勢力 ' + t.king : '空城')}</div>
      <div class="scm">守將 ${t.guards.length ? t.guards.join('、') : '無人'}</div>
      <div class="scm">守軍 ${t.troops} 兵 · 道路 ${t.len} · ${t.months} 個月</div>
      <div class="sct">抵達城下再決戰</div>
    </div>`).join('')
    : '<div class="scard"><div class="scn">沒有可出征的相鄰城</div><div class="scm">先打下接壤的敵城，或切回列表看道路</div></div>';
  $('marchFoot').textContent = `出征兵力 ${DISPATCH_TROOPS} · 本城守軍 ${troopsOf(selected)}`;
  openSheet('marchSheet');
}

function dispatchArmy(to) {
  if (!MARCH_ON || !save || !selected) return;
  const from = selected;
  const pi = marchPath(from, to);
  if (pi === null) return toast('沒有可走的路：只能打相鄰城。');
  if (troopsOf(from) < DISPATCH_TROOPS) return toast(`守軍不足 ${DISPATCH_TROOPS} 兵，先徵兵再出征。`);
  save.cities[from].troops -= DISPATCH_TROOPS;
  save.armies.push({
    id: nextArmyId(), side: 'A', from, to, pathIndex: pi, progress: 0,
    troops: DISPATCH_TROOPS, general: defenderOf(from)?.name,
  });
  pushLog(`我 軍 出 征：${from} → ${to}（${DISPATCH_TROOPS} 兵，${marchMonths(pi)} 個月）`, 'info');
  CM.markMonthActed(save, UNLIMITED);   // R8：派兵出征也算本月已下令
  persist();   // 進戰鬥前先鏡像到舊鍵，回來時 main.js 的寫回會被偵測到
  closeOverlays();
  render();
  notice(`已從 ${from} 出征 ${to}：${DISPATCH_TROOPS} 兵在途，${marchMonths(pi)} 個月到城下`);
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
  const s = Math.min(view.w / IMG.w, view.h / IMG.h) * 0.965;
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
  // 城
  let li = 0;
  for (const c of ALL) {
    const [sx, sy] = toScreen(c.pos_xy[0], c.pos_xy[1]);
    li++;
    const own = mine(c.NAME);
    const sel = selected === c.NAME;
    const r = sel ? 15 : 11;
    g.beginPath(); g.arc(sx, sy, r + 3, 0, Math.PI * 2);
    g.fillStyle = own ? 'rgba(79,126,108,.35)' : 'rgba(184,69,47,.22)';
    g.fill();
    g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2);
    g.fillStyle = own ? '#5E9C85' : '#8E5A4E';
    g.fill();
    if (sel) { g.lineWidth = 3; g.strokeStyle = '#F3E0B4'; g.stroke(); }
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
  // 图例
  g.textAlign = 'left'; g.font = '15px "Noto Sans SC",sans-serif';
  g.save(); g.shadowColor = 'rgba(5,7,10,.9)'; g.shadowBlur = 3;
  g.fillStyle = 'rgba(233,228,214,.62)';
  g.fillText('● 我方', 16, cv.height - 34);
  g.fillStyle = 'rgba(184,69,47,.9)'; g.fillText('● 敵方', 84, cv.height - 34);
  g.fillStyle = 'rgba(233,228,214,.42)';
  g.fillText(!USE_BG ? '?bg=0：已關閉底圖，僅供對比'
    : (USE_ROUTES ? '細線＝不可通行（原作哨兵路徑）' : '底圖：中國海岸線與江河道路（開發期占位）'),
    152, cv.height - 34);
  g.restore();
}

$('map').addEventListener('click', (ev) => {
  const r = ev.target.getBoundingClientRect();
  const px = (ev.clientX - r.left) * (view.w / r.width);
  const py = (ev.clientY - r.top) * (view.h / r.height);
  let best = null, bd = 1e9;
  for (const c of ALL) {
    const [sx, sy] = toScreen(c.pos_xy[0], c.pos_xy[1]);
    const d = (sx - px) ** 2 + (sy - py) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  if (best && bd < 40 * 40) { selected = best.NAME; render(); }
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
    const leader = localGeneral((save.owned && save.owned[0]) || selected);
    const dq = new URLSearchParams({
      city: selected,
      from: (save.owned && save.owned[0]) || selected,
    });
    if (leader) dq.set('amorale', String(moraleOf(save, leader.name)));
    if (UNLIMITED) dq.set('unlimited', '1');
    location.href = './deploy.html?' + dq.toString();
    return;
  }
  if (act === 'march_direct') {
    // 舊「點城直接開戰」的野戰入口（?march=0 的回歸對照用）：
    // 敵將不再是 DEFENSE/8 的代理值，而是 garrison.json 裡該城的真守將。
    const troops = st.troops;
    const enemy = battleSetup(GDATA, currentScenarioIdx(), selected, 100);
    const q = new URLSearchParams({
      city: selected, from: 'campaign',
      soldiers: '100',
      bsoldiers: String(Math.max(60, Math.min(100, Math.round(troops / 6)))),
      bgen: enemy.enemyGeneral.name,
      bstr: String(enemy.enemyGeneral.str),
      bint: String(enemy.enemyGeneral.int),
    });
    const g = commander(); if (g) {
      q.set('gen', g.name);
      q.set('amorale', String(moraleOf(save, g.name)));
    }
    q.set('bmorale', String(moraleOf(save, enemy.enemyGeneral.name)));
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

// 敌城出兵候选：只看"与某座我方城相邻"的敌城。
// 目标 = 相邻我方城里守军最少的那座；敌兵 < 守军 + 30 就不出兵；
// 概率 = min(0.6, (敌 − 我) / 200)：差得越多越敢来，但封顶 60%。
function aiCandidates() {
  const out = [];
  for (const c of ALL) {
    if (mine(c.NAME)) continue;
    const st = save.cities[c.NAME];
    if (!st) continue;
    const mineNb = [...(adj.get(c.NAME) || [])].filter((n) => mine(n));
    if (!mineNb.length) continue;
    // 同兵时按名字排序，保证 ?seed= 下可复现
    mineNb.sort((a, b) => (troopsOf(a) - troopsOf(b)) || a.localeCompare(b));
    const to = mineNb[0];
    const gt = troopsOf(to);
    if (st.troops < gt + 30) continue;
    out.push({
      from: c.NAME, to,
      et: st.troops, gt,
      p: Math.min(0.6, (st.troops - gt) / 200),
      def: c.DEFENSE || 0,
    });
  }
  out.sort((a, b) => (b.p - a.p) || ((b.et - b.gt) - (a.et - a.gt)) || a.from.localeCompare(b.from));
  return out;
}

// 每月最多 1 次：按"最想打"的顺序逐个掷骰，第一个成功的就是本月的进攻。
// ?forceatk=1 只跳过掷骰，不跳过"敌 ≥ 我 + 30"的兵力门槛。
function rollAI(force) {
  for (const c of aiCandidates()) {
    if (force || Math.random() < c.p) return c;
  }
  return null;
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

// 守城战入场 URL：防守方永远是 index.html 的 A 方（我方，背视），
// 敌军数值放 B 方；守军/敌军都压在 100 以内（战场上最多摆 100 个兵）。
// 来犯的敌将取 atk.from（出发的敌城）的 garrison.json 首席守将，
// 不再用 50 + 防御/8 的代理值。
function defendUrl(atk) {
  const g = defenderOf(atk.to);
  const chief = garrisonIn(atk.from)?.officers?.[0];
  const q = new URLSearchParams({
    defend: '1', city: atk.to, from: 'campaign',
    soldiers: String(Math.max(1, Math.min(100, atk.gt))),
    bsoldiers: String(Math.max(1, Math.min(100, atk.et))),
    bgen: chief?.name || '來犯之將',
    bstr: String(chief?.str ?? 70),
    bint: String(chief?.int ?? 70),
  });
  if (g) q.set('gen', g.name);
  if (g) q.set('amorale', String(moraleOf(save, g.name)));
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
    save.wins += 1;
    save.defWins = (save.defWins || 0) + 1;
    pushLog(`守 住 ${atk.to}（我 ${my} 兵 對 敵 ${en} 兵，損 ${lost}）`, 'hold');
  } else {
    save.owned = save.owned.filter((n) => n !== atk.to);
    save.cities[atk.to].troops = Math.max(30, Math.round(en * 0.6));
    save.losses += 1;
    // 士氣（武將級）：批量推進的敗仗也算敗，守將 -10 [新設計]（與 main.js 的寫回同一口徑）
    const chief = defenderOf(atk.to);
    const moraleLost = chief ? moraleDefeat(save, chief.name) : 0;
    pushLog(`${atk.to} 失 守（我 ${my} 兵 對 敵 ${en} 兵${moraleLost ? `，${chief.name} 士氣 -${moraleLost}` : ''}）`, 'lost');
  }
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
  if (w.side === 'A') { save.wins += 1; pushLog(`野 戰 勝：${a.from} 軍 擊 退 ${b.from} 軍（餘 ${w.troops} 兵）`, 'win'); }
  else { save.losses += 1; pushLog(`野 戰 敗：${b.from} 軍 擊 退 我 ${a.from} 軍`, 'lost'); }
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

    if (marchMode) {
      // 先讓已在路上的部隊走一個月；本月新出的兵從 0 起步，不參與本次推進
      advanceArmies(save.armies);
      marchSnapshot();
      const newAtk = rollAI(force);
      if (newAtk) spawnAiArmy(newAtk);
      if (handleMarchEvents(batch) && !batch) return;   // 已 autosave 並跳轉
      continue;
    }

    const atk = rollAI(force);
    if (!atk) continue;
    pushLog(`敵 軍 來 攻：${atk.from} → ${atk.to}（敵 ${atk.et} 兵 / 我 ${atk.gt} 兵，${Math.round(atk.p * 100)}%）`, 'atk');
    if (batch) { resolveDefense(atk); continue; }
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

// ---------------------------------------------------------------- 存檔物件整理
/** 只補默认值、不删任何未知键：main.js 的 captured/drops 等要原样留着 */
function normalizeCampaign(raw) {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
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
  return s;
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
}

/** 舊鍵與槽快照的差異是不是一次戰鬥寫回（勝負/城數有變） */
function isBattleDelta(a, b) {
  const owned = (x) => JSON.stringify(Array.isArray(x) ? x : []);
  return Saves.num(a?.wins) !== Saves.num(b?.wins)
    || Saves.num(a?.losses) !== Saves.num(b?.losses)
    || Saves.num(a?.defWins) !== Saves.num(b?.defWins)
    || owned(a?.owned) !== owned(b?.owned);
}
