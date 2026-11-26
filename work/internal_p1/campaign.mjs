
import * as Saves from './saves.js';
// 紀元：原作頂欄是「西元 209年 3月」（A_map_t0130.png），存檔行是「時間209年」。
// 換算（year ↔ 公元）只在 era.js 裡有一份，這裡只拿字串，**不動 save.year/month 的內部口徑**。
import * as Era from './era.js';
// 一月一令的判定/记位只在 city_model.js 里实现一份，这里直接复用（纯逻辑，无 DOM）
import * as CM from './city_model.js';
// R73–R76 / R78 / R65 的 AI 纯逻辑（候选表、四段规划、ArgMaxRate、势力归属、月度漂移）。
// 全部在 ai_model.js 里实现，这里只做「存档 ↔ world」搬运与显示；tests/campaign_ai.test.ts 直接测那份。
import * as AI from './ai_model.js';
// R4/R78/R65/R75 的君主·勢力·滅亡·繼承·漂移摘要純邏輯（無 DOM，tests/monarch.test.ts 直接測）
import * as MM from './monarch_model.js';
// R86 S2-2：items.html（凍結檔）把裝備寫在 localStorage 的 `sanguo_items_v1` 裡，這條線以前
// 完全沒接到大地圖/戰鬥，所以武力加成不生效、換將後裝備也不跟。純邏輯（序號 ↔ 物品名 ↔
// 十項加成）都在 items_model.js，這裡只做「頁面存檔 → 存檔 v3 可選 equip 欄 → 戰鬥/地圖數值」。
import * as Items from './items_model.js';
// 守將真值：5 劇本 × 60 城的守軍/太守/駐將（src/core/garrison.ts 的 dist 產物）
import { battleSetup, defenderBattleParams, defendersOf, garrisonOf } from '../dist/core/garrison.js';
import { levelOf } from '../dist/core/levels.js';
// R94 出陣隊列：與 deploy.html / cocos DeployRoot.ts 同一份純邏輯（5 槽、順序即出陣序）。
// 這裡只負責「出征前把隊列寫進存檔」，順序本身在編成頁調（軍師技 seq 3「後選出陣」放開前 3 槽）。
import * as DQ from '../dist/core/deploy_queue.js';
// 武將等級/學習（R68）：月末補學走 core/unlock.ts 的 monthlyLearnCheck（純邏輯，無 DOM）
import { createLearnState, monthlyLearnCheck } from '../dist/core/unlock.js';
// R95 軍師（project/185）：「任命軍師」要真的挑得出一招，所以這裡用出征頁同一份 core 過濾
// （listWisdomChoices 按 WISESKILL 學習等級 + 將等級，見 src/core/wises.ts:563），
// 戰鬥側則把選中的 seq 寫成 ?wise= 交給 main.js:705 的 applyWise 戰前發動。
import { listWisdomChoices, wiseHintOf } from '../dist/core/wises.js';
// R56 戰後武將處置：斬首出池 / 招降入城（core/roster.ts 的 dist 產物；web 側唯一接線點）
// R85 起改走"先逐將詢問、玩家決策後才落庫"：surrenderCandidates（卡片）+ applySurrender（決策）
// + needSurrenderPanel（空列表不弹）；applyPostBattle 仍是 applySurrender 的下游，這裡不再直接調。
// R208（P0）：勝者才有處置權 —— 我方戰敗時不開面板，被俘將交敵方 AI 處置
// （applyAiDisposal / planAiDisposal，沿用戰鬥頁已判結果，不重擲）；decideBattleWon 讀
// main.js 戰後寫回的 save.lastBattle（缺失時兜底），ourForceNames 給面板的 mine 名單。
import {
  applyAiDisposal,
  applySurrender,
  decideBattleWon,
  needSurrenderPanel,
  ourForceNames,
  planAiDisposal,
  readBattleOutcome,
  surrenderCandidates,
} from '../dist/core/roster.js';

const stage = document.getElementById('stage');
const $ = (id) => document.getElementById(id);
// 地圖視口尺寸。**宣告在這么前面是刻意的**（R86 / P0 死檔）：resizeCanvas() 會讀寫 view，
// 而 window.resize 監聽在 :415 就掛上了；只要模組求值中途有任何一次例外，`let view` 就永遠
// 停在 TDZ，之後每次 resize 都再拋 "Cannot access 'view' before initialization"，
// 把一次崩潰放大成"整頁永久死"。提到頂部 = 這個變數從模組一開始就存在，守衛才有意義。
let view = { w: 750, h: 900, pad: 40 };
function fit() {
  if (!stage) return;
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

/**
 * 調試口 gate（project/115_发布卫生.md §6）：沒開 dev 模式時，把調試/回歸用的查詢鍵從
 * `qs` 裡剔掉，只留**頁面之間的協議鍵**（city/a/gen/from/lv/blevel/bsoldiers，以及作為
 * 出征目標語義的 march=<城名>）。做法是「先複製一份副本再刪」，所以 `location.search`
 * 本身不動 —— 需要原始字串的地方（例如頁間跳轉重拼參數）照舊。
 *
 * 為什麼是白名單式刪除而不是逐個 gate 讀取點：讀取點散在 20+ 處、`if (qs.get('demo'))`
 * 這種寫法每加一處就得再守一次；在入口集中刪掉，漏 gate 的風險只剩「新加的鍵忘了登記」，
 * 而那就由 `SGDev.DEV` + 這張表清單一起暴露。`devflags.js` 沒載入時 `SGDev` 退化為全關，
 * 所以默認行為是「調試口全關」，與發佈版一致。
 */
const DEV_QUERY_KEYS = [
  'dev', 'marchdbg', 'aidbg', 'seed', 'level', 'demo', 'sel', 'bg', 'routes', 'kinds',
  'maxacts', 'unlimited', 'auto', 'forceatk', 'panel', 'read', 'pick', 'sc', 'force',
  'marchdemo', 'probe', 'adv', 'saves', 'v1check',
  'sur', 'surafter', 'surall', 'surdead', 'surking', 'surscen', 'surstart',
  // R196：招降面板真值截图的種值口（種的是存檔的同一個鍵，見 seedSurFieldsProbe）
  'surmor', 'surtire', 'surrec',
];
const DEV_FLAG = !!(window.SGDev && window.SGDev.DEV);
function gateQuery(raw) {
  if (DEV_FLAG) return raw;
  const out = new URLSearchParams(raw.toString());
  for (const k of DEV_QUERY_KEYS) out.delete(k);
  return out;
}
const qs = gateQuery(new URLSearchParams(location.search));
// 行軍開關：預設開；?march=0 回到「點城直接出征」的舊行為，方便對比（`march=0` 也是調試口，見上）
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
const [scenRaw, sysRaw, generals, garRaw, magics, wises, itemRaw, levelRaw] = await Promise.all([
  fetch('../data/scenarios.json').then((r) => r.json()),
  fetch('../data/sango_system.json').then((r) => r.json()).catch(() => ({})),
  fetch('../data/generals.json').then((r) => r.json()),
  // 守將表缺了也要能開：kingOf/majorOf 會退回 scenarios.json 的 KING/MAJOR
  fetch('../data/garrison.json').then((r) => r.json()).catch(() => null),
  // 武將技/軍師技：`createLearnState()` 要用 name 反查（core/unlock.ts:295 learnTableOf）。
  // 缺了就是「學不到東西」（pendingLearn 全空），不會拋錯。
  fetch('../data/magics.json').then((r) => r.json()).catch(() => []),
  fetch('../data/wises.json').then((r) => r.json()).catch(() => []),
  // R86 S2-2：裝備表（和 items.html 同一份 data/items.json）。缺了只會「裝備不加值」，
  // 不會拋錯 —— 這條線本來就沒接，寧可退回舊行為也不要讓大地圖打不開。
  fetch('../data/items.json').then((r) => r.json()).catch(() => []),
  // R85：分劇本起始等級（TIMES1..5.INI 的 BaseEXP 反推，見 project/136 與 core/levels.ts）。
  // 缺檔只會退回「BaseEXP 200 ⇒ Lv2」，不會讓大地圖打不開。
  fetch('../data/levels_by_scenario.json').then((r) => r.json()).catch(() => null),
]);
// 裝備序號 → 物品（items.html 的存檔只記 Sequence）。註冊表在 items_model.js 裡。
const ITEM_DEFS = Array.isArray(itemRaw) ? itemRaw : (itemRaw?.items || []);
Items.registerItems(ITEM_DEFS);
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
// ---------------------------------------------------------------- 分劇本起始等級（R85）
// `data/levels_by_scenario.json` 是 g2 從 `TIMES1..5.INI` 抽出來的 401 將 × 5 劇本表，
// 每個劇本一個 `baseExpCommon` ⇒ Lv2 / Lv2 / Lv4 / Lv6 / Lv8（`project/136`）。
// `generals.json` 只有 Times1 的 BaseEXP（400 将全 200），所以**只靠 generals.json 反推會全員 Lv2**，
// 分劇本的區分度只能從這張表來。缺檔 / 缺名字 → 退回 `levelOf(行)`。
const SCEN_LEVELS = (() => {
  const list = Array.isArray(levelRaw?.scenarios) ? levelRaw.scenarios : [];
  return SCEN.map((_, i) => {
    const row = list[i];
    return row && row.levels && typeof row.levels === 'object' ? row.levels : {};
  });
})();

/** 當前劇本下該將的起始等級（表 → `core/levels.ts` 兜底）；沒有名字就回 1 */
function scenarioLevelOf(name, scenIdx = currentScenarioIdx()) {
  const cell = SCEN_LEVELS[scenIdx]?.[name];
  const lv = Number(cell?.level);
  if (Number.isFinite(lv) && lv >= 1) return Math.min(99, Math.trunc(lv));
  return levelOf(generalRow(name) || {});
}
// `?dev=1` 才掛：給 CDP 驗收「分劇本等級表真的有接上」用（release 包裡不存在）
if (typeof window !== 'undefined' && !window.__RELEASE__ && /[?&]dev=1(?:&|$)/.test(location.search)) {
  window.__scenLv = (name, i) => scenarioLevelOf(String(name || ''), Number(i) || 0);
  window.__scenLevels = () => SCEN_LEVELS.map((m) => Object.keys(m).length);
}

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

// [[MARCH_UI_CORE]]
/**
 * 大地圖部隊層的**純邏輯**：進度→折線座標、同點多軍錯開、命中判定、變更目的校驗、剩餘月數。
 * 這裡刻意不讀任何頁面狀態（save/view/canvas），所以 tests/march_ui.test.ts 可以直接把
 * 這一段抽出來 `new Function` 跑，不需要 DOM。改這裡請同時看一眼 tests/march_ui.test.ts。
 *
 * 為什麼留在頁面而不是 src/core：campaign.html 不能 import main.js / core（R85 邊界），
 * 既有行軍邏輯（marchPath / armyPos / advanceArmies）本來就在這個 `<script type="module">` 裡。
 */
const MARCH_FLAG_W = 11;      // 旗面寬（原作部隊小旗約 8–10px，見 work/video_ui/A_map_t0130.png；留 11 是为在 750 宽地图上可读）
const MARCH_HIT_R = 16;       // 部隊命中半徑（任務要求 ≥14：旗比命中圈小，14–16 手指才按得準）
const MARCH_STACK_GAP = 13;   // 同點多支部隊的錯開間距（螢幕像素）

function marchClamp01(n) {
  return Number.isFinite(Number(n)) ? Math.min(1, Math.max(0, Number(n))) : 0;
}

/**
 * 折線上按 0..1 插值。`reverse` = 這條路的 Start 不是出發城（兵團從 End 出發），progress 要鏡像。
 * 方向錯了部隊會「倒著走」，所以這條規則只能有一份：armyPos() 直接調用本函數。
 * 回傳 [x, y]；沒有可用點時回 [0, 0]（呼叫端照舊畫在原點，不會出現 NaN）。
 */
function marchLerpPoint(points, progress, reverse) {
  const pts = [];
  for (const q of Array.isArray(points) ? points : []) {
    if (!Array.isArray(q) || q.length < 2) continue;
    const x = Number(q[0]), y = Number(q[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
  }
  if (!pts.length) return [0, 0];
  if (pts.length === 1) return [pts[0][0], pts[0][1]];
  const t = marchClamp01(progress);
  const along = reverse ? 1 - t : t;
  let total = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d); total += d;
  }
  if (total <= 0) return [pts[0][0], pts[0][1]];
  let want = along * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const k = segs[i] > 0 ? Math.min(1, want / segs[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    want -= segs[i];
  }
  return [pts[pts.length - 1][0], pts[pts.length - 1][1]];
}

/**
 * 多支部隊疊在同一點時的錯開（純幾何）。依序給每支找第一個「離已放置的都 ≥ minDist」的槽，
 * 九宮格優先序：原地 → 右 → 左 → 下 → 上 → 四角。同一批輸入永遠得到同一組位置，
 * 而且**畫旗與點擊吃的是同一組**，所以不會「旗在這、點在那」。
 */
function marchStackPlace(base, minDist = MARCH_STACK_GAP) {
  const list = Array.isArray(base) ? base : [];
  const gap = Number.isFinite(Number(minDist)) && Number(minDist) > 0 ? Number(minDist) : MARCH_STACK_GAP;
  const offs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const out = [];
  for (const p of list) {
    const x = Number(p && p[0]) || 0, y = Number(p && p[1]) || 0;
    let spot = [x, y];
    for (const [ox, oy] of offs) {
      const cand = [x + ox * gap, y + oy * gap];
      const clash = out.some((q) => Math.hypot(cand[0] - q[0], cand[1] - q[1]) < gap - 0.001);
      if (!clash) { spot = cand; break; }
    }
    out.push(spot);
  }
  return out;
}

/**
 * 命中：螢幕座標 → 最近部隊的索引（半徑 r，預設 MARCH_HIT_R）；沒有 → -1。
 * 用圓而不是方框：斜著點到也算，和畫出來的旗視覺一致。
 */
function marchHitArmy(placed, px, py, r = MARCH_HIT_R) {
  const list = Array.isArray(placed) ? placed : [];
  const rad = Number.isFinite(Number(r)) && Number(r) > 0 ? Number(r) : MARCH_HIT_R;
  const lim = rad * rad;
  const qx = Number(px), qy = Number(py);
  let best = -1, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const dx = (Number(list[i] && list[i][0]) || 0) - qx;
    const dy = (Number(list[i] && list[i][1]) || 0) - qy;
    const d = dx * dx + dy * dy;
    if (d <= lim && d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * 「變更目的」校驗（純）。道路合法性**完全沿用既有 marchPath**（由調用方注入 `pathOf`）：
 * 相鄰、非哨兵路徑、不同城 → 回 pathIndex；否則 null。另外三條否決都來自本作既有口徑：
 *   · 敵軍兵團不能改目的 —— 兵團指令只對我軍開放；
 *   · 目的＝出發城 → 那是「退兵」，走兵團指令的「進入城內」；
 *   · 目的＝我方城池 → 本作兵團只有「出征」一種（marchPath 只認路，不認歸屬，但抵達結算
 *     只處理「我軍到敵城下」「敵軍到我城下」兩種，往自家城走會沒有落點）。
 * 回傳 `{ ok, pathIndex?, why }`；`why` 直接顯示給玩家，所以要寫人話。
 */
function marchRetargetCheck(army, to, pathOf, isMine) {
  const a = army && typeof army === 'object' ? army : null;
  if (!a) return { ok: false, why: '沒有選中兵團。' };
  if (a.side !== 'A') return { ok: false, why: '敵軍兵團不能變更目的。' };
  const dest = typeof to === 'string' ? to : '';
  if (!dest) return { ok: false, why: '沒有選中城市。' };
  if (dest === a.to) return { ok: false, why: `兵團的目的地已經是 ${dest}。` };
  if (dest === a.from) {
    return { ok: false, why: `目的城不能是出發城 ${a.from}：部隊要回城請用「進入城內」。` };
  }
  const fn = typeof pathOf === 'function' ? pathOf : () => null;
  const pi = fn(a.from, dest);
  if (pi === null || pi === undefined || !Number.isFinite(Number(pi))) {
    return { ok: false, why: `${a.from} 到 ${dest} 沒有可行道路：兵團只能改為與出發城相鄰的城。` };
  }
  if (typeof isMine === 'function' && isMine(dest)) {
    return { ok: false, why: `${dest} 是我方城池：本作兵團只能開往敵城或空城。` };
  }
  return { ok: true, pathIndex: Number(pi), why: '' };
}

/**
 * 行軍剩餘：`step` 是每月推進的 progress 增量（marchStep(pathIndex)）。
 * 天＝月×30 只是顯示換算（[推測] 原作按月推進，UI 上沒有「天」欄位）。
 */
function marchRemain(progress, step, daysPerMonth = 30) {
  const p = marchClamp01(progress);
  const s = Number(step);
  const left = s > 0 ? (1 - p) / s : 0;
  const months = Math.max(0, Math.round(left * 10) / 10);
  const days = Math.round(months * (Number(daysPerMonth) || 30));
  return { progress: p, pct: Math.round(p * 100), months, days };
}

/** 部隊此刻站在哪座城上：progress 0 → 出發城、1 → 目的城；在路上回 '' */
function marchAtCity(army) {
  const p = marchClamp01(army && army.progress);
  if (p <= 0) return (army && army.from) || '';
  if (p >= 1) return (army && army.to) || '';
  return '';
}
// [[/MARCH_UI_CORE]]

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
  return marchLerpPoint(pts, a.progress, a.from === p.End && a.from !== p.Start);
}

/**
 * 推进一个月（原地改 progress），到达的进 arrived；已到的不再前进。
 * R95：駐紮中的部隊 progress 凍結（planArmyMoves 回傳原值）；道上被敵方駐紮部隊擋著的
 * 最多走到接觸點就不動了（renderer 照舊只讀 a.progress，所以畫面上就是停在那裡）。
 */
function advanceArmies(list) {
  const arrived = [], still = [];
  for (const it of planArmyMoves(list, (a) => marchStep(a.pathIndex))) {
    const a = it.army;
    a.progress = it.progress;
    (it.arrived ? arrived : still).push(a);
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

// [[MARCH_STATION_CORE]]
// ---------------------------------------------------------------- 駐紮 / 軍師（project/185）
// 這一整段是**純函數**（不碰 DOM、不讀 save、不改 view），tests/march_station.test.ts 用
// new Function 直接抽出去跑（手法同 [[MARCH_UI_CORE]]）。頁面接線在下面各呼叫點。
//
// 兩個定義（使用者原話，照它實現）：
//   部隊駐紮 = 部隊不入城，在道路上停滯，阻擋沿道路來的敵人。
//   任命軍師 = 從軍團內找一個武將任命為軍師。
//
// 調參：接觸容差 0.5% 的行程。相向兩軍 progress 相加 ≥ 1 就是「撞上」（同 armiesIntercept），
// 駐紮方不退讓，所以推進方停在 1 - 駐紮方 progress - 容差 上：看得見碰到、又不會越過去。
const STATION_EPS = 0.005;
// 浮點補償：0.005 在二進位裡不是精確值（1 - 0.5 - 0.005 差 4.4e-18 就超出容差），
// 判「貼著接觸點」時放寬一個極小的 slack，否則這條判定在真機上一次都不會命中。
const STATION_SLACK = 1e-9;

/** 舊檔相容：officers/advisor/stationed 三個新欄位都補成可讀的預設值（不刪任何未知鍵） */
function normalizeArmyExtras(a) {
  if (!a || typeof a !== 'object') return a;
  const officers = [];
  const add = (n) => {
    const s = typeof n === 'string' ? n.trim() : '';
    if (s && !officers.includes(s)) officers.push(s);
  };
  for (const n of (Array.isArray(a.officers) ? a.officers : [])) add(n);
  // 主將一定在名單裡（舊檔沒有 officers，就只剩主將一人）
  const general = typeof a.general === 'string' ? a.general.trim() : '';
  if (general && !officers.includes(general)) officers.unshift(general);
  a.officers = officers;
  const advisorName = typeof a.advisor === 'string' ? a.advisor.trim() : '';
  a.advisor = advisorName && officers.includes(advisorName) ? advisorName : '';   // 空字串＝沒任命（軍師＝主將兼）
  a.stationed = a.stationed === true;
  return a;
}

/** 隨軍武將名單（補過預設值，主將在最前；同一人只算一次） */
function armyOfficerList(a) {
  if (!a || typeof a !== 'object') return [];
  const out = [];
  const add = (n) => {
    const s = typeof n === 'string' ? n.trim() : '';
    if (s && !out.includes(s)) out.push(s);
  };
  const general = typeof a.general === 'string' ? a.general.trim() : '';
  if (general) add(general);
  for (const n of (Array.isArray(a.officers) ? a.officers : [])) add(n);
  return out;
}

/** 出發時從出發城名冊帶走的隨軍名單：主將在最前，其餘按名冊順序，去重 */
function armyOfficerNames(roster, general) {
  const out = [];
  const add = (n) => {
    const s = typeof n === 'string' ? n.trim() : '';
    if (s && !out.includes(s)) out.push(s);
  };
  if (typeof general === 'string') add(general);
  for (const n of (Array.isArray(roster) ? roster : [])) add(n);
  return out;
}

// 一支兵團最多帶 5 名武將（＝出征頁的出陣槽數 DEPLOY_SLOTS）
const ARMY_MAX_OFFICERS = 5;

/**
 * 出發時的隨軍名單（純函數，project/185 §C2）：
 *   1. 主將一定在，且排第一；
 *   2. 出征頁/出陣順序（save.deployQueue 的 5 槽）裡**屬於這座城名冊**的人優先；
 *   3. 不夠就按出發城名冊（在冊且非太守＝名冊第 2 人起）補齊；
 *   4. 最多 5 人。只做名單 —— 不把任何人從城裡移走，回城也不重複加。
 */
function armyRosterPick(queueNames, rosterNames, general, max) {
  const cap = Math.max(1, Math.min(ARMY_MAX_OFFICERS,
    Number.isFinite(Number(max)) ? Math.trunc(Number(max)) : ARMY_MAX_OFFICERS));
  const out = [];
  const seen = new Set();
  const add = (n) => {
    const s = typeof n === 'string' ? n.trim() : '';
    if (!s || seen.has(s) || out.length >= cap) return;
    seen.add(s);
    out.push(s);
  };
  add(general);
  const roster = (Array.isArray(rosterNames) ? rosterNames : [])
    .map((n) => (typeof n === 'string' ? n.trim() : '')).filter(Boolean);
  for (const n of (Array.isArray(queueNames) ? queueNames : [])) {
    if (roster.includes(n)) add(n);   // 隊列裡的外城武將不跟著走（不隔空調人）
  }
  for (const n of roster) add(n);     // 主將、太守、其餘在冊武將按名冊順序
  return out;
}

/** 任命軍師的前提：這支兵團至少 2 名武將（只有主將一人＝沒得選，按鈕灰） */
function armyCanAppointAdvisor(a) {
  return armyOfficerList(a).length >= 2;
}

/** 現任軍師；不是隨軍成員就當作沒任命（舊檔/手改檔都走這條校驗） */
function armyAdvisorOf(a) {
  const advisorName = a && typeof a.advisor === 'string' ? a.advisor.trim() : '';
  return advisorName && armyOfficerList(a).includes(advisorName) ? advisorName : '';
}

/** 任命/更換/免除軍師；回傳 false＝這個名字不在本兵團的隨軍名單裡 */
function armySetAdvisor(a, name) {
  if (!a || typeof a !== 'object') return false;
  const s = typeof name === 'string' ? name.trim() : '';
  if (!s) { a.advisor = ''; return true; }
  if (!armyOfficerList(a).includes(s)) return false;
  a.advisor = s;
  return true;
}

/** 是否駐紮中 */
function armyIsStationed(a) {
  return !!a && a.stationed === true;
}

/** 同一路段：兩端城市相同（A→B 與 B→A 也算同一段），或行軍索引相同 */
function marchSameLeg(a, b) {
  if (!a || !b) return false;
  if (typeof a.from === 'string' && typeof a.to === 'string'
    && typeof b.from === 'string' && typeof b.to === 'string') {
    const fa = a.from, ta = a.to;
    if (fa === b.from && ta === b.to) return true;
    if (fa === b.to && ta === b.from) return true;
  }
  const pa = a.pathIndex, pb = b.pathIndex;
  if (pa === undefined || pa === null || pb === undefined || pb === null) return false;
  return Number(pa) === Number(pb);
}

/**
 * 推進方允許的最大 progress（被駐紮部隊擋住時就是接觸點；沒擋就 1）。
 * 只擋「同一路段 + 敵方 + 駐紮中且停在途中（0 < progress < 1）」的部隊：
 *   · 相向（from/to 互換）：停在 1 - 駐紮方 progress - 容差 → 兩者相加 ≈ 1，恰好是撞上的位置；
 *   · 同向（同 from/to）：駐紮方在前就停在它後面一點，不許超車。
 */
function stationProgressLimit(mover, blocker) {
  if (!mover || !blocker || mover === blocker || mover.id === blocker.id) return 1;
  if (mover.side === blocker.side) return 1;
  if (!armyIsStationed(blocker)) return 1;
  if (!marchSameLeg(mover, blocker)) return 1;
  const pb = clamp01(Number(blocker.progress));
  if (!(pb > 0 && pb < 1)) return 1;   // 還沒出發／已抵達的駐紮不擋路（抵達的不在道上）
  if (mover.from === blocker.to && mover.to === blocker.from) return clamp01(1 - pb - STATION_EPS);
  if (mover.from === blocker.from && mover.to === blocker.to) {
    const pm = clamp01(Number(mover.progress));
    return pm < pb ? clamp01(pb - STATION_EPS) : 1;
  }
  return 1;
}

/**
 * 一個月怎麼走：拿整份部隊表算每支的下一步（純函數，單位：progress）。
 * 駐紮不動；被敵方駐紮部隊擋著的最多走到接觸點（够不着就照常走，下一月再靠近）。
 * stepOf(a, p) 回傳這一步的行程，預設跟 advanceArmies 一樣用 marchStep(pathIndex)。
 */
function planArmyMoves(list, stepOf) {
  const arr = Array.isArray(list) ? list : [];
  const step = typeof stepOf === 'function' ? stepOf : (a) => marchStep(a.pathIndex);
  const out = [];
  for (const a of arr) {
    if (!a || typeof a !== 'object') continue;
    const p = Number.isFinite(Number(a.progress)) ? clamp01(Number(a.progress)) : 0;
    const stationed = armyIsStationed(a);
    if (stationed || p >= 1) {
      out.push({ army: a, progress: p, arrived: p >= 1, frozen: stationed, blockedBy: null });
      continue;
    }
    let limit = 1, blocker = null;
    for (const b of arr) {
      if (!b || b === a || b.id === a.id) continue;
      const l = stationProgressLimit(a, b);
      if (l < limit) { limit = l; blocker = b; }
    }
    const raw = Number(step(a, p));
    const want = clamp01(p + (Number.isFinite(raw) ? raw : 0));
    // 不越過接觸點：够得着的夾在 limit 上；已經貼著 limit 的原地不動（不後退、不超車）
    const next = want > limit ? Math.max(p, limit) : want;
    out.push({
      army: a, progress: next, arrived: next >= 1, frozen: false,
      blockedBy: blocker && next < want ? blocker.id : null,
    });
  }
  return out;
}

/** 對峙配對鍵（同一對部隊只提示一次、只打一場） */
function stationPairKey(blocker, mover) {
  return `${blocker && blocker.id}>${mover && mover.id}`;
}

/**
 * 這段路上有沒有「駐紮方 vs 推進方」的接觸：回傳 { blocker, mover } 或 null。
 * blocker 是駐紮的那支（= 守方），mover 是推進到接觸點的那支（= 攻方）。
 * 接觸點（相向）＝ 1 - 駐紮方 progress（兩者進度相加＝1）；推進方被夾在它前面 STATION_EPS 處，
 * 所以判「離接觸點不到一個容差」而不是「相加 ≥ 1」——後者會把已經交錯而過的兩軍也算成對峙。
 * 同向則判「追到駐紮方屁股後面一個容差內」，不許超車。
 */
function stationStandoff(list) {
  const arr = Array.isArray(list) ? list : [];
  for (const s of arr) {
    if (!armyIsStationed(s)) continue;
    const ps = clamp01(Number(s.progress));
    if (!(ps > 0 && ps < 1)) continue;
    const contact = 1 - ps;
    for (const m of arr) {
      if (!m || m === s || m.id === s.id || m.side === s.side) continue;
      if (armyIsStationed(m)) continue;   // 兩支都停著＝沒人來攻，不算對峙（也就沒有遭遇戰）
      if (!marchSameLeg(m, s)) continue;
      const pm = clamp01(Number(m.progress));
      if (!(pm > 0 && pm < 1)) continue;
      if (m.from === s.to && m.to === s.from) {
        if (Math.abs(pm - contact) <= STATION_EPS + STATION_SLACK) return { blocker: s, mover: m };
      } else if (m.from === s.from && m.to === s.to) {
        const gap = ps - pm;   // > 0：推進方在後面；≤ 0：已經超到前面（不算對峙）
        if (gap >= 0 && gap <= STATION_EPS + STATION_SLACK) return { blocker: s, mover: m };
      }
    }
  }
  return null;
}
// [[/MARCH_STATION_CORE]]

function nextArmyId() {
  save.armySeq = Saves.intOr(save.armySeq, 0, 0) + 1;
  return `m${save.month}-${save.armySeq}`;
}

function removeArmy(id) {
  save.armies = (save.armies || []).filter((a) => a.id !== id);
  // [F3] 兵團沒了（進城/退兵/遭遇/全滅）→ 隨軍武將立刻回到「可內政」名單
  if (typeof CM.syncAway === 'function') CM.syncAway(save);
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
 * 出征列表／敵情用的「守軍 N 兵」：關卡讀 `garrison.json`（`POPULATION=0`，兵力不在城資料上）。
 * 口徑與 `city_model.js` 的 `gateTroopsOf()` 同一個（web 出征清單／Cocos CityPanel 三處必須同數字）；
 * 缺 garrison 資料時它回落 110（12 座關實測都是 110），最後才回落 `troopCapOf(POPULATION)`。
 */
function gateTroopsOf(name) {
  return CM.gateTroopsOf(name, cityOf(name), {
    scenIdx: currentScenarioIdx(), scenario, garrison: GDATA.garrison,
  });
}
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
  // R86 S2-2：寫檔前把 items.html 的裝備再鏡像一次（玩家可能剛從 items.html 回來，
  // 也可能在別的分頁裝了東西）—— 存檔自己帶裝備，換將/換機才跟得走。
  syncEquipFromBag();
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

/**
 * 武將等級（R85 唯一口径）：`?level=` → 存檔 `generalLevel` → **分劇本起始等級**
 * （`data/levels_by_scenario.json`，由 `TIMES1..5.INI` 的 BaseEXP 反推；缺檔才退回 `core/levels.ts`）。
 *
 * 為什麼要那張表：`generals.json` 的 400 将 `BaseEXP` 全是 **Times1 的 200**，裸反推一律 Lv2
 * （`project\133` §3 确认 Lv2 = 10 兵是原作开局值），但五剧本的真值是 Lv2/2/4/6/8
 * （`project\136`）。不读表就丢掉整条剧本曲线。
 */
function generalLevelOf(name) {
  if (LEVEL_OVERRIDE) return LEVEL_OVERRIDE;
  const raw = save?.generalLevel ? Number(save.generalLevel[name]) : NaN;
  if (Number.isFinite(raw) && raw >= 1) return Math.min(99, Math.trunc(raw));
  return scenarioLevelOf(name);
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

// ---------------------------------------------------------------- R86 S2-2：裝備（items.html）↔ 存檔 ↔ 戰鬥
// 斷鏈原貌：items.html（凍結檔）把裝備寫進 localStorage 的 `sanguo_items_v1`
// （`{equip:{將名:{槽:Sequence}}, bag:[…]}`），而 `saves.js` 的 `equipOf()` 全倉**零調用** ——
// 裝備只活在那個獨立 key 裡：武力加成不進戰鬥、不進大地圖、換將（或換機）後裝備也不跟。
// 接法：頁面存檔 → 存檔 v3 的**可選** `equip` 欄（加上 weapon/horse/thing 舊鏡像）→ 數值。
// 為什麼是「頁面 → 存檔」這個方向：`sanguo_items_v1` 在這個專案裡本來就是**全局**收藏
// （`city_model.js:218` BAG_KEY、`:221` DEFAULT_BAG、搜尋掉寶都寫同一個 key），裝備天然
// 跟著武將名走、不分城；存檔只要把它落下來，槽快照自己就帶得走裝備。

// [[EQUIP_CORE]]
/**
 * 我方武將的戰鬥數值：基礎 + 裝備加成（純函數，`tests/webfix_r86.test.ts` 抽段直接跑）。
 * 只認 `str`/`int` 兩個小寫欄位（`defenderOf`/`commander`/`deploy` 那一路的口徑），
 * 不回寫 `general` —— `createWorld` 只認 str/int/level，改在入口處算好最省事。
 */
function combatStatsOf(general, bonus) {
  const g = general && typeof general === 'object' ? general : {};
  const b = bonus && typeof bonus === 'object' ? bonus : {};
  const plusStr = Math.trunc(Saves.num(b.STR));
  const plusInt = Math.trunc(Saves.num(b.INT));
  return {
    str: Math.max(0, Math.trunc(Saves.num(g.str)) + plusStr),
    int: Math.max(0, Math.trunc(Saves.num(g.int)) + plusInt),
    strBonus: plusStr,
    intBonus: plusInt,
  };
}
// [[/EQUIP_CORE]]

/** 讀 items.html 的存檔；沒 key / 壞 JSON / 沒 storage 都回 null（不拋） */
function readBagStore() {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const raw = storage.getItem(Items.EQUIP_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/** 某武將身上的四槽（**物品名**）：`Saves.equipOf()` 是原三槽的讀者，`save.equip` 補 book/amulet */
function equipNamesOf(name) {
  const out = { weapon: '', horse: '', book: '', amulet: '' };
  if (!name) return out;
  try {
    // R86：`equipOf()` 在修之前**全倉零調用** —— 老存檔的 weapon/horse/thing 三張表讀不出任何東西。
    // 這裡直接調它（三槽的權威讀者），book/amulet 再走 v3 的 `equip`（equipSlotsOf 內部也回落 equipOf）。
    const legacy = Saves.equipOf(save, name);
    const slots = Saves.equipSlotsOf(save, name);
    out.weapon = slots.weapon || legacy.weapon || '';
    out.horse = slots.horse || legacy.horse || '';
    out.book = slots.book || legacy.thing || '';
    out.amulet = slots.amulet || '';
  } catch {
    /* 存檔壞掉時當「沒裝備」，不要連帶打不開大地圖 */
  }
  return out;
}

/** 裝備加成（`items_model.js` 的十項屬性；兵符/無效序號一律 0） */
function equipBonusOf(name) {
  try {
    return Items.bonusOfNames(equipNamesOf(name));
  } catch {
    return Items.emptyBonus();
  }
}

/**
 * 武將的「大地圖/戰鬥」數值：`row` 可給小寫 `{name,str,int}`（守將/主將）或
 * `generals.json` 的大寫 `{STR,INT}` 行，缺省就按名字查 `generals.json`。
 */
function statsOf(row, name) {
  const who = name || (row && row.name) || '';
  const g = row || generalRow(who) || {};
  const pick = (lo, up) => (g[lo] !== undefined && g[lo] !== null && g[lo] !== '' ? g[lo] : g[up]);
  return {
    ...combatStatsOf({ str: pick('str', 'STR'), int: pick('int', 'INT') }, equipBonusOf(who)),
    name: who,
  };
}

/**
 * 把 items.html 的裝備鏡像進存檔（冪等）。回傳寫進去的武將數；`-1` = 存檔還沒準備好。
 *
 * **全量重建**（先清空四張表再按頁面存檔重填）是刻意的：items.html 卸下裝備後背包裡就
 * 沒有那條記錄了，只增不減會留下「已卸下卻仍加武力」的幽靈裝備 —— 那正是 S2-2 的同類病。
 * `bag === null`（瀏覽器從沒開過 items.html）時**不動**存檔：別把快照裡跟著走的裝備洗掉。
 */
function syncEquipFromBag() {
  if (!save) return -1;
  if (!ITEM_DEFS.length) return 0;           // 裝備表沒載到 → 退回舊行為（不加值，也不清空）
  const bag = readBagStore();
  if (!bag) return 0;
  const equips = Items.normalizeBagEquip(bag.equip);
  save.weapon = {};
  save.horse = {};
  save.thing = {};
  save.equip = {};
  let n = 0;
  for (const name of Object.keys(equips)) {
    const names = Items.equipNames(equips[name]);
    if (!Object.keys(names).length) continue;
    Saves.setEquipSlots(save, name, names);
    n += 1;
  }
  return n;
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
// R86 S2-4：`loadStore → normalizeStore` 內部已經把每個槽升級到 v3（saves.js 的 upgradeSnapshot），
// 但升級結果只活在記憶體裡 —— 磁碟上那格還是 v2。舊碼在下面用 `snapshotUpgrade` 判斷「要不要
// 提示」，可它是由 normalizeCampaign 再升一次算出來的，那時 `up.from === 3`，於是提示段永遠
// 不執行、v2 老檔也永遠不寫回（提示死代碼）。這裡改成用 loadStore 自己記下來的升級清單：
// 只要真的跨了版本，就**立刻寫回**並提示一次（v{n}→v{m}），寫回後 loadStore 下次就沒有升級了。
const bootUpgrades = Array.isArray(store.upgraded) ? store.upgraded.slice() : [];

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
// R20：搜索隨機不可復現（原作 0x450117 rand()%n，狀態是自維護的移位寄存器，重開就不同）。
// 本作把隨機性放在「每份存檔一個真隨機 nonce」上：種子 = hash(nonce, 城, 月, 次數)。
// 同存檔內仍可復現（回放/測試要），跨存檔/跨玩家不可預測 —— city_model.js:searchSeed / searchNonce。
if (typeof CM.setSearchNonce === 'function' && !(Saves.num(save.searchNonce) > 0)) {
  CM.setSearchNonce(save, CM.randomNonce());
}
// 舊近似把士氣記在城池上：遷移時只改名成 cityMorale，不搬成武將士氣（同名會打架）。
if (cityMoraleMoved > 0) {
  notice(`存檔遷移：${cityMoraleMoved} 座城的城池級 morale 已改名 cityMorale；士氣自本版起為武將級`, 12000);
}
const bootScen = SCEN.findIndex((s) => s.id === Number(save.scenario));
applyScenario(bootScen >= 0 ? bootScen : 0);
save.scenario = scenario.id;
ensureCityState();
// [F5] 紀元錨點：頂欄「西元 N 年 M 月」與內政面板「時間 N 年」都走 era.js，
// 錨點 = 這份存檔的劇本起始年（189/200/208/219…），顯示即 `startYear + yearOf - 1`。
Era.setAnchor(Saves.startYearOf(save));
// [F16] 舊的單錢包 `save.gold` 併進我方第一座城的 money（只在該城沒有 money 時回填一次），
// 之後錢只認每城 `st.money`；`migrateGold()` 會把 save.gold 歸 0 並記 goldMigrated。
if (typeof CM.migrateGold === 'function') CM.migrateGold(save, scenario.cities);
save.ts = Saves.num(save.ts);
// R4：老檔沒有 king → 按 owned 第一座城的 KING 補；補不出來留空（頂欄顯示「未選」＋換君主）
ensureKing();
// R86 S2-2：把 items.html 的裝備鏡像進存檔（存檔自己帶裝備；沒開過 items.html 就不動）
syncEquipFromBag();

// R56：這一局是「剛打完仗寫回」（main.js 只認舊鍵 sanguo_campaign_v1）→ 把戰後處置真正落到
// 武將池 / save.roster 上（斬首出池、招降入城）。必須在下面的 autosave 之前跑，存檔才帶得走。
// R85 起這一段只負責"開面板"（逐將詢問），玩家決策後才落庫（finishSurrender）。
// 驗收用的 ?sur= / ?surdead= 探針不能放在這裡：它要叫 startNewGame() → render() → 會撞到本檔
// 後半段 const 的 TDZ（USE_BG before initialization），所以挪到檔案最末尾（模組初始化完才跑）。
// R86（P0 死檔）：這一行原本就寫在這裡 —— 模組初始化階段叫 settleBattleReturn()，它會走到
// openSurrenderSheet()，而 `let surState`（:3300 之後）此刻還在 TDZ ⇒
//   ReferenceError: Cannot access 'surState' before initialization
// 拋在模組求值期 = 本檔後面全部不執行（頁頭 金 0 · 城 0、地圖空白、按鈕沒綁定），
// 而且崩在 autosave 之前 ⇒ 槽快照永遠是舊的（boot.battle 永遠 true）⇒ 每次刷新都再崩一次，
// 等於「打完仗的存檔打不開」。現在改成**檔案最末尾**才結算（見檔尾 SUR_PROBE 之後），
// 那時全檔的 let/const 都已初始化。原則：任何「top-level 就呼叫、又引用後文 let」的初始化
// 一律挪到末尾（或 queueMicrotask），不要留在 :1200 之前。

const selParam = qs.get('sel');
if (selParam && ALL.some((c) => c.NAME === selParam)) selected = selParam;

if (gameStarted) {
  if (boot.migrated) {
    Saves.writeLegacy(save, storage);
    // 遷移只搬了舊鍵的值（可能只有 1 座城）。立刻補寫一次完整快照：60 城摘要、14 家勢力、
    // 400 將等級都會在這次寫入補齊，槽位列表才不會顯示「城 1 / 勢力 0」。
    autosave(false);
    notice('偵測到舊版存檔（sanguo_campaign_v1），已自動遷移到槽 1', 12000);
  } else if (bootUpgrades.length) {
    // R86 S2-4：loadStore 已經把槽升到 v3（記憶體），**先把升級結果寫回磁碟**再提示：
    // `Saves.saveStore(store)` 寫的是 normalizeStore 出來的完整 store（含新快照與摘要），
    // 所以磁碟上那格從此就是 v3，下一次開頁 loadStore 不會再回報升級 → 提示只出現一次。
    // `autosave(false)` 再補一次「當前這一局」的完整快照（60 城摘要 / 400 將等級 / 勢力表）。
    Saves.saveStore(store, storage);
    autosave(false);
    const up0 = bootUpgrades[0];
    const more = bootUpgrades.length > 1 ? `（另有 ${bootUpgrades.length - 1} 槽一併升級）` : '';
    notice(`舊存檔格式已自動升級：v${up0.from} → v${up0.to}（槽 ${up0.slot}）${more}`, 12000);
  } else if (snapshotUpgrade) {
    // 手動「讀取存檔位」時才走這裡（normalizeCampaign 在 loadSlot 裡會重新升級一份老快照）
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
  // 自动存档：必须走 writeSlotAuto，否则手动存档槽会被当成自动存档目标
  // （saves.js 的 writeSlot 默认不动 store.last，见 project/99 §5）。
  const entry = Saves.writeSlotAuto(store, n - 1, snap, { scenarioName: scenario.name, ts: save.ts });
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
  // 手動存檔**不改自動存檔目標**：否則「存到槽 N → 打一仗 → 讀回槽 N」會被
  // 緊接著的 autosave 覆蓋（project/89 步驟 4b 的卡點）。自動存檔仍寫 slotNo()。
  refreshBadge();
  renderSlotRows();
  const msg = `已存入槽 ${i + 1} · ${scenario.name} · ${Saves.monthLabel(save.month)}`
    + `（自動存檔仍寫槽 ${slotNo()}）`;
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
  // [F5] 切槽＝換劇本 ⇒ 重設紀元錨點（否則 189 的檔會沿用上一個檔的 184）
  Era.setAnchor(Saves.startYearOf(save));
  // [F16] 老槽的單錢包 → 併進我方首城（只回填一次），切槽後錢也只認每城 money
  if (typeof CM.migrateGold === 'function') CM.migrateGold(save, scenario.cities);
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
  // R85：招降面板沒決策完之前，別的抽屜不能來搶（否則點一下「存檔」就把它頂掉了，俘虜永遠待決）
  if (id !== 'surrenderSheet' && !$('surrenderSheet').hidden) return;
  hideSheets();
  $('scrim').hidden = false;
  $(id).hidden = false;
}
function closeOverlays() {
  if (!$('surrenderSheet').hidden) return;   // R85：同上，任何 close 路徑都不能把待決面板關掉
  hideSheets();
  confirmAction = null;
  confirmCancel = null;
}

/**
 * 顶部通知条：默认 6 秒自动消失，点一下立刻关。
 * 以前默认 9 秒、重要消息 12/14 秒，而且点了不关，压着底栏（project/93 §问题4）。
 * 统一口径：普通 6000、重要 12000，两条路径都能点击关闭。
 */
function notice(msg, ms = 6000) {
  const el = $('notice');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.title = '點一下關閉';
  clearTimeout(notice._t);
  notice._t = setTimeout(() => { el.hidden = true; }, ms);
  if (!notice._bound) {
    notice._bound = true;
    el.addEventListener('click', () => {
      clearTimeout(notice._t);
      el.hidden = true;
    });
  }
}

const SAVE_TIP = '存＝寫入該槽（覆蓋） · 讀＝回到該槽 · 雙擊槽位可改名。<br>' +
  '存檔格式 v3（自動升級舊檔） · 新遊戲只覆蓋目前使用中的槽，其他槽不動。';

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

// 原作存檔行（A_save_t0035.png）是「記錄NN｜君主｜城數NN｜武將NNN｜時間NNN年」，**沒有刪除**。
// 所以這裡：標題走 Saves.slotTitle()（記錄01…記錄10）、內容走 Saves.slotLineParts()（4 段），
// 「刪」鈕依 Saves.SLOT_DELETE_UI 收掉 —— 字串與開關都在 saves.js，頁面不自己抄一份。
const SLOT_DEL_BTN = Saves.SLOT_DELETE_UI === false
  ? ''
  : (i) => `<button type="button" data-slot="${i}" data-do="del">刪</button>`;

function renderSlotRows() {
  const rows = [];
  for (let i = 0; i < Saves.SLOT_COUNT; i++) {
    const e = store.slots[i];
    const active = gameStarted && slotNo() === i + 1;
    if (!e) {
      rows.push(`<div class="slot empty${active ? ' on' : ''}">
        <div class="sl">
          <div class="l1"><b>${Saves.slotTitle(i)}</b> · 空</div>
          <div class="l2">可存入目前進度</div>
        </div>
        <div class="sbtns">
          <button type="button" data-slot="${i}" data-do="save">存</button>
          <button type="button" disabled>讀</button>
        </div>
      </div>`);
      continue;
    }
    const p = Saves.slotParts(e, i);   // 老 9 段只留「劇本名」(p[1])，其餘改用原作的 4 段
    const parts = Saves.slotLineParts(e, i);
    const tag = active ? '<span class="tag">使用中</span>' : '';
    const slotName = typeof e.slotName === 'string' && e.slotName ? ` · <span class="nm">${e.slotName}</span>` : '';
    const monarch = String(e.monarch || '').trim();
    const dot = Saves.forceColorOf(monarch);   // 君主=势力 id 时的旗色，和地图同一张色板
    const dead = Saves.intOr(e.extinctCount, 0);
    rows.push(`<div class="slot${active ? ' on' : ''}" data-slot="${i}" title="雙擊可改名">
      <div class="sl">
        <div class="l1"><i class="fdot" style="background:${dot}"></i><b>${Saves.slotTitle(i)}</b>${slotName} · ${p[1]}${tag}</div>
        <div class="l2">${parts.join(' ｜ ')}${dead ? `（亡 ${dead}）` : ''}</div>
      </div>
      <div class="sbtns">
        <button type="button" data-slot="${i}" data-do="save">存</button>
        <button type="button" data-slot="${i}" data-do="load">讀</button>
        ${SLOT_DEL_BTN ? SLOT_DEL_BTN(i) : ''}
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
  $('btnGenerals').hidden = !gameStarted;   // R13：武將資料
  $('btnEndMonth').hidden = !gameStarted;   // R13：內政終了
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
  // R86 S2-2：君主卡是「大地圖武將數值」的門面，裝備加成要在這裡看得到（不然玩家只能靠猜）
  const eqb = equipBonusOf(name);
  const eqTxt = eqb.STR || eqb.INT ? ` · 裝備 武+${eqb.STR} 智+${eqb.INT}` : '';
  return `<div class="scard on">
      <div class="scn">${name}${force.flag ? ` · 旗${force.flag}` : ''}</div>
      <div class="scm">勢力 ${id || '—'} · 君主自 ${MM.monthTag(since)} 起</div>
      <div class="scm">武 ${(Saves.num(st.str) + eqb.STR) || '—'} · 智 ${(Saves.num(st.int) + eqb.INT) || '—'} · 等級 ${lv}${eqTxt}</div>
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

// ---------------------------------------------------------------- R13：內政三命令
// 原作內政畫面的三條獨立命令（04c §2.3）：
//   0x48B228「武將資料」→ 0x423901 全勢力武將名冊
//   0x48B434「勢力地圖」→ 0x4280A9（本作＝頁頭「勢力地圖」抽屜，原本就有）
//   0x48B420「內政終了」→ 0x427FE0 → 0x428021 → 0x41BBF5：
//     清逐將「本月已下令」標誌（+0x2C）、把月內倒計時重置到 3600、（按鈕）回大地圖。
// 本作把「月內倒計時」收成月令鎖（R5 已裁定不還原計時器），故內政終了＝**收束本月**：
// 標記本月已下令（＝清掉逐將行動權），不再另做「跳過整月」——原作終了並不推進月份。
function generalRowsAll() {
  const rows = [];
  for (const c of ALL) {
    const list = garrisonIn(c.NAME)?.officers;
    if (!Array.isArray(list)) continue;
    for (const o of list) {
      if (!o || !o.name) continue;
      const r = generalRow(o.name) || {};
      // R86 S2-2：裝備加成進「武將資料」名冊（大地圖上的第二個消費者；只在有裝備時才加）
      const eqb = equipBonusOf(o.name);
      rows.push({
        name: o.name,
        city: c.NAME,
        force: forceAt(c.NAME) || '在野',
        str: (o.str || r.STR || 0) + eqb.STR,
        int: (o.int || r.INT || 0) + eqb.INT,
        eqStr: eqb.STR,
        eqInt: eqb.INT,
        loyal: o.loyal,
        spirit: o.spirit,
        tire: o.tire,
      });
    }
  }
  const mine = forceAt(selected) || (save?.forces ? MM.forceIdOf(save) : '');
  rows.sort((a, b) => (a.force === b.force ? a.city.localeCompare(b.city) : a.force === mine ? -1 : b.force === mine ? 1 : a.force.localeCompare(b.force)));
  return rows;
}

// 兵團指令的「武將資料」要只看一支兵團的主將，但 rows85.test.ts 釘死了
// `function openGeneralSheet()` / `function renderGeneralSheet()` 的零參簽名，
// 所以用一個模組級過濾器 genOnly，而不是改簽名。null = 全勢力名冊（頁頭那個入口）。
let genOnly = null;

function renderGeneralSheet() {
  const all = generalRowsAll();
  if (genOnly) {
    const r = all.find((x) => x.name === genOnly) || { name: genOnly, city: '—', force: '—' };
    const lv = generalLevelOf(genOnly);
    const face = window.SG && typeof window.SG.portraitUrl === 'function'
      ? window.SG.portraitUrl(genOnly, 'full') : '';
    $('genTtl').textContent = `武 將 資 料 · ${genOnly}`;
    $('genSub').textContent = `${r.city} · ${r.force} · Lv${lv}（兵團主將）`;
    $('genRows').innerHTML = `<div class="sgen">
        ${face ? `<div class="face"><img src="${face}" alt=""></div>` : ''}
        <div class="info">
          <div class="nm">${genOnly}<span class="tier roll">Lv${lv}</span></div>
          <div class="st">${r.city} · ${r.force}</div>
          <div class="rs">武 ${r.str || '—'} · 智 ${r.int || '—'} · 忠誠 ${r.loyal ?? '—'} · 士氣 ${r.spirit ?? '—'} · 疲勞 ${r.tire ?? '—'}${r.eqStr || r.eqInt ? ` · 裝備 武+${r.eqStr} 智+${r.eqInt}` : ''}</div>
        </div>
      </div>`;
    $('genFoot').textContent = `帶兵上限 ${dispatchCapOf(r.city)} 兵 · 等級來源：存檔 generalLevel → 劇本起始`;
    return;
  }
  const rows = all;
  const byForce = new Map();
  for (const r of rows) byForce.set(r.force, (byForce.get(r.force) || 0) + 1);
  $('genTtl').textContent = `武 將 資 料 · ${rows.length} 人`;
  $('genSub').textContent = `全勢力 ${byForce.size} 家 · 按勢力分組 · 忠誠/士氣/疲勞取自存檔`;
  $('genRows').innerHTML = rows.length
    ? rows.map((r) => `<div class="scard">
        <div class="scn">${r.name}<span style="color:#9A8A6A"> · ${r.city} · ${r.force}</span></div>
        <div class="scm">武 ${r.str || '—'} · 智 ${r.int || '—'} · 忠誠 ${r.loyal ?? '—'} · 士氣 ${r.spirit ?? '—'} · 疲勞 ${r.tire ?? '—'}${r.eqStr || r.eqInt ? ` · 裝備 武+${r.eqStr} 智+${r.eqInt}` : ''}</div>
      </div>`).join('')
    : '<div class="scard"><div class="scm">目前沒有任何在職武將</div></div>';
  $('genFoot').textContent = `勢力分佈：${[...byForce.entries()].map(([f, n]) => `${f} ${n}`).join(' · ') || '—'}`;
}

function openGeneralSheet() {
  if (!gameStarted) return notice('尚未開局：先選劇本開始新遊戲。');
  renderGeneralSheet();
  openSheet('generalSheet');
}

/** 單將視圖（兵團指令的「武將資料」）：同樣走 openGeneralSheet() 的守衛與開窗 */
function openGeneralSheetOf(name) {
  genOnly = name || null;
  openGeneralSheet();
}

/**
 * 內政終了（0x427FE0）：收束本年內政 → **結束窗口並跑完一整年**，明年 1 月再開窗口。
 * [F1/F2] 「內政終了」只在 1 月有效：一年只有一個內政窗口。逐將行動權記在
 * `save.acted`（每將每年一次），不隨窗口結束清零 —— 明年年序一變自然解鎖。
 *
 * [F4] 原作語義：內政點「結束內政」＝**進大地圖跑時間**（指南 L114-116「內政點"结束内政"
 * 就进来了」、L39-41 流程圖「每年 1 月→【內政模式】→【大地圖模式】跑一整年」），
 * 不是「鎖月令等玩家一個月一個月按」。差異清單行 57 指出本作缺的就是這一步：
 * 「『結束內政 → 跑一年』缺位：「內政終了」只鎖月令；推進時間的動作是「推進一月」」。
 * 所以這裡標完月令就 `advanceMonth(12)` —— 一次跑完 12 個月（正月 → 次年 1 月），
 * 行軍/AI/年結算全走 `advanceMonth` 既有流水線（batch 模式＝戰鬥就地結算、不跳守城頁）。
 * 只按一個月仍走「推進一月」與 `?adv=1`（單月調試路徑保留）。
 */
function endMonth() {
  if (!gameStarted) return notice('尚未開局：先選劇本開始新遊戲。');
  // [F1] 非正月沒有內政窗口可收束（原作 1 月內政月；其餘 11 個月只流動時間）
  if (Saves.monthOfYear(save.month) !== 1) {
    notice('非正月：內政窗口只在每年 1 月開（原作 1 月內政月）。');
    return;
  }
  if (CM.monthLocked(save, UNLIMITED)) {
    notice(`${CM.LOCK_HINT}：本月已收束，推進一月才會開新令。`);
    return;
  }
  CM.markMonthActed(save, UNLIMITED);
  pushLog(`內 政 終 了：本年內政窗口收束（原作 0x427FE0 → 0x41BBF5）`, 'info');
  pushLog(`大 地 圖：結束內政 → 跑完一年（${save.month} 月 → 次年 1 月，原作「結束內政就進大地圖跑時間」）`, 'info');
  // [F4] 一次跑完一年；advanceMonth 末尾自己 autosave() + render()
  advanceMonth(12);
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
        <div class="sct">地圖前三城：${first}</div>
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
  // [F5] 新局：`newCampaign()` 已按劇本寫入 startYear（189/200/208/219），這裡把 era 錨點對上，
  // 頂欄第一眼就是「西元 189年 1月」而不是寫死的 184。
  Era.setAnchor(Saves.startYearOf(save));
  // [F16] 新局 default 的 1200 金（`save.gold`）併進首城 money，之後只有每城 money 一個錢包。
  if (typeof CM.migrateGold === 'function') CM.migrateGold(save, scenario.cities);
  selected = null;
  gameStarted = true;
  activeSlot = slotNo();
  const snap = snapshotForSave();   // R70：新檔也直接落 60 城摘要 + 勢力表
  // 新开局也写自动存档槽：同样走 writeSlotAuto（它会更新 store.last）。
  Saves.writeSlotAuto(store, activeSlot - 1, snap, { scenarioName: scenario.name, ts: save.ts });
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
  // 400 將的等級/經驗：等級走 core/levels.ts 的起始等級（與 generalLevelOf / deploy.html 同口徑），
  // 經驗只當顯示值（BaseEXP 全是 200，用它反推等級會把所有人壓到 Lv2）。
  const levels = {};
  for (const g of generals) {
    if (!g || !g.NAME || g.NAME === '盜賊') continue;
    const exp = Math.trunc(Number(g.BaseEXP) || 0);
    // R85：`?demo=1` 播種也要按當前劇本的起始等級（否則 3/4/5 劇本會被壓成 Lv2）
    levels[g.NAME] = { level: scenarioLevelOf(g.NAME), exp };
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
  // [F3] 每次重繪把「在路上」名單從 save.armies 重算一遍（舊檔/中途載入也能對上）
  if (save && typeof CM.syncAway === 'function') CM.syncAway(save);
  // R86 S2-2：每次重繪前先吃一次 items.html 的裝備（readBagStore 只讀一個小 JSON，
  // 沒變也不會出錯）—— 這樣「去 items.html 換裝備 → 返回大地圖」立刻反映在武將數值上。
  syncEquipFromBag();
  $('scName').textContent = scenario.name;
  // 頂欄紀元：原作是「西元 209年 3月」（A_map_t0130.png 左上匾）。內部資料仍是 year/month
  // （save.month 是絕對月序），只把**顯示**換成 era.js 的一句話，換錨點也只改 era.js。
  $('ym').textContent = Era.eraTextOfMonth(save.month);
  // [F16] 頂欄「金」＝**國庫 = Σ 我方每城 money**（原作金錢是城 +0x92，沒有勢力錢包）。
  // 以前讀 `save.gold`（單錢包），跟列表行的 `$3,941`（本城金）是同屏兩個數卻看不出區別。
  $('gold').textContent = CM.nationalGold(save, scenario?.cities || ALL).toLocaleString();
  $('ct').textContent = save.owned.length;
  $('rec').textContent = Saves.recordText(save) + (save.defWins ? ` · 守 ${save.defWins}` : '');
  renderKingBar();
  // R8 一月一令：本月已经下过令 → 開發/出征 全部置灰（推進一月不受限）
  const locked = CM.monthLocked(save, UNLIMITED);
  const dis = locked ? ' disabled' : '';
  const sub = (normal) => locked ? CM.LOCK_HINT : normal;
  // [F1] 內政窗口：一年只有 1 月能進（原作 1 月內政月，其余 11 个月只流動時間）
  const inAffairs = Saves.monthOfYear(save.month) === 1;

  $('list').innerHTML = cities.map((c) => {
    const st = save.cities[c.NAME];
    const cls = ['city', mine(c.NAME) ? 'mine' : '', selected === c.NAME ? 'target' : ''].join(' ').trim();
    const force = forceAt(c.NAME);
    const color = Saves.forceColorOf(force);
    return `<div class="${cls}" data-name="${c.NAME}">
      <div class="n"><i class="fdot" style="background:${color}"></i>${c.NAME}<span>${mine(c.NAME) ? '我方' : (force || '無主')}</span></div>
      <div class="s"><b>${st.troops}</b> 兵 · 防 ${CM.ensureCityState(save, c).def}</div>
      <div></div><div class="s">${st.pop.toLocaleString()} 人 · <span class="dim">本城金</span> $${st.money.toLocaleString()}</div>
    </div>`;
  }).join('');

  const acts = [];
  const isMine = selected && mine(selected);
  if (selected && isMine) {
    // [F15] 大地圖不再有第三套徵兵口徑（舊碼 `save.gold -= 500; st.troops += 40`）：
    // 改成進城跳「部隊徵兵」抽屜，走**同一條**經濟鏈「金 →(換月) 預備兵 →(徵兵) 兵」。
    // 原作沒有「金直接買兵」，金買兵會讓錢變兵（F13）與正月歲入全部失去意義。
    acts.push(`<div class="btn" data-act="recruit"${dis}><span>徵 兵</span><small>${sub('城內徵兵 · 預備兵 → 兵')}</small></div>`);
    acts.push(`<div class="btn" data-act="develop"${dis}><span>開 發</span><small>${sub('不耗金 → 民 +3000')}</small></div>`);
    // [F1] 正月才是內政月；其餘月份這顆鍵降級成只讀「查看」（能看不能下命令）。
    acts.push(inAffairs
      ? `<div class="btn primary" data-act="city"><span>內 政</span><small>正月 · 內政七命令</small></div>`
      : `<div class="btn" data-act="city"><span>查 看</span><small>非正月 · 只讀</small></div>`);
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
  // R15：原作只有每年一次城池稅收（0x423824：每城 人口×75/10000 + 2250），沒有月度收入。
  const nextMonth = Saves.num(save.month) + 1;
  const yearIncome = save.owned.reduce((s, n) => {
    const def = ALL.find((c) => c.NAME === n);
    if (def && CM.isGate(def)) return s;
    return s + CM.annualTax(save.cities[n]?.pop || 0);
  }, 0);
  acts.push(`<div class="btn full" data-act="advance"><span>推進一月</span><small>${
    Saves.isYearStart(nextMonth) ? `正月歲入 +${yearIncome}` : '無月稅 · 正月收一年'}</small></div>`);
  $('actions').innerHTML = acts.join('');

  $('hint').textContent = selected
    ? (isMine
      ? `內政：${selected} 兵 ${troopsOf(selected)} · 民 ${save.cities[selected].pop.toLocaleString()} · 本城金 ${save.cities[selected].money.toLocaleString()}（國庫 ${CM.nationalGold(save, scenario?.cities || ALL).toLocaleString()}）`
      : (() => {
        // 敵城：太守/守將/守軍都走 garrison.json，不再拿防御值當武力代理
        const names = guardsOf(selected, 3);
        const chief = garrisonIn(selected)?.officers?.[0]?.name || '無人';
        return `出征 ${selected}：勢力 ${forceAt(selected) || '無主'} · 太守 ${majorOf(selected) || '—'} · 主將 ${chief}`
          + `（守軍 ${troopsOf(selected)} 兵 · 守將 ${names.length ? names.join('、') : '無人'}）`;
      })())
    : '點城選中；自己的城可內政，別人的城可出征。';

  // [F18] 點自己的城 → 六項資訊卡（原作面板：人口/防禦/金錢/預備兵/武將/太守·軍師）。
  // 讀運行態 st 的數值（防禦讀 ensureCityState().def，和列表同一口徑，不再顯示劇本死值）。
  const card = $('cityCard');
  if (card) {
    const def = isMine ? ALL.find((c) => c.NAME === selected) : null;
    const st = def ? save.cities[selected] : null;
    if (def && st) {
      const ps = CM.prepStateOf(save, def);
      const gens = CM.rosterOf(save, selected, { scenIdx: currentScenarioIdx(), generals: GDATA.generals }) || [];
      const cell = (k, v) => `<div class="cc"><b>${k}</b><span>${v}</span></div>`;
      // [F19] 武將數上限：原作指南 L92「武將數（如 13/10）」⇒ 上限 10（待證）。
      // 劇本資料本身就有超編城（濮陽 15／洛陽 15／江夏 17），**載入不裁切**，只把 N/CAP 標紅。
      const cap = CM.officerCapState ? CM.officerCapState(gens.length) : { n: gens.length, cap: 10, over: gens.length > 10 };
      const genCell = cap.over
        ? `<div class="cc"><b>武將</b><span style="color:#E2554B">${cap.n} / ${cap.cap}<span class="dim"> · 超編</span></span></div>`
        : cell('武將', `${cap.n} / ${cap.cap}`);
      card.innerHTML =
        cell('人口', `${Math.max(0, Math.trunc(Saves.num(st.pop))).toLocaleString()} / 1,000,000`)
        + cell('防禦', `${Math.max(0, Math.trunc(Saves.num(CM.ensureCityState(save, def).def)))} / 999`)
        + cell('金錢', `<span class="dim">本城金</span> $${Math.max(0, Math.trunc(Saves.num(st.money))).toLocaleString()}`)
        + cell('預備兵', `${ps.prep} / ${ps.cap}`)
        + genCell
        + cell('太守·軍師', `${CM.majorOf(save, def) || '—'} · ${CM.wiseOf(save, def) || '—'}`);
      card.hidden = false;
    } else {
      card.hidden = true;
      card.innerHTML = '';
    }
  }

  if ($('mapwrap').style.display !== 'none') drawMap();
  renderLog();
}

// 戰報面板：最近 8 條，新的在上
function renderLog() {
  const box = $('logrows');
  if (!box) return;
  // R7 年度結算：戰報區只留最近 8 條，正月的年度行很容易被同月的守軍回補/俸祿/學習/敵軍來攻
  // 擠出去（`pushLog` 是定長窗口），所以額外**釘**一行在頂端；條數仍湊滿 8 行（釘行在時只列 7 條）。
  // 已經出現在可見 8 條裡就不重複釘，免得同一個月看到兩遍。
  // 只在「結算所開的那一年」內釘（跨年後由新的年度記錄接手；老檔的年頭記錄不會一直掛著）。
  const ann = save.annual && save.annual.text && save.annual.intoYear === Saves.yearOf(save.month)
    ? String(save.annual.text) : '';
  const rows = (save.log || []).slice(-8).reverse();
  const pinned = ann && !rows.some((r) => r.s === ann)
    ? `<div class="logrow year" title="年度結算"><span class="m">年</span><span>${ann}</span></div>`
    : '';
  const show = pinned ? rows.slice(0, 7) : rows;
  const body = show.map((r) => `<div class="logrow ${r.k || ''}"><span class="m">${r.t}</span><span>${r.s}</span></div>`).join('')
    || '<div class="logrow"><span class="m">—</span><span>尚無戰事。推進一月，等敵軍上門。</span></div>';
  box.innerHTML = pinned + body;
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
      // 關卡是可打、可占的節點（公孫瓚開局只有 北平<->易京 78 這條通路，不列關卡就等於沒目標）
      const gate = !!c && CM.isGate(c);
      return pi === null ? null : {
        name: n, pi, len: Number(scenario.paths[pi].Length) || 0,
        months: marchMonths(pi),
        // 關卡守軍在 garrison.json（POPULATION=0），其餘城取存檔兵力
        troops: gate ? gateTroopsOf(n) : troopsOf(n),
        gate,
        // 全部走 garrison.json：勢力/太守/守將名單（空的城顯示空城 + 無人）
        king: gate ? '' : forceAt(n), major: majorOf(n), guards: guardsOf(n, 3),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.len - b.len) || a.name.localeCompare(b.name));

  const cap = dispatchCapOf(selected);   // R75：出兵數 = 主將帶兵上限
  const leader = localGeneral(selected) || defenderOf(selected);
  $('marchSub').textContent = `${selected} 周邊 ${targets.length} 個目標 · 出征 ${cap} 兵${leader ? ` · 主將 ${leader.name}` : ''}`;
  $('marchTargets').innerHTML = targets.length
    ? targets.map((t) => `<div class="scard" data-march="${t.name}">
      <div class="scn">${t.name}${t.gate ? ' <span class="gcbadge">關</span>' : ''}</div>
      <div class="scm">${t.major ? `${t.king ? '勢力 ' + t.king : (t.gate ? '無主關卡' : '空城')} · 太守 ${t.major}` : (t.king ? '勢力 ' + t.king : (t.gate ? '無主關卡' : '空城'))}</div>
      <div class="scm">守將 ${t.guards.length ? t.guards.join('、') : '無人'}</div>
      <div class="scm">守軍 ${t.troops} 兵 · 道路 ${t.len} · ${t.months} 個月</div>
      <div class="sct">抵達城下再決戰</div>
    </div>`).join('')
    : '<div class="scard"><div class="scn">沒有可出征的相鄰城</div><div class="scm">先打下接壤的敵城，或切回列表看道路</div></div>';
  $('marchFoot').textContent = `出征兵力 ${cap}${leader ? `（${leader.name} Lv${generalLevelOf(leader.name)}，上限 等級×5）` : ''} · 本城守軍 ${troopsOf(selected)}`;
  openSheet('marchSheet');
}

/**
 * 這座城出征時帶走的隨軍名單（project/185 §C2）：先看編成頁/出陣順序（save.deployQueue）
 * 的 5 槽，補不上再取本城名冊；最多 5 人。只讀不寫 —— 不把人從城裡移走。
 */
function armyRosterFor(city, general) {
  const roster = (garrisonIn(city)?.officers || []).map((o) => o && o.name);
  let queueNames = [];
  try {
    queueNames = (DQ.queueOf(save, []) || []).map((s) => s && s.general);
  } catch (e) { queueNames = []; }
  return armyRosterPick(queueNames, roster, general);
}

function dispatchArmy(to) {
  if (!MARCH_ON || !save || !selected) return;
  const from = selected;
  const pi = marchPath(from, to);
  if (pi === null) return toast('沒有可走的路：只能打相鄰城。');
  const cap = dispatchCapOf(from);   // R75：不再固定 100，按主將帶兵上限
  if (troopsOf(from) < cap) return toast(`守軍不足 ${cap} 兵（主將帶兵上限），先徵兵再出征。`);
  save.cities[from].troops -= cap;
  const leader = (localGeneral(from) || defenderOf(from))?.name;
  save.armies.push({
    id: nextArmyId(), side: 'A', from, to, pathIndex: pi, progress: 0,
    troops: cap, general: leader,
    // R95（project/185 A）：出征時把隨軍武將一起帶走，主將在最前（最多 5 人）。
    // 「任命軍師」就從這份名單裡挑（軍師必須是本兵團成員）；只有主將一人時該鈕是灰的。
    // 舊檔沒有這一欄由 normalizeArmyExtras 補成「只有主將」，不會讀崩。
    officers: armyRosterFor(from, leader),
    advisor: '',
    stationed: false,
  });
  pushLog(`我 軍 出 征：${from} → ${to}（${cap} 兵，${marchMonths(pi)} 個月）`, 'info');
  // [F3] 隨軍武將（含主將）本年不能做內政：由 save.armies 重算 save.away
  if (typeof CM.syncAway === 'function') CM.syncAway(save);
  CM.markMonthActed(save, UNLIMITED);   // R8：派兵出征也算本月已下令
  persist();   // 進戰鬥前先鏡像到舊鍵，回來時 main.js 的寫回會被偵測到
  closeOverlays();
  render();
  notice(`已從 ${from} 出征 ${to}：${cap} 兵在途，${marchMonths(pi)} 個月到城下`);
}

// ---------------------------------------------------------------- 兵團指令（大地圖部隊層）
// project/178 §2.2：原作大地圖是「啞地圖」——點部隊才彈「兵團指令」5 項 + 右欄 7 行軍情
// （證據幀 work/video_ui/A_map_troopmenu_t0120.png）。資料只有 save.armies（見 dispatchArmy /
// spawnAiArmy）。R95（project/185）起 7 行軍情不再是死值：
//   軍師 = a.advisor（必須是 a.officers 成員；沒任命才寫「主將兼」）；
//   武將數 = a.officers.length（出征時從出發城名冊帶出的隨軍武將）。
// 舊檔沒有這兩個欄位 → normalizeArmyExtras 補成「只有主將一人、軍師＝主將兼」，與畫面文字一致。
let armySel = null;        // 選中的部隊 id（地圖上畫金環）
let pickArmyId = null;     // 「請選擇兵團目的城市」選點態：正在給哪支兵團改道
let advisorArmyId = null;  // 軍師浮層正在給哪支兵團選人（浮層關掉後 armySel 仍有效，這裡只做記錄）

function armyOf(id) {
  return (save?.armies || []).find((a) => a && a.id === id) || null;
}

function armyFlagColor(a) { return a.side === 'A' ? '#7FD1A8' : '#F2AE97'; }
function armyFlagInk(a) { return a.side === 'A' ? '#A9E8C9' : '#F0B8A8'; }

/**
 * 部隊在**螢幕**上的最終落點（含重疊錯開）。繪製與命中只吃這一份 ——
 * 「看到旗在哪、點就在哪」是這一層唯一的正確性要求。
 */
function armyScreenList() {
  const list = MARCH_ON && save ? (save.armies || []).filter((a) => a && a.id) : [];
  const base = list.map((a) => toScreen(...armyPos(a)));
  const placed = marchStackPlace(base);
  return list.map((a, i) => ({ a, x: placed[i][0], y: placed[i][1] }));
}

/** 螢幕座標 → 部隊（命中半徑 MARCH_HIT_R＝16px；任務要求 ≥14px） */
function hitArmy(px, py) {
  const list = armyScreenList();
  const i = marchHitArmy(list.map((it) => [it.x, it.y]), px, py);
  return i >= 0 ? list[i] : null;
}

/**
 * 部隊圖元：12px 旗桿 + 9×6 三角旗 + 座下一顆騎兵點。
 * 原作是「騎馬小人 + 頭頂小方旗」（A_map_t0130.png），但 750 寬的地圖上那套只有 8–10px，
 * 能讀出來的只有兩件事：**旗色＝陣營**、**位置＝在路上**。兵力數字平時不畫（原作也不畫），
 * 只在選中時給一個小牌，避免十幾支部隊把路糊掉。
 */
function drawArmyMark(g, it) {
  const { a, x, y } = it;
  const sel = Boolean(armySel && a.id === armySel);
  g.save();
  // 先墊一層暗底：底圖有河有路，純色小旗在淺色地形上會糊掉（原作靠「騎馬小人」體積撐住可見度）
  g.beginPath(); g.arc(x, y + 2, 9.2, 0, Math.PI * 2);
  g.fillStyle = 'rgba(8,12,16,.32)';
  g.fill();
  // 旗桿
  g.strokeStyle = 'rgba(8,12,16,.95)';
  g.lineWidth = 2.8;
  g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x, y - 9); g.stroke();
  g.strokeStyle = '#E9E4D6';
  g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(x, y + 9); g.lineTo(x, y - 8); g.stroke();
  // 旗面：左上角釘在旗桿頂，朝右的小三角（原作頭頂那面小方旗）
  const w = MARCH_FLAG_W, h = 8;
  g.beginPath();
  g.moveTo(x + 0.8, y - 9);
  g.lineTo(x + 0.8 + w, y - 9 + h / 2);
  g.lineTo(x + 0.8, y - 9 + h);
  g.closePath();
  g.fillStyle = armyFlagColor(a);
  g.fill();
  g.lineWidth = 1.4;
  g.strokeStyle = 'rgba(8,12,16,.9)';
  g.stroke();
  // 騎兵座（小橢圓＝馬身）：沒有這一點，小旗在豎屏地圖上只剩一個色點
  g.beginPath();
  g.ellipse(x, y + 10, 5.2, 3, 0, 0, Math.PI * 2);
  g.fillStyle = armyFlagColor(a);
  g.fill();
  g.lineWidth = 1.1;
  g.strokeStyle = 'rgba(8,12,16,.9)';
  g.stroke();
  if (sel) {
    g.beginPath(); g.arc(x, y, 13.5, 0, Math.PI * 2);
    g.lineWidth = 2.2; g.strokeStyle = Saves.FORCE_GOLD; g.stroke();
    const label = a.progress >= 1 ? '抵達' : String(a.troops);
    g.font = '600 14px "Noto Sans SC",sans-serif';
    g.textAlign = 'center';
    const tw = g.measureText(label).width + 10;
    g.fillStyle = 'rgba(8,12,16,.84)';
    g.fillRect(x - tw / 2, y - 36, tw, 19);
    g.fillStyle = armyFlagInk(a);
    g.fillText(label, x, y - 22);
  }
  g.restore();
}

/** 7 行軍情（原作順序：主將/軍師/目的地/武將數/兵數/金錢/目前所在地形） */
function armyInfoRows(a) {
  const leader = a.general || '—';
  const lv = a.general ? generalLevelOf(a.general) : 0;
  const at = marchAtCity(a);
  const place = at ? `城（${at}）` : '平原（路上）';
  // [F16] 軍情第 6 行「金錢」也讀國庫（Σ 我方每城 money），不再讀舊單錢包 save.gold。
  const gold = CM.nationalGold(save, scenario?.cities || ALL);
  const advisorName = armyAdvisorOf(a);
  const advSeq = advisorName ? armyWiseSeq(advisorName) : 0;
  const advText = advisorName
    ? `${advisorName}<span class="dim"> · ${advSeq ? (wiseHintOf(advSeq) || '軍師技') : '未學軍師技'}</span>`
    : `${leader}（主將兼）<span class="dim"> · 未任命</span>`;
  const officers = armyOfficerList(a);
  return [
    ['主將', a.general ? `${leader}<b> Lv${lv}</b>` : '—（無主將）'],
    ['軍師', advText],
    ['目的地', `${a.to}<span class="dim"> · ${marchMonths(a.pathIndex)} 個月</span>`],
    ['武將數', `${officers.length}${officers.length > 1 ? `<span class="dim"> · ${officers.join('、')}</span>` : ''}`],
    ['兵數', `${Saves.num(a.troops)}`],
    ['金錢', `${gold.toLocaleString('en-US')}<span class="dim"> · 國庫（Σ 每城金）</span>`],
    ['目前所在地形', armyIsStationed(a)
      ? `${place}<span class="dim"> · 駐紮中（進度凍結）</span>`
      : place],
  ];
}

function canEnterCity(a) {
  const at = marchAtCity(a);
  if (!at) return { ok: false, why: '部隊在路途中，不在城上' };
  if (!mine(at)) return { ok: false, why: `${at} 不是我方城池，不能進城` };
  return { ok: true, city: at };
}

/** 「進入城內」：把在途兵力併回所在城的守軍（與 refundArmy 同一個 600 上限口徑） */
function enterCity(a) {
  const chk = canEnterCity(a);
  if (!chk.ok) return toast(chk.why);
  const st = save.cities?.[chk.city];
  if (!st) return toast(`${chk.city} 沒有城池狀態。`);
  const add = Math.max(0, Saves.num(a.troops));
  st.troops = Math.min(600, Saves.num(st.troops) + add);
  removeArmy(a.id);
  pushLog(`兵 團 進 城：${a.general || '部隊'} ${add} 兵 入 ${chk.city}（守軍 ${st.troops}）`, 'info');
  armySel = null;
  if (pickArmyId === a.id) pickArmyId = null;
  persist();
  closeOverlays();
  render();
  notice(`${add} 兵已入 ${chk.city}，守軍 ${st.troops} 兵。`);
}

function renderArmySheet() {
  const a = armyOf(armySel);
  if (!a) { closeOverlays(); return; }
  const rem = marchRemain(a.progress, marchStep(a.pathIndex));
  const force = forceAt(a.from) || (a.side === 'A' ? '我軍' : '敵軍');
  const stationed = armyIsStationed(a);
  $('armyTtl').textContent = '兵 團 指 令';
  $('armySub').textContent = `${force}軍 · ${a.from} → ${a.to} · 已走 ${rem.pct}%`
    + (stationed
      ? ' · 駐紮中：進度凍結，擋住這條道'
      : ` · ${rem.months > 0 ? `剩 ${rem.months} 個月（約 ${rem.days} 天）` : '本月到城下'}`);
  $('armyInfo').innerHTML = armyInfoRows(a)
    .map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
  const own = a.side === 'A';
  const enter = canEnterCity(a);
  const p = clamp01(Number(a.progress));
  const onRoad = p > 0 && p < 1;   // 出發城還沒走 / 已到城下，都不算「在道上」
  const advisorName = armyAdvisorOf(a);
  const cmd = (act, label, hint, enabled, cls = '') =>
    `<button class="acmd${cls}" type="button" data-army-act="${act}"${enabled ? '' : ' disabled'}>`
    + `<span>${label}</span><small>${hint}</small></button>`;
  $('armyCmds').innerHTML = [
    cmd('general', '武將資料', a.general ? `${a.general} 的數值` : '沒有主將', Boolean(a.general)),
    cmd('retarget', '變更目的', own ? '點相鄰敵城改道' : '敵軍兵團不可用', own, own ? ' primary' : ''),
    // R95：駐紮 = 不入城、停在道上擋路（project/185）。點一次駐紮、再點一次取消。
    cmd('station', '部隊駐紮', own
      ? (stationed ? '駐紮中：再點一次解除' : '駐紮：停在路上、阻擋敵軍')
      : '敵軍兵團不可用', own && (stationed || onRoad)),
    // R95（§C1）：軍師可點性只看「軍團裡武將數 ≥ 2」——只有主將一人時灰（沒人可挑），
    // 灰字講的是人少，不是「存檔沒欄位」這種實作理由。
    cmd('advisor', '任命軍師', own
      ? (armyOfficerList(a).length < 2
        ? '軍團僅主將一人，無可任命'
        : (advisorName ? `現任 ${advisorName} · 點此更換` : `從 ${armyOfficerList(a).length} 名隨軍武將裡選`))
      : '敵軍兵團不可用', own && armyCanAppointAdvisor(a)),
    cmd('enter', '進入城內', enter.ok ? `併入 ${enter.city} 守軍` : enter.why, enter.ok),
  ].join('');
  $('armyFoot').textContent = `${Saves.num(a.troops)} 兵 · ${a.from} → ${a.to}`
    + ` · ${marchMonths(a.pathIndex)} 個月路程`
    + (stationed ? ' · 駐紮中：敵軍沿這條道來會被擋在接觸點' : '')
    + ' · 點地圖其他部隊可切換';
}

// ---------------------------------------------------------------- 駐紮 / 軍師（project/185 C）
/**
 * 這名武將「現在」能用的一招軍師技 seq（0＝一招都還沒學到）。
 * 過濾規則與出征頁同一份：core/wises.ts:563 listWisdomChoices（按 WISESKILL 學習等級 + 將等級，
 * 同名技能併檔取最高檔）。generals.json 的 WISESKILL 是「幾級學哪招」，save.learned 是月末補學
 * 的實際結果（core/unlock.ts:436），兩邊併起來再交給 core，才不會把剛學會的招濾掉。
 */
function armyWiseSeq(name) {
  if (!name) return 0;
  const row = generalRow(name);
  if (!row) return 0;
  const skills = Array.isArray(row.WISESKILL) ? row.WISESKILL.slice() : [];
  const have = new Set();
  for (const s of skills) {
    const pair = Array.isArray(s) ? s : String(s).split(/[,\s]+/);
    const seq = Number(pair[1]);
    if (Number.isFinite(seq)) have.add(seq);
  }
  for (const seq of (save?.learned?.[name]?.wise || [])) {
    const n = Number(seq);
    if (Number.isFinite(n) && !have.has(n)) { skills.push([1, n]); have.add(n); }
  }
  try {
    const list = listWisdomChoices(
      { wises: GDATA.wises || [] },
      { ...row, WISESKILL: skills, level: generalLevelOf(name) },
    );
    return list.length ? list[list.length - 1] : 0;   // 最後一條＝這名武將能用的最高檔
  } catch (e) {
    return 0;
  }
}

/** 軍師候選：本兵團隨軍武將（主將也在裡面）+ 各自現在能用的軍師技 + 忠誠/智力供參考 */
function armyAdvisorRows(a) {
  const cur = armyAdvisorOf(a);
  const leader = a && typeof a.general === 'string' ? a.general : '';
  return armyOfficerList(a).map((name) => {
    const row = generalRow(name) || {};
    const seq = armyWiseSeq(name);
    let hint = '未學軍師技';
    if (seq) {
      try { hint = wiseHintOf(seq) || '軍師技'; } catch (e) { hint = '軍師技'; }
    }
    const rawLoyal = save?.loyal && Number.isFinite(Number(save.loyal[name])) ? Number(save.loyal[name]) : NaN;
    return {
      name, seq, hint,
      lv: generalLevelOf(name),
      str: Number(row.STR) || 0,
      int: Number(row.INT) || 0,
      loyal: Math.round(Number.isFinite(rawLoyal) ? rawLoyal : (Number(row.Loyal) || 50)),
      isLeader: name === leader,
      picked: name === cur,
    };
  });
}

/** 任命軍師浮層：列表＝這支部隊的 officers（現任不重複列），點一張卡就寫回 a.advisor */
function renderAdvisorSheet(a) {
  const army = a && a.id ? a : armyOf(armySel);
  if (!army) return;
  const rows = armyAdvisorRows(army);
  const cur = armyAdvisorOf(army);
  // 只有主將一人＝根本沒得挑：按鈕灰、這裡也不開（雙保險）
  if (!armyCanAppointAdvisor(army)) {
    advisorArmyId = army.id;
    toast('軍團僅主將一人，無可任命');
    return;
  }
  advisorArmyId = army.id;
  $('advisorTtl').textContent = '任 命 軍 師';
  $('advisorSub').textContent = `${army.from} → ${army.to} · 隨軍武將 ${rows.length} 人`
    + ` · 軍師只能從這支部隊的武將裡挑（現任：${cur || '主將兼'}）`;
  const card = (data, on, title, sub, foot) =>
    `<div class="scard${on ? ' on' : ''}" data-advisor="${surEsc(data)}">`
    + `<div class="scn">${title}</div><div class="scm">${sub}</div><div class="sct">${foot}</div></div>`;
  const cards = [
    card('', !cur, '不 設 軍 師',
      `軍師＝主將兼${army.general ? `（${surEsc(army.general)}）` : ''}，開戰時不發動軍師技`,
      cur ? '點此免職' : '目前狀態'),
  ];
  // 現任軍師自己不再列（要換就點別人、要撤就點上面那張）
  for (const r of rows) {
    if (r.picked) continue;
    cards.push(card(r.name, false,
      `${surEsc(r.name)}${r.isLeader ? ' <span class="dim">主將</span>' : ''}`,
      `Lv${r.lv} · 武 ${r.str || '—'} 智 ${r.int || '—'} 忠 ${r.loyal} · ${surEsc(r.hint)}`,
      r.seq ? `開戰時發動（seq ${r.seq}）` : '沒有可用軍師技：選了也不會發動'));
  }
  $('advisorList').innerHTML = cards.join('');
  $('advisorFoot').textContent = cur
    ? `現任軍師：${cur} · ${armyWiseSeq(cur) ? (wiseHintOf(armyWiseSeq(cur)) || '') : '沒有可用軍師技'} · 點別張卡即更換`
    : '目前軍師＝主將兼（未指定） · 點一張卡任命';
  openSheet('advisorSheet');
}

/** 駐紮 / 解除駐紮：只改 save.armies 的旗標，progress 由 advanceArmies 凍結 */
function toggleStation(a) {
  if (!a || a.side !== 'A') return toast('敵軍兵團不能下令駐紮。');
  const p = clamp01(Number(a.progress));
  if (!armyIsStationed(a) && !(p > 0 && p < 1)) {
    return toast(p >= 1 ? '部隊已到城下，不能再駐紮。' : '部隊還在出發城：出發後才能在路上駐紮。');
  }
  a.stationed = !armyIsStationed(a);
  const pct = Math.round(p * 100);
  pushLog(a.stationed
    ? `部 隊 駐 紮：${a.general || '部隊'} 停在 ${a.from} → ${a.to} 道上（已走 ${pct}%），阻擋敵軍`
    : `解 除 駐 紮：${a.general || '部隊'} 繼續往 ${a.to} 行軍（已走 ${pct}%）`, 'info');
  persist();
  renderArmySheet();   // 浮層開著就地刷新（再點一次就是取消）
  render();
  notice(a.stationed
    ? `已駐紮：${a.general || '部隊'} 停在 ${a.from} → ${a.to} 道上（${pct}%），敵軍沿這條道來會被擋住。`
    : `已解除駐紮：${a.general || '部隊'} 下個月恢復推進。`);
}

/** 點部隊 → 兵團指令 */
function selectArmy(id) {
  const a = armyOf(id);
  if (!a) return;
  armySel = id;
  renderArmySheet();
  openSheet('armySheet');
  render();   // 讓金環與兵力牌立刻出來
}

// ---- 變更目的：選點態（原作頂部藍匾「請選擇兵團目的城市」，其餘 HUD 全藏） ----
function syncPickLayout() {
  // 藏掉 header/footer 後 #mapwrap 會變高：底圖與城點都吃 view，必須在新尺寸上重算一次，
  // 否則選點態的城點會和底圖錯位（畫在這、點在那）。
  const run = () => { if (typeof syncView === 'function' && syncView()) { syncBg(); drawMap(); } else drawMap(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

function enterPickMode(id) {
  const a = armyOf(id);
  if (!a) return;
  if (a.side !== 'A') return toast('敵軍兵團不能變更目的。');
  pickArmyId = id;
  closeOverlays();
  stage.classList.add('pick');
  syncPickLayout();
  // 不在這裡 notice：選點態的 #pickCue 已經寫了操作說明，再彈一條會變成兩行重複的提示。
  // 出錯（點到不相鄰/自家的城）才用 notice 說明原因。
}

function exitPickMode(silent) {
  if (!pickArmyId) return;
  pickArmyId = null;
  stage.classList.remove('pick');
  syncPickLayout();
  render();
  if (!silent) notice('已取消變更目的：兵團照原路走。');
}

/** 選點態點城：校驗→改目的（同一個 marchPath，沒有第二套合法性） */
function applyRetarget(cityName) {
  const a = armyOf(pickArmyId);
  if (!a) { exitPickMode(true); return; }
  const chk = marchRetargetCheck(a, cityName, marchPath, mine);
  if (!chk.ok) { notice(chk.why, 5000); return; }   // 留在選點態，讓玩家換一座城
  const from = a.from;
  a.to = cityName;
  a.pathIndex = chk.pathIndex;
  a.progress = 0;
  a.reported = false;
  pushLog(`兵 團 改 道：${from} → ${cityName}（${marchMonths(chk.pathIndex)} 個月）`, 'info');
  persist();
  pickArmyId = null;
  stage.classList.remove('pick');
  syncPickLayout();
  render();
  notice(`${a.general || '兵團'} 改道往 ${cityName}：${marchMonths(chk.pathIndex)} 個月後到城下。`);
}

$('armyCmds').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-army-act]');
  if (!el || el.disabled) return;
  const a = armyOf(armySel);
  if (!a) return;
  const act = el.dataset.armyAct;
  if (act === 'general') { genOnly = a.general || null; openGeneralSheet(); return; }
  if (act === 'retarget') { enterPickMode(a.id); return; }
  if (act === 'station') { toggleStation(a); return; }
  if (act === 'advisor') { renderAdvisorSheet(a); return; }
  if (act === 'enter') { enterCity(a); return; }
  toast('這個命令在原作與本作都不可用：見按鈕右側的說明。');
});

// 軍師浮層：點一張卡 → 寫回 a.advisor（校驗必須是 officers 成員；空字串＝免職）
$('advisorList').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-advisor]');
  if (!el) return;
  const a = armyOf(advisorArmyId || armySel);
  if (!a) return;
  const name = el.dataset.advisor || '';
  if (!armySetAdvisor(a, name)) return toast('這名武將不在本兵團的隨軍名單裡，不能任命。');
  pushLog(name
    ? `任 命 軍 師：${a.general || a.from + ' 軍'} 兵團 → ${name}（開戰時發動軍師技）`
    : `免 除 軍 師：${a.general || a.from + ' 軍'} 兵團 回到主將兼`, 'info');
  persist();
  renderAdvisorSheet(a);   // 就地重畫：現任會變、再點別張就是更換
  notice(name
    ? `已任命 ${name} 為軍師${armyWiseSeq(name) ? `（${wiseHintOf(armyWiseSeq(name)) || '軍師技'}）` : '（未學軍師技，開戰不發動）'}。`
    : '已免職：軍師＝主將兼。');
});

// ---------------------------------------------------------------- 地圖繪製
// 底图 map_sheet.png 是 1280×960，60 城的 pos_xy 就是它的像素坐标（已用
// work/bg_align_probe.py 逐点验证过），所以绘图坐标系直接用图片像素尺寸。
const IMG = { w: 1280, h: 960 };
const MAP = { x0: 0, y0: 0, x1: IMG.w, y1: IMG.h };
// 60 城在底图上的联集外框（5 剧本 × 60 城 = 300 个 pos_xy 的最值，data/scenarios.json 实测）：
// x 88（西凉）..1138（襄平）、y 84（襄平一带）..860（云南一带）。
// plotRect() 用这块外框定缩放；改数据（新增剧本/挪城）时要同步这里的数字，
// game/tests/rows85.test.ts 有断言守住这条（见 MAP_CITY_BOX）。
const CITY_BOX = { x0: 88, y0: 84, x1: 1138, y1: 860 };
const CITY_PAD = 26;                            // 屏幕像素：城点图标半径 ~14 + 城名，留 26 才不会把西凉/襄平切掉半颗
const MAP_BAND = 62;                            // 上下装裱带：下带要 ≥58px 才会把 R70 圖例写进带里（见 drawBands 的 legendBand），否则图例会压住最南的桂陽/廬陵/夷州
const USE_BG = qs.get('bg') !== '0';          // ?bg=0：关掉底图，看旧的纯色版，方便对比
const USE_ROUTES = qs.get('routes') === '1';  // 底图已把道路烘进像素，默认不再叠 116 条线
// view 的宣告已提到檔頭（:402 附近，R86 防 TDZ），這裡不再重複宣告 —— 重複會直接 SyntaxError。

function plotRect() {
  // [84_map] 不再用「整张 1280×960 等比放进地图区」——那样竖屏下只能得到 750×562，
  // 上下各留 66px 装裱带，地图看着被压扁（用户实拍反馈）。
  // 改按「城池外框」定标：60 城在底图像素上的联集外框是 x 88..1138、y 84..860
  // （5 个剧本 300 个点取最值，见下方 CITY_BOX 注释），把这块外框尽量放大到屏幕里，
  // 四周只留 CITY_PAD 的呼吸位；外框之外的边海/草原允许被裁掉（原作竖屏化必须取舍）。
  // 结果：地图从 750×562 变成约 750×657（+17%），城池一个不少、点选坐标不变。
  const bw = CITY_BOX.x1 - CITY_BOX.x0, bh = CITY_BOX.y1 - CITY_BOX.y0;
  const s = Math.min((view.w - CITY_PAD * 2) / bw, (view.h - CITY_PAD * 2) / bh);
  const w = IMG.w * s, h = IMG.h * s;
  // 以城池外框中心对齐地图区中心
  const cx = (CITY_BOX.x0 + CITY_BOX.x1) / 2, cy = (CITY_BOX.y0 + CITY_BOX.y1) / 2;
  // 注意：**不要**再把矩形夹回视口内。外框之外的边海/草原本来就要被裁掉，
  // 夹回来会把图缩回 letterbox 尺寸、还会把最南的桂陽/夷州裁出画面
  // （第一版 clamp 就这样翻车过）。溢出部分由 #mapwrap 的 overflow:hidden 裁掉。
  const x = view.w / 2 - cx * s, y = view.h / 2 - cy * s;
  return { x, y, w, h, s };
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

/** 把地图区当前尺寸同步进 view（并让 canvas 像素尺寸跟上）。
 *  只在 resize 事件里同步会翻车：字体/战报/按钮高度变化会改 mapwrap 的 clientHeight，
 *  但不会再发一次 resize，于是底图 <img> 的 style 用的是旧 view、和 canvas 上的城点错位
 *  （实测见过 144px 的错位，底图下缘被裁、最南的桂陽/夷州出画面）。 */
function syncView() {
  const box = $('mapwrap'), cv = $('map');
  if (!box || !cv || box.style.display === 'none') return false;
  const w = Math.max(1, box.clientWidth || 750);
  // [84_map] 先把地图区的高度上限压到「宽度定标后的图高 + 两条装裱带」，
  // 否则 flex:1 会把它撑到整屏剩余高度，图下方留一大片死黑（用户实拍反馈）。
  const sW = (w - CITY_PAD * 2) / (CITY_BOX.x1 - CITY_BOX.x0);
  const cap = Math.round(IMG.h * sW) + MAP_BAND * 2;
  if (box.style.maxHeight !== cap + 'px') box.style.maxHeight = cap + 'px';
  const h = Math.max(1, Math.round(box.clientHeight || cap));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  view.w = w; view.h = h;
  return true;
}

function resizeCanvas() {
  const cv = $('map');
  const box = $('mapwrap');
  if (!cv || !view) return;                     // R86：早期 resize / 半初始化狀態下不炸
  if (!box || box.style.display === 'none') return;
  syncView();
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
  syncView();                                   // 先对齐 view 与 canvas，再清/画（见 syncView 注释）
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
  // 城（R70：归属色改按势力取色；色板集中在 web/saves.js FORCE_PALETTE）
  let li = 0;
  const ring = (x, y, radius, width, color) => {
    g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2);
    g.lineWidth = width; g.strokeStyle = color; g.stroke();
  };
  /**
   * [F28] 城上小旗（原作「城 + 勢力旗」：旗形取劇本 `FLAGS`，旗色取勢力色）。
   * 差異清單行 229：「城不插旗，勢力靠一圈色環」。旗桿插在城圖元左上，旗布往右展開：
   *   · `FLAGS=2`（12 座關）→ 三角旗（pennant），旗面小一號；
   *   · `FLAGS=4`（48 座城）→ 方旗（rect），下緣帶一個缺口。
   * 色板是固定 29 家（saves.js FORCE_PALETTE），同一個勢力在地圖/圖例/列表/旗上永遠同色。
   */
  const cityFlag = (x, y, color, flags) => {
    const pennant = Number(flags) === 2;
    const top = y - (pennant ? 11 : 13);
    g.save();
    g.lineWidth = 1.6;
    g.strokeStyle = 'rgba(8,12,16,.88)';
    g.beginPath(); g.moveTo(x + 0.4, y + 10); g.lineTo(x + 0.4, top); g.stroke();
    g.beginPath();
    if (pennant) {
      g.moveTo(x + 1, top + 0.4);
      g.lineTo(x + 11, top + 3.8);
      g.lineTo(x + 1, top + 7.6);
    } else {
      g.moveTo(x + 1, top + 0.4);
      g.lineTo(x + 13, top + 0.4);
      g.lineTo(x + 13, top + 8.2);
      g.lineTo(x + 1, top + 8.2);
    }
    g.closePath();
    g.fillStyle = withAlpha(color, 0.96);
    g.fill();
    g.lineWidth = 1.1;
    g.strokeStyle = withAlpha(Saves.FORCE_EDGE, 0.82);
    g.stroke();
    g.restore();
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
    // R70 起归属=「勢力色環」：29 家固定色板，玩家勢力多一圈金環，選中再疊一圈亮金。
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
    // [F28] 勢力小旗：空城（無主）不插旗；旗桿在城圖元左上，旗面朝右
    if (force) cityFlag(sx - (ready ? 25 : 18), sy, color, c.FLAGS);
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
  // 行軍部隊（project/178 §2.2 / project/182）：原作是「騎馬小人 + 頭頂小方旗」。
  // 這裡畫成小旗（綠＝我軍、紅＝敵軍），沿路按 progress 落點；同點多支部隊由
  // marchStackPlace() 錯開，而**繪製與命中吃同一份 armyScreenList()**。
  // 位置一律走 armyPos()→toScreen()（既有投影），沒有第二套座標系。
  for (const it of armyScreenList()) drawArmyMark(g, it);
  // 图例（R70）：色值同样来自 web/saves.js FORCE_PALETTE，避免「地图一套、图例一套」。
  // [F28] 色板从 14 家扩到 29 家固定（剧本 1 有 18 家），撞色不再靠哈希兜；每行 7 家，自动排 2-5 行。
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
  g.fillText('● 金環＝我方 · 小旗＝勢力', inBand ? 20 : 26, titleY);
  g.fillStyle = 'rgba(233,228,214,.66)';
  // 空城是劇本資料本身的常態（劇本1 有 39 座），必須講明「灰＝無主」，否則會以為配色漏了
  g.fillText(
    `色＝勢力（${seenForces.length} 家 · 固定 29 家色板）${unowned ? ` · 灰＝無主（${unowned} 城）` : ''}`,
    inBand ? 168 : 196, titleY,
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
  // 命中一律換算到 canvas 內部分辨率（view.w/h），部隊與城共用同一套
  const px = (ev.clientX - r.left) * (view.w / r.width);
  const py = (ev.clientY - r.top) * (view.h / r.height);
  if (pickArmyId) {                    // 選點態：只認城（點空地什麼都不做，右鍵/Esc 才取消）
    const dest = hitCity(px, py);
    if (dest) applyRetarget(dest.NAME);
    return;
  }
  // 部隊先判：小旗半徑 16px，比城圖標小得多，先判部隊才不會被附近城搶走點擊
  const army = hitArmy(px, py);
  if (army) { selectArmy(army.a.id); return; }
  const best = hitCity(px, py);
  if (best) { armySel = null; selected = best.NAME; render(); }
});

// 選點態的退出：右鍵或 Esc（原作沒有「取消」按鈕，只能退回去）
stage.addEventListener('contextmenu', (ev) => {
  if (!pickArmyId) return;
  ev.preventDefault();
  exitPickMode();
});
window.addEventListener('keydown', (ev) => {
  if (!pickArmyId) return;
  if (ev.key === 'Escape') { ev.preventDefault(); exitPickMode(); }
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
  if (act === 'advance') {
    if (!gameStarted) { advanceMonth(1); return; }
    advanceMonth(1);
    // 原作按下月推進會有一句「內政時間到了....」（A_map_monthprompt_t0183.png）。
    // 字串只在 saves.js 有一份（Saves.advanceNotice），頁面不自己抄。
    // 放在結算之後並蓋過「自動存到槽 N」那條我們自己加的提示：原作按下去看到的就是這句。
    // 例外：結算彈了要決策的浮層（抵達城下 / 遭遇戰）就別彈，反正也會被 scrim 蓋住。
    if ($('confirmSheet').hidden) notice(Saves.advanceNotice, 5000);
    return;
  }
  // R8 一月一令：本月已下过令 → 開發/出征 拒绝（按钮已置灰，这里兜住键盘与旧 URL）
  // F15：徵兵已改為「進城徵兵」，本身不寫存檔，不該再吃這道鎖。
  if (['develop', 'dispatch', 'march', 'march_direct'].includes(act)
    && CM.monthLocked(save, UNLIMITED)) return toast(CM.LOCK_HINT);
  if (act === 'dispatch') { openMarchTargets(); return; }
  if (!selected) return;
  const st = save.cities[selected];
  if (act === 'city') {
    // [F1] 非正月帶 `&view=1`：城內頁只讀（原作 1 月內政月，其餘 11 個月不能下命令）
    location.href = './city.html?city=' + encodeURIComponent(selected)
      + (Saves.monthOfYear(save.month) === 1 ? '' : '&view=1')
      + (UNLIMITED ? '&unlimited=1' : '');
    return;
  }
  if (act === 'recruit') {
    // [F15] 第三套口徑已刪（原本 `gold -= 500; troops += 40`）。
    // 徵兵是內政命令（原作 1 月內政月），這裡只負責跳進城內的同一個抽屜。
    if (!Saves.isYearStart(save.month)) {
      return toast('非正月：徵兵屬於內政，只有 1 月能下（原作 1 月內政月）。');
    }
    location.href = './city.html?city=' + encodeURIComponent(selected) + '&cmd=recruit' + (UNLIMITED ? '&unlimited=1' : '');
    return;
  }
  if (act === 'develop') {
    // [F12] 大地圖不再有第三套口徑（舊碼 `save.gold -= 400; st.pop += 3000`）。
    // 原作開發不收金（`city_model.js:71 devGold = 0`，0x427B9E 外殼），而且「每將一年一次」
    // 要選執行武將、要有太守 —— 這些判定全在城內頁 `doDevelop()` 裡，這裡只負責跳頁。
    if (!Saves.isYearStart(save.month)) {
      return toast('非正月：開發屬於內政，只有 1 月能下（原作 1 月內政月）。');
    }
    location.href = './city.html?city=' + encodeURIComponent(selected) + '&cmd=develop' + (UNLIMITED ? '&unlimited=1' : '');
    return;
  }
  if (act === 'march') {
    if (distFromOwned(selected) !== 1) return toast('不接壤：只能打與我方相鄰的城。');
    CM.markMonthActed(save, UNLIMITED);   // 出征＝本月已经下令
    // R94：出征前把出陣隊列落進存檔（沒有就用出發城現有武將生成），deploy.html 接著顯示並可調。
    // 必須在 persist() 之前：它鏡像的 legacy 鍵與 autosave 的快照都要帶著這份隊列過去。
    const from = (save.owned && save.owned[0]) || selected;
    save.deployQueue = DQ.saveQueue(save, DQ.queueOf(save,
      (garrisonIn(from)?.officers || []).map((o) => o.name)));
    persist();   // 進戰鬥前先鏡像到舊鍵，回來時 main.js 的寫回會被偵測到
    // 士氣（武將級）：出征頁會自己按「出發城主將」重算一次；這裡先帶一份，
    // 出征頁若算出不同主將就以它自己的為準（見 deploy.html 的 amorale 邏輯）。
    const leader = localGeneral(from);
    const cap = dispatchCapOf(from);   // R75：出兵數 = 出發城主將的帶兵上限
    const dq = new URLSearchParams({
      city: selected,
      from,
    });
    if (leader) dq.set('amorale', String(moraleOf(save, leader.name)));
    // 主将名的唯一来源：这里定下来，出征頁/战斗頁都只读它（`?a=`）。
    // 以前不带主将名，deploy.html 自己从城里挑一个、main.js 缺省又写死「關羽」，
    // 同一个主将在三处显示三个名字（project/93 §问题2）。
    if (leader) dq.set('a', leader.name);
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
  if (!$('surrenderSheet').hidden) return;   // R85：戰後招降面板必須逐將決策完才能回大地圖
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
  // 必須把使用者剛選好的劇本帶過去：showPicker('king') 不帶 idx 時會把
  // pendingScenario 重設成 currentScenarioIdx()（＝目前這局的劇本），
  // 於是「在第 3 個劇本卡上點選 → 選君主」會被靜默打回第 1 個劇本。
  if (pickMode === 'scenario') { showPicker('king', pendingScenario); return; }
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
// R13 內政三命令：武將資料（全勢力名冊）／內政終了（收束本月令）
$('btnGenerals').addEventListener('click', () => { if (gameStarted) { genOnly = null; openGeneralSheet(); } });
$('btnEndMonth').addEventListener('click', () => { if (gameStarted) endMonth(); });
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
    const ACT_LABEL = ['不明', '補金', '逃跑', '移動武將', '攻擊我方', '攻擊他勢力', '（系統）', '聯合', '佔領空城'];
    tags.push(`${item.force}·${cand?.act === 0 && cand?.kind ? (AI.KIND_NAMES?.[cand.kind] || cand.kind) : (ACT_LABEL[cand.act] ?? '?')}`);
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
  const cd = cityOf(cityName);
  // 關卡（易京/官渡/赤壁…）：關上沒有武將（garrison.json 的 officers 是空的），守軍就是
  // garrison.json 的 `garrison`（實測 12 座關都是 110）。舊碼落到下面「無守將 → 我軍六成」的兜底，
  // 於是同一座關的兵力會隨我軍出征數浮動（我軍 100 → 守軍 60）；這條分支讓它變成固定值。
  if (cd && CM.isGate(cd)) {
    return { ...base, enemyTroops: gateTroopsOf(cityName), enemyLevel: 1 };
  }
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
    // R86 S2-2：裝備加成（`equipOf()` 的第一個真實消費者）。main.js 目前只認 `?gen=` 反查
    // generals.json 的 STR/INT，所以加成走 `?astr=/?aint=` 這個**遊戲參數**（不是調試參數）。
    // 不給就等於沒裝備；main.js 沒讀之前這兩個參數是無害的多餘 query。
    const st = statsOf(g, g.name);
    q.set('astr', String(st.str));
    q.set('aint', String(st.int));
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
  // R86 S2-2：守將的裝備加成一起帶進戰鬥（見 marchDirectQuery 的說明）
  if (g) {
    const st = statsOf(g, g.name);
    q.set('astr', String(st.str));
    q.set('aint', String(st.int));
  }
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
  const foeLeader = localGeneral(atk.from)?.name;
  const army = {
    id: nextArmyId(), side: 'B', from: atk.from, to: atk.to, pathIndex: pi,
    progress: 0, troops: atk.et, general: foeLeader,
    // 敵軍兵團一樣有隨軍名單（顯示「敵軍兵團」的武將數/軍師用），但 AI 不任命軍師
    officers: armyRosterPick([], (garrisonIn(atk.from)?.officers || []).map((o) => o && o.name), foeLeader),
    advisor: '',
    stationed: false,
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

// [[MARCH_ARRIVE_CORE]]
/**
 * 敵軍抵達結算（純函數）：目標城**還是自己的**才打守城戰；已經不是 → 佔領/路過，不進戰鬥。
 *
 * R86 S1-1 的斷鏈：舊碼 `list.filter((a) => a.side === 'B' && a.progress >= 1)` 只看行軍進度，
 * **不看城的歸屬**。城在敵軍抵達前就丟了（r86 實測：宛 / 汝南），行軍照樣把「守城戰」拉起來
 * —— 玩家被迫打一場守城戰，撤退後下一支敵軍抵達又來一次，永遠打不完。
 *
 * ctx：
 *   · owned     我方城名數組（`save.owned`）—— 有它在就是「我的城」，打
 *   · ownerOf(城名) 該城現在的歸屬（'' = 無主/未知）
 *   · forceOf(城名) 城名 → 勢力 id（區分「敵軍佔領」和「敵軍只是穿過自己的城」）
 *   · myForce   我方勢力 id（城已被記成我方但沒進 owned 的殘狀態也算「我的城」）
 * 回傳 `{ battles, passes, logs }`：
 *   · battles  要打守城戰的行軍（調用方決定批量判定還是跳 defendUrl，**這裡不跳轉**）
 *   · passes   不進戰鬥的行軍 + 處理動作（`occupy` = 換 owner/駐軍；`pass` = 原樣穿過）
 *   · logs     要寫進戰報的行（kind 沿用 `pushLog` 的 `'lost'` / `'atk'`）
 */
function planEnemyArrivals(arrivals, ctx) {
  const list = Array.isArray(arrivals) ? arrivals : [];
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const owned = Array.isArray(c.owned) ? c.owned : [];
  const myForce = typeof c.myForce === 'string' ? c.myForce : '';
  const ownerOf = typeof c.ownerOf === 'function' ? c.ownerOf : () => '';
  const forceOf = typeof c.forceOf === 'function' ? c.forceOf : () => '';
  const out = { battles: [], passes: [], logs: [] };
  for (const army of list) {
    if (!army) continue;
    const to = typeof army.to === 'string' ? army.to : '';
    const from = typeof army.from === 'string' ? army.from : '';
    const owner = to ? String(ownerOf(to) || '') : '';
    // 「還是我的城」兩種寫法：在 owned 裡，或 owner 已經記成我方（同一個勢力 id）
    const mineNow = Boolean(to) && (owned.includes(to) || (Boolean(owner) && Boolean(myForce) && owner === myForce));
    if (mineNow) {
      out.battles.push(army);
      continue;
    }
    const force = from ? String(forceOf(from) || '') : '';
    // 無主城 / 別家勢力的城 → 敵軍是真的佔下來；自家勢力的城（只是不在 owned 的殘狀態）→ 路過
    const occupy = Boolean(to) && (!owner || (Boolean(force) && owner !== force && !(myForce && owner === myForce)));
    out.passes.push({ army, to, from, kind: occupy ? 'occupy' : 'pass', owner, force });
    out.logs.push(occupy
      ? { kind: 'lost', text: `敵 軍 佔 領：${from} → ${to}（${to} 已非我軍，不進戰鬥）` }
      : { kind: 'atk', text: `敵 軍 路 過：${from} → ${to}（${to} 非我軍城池，不進戰鬥）` });
  }
  return out;
}
// [[/MARCH_ARRIVE_CORE]]

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
  // R86 S2-2：我方主將的裝備加成（見 marchDirectQuery 的說明）
  if (g) {
    const st = statsOf(g, g.name);
    q.set('astr', String(st.str));
    q.set('aint', String(st.int));
  }
  q.set('bmorale', String(moraleOf(save, foe?.name || '來犯之將')));
  // R95（project/185 C）：軍師隨部隊上戰場。main.js:510 `wise: num('wise',0)` 讀這個 seq，
  // main.js:703 開戰前 `applyWise(world,'A',cfg.wise)` —— 這就是「戰鬥開始時生效」的接點。
  // 只傳這支部隊自己任命的軍師（armyAdvisorOf 已驗證是 a.officers 成員）。
  const advisorName = armyAdvisorOf(a);
  if (advisorName) {
    const seq = armyWiseSeq(advisorName);
    if (seq) q.set('wise', String(seq));
    q.set('advisor', advisorName);   // 資訊參數：index.html 不讀，戰報/排查用（main.js 不白名單化 query）
  }
  return './index.html?' + q.toString();
}

/**
 * 遭遇戰開戰鏈——**全頁只有這一條**（project/185 §B5 要求：不要自造第二套戰鬥啟動）。
 * 原本只寫在「行軍中相向撞上」那個分支裡，R95 起把「推進方撞上駐紮部隊」也接到這裡。
 * a/b 誰先誰後不影響（舊版直接按 list 順序傳，B 在前時 soldiers/bsoldiers 會反）；
 * blocker=守、mover=攻：只有「誰是 A 方」決定 URL 參數（main.js 永遠把我方當 A 方）。
 */
function startEncounter(a, b, note = '') {
  if (!a || !b) return false;
  const A = a.side === 'A' ? a : b;
  const B = a.side === 'A' ? b : a;
  removeArmy(a.id); removeArmy(b.id);
  pushLog(`遭 遇 戰：${a.from} 軍 與 ${b.from} 軍 在 ${a.to} 道上相遇${note ? `（${note}）` : ''}`, 'atk');
  autosave();
  render();
  const label = (x) => (x.side === 'A' ? '我軍' : '敵軍');
  confirmBox('遭 遇 戰',
    `${label(A)} ${A.troops} 兵 與 ${label(B)} ${B.troops} 兵 在往 ${A.to} 的路上撞上了`
    + `${note ? `（${note}）` : ''}。\n出戰則進入野戰；取消則兩軍各自退兵回城。`,
    () => { location.href = encounterUrl(A, B); },
    () => { refundArmy(a); refundArmy(b); autosave(); render(); });
  return true;
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

// 駐紮對峙的記位：配對鍵 → 首次接觸的月份 / 已提示過的配對（同一對只提示一次、只打一場）
const stationSince = new Map();
const stationNoticed = new Set();

/** 抵達 / 遭遇 / 駐紮阻擋結算。回傳 true 表示已觸發跳轉（調用方要立刻 return）。 */
function handleMarchEvents(batch) {
  if (!MARCH_ON || !save) return false;
  const list = save.armies || [];

  // 1) 同一條路上相向而行的兩軍：進度交錯 → 遭遇
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!armiesIntercept(a, b)) continue;
      if (batch) { resolveEncounter(a, b); return false; }
      return startEncounter(a, b);
    }
  }

  // 1.5) 駐紮阻擋（project/185 §B5）：推進方撞上「同一路段上駐紮的敵方部隊」。
  //      advanceArmies 已把推進方夾在接觸點（1 - 駐紮方 progress - 容差），這裡只負責交涉：
  //        · 阻擋方＝駐紮那支（守）、來襲方＝推進到接觸點那支（攻）；
  //        · 敵軍來撞：先提示＋戰報（玩家還來得及撤兵/進城），對峙拖過一個月才開打；
  //        · 玩家自己的部隊撞上去：當場開戰（與行軍撞上同一條開戰鏈 startEncounter）。
  const stand = stationStandoff(list);
  if (stand) {
    const key = stationPairKey(stand.blocker, stand.mover);
    const seen = stationSince.get(key);
    const first = !stationSince.has(key);
    const stale = !first && Number(seen) !== Number(save.month);
    stationSince.set(key, save.month);   // 同一個月內重複呼叫（render/存檔/再推進）不再重複記帳
    const moverIsPlayer = stand.mover.side === 'A';
    const on = `${stand.blocker.from} → ${stand.blocker.to}`;
    // 戰報只寫一次（首次接觸，或對峙又拖過一個月），不然每幀都刷同一行
    if (first || stale) {
      pushLog(`駐 紮 阻 擋：${stand.blocker.general || '守軍'} 在 ${on} 道上擋住 `
        + `${stand.mover.general || '敵軍'}（${stand.mover.side === 'A' ? '我軍' : '敵軍'} ${stand.mover.troops} 兵 停在接觸點）`, 'atk');
    }
    if (!moverIsPlayer && !stale) {
      if (!stationNoticed.has(key)) {
        stationNoticed.add(key);
        const who = stand.blocker.side === 'A' ? `我軍 ${stand.blocker.general || '部隊'}` : `敵軍 ${stand.blocker.general || '部隊'}`;
        notice(`${who} 在 ${on} 道上駐紮：${stand.mover.side === 'A' ? '我軍' : '敵軍'} `
          + `${stand.mover.troops} 兵 被擋在接觸點（已走 ${Math.round(clamp01(Number(stand.mover.progress)) * 100)}%），越不過去。`, 9000);
      }
      autosave();
      render();
      return false;
    }
    const note = `駐紮阻擋：${stand.blocker.general || '守'} 守 · ${stand.mover.general || '攻'} 攻`;
    if (batch) { resolveEncounter(stand.blocker, stand.mover); return false; }
    return startEncounter(stand.blocker, stand.mover, note);
  }

  // 2) 敵軍抵達我方城下 → 守城戰（沿用舊 defendUrl）。R86 S1-1：先驗歸屬 ——
  //    城已經不是我們的（被別人佔了/自己丟了），敵軍只是佔領或路過，寫一條戰報就結束，
  //    不進戰鬥。不驗的話會出現「撤退 → 下一支敵軍抵達 → 又是守城戰」的死循環。
  const bArr = list.filter((a) => a.side === 'B' && a.progress >= 1);
  if (bArr.length) {
    const plan = planEnemyArrivals(bArr, {
      owned: save.owned,
      myForce: MM.forceIdOf(save) || '',
      ownerOf: (n) => save.cities?.[n]?.owner || '',
      forceOf: (n) => forceAt(n),
    });
    for (const p of plan.passes) {
      removeArmy(p.army.id);
      const st = save.cities?.[p.to];
      if (st && p.kind === 'occupy') {
        if (p.force) st.owner = p.force;
        st.troops = Math.max(30, Math.round(Saves.num(p.army.troops) * 0.6));
      }
    }
    for (const l of plan.logs) pushLog(l.text, l.kind);
    if (!plan.battles.length) {
      // 全是佔領/路過：不跳轉，也不 return true —— 下面「我軍抵達」的事件照舊要處理
      if (plan.passes.length) { autosave(); render(); }
    } else if (batch) {
      for (const a of plan.battles) { resolveDefense(armyAsAtk(a)); removeArmy(a.id); }
      return false;
    } else {
      const atk = armyAsAtk(plan.battles[0]);
      removeArmy(plan.battles[0].id);
      pushLog(`敵 軍 抵 達：${atk.from} → ${atk.to}（敵 ${atk.et} 兵 對 我 ${atk.gt} 兵）`, 'atk');
      autosave();
      render();
      location.href = defendUrl(atk);
      return true;
    }
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
        // 兵團兵已經在 dispatchArmy() 時離開出發城，必須把數字帶進編成頁：
        // 沒有 ?troops= 時 deploy.html 會認不出兵團入口（它在 removeArmy 之後才載入，
        // 「找 save.armies 裡已抵達的兵團」那條兜底也失效），退回 city 模式拿城裡
        // 剩下的兵 —— 表現就是「部隊明明帶了 N 兵，出戰只有守軍殘兵」。
        q.set('troops', String(Math.max(0, Math.trunc(Number(a.troops) || 0))));
        // 主將用兵團自己那名（dispatchArmy 存的 a.general），別讓編成頁重挑一個
        const leader = (a.general || (mine && mine.name) || '').trim();
        if (leader) q.set('a', leader);
        const offs = (Array.isArray(a.officers) ? a.officers : []).filter(Boolean);
        if (offs.length) q.set('officers', offs.join(','));
        // R75/R78：敵軍兵力/等級用同一個 enemySetup 算好再透傳（deploy 只讀 ?bsoldiers=/?blevel=）
        const enemy = enemySetup(a.to, a.troops);
        q.set('bsoldiers', String(enemy.enemyTroops));
        q.set('blevel', String(enemy.enemyLevel));
        // R95（project/185 C）：軍師隨部隊進編成頁。deploy.html:424 讀 ?wise=（seq），但 :548 會用
        // 「編成頁主將」的 WISESKILL 重新過濾一遍，軍師的招不在主將技能表裡就被清零 —— 這是
        // deploy.html 的既有限制（本任務禁改），所以 ?advisor= 只當資訊一併傳，真正的生效接點
        // 是上面 encounterUrl 的 ?wise=（直連 index.html，main.js:703 開戰前套用）。
        const advisorName = armyAdvisorOf(a);
        if (advisorName) {
          q.set('advisor', advisorName);
          const seq = armyWiseSeq(advisorName);
          if (seq) q.set('wise', String(seq));
        }
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
          // R86 S2-4：開機時 loadStore 回報的版本升級（有值就代表「已寫回 + 已提示一次」）
          bootUpgrades,
          // R86 S2-2：裝備接線自檢（頁面存檔 → 存檔 equip 欄 → 戰鬥/地圖數值）
          equip: (() => {
            const n = save.monarch || mine0;
            const bag = readBagStore();
            const bagEq = Items.normalizeBagEquip(bag && bag.equip);
            return {
              who: n,
              slots: n ? equipNamesOf(n) : null,
              stats: n ? statsOf(null, n) : null,
              savedNames: Object.keys(save.equip || {}).length,
              bagNames: Object.keys(bagEq).length,
            };
          })(),
          // R86 S1-1：戰報裡最近的抵達/佔領/路過三行（「不進戰鬥」要看得到）
          arrivals: (save.log || []).filter((l) => /敵 軍 (佔 領|路 過|抵 達)/.test(String(l && l.s || ''))).slice(-3),
          armies: (save.armies || []).length,
        };
      })(),
    }, null, 2);
  } catch (e) {
    el.textContent = 'probe failed: ' + (e && (e.stack || e.message) || e);
  }
}

// ---------------------------------------------------------------- R7 年度結算（每年正月）
/**
 * R7：年進位 → 年度結算。原作 `0x4238AF`（`docs/04c_世界与内政.md:57-79`、存档 +0x05E 见
 * `docs/07b_存档字段详解.md:111`）：
 *   `if ([0x4A64FC]==1) { [0x4BD390]++; call 0x423885; [0x4A64FC]=0; }`
 * 純賬目在 `saves.js:annualSettle()`（五段钩子的总账/城池/名册/战绩），页面只补两件它做不到的事：
 *   1. 段5 `0x423824`「勢力存亡複核」要讀 garrison/adj（`annualForceCheck`）；
 *   2. 戰報一行 + 落檔（`pushLog` 寫 `save.log`，autosave 會把它帶進槽）。
 * **不做的項**（粮草/治安/年龄/老死）在 `saves.js` 同一段註釋里逐条写了依据缺失，不是漏做。
 */
function annualYearRollover() {
  save.yearFlag = 1;                      // [0x4A64FC] 置 1：這一回合要跨年（07b:111）
  const res = Saves.annualSettle(save, { ts: Date.now() });
  if (!res.ok) { save.yearFlag = 0; return null; }
  const leftover = annualForceCheck();    // 段5：只讀巡檢；真的判滅亡仍走 R78 的月推進
  if (leftover.length) {
    pushLog(`年 度 復 核：${leftover.length} 個勢力已無城（R78 未收尾：${leftover.join('、')}）`, 'lost');
  }
  pushLog(res.text, 'info');
  return res.record;
}

/** 段5 用的**只讀**巡檢：勢力表裡「還活著但一座城都沒有」的 id（不寫檔、不判滅亡） */
function annualForceCheck() {
  const out = [];
  const forces = save.forces && typeof save.forces === 'object' ? save.forces : {};
  for (const [id, f] of Object.entries(forces)) {
    if (!f || f.alive === false) continue;
    if (!forceCities(id).length) out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------- R56 戰後武將處置（web 接線）
/**
 * R56 + R85 + R208：把 main.js 打完仗寫回的結果接到武將處置上。
 *
 * **胜者才有处置权**（原作 `0x491D8C "抓到敵將，如何處理?"` 是胜者的战后结算面板）：
 *   · 我方胜 → 逐将询问**敌方**战俘（招降 / 斩首 / 释放），玩家决策后由
 *     `core/roster.ts:applySurrender` 落到武将池（招降入城 / 斩首出池 / 释放回原势力）；
 *   · 我方败 → **不开面板**：我方被俘将交给敌方 AI，按 main.js 战斗页**已经判好的**结果处置
 *     （`captured` = 被劝降、`executed` = 被斩首、`dead` = 阵亡、其余 = 释放），不重新掷骰；
 *     每人一条战报日志，然后直接回大地图（见 `aiDisposeCaptives()`）；
 *   · 君主（`0x40975E`）→ 只出一张"逃走"卡，不给按钮；
 *   · 释放（R103）→ 我方胜时玩家选"释放"：从**我方**各城名单摘掉 + `roster._moved[name]='釋放'`；
 *   · 空列表不弹：没俘虏（或只打死了守将）就直接回大地图，不留空面板。
 *
 * 胜负信号优先读 `save.lastBattle`（main.js `writeBackCampaign()` 战后写回，契约见
 * `roster.ts:readBattleOutcome`）；旧档没有它时用 `decideBattleWon()` 兜底
 * （城丢了 / 俘将里有我方明确在職的人 → 我方败）。
 */
function settleBattleReturn() {
  if (!save) return null;
  surBattleReal = false;
  const king = String(save.monarch || save.king || '');
  const outcome = readBattleOutcome(save);
  const own = new Set(ourForceNames(save));
  if (king) own.add(king);

  const last = typeof save.last === 'string' && save.cities[save.last] ? save.last : '';
  const bCity = outcome && outcome.city && save.cities[outcome.city] ? outcome.city : '';
  const home = bCity || last || (Array.isArray(save.owned) ? save.owned[0] : '') || '';
  if (!home) return null;

  // 同一场战斗只处置一次：刷新 / 回跳到夹着 lastBattle 的存档时不能重复劝降、重复记战报
  if (outcome && outcome.ts > 0 && save.lastPost && save.lastPost.ai === true
    && Saves.num(save.lastPost.battleTs) === outcome.ts) return null;

  const won = decideBattleWon(save, outcome);
  if (!won) return aiDisposeCaptives({ outcome, home, king });

  // —— 我方胜：只处置**敌方**战俘 ——
  // 先把"我方自己人"从待决队列里摘掉（脏档 / 混合战俘防御），再出卡；出卡后还要按 mine 硬过滤
  // 一次：我方将绝不允许出现在自己的处置面板里（用户报的 P0 根因就是守城丢城后我方将漏成"敌俘"）。
  const pending = strNames(save.captured).filter((n) => n !== king);
  const doomed = strNames(save.executed).filter((n) => n !== king);
  const oursHeld = uniqNames(pending.concat(doomed).filter((n) => own.has(n)));
  if (oursHeld.length) {
    const drop = new Set(oursHeld);
    save.captured = pending.filter((n) => !drop.has(n));
    save.executed = doomed.filter((n) => !drop.has(n));
    pushLog(`戰 報：（我方）${oursHeld.join('、')} 被敵軍俘去，本城名單不變`, 'lost');
  }
  if (!strNames(save.captured).length && !strNames(save.executed).length) {
    save.lastPost = null;
    return null;
  }

  const cards = surrenderCandidates(save, GDATA, {
    atCity: garrisonNames(home).concat(probeKingNames()),   // probeKingNames：?surking= 驗收用
    mine: Array.from(own),
    king,
    won,                                                   // 胜者门（这里恒为 true，跟着信号走）
  }).filter((c) => c && typeof c.name === 'string' && !own.has(c.name));
  if (!needSurrenderPanel(cards, { won })) { save.lastPost = null; return null; }   // 空列表不弹
  // R196：這一批俘虜是「這一仗」的產物（`save.captured`/`executed` 由 main.js 戰後寫回）→ 面板要算本戰 1 敗；
  // 驗收探針（`?sur=`）只是種名單，沒有戰鬥 → 不記。
  surBattleReal = !surProbeOn();
  openSurrenderSheet(cards, home);
  return null;   // 还没落库：等玩家点完（finishSurrender 才写 roster/lastPost）
}

/**
 * 我方战败时的战后处置：**敌方 AI** 处置我方被俘将（胜者才有处置权，玩家不参与）。
 *
 * 沿用战斗页已判结果、**不重新掷骰**（`roster.ts:planAiDisposal`）：`captured`/`joined` = 被敌劝降
 * （转投敌营）、`executed` = 被敌斩首（出池）、`dead` = 阵亡、其余 = 释放（名单不动）。处置完把
 * 名字从 `save.captured` / `save.executed`（待决队列）摘掉，否则下次回大地图会重复处理。
 *
 * 幂等：`lastPost.ai === true && lastPost.battleTs === lastBattle.ts` 时，上一节的
 * `settleBattleReturn` 直接返回，不再走这里。
 */
function aiDisposeCaptives({ outcome, home, king }) {
  const joined = uniqNames(strNames(save.captured).concat(outcome ? outcome.captured : []))
    .filter((n) => n !== king);
  const executed = uniqNames(strNames(save.executed).concat(outcome ? outcome.executed : []))
    .filter((n) => n !== king);
  const fallen = uniqNames(outcome ? outcome.dead : []);
  const plan = planAiDisposal({ captured: joined, executed, dead: fallen, king });
  if (!plan.length) { save.lastPost = null; return null; }

  const res = applyAiDisposal(save, plan);
  const disposed = new Set(plan.map((e) => e.name));
  save.captured = strNames(save.captured).filter((n) => !disposed.has(n));
  save.executed = strNames(save.executed).filter((n) => !disposed.has(n));

  const verdict = {
    recruit: '勸降，已轉投敵營',
    execute: '斬首',
    dead: '所殺，陣亡',
    release: '釋放，已回本城',
  };
  const real = !surProbeOn();
  for (const e of plan) {
    pushLog(`戰 報：（我方）${e.name} 被敵軍${verdict[e.action] || '處置'}`, 'lost');
    // R196：被俘 ⇒ 该将这一战是败场（与胜方面板的记法一致；探针不记，不编数）
    if (real) {
      try { Saves.noteGeneralResult(save, e.name, false); } catch (err) { console.warn('戰績落賬失敗', e.name, err); }
    }
  }
  save.lastPost = {
    city: home,
    joined: [],                                             // 我方这一战没有招降任何人
    dead: res.executed.concat(res.dead),                    // 战报的"殁"：被斩 + 阵亡
    joinedAll: [],
    deadAll: plan.filter((e) => e.action !== 'recruit').map((e) => e.name),
    escaped: [],
    released: res.released,
    rejected: [],
    month: Saves.num(save.month),
    ts: Saves.num(save.ts),
    ai: true,                                               // 这局的处置者是敌方 AI（不是玩家）
    battleTs: outcome ? outcome.ts : 0,                     // 与 lastBattle.ts 对齐 → 幂等标记
    aiRecruited: res.recruited,
    aiReleased: res.released,
  };
  autosave();
  render();
  const bits = [];
  if (res.recruited.length) bits.push(`勸降 ${res.recruited.length}`);
  if (res.executed.length) bits.push(`斬首 ${res.executed.length}`);
  if (res.dead.length) bits.push(`陣亡 ${res.dead.length}`);
  if (res.released.length) bits.push(`釋放 ${res.released.length}`);
  notice(bits.length ? `我軍戰敗：敵軍處置我軍俘將（${bits.join(' · ')}）` : '我軍戰敗：敵軍處置我軍俘將');
  return null;
}

// ---------------------------------------------------------------- R85 逐將招降 / 斬首 / 釋放面板
// 一张将一张卡：头像（face_map.js 的 400 张原作 FACE）+ 武/智/忠誠/義理 + 档位徽章 + 理由，
// 右侧「招 降」「斬 首」「釋 放」三颗按钮；君主行只有「逃 走」。底部三颗批量键（避免 10 个将点 30 下）。
// 面板**关不掉**（没有 .x、没有 data-close、scrim 点击被挡住）：没决策完不进大地图。
// 釋 放（R103）= 原作 0x491DF4：status=2「安全歸來」，回原势力，不进我方也不进斩首池。

/** 面板状态：`{ cards, home, picks }`；`null` = 面板没开 */
let surState = null;
const SUR_PICK_TEXT = { recruit: '已 招 降', kill: '已 斬 首', escape: '已 放 走', release: '已 釋 放' };
const SUR_TIER_CLS = { must: 'must', roll: 'roll', refuse: 'refuse' };

/** 存档里的名字数组（main.js 写回的是 `string[]`，脏档一律当空） */
function strNames(v) {
  return Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n) : [];
}

/** 该城守将名（garrison.json 真值；君主"逃走"那一行就从这里找） */
function garrisonNames(city) {
  const g = garrisonIn(city);
  const offs = g && Array.isArray(g.officers) ? g.officers : [];
  return offs
    .map((o) => (o && typeof o === 'object' ? o.name : o))
    .filter((n) => typeof n === 'string' && n);
}

/** 名字数组去重（保序）；战报/待决队列用 */
function uniqNames(list) {
  const out = [];
  const seen = new Set();
  for (const raw of (Array.isArray(list) ? list : [])) {
    const n = typeof raw === 'string' ? raw : '';
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * 验收参数（截图/演练用，不碰正常玩法：不带这些参数时本函数第一行就 return false）：
 *   `?sur=名1,名2` 种 `save.captured`（模拟"战斗页预判招降成功"）
 *   `?surdead=名`  种 `save.executed`（模拟"预判失败后被斩"）
 *   `?surking=名`  塞一张君主"逃走"卡（剧本君主名）
 *   `?surstart=君主名` + `?surscen=N` 全新 profile 也能真开一局（调 startNewGame，和玩家点选一样）
 *   `?surall=recruit|kill|release` 面板一开就自動按對應批量鍵
 *   `?surafter=1`  處理完自動停在"這城的武将池"（rosterOf 列表，看到降将入城 / 釋放的已不在名單）
 *   R196（招降字段真值截图用，種的是**存檔的同一個鍵**、不是顯示層）：
 *   `?surmor=名:值[,...]`   種 `save.morale`（等同 main.js:972 戰後對主將的回寫）
 *   `?surtire=名:值[,...]`  種 `save.tire`（等同 main.js:955 戰後對主將的回寫）
 *   `?surrec=名:勝:敗[,...]` 種 `save.generalRecord`（等同本局已經打過的按將戰績）
 */
/**
 * R196 驗收：把「戰後才會有」的真值種進存檔的同名鍵（不是改 `surFields` 的顯示邏輯：
 * 有值就顯示、沒有仍是「—」）。只在 `seedSurrenderProbe()` 已經種過俘虜名單後才跑。
 */
function seedSurFieldsProbe() {
  const items = (raw) => String(raw || '').split(/[,、;]+/).map((x) => x.trim()).filter(Boolean);
  for (const item of items(qs.get('surmor'))) {
    const [nm, val] = item.split(':');
    if (!nm || !nm.trim() || !Number.isFinite(Number(val))) continue;
    try { moraleSet(save, nm.trim(), Number(val)); } catch (err) { console.warn('surmor 種值失敗', nm, err); }
  }
  for (const item of items(qs.get('surtire'))) {
    const [nm, val] = item.split(':');
    if (!nm || !nm.trim() || !Number.isFinite(Number(val))) continue;
    try {
      const map = tireNormalize(save && save.tire);
      map[nm.trim()] = tireClamp(Number(val));
      if (save && typeof save === 'object') save.tire = map;
    } catch (err) { console.warn('surtire 種值失敗', nm, err); }
  }
  for (const item of items(qs.get('surrec'))) {
    const [nm, w, l] = item.split(':');
    if (!nm || !nm.trim()) continue;
    try {
      const all = Saves.normalizeGeneralRecord(save && save.generalRecord);
      all[nm.trim()] = {
        w: Saves.intOr(w === undefined || w === '' ? 0 : Number(w), 0, 0, Saves.GENERAL_RECORD_MAX),
        l: Saves.intOr(l === undefined || l === '' ? 0 : Number(l), 0, 0, Saves.GENERAL_RECORD_MAX),
      };
      if (save && typeof save === 'object') save.generalRecord = all;
    } catch (err) { console.warn('surrec 種值失敗', nm, err); }
  }
}

function seedSurrenderProbe() {
  const cap = qs.get('sur');
  const killed = qs.get('surdead');
  const start = qs.get('surstart') || '';
  if (!cap && !killed && !start) return false;
  const split = (s) => String(s || '').split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean);
  const capList = split(cap);
  const deadList = split(killed);
  // 全新 profile：頁面只鋪了背景預覽（gameStarted=false、owned 空）→ 真開一局，否則結算那段走不到
  if (!gameStarted) {
    if (start) {
      const idx = Number(qs.get('surscen'));
      startNewGame(Number.isFinite(idx) && idx >= 0 ? idx : 0, start);
    } else {
      gameStarted = true;
    }
  }
  if (!capList.length && !deadList.length) return false;
  save.captured = capList;      // startNewGame 會換掉 save，所以種名單必須放在它後面
  save.executed = deadList;
  if (!save.last || !save.cities[save.last]) {
    save.last = Array.isArray(save.owned) && save.owned.length ? save.owned[0] : '';
  }
  seedSurFieldsProbe();         // R196：只在這個探針路徑上種士氣/疲勞/戰績的真值
  return true;
}

/** `?surking=名`：验收用——把剧本君主名塞进"该城守将"里，好让面板出一张"逃走"卡截图 */
function probeKingNames() {
  const raw = qs.get('surking');
  if (!raw) return [];
  return String(raw).split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean);
}

function surEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/** R196：驗收探針（`?sur=` / `?surdead=` / `?surstart=`）是否生效——生效時俘虜名單是種進去的，沒有真打過。 */
function surProbeOn() {
  try { return SUR_PROBE === true; } catch { return false; }   // SUR_PROBE 在檔尾才宣告，TDZ 期間當作「沒有探針」
}

/** R196：這張面板是不是「真打過一場」的收尾（`?sur=` 等驗收探針沒有戰鬥 → false：不記戰績、也不加本戰那 1 敗）。 */
let surBattleReal = false;

/** 十項欄位各自的原作來源（R196 考證，反彙編位址與文件行號見 `project/196_招降字段真值.md`）：
 *  原作 09:10 俘虜處理面板從**被俘武將的 General 記錄**逐行讀（基址 `[0x4a80a4]`，0x44E87B 從俘虜表取）：
 *   · 忠誠 `0x44F0ED movsx [g+0x3C]`、等級 `0x44F16A [g+0x2E]`、武力 `0x44F1A7 [g+0x34]`、
 *     智力 `0x44F1E5 [g+0x36]`、武器 `0x44F29D [g+0x9B]`、馬匹 `0x44F2E6 [g+0x99]`、物品 `0x44F32F [g+0x9D]`
 *   · 士氣 `0x44F222 movsx eax, word [g+0x38]` → `0x491E50 "士氣   %d"`；
 *     疲勞 `0x44F25F movsx ecx, word [g+0x3A]` → `0x491E5C "疲勞度   %d"`
 *   · 勝場 `0x44F3BE movsx eax, word [g+0x9F]` → `0x491E9C "勝場數   %d"`；
 *     敗場 `0x44F3FE movsx ecx, word [g+0xA1]` → `0x491EA8 "敗場數   %d"`
 *  **这四项在 1 代原作里都是按将持久化的存档字段**（士氣 → 段4 +0x58、疲勞 → 段4 +0x5A、
 *  勝 → 段4 +0xC7、敗 → 段4 +0xC9；docs/07b_存档字段详解.md:301-303 / :325-326，写档 `0x431A81`、
 *  读档 `0x433493`），不是只活在战场里的临时值 —— 战场 unit 的 +0x2C 只是开打时从 g+0x38 复制过去的
 *  副本（docs/04b_战斗系统.md:85），战后主将再写回 g+0x38（:498-499）。
 *
 * 本作的等价物与「为什么还会是 —」：
 *  · 士氣 / 疲勞：`save.morale` / `save.tire`（`moraleNormalize` :720 / `tireNormalize` :628）。战后回写只在
 *    main.js:953-957（`save.tire[aName]/[bName]`）与 :968-975（`moraleSet`）里对**双方主将**做，
 *    非主将俘虏在表里没有条目 → 不能拿 `moraleOf` 的缺省 60 冒充真值，保持「—」；
 *  · 勝場數 / 敗場數：存檔可選鍵 `save.generalRecord`（`saves.js` 的 `generalRecordOf`，v3 可选字段、
 *    旧档缺字段返回 null）。没有记录 = 「—」；本战被俘的那一败算在「本次戰績」里（`surBattleReal` 才 +1）。
 *  純字串拼 HTML（呼叫端已對 name 做過 surEsc），回傳值直接塞進 `.fld` 容器。 */
function surFields(c) {
  const name = c.name;
  const hasKey = (map) => {
    try { return !!map && Object.prototype.hasOwnProperty.call(map, name); } catch { return false; }
  };
  const tireMap = (() => { try { return tireNormalize(save && save.tire); } catch { return null; } })();
  const morMap = (() => { try { return moraleNormalize(save && save.morale); } catch { return null; } })();
  const eq = (() => { try { return equipNamesOf(name) || {}; } catch { return {}; } })();
  const row = (() => { try { return generalRow(name) || {}; } catch { return {}; } })();
  const lv = (() => { try { return generalLevelOf(name); } catch { return null; } })();
  const text = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return (s && s !== '---' && s !== '—') ? s : null;
  };
  const int = (v) => (Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : null);
  // R196：按将战绩（存档可选键）。缺字段 → null → 「—」，不编 0 勝 0 敗。
  const rec = (() => { try { return Saves.generalRecordOf(save, name); } catch { return null; } })();
  const cells = [
    ['等級', int(lv)],
    ['士氣', hasKey(morMap) ? int(morMap[name]) : null],
    ['疲勞', hasKey(tireMap) ? int(tireMap[name]) : null],
    ['武力', int(c.str)],
    ['智力', int(c.int)],
    ['忠誠', int(c.loyal) || int(row.Loyal)],
    ['武器', text(eq.weapon) || text(row.Weapon)],
    ['物品', text(eq.book) || text(eq.amulet) || text(row.Thing)],
    ['勝場數', null],
    ['敗場數', null],
  ];
  // 上面兩行的 null 是「沒有記錄」的預設（灰「—」），tests/hud_surrender191.test.ts:79-80 靜態斷言它們存在，
  // 語義也仍然是「拿不到 → 灰 —」。有記錄（或這一戰剛輸）才把真值覆蓋進去：
  //   勝場 = 存檔裡的 w（本作沒有任何可證的「我方某將贏了」落账站点，见 project/196 §没做到）；
  //   敗場 = 存檔裡的 l + 本戰（只有真打過一場、被俘的面板才算，?sur= 探針不算）。
  const lossNow = surBattleReal ? 1 : 0;
  const put = (key, value) => {
    const at = cells.findIndex(([k]) => k === key);
    if (at >= 0) cells[at][1] = value == null ? null : int(value);
  };
  put('勝場數', rec ? rec.w : null);
  put('敗場數', (rec || lossNow) ? (rec ? rec.l : 0) + lossNow : null);
  return cells.map(([k, v]) => `<span class="fv"><span class="k">${k}</span>`
    + `<b${v == null ? ' class="none"' : ''}>${v == null ? '—' : surEsc(v)}</b></span>`).join('');
}

function surCardHtml(c, pick) {
  const url = window.SG && typeof window.SG.portraitUrl === 'function'
    ? window.SG.portraitUrl(c.name, 'full')
    : '';
  const cls = c.isKing ? 'king' : (SUR_TIER_CLS[c.tier] || 'refuse');
  const face = url
    ? `<div class="face"><img src="${surEsc(url)}" alt="" loading="lazy"></div>`
    : '<div class="face"></div>';
  let right;
  if (pick) {
    right = `<div class="picked ${pick}">${SUR_PICK_TEXT[pick] || ''}</div>`;
  } else if (c.isKing) {
    right = '<div class="picked escape">逃 走</div>';
  } else {
    // 191：原作按鈕列順序 釋放 → 斬首 → 看押（`work/bili_battle/clean_0910.png`，188 §10）。
    // 第三檔「看押」本作沒有關押狀態（見 project/191 §B [新設計]），保留現有語義「招降」放在第三位。
    right = `<div class="sgbtns">
        <button type="button" data-sur="release">釋 放</button>
        <button type="button" data-sur="kill">斬 首</button>
        <button type="button" data-sur="recruit"${c.recruitable ? '' : ' disabled'}
          title="原作第三檔是「看押」（關押狀態）；本作沒有關押狀態，[新設計] 保留第三檔為招降">招 降</button>
      </div>`;
  }
  return `<div class="sgen${pick ? ' done' : ''}" data-name="${surEsc(c.name)}">
    ${face}
    <div class="info">
      <div class="nm">${surEsc(c.name)}<span class="tier ${cls}">${surEsc(c.tierText)}</span></div>
      <div class="fld">${surFields(c)}</div>
      <div class="rs">${surEsc(c.reason)}</div>
    </div>
    ${right}
  </div>`;
}

/** 我方主將立繪（原作 09:10 面板右側是我方那名武將的立繪，188 §10）：當前君主 → 頭像地圖，拿不到就留空。
 *  俘虜的立繪在每張卡左邊（`surCardHtml` 的 `.face`），兩者合起來就是原作的雙立繪。 */
function surLordFaceShow() {
  const box = $('surLordFace');
  if (!box) return;
  let name = '';
  try { name = String(MM.monarchOf(save) || ''); } catch { name = ''; }
  if (!name) name = String((save && (save.monarch || save.king)) || '');
  const url = name && window.SG && typeof window.SG.portraitUrl === 'function'
    ? window.SG.portraitUrl(name, 'full')
    : '';
  if (!url) { box.hidden = true; box.innerHTML = ''; return; }
  box.title = `我方主將 ${name}`;
  box.innerHTML = `<img src="${surEsc(url)}" alt="${surEsc(name)}" loading="lazy">`;
  box.hidden = false;
}

function renderSurrender() {
  const st = surState;
  if (!st) return;
  $('surCards').innerHTML = st.cards
    .map((c) => surCardHtml(c, st.picks[c.name] || ''))
    .join('');
  const left = st.cards.filter((c) => !st.picks[c.name]).length;
  $('surMsg').textContent = left
    ? `剩 ${left} 位待決：招降進 ${st.home}，斬首出池永不復活，釋放回原勢力`
    : '處理完畢';
  $('surAllRecruit').disabled = !left;
  $('surAllKill').disabled = !left;
  $('surAllRelease').disabled = !left;
}

function openSurrenderSheet(cards, home) {
  surState = { cards, home, picks: {} };
  $('surSub').textContent = `逐將詢問：招降的進 ${home} 武將池，斬首的出池永不復活，釋放的放回原勢力`;
  surLordFaceShow();
  renderSurrender();
  openSheet('surrenderSheet');
  const auto = qs.get('surall');
  if (auto === 'recruit' || auto === 'kill' || auto === 'release') setTimeout(() => bulkSurrender(auto), 40);
  return surState;
}

function decideSurrender(name, act) {
  if (!surState || !name || !act) return;
  surState.picks[name] = act;
  renderSurrender();
  if (surState.cards.every((c) => surState.picks[c.name])) finishSurrender();
}

function bulkSurrender(mode) {
  if (!surState) return;
  for (const c of surState.cards) {
    if (surState.picks[c.name]) continue;
    // 君主永远只能「逃走」；其余按批量档位：招降（降不了就放走）/ 斩首 / 释放
    surState.picks[c.name] = c.isKing
      ? 'escape'
      : (mode === 'recruit' ? (c.recruitable ? 'recruit' : 'escape') : (mode === 'release' ? 'release' : 'kill'));
  }
  renderSurrender();
  finishSurrender();
}

/** 玩家决策落库：走 roster.ts 的 applySurrender（招降入城 / 斩首出池 / 释放回原势力 / 君主放走），再存档渲染 */
function finishSurrender() {
  const st = surState;
  if (!st) return null;
  surState = null;
  let res = { recruited: [], killed: [], removed: [], escaped: [], released: [], rejected: [], cleared: [] };
  try {
    res = applySurrender(save, st.cards, st.picks, st.home);
  } catch (err) {
    console.warn('戰後招降結算失敗（不影響存檔）', err);
  }
  const picked = (act) => st.cards.filter((c) => st.picks[c.name] === act).map((c) => c.name);
  save.lastPost = {
    city: st.home,
    joined: res.recruited,
    dead: res.removed,
    joinedAll: picked('recruit'),
    deadAll: res.killed,
    escaped: res.escaped,
    released: res.released,
    rejected: res.rejected,
    month: Saves.num(save.month),
    ts: Saves.num(save.ts),
  };
  if (res.recruited.length) pushLog(`戰 後 處 置：招降 ${res.recruited.join('、')} 入 ${st.home}`, 'win');
  // R196：這一仗的敗場落賬。原作在戰鬥結束時就給參戰將 +1（累加函數 `0x4084C9` 的 kind==-1 分支
  // `0x408539/40/47 [g+0xA1]++`），所以面板讀到的已是加過的值；本作在「戰後處置」這一步補記。
  // 被俘 ⇒ 該將這一戰敗（招降 / 斬首 / 釋放 / 君主逃走都算）。驗收探針（`?sur=`）沒打過仗 → 不記，不編數。
  if (surBattleReal) {
    const noted = [];
    for (const c of st.cards) {
      try {
        if (Saves.noteGeneralResult(save, c.name, false)) noted.push(c.name);
      } catch (err) { console.warn('戰績落賬失敗', c.name, err); }
    }
    if (noted.length) pushLog(`戰 績：${noted.join('、')} 敗場 +1`, 'info');
  }
  if (res.killed.length) pushLog(`戰 後 處 置：斬首 ${res.killed.join('、')}（出池，永不復活）`, 'lost');
  if (res.released.length) pushLog(`釋放：${res.released.join('、')}（${res.released.length} 人）`, 'info');
  if (res.rejected.length) pushLog(`拒 降（硬門）：${res.rejected.join('、')} 只放走，不入池`, 'info');
  if (res.escaped.length) pushLog(`戰 後 處 置：放走 ${res.escaped.join('、')}`, 'info');

  hideSheets();
  autosave();
  render();
  const bits = [];
  if (res.recruited.length) bits.push(`招降 ${res.recruited.length}`);
  if (res.killed.length) bits.push(`斬首 ${res.killed.length}`);
  if (res.released.length) bits.push(`釋放 ${res.released.length}`);
  if (res.escaped.length) bits.push(`放走 ${res.escaped.length}`);
  notice(bits.length ? `戰 後 處 置完成：${bits.join(' · ')}` : '戰 後 處 置完成');
  if (qs.get('surafter') === '1') {
    // 驗收：處理完直接停在「這座城的武將池」，一眼看到剛招降的將已經在名單裡（含忠誠），
    // 以及剛釋放的將已經不在名單裡（R103）
    setTimeout(() => {
      try {
        openCityRosterSheet(st.home, res.recruited, res.released);
      } catch (err) { console.warn('surafter 打開城池武將列表失敗', err); }
    }, 60);
  }
  return res;
}

/**
 * 城池武將列表（驗收視圖，只在 ?surafter=1 時調用）：借用「勢力明細」那塊浮層殼（#forceSheet）。
 * 名單必須問 `city_model.rosterOf(save, city)` —— 那是 `save.roster[城]` + `roster._moved` 的唯一真源；
 * 勢力明細走的是 `garrison.json` 的守將表（officersByCityAll），剛招降的將不在裡面，所以另開這一檔。
 */
function openCityRosterSheet(city, added, released) {
  const list = (() => {
    try {
      return CM.rosterOf(save, city, { scenIdx: currentScenarioIdx(), generals: GDATA.generals }) || [];
    } catch (err) { console.warn('rosterOf 失敗', err); return []; }
  })();
  const names = list.map((x) => (x && typeof x === 'object' ? x.NAME : x)).filter(Boolean);
  const gain = Array.isArray(added) ? added : [];
  const gone = Array.isArray(released) ? released : [];
  $('forceTtl').textContent = `城 池 · ${city}`;
  $('forceSub').textContent = `武將 ${names.length} 人${gain.length ? ` · 本次招降入城：${gain.join('、')}` : ''}${gone.length ? ` · 本次釋放（已不在名單）：${gone.join('、')}` : ''}`;
  $('btnForceBack').hidden = true;
  $('forceRows').innerHTML = names.map((n) => {
    const row = generalRow(n) || {};
    const raw = save.loyal && Number.isFinite(Number(save.loyal[n])) ? Number(save.loyal[n]) : NaN;
    const loyal = Number.isFinite(raw) ? raw : (Number(row.Loyal) || 50);
    const isNew = gain.indexOf(n) >= 0;
    return `<div class="scard${isNew ? ' on' : ''}">
      <div class="scn">${surEsc(n)}${isNew ? ' · 降 將' : ''}</div>
      <div class="scm">武 ${Number(row.STR) || '—'} · 智 ${Number(row.INT) || '—'} · 忠誠 ${Math.round(loyal)}</div>
    </div>`;
  }).join('') || '<div class="scard"><div class="scm">這座城沒有武將</div></div>';
  $('forceFoot').textContent = `城池武將池（rosterOf）· 本次招降的標「降 將」${gone.length ? ' · 釋放的已回原勢力、不在這張名單' : ''}`;
  openSheet('forceSheet');
}

$('surCards').addEventListener('click', (ev) => {
  const btn = ev.target && ev.target.closest ? ev.target.closest('[data-sur]') : null;
  if (!btn || btn.disabled) return;
  const card = btn.closest('.sgen');
  if (card) decideSurrender(card.dataset.name, btn.dataset.sur);
});
$('surAllRecruit').addEventListener('click', () => bulkSurrender('recruit'));
$('surAllKill').addEventListener('click', () => bulkSurrender('kill'));
$('surAllRelease').addEventListener('click', () => bulkSurrender('release'));

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
    // R7：進入正月 = 年進位（0x4238AF 消費 [0x4A64FC]）→ 年度結算。
    // 排在本年稅收之前：上一年先結賬，本年歲入才不會被算進上一年。
    if (Saves.isYearStart(save.month)) annualYearRollover();
    // R15 金錢（原作已定位）：**沒有月度收入、沒有月度複利、沒有俸祿**。
    // 唯一產出口是年度稅收 0x423824（由年度結算 0x423885 呼叫）：
    //   city.money(+0x92) += (pop(+0x8A) * 75) / 10000 + 2250；跳過 0x405499(city) 為真的城。
    // 唯一消耗口是 0x41AF58 的補兵（100 金 → 1 預備兵），不是「每月固定支出」。
    // 舊碼的 `money*1.01+20` 與「武將數×3 俸祿」都是自訂，已刪（見 project\108 黃燈九行收口）。
    const yearStart = Saves.isYearStart(save.month);
    let income = 0;
    for (const name of save.owned) {
      const st = save.cities[name];
      const def = ALL.find((c) => c.NAME === name);
      if (yearStart && def && !CM.isGate(def)) {
        const tax = CM.annualTax(st.pop);
        st.money = Saves.num(st.money) + tax;
        income += tax;
      }
      // 人口自然增長：原作 .text 找不到「每城每月 +N%」這種公式（04c §7-4 明寫未定位），
      // 原作的人口只會由「開發」與兩處衰減事件（0x40F607 / 0x40F727，觸發語義 [推測]）改變。
      // 早先這裡有一行「每城人口 ×1.01」的自訂近似，六十個月會把人口吹到 1.8 倍，
      // 連帶把年稅（pop×75/10000）與兵力上限一起偏離，故移除；衰減事件尚未實作，見 project\31 §一之補13。

    }
    if (income) {
      // [F16] 錢只認每城 `money(+0x92)`：上面那一圈已經把稅收加進「各城的」st.money，
      // 國庫 = Σ 每城 money（`CM.nationalGold()`）。舊碼這裡還有一行 `save.gold += income`
      // 把同一筆錢再加進單一錢包 → 同屏兩個數、兩套扣款口徑（差異清單 F16 行 125）。已刪。
      pushLog(`歲 入：+${income} 金（正月 · ${save.owned.length} 城 · 每城 人口×75/10000 + 2250）`, 'info');
    }
    Saves.ledgerAdd(save, { income, months: 1 });

    // [F14] 守軍「每月白補 2%」已刪。原作換月**不補守軍**：兵只有三個來源 ——
    //   城內「部隊徵兵」把預備兵換成兵（`city_model.enlist`）、出征帶回的倖存兵
    //   （deploy/main 寫回）、以及 AI 的 ACT 補兵；守軍自然回補在 210 規格與內政指南裡都沒有。
    //   舊碼（每月按上限 2% 補到滿）會讓每座城每月憑空漲兵，
    //   與「100 金 → 1 預備兵 → 1 兵」的經濟鏈重複發兵（差異表 F14）。

    // 內政代行（R10，`web/city_model.js` `autonomyTick`）：換月 lazy tick ——
    //   · **錢變兵（F13）**：每城 `n = min(floor(金/100), 預備兵上限-現值)`，金 -n*100、預備兵 +n，
    //     直到錢花光或兵滿（原作：城里每 100 金钱 = 1 预备兵，随时间自动转换）；
    //   · 玩家在城內政頁標了「自治」的城各做一次開發（`save.auto`，`runAutonomy`）。
    // AI 城不標自治（那會花玩家國庫），所以對敵方勢力只生效「錢變兵」這半；
    // AI 的內政動作仍走 R73 的 ACT=1 補金 / ACT=6 cheat（原作 ACT 表 9 項裡沒有「開發」）。
    // 與 R73/R74 不衝突：預備兵寫 `city.prep`，AI 出兵扣的是 `city.troops`（兩個池）。
    const tick = CM.autonomyTick(save, scenario.cities, { generals: GDATA.generals });
    if (tick && tick.auto && tick.auto.ok) pushLog(tick.auto.text, 'info');

    // R15：原作沒有俸祿（全 EXE 對 city+0x92 的寫點只有：裝載初始化 6 處、補兵 0x41AFA3、
    // 無太守清零 0x41B056、除錯 +10 0x41B084、年稅 0x42386D）。舊碼「武將數×3 金/月」是自訂，已刪；
    // 金錢唯一入帳點是正月年度結算第五段（`0x423824`，見 project/133 §2），月度既不收也不發。


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
      pushLog(`士 氣：低迷 ${morale.recovered} 人自然 +1`, 'info');
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

// R13：`?cmd=general|forces|endmonth` —— 內政三命令的可深鏈入口（city.html 的返回按鈕不帶參數，
// 所以城內只能用頁頭那三個入口；這裡留給外部頁面/截圖/驗收直接落到某條命令）。
const bootCmd = (qs.get('cmd') || '').toLowerCase();
if (gameStarted && bootCmd === 'general') openGeneralSheet();
else if (gameStarted && bootCmd === 'forces') openForceSheet();
else if (gameStarted && bootCmd === 'endmonth') endMonth();
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

// ?marchdemo=mid|arrive|three|station|block|advisor：給截圖/驗收用的行軍種子（沿用 ?demo=1 的調試思路）
function seedMarchDemo(kind) {
  if (!save || !gameStarted) return;
  const put = (side, from, to, progress, troops) => {
    const pi = marchPath(from, to);
    if (pi === null) return null;
    const leader = localGeneral(from)?.name;
    // R95：種子部隊也帶上隨軍名單（與正式入口同一套規則：上限 5、主將在前），軍師浮層才有東西可選
    const roster = (garrisonIn(from)?.officers || []).map((o) => o && o.name);
    const a = {
      id: nextArmyId(), side, from, to, pathIndex: pi, progress, troops,
      general: leader, reported: false,
      officers: armyRosterPick([], roster, leader),
      advisor: '',
      stationed: false,
    };
    save.armies.push(a);
    return a;
  };
  // 本城在冊武將（garrison.json 的靜態名冊，存檔不存這個）
  const rosterOf = (city) => (garrisonIn(city)?.officers || []).filter((o) => o && o.name);
  // 我方城 + 一座接壤的敵城（?marchdemo 的三個新種子都用這對，存檔不同也能挑到）
  // needOfficers：要求本城在冊武將至少幾人（軍師要 ≥2 人才有得挑）
  const pairOwnFoe = (needOfficers = 0) => {
    const own = (save.owned || []).find((n) => rosterOf(n).length >= needOfficers
      && [...(adj.get(n) || [])].some((x) => !save.owned.includes(x) && marchPath(x, n) !== null));
    if (!own) return null;
    const foe = [...(adj.get(own) || [])].find((x) => !save.owned.includes(x) && marchPath(x, own) !== null);
    return foe ? { own, foe } : null;
  };
  save.armies = [];
  save.log = [];   // 種子是截圖/驗收用的假局面，順手清掉上一輪 demo 留下的戰報，免得畫面重複
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
  } else if (kind === 'station') {
    // R95 截圖 02：我軍駐紮在路上（進度 50%），浮層開著 → 看得到「駐紮中：進度凍結」與「解除駐紮」
    const pf = pairOwnFoe();
    if (!pf) return;
    const a = put('A', pf.own, pf.foe, 0.5, 100);
    if (a) { a.stationed = true; selectArmy(a.id); }
  } else if (kind === 'block') {
    // R95 截圖 03：我軍駐紮，敵軍沿同一條道推進到接觸點被擋住（0.5 + 0.495 ≈ 1）。
    // 載入後 handleMarchEvents 會寫戰報 + notice（第一次接觸只提示，拖過一個月才開打）。
    const pf = pairOwnFoe();
    if (!pf) return;
    const sA = put('A', pf.own, pf.foe, 0.5, 100);
    if (sA) sA.stationed = true;
    put('B', pf.foe, pf.own, 1 - 0.5 - STATION_EPS, 120);
  } else if (kind === 'advisor') {
    // R95 截圖 04（§C3）：軍師浮層 —— 列出這支部隊的隨軍武將、各自的忠誠/智力與可用軍師技。
    // 刻意挑「本城在冊武將 ≥2」的城（軍師要 ≥2 人才有得挑）；整個存檔都找不到這種城時，
    // 才往名冊裡臨時補一個人：只動記憶體裡的 garrison 快取，不寫存檔，並在戰報裡標明「臨時注入」。
    let pf = pairOwnFoe(2);
    let injected = '';
    if (!pf) {
      pf = pairOwnFoe();
      if (!pf) return;
      const g = garrisonIn(pf.own);
      if (!g) return;
      const have = new Set(rosterOf(pf.own).map((o) => o.name));
      const cand = (GDATA.generals || []).map((r) => r?.NAME).find((n) => n && !have.has(n));
      if (!cand) return;
      g.officers = [...(g.officers || []), { name: cand, str: 62, int: 78, loyal: 70 }];
      injected = cand;
    }
    const a = put('A', pf.own, pf.foe, 0.5, 100);
    if (!a) return;
    if (injected) {
      a.officers = armyOfficerNames(rosterOf(pf.own).map((o) => o.name), a.general);
      pushLog(`[demo] ${pf.own} 名冊臨時注入 ${injected}（只改記憶體，不進存檔）`, 'info');
    }
    renderAdvisorSheet(a);
  } else if (kind === 'advisor1') {
    // R95 截圖 04b（§C1 灰的正當理由）：兵團裡只有主將一人 → 「任命軍師」灰，
    // 灰字是「軍團僅主將一人，無可任命」，不是「存檔沒欄位」。
    const pf = pairOwnFoe();
    if (!pf) return;
    const a = put('A', pf.own, pf.foe, 0.5, 100);
    if (!a) return;
    a.officers = a.general ? [a.general] : [];
    selectArmy(a.id);
  } else if (kind === 'lost') {
    // R86 S1-1 驗收（**只給 ?dev=1**）：重現「敵軍抵達時目標城已經不是我的」。
    // 挑一座我方城 + 一座接壤的敵城，把敵軍行軍直接擺到「已抵達」，然後把目標城從 owned
    // 摘掉、歸屬清空（模擬「城在敵軍抵達前先丟了」＝r86 宛 / 汝南 的現場）。
    // 正確行為：handleMarchEvents 只寫一條「敵 軍 佔 領…不進戰鬥」的戰報，不跳 defendUrl。
    if (!SGDev.DEV) return;
    const own = (save.owned || []).find((n) => [...(adj.get(n) || [])]
      .some((x) => !save.owned.includes(x) && marchPath(x, n) !== null));
    if (!own) return;
    const enemyCity = [...(adj.get(own) || [])].find((x) => !save.owned.includes(x) && marchPath(x, own) !== null);
    const a = put('B', enemyCity, own, 1, 120);
    if (!a) return;
    save.owned = save.owned.filter((n) => n !== own);
    if (save.cities?.[own]) save.cities[own].owner = '';
    pushLog(`[dev] 鋪路：${own} 在 ${enemyCity} 軍抵達前已失守（owned 已摘除、owner 清空）`, 'lost');
  }
  render();
}

const marchDemo = (qs.get('marchdemo') || '').toLowerCase();
if (marchDemo) seedMarchDemo(marchDemo);

// ?probe=station：把駐紮/軍師的狀態讀寫口掛到 window.__station（CDP 驗收用，只讀 + 手動推一步）。
// 注意 step() 只跑 advanceArmies（不跑 handleMarchEvents）：用來證明「駐紮中 progress 不動」，
// 不會因為撞上敵軍而跳戰鬥頁。
if (qs.get('probe') === 'station' && gameStarted) {
  const snap = (a) => ({
    id: a.id, side: a.side, from: a.from, to: a.to, progress: a.progress,
    troops: Saves.num(a.troops), general: a.general || '',
    officers: (a.officers || []).slice(), advisor: a.advisor || '',
    stationed: a.stationed === true,
  });
  window.__station = {
    state: () => (save.armies || []).map(snap),
    step: (n = 1) => {
      for (let i = 0; i < Math.max(1, Math.trunc(Number(n)) || 1); i++) advanceArmies(save.armies);
      render();
      return window.__station.state();
    },
    station: (id, on) => {
      const a = armyOf(id);
      if (!a) return false;
      a.stationed = on !== false;
      renderArmySheet(); render();
      return a.stationed;
    },
    select: (id) => { selectArmy(id); return Boolean(armyOf(id)); },
    advisorSheet: (id) => { const a = armyOf(id); if (!a) return false; renderAdvisorSheet(a); return true; },
    advisorRows: (id) => { const a = armyOf(id); return a ? armyAdvisorRows(a) : []; },
    setAdvisor: (id, name) => { const a = armyOf(id); return a ? armySetAdvisor(a, name) : false; },
    // 這支部隊當 A 方、bId 當 B 方時的開戰 URL（看 ?wise= / ?advisor= 有沒有真的傳出去）
    encounterUrl: (aId, bId) => encounterUrl(armyOf(aId), armyOf(bId)),
    standoff: () => {
      const s = stationStandoff(save.armies || []);
      return s ? { blocker: s.blocker.id, mover: s.mover.id } : null;
    },
  };
}

// ?probe=r7：把 R7 年度結算 / R56 戰後處置的落檔結果掛到 window.__r7（CDP 驗收用，只讀 + 推進口）
if (qs.get('probe') === 'r7' && gameStarted) {
  window.__r7 = {
    state: () => ({
      month: save.month, year: save.year, yearFlag: save.yearFlag,
      ledger: save.ledger, annual: save.annual, lastPost: save.lastPost,
      captured: save.captured, executed: save.executed,
      owned: Array.isArray(save.owned) ? save.owned.slice() : [],
      gold: save.gold, roster: save.roster, log: save.log,
    }),
    advance: (k = 1) => {
      advanceMonth(Math.max(1, Math.trunc(Number(k)) || 1));
      return window.__r7.state();
    },
    settlePost: () => { settleBattleReturn(); return window.__r7.state(); },
  };
}

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

// ?armyui=1：部隊層驗收探針（CDP 截圖用，只讀 + 開面板/進選點態，不寫檔）。
// 為什麼要它：旗子只有 9px，截圖腳本不能靠猜座標 —— 這裡回傳每支部隊的
// canvas 內部座標（cx/cy）與**視口 CSS 座標**（x/y，已含 stage 縮放），直接餵 Input.dispatchMouseEvent。
if (qs.get('armyui') === '1') {
  const point = (id) => {
    const it = armyScreenList().find((x) => x.a.id === id);
    if (!it) return null;
    const b = $('map').getBoundingClientRect();
    return {
      id, side: it.a.side, from: it.a.from, to: it.a.to, troops: it.a.troops,
      progress: Number((Number(it.a.progress) || 0).toFixed(4)),
      cx: Math.round(it.x), cy: Math.round(it.y),
      x: Math.round(b.left + it.x * (b.width / view.w)),
      y: Math.round(b.top + it.y * (b.height / view.h)),
      hit: Boolean(hitArmy(it.x, it.y)),
    };
  };
  window.__armyUi = {
    state: () => {
      if (!save) {
        return { started: false, pickerOpen: !$('pickSheet').hidden, armies: [] };
      }
      return {
        started: gameStarted, month: save.month, gold: save.gold, selected,
        marchOn: MARCH_ON, picking: pickArmyId, armySel,
        view: { w: view.w, h: view.h },
        armySheetOpen: !$('armySheet').hidden,
        pickMode: stage.classList.contains('pick'),
        armies: (save.armies || []).map((a) => point(a.id)),
      };
    },
    armies: () => (save?.armies || []).map((a) => point(a.id)),
    cities: () => ALL.map((c) => c.NAME),
    owned: () => (save?.owned || []).slice(),
    cityTroops: (n) => troopsOf(n),
    // 在我方城「裡面」放一支進度 0 的部隊＝剛出征、還沒推進月份的狀態。
    // 為什麼要這個鉤子：seedMarchDemo 的 three/mid 都是從非我方城出發（代縣在劇本 1 不是我的），
    // 拿不到「部隊在自家城上」這個合法狀態，「進入城內」就沒法驗收。
    park: (troops = 80) => {
      const home = (save?.owned || []).find((n) => [...(adj.get(n) || [])].some((x) => marchPath(n, x) !== null));
      if (!home) return null;
      const to = [...(adj.get(home) || [])].find((x) => marchPath(home, x) !== null);
      const a = {
        id: nextArmyId(), side: 'A', from: home, to, pathIndex: marchPath(home, to),
        progress: 0, troops: Math.max(1, Math.trunc(Number(troops) || 80)),
        general: localGeneral(home)?.name, reported: false,
      };
      save.armies.push(a);
      render();
      return point(a.id);
    },
    // 只讀校驗：選點態要顯示「哪些城可改道」，截圖腳本也靠它挑目標（不真的改道）
    check: (id, city) => {
      const a = armyOf(id);
      return a ? marchRetargetCheck(a, city, marchPath, mine) : { ok: false, why: '沒有這支部隊' };
    },
    open: (id) => { selectArmy(id); return window.__armyUi.state(); },
    close: () => { armySel = null; closeOverlays(); render(); return window.__armyUi.state(); },
    pick: (id) => { enterPickMode(id); return window.__armyUi.state(); },
    cancel: () => { exitPickMode(); return window.__armyUi.state(); },
    retarget: (city) => { applyRetarget(city); return window.__armyUi.state(); },
    seed: (kind) => { seedMarchDemo(kind || 'mid'); return window.__armyUi.state(); },
    adv: (k = 1) => { advanceMonth(Math.max(1, Math.trunc(Number(k)) || 1)); return window.__armyUi.state(); },
    cityAt: (name) => {
      const c = ALL.find((x) => x.NAME === name);
      if (!c) return null;
      const [cx, cy] = toScreen(c.pos_xy[0], c.pos_xy[1]);
      const b = $('map').getBoundingClientRect();
      return {
        name, cx: Math.round(cx), cy: Math.round(cy),
        x: Math.round(b.left + cx * (b.width / view.w)),
        y: Math.round(b.top + cy * (b.height / view.h)),
      };
    },
  };
}


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
  // [F5] 劇本起始公元年：有就沿用；老檔沒有 → 按 `save.scenario` 反查劇本表（SCEN[i].year），
  // 查不到才退回 184（剧本 0）。真值由 newCampaign() 從 `scenarios.json system.YEAR` 寫入
  // （189/200/208/219）；顯示 = startYear + yearOf(month) - 1，`yearOf()` 只做年內換算、一行未動。
  {
    const y = Number(s.startYear);
    if (Number.isFinite(y) && y > 0) {
      s.startYear = Math.trunc(y);
    } else {
      const scIdx = SCEN.findIndex((x) => x.id === Number(s.scenario));
      s.startYear = scIdx >= 0 ? (Number(SCEN[scIdx].year) || Saves.START_YEAR_FALLBACK) : Saves.START_YEAR_FALLBACK;
    }
  }
  s.wins = Saves.intOr(s.wins, 0, 0);
  s.losses = Saves.intOr(s.losses, 0, 0);
  s.defWins = Saves.intOr(s.defWins, 0, 0);
  s.log = Array.isArray(s.log) ? s.log.slice(-8) : [];
  // 行軍部隊：舊檔沒有就是空陣列；未知鍵一律原樣留著
  // R95（project/185 A）：每支補 officers/advisor/stationed 三個可選欄位（不刪任何未知鍵）——
  // 舊檔沒有 officers 就補成「只有主將一人」，沒有 advisor 就是「主將兼」，沒有 stationed 就是不在駐紮。
  s.armies = Array.isArray(s.armies) ? s.armies.filter((a) => a && typeof a === 'object') : [];
  for (const a of s.armies) normalizeArmyExtras(a);
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
    // R95：新欄位在這裡再正規化一次（normalizeCampaign 之後才建 city state 的路徑也要過；
    // 缺欄位補預設、advisor 不是成員就清掉，未知鍵不動）
    normalizeArmyExtras(a);
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

// ---------------------------------------------------------------- R85 收尾（必须放最后）
// 位置有讲究：seedSurrenderProbe() 会调 startNewGame() → render()/drawMap()/syncBg()，用到本檔
// 后半段的 const（USE_BG 等）。放在模組初始化流程中间（:1175）会撞 TDZ，實測報
// "ReferenceError: Cannot access 'USE_BG' before initialization"。放在最後 = 所有宣告都就緒。
// 不帶 ?sur= / ?surdead= / ?surstart= 時第一行就返回 false，正常玩法這一段等於不存在。
const SUR_PROBE = seedSurrenderProbe();
// 「二次進入不重複結算」：決策前不落库、不清名單，所以重進/換頁回來時名單還在 → 補彈一次面板。
// 已決策完的名字在 finishSurrender 裡就從 save.captured/executed 摘掉了，這裡自然不會再彈。
// R86（P0 死檔）：`boot.battle`（main.js 剛把戰果寫回舊鍵，本檔這一局才第一次載入）也在這裡才算 ——
// 這是原本寫在 :1185 的呼叫點，那時 `surState` 還在 TDZ，一崩就是整頁死掉。
if (SUR_PROBE
  || (gameStarted && boot.battle)
  || (gameStarted && $('surrenderSheet').hidden
    && (strNames(save.captured).length > 0 || strNames(save.executed).length > 0))) {
  try {
    settleBattleReturn();
  } catch (e) {
    // 面板本身炸掉不該連帶讓整個大地圖變死頁（戰果已在 save 裡，刷新還能再彈）
    console.warn('[boot] settleBattleReturn 失敗（地圖仍可用）', e);
  }
}
