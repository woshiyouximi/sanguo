
import * as Saves from './saves.js';
import * as M from './city_model.js';
// 紀元顯示（純函式）：原作是「西元 209年 3月」/「209年」，不是「第N年M月」。
// 內部存檔欄位一個都沒動（save.month 仍是絕對月序），這一層只管換算與文案。
import * as era from './era.js';

// [audio] 统一入口：audio.js 没加载/被拦也不影响内政流程
const audio = () => window.SG?.audio;
const sfx = (name, opts) => audio()?.sfx(name, opts);

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
// 调试口收敛（`project/115_发布卫生.md` §6）：`?city=` 是页面间真协议，保留；
// 其余参数（unlimited/fresh/lv/force/hall/gold/do/dump/sheet）只在 `?dev=1` 时生效，
// 避免发布版被人加个参数就改出非原作行为。
const DEV = !window.__RELEASE__ && /[?&]dev=1(?:&|$)/.test(location.search);
const dbg = (key) => (DEV ? qs.get(key) : null);
// R8 调试开关：?unlimited=1 关掉「一月一令」，只给截图/自测/批量数据用，默认关闭。
const UNLIMITED = dbg('unlimited') === '1';
const storage = window.localStorage;

/* ---------------- 佈局：750×1334 等比縮放（與 deploy.html 同款） ---------------- */
function fit() {
  const stage = $('stage');
  const s = Math.min(window.innerWidth / 750, window.innerHeight / 1334);
  const w = Math.round(750 * s);
  const h = Math.round(1334 * s);
  stage.style.transformOrigin = 'top left';
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${Math.max(0, Math.round((window.innerWidth - w) / 2))}px`;
  stage.style.top = `${Math.max(0, Math.round((window.innerHeight - h) / 2))}px`;
  document.body.style.width = `${w}px`;
  document.body.style.height = `${h}px`;
}
window.addEventListener('resize', fit);

/* ---------------- 資料 ---------------- */
const [scenRaw, genRaw, itemRaw, sysRaw, wisesRaw] = await Promise.all([
  fetch('../data/scenarios.json').then((r) => r.json()).catch(() => []),
  fetch('../data/generals.json').then((r) => r.json()).catch(() => []),
  fetch('../data/items.json').then((r) => r.json()).catch(() => []),
  fetch('../data/sango_system.json').then((r) => r.json()).catch(() => ({})),
  fetch('../data/wises.json').then((r) => r.json()).catch(() => []),
]);
const SCEN = Array.isArray(scenRaw) ? scenRaw : [];
const GENS = Array.isArray(genRaw) ? genRaw : [];
const ITEMS = Array.isArray(itemRaw) ? itemRaw : [];
const WISES = Array.isArray(wisesRaw) ? wisesRaw : [];
function systemName(sys, i) {
  const row = sys && sys['Times0' + (i + 1)];
  const s = typeof row === 'string' ? row : '';
  const cut = s.indexOf(',');
  return (cut >= 0 ? s.slice(cut + 1) : s).trim();
}

/* ---------------- 存檔：照 campaign.html 的啟動協議（只調 saves.js，不改它） ---------------- */
const store = Saves.loadStore(storage);
const legacy = Saves.readLegacy(storage);
const legacyOk = !!(legacy && (Array.isArray(legacy.owned) || legacy.seeded === true));

let save = null;
let activeSlot = 1;
let scenario = SCEN[0] || null;
let scenIdx = 0;

function snapOf(i) {
  const s = Saves.getSnapshot(store, i);
  return s && typeof s === 'object' && !Array.isArray(s) ? s : null;
}
let bootSlot = Saves.lastUsed(store) + 1;
if (!snapOf(bootSlot - 1) && Saves.hasAny(store)) bootSlot = Saves.newestSlot(store) + 1;
const bootSnap = snapOf(bootSlot - 1);
if (bootSnap) {
  const legacyNewer = legacyOk && Saves.num(legacy.scenario) === Saves.num(bootSnap.scenario)
    && Saves.num(legacy.ts) > Saves.num(bootSnap.ts);
  save = Saves.deepClone(legacyNewer ? legacy : bootSnap);
  activeSlot = bootSlot;
} else if (legacyOk) {
  const slot = bootSlot;
  save = Saves.migrateLegacy({ storage, now: Date.now(), scenarioNameOf: (id) => systemName(sysRaw, Saves.num(id) - 1) });
  activeSlot = slot;
} else {
  save = Saves.newCampaign(SCEN[0] || {});
  activeSlot = Math.min(Saves.SLOT_COUNT, Math.max(1, Saves.lastUsed(store) + 1));
}

function scenarioIndexOf(id) {
  const n = Saves.num(id);
  for (let i = 0; i < SCEN.length; i += 1) if (Saves.num(SCEN[i]?.id) === n) return i;
  return Math.max(0, Math.min(SCEN.length - 1, n - 1));
}
scenIdx = scenarioIndexOf(save?.scenario);
scenario = SCEN[scenIdx] || null;

/* [F5] 紀元錨點：本頁頂部「西元 N 年 M 月」、8 欄面板「時間 N 年」、日誌日期全走 era.js。
 * 錨點 = 這份存檔的劇本起始年（189/200/208/219…），顯示即 `startYear + yearOf - 1`；
 * 缺 startYear 的老檔由 `Saves.startYearOf()` 兜 184（`yearOf()` 本身只做年內換算）。 */
era.setAnchor(Saves.startYearOf(save));

/* 截圖/驗收用：?fresh=1 不讀存檔、直接開新局（除錯口子；只有下命令才會寫回槽位） */
const FRESH = dbg('fresh') === '1';
if (FRESH) save = Saves.newCampaign(scenario || {});
save = Saves.deepClone(save || Saves.newCampaign(scenario || {}));
M.ensureExtras(save);
if (scenario) for (const c of scenario.cities || []) M.ensureCityState(save, c);
if (!Array.isArray(save.owned) || !save.owned.length) {
  save.owned = (scenario?.cities || []).slice(0, 3).map((c) => c.NAME);
}
const ctx = { generals: GENS, scenario, scenIdx, items: ITEMS, wises: WISES };
// R18：掉落池要看「已擁有」清單，而背包在 items.html 自己的鍵（sanguo_items_v1）。
// 每次搜索後都要重讀，否則同一件唯一物品會被搜出第二次。
ctx.bag = readBagSeqs();
// 除錯：?lv=30 給「等級不明」的武將一個等級（generals.json 沒有等級欄位，見 city_model.levelOf）
{
  const lv = Number(dbg('lv'));
  if (Number.isFinite(lv) && lv > 0) ctx.level = Math.max(1, Math.min(99, Math.trunc(lv)));
}
const myCities = () => (scenario?.cities || []).filter((c) => save.owned.includes(c.NAME));

/* 進來的城：?city= 指定，但只認我方城；?force=1 讓截圖/驗收能看非我方城（除錯口子，不改所有權） */
let cityDef = null;
const FORCE_CITY = dbg('force') === '1';
function pickCity(name) {
  if (FORCE_CITY && name) {
    const hit = (scenario?.cities || []).find((c) => c.NAME === name);
    if (hit) return hit;
  }
  const list = myCities();
  return list.find((c) => c.NAME === name) || list[0] || null;
}
cityDef = pickCity(qs.get('city'));

/* ---------------- [F1] 內政窗口：只有每年 1 月能下命令 ----------------
 * 原作：一年 12 個月，**1 月是內政月**，其餘 11 個月只在大地圖流動時間
 * （`project/210_原作战斗流程规格.md` §1；内政指南 L21-23/L39-41）。
 * 非正月（或內政已終了）進來 = 只讀「查看」：能看數字/武將/情報，不能下命令。
 * `?view=1` 是大地圖非正月「查看」按鈕帶過來的頁間協議；`?dev=1` 的除錯口子可繞過。 */
const VIEW = qs.get('view') === '1';
const inAffairsMonth = () => Saves.monthOfYear(save.month) === 1;
function readOnly() {
  if (VIEW) return true;
  if (!inAffairsMonth()) return true;
  return !UNLIMITED && M.monthLocked(save, UNLIMITED);
}
function readOnlyHint() {
  if (!inAffairsMonth()) return '非正月：原作內政只在每年 1 月開（大地圖「推進一月」到 1 月再來）。';
  return `${M.LOCK_HINT}：內政已終了，回大地圖「推進一月」再開新窗口。`;
}

/* ---------------- 殿內背景（hall_0N）＋ 原作宮殿圖（palais_0N） ---------------- */
/* 挑選規則在 city_model.hallIndexOf()（RATE 1..5，人口≥300000 升到 6），這樣才測得到；
 * 這裡只把它翻成 CSS 變數。除錯口子 ?hall=1..6 直接指定（截圖對比用）。 */
const HALL_DEBUG = Number(dbg('hall'));
function applyHall() {
  if (!cityDef) return;
  const n = Number.isFinite(HALL_DEBUG) && HALL_DEBUG >= 1 && HALL_DEBUG <= 6
    ? Math.trunc(HALL_DEBUG) : M.hallIndexOf(cityDef);
  const palais = Math.max(1, Math.min(5, n === 6 ? 1 : n));
  const stage = $('stage');
  stage.style.setProperty('--hall', `url("assets/bg/env/hall_0${n}.jpg")`);
  stage.style.setProperty('--palais', `url("assets/bg/policy/palais_0${palais}.png")`);
  stage.dataset.hall = String(n);
  stage.dataset.hallSrc = M.hallIndexOf(cityDef) === n ? 'city' : 'debug';
}
applyHall();

/* ---------------- R10 自治 + F13 錢變兵：每月 lazy tick ---------------- */
/* 這兩件事原作都掛在「換月」上（campaign.html 的 advanceMonth 已接 autonomyTick）；
 * 這裡在進頁時再補結算一次：只補到當前月、不會漏月也不會重複跑（save.autoMonth 記帳）。
 * `?loose=1` 走舊的「每月白補 10%」對照（refillPrep），預設是原作線：100 金 → 1 預備兵。 */
const autoTick = M.autonomyTick(save, scenario?.cities || [], ctx, { loose: dbg('loose') === '1' });
if (autoTick.refilled.length || autoTick.auto) persist();

/* 除錯口子：?gold=3000 直接改**本城金**（只為驗收/自測，UI 上沒有這個入口）
 * [F16] 錢只有每城 money 一個口徑；舊寫法改 `save.gold`（單錢包）在遷移後已歸 0，改了也看不到。 */
if (qs.has('gold') && cityDef) {
  const g = Number(dbg('gold'));
  const st = M.ensureCityState(save, cityDef);
  if (st && Number.isFinite(g) && g >= 0) st.money = Math.trunc(g);
}

/* ---------------- 持久化 ---------------- */
function persist() {
  save.ts = Date.now();
  const name = systemName(sysRaw, scenIdx) || scenario?.system?.TIME || `劇本${scenIdx + 1}`;
  try {
    Saves.writeSlot(store, activeSlot - 1, save, { scenarioName: name, ts: save.ts });
    Saves.saveStore(store, storage);
    Saves.writeLegacy(save, storage);
  } catch (err) {
    console.warn('存檔失敗', err);
  }
}

/* ---------------- 物品背包（items.html 自己的鍵） ---------------- */
/** 背包序號（R18：唯一物品已擁有 ⇒ 不再進掉落池）。讀不到就回空，交給 M.parseItemsSave 的預設處理。 */
function readBagSeqs() {
  try {
    const raw = storage.getItem(M.BAG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const bag = M.parseItemsSave(parsed)?.bag;
    return Array.isArray(bag) ? bag.map((n) => Math.trunc(Number(n))).filter((n) => n > 0) : [];
  } catch (err) {
    console.warn('背包讀取失敗', err);
    return [];
  }
}
function bagAdd(seq) {
  try {
    const raw = storage.getItem(M.BAG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    storage.setItem(M.BAG_KEY, JSON.stringify(M.withBagItem(parsed, seq)));
    return true;
  } catch (err) {
    console.warn('背包寫入失敗', err);
    return false;
  }
}

/* ---------------- 頂部 HUD ---------------- */
// 數字格式：原作**沒有千分位**（`A_city_t0030.png` 的「金錢 3198」「人口 126500人」都是裸數字），
// 所以直接轉成整數字串。以前是 `Saves.num(n).toLocaleString('en-US')`，會顯示成 126,500 —— 與原作差一層。
const fmt = (n) => String(Math.trunc(Saves.num(n)));
// 疲勞容錯：老檔沒有 save.tire、或值是字串/越界，都按 0..100 整數讀；只影響顯示。
function tireOfName(name) {
  const raw = save && save.tire && typeof save.tire === 'object' ? save.tire[name] : 0;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.trunc(v))) : 0;
}
// 士氣容錯（原作 general+0x38，武將級）：沒存過按缺省 60 讀；只影響顯示。
function moraleOfName(name) {
  const raw = save && save.morale && typeof save.morale === 'object' ? save.morale[name] : 60;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.trunc(v))) : 60;
}
function renderHud() {
  const st = cityDef ? M.ensureCityState(save, cityDef) : null;
  $('cityName').textContent = cityDef ? cityDef.NAME : '（無城）';
  $('headSub').textContent = `${systemName(sysRaw, scenIdx) || scenario?.system?.TIME || '劇本'} · ${era.eraTextOfMonth(save.month)}`;
  $('vPop').textContent = st ? fmt(st.pop) : '—';
  // [F16] 錢只有一個口徑：每城 `money(+0x92)`。HUD「本城金」讀當前城；國庫（Σ 我方每城）
  // 在下面 8 欄面板的「國庫」chip。舊碼讀 `save.gold`（單錢包）→ 同屏兩個數卻沒標籤。
  $('vGold').textContent = st ? fmt(st.money) : '—';
  $('vTroops').textContent = st ? `${fmt(st.troops)}/${fmt(M.RECRUIT.CAP)}` : '—';
  $('vTroops').title = st ? `步兵 ${fmt(st.inf)} · 騎兵 ${fmt(st.cav)}` : '';
  // R12 預備兵池：原作面板 0x48B2B8「預備兵 %d/%d」（+0x86 現有 / +0x82 上限）
  if (st) {
    const cap = M.prepCapOf(st.pop);
    $('vPrep').textContent = `${fmt(st.prep)}/${fmt(cap)}`;
    $('vPrep').classList.toggle('hot', st.prep >= cap && cap > 0);
  } else {
    $('vPrep').textContent = '—';
  }
  $('vDef').textContent = st ? fmt(st.def) : '—';
  $('vMajor').textContent = cityDef ? (M.majorOf(save, cityDef) || '—') : '—';
  $('vWise').textContent = cityDef ? (M.wiseOf(save, cityDef) || '—') : '—';
  $('vEff').textContent = cityDef ? `×${M.efficiencyOf(save, cityDef, ctx).toFixed(2)}` : '—';
  // [F19] 武將數 = 當前/上限（原作指南 L92「武將數（如 13/10）」）。
  // 劇本資料本身超編（濮陽 15／洛陽 15／江夏 17）→ **不裁切**，只把 N/CAP 標紅，
  // 否則「載入即砍人」會和 garrison.json 的武將表對不上。
  if (cityDef) {
    const n = M.rosterOf(save, cityDef.NAME, ctx).length;
    const cap = M.officerCapState ? M.officerCapState(n) : { n, cap: 10, over: n > 10 };
    $('vGens').textContent = `${cap.n} / ${cap.cap}`;
    $('vGens').classList.toggle('hot', cap.over);
    $('vGens').title = cap.over
      ? `超編：劇本原始武將 ${cap.n} 名 > 上限 ${cap.cap}（不裁切，只標紅）`
      : `武將 ${cap.n} / 上限 ${cap.cap}`;
  } else {
    $('vGens').textContent = '—';
  }
  // 主將疲勞（原作 general+0x3A）：只在這一頁顯示一次；≥60 轉橙，和 monthly 的士氣懲罰同門檻。
  const major = cityDef ? M.majorOf(save, cityDef) : '';
  const majorTire = major ? tireOfName(major) : null;
  $('vTire').textContent = majorTire === null ? '—' : `${majorTire}/100`;
  $('vTire').classList.toggle('hot', majorTire !== null && majorTire >= 60);
  // 主將士氣（原作 general+0x38，武將級）：<30 標紅（低迷），與 deploy.html 同一口徑。
  const majorMorale = major ? moraleOfName(major) : null;
  $('vMorale').textContent = majorMorale === null ? '—' : `${majorMorale}/100`;
  $('vMorale').classList.toggle('cold', majorMorale !== null && majorMorale < 30);
  // [F1/F2] 內政窗口：正月且未終了才能下命令；逐將年令由選將抽屜管，不再是一月一條。
  const locked = M.monthLocked(save, UNLIMITED);
  const ro = readOnly();
  $('vLock').textContent = UNLIMITED ? '不限' : (ro ? (inAffairsMonth() ? '已終了' : '非正月') : '可下');
  $('vLock').classList.toggle('hot', !UNLIMITED && ro);
  $('cmdHint').textContent = UNLIMITED
    ? M.UNLIMITED_HINT
    : (ro
      ? readOnlyHint()
      : `正月內政 · 每將今年一次（已行動 ${M.actedNames(save).length} 人）`);
  renderCivic();
}

/* ---------------- 原作內政 8 欄 ----------------
 * `A_city_t0030.png` 右側那塊面板：時間 / 君主 / 城數 / 關數 / 武將數 / 總兵數 / 金錢 / 人口。
 * 口徑全部在 `M.civicFields()` 裡（唯讀、不建城態）；這裡只負責貼字：
 *   ・時間只到年（`209年`），不帶「西元」、不帶月；
 *   ・數字不帶千分位；
 *   ・「人」只加在武將數 / 總兵數 / 人口（原作實拍：城數 1、關數 0、金錢 3198 都不帶）。
 */
function renderCivic() {
  const cv = M.civicFields(save, scenario?.cities || [], ctx);
  $('fvTime').textContent = cv.timeText;
  $('fvKing').textContent = cv.monarch || '—';
  $('fvCity').textContent = String(cv.cityCount);
  $('fvGate').textContent = String(cv.gateCount);
  $('fvGens').textContent = `${cv.generalCount}人`;
  $('fvTroops').textContent = `${cv.troopCount}人`;
  $('fvGold').textContent = String(cv.gold);
  $('fvPop').textContent = `${cv.pop}人`;
  return cv;
}

/* ---------------- 內政命令宮格（[F7] 原作 7 項 + 2 條副令） ----------------
 * 指南 L94-105 的五大核心指令表其實是 7 項：搜索／開發／部隊徵兵／任命太守·軍師／
 * 武將資料（含使用物品）／內政自治／部隊出征。順序照指南，不照舊九宮格。
 * 「移動」「情報」降成第二列副令：仍然可用（情報已是只讀表格），但不占七令。
 */
const CMD_SUB = {
  搜索: (st) => `金 ${M.SEARCH.COST} · 人才/寶物`,
  開發: () => '不耗金 · 民防共增',
  徵兵: (st) => `預備 ${st ? st.prep : '—'} · 步／騎`,
  任命: () => '太守 · 軍師',
  武將資料: () => '數值 · 裝備 · 使用物品',
  自治: () => {
    const n = M.autoCities(save).length;
    return n ? `已設 ${n} 城 · 施行` : '設定代行開發';
  },
  出征: () => '打相鄰敵城',
  情報: () => '副令 · 本城/鄰城（只讀）',
  移動: () => '副令 · 調將調兵',
};
function renderGrid() {
  const grid = $('grid');
  const subgrid = $('subgrid');
  // [F1] 非正月／內政已終了 → 全置灰，只讀查看（原作只有 1 月能下內政命令）
  const ro = readOnly();
  const st = cityDef ? M.cityStateOf(save, cityDef.NAME) : null;
  const noteOf = () => (ro ? `<span class="note">${inAffairsMonth() ? '已終了' : '非正月'}</span>` : '');
  const makeBtn = (cmd, extraCls) => {
    const b = document.createElement('button');
    b.className = 'cmd' + (cmd === '開發' || cmd === '徵兵' ? ' hot' : '') + (extraCls || '');
    b.dataset.cmd = cmd;
    b.disabled = ro;
    b.innerHTML = `<b>${cmd}</b><small>${CMD_SUB[cmd]?.(st) || ''}</small>` + noteOf();
    return b;
  };
  grid.innerHTML = '';
  // 七令：`M.CMD_ORDER` 就是原作順序（city_model.js），`M.CMD_EXTRA` 目前是空陣列
  for (const cmd of [...M.CMD_ORDER, ...(M.CMD_EXTRA || [])]) grid.appendChild(makeBtn(cmd));
  // 副令列：情報／移動（舊九宮格的第 4、8 鍵），不占令
  if (subgrid) {
    subgrid.innerHTML = '';
    for (const cmd of M.CMD_SECONDARY || []) subgrid.appendChild(makeBtn(cmd, ' sub'));
  }
}

/* ---------------- 結果日誌（最近 6 條） ---------------- */
function renderLog() {
  const box = $('log');
  const rows = M.recentLog(save, 6);
  if (!rows.length) {
    box.innerHTML = '<div class="empty">尚無紀錄。點上面任一命令。</div>';
    return;
  }
  box.innerHTML = rows.map((e) => {
    const k = e.kind && e.kind !== 'info' ? `k-${e.kind}` : '';
    // 日期欄一律走紀元：`logAdd()` 寫入時把 `t` 記成「第1年1月」的老格式，
    // 那是內部口徑；畫面上要和上面年月匾一致，所以只認 `m`（絕對月序）現算。
    const when = Number.isFinite(Number(e.m)) ? era.eraTextOfMonth(e.m) : (e.t || '');
    return `<div class="row ${k}"><span class="t">${when}</span>`
      + `<span class="c">${e.cmd || ''}</span><span class="x">${escapeHtml(e.text)}</span></div>`;
  }).join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function say(cmd, kind, text) {
  M.logAdd(save, { city: cityDef?.NAME || '', cmd, kind, text, m: save.month });
}

/* ---------------- 八條命令的執行 ---------------- */
/**
 * 每条命令收尾。
 *   afterCommand(true, '張飛') → 記「張飛今年已行動」（F2 逐將年令，搜索/開發用）
 *   afterCommand(true)         → 記「內政窗口已結束」（內政終了/出征/自治這種全局動作）
 *   afterCommand(false)        → 什麼令都不記（失敗，或徵兵/情報/移動/任命這種不耗令的命令）
 */
function afterCommand(acted = true, execName = '') {
  if (acted) {
    if (execName) M.markActed(save, execName);
    else M.markMonthActed(save, UNLIMITED);
  }
  persist();
  renderHud();
  renderGrid();
  renderLog();
}

/**
 * [F8/F9] 先選執行武將，再下命令（原作「每將一年只能搜索或開發一次」）。
 * 名冊走 rosterOf（已濾掉在路上的，F3），再濾掉今年已行動的（F2）。
 * 沒按確定／沒點人 → 直接取消，不寫任何令。
 */
function pickExec(title, cb) {
  const all = M.rosterOf(save, cityDef.NAME, ctx);
  const free = all.filter((g) => !M.actedLocked(save, g.NAME));
  const used = all.filter((g) => M.actedLocked(save, g.NAME)).map((g) => g.NAME);
  if (!free.length) {
    say(title, 'warn', used.length
      ? `沒有可用的武將：${used.join('、')} 今年已經行動過（每將每年只能搜索或開發一次）。`
      : '這座城沒有可用的武將（在路上的不算，F3）。');
    afterCommand(false);
    return;
  }
  let picked = '';
  openSheet(`${title} · 選執行武將`, (body) => {
    body.innerHTML = `<div style="font-size:15px;color:var(--ink-3);line-height:1.5;padding:0 4px 8px">
        每將一年只能搜索或開發一次；隨軍在路上的武將不算。</div>`
      + free.map((g) => `<button class="pick" data-name="${escapeHtml(g.NAME)}">
          ${escapeHtml(g.NAME)}<small style="color:var(--ink-3);font-size:14px"> 武 ${g.STR ?? '—'} · 智 ${g.INT ?? '—'}</small></button>`).join('')
      + (used.length ? `<div style="font-size:14px;color:var(--ink-3);margin-top:10px">今年已行動：${escapeHtml(used.join('、'))}</div>` : '');
    body.querySelectorAll('.pick[data-name]').forEach((el) => {
      el.onclick = () => {
        picked = el.dataset.name;
        body.querySelectorAll('.pick[data-name]').forEach((x) => x.classList.toggle('on', x === el));
      };
    });
    body.__ok = () => {
      if (!picked) {
        closeSheet();
        say(title, 'warn', '沒選執行武將：命令取消（原作要指定人，不能空手代行）。');
        afterCommand(false);   // 只刷畫面＋存檔（不記任何令）
        return;
      }
      closeSheet();
      cb(picked);
    };
  });
}

function doDevelop(execName) {
  // [F9] 無太守 → 直接拒絕。舊口徑是讓 majorFactor(0)=×0.53 糊過去（等於默認「無太守也能開發」），
  // 原作沒有這種折扣；沒有太守就該先任命（城內「任命」）。
  if (!M.majorOf(save, cityDef)) {
    say('開發', 'warn', '需先任命太守：沒有太守不能開發（原作不允許無太守代行）。');
    afterCommand(false);
    return;
  }
  // [F8] 先選將再說：沒帶 execName 就開選將抽屜（?do= 除錯口子會直接傳太守）。
  if (!execName) {
    pickExec('開發', (name) => doDevelop(name));
    return;
  }
  if (M.actedLocked(save, execName)) {
    say('開發', 'warn', `${execName} 今年已行動（每將每年只能搜索或開發一次），換一位。`);
    afterCommand(false);
    return;
  }
  const r = M.develop(save, cityDef, { ...ctx, exec: execName });
  if (!r.ok) {
    // R9：原作 0x427A84 起有「關城前置」（0x405499 判 FLAGS==2 的 12 座关城），
    // 关城不能開發，要给专门的文案，不能笼统说「人口飽和」。
    const why = r.reason === 'gate' ? '關城不能開發（原作 0x405499）。'
      : r.reason === 'gold' ? `金不足（需 ${r.cost}）。` : '人口飽和、防禦力最高了。';
    say('開發', 'warn', why);
  } else {
    say('開發', 'info', `${execName} 執行：人口增加 ${r.pop} 人，防禦力增加 ${r.def}。（${r.cost > 0 ? `金 -${r.cost}` : '不耗金'}）`);
  }
  afterCommand(r.ok, r.ok ? execName : '');
}

/* 部隊徵兵（R12）：原作面板四行「步兵數 %d/%d」「騎兵數 %d/%d」「預備兵 %d」「總兵數 %d」
 * （04c §2.3，位址 0x489138..0x489170）。消耗的是**預備兵**，不花金。
 * 上限：步／騎各自固定（armCaps），兩欄相加 = 部隊兵硬上限 600；騎兵上限來自武將等級。 */
function doRecruit() {
  const st = M.ensureCityState(save, cityDef);
  const caps = M.armCaps(save, cityDef, ctx);
  const maxOf = (arm) => {
    const room = Math.max(0, (arm === 'cav' ? caps.cav : caps.inf) - (arm === 'cav' ? st.cav : st.inf));
    return Math.max(0, Math.min(room, caps.total - st.troops, st.prep));
  };
  let inf = 0;
  let cav = 0;
  openSheet('部隊徵兵 · 預備兵 → 步／騎', (body) => {
    body.innerHTML = `
      <table class="info">
        <tbody>
          <tr><td>步兵數</td><td><b id="rcInf">${fmt(st.inf)}</b> / ${fmt(caps.inf)}</td></tr>
          <tr><td>騎兵數</td><td><b id="rcCav">${fmt(st.cav)}</b> / ${fmt(caps.cav)}</td></tr>
          <tr><td>預備兵</td><td><b id="rcPrep">${fmt(st.prep)}</b></td></tr>
          <tr><td>總兵數</td><td><b id="rcTroops">${fmt(st.troops)}</b> / ${fmt(caps.total)}</td></tr>
        </tbody>
      </table>
      <div class="field"><span style="width:64px">步兵＋</span>
        <input type="range" id="rcInfR" min="0" max="${maxOf('inf')}" value="0">
        <input type="number" id="rcInfN" min="0" max="${maxOf('inf')}" value="0" style="width:104px"></div>
      <div class="field"><span style="width:64px">騎兵＋</span>
        <input type="range" id="rcCavR" min="0" max="${maxOf('cav')}" value="0">
        <input type="number" id="rcCavN" min="0" max="${maxOf('cav')}" value="0" style="width:104px"></div>
      <div style="font-size:15px;color:var(--ink-3);line-height:1.5;padding-right:12px">
        1 預備兵 → 1 兵。騎兵上限 = Σ clamp((等級−20)×5, 0, 100)，
        現在 ${caps.cav}${caps.cav ? '。' : '；武將等級不明（≤20）⇒ 徵不到騎兵。'}
      </div>`;
    const q = (id) => body.querySelector(id);
    const paint = () => {
      const leftPrep = Math.max(0, st.prep - inf - cav);
      q('#rcInf').textContent = fmt(st.inf + inf);
      q('#rcCav').textContent = fmt(st.cav + cav);
      q('#rcPrep').textContent = fmt(leftPrep);
      q('#rcTroops').textContent = fmt(st.troops + inf + cav);
    };
    const setInf = (v) => {
      inf = Math.max(0, Math.min(maxOf('inf'), Math.min(st.prep - cav, Math.trunc(Number(v) || 0))));
      q('#rcInfR').value = inf; q('#rcInfN').value = inf; paint();
    };
    const setCav = (v) => {
      cav = Math.max(0, Math.min(maxOf('cav'), Math.min(st.prep - inf, Math.trunc(Number(v) || 0))));
      q('#rcCavR').value = cav; q('#rcCavN').value = cav; paint();
    };
    q('#rcInfR').oninput = () => setInf(q('#rcInfR').value);
    q('#rcInfN').oninput = () => setInf(q('#rcInfN').value);
    q('#rcCavR').oninput = () => setCav(q('#rcCavR').value);
    q('#rcCavN').oninput = () => setCav(q('#rcCavN').value);
    if (maxOf('cav') === 0) {
      q('#rcCavR').disabled = true;
      q('#rcCavN').disabled = true;
    }
    body.__ok = () => {
      if (!inf && !cav) {
        closeSheet();
        say('徵兵', 'warn', '沒有選擇要徵的兵。');
        afterCommand(false);
        return;
      }
      const bits = [];
      let okAny = false;
      for (const [arm, n] of [['inf', inf], ['cav', cav]]) {
        if (!n) continue;
        const r = M.enlist(save, cityDef, { arm, n }, ctx);
        if (r.ok) { okAny = true; bits.push(`${M.ARM_NAMES[arm]} +${r.n}（預備兵 -${r.taken}）`); }
        else bits.push(`${M.ARM_NAMES[arm]} 徵不到（${r.reason}）`);
      }
      const now = M.cityStateOf(save, cityDef.NAME);
      sfx(okAny ? 'success' : 'failure2');
      say('徵兵', okAny ? 'info' : 'warn', `${bits.join('、')}。步 ${fmt(now.inf)}／騎 ${fmt(now.cav)}，共 ${fmt(now.troops)}/${fmt(M.RECRUIT.CAP)}。`);
      closeSheet();
      // 徵兵不是「將的一令」：只把預備兵換成兵（有預備兵才徵得到），不佔內政窗口。
      afterCommand(false);
    };
  });
}

/* 自治（R10）：原作「自治施行」—— 對已設定自治的城批量代行開發（04c §2.3 三條字串）。
 * 每按一次就要花掉這個月的令（和開發同一個 0x4A64BC），所以放進 onCmd 的月令閘門後面。 */
function openAuto() {
  const cities = myCities();
  if (!cities.length) {
    say('自治', 'warn', '沒有我方城池。');
    afterCommand(false);
    return;
  }
  const chosen = new Set(M.autoCities(save).filter((n) => cities.some((c) => c.NAME === n)));
  openSheet('自治施行 · 設定代行開發的城', (body) => {
    body.innerHTML = `<div style="font-size:15px;color:var(--ink-3);line-height:1.5;padding-right:12px">
        把城「設定自治」，之後按「每月結算自動代行」或「現在立刻施行一次」批量開發，
        完成時印「執行城市自治完畢!!」。</div>`
      + cities.map((c) => {
        const st = M.cityStateOf(save, c.NAME) || {};
        const on = chosen.has(c.NAME);
        return `<button class="pick ${on ? 'on' : ''}" data-city="${escapeHtml(c.NAME)}">
          <div><div class="nm">${escapeHtml(c.NAME)}${c.NAME === cityDef?.NAME ? '（本城）' : ''}</div>
            <div class="st">人口 ${fmt(st.pop)} · 防 ${fmt(st.def)} · 預備兵 ${fmt(st.prep)}</div></div>
          <div class="rt">${on ? '自治' : '手動'}</div></button>`;
      }).join('');
    body.querySelectorAll('.pick').forEach((el) => {
      el.onclick = () => {
        const n = el.dataset.city;
        if (chosen.has(n)) { chosen.delete(n); el.classList.remove('on'); el.querySelector('.rt').textContent = '手動'; }
        else { chosen.add(n); el.classList.add('on'); el.querySelector('.rt').textContent = '自治'; }
        // 旗標即時寫回存檔，這樣關掉抽屜也不會丟
        M.setAuto(save, n, chosen.has(n));
        persist();
      };
    });
    body.__ok = () => {
      for (const c of cities) M.setAuto(save, c.NAME, chosen.has(c.NAME));
      const r = M.runAutonomy(save, scenario?.cities || [], ctx, { from: cityDef?.NAME });
      closeSheet();
      if (!r.ok) {
        say('自治', 'warn', r.reason === 'none' ? M.AUTONOMY.NO_CITY : '沒有可以代行開發的城（金不足或已飽和）。');
      } else {
        say('自治', 'info', `${r.text}  ${r.ran.map((x) => `${x.city}+${x.pop}人`).join('、')}`);
      }
      sfx(r.ok ? 'success' : 'failure2');
      afterCommand(true);
    };
  });
}

function doSearch(execName) {
  // [F8] 搜索必須選將（原作：每將一年只能搜索或開發一次）；選完才真的扣錢/抽人。
  if (!execName) {
    pickExec('搜索', (name) => doSearch(name));
    return;
  }
  if (M.actedLocked(save, execName)) {
    say('搜索', 'warn', `${execName} 今年已行動（每將每年只能搜索或開發一次），換一位。`);
    afterCommand(false);
    return;
  }
  const before = M.searchCount(save, cityDef.NAME);
  const r = M.search(save, cityDef, { ...ctx, exec: execName });
  if (!r.ok) {
    say('搜索', 'warn', r.reason === 'gold' ? `金不足（需 ${r.cost}）。` : '這裡不能搜索。');
    sfx('failure2');   // [audio] 搜索失败 = 原作 FAILURE2（37c §4）
    afterCommand(false);
    return;
  }
  // search() 自己寫日誌（種子需要 count 遞增），這裡只補背包
  if ((r.kind === 'treasure' || r.kind === 'talisman') && r.seq) bagAdd(r.seq);
  // R18：背包變了就重讀，同一件唯一物品不會被搜出第二次
  ctx.bag = readBagSeqs();
  // [audio] 搜索成功 = 原作 SUCCESS；「一無所獲」按失败处理（原作没有"空手"专用音）
  sfx(r.kind === 'none' ? 'failure2' : 'success');
  void before;
  afterCommand(true, execName);
}

/* 移動抽屜 */
function openMove() {
  const dests = M.neighboursOf(cityDef.NAME, scenario)
    .filter((n) => save.owned.includes(n));
  const st = M.ensureCityState(save, cityDef);
  const gens = M.rosterOf(save, cityDef.NAME, ctx);
  if (!dests.length) {
    say('移動', 'warn', '沒有相鄰的我方城池可調動。');
    afterCommand(false);
    return;
  }
  let to = dests[0];
  let troops = 0;
  let general = '';
  openSheet('移動', (body) => {
    body.innerHTML = `
      <div class="field"><span style="width:74px">目標城</span><select id="mvTo" class="pick" style="flex:1;height:56px;font-size:20px">
        ${dests.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
      </select></div>
      <div class="field"><span style="width:74px">兵力</span>
        <input type="range" id="mvTroops" min="0" max="${st.troops}" value="0">
        <input type="number" id="mvTroopsN" min="0" max="${st.troops}" value="0" style="width:110px"></div>
      <div class="stxt" style="font-size:15px;color:var(--ink-3)">本城可用兵力 ${fmt(st.troops)}；目標城上限 ${M.RECRUIT.CAP}（依据：docs/04c §2.2）。</div>
      <div class="field"><span style="width:74px">武將</span><select id="mvGen" class="pick" style="flex:1;height:56px;font-size:20px">
        <option value="">（不調將）</option>
        ${gens.map((g) => `<option value="${escapeHtml(g.NAME)}">${escapeHtml(g.NAME)} 武${g.STR} 智${g.INT}</option>`).join('')}
      </select></div>
      <div style="font-size:15px;color:var(--ink-3)">本城武將 ${gens.length} 人。調走太守/軍師會自動卸任。</div>`;
    const toSel = body.querySelector('#mvTo');
    const rng = body.querySelector('#mvTroops');
    const numIn = body.querySelector('#mvTroopsN');
    const genSel = body.querySelector('#mvGen');
    const sync = (v) => { troops = Math.max(0, Math.min(st.troops, Math.trunc(Number(v) || 0))); rng.value = troops; numIn.value = troops; };
    toSel.onchange = () => { to = toSel.value; };
    rng.oninput = () => sync(rng.value);
    numIn.oninput = () => sync(numIn.value);
    genSel.onchange = () => { general = genSel.value; };
    body.__ok = () => {
      const r = M.move(save, cityDef, { to, troops, general }, ctx);
      if (!r.ok) {
        say('移動', 'warn', r.reason === 'empty' ? '沒有選擇兵力或武將。'
          : r.reason === 'target' ? '目標城不合法。'
            : r.reason === 'not-owned' ? '目標不是我方城池。'
              : r.reason === 'not-adjacent' ? '目標不相鄰（只能調往相鄰我方城）。' : '移動失敗。');
      } else {
        const bits = [];
        if (r.troops) bits.push(`兵 ${r.troops}`);
        if (r.general) bits.push(`將 ${r.general.NAME}`);
        say('移動', 'info', `→ ${to}：${bits.join('、') || '無'}。`);
      }
      closeSheet();
      // 移動不是「將的一令」：調兵/調將本身不產出，不佔內政窗口（F2 逐將年令只鎖搜索/開發）。
      afterCommand(false);
    };
  });
}

/* 任命抽屜 */
function openAppoint() {
  const gens = M.rosterOf(save, cityDef.NAME, ctx);
  if (!gens.length) {
    say('任命', 'warn', '本城沒有武將可任命。');
    afterCommand(false);
    return;
  }
  let major = M.majorOf(save, cityDef);
  let wise = M.wiseOf(save, cityDef);
  openSheet('任命 · 太守 / 軍師', (body) => {
    const mk = (role, cur) => `
      <div class="sec" style="padding:10px 12px">
        <h2 style="font-size:17px">${role === 'major' ? '太守（影響內政效率）' : '軍師（決定軍師技可用）'}</h2>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
          ${gens.map((g) => `<button class="pick ${cur === g.NAME ? 'on' : ''}" data-role="${role}" data-name="${escapeHtml(g.NAME)}">
            <div><div class="nm">${escapeHtml(g.NAME)}</div><div class="st">武 ${g.STR} · 智 ${g.INT} · 忠 ${g.Loyal}</div></div>
            <div class="rt">${(M.wiseSkillsOf(g, WISES).slice(0, 2).map((w) => w.name).join(' / ')) || '—'}</div>
          </button>`).join('')}
        </div>
      </div>`;
    body.innerHTML = mk('major', major) + mk('wise', wise);
    body.querySelectorAll('.pick').forEach((el) => {
      el.onclick = () => {
        const role = el.dataset.role;
        if (role === 'major') { major = el.dataset.name; } else { wise = el.dataset.name; }
        body.querySelectorAll('.pick').forEach((x) => { if (x.dataset.role === role) x.classList.toggle('on', x === el); });
      };
    });
    body.__ok = () => {
      const rm = M.appoint(save, cityDef, 'major', major, ctx);
      const rw = M.appoint(save, cityDef, 'wise', wise, ctx);
      say('任命', 'info', `太守 ${rm.ok ? major : (major || '—')}、軍師 ${rw.ok ? wise : (wise || '—')}。`);
      closeSheet();
      // 任命不佔內政窗口（原作任命太守/軍師不是「將的一令」）
      afterCommand(false);
    };
  });
}

/* 情報抽屜（只讀） */
function openIntel() {
  const info = M.intel(save, cityDef, ctx);
  openSheet('情報 · 本城與鄰城', (body) => {
    const row = (r) => `<tr class="${r.mine ? 'mine' : ''}">
      <td>${escapeHtml(r.name)}${r.gate ? ' <span class="tag">關</span>' : ''}</td>
      <td>${escapeHtml(r.owner)}</td>
      <td>${fmt(r.troops)}${r.mine ? `<br><small style="color:var(--ink-3)">步${fmt(r.inf)}/騎${fmt(r.cav)}</small>` : ''}</td>
      <td>${fmt(r.prep)}/${fmt(r.prepCap)}</td><td>${fmt(r.def)}</td><td>${r.generals}</td>
      <td>${escapeHtml(r.major || '—')}${r.auto ? ' <span class="tag">自治</span>' : ''}</td></tr>`;
    body.innerHTML = `<table class="info">
      <thead><tr><th>城</th><th>勢力</th><th>兵</th><th>預備兵</th><th>防</th><th>將</th><th>太守</th></tr></thead>
      <tbody>${[info.self, ...info.rows].filter(Boolean).map(row).join('')}</tbody></table>
      <div style="font-size:14px;color:var(--ink-3);margin-top:6px">只讀面板：相鄰城含關卡（RATE=0）。預備兵 = 原作 +0x86/+0x82。</div>`;
    body.__noOk = true;
  });
  // [F2] 情報是只讀：原作看資料不算「搜索/開發」，不該吃掉任何將的一令。
  afterCommand(false);
}

/* 武將資料抽屜（[F7] 原作第 5 項「武將資料 · 使用物品」）
 * 指南 L100-102：點武將看數值／裝備，並在這一層「使用物品」。本作把物品頁獨立成
 * items.html（同一個存檔、同一份背包 `M.BAG_KEY`），所以抽屜底部給一顆「使用物品」直接過去；
 * 這一步不產出資源、也不吃任何將的年度行動權 → `afterCommand(false)`，與情報同級。
 */
function openGeneralData() {
  const gens = M.rosterOf(save, cityDef.NAME, ctx);
  openSheet('武將資料 · 數值與裝備', (body) => {
    if (!gens.length) {
      body.innerHTML = '<div style="font-size:16px;color:var(--ink-3)">這座城沒有在城武將。</div>';
      body.__noOk = true;
      return;
    }
    const row = (g) => {
      const name = g.NAME;
      const eq = Saves.equipSlotsOf ? Saves.equipSlotsOf(save, name) : {};
      const lv = Saves.num(save.generalLevel?.[name]) || 1;
      const loyal = Number.isFinite(Number(save.loyal?.[name])) ? Math.trunc(Number(save.loyal[name])) : (Saves.num(g.LOYAL) || 0);
      const equip = [eq.weapon || g.Weapon || '—', eq.horse || g.Horse || '—', eq.book || g.Thing || '—'].join(' · ');
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td>${lv}</td>
        <td>${fmt(g.STR)}</td>
        <td>${fmt(g.INT)}</td>
        <td style="font-size:14px">武 ${escapeHtml(equip.split(' · ')[0])}<br>馬 ${escapeHtml(equip.split(' · ')[1] || '—')}<br>物 ${escapeHtml(equip.split(' · ')[2] || '—')}</td>
        <td>${loyal}</td>
        <td>${tireOfName(name)}</td></tr>`;
    };
    body.innerHTML = `<table class="info">
      <thead><tr><th>武將</th><th>等級</th><th>武</th><th>智</th><th>裝備</th><th>忠</th><th>疲</th></tr></thead>
      <tbody>${gens.map(row).join('')}</tbody></table>
      <div style="margin-top:10px;display:flex;gap:10px;align-items:center">
        <button class="btn primary" id="goItems"><span>使用物品</span></button>
        <span style="font-size:14px;color:var(--ink-3)">背包與裝備在 items.html；看完/用完回這頁即可。</span>
      </div>`;
    body.__noOk = true;   // 只有「取消」與上面那顆按鈕，不設預設確定
    const go = body.querySelector('#goItems');
    if (go) go.onclick = () => {
      persist();
      location.href = M.itemsUrl(cityDef.NAME) + (UNLIMITED ? '&unlimited=1' : '');
    };
  });
  // 看資料不占令（和情報同一口徑）
  afterCommand(false);
}

/* 出征抽屜 */
function openDeploy() {
  const targets = M.deployTargets(save, cityDef, ctx);
  if (!targets.length) {
    say('出征', 'warn', '相鄰沒有可出征的敵城（或只有關卡）。');
    afterCommand(false);
    return;
  }
  let pick = targets[0].name;
  openSheet('出征 · 選目標', (body) => {
    body.innerHTML = targets.map((t) => `<button class="pick ${t.name === pick ? 'on' : ''}" data-name="${escapeHtml(t.name)}">
      <div><div class="nm">${escapeHtml(t.name)}</div>
        <div class="st">${t.owner ? '勢力 ' + escapeHtml(t.owner) : '無主空城'}</div></div>
      <div class="rt">兵 ${fmt(t.troops)}<br>防 ${fmt(t.def)}<br>將 ${t.generals}</div></button>`).join('')
      + `<div style="font-size:14px;color:var(--ink-3)">出征會交給 deploy.html 編隊；本頁只負責帶目標城過去。</div>`;
    body.querySelectorAll('.pick').forEach((el) => {
      el.onclick = () => { pick = el.dataset.name; body.querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === el)); };
    });
    body.__ok = () => {
      // 出征也吃月令：先记位再跳转（deploy.html 本身不改）
      if (M.markMonthActed(save, UNLIMITED)) persist();
      location.href = M.deployUrl(pick) + (UNLIMITED ? '&unlimited=1' : '');
    };
  });
}

/* ---------------- 抽屜基礎 ---------------- */
/**
 * 開底部抽屜。build(body) 負責畫內容；要處理「確定」時在 build 裡設 body.__ok = fn，
 * 追劇本時設 body.__noOk = true 隱藏確定鍵。
 */
function openSheet(title, build) {
  $('sheetTitle').textContent = title;
  const body = $('sheetBody');
  body.innerHTML = '';
  body.__ok = null;
  body.__noOk = false;
  build(body);
  const ok = $('sheetOk');
  ok.style.display = body.__noOk ? 'none' : '';
  ok.onclick = () => { if (typeof body.__ok === 'function') body.__ok(); };
  $('mask').classList.add('on');
  $('sheet').classList.add('on');
}
function closeSheet() {
  $('mask').classList.remove('on');
  $('sheet').classList.remove('on');
  $('sheetBody').innerHTML = '';
}

/* ---------------- 綁定 ---------------- */
$('mask').onclick = closeSheet;
$('sheetCancel').onclick = closeSheet;
$('btnBack').onclick = () => { location.href = './campaign.html'; };
$('btnRefresh').onclick = () => location.reload();

function onCmd(cmd, bypassLock = false, execName = '') {
  if (!cityDef) { say(cmd, 'warn', '沒有我方城池。'); renderLog(); return; }
  // [F1] 內政窗口：非正月／內政已終了 → 只讀查看（按鈕本來就 disabled，這裡兜住鍵盤與除錯路徑）
  if (!bypassLock && readOnly()) {
    say(cmd, 'warn', readOnlyHint());
    renderHud();
    renderGrid();
    renderLog();
    return;
  }
  if (cmd === '開發') doDevelop(execName);
  else if (cmd === '徵兵') doRecruit();
  else if (cmd === '搜索') doSearch(execName);
  else if (cmd === '移動') openMove();
  else if (cmd === '任命') openAppoint();
  else if (cmd === '武將資料' || cmd === '物品') openGeneralData();   // [F7] 物品併進「武將資料」
  else if (cmd === '情報') openIntel();
  else if (cmd === '出征') openDeploy();
  else if (cmd === '自治') openAuto();
}
// 七令在 #grid、副令（情報/移動）在 #subgrid，兩塊共用同一個入口
for (const id of ['grid', 'subgrid']) {
  const el = $(id);
  if (el) el.onclick = (e) => {
    const b = e.target.closest('.cmd');
    if (b) onCmd(b.dataset.cmd);
  };
}

/* ---------------- 啟動 ---------------- */
fit();
renderGrid();
renderHud();
renderLog();
// [audio] 内政 BGM（10–14 五档）：按我方城数取档，阈值 9/18/26/37 见 project/41 与 37c
audio()?.bgm(`domestic:${(save.owned || []).length}`);

/* 除錯口子：?do=develop,search,search；?dump=1 把存檔前後差異塞進 <pre id="dump">
 * 這是除錯入口（UI 上沒有），所以它繞過「一月一令」——正式按鈕仍受 lastActionMonth 限制。 */
const plan = String(dbg('do') || '').split(',').map((s) => s.trim()).filter(Boolean);
const MAP = { develop: '開發', recruit: '徵兵', search: '搜索', move: '移動', appoint: '任命', item: '武將資料', intel: '情報', deploy: '出征', auto: '自治' };
const snapshot = plan.length ? JSON.stringify({ gold: M.nationalGold(save, scenario?.cities || []), cityGold: cityDef ? M.cityMoneyOf(save, cityDef) : 0, cities: save.cities[cityDef?.NAME], roster: save.roster, appointed: save.appointed }) : '';
for (const step of plan) {
  const cmd = MAP[step] || step;
  if (cmd === '出征' || cmd === '移動' || cmd === '任命' || cmd === '情報' || cmd === '武將資料' || cmd === '自治') continue;
  // [F8] 開發/搜索要指定執行武將；除錯口子直接拿太守（沒有太守就拿名冊第一個），
  // 這樣 `?do=develop` 仍是一條命令一次執行，不會卡在選將抽屜上。
  const needExec = cmd === '開發' || cmd === '搜索';
  const exec = needExec
    ? (M.majorOf(save, cityDef) || M.rosterOf(save, cityDef.NAME, ctx)[0]?.NAME || '')
    : '';
  if (needExec && !exec) continue;
  onCmd(cmd, true, exec);
}
if (DEV && qs.has('dump') && qs.get('dump') !== '0') {
  // 不顯示：只把 JSON 塞進 <pre id="dump">，用 Edge --dump-dom 取。要肉眼看時加 ?dump=show。
  const d = $('dump');
  d.style.display = dbg('dump') === 'show' ? 'block' : 'none';
  d.textContent = '<<<DUMP\n' + JSON.stringify({
    city: cityDef?.NAME,
    slot: activeSlot,
    before: snapshot ? JSON.parse(snapshot) : null,
    after: { gold: M.nationalGold(save, scenario?.cities || []), cityGold: cityDef ? M.cityMoneyOf(save, cityDef) : 0, cities: save.cities[cityDef?.NAME], roster: save.roster, appointed: save.appointed, searchLog: (save.searchLog || []).slice(-6) },
  }, null, 1) + '\nDUMP>>>';
}
/* 截圖/驗收用：?sheet=recruit|auto|intel 進頁就打開對應抽屜（除錯參數，不算玩法） */
const dbgSheet = dbg('sheet');
if (dbgSheet) {
  const sheetMap = { recruit: doRecruit, auto: openAuto, intel: openIntel, move: openMove, appoint: openAppoint, deploy: openDeploy, general: openGeneralData };
  try { sheetMap[dbgSheet]?.(); } catch (err) { console.error(err); }
}

/* [F15] 頁間真協議：大地圖「徵兵」按鈕 → `?city=X&cmd=recruit` 直接開城內同一個抽屜。
 * 非正月／窗口已終了 → 不開抽屜，只留一條 warn（F1：非正月只讀）。 */
if (qs.get('cmd') === 'recruit' && cityDef) {
  if (readOnly()) say('徵兵', 'warn', readOnlyHint());
  else doRecruit();
}

/* [F12] 頁間真協議：大地圖「開發」按鈕 → `?city=X&cmd=develop` 直接開城內同一個選將抽屜。
 * 舊口徑是大地圖直接 `gold -= 400; pop += 3000`（第三套算法、繞過太守與逐將年令）。
 * 非正月／窗口已終了 → 不開抽屜，只留一條 warn（F1：非正月只讀）。 */
if (qs.get('cmd') === 'develop' && cityDef) {
  if (readOnly()) say('開發', 'warn', readOnlyHint());
  else doDevelop();
}

window.__city = {
  save, cityDef, ctx, M, Saves, era, unlimited: UNLIMITED, locked: M.monthLocked(save, UNLIMITED),
  // 驗收用：R12 的四個數字、R10 的自治清單、殿內背景挑了哪張
  prep: cityDef ? M.prepStateOf(save, cityDef) : null,
  caps: cityDef ? M.armCaps(save, cityDef, ctx) : null,
  auto: M.autoCities(save),
  // 原作內政 8 欄的原始數字（截圖驗收時直接讀，不必 OCR）
  civic: M.civicFields(save, scenario?.cities || [], ctx),
  hall: $('stage').dataset.hall,
  tick: autoTick,
  // [F1/F2/F3] 驗收用：窗口狀態、逐將年令、在路上名單、可執行武將
  view: VIEW,
  inAffairs: inAffairsMonth(),
  readOnly: readOnly(),
  acted: () => M.actedNames(save),
  away: () => Object.keys(M.awayNameSet(save)),
  freeExecs: () => M.rosterOf(save, cityDef.NAME, ctx).filter((g) => !M.actedLocked(save, g.NAME)).map((g) => g.NAME),
  onCmd,
  doDevelop,
  doSearch,
  openGeneralData,
  // [F16] 驗收用：國庫（Σ 我方每城 money）與本城金分開讀，還原同屏兩個數的標籤
  national: M.nationalGold(save, scenario?.cities || []),
  cityGold: cityDef ? M.cityMoneyOf(save, cityDef) : 0,
  // [F19] 驗收用：當前/上限 + 是否超編
  gensCap: cityDef ? M.officerCapState(M.rosterOf(save, cityDef.NAME, ctx).length) : null,
  // [F7] 驗收用：七令（CMD_ORDER）與副令（CMD_SECONDARY）
  cmdOrder: M.CMD_ORDER,
  cmdSecondary: M.CMD_SECONDARY,
};
