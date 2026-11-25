/**
 * CityModel.ts — 城池內政八命令的**純邏輯**（Cocos 側移植，來源 `game/web/city_model.js`）。
 *
 * 邊界（和 web 版一致）：
 *   - 不引 `cc`、不碰 DOM / fetch / localStorage ⇒ 可以在 node 裡直接 import 跑對拍。
 *   - 只讀寫傳進來的 `save` 物件；不知道「存檔存在哪」。
 *   - 規則依據全部留在註解裡（docs/04c 的位址），改數值只改 §1 的 INCR。
 *
 * 移植規則（project/69 §1 有完整對照表）：
 *   1. 導出名、參數順序、回傳**欄位名與欄位順序**都與 web 版一一對應
 *      （`work/cocos_city/parity.mjs` 用 JSON.stringify 逐字節比對，順序不同就會紅）。
 *   2. web 版 `import { intOr, monthLabel, num } from './saves.js'`，Cocos 側沒有 saves.js，
 *      三個純函式**原樣內嵌**在 §0（程式碼一字不改，行為等同 import）。
 *   3. 型別只是給 TS 看的；執行時仍然吃「老存檔可能缺欄位 / 值是字串」的髒資料，
 *      所以每一處都保留 web 版的 `Number.isFinite(Number(x))` 式容錯，不靠型別保證。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/* ======================================================================
 * §0 saves.js 的三個純函式（原樣內嵌；web 版是 import）
 * ==================================================================== */

/** 任何值 → 有限數字，否則 0（= `game/web/saves.js:31`） */
export function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 整數化並夹到 [min,max]；非有限值回 fallback（= `game/web/saves.js:37`） */
export function intOr(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** 月序號 → "第N年M月"（= `game/web/saves.js:57`） */
export function monthLabel(month: unknown): string {
  const m = Math.max(1, Math.trunc(num(month)) || 1);
  return `第${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
}

/* ======================================================================
 * §0b 型別（只描述形狀，不做執行時檢查）
 * ==================================================================== */

/** 一般物件判定（web 版是 `x && typeof x === 'object' && !Array.isArray(x)`） */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 一城的運行態。欄位齊全是 `ensureCityState()` 的責任（web 版也一樣）。 */
export interface CityState {
  troops: number;
  pop: number;
  money: number;
  def: number;
  cav: number;
  inf: number;
  prep: number;
  prepMonth: number;
  [key: string]: unknown;
}

/** `save.roster`：城名 → 額外將名；`_moved`：被調走的將 → 落腳城（04c §2.2） */
export interface Roster {
  _moved?: Record<string, string>;
  [city: string]: unknown;
}

export interface Appointed {
  [city: string]: { major?: string; wise?: string };
}

export interface LogEntry {
  t: string;
  m: number;
  city: string;
  cmd: string;
  kind: string;
  text: string;
}

/**
 * 內政用的存檔視圖：**web city.html 的 save 形狀**。
 * Cocos 的 `GameState.CampaignSave` 只是它的子集（缺 def/cav/inf/prep…），
 * 由 `CityPanel` 負責把兩邊拼起來（見 project/69 §4）。
 */
export interface CitySave {
  gold?: number;
  month?: number;
  owned?: string[];
  cities?: Record<string, CityState>;
  roster?: Roster;
  appointed?: Appointed;
  searchLog?: LogEntry[];
  /** 本城歷史搜索次數 `{ [城名]: 次數 }`（R20 種子的單調計數器） */
  searchSeq?: Record<string, number>;
  /** 搜索種子的存檔 nonce（R20；普通可列舉欄位，跟著存檔走） */
  searchNonce?: number;
  /** campaign.html 的 ensureGeneralLevels 寫入的真實等級（R17 搜索等級第 3 來源） */
  generalLevel?: Record<string, number>;
  foundItems?: number[];
  auto?: Record<string, number>;
  autoMonth?: number;
  lastActionMonth?: number;
  [key: string]: unknown;
}

/** generals.json 的一行（只列本檔會讀的欄位；`city_by_times` 是原作 5 劇本的位置表） */
export interface CityGeneral {
  NAME: string;
  STR?: number;
  INT?: number;
  Loyal?: number;
  CITY?: string;
  Status?: string;
  level?: number;
  city_by_times?: unknown;
  status_by_times?: unknown;
  WISESKILL?: unknown;
}

/** items.json 的一行（只列掉落表會讀的欄位） */
export interface CityItem {
  Sequence?: number;
  Name?: string;
  Attrib?: string;
  TYPE?: string;
  Rate?: number;
  Level?: number;
  SearchType?: number;
  Loyal?: number;
  Force?: number | string;
  Battle?: number | string;
}

/** wises.json 的一行 */
export interface CityWise {
  SEQUENCE?: number;
  NAME?: string;
}

/** 劇本的 path（`Length >= 30000` 是「畫了線但走不通」的哨兵，04c §5.2） */
export interface CityPath {
  Start?: string;
  End?: string;
  Length?: number;
}

/** 劇本的 city（04c §2.2 的城結構） */
export interface CityDef {
  NAME: string;
  KING?: string | number;
  MAJOR?: string;
  WISE?: string;
  POPULATION?: number;
  DEFENSE?: number;
  MONEY?: number;
  RATE?: number;
}

export interface CityScenario {
  cities?: CityDef[];
  paths?: CityPath[];
}

/** garrison.json 的「一座城」那一條（本模組只用到 garrison；其餘欄位留給呼叫方／情報） */
export interface GarrisonRow {
  owner?: string;
  major?: string;
  wise?: string;
  officers?: { name?: string; str?: number; int?: number }[];
  garrison?: number | string;
}

/** garrison.json 的一個劇本（`cities` = 城名 → GarrisonRow） */
export interface GarrisonScenario {
  cities?: Record<string, GarrisonRow>;
}

/** 內政命令共用的上下文（= web city.html 的 `ctx`） */
export interface CityCtx {
  generals?: CityGeneral[];
  items?: CityItem[];
  wises?: CityWise[];
  scenario?: CityScenario;
  scenIdx?: number;
  /**
   * `garrison.json` 原始陣列（`[{cities:{城名:{owner,major,wise,officers,garrison}}}]`）。
   * 只有「關卡守軍兵力」用它（關卡 POPULATION=0，兵力在 garrison.json 上）；
   * 不給也安全：`gateTroopsOf()` 回落 `GATE_TROOPS_FALLBACK`（=110，與現行資料相同）。
   */
  garrison?: GarrisonScenario[] | null;
  /** items.html 的背包序號（R18 唯一物品判定要用） */
  bag?: number[];
  /** 除錯用：generals.json 沒有等級欄位時給定值（web 的 `?lv=`） */
  level?: number;
  /** R17：搜索掉落的「執行動作武將」等級（測試/呼叫方明確指定） */
  searchLevel?: number;
}

/* ======================================================================
 * §1 命令表 + 常量總表
 * ==================================================================== */

export const CMD_ORDER = ['開發', '徵兵', '搜索', '移動', '任命', '物品', '情報', '出征'];

/** 原作有、但不在任務書「八條」裡的命令（R10 自治，04c §2.3 0x4278CE / 0x4278F5） */
export const CMD_EXTRA = ['自治'];

export interface CmdMeta {
  tag: string;
  sub: string;
  cost: string;
}

export const CMD_META: Record<string, CmdMeta> = {
  開發: { tag: '開　發', sub: '人口＋ 防禦＋', cost: '400 金' },
  徵兵: { tag: '部隊徵兵', sub: '預備兵 → 步／騎', cost: '不花金' },
  搜索: { tag: '搜　索', sub: '人才／寶物／兵符', cost: '200 金' },
  移動: { tag: '移動武將', sub: '調兵調將到鄰城', cost: '免費' },
  任命: { tag: '太守·軍師', sub: '改守將與軍師', cost: '免費' },
  物品: { tag: '物　品', sub: '裝備／兵符一覽', cost: '—' },
  情報: { tag: '情　報', sub: '本城＋鄰城兵力', cost: '—' },
  出征: { tag: '出　征', sub: '攻打鄰接之城', cost: '—' },
  自治: { tag: '自治施行', sub: '設定城按月代開發', cost: '各城 400 金' },
};

export const INCR_GRADES = ['依據', '推測', '新設計'];

export interface IncrRow {
  v: number;
  grade: string;
  src: string;
}

/**
 * 所有「抄不到數值」或「要對齊原作公式」的數字只寫一次（web 版 §1 同表）。
 * grade：'依據' = docs 有地址/字串可對；'推測' = 結構推得；'新設計' = 本作自訂。
 */
export const INCR: Record<string, IncrRow> = {
  /* ---- 開發（04c §2.3 執行體 0x427A84／印字 0x48B3AC・0x48B3BC／飽和串 0x427EF5） ---- */
  devGold: { v: 0, grade: '依據', src: '原作開發不收金：0x427B9E 外殼呼叫 0x427A84/0x427947 後只印字，`city+0x92` 全程不動（f2 全 .text 只 12 條寫 +0x92，皆非開發）；R85 由 400 改 0' },
  devPop: { v: 3000, grade: '新設計', src: 'R9 已定位：0x427A84 push 0xBB8 + call 0x450117 ⇒ 人口增量的隨機項 = rand()%3000（本值即模數）' },
  devDef: { v: 12, grade: '新設計', src: 'R9 已定位：0x427947 push 0xC + call 0x450117 ⇒ 防禦增量的隨機項 = rand()%12（本值即模數）' },
  devPopCap: { v: 1000000, grade: '新設計', src: 'R9 已定位：0x427A84 的人口硬閘 0xF4240 = 1,000,000（不是 400000）' },
  devDefCap: { v: 999, grade: '新設計', src: 'R9 已定位：0x427947 的防禦硬閘 0x3E7 = 999（04c §2.3 只寫「有上限」）' },

  /* ---- 徵兵（舊口徑：金換兵；原作線見 enlist / 預備兵） ---- */
  recruitGold: { v: 500, grade: '新設計', src: '沿用 campaign.html 既有「徵兵 500 金」；原作面板（0x489138..0x489170）只有兵數沒有金' },
  recruitTroops: { v: 40, grade: '新設計', src: '沿用 campaign.html 既有「+40 兵」' },

  /* ---- 預備兵池（R12；04c §2.2 +0x82 上限 / +0x86 現有值） ---- */
  prepDiv: { v: 2500, grade: '依據', src: 'docs/04c §2.2：預備兵上限 = min(POPULATION/2500 + 110, 600)，常量 0x9C4/0x6E/0x258 在 0x42D8F0' },
  prepBase: { v: 110, grade: '依據', src: 'docs/04c §2.2 同一條公式的常數 0x6E=110（0x42D8F0）' },
  troopsCap: { v: 600, grade: '依據', src: '04c §2.2 +0x82 的 600；部隊兵沿用同一硬上限（原作是武將帶兵數加總，見 project/49「沒做」）' },
  prepGainPct: { v: 0.10, grade: '新設計', src: '預備兵月補充＝上限的 10%；04c 只證明有預備兵池（+0x86），補充公式未定位（§2.4）' },
  prepPerTroop: { v: 1, grade: '推測', src: '04c §2.3 面板「預備兵 %d」與「總兵數 %d」並列 ⇒ 1 預備兵換 1 兵' },

  /* ---- 步／騎分列（R12；04c §3.2 武將 +0x42 帶兵上限、+0x46 騎兵上限） ---- */
  cavLvBase: { v: 20, grade: '依據', src: 'docs/04c §3.2：騎兵上限 = clamp((等級−20)×5, 0, 100)（game/src/core/battle.ts cavalryCapOf 同式）' },
  cavPerLv: { v: 5, grade: '依據', src: 'docs/04c §3.2 每升一級 +5 騎兵，0 起算於 20 級' },
  cavCapMax: { v: 100, grade: '依據', src: 'docs/04c §3.2 騎兵上限封頂 100（battle.ts cavalryCapOf 同式）' },
  troopLvBase: { v: 20, grade: '依據', src: 'docs/04c §3.2 +0x42：等級≥20 時帶兵上限 100，未滿 20 為 等級×5' },
  troopLvMax: { v: 100, grade: '依據', src: 'docs/04c §3.2 單將帶兵上限封頂 100' },

  /* ---- 搜索（04c §2.3 只有兩條結果串 0x426F81 / 0x427009） ---- */
  searchGold: { v: 200, grade: '新設計', src: '04c 沒有搜索費用的字串或公式' },
  searchWTalent: { v: 30, grade: '新設計', src: '已不再決定「人才 vs 物品」（那一段按原作 0x48a260 的 50/30/20），此值只留給舊測試；實際分工見 SEARCH.STAGE1' },
  searchWTreasure: { v: 25, grade: '新設計', src: '物品輪盤內部的寶物相對權重（原作 0x408EE2 的物品分派未定位品類比例）' },
  searchWTalisman: { v: 20, grade: '新設計', src: '物品輪盤內部的兵符／陣法書相對權重（原作未定位，見 project/29 §5-5）' },
  searchWNone: { v: 25, grade: '新設計', src: '物品輪盤的「空手」權重；依據 project/01 行 555「搜索空手也要有反饋」' },

  /* ---- 太守 → 內政效率 ---- */
  effDiv: { v: 300, grade: '新設計', src: 'R9 已定位：0x427A84/0x427947 都做 base += base*(太守INT−0x46)*2/0x12C ⇒ 分母 0x12C=300' },
  effMax: { v: 0.25, grade: '新設計', src: '停用：R9 之後太守係數是 1+(INT−70)*2/300（原作無封頂），此值只為保留鍵與舊測試' },
};

/** 取 INCR 的值（缺鍵回 0；值本身可能是小數） */
export function incrVal(key: string): number {
  const row = INCR[key];
  return row && Number.isFinite(Number(row.v)) ? Number(row.v) : 0;
}

/** 供自測／文件用的平坦表：[{key, v, grade, src}] */
export function incrRows(): Array<{ key: string; v: number; grade: string; src: string }> {
  return Object.keys(INCR).map((key) => ({ key, v: INCR[key].v, grade: INCR[key].grade, src: INCR[key].src }));
}

/** 開發：花金 → 人口＋、防禦＋（web 版同表；COST 由 R85 改 0，原作開發免費） */
export const DEV = {
  COST: incrVal('devGold'),
  POP: incrVal('devPop'),
  DEF: incrVal('devDef'),
  POP_CAP: incrVal('devPopCap'),
  DEF_CAP: incrVal('devDefCap'),
};

/**
 * R9 公式裡的兩個係數（不進 INCR 表：那張表的鍵數/等級分佈被既有測試釘死）。
 *   人口：執行武將 INT × 100（原作 `(INT*1000)/10`）
 *   防禦：執行武將 STR × 0.4（原作 `(STR*4)/10`）
 */
export const DEV_FORMULA = {
  PER_INT: 100,
  PER_STR: 0.4,
};

/**
 * R9 太守係數（原作 0x427A84 / 0x427947 是同一段程式碼）：
 *   `base += base * (太守INT − 0x46) * 2 / 0x12C`
 * ⇒ 乘數 = 1 + (太守INT − 70) * 2 / 300。太守智力 70 不增不減，原作**沒有**上下夾。
 */
export const MAJOR_RULE = { PIVOT: 70, NUM: 2, DEN: incrVal('effDiv') };

/** 太守乘數（浮點；整數增量走 `scaledGain`，兩者同源） */
export function majorFactor(intel: unknown): number {
  return 1 + ((num(intel) - MAJOR_RULE.PIVOT) * MAJOR_RULE.NUM) / MAJOR_RULE.DEN;
}

/**
 * 徵兵（兩種口徑，R12 之後）：
 *   `recruit()`  舊口徑：花金 → 兵＋（campaign.html 系與既有自測用）
 *   `enlist()`   原作線：消耗**預備兵** → 部隊兵＋，且分步／騎（面板 0x489138..0x489170）
 */
export const RECRUIT = {
  COST: incrVal('recruitGold'),
  TROOPS: incrVal('recruitTroops'),
  PREP_DIV: incrVal('prepDiv'),
  PREP_BASE: incrVal('prepBase'),
  CAP: incrVal('troopsCap'),
  PREP_GAIN_PCT: incrVal('prepGainPct'),
  PREP_PER_TROOP: incrVal('prepPerTroop'),
};

/** 兵種：步／騎（面板 0x489138「步兵數」、0x489148「騎兵數」） */
export const ARMS = ['inf', 'cav'];
export const ARM_NAMES: Record<string, string> = { inf: '步兵', cav: '騎兵' };

/** 搜索：花金 → 人才／寶物／兵符或陣法書／什麼也沒有（R11 兩段式） */
export const SEARCH = {
  COST: incrVal('searchGold'),
  MAX_LOG: 60,
  /** 第一段（原作 0x48a260 前三格 50/30/20 只區分「武將 / 兩格都算物品」） */
  STAGE1: { talent: 50, item: 50 },
  /** 第二段：物品輪盤內部的相對權重（原作未定位） */
  WEIGHTS: {
    talent: incrVal('searchWTalent'),
    treasure: incrVal('searchWTreasure'),
    talisman: incrVal('searchWTalisman'),
    none: incrVal('searchWNone'),
  },
};

/** 移動：04c §5.1 明說沒有移動力/地形代價 ⇒ 免費、不看距離 */
export const MOVE = { COST: 0 };

/** 任命：原件沒有任命費用的痕跡 ⇒ 免費 */
export const APPOINT = { COST: 0 };

/** 太守係數（R9 已定位）：見上方 MAJOR_RULE；`DIV` 保留給既有測試對 `incrVal('effDiv')` */
export const EFF = { DIV: MAJOR_RULE.DEN, MAX_BONUS: incrVal('effMax'), PIVOT: MAJOR_RULE.PIVOT };

/** 道路哨兵（04c §5.2 / campaign.html:318） */
export const PATH_SENTINEL = 30000;

/** 關卡：FLAGS==1 不可通行（04c §5.2）；實務上用 RATE===0 判，見 isGate() */
export const FLAG_GATE = 1;

/** 物品存檔（**不是** 戰役存檔；items.html 自己的鍵，形狀 {equip,bag}） */
export const BAG_KEY = 'sanguo_items_v1';
/** items.html:190 的預設背包 */
export const DEFAULT_BAG = [1, 4, 49, 52, 14, 20, 45, 56, 57, 73, 76, 77];

/* ======================================================================
 * §2 隨機（R20：原作是 rand()，本作改成「真隨機 + 每份存檔一個 nonce」）
 *   種子 = hashSeed('search', 存檔 nonce, city, month, count)。
 *   `setRng(fn)` / `setSearchNonce(save, n)` 只給測試釘死來源，不改已完成的事。
 * ==================================================================== */

/** 測試注入口：null = 走真隨機 */
let rngOverride: (() => number) | null = null;

/** 注入隨機源（`setRng(null)` 還原）。fn 必須回 [0, 1)。 */
export function setRng(fn: unknown): (() => number) | null {
  rngOverride = typeof fn === 'function' ? (fn as () => number) : null;
  return rngOverride;
}

/** 取一個 [0, 1) 隨機數：注入源 → crypto → Math.random */
export function rngNext(): number {
  if (rngOverride) return rngOverride();
  const c = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => void } }).crypto : null;
  if (c && typeof c.getRandomValues === 'function') {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}

/** `rand()%n` 的對等物（原作 0x450117）：n<=0 回 0。 */
export function randBelow(n: unknown): number {
  const k = Math.trunc(num(n));
  if (!(k > 0)) return 0;
  return Math.min(k - 1, Math.floor(rngNext() * k));
}

/** 太守縮放的整數版（與原作同序：先乘後除、C 的向零截斷） */
export function scaledGain(base: unknown, intel: unknown): number {
  const b = Math.trunc(num(base));
  const d = Math.trunc(num(intel)) - MAJOR_RULE.PIVOT;
  return b + Math.trunc((b * d * MAJOR_RULE.NUM) / MAJOR_RULE.DEN);
}

/** 存檔的搜索 nonce 欄位名（普通可列舉欄位：要跟著存檔走） */
export const SEARCH_NONCE_KEY = 'searchNonce';

/** 一個 32 位真隨機整數（頁面開新局／讀老檔時寫進 save.searchNonce） */
export function randomNonce(): number {
  return randBelow(4294967296) >>> 0;
}

/**
 * 取本存檔的 nonce；沒有就是 **0**（= 舊的可復現口徑）。
 * 刻意**不在這裡自動生成**：測試要能完全重現，真隨機由頁面開局時注入。
 */
export function searchNonce(save: CitySave | null | undefined): number {
  if (!save || typeof save !== 'object') return 0;
  const v = Number(save[SEARCH_NONCE_KEY]);
  return Number.isFinite(v) && v >= 0 ? Math.trunc(v) >>> 0 : 0;
}

/** 把 nonce 釘成指定值（頁面開局注入；測試要復現也用它） */
export function setSearchNonce(save: CitySave | null | undefined, n: unknown): number {
  if (!save || typeof save !== 'object') return 0;
  const v = intOr(n, 0, 0) >>> 0;
  try {
    Object.defineProperty(save, SEARCH_NONCE_KEY, { value: v, configurable: true, writable: true, enumerable: true });
  } catch {
    (save as Record<string, unknown>)[SEARCH_NONCE_KEY] = v;
  }
  return v;
}

/** FNV-1a 32 位：把 (nonce, 城, 月, 第幾次搜索) 壓成種子 */
export function hashSeed(...parts: unknown[]): number {
  const s = parts.map((p) => String(p)).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：32 位狀態、無外部依賴，瀏覽器與 node 同結果 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 搜索種子 = hash(nonce, city, month, count)；nonce 缺省走 0（相容舊呼叫） */
export function searchSeed(city: string, month: unknown, count: unknown, nonce: unknown = 0): number {
  return hashSeed('search', intOr(nonce, 0, 0), city, intOr(month, 1, 1), intOr(count, 0, 0));
}

/* ======================================================================
 * §3 小工具
 * ==================================================================== */

/** 預備兵上限 = min(POP/2500 + 110, 600)（依據：docs/04c §2.2 +0x82） */
export function troopCapOf(pop: unknown): number {
  return Math.min(Math.floor(num(pop) / RECRUIT.PREP_DIV) + RECRUIT.PREP_BASE, RECRUIT.CAP);
}

/** 預備兵上限：與 `troopCapOf` 同一條公式，語義是 +0x82（預備兵） */
export function prepCapOf(pop: unknown): number {
  return troopCapOf(pop);
}

/**
 * R15 年度稅收（原作 0x423824，由年度結算 0x423885 呼叫）：
 *   city.money += (pop * 75) / 10000 + 2250（C 的整數除法＝向下取整）
 * 原作沒有月度收入、沒有月度複利、沒有俸祿；金錢是每城欄位，總金 = Σ 城金。
 */
export const TAX = { POP_NUM: 75, POP_DEN: 10000, FLAT: 2250 };

/** 一座城一年的稅收；pop<=0 也照樣給固定額（原作先加固定額再算人口項） */
export function annualTax(pop: unknown): number {
  const p = Math.max(0, Math.trunc(num(pop)));
  return Math.floor((p * TAX.POP_NUM) / TAX.POP_DEN) + TAX.FLAT;
}

/**
 * 武將等級：general+0x42/+0x46 都要它，但 generals.json 沒有等級欄位（04c §7-6 未定位）。
 * 有 `level` 用它，否則取 `ctx.level`（除錯口徑），再否則 20 ⇒ 騎兵上限 0，只出步兵。
 */
export function levelOf(general: CityGeneral | null | undefined, ctx?: CityCtx | null): number {
  const own = Number(general?.level);
  if (Number.isFinite(own) && own > 0) return Math.max(1, Math.min(99, Math.floor(own)));
  const fallback = Number(ctx?.level);
  if (Number.isFinite(fallback) && fallback > 0) return Math.max(1, Math.min(99, Math.floor(fallback)));
  return 20;
}

/**
 * R17：搜索掉落的「執行動作武將」等級（原作 0x408EE2(g, c) 的 g）。
 *
 * 次序：ctx.searchLevel → ctx.level → save.generalLevel[太守] → 武將自帶 level。
 * 都沒有 → 0 = 等級未知（**不套** 04b2 §5.3 的等級窗；不能拿 levelOf 的 20 當默認）。
 */
export function searchLevelOf(
  save: CitySave | null | undefined,
  cityDef: CityDef | null | undefined,
  ctx?: CityCtx | null,
): number {
  const explicit = Math.trunc(num(ctx?.searchLevel));
  if (explicit > 0) return Math.min(99, Math.max(1, explicit));
  const debug = Math.trunc(num(ctx?.level));
  if (debug > 0) return Math.min(99, Math.max(1, debug));
  const name = majorOf(save, cityDef);
  if (!name) return 0;
  const gl = save && isRecord(save.generalLevel) ? save.generalLevel : null;
  const stored = gl ? Math.trunc(num(gl[name])) : 0;
  if (stored > 0) return Math.min(99, Math.max(1, stored));
  const own = Math.trunc(num(generalOf(ctx?.generals, name)?.level));
  return own > 0 ? Math.min(99, Math.max(1, own)) : 0;
}

/** 單將帶兵上限（04c §3.2 +0x42：等級≥20 為 100，未滿為 等級×5） */
export function troopMaxOf(level: unknown): number {
  const lv = Math.max(1, Math.min(99, Math.floor(num(level) || 20)));
  return lv >= incrVal('troopLvBase') ? incrVal('troopLvMax') : lv * 5;
}

/** 單將騎兵上限（04c §3.2 +0x46：clamp((等級−20)×5, 0, 100)） */
export function cavalryCapOf(level: unknown): number {
  const lv = Math.floor(num(level) || 20);
  return Math.max(0, Math.min(incrVal('cavCapMax'), (lv - incrVal('cavLvBase')) * incrVal('cavPerLv')));
}

/**
 * 殿內背景（R9 之外的 UI 規則也放這裡，才測得到）：
 *   城規模 RATE 1..5 → hall_01..05；人口 ≥ 300000 的大城／都城 → hall_06。
 */
export function hallIndexOf(cityDef: CityDef | null | undefined): number {
  const rate = Math.max(1, Math.min(5, intOr(cityDef?.RATE, 1, 1)));
  const pop = num(cityDef?.POPULATION);
  if (pop >= 300000) return 6;
  return rate;
}

/**
 * 朝堂背景的**實際在包資源**路徑。
 *
 * 舊值 `assets/bg/env/hall_0N.jpg` 是 AI 生成圖，x1-cocos-art 之後已不再進包
 * （`bg/env` 31 檔 2.72 MB 從未進 bundle，見 `project/114_Cocos美术收尾.md` §3），
 * 留著只會指向不存在的檔案。原作來源是 `export\png\SHAPE\POLICY\PALAIS0N.png`
 * （640×480），x1 預烘成 `bg/policy/palais_0N.webp` 並接進 `CityPanel`。
 * 這裡改成同一組路徑，呼叫端不必再各自拼字串。
 */
export function hallImageOf(cityDef: CityDef | null | undefined): string {
  // hallIndexOf 會給到 6（人口 ≥30 萬的大城用最豪的一張），但原作 POLICY 只有 PALAIS01..05，
  // 所以這裡要 clamp 到 1..5；舊寫法 `hall_0$6` 在 web 目錄有第 6 張、在 Cocos 包裡沒有。
  const n = Math.max(1, Math.min(5, hallIndexOf(cityDef)));
  return `assets/bg/policy/palais_0${n}.webp`;
}

/** 該劇本裡這名將在哪座城（city_by_times 優先，缺了退回靜態 CITY） */
export function cityOf(general: CityGeneral | null | undefined, scenIdx = 0): string {
  const list = general?.city_by_times;
  const v = Array.isArray(list) ? list[scenIdx] : '';
  return typeof v === 'string' && v ? v : String(general?.CITY || '');
}

/** 該劇本裡這名將的狀態：未 / 登 / 野（「野」= 在野，可被搜索招到） */
export function statusOf(general: CityGeneral | null | undefined, scenIdx = 0): string {
  const list = general?.status_by_times;
  const v = Array.isArray(list) ? list[scenIdx] : '';
  return typeof v === 'string' && v ? v : String(general?.Status || '');
}

export function generalOf(generals: CityGeneral[] | null | undefined, name: string): CityGeneral | null {
  return (Array.isArray(generals) ? generals : []).find((g) => g && g.NAME === name) || null;
}

/** 道路鄰接（只認 Length < 30000 的真路；04c §5.2） */
export function neighboursOf(cityName: string | undefined, scenario: CityScenario | null | undefined): string[] {
  const out: string[] = [];
  const paths = Array.isArray(scenario?.paths) ? scenario.paths : [];
  for (const p of paths) {
    if (num(p.Length) >= PATH_SENTINEL) continue;
    if (p.Start === cityName) out.push(p.End as string);
    else if (p.End === cityName) out.push(p.Start as string);
  }
  return Array.from(new Set(out.filter((n) => typeof n === 'string' && n)));
}

/** 城資料（scenario.cities 裡的那一條） */
export function cityDefOf(cityName: string | undefined, scenario: CityScenario | null | undefined): CityDef | null {
  return (Array.isArray(scenario?.cities) ? scenario.cities : []).find((c) => c?.NAME === cityName) || null;
}

/**
 * 關卡判定：**RATE（城市規模）為 0**。實測 12 座關全是 RATE=0/POPULATION=0，
 * 一般城 RATE=3 ⇒ 用 RATE 判，不碰 FLAGS（其 bit 語義 04c §5.2 未定）。
 */
export function isGate(cityDef: CityDef | null | undefined): boolean {
  return num(cityDef?.RATE) === 0 || num(cityDef?.POPULATION) === 0;
}

/**
 * 關卡守軍的兜底值：`garrison.json` 的五個劇本、12 座關全部是 `garrison:110`
 * （`data/garrison.json[0].cities['易京'] = {owner:"", major:"", wise:"", officers:[], garrison:110}`）。
 * 與 web `game/web/city_model.js:488` 同名同值（對拍要求逐欄位一致）。
 */
export const GATE_TROOPS_FALLBACK = 110;

/**
 * 關卡守軍兵力：**`garrison.json` 的 `garrison` 為準**，不是 `troopCapOf(POPULATION)`。
 *
 * 關卡的 `POPULATION=0`，`troopCapOf(0)` 剛好也是 110（`RECRUIT.PREP_BASE`），舊碼「看起來對」
 * 純屬巧合；garrison.json 一改數字就會兩邊不一致。資料形狀 = `garrison.json` 原始陣列
 * （`[{cities:{城名:{...}}}]`），由呼叫方透過 `ctx.garrison` 注入（本模組不讀檔）。
 * 對應 web：`game/web/city_model.js:490-508`。
 */
export function gateTroopsOf(
  cityName: string,
  cityDef: CityDef | null | undefined,
  ctx?: CityCtx | null,
): number {
  const list = Array.isArray(ctx?.garrison) ? (ctx?.garrison as GarrisonScenario[]) : [];
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const row = list[scenIdx]?.cities?.[cityName];
  const n = num(row?.garrison);
  if (n > 0) return n;
  if (GATE_TROOPS_FALLBACK > 0) return GATE_TROOPS_FALLBACK;
  return troopCapOf(cityDef?.POPULATION);
}

/* ======================================================================
 * §4 存檔新增欄位：roster / appointed / searchLog / foundItems / auto
 *    —— 缺省容錯是第一要求：老存檔沒有這些鍵也要能直接打開。
 * ==================================================================== */

/**
 * 容錯整理新欄位（就地修改並回傳 save）。
 *   roster   : { [城名]: [將名…], _moved: { [將名]: 所在城 } }
 *   appointed: { [城名]: { major, wise } }
 *   searchLog: [{ t, m, city, cmd, kind, text }]（最近 SEARCH.MAX_LOG 條）
 */
export function ensureExtras<T extends CitySave>(save: T): T {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return save;

  const rawRoster = isRecord(save.roster) ? save.roster : {};
  const roster: Roster = {};
  for (const [city, list] of Object.entries(rawRoster)) {
    if (city === '_moved' || !Array.isArray(list)) continue;
    const names = Array.from(new Set(list.filter((n): n is string => typeof n === 'string' && n !== '')));
    if (names.length) roster[city] = names;
  }
  const rawMoved: Record<string, unknown> = isRecord(rawRoster._moved) ? rawRoster._moved : {};
  const moved: Record<string, string> = {};
  for (const [name, city] of Object.entries(rawMoved)) {
    if (typeof name === 'string' && name && typeof city === 'string' && city) moved[name] = city;
  }
  if (Object.keys(moved).length) roster._moved = moved;
  save.roster = roster;

  const rawAp = isRecord(save.appointed) ? save.appointed : {};
  const appointed: Appointed = {};
  for (const [city, v] of Object.entries(rawAp)) {
    if (!isRecord(v)) continue;
    const major = typeof v.major === 'string' ? v.major : '';
    const wise = typeof v.wise === 'string' ? v.wise : '';
    if (major || wise) appointed[city] = { major, wise };
  }
  save.appointed = appointed;

  const rawLog = Array.isArray(save.searchLog) ? save.searchLog : [];
  save.searchLog = rawLog
    .filter((e) => !!e && typeof e === 'object' && typeof e.text === 'string' && e.text)
    .map((e) => ({
      t: String(e.t || ''),
      m: intOr(e.m, 1, 0),
      city: String(e.city || ''),
      cmd: String(e.cmd || ''),
      kind: String(e.kind || 'info'),
      text: String(e.text),
    }))
    .slice(-SEARCH.MAX_LOG);

  // 搜索次數計數器：{ [城名]: 次數 }。種子必須單調遞增，**不能數 searchLog** ——
  // 日誌只留 SEARCH.MAX_LOG 條，第 61 次起 count 凍結在 60，種子固定、結果退化成同一條。
  // 老存檔沒有這個鍵時，用日誌裡還能看到的搜索條數補一個下限（日誌已截斷的城只能補到 60）。
  const rawSeq = isRecord(save.searchSeq) ? save.searchSeq : null;
  const seq: Record<string, number> = {};
  if (rawSeq) {
    for (const [city, n] of Object.entries(rawSeq)) {
      if (typeof city !== 'string' || !city) continue;
      const v = Math.trunc(num(n));
      if (v > 0) seq[city] = v;
    }
  } else {
    for (const e of save.searchLog) {
      if (e.cmd !== '搜索' || !e.city) continue;
      seq[e.city] = (seq[e.city] || 0) + 1;
    }
  }
  save.searchSeq = seq;

  // R8 一月一令：記「哪個月已經下過令」。0/缺省 = 本月還沒動（換月後月份變大，條件自然失效）。
  save.lastActionMonth = intOr(save.lastActionMonth, 0, 0);

  // R18 唯一物品（ONLYONE）：本局已經搜出來過的物品序號（跟著戰役存檔走，背包被清也不會重掉）。
  const rawFound = Array.isArray(save.foundItems) ? save.foundItems : [];
  save.foundItems = Array.from(new Set(rawFound.map((n) => Math.trunc(num(n))).filter((n) => n > 0))).slice(-200);

  // R10 自治：{ [城名]: 1 } ＝ 該城「設定自治」；autoMonth ＝ 上一次執行自治的月份。
  const rawAuto: Record<string, unknown> = isRecord(save.auto) ? save.auto : {};
  const auto: Record<string, number> = {};
  for (const [city, v] of Object.entries(rawAuto)) {
    if (typeof city === 'string' && city && (v === true || v === 1 || v === '1')) auto[city] = 1;
  }
  save.auto = auto;
  save.autoMonth = intOr(save.autoMonth, 0, 0);
  return save;
}

/** 新建一城的運行態：欄位順序與 web 版 `ensureCityState()` 的賦值順序一致（JSON 逐字節比對靠這點） */
function blankCityState(): CityState {
  // NaN 只是佔位：ensureCityState 的每個 `!Number.isFinite(Number(x))` 分支都必定改寫它，
  // 與 web 版「先建空物件再逐鍵賦值」的結果（值與鍵序）完全相同。
  return {
    troops: NaN,
    pop: NaN,
    money: NaN,
    def: NaN,
    cav: NaN,
    inf: NaN,
    prep: NaN,
    prepMonth: NaN,
  };
}

/** 每城運行態：兵/民/金 沿用 saves.js 的形狀，另加 `def`／`cav`／`inf`／`prep`／`prepMonth`。 */
export function ensureCityState(
  save: CitySave,
  cityDef: CityDef | null | undefined,
): CityState | null {
  if (!save || typeof save !== 'object' || !cityDef || !cityDef.NAME) return null;
  if (!isRecord(save.cities)) save.cities = {};
  let st = save.cities[cityDef.NAME];
  if (!isRecord(st)) {
    st = blankCityState();
    save.cities[cityDef.NAME] = st;
  }
  if (!Number.isFinite(Number(st.troops))) st.troops = troopCapOf(cityDef.POPULATION);
  if (!Number.isFinite(Number(st.pop))) st.pop = num(cityDef.POPULATION);
  if (!Number.isFinite(Number(st.money))) st.money = num(cityDef.MONEY);
  // `def` 是內政頁新增的**城防運行態**：原作 DEFENSE 是城結構 +0x8E 的可變欄位。
  if (!Number.isFinite(Number(st.def))) st.def = num(cityDef.DEFENSE);
  st.troops = Math.max(0, Math.trunc(num(st.troops)));
  st.pop = Math.max(0, Math.trunc(num(st.pop)));
  st.money = Math.max(0, Math.trunc(num(st.money)));
  st.def = Math.max(0, Math.trunc(num(st.def)));
  // R12 步／騎分列：`troops` 仍是**唯一權威**，`inf + cav === troops` 是恆等式。
  st.cav = Math.max(0, Math.min(st.troops, Math.trunc(num(st.cav))));
  st.inf = st.troops - st.cav;
  // R12 預備兵池（+0x86 現有 / +0x82 上限）：第一次碰到時給滿池。
  if (!Number.isFinite(Number(st.prep))) st.prep = prepCapOf(st.pop);
  st.prep = Math.max(0, Math.min(prepCapOf(st.pop), Math.trunc(num(st.prep))));
  st.prepMonth = intOr(st.prepMonth, 0, 0);
  return st;
}

/**
 * 步／騎上限（R12）：兩欄相加 = 部隊兵硬上限 600。
 *   騎兵上限 = Σ min(武將騎兵上限, 武將帶兵上限)（04c §3.2 +0x46／+0x42）
 *   步兵上限 = 600 − 騎兵上限
 */
export function armCaps(
  save: CitySave,
  cityDef: CityDef | null | undefined,
  ctx?: CityCtx | null,
): { total: number; cav: number; inf: number } {
  const total = RECRUIT.CAP;
  let cav = 0;
  for (const g of rosterOf(save, cityDef?.NAME, ctx)) {
    const lv = levelOf(g, ctx);
    cav += Math.min(cavalryCapOf(lv), troopMaxOf(lv));
  }
  cav = Math.max(0, Math.min(total, cav));
  return { total, cav, inf: total - cav };
}

/** 預備兵現況（面板 0x48B2B8「預備兵 %d/%d」與 HUD 用） */
export function prepStateOf(save: CitySave, cityDef: CityDef | null | undefined): { prep: number; cap: number } {
  const st = ensureCityState(save, cityDef);
  if (!st) return { prep: 0, cap: 0 };
  return { prep: st.prep, cap: prepCapOf(st.pop) };
}

/**
 * 換月補預備兵（R12）：每月補上限的 10%、補到滿（補充公式未定位，見 04c §2.4）。
 * 以 `st.prepMonth` 逐月 lazy tick 記帳 ⇒ 中間幾個月沒開頁面也不會漏。
 */
export function refillPrep(
  save: CitySave,
  cityDef: CityDef | null | undefined,
): { ok: boolean; gained: number; cap: number; prep?: number; first?: boolean } {
  const st = ensureCityState(save, cityDef);
  if (!st) return { ok: false, gained: 0, cap: 0 };
  const cap = prepCapOf(st.pop);
  const month = intOr(save?.month, 1, 1);
  const last = intOr(st.prepMonth, 0, 0);
  if (!(month > last)) return { ok: true, gained: 0, cap, prep: st.prep };
  // 第一次結算（新檔／老檔補欄位）：只記帳、不補兵，否則開局第一個月會白拿一次。
  if (last === 0) {
    st.prepMonth = month;
    return { ok: true, gained: 0, cap, prep: st.prep, first: true };
  }
  const gain = Math.max(1, Math.floor(cap * RECRUIT.PREP_GAIN_PCT));
  const gained = Math.min(cap - st.prep, gain * (month - last));
  if (gained > 0) st.prep += gained;
  st.prepMonth = month;
  return { ok: true, gained: Math.max(0, gained), cap, prep: st.prep };
}

/**
 * 部隊徵兵（R12，原作線）：消耗**預備兵** → 部隊兵，分步／騎
 * （04c §2.3 面板 0x489138「步兵數 %d/%d」/ 0x489148「騎兵數 %d/%d」/
 *   0x489164「預備兵 %d」/ 0x489170「總兵數 %d」）。不花金。
 *   reason: 'no-city' | 'bad-arm' | 'none' | 'no-prep' | 'arm-full' | 'troops-full'
 */
export function enlist(
  save: CitySave,
  cityDef: CityDef | null | undefined,
  opts: { arm?: string; n?: unknown } | null | undefined,
  ctx?: CityCtx | null,
): {
  ok: boolean;
  reason?: string;
  arm?: string;
  n?: number;
  taken?: number;
  caps?: { total: number; cav: number; inf: number };
  troops?: number;
  prep?: number;
  cap?: number;
} {
  const st = ensureCityState(save, cityDef);
  if (!st) return { ok: false, reason: 'no-city' };
  const arm = opts?.arm === 'cav' ? 'cav' : opts?.arm === 'inf' ? 'inf' : '';
  if (!arm) return { ok: false, reason: 'bad-arm' };
  const want = Math.trunc(num(opts?.n));
  if (!(want > 0)) return { ok: false, reason: 'none', arm };

  const caps = armCaps(save, cityDef, ctx);
  const armLeft = arm === 'cav' ? caps.cav - st.cav : caps.inf - st.inf;
  const troopLeft = caps.total - st.troops;
  if (armLeft <= 0) return { ok: false, reason: 'arm-full', arm, cap: arm === 'cav' ? caps.cav : caps.inf };
  if (troopLeft <= 0) return { ok: false, reason: 'troops-full', arm, cap: caps.total };
  if (st.prep <= 0) return { ok: false, reason: 'no-prep', arm, prep: 0 };

  const n = Math.min(want, armLeft, troopLeft, st.prep);
  const prep = n * RECRUIT.PREP_PER_TROOP;
  st.prep -= prep;
  if (arm === 'cav') st.cav += n;
  else st.inf += n;
  st.troops = st.inf + st.cav;
  return { ok: true, arm, n, taken: prep, caps, troops: st.troops, prep: st.prep };
}

export function cityStateOf(save: CitySave | null | undefined, cityName: string | undefined): CityState | null {
  const st = save?.cities?.[cityName as string];
  return isRecord(st) ? (st as CityState) : null;
}

/**
 * 這座城的將（本城常駐 ＋ 搜索/移入的），按 武+智 降序。
 * 「在野」的將不算守軍：要在 roster[城] 有名字（被招到）才進名單。
 * 被調走的將記在 roster._moved[將名] = 落腳城，所以原城不再列他。
 */
export function rosterOf(
  save: CitySave | null | undefined,
  cityName: string | undefined,
  ctx?: CityCtx | null,
): CityGeneral[] {
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const generals = Array.isArray(ctx?.generals) ? ctx.generals : [];
  const moved = (save?.roster?._moved as Record<string, string> | undefined) || {};
  const rawExtra = save?.roster?.[cityName as string];
  const extra = Array.isArray(rawExtra) ? (rawExtra as string[]) : [];
  const extraSet = new Set(extra);
  const out: CityGeneral[] = [];
  const seen = new Set<string>();
  for (const g of generals) {
    if (!g || !g.NAME || g.NAME === '盜賊') continue;
    const home = cityOf(g, scenIdx);
    const movedTo = moved[g.NAME] || '';
    if (movedTo) {
      if (movedTo !== cityName || seen.has(g.NAME)) continue;
      seen.add(g.NAME);
      out.push(g);
      continue;
    }
    if (home !== cityName) continue;
    if (statusOf(g, scenIdx) === '野' && !extraSet.has(g.NAME)) continue;
    if (seen.has(g.NAME)) continue;
    seen.add(g.NAME);
    out.push(g);
  }
  for (const name of extra) {
    if (seen.has(name)) continue;
    if (moved[name] && moved[name] !== cityName) continue;
    const g = generalOf(generals, name);
    if (!g) continue;
    seen.add(name);
    out.push(g);
  }
  return out.sort((a, b) => num(b.STR) + num(b.INT) - (num(a.STR) + num(a.INT)));
}

/**
 * 已經「在我方任一城」的將名（搜索時排除，避免同一個將被搜到兩次）。
 * 只算：我方城的常駐將（狀態不是「野」）＋ roster 額外名單 ＋ 被調動過的將。
 */
export function stationedNames(save: CitySave | null | undefined, ctx?: CityCtx | null): Set<string> {
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const generals = Array.isArray(ctx?.generals) ? ctx.generals : [];
  const owned = new Set(Array.isArray(save?.owned) ? save.owned : []);
  const moved = (save?.roster?._moved as Record<string, string> | undefined) || {};
  const set = new Set<string>();
  for (const g of generals) {
    if (!g || !g.NAME || g.NAME === '盜賊') continue;
    const home = cityOf(g, scenIdx);
    if (!home || !owned.has(home)) continue;
    if (statusOf(g, scenIdx) === '野') continue;
    set.add(g.NAME);
  }
  for (const [city, list] of Object.entries(save?.roster || {})) {
    if (city === '_moved' || !Array.isArray(list)) continue;
    for (const n of list) set.add(n as string);
  }
  for (const n of Object.keys(moved)) set.add(n);
  return set;
}

/** 本城在野武將池（04c §2.3 搜索 → 將軍加入我方；狀態「野」= 在野） */
export function wildPool(
  save: CitySave | null | undefined,
  cityName: string | undefined,
  ctx?: CityCtx | null,
): CityGeneral[] {
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const generals = Array.isArray(ctx?.generals) ? ctx.generals : [];
  const taken = new Set(rosterOf(save, cityName, ctx).map((g) => g.NAME));
  const all = stationedNames(save, ctx);
  // 這座城裡「已經被招到」的將不再出現（roster[城] 有名字就算）
  const raw = save?.roster?.[cityName as string];
  // 註：三元式不能直接寫在 for...of 的右邊 —— Creator 的 Babel（transform-for-of）
  // 會對 ConditionalExpression 做類型推導並崩在 tsUnionType（BABEL_TRANSFORM_ERROR），
  // 所以先提出成常數。這裡踩過一次，見 project/71。
  const rawList: string[] = Array.isArray(raw) ? (raw as string[]) : [];
  for (const n of rawList) taken.add(n);
  return generals.filter(
    (g) =>
      g &&
      g.NAME &&
      g.NAME !== '盜賊' &&
      cityOf(g, scenIdx) === cityName &&
      statusOf(g, scenIdx) === '野' &&
      !taken.has(g.NAME) &&
      !all.has(g.NAME),
  );
}

/* ======================================================================
 * §5 內政效率（太守）
 * ==================================================================== */

/** 現任太守名（任命過就用任命的，否則用劇本 MAJOR；04c §2.2 +0x14） */
export function majorOf(save: CitySave | null | undefined, cityDef: CityDef | null | undefined): string {
  const ap = save?.appointed?.[cityDef?.NAME as string] || {};
  if (typeof ap.major === 'string' && ap.major) return ap.major;
  return typeof cityDef?.MAJOR === 'string' ? cityDef.MAJOR : '';
}

/** 現任軍師名（04c §2.2 +0x18） */
export function wiseOf(save: CitySave | null | undefined, cityDef: CityDef | null | undefined): string {
  const ap = save?.appointed?.[cityDef?.NAME as string] || {};
  if (typeof ap.wise === 'string' && ap.wise) return ap.wise;
  return typeof cityDef?.WISE === 'string' ? cityDef.WISE : '';
}

/** 內政效率 = 1 + min(INT/400, 0.25) [新設計]（04c §7-5 係數無從抄） */
export function efficiencyOf(
  save: CitySave,
  cityDef: CityDef | null | undefined,
  ctx?: CityCtx | null,
): number {
  const name = majorOf(save, cityDef);
  const g = generalOf(ctx?.generals, name);
  return majorFactor(num(g?.INT));
}

/** 軍師技（把 WISESKILL 的「習得等級, 編號」第二列對到 wises.json；docs/03a 行65 / 04c §2.2 +0x75） */
export function wiseSkillsOf(
  general: CityGeneral | null | undefined,
  wises: CityWise[] | null | undefined,
): Array<{ id: number; name: string; level: number }> {
  const list = Array.isArray(general?.WISESKILL) ? (general?.WISESKILL as unknown[]) : [];
  const bySeq = new Map((Array.isArray(wises) ? wises : []).map((w) => [Number(w.SEQUENCE), w]));
  const out: Array<{ id: number; name: string; level: number }> = [];
  for (const row of list) {
    const parts = String(row).split(',').map((s) => s.trim());
    const id = Number(parts[1]);
    const w = bySeq.get(id);
    if (w && w.NAME) out.push({ id, name: w.NAME, level: Number(parts[0]) || 0 });
  }
  return out;
}

/* ======================================================================
 * §6 日誌
 * ==================================================================== */

export interface LogInput {
  t?: string;
  m?: unknown;
  city?: string;
  cmd?: string;
  kind?: string;
  text?: string;
}

/** 追加一條結果日誌（帶月份戳）；超過上限丟最舊的 */
export function logAdd(save: CitySave | null | undefined, entry: LogInput | null | undefined): LogEntry | null {
  if (!save || typeof save !== 'object') return null;
  ensureExtras(save);
  const month = intOr(entry?.m, 1, 1);
  const row: LogEntry = {
    t: typeof entry?.t === 'string' && entry.t ? entry.t : monthLabel(month),
    m: month,
    city: String(entry?.city || ''),
    cmd: String(entry?.cmd || ''),
    kind: String(entry?.kind || 'info'),
    text: String(entry?.text || ''),
  };
  if (!row.text) return null;
  const list = save.searchLog as LogEntry[];
  list.push(row);
  if (list.length > SEARCH.MAX_LOG) save.searchLog = list.slice(-SEARCH.MAX_LOG);
  return row;
}

/** 最近 n 條（新的在前），可限定只看某城 */
export function recentLog(save: CitySave | null | undefined, n = 6, cityName = ''): LogEntry[] {
  const list = Array.isArray(save?.searchLog) ? (save?.searchLog as LogEntry[]) : [];
  const filtered = cityName ? list.filter((e) => e.city === cityName) : list;
  return filtered.slice(-Math.max(0, n)).reverse();
}

/* ======================================================================
 * §7 八條命令
 * ==================================================================== */

/** 開發回傳 */
export interface DevelopResult {
  ok: boolean;
  reason?: string;
  cost?: number;
  pop?: number;
  def?: number;
  eff?: number;
  cap?: number;
}

/**
 * 開發：一次同時加人口與防禦（04c §2.3 0x427A84 的兩條印字 + R9 反彙編公式）。
 * 回傳 { ok, reason?, cost, pop, def, eff }
 *
 * R9 公式（與 web 逐字對齊）：
 *   人口 base = rand()%3000 + INT×100 → 過太守縮放 → 夾人口硬閘 1,000,000
 *   防禦 base = rand()%12  + STR×0.4 → 同一段太守縮放 → 夾防禦硬閘 999
 *   外殼 0x427B9E：兩個增量都 0 就靜默（reason:'nothing'）
 * 原作開發免費（R85），DEV.COST=0 ⇒ 不收金、也不會回 reason:'gold'。
 */
export function develop(save: CitySave, cityDef: CityDef | null | undefined, ctx?: CityCtx | null): DevelopResult {
  const st = ensureCityState(save, cityDef);
  if (!st) return { ok: false, reason: 'no-city' };
  // 0x405499(city)：FLAGS==2 的 12 座關城不能開發（原作在兩個公式入口前先 call）。
  // 與 web `city_model.js` 的 `develop()` 守衛同位置同語義 —— 少了這一條，兩端 parity（unit3）在
  // 「易京/開發」上會分岔：web 回 reason:'gate'、Cocos 卻真的把 pop 加上去（project/163 §5）。
  if (isGate(cityDef)) return { ok: false, reason: 'gate' };
  if (DEV.COST > 0 && num(save.gold) < DEV.COST) return { ok: false, reason: 'gold', cost: DEV.COST };
  if (st.pop >= DEV.POP_CAP && st.def >= DEV.DEF_CAP) return { ok: false, reason: 'saturated', cap: DEV.POP_CAP };

  const exec = generalOf(ctx?.generals, majorOf(save, cityDef));
  const intel = num(exec?.INT);
  const str = num(exec?.STR);
  const eff = majorFactor(intel);

  // 0x427A84：base = rand()%3000 + INT*100，再過太守縮放
  const popBase = randBelow(DEV.POP) + Math.trunc(intel * DEV_FORMULA.PER_INT);
  const pop = Math.min(DEV.POP_CAP - st.pop, Math.max(0, scaledGain(popBase, intel)));
  // 0x427947：base = rand()%12 + STR*0.4，再過同一段太守縮放
  const defBase = randBelow(DEV.DEF) + Math.trunc(str * DEV_FORMULA.PER_STR);
  const def = Math.min(DEV.DEF_CAP - st.def, Math.max(0, scaledGain(defBase, intel)));
  // 0x427B9E 外殼：兩個增量都是 0 就靜默（什麼都沒發生、也不印字）
  if (pop <= 0 && def <= 0) return { ok: false, reason: 'nothing', eff };

  if (DEV.COST > 0) save.gold = Math.max(0, num(save.gold) - DEV.COST);
  st.pop += pop;
  st.def += def;
  return { ok: true, cost: DEV.COST, pop, def, eff };
}

/** 徵兵（舊口徑）回傳 */
export interface RecruitResult {
  ok: boolean;
  reason?: string;
  cost?: number;
  troops?: number;
  cap?: number;
  eff?: number;
}

/**
 * 徵兵（**舊口徑**：花金 → 兵＋）。R12 之後頁面走 `enlist()`；這支留給 campaign.html 系與既有自測。
 * 仍然維持 `inf + cav === troops`：新增的兵算步兵。
 */
export function recruit(save: CitySave, cityDef: CityDef | null | undefined, ctx?: CityCtx | null): RecruitResult {
  const st = ensureCityState(save, cityDef);
  if (!st) return { ok: false, reason: 'no-city' };
  if (num(save.gold) < RECRUIT.COST) return { ok: false, reason: 'gold', cost: RECRUIT.COST };
  const cap = RECRUIT.CAP;
  if (st.troops >= cap) return { ok: false, reason: 'full', cap };

  const eff = efficiencyOf(save, cityDef, ctx);
  const add = Math.min(cap - st.troops, Math.max(1, Math.round(RECRUIT.TROOPS * eff)));
  save.gold = Math.max(0, num(save.gold) - RECRUIT.COST);
  st.inf += add;
  st.troops = st.inf + st.cav;
  return { ok: true, cost: RECRUIT.COST, troops: add, cap, eff };
}

/** 搜索結果 */
export interface SearchResult {
  ok: boolean;
  reason?: string;
  cost?: number;
  kind?: string;
  seq?: number;
  item?: CityItem | null;
  general?: CityGeneral;
  seed?: number;
  stage?: string;
  text?: string;
  logged?: boolean;
}

/**
 * 搜索：花金 → 人才／寶物／兵符或陣法書／什麼也沒有。
 * 種子 = hash(存檔 nonce, city, month, count)（R20）；count 取自 searchSeq（只增不減）。
 * 流程 = 原作 0x426D8C 的兩段式（R11）：先擲武將（STAGE1 的 50%），沒中才落物品輪盤（50%）。
 */
export function search(save: CitySave, cityDef: CityDef | null | undefined, ctx?: CityCtx | null): SearchResult {
  if (!cityDef || !cityDef.NAME) return { ok: false, reason: 'no-city' };
  if (num(save.gold) < SEARCH.COST) return { ok: false, reason: 'gold', cost: SEARCH.COST };

  const city = cityDef.NAME;
  const count = searchCount(save, city);
  const seed = searchSeed(city, save.month, count, searchNonce(save));
  const rng = mulberry32(seed);
  const pool = wildPool(save, city, ctx);
  const level = searchLevelOf(save, cityDef, ctx);

  // ---- 第一段（原作 0x48a260 的 50/30/20 → 只區分「武將」與「物品」）
  const s1 = SEARCH.STAGE1;
  const talentShare = num(s1.talent) / (num(s1.talent) + num(s1.item));
  // pool 空時短路、**不消耗** rng（web 同序）
  const firstTalent = pool.length > 0 && rng() < talentShare;

  let out: SearchResult | null = null;
  let stage = 'talent';
  if (firstTalent) {
    const g = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    if (g) {
      addToRoster(save, city, g.NAME);
      out = { ok: true, cost: SEARCH.COST, kind: 'talent', general: g, seed, text: `${g.NAME}將軍加入我方。` };
    }
  }
  if (!out) {
    // ---- 第二段（物品輪盤 0x408EE2；武將分支取不到人時原作也是落到這裡）
    stage = 'item';
    const pools = searchPools(ctx?.items, ownedItemSeqs(save, ctx), level);
    const weights: Record<string, number> = {
      treasure: SEARCH.WEIGHTS.treasure,
      talisman: SEARCH.WEIGHTS.talisman,
      none: SEARCH.WEIGHTS.none,
    };
    if (!pools.treasure.length) weights.treasure = 0;
    if (!pools.talisman.length) weights.talisman = 0;
    const kind = pickWeightedKey(weights, rng());
    if (kind === 'treasure' || kind === 'talisman') {
      const it = pickWeightedItem(pools[kind as 'treasure' | 'talisman'], rng(), (row) => searchItemWeight(row, level));
      if (it) rememberFound(save, it.Sequence);
      out = it
        ? { ok: true, cost: SEARCH.COST, kind, seq: num(it.Sequence), item: it, seed, text: `找到物品${it.Name}。` }
        : { ok: true, cost: SEARCH.COST, kind: 'none', seed, text: '搜索一無所獲。' };
    } else {
      out = { ok: true, cost: SEARCH.COST, kind: 'none', seed, text: '搜索一無所獲。' };
    }
  }
  out.stage = stage;
  save.gold = Math.max(0, num(save.gold) - SEARCH.COST);
  // 本函式自己記日誌：count = 本城歷史搜索次數，必須隨每次搜索遞增，否則種子固定、每次都是同一個結果。
  // 先自增再寫日誌：logAdd 會叫 ensureExtras，順序反過來老存檔遷移會把剛寫的這條也數進去（count+2）。
  bumpSearchSeq(save, city, count);
  logAdd(save, { city, cmd: '搜索', kind: out.kind, text: out.text, m: save.month });
  out.logged = true;
  return out;
}

/**
 * 本城歷史搜索次數（0 基的 count，就是這次要用的）。
 * 優先讀 `save.searchSeq`（單調計數器）；缺失時退回 `searchLog` 條數（老存檔/未經 ensureExtras）。
 */
export function searchCount(save: CitySave | null | undefined, cityName: string): number {
  const seq = save?.searchSeq;
  if (seq && typeof seq === 'object' && !Array.isArray(seq)) {
    const n = Number(seq[cityName]);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  const list = Array.isArray(save?.searchLog) ? (save?.searchLog as LogEntry[]) : [];
  return list.filter((e) => e.city === cityName && e.cmd === '搜索').length;
}

/** 搜索成功後把本城計數器 +1（只增不減；金不足早退不會走到這裡） */
function bumpSearchSeq(save: CitySave, cityName: string, prev: number): number {
  if (!isRecord(save.searchSeq)) save.searchSeq = {};
  const seq = save.searchSeq as Record<string, number>;
  const cur = Math.trunc(num(seq[cityName]));
  seq[cityName] = Math.max(prev + 1, Number.isFinite(cur) ? cur + 1 : 1);
  return seq[cityName];
}

/** 移動結果 */
export interface MoveResult {
  ok: boolean;
  reason?: string;
  troops?: number;
  asked?: number;
  general?: CityGeneral | null;
  from?: string;
  to?: string;
  cap?: number;
}

/**
 * 移動：把本城兵力／武將調往**相鄰的我方城**（04c §2.3 / §5.2）。
 * opts: { to, troops, general }
 */
export function move(
  save: CitySave,
  fromDef: CityDef | null | undefined,
  opts: { to?: string; troops?: unknown; general?: string } | null | undefined,
  ctx?: CityCtx | null,
): MoveResult {
  const from = fromDef?.NAME;
  const to = typeof opts?.to === 'string' ? opts.to : '';
  if (!from) return { ok: false, reason: 'no-city' };
  if (!to || to === from) return { ok: false, reason: 'target' };
  if (!Array.isArray(save.owned) || !save.owned.includes(from)) return { ok: false, reason: 'not-own-city' };
  if (!save.owned.includes(to)) return { ok: false, reason: 'not-owned' };
  if (!neighboursOf(from, ctx?.scenario).includes(to)) return { ok: false, reason: 'not-adjacent' };

  const toDef = cityDefOf(to, ctx?.scenario);
  if (!toDef) return { ok: false, reason: 'target' };
  const src = ensureCityState(save, fromDef);
  const dst = ensureCityState(save, toDef);
  if (!src || !dst) return { ok: false, reason: 'no-city' };

  const n = intOr(opts?.troops, 0, 0, Math.max(0, src.troops));
  const name = typeof opts?.general === 'string' ? opts.general : '';
  if (!n && !name) return { ok: false, reason: 'empty' };

  let general: CityGeneral | null = null;
  if (name) {
    general = rosterOf(save, from, ctx).find((g) => g.NAME === name) || null;
    if (!general) return { ok: false, reason: 'absent' };
  }

  let moved = 0;
  if (n > 0) {
    // 目的城也吃 600 的部隊兵上限；走不動的部分留在本城，不蒸發。
    moved = Math.min(n, src.troops, Math.max(0, RECRUIT.CAP - dst.troops));
    if (moved <= 0) return { ok: false, reason: 'full', from, to, cap: RECRUIT.CAP };
    // R12 步／騎分列：先走步兵、不夠再走騎兵（原作移動的是部隊、不細分兵種 ⇒ [推測]）
    const inf = Math.min(moved, src.inf);
    const cav = moved - inf;
    src.inf -= inf;
    src.cav -= cav;
    dst.inf += inf;
    dst.cav += cav;
    src.troops = src.inf + src.cav;
    dst.troops = dst.inf + dst.cav;
  }
  if (general) {
    // 調走太守/軍師要一併卸任，不然城的守將會指向不在城裡的人
    const ap = save.appointed?.[from];
    if (ap) {
      if (ap.major === general.NAME) ap.major = '';
      if (ap.wise === general.NAME) ap.wise = '';
      if (!ap.major && !ap.wise) delete save.appointed?.[from];
    }
    detachGeneral(save, from, general, ctx);
    attachGeneral(save, to, general, ctx);
  }
  return { ok: true, troops: moved, asked: n, general, from, to };
}

/** 出征目標 */
export interface DeployTarget {
  name: string;
  owner: string;
  gate: boolean;
  troops: number;
  def: number;
  generals: number;
}

/**
 * 出征目標：相鄰、不是我方。**關卡也是目標**（04c §2.3 / §5.2）。
 *
 * 對應 web：`game/web/city_model.js:1088-1130`。關卡可以打、打完可以占，占了才能從它
 * 出發打下一座城（公孫瓚開局 北平<->南皮/代縣 都是 30000 斷行，只有 北平<->易京 78 是通路）；
 * 舊碼末尾 `.filter(row => !row.gate)` 把關卡剔掉，等於這一勢力永久沒有出征目標。
 *
 * 關卡欄位口徑（與 web 逐欄位一致）：
 *   - `owner`：劇本 `KING` 是 TIMES.INI 殘留的 1..12 序號（`易京.KING === 1`，數字），不是君主名，
 *     所以一律 `''`（無主）；不要讀 `def.KING`，否則列表會出現「勢力 3」這種假名字。
 *   - `troops`：關卡 `POPULATION=0`，兵力改讀 `garrison.json`（`gateTroopsOf`）。
 *   - `gate`：保留 `true`，UI 用它印「關」徽標。
 */
export function deployTargets(
  save: CitySave | null | undefined,
  cityDef: CityDef | null | undefined,
  ctx?: CityCtx | null,
): DeployTarget[] {
  const owned = Array.isArray(save?.owned) ? (save?.owned as string[]) : [];
  return neighboursOf(cityDef?.NAME, ctx?.scenario)
    .filter((n) => !owned.includes(n))
    .map((name) => {
      const def = cityDefOf(name, ctx?.scenario);
      if (!def) return null;
      const st = cityStateOf(save, name) || ({} as CityState);
      const gate = isGate(def);
      return {
        name,
        owner: gate ? '' : String(def.KING || ''),
        gate,
        troops: gate ? gateTroopsOf(name, def, ctx) : (num(st.troops) || troopCapOf(def.POPULATION)),
        def: Number.isFinite(Number(st.def)) ? num(st.def) : num(def.DEFENSE),
        generals: rosterOf(save, name, ctx).length,
      };
    })
    .filter((row): row is DeployTarget => !!row);
}

/** 情報的一行 */
export interface CityRow {
  name: string;
  mine: boolean;
  gate: boolean;
  owner: string;
  troops: number;
  inf: number;
  cav: number;
  prep: number;
  prepCap: number;
  def: number;
  generals: number;
  major: string;
  auto: boolean;
}

/** 情報：本城 ＋ 相鄰城（只讀） */
export function intel(
  save: CitySave,
  cityDef: CityDef | null | undefined,
  ctx?: CityCtx | null,
): { self: CityRow | null; rows: CityRow[] } {
  if (!cityDef?.NAME) return { self: null, rows: [] };
  const owned = Array.isArray(save?.owned) ? save.owned : [];
  const self = cityRow(save, cityDef, ctx, owned);
  const rows = neighboursOf(cityDef.NAME, ctx?.scenario)
    .map((name) => cityDefOf(name, ctx?.scenario))
    .filter((def): def is CityDef => !!def)
    .map((def) => cityRow(save, def, ctx, owned));
  return { self, rows };
}

function cityRow(
  save: CitySave | null | undefined,
  cityDef: CityDef,
  ctx: CityCtx | null | undefined,
  owned: string[],
): CityRow {
  const st = cityStateOf(save, cityDef.NAME) || ({} as CityState);
  const mine = owned.includes(cityDef.NAME);
  const owner = String(cityDef.KING || '');
  const gate = isGate(cityDef);
  const pop = Number.isFinite(Number(st.pop)) ? num(st.pop) : num(cityDef.POPULATION);
  const troops = Number.isFinite(Number(st.troops)) ? num(st.troops) : troopCapOf(pop);
  const cav = Number.isFinite(Number(st.cav)) ? Math.min(num(st.cav), troops) : 0;
  return {
    name: cityDef.NAME,
    mine,
    gate,
    // 關卡的 KING 是 1..12 的序號，不是君主名，別直接印出來
    owner: mine ? '我方' : gate ? '關卡' : owner && !/^\d+$/.test(owner) ? owner : '無主',
    troops,
    // R12 步／騎分列（原作 0x489138「步兵數」／0x489148「騎兵數」）
    inf: troops - cav,
    cav,
    // R12 預備兵池（原作 0x48B2B8「預備兵 %d/%d」，+0x86 現有 / +0x82 上限）
    prep: Number.isFinite(Number(st.prep)) ? Math.min(num(st.prep), prepCapOf(pop)) : prepCapOf(pop),
    prepCap: prepCapOf(pop),
    def: Number.isFinite(Number(st.def)) ? num(st.def) : num(cityDef.DEFENSE),
    generals: rosterOf(save, cityDef.NAME, ctx).length,
    major: mine ? majorOf(save, cityDef) || '—' : String(cityDef.MAJOR || '') || '—',
    auto: isAuto(save, cityDef.NAME),
  };
}

/** 任命結果 */
export interface AppointResult {
  ok: boolean;
  reason?: string;
  role?: string;
  general?: CityGeneral;
  eff?: number;
}

/** 任命：改太守 / 軍師（04c §2.2 +0x14 太守、+0x18 軍師） */
export function appoint(
  save: CitySave,
  cityDef: CityDef | null | undefined,
  role: string,
  name: string,
  ctx?: CityCtx | null,
): AppointResult {
  if (role !== 'major' && role !== 'wise') return { ok: false, reason: 'role' };
  if (!cityDef?.NAME) return { ok: false, reason: 'no-city' };
  const g = rosterOf(save, cityDef.NAME, ctx).find((x) => x.NAME === name);
  if (!g) return { ok: false, reason: 'absent' };
  const appointed = save.appointed || {};
  const cur = appointed[cityDef.NAME] || { major: '', wise: '' };
  appointed[cityDef.NAME] = { ...cur, [role]: g.NAME };
  save.appointed = appointed;
  return { ok: true, role, general: g, eff: efficiencyOf(save, cityDef, ctx) };
}

/* ======================================================================
 * §7b R10 自治（原作內政選單「自治施行」）
 *   依據 docs/04c §2.3：0x42771A「沒有設定自治的城市!!%K%」、
 *   0x427865「執行城市自治完畢!!%K%」、0x4278CE / 0x4278F5「自治施行」。
 * ==================================================================== */

/** 自治命令的文字（頁面按鈕／日誌共用） */
export const AUTONOMY = {
  CMD: '自治',
  TITLE: '自治施行',
  NO_CITY: '沒有設定自治的城市!!',
  DONE: '執行城市自治完畢!!',
  ROW: (city: string, pop: number, def: number): string =>
    `${city}城自治：開墾 +${pop} 人口、+${def} 防禦。`,
};

/** 設定／解除某城自治；回傳 save（鏈式） */
export function setAuto<T extends CitySave>(save: T, cityName: string, on = true): T {
  ensureExtras(save);
  const name = typeof cityName === 'string' ? cityName.trim() : '';
  if (!name) return save;
  const auto = save.auto as Record<string, number>;
  if (on) auto[name] = 1;
  else delete auto[name];
  return save;
}

/** 已設定自治的城名；傳了 cityDefs 就照劇本順序回，否則照設定順序 */
export function autoCities(save: CitySave, cityDefs?: CityDef[] | null): string[] {
  ensureExtras(save);
  const set = new Set(Object.keys(save.auto || {}));
  if (!Array.isArray(cityDefs)) return Array.from(set);
  const ordered = cityDefs.filter((d) => d && set.has(d.NAME)).map((d) => d.NAME);
  for (const n of set) if (!ordered.includes(n)) ordered.push(n);
  return ordered;
}

/** 自治是否已開（純讀，不改存檔：情報面板要能安全呼叫） */
export function isAuto(save: CitySave | null | undefined, cityName: string): boolean {
  const a = save?.auto;
  if (!isRecord(a)) return false;
  const v: unknown = a[cityName];
  return v === 1 || v === true || v === '1';
}

export interface AutonomyRan {
  city: string;
  pop: number;
  def: number;
}

export interface AutonomyResult {
  ok: boolean;
  reason?: string;
  ran: AutonomyRan[];
  skipped: Array<{ city: string; reason: string }>;
  gold: number;
  cost: number;
  text: string;
}

/**
 * 執行自治（原作「自治施行」）：對每個已設定自治、且不是 `opts.from` 的城各做一次開發。
 * @param opts from = 當前所在城（不代行自己那座）、quiet = 不寫日誌
 */
export function runAutonomy(
  save: CitySave,
  cityDefs: CityDef[] | null | undefined,
  ctx?: CityCtx | null,
  opts: { from?: string; quiet?: boolean } = {},
): AutonomyResult {
  ensureExtras(save);
  const from = typeof opts.from === 'string' ? opts.from : '';
  const wanted = Object.keys(save.auto || {});
  const list = (Array.isArray(cityDefs) ? cityDefs : []).filter((d) => d && wanted.includes(d.NAME));
  const targets = list.filter((d) => d.NAME !== from);
  if (!targets.length) {
    return {
      ok: false,
      reason: 'none',
      ran: [],
      skipped: [],
      gold: num(save.gold),
      cost: 0,
      text: AUTONOMY.NO_CITY,
    };
  }

  const ran: AutonomyRan[] = [];
  const skipped: Array<{ city: string; reason: string }> = [];
  let cost = 0;
  for (const def of targets) {
    // 原作外殼 0x427B9E 只在「人口與防禦增量都 0」時靜默；單邊 0 是正常結果。
    // 但代行是替玩家按一次按鈕，日誌寫「開墾 +0 人口」很怪 ⇒ 代行層重擲到兩邊都有進帳（上限 8 次）。
    // 重擲**不重複收費**：每次重擲前把上一次的開發金退回，最後只記一次 cost。[新設計] 只影響代行層。
    let r = develop(save, def, ctx);
    for (let k = 0; k < 8 && (r.ok ? (r.pop as number) <= 0 || (r.def as number) <= 0 : r.reason === 'nothing'); k += 1) {
      if (r.ok && r.cost) save.gold = num(save.gold) + r.cost;
      r = develop(save, def, ctx);
    }
    if (r.ok) {
      cost += r.cost as number;
      ran.push({ city: def.NAME, pop: r.pop as number, def: r.def as number });
      if (!opts.quiet) {
        logAdd(save, {
          m: intOr(save.month, 1, 1),
          city: def.NAME,
          cmd: AUTONOMY.CMD,
          kind: 'auto',
          text: AUTONOMY.ROW(def.NAME, r.pop as number, r.def as number),
        });
      }
    } else {
      skipped.push({ city: def.NAME, reason: r.reason || 'skip' });
    }
  }
  const text = ran.length
    ? `${AUTONOMY.DONE}（${ran.length} 城，-${cost} 金）`
    : `${AUTONOMY.DONE}（0 城：${skipped[0]?.reason === 'gold' ? '金不足' : '無可開發'}）`;
  return {
    ok: ran.length > 0,
    reason: ran.length ? undefined : skipped[0]?.reason || 'none',
    ran,
    skipped,
    gold: num(save.gold),
    cost,
    text,
  };
}

export interface RefillRow {
  city: string;
  gained: number;
  prep: number;
  cap: number;
}

/**
 * 換月 lazy tick：把「預備兵補給」與「自治代行」補到當前月（一個月只結算一次）。
 * 由 city.html（Cocos 的 CityPanel）在載入時呼叫。
 */
export function autonomyTick(
  save: CitySave,
  cityDefs: CityDef[] | null | undefined,
  ctx?: CityCtx | null,
): { month: number; refilled: RefillRow[]; auto: AutonomyResult | null; first: boolean } {
  ensureExtras(save);
  const defs = Array.isArray(cityDefs) ? cityDefs.filter(Boolean) : [];
  const month = intOr(save?.month, 1, 1);
  const last = intOr(save.autoMonth, 0, 0);
  if (!(month > last)) return { month, refilled: [], auto: null, first: false };

  const refilled: RefillRow[] = [];
  for (const def of defs) {
    const r = refillPrep(save, def);
    if (r.gained > 0) refilled.push({ city: def.NAME, gained: r.gained, prep: r.prep as number, cap: r.cap });
    else if (r.ok) refilled.push({ city: def.NAME, gained: 0, prep: r.prep as number, cap: r.cap });
  }
  save.autoMonth = month;

  let auto: AutonomyResult | null = null;
  if (Object.keys(save.auto || {}).length) {
    // 自治每月都跑（不看 lastActionMonth：原作換月會清令，自治屬於換月後的代行）
    auto = runAutonomy(save, defs, ctx, { from: '' });
  }
  return { month, refilled, auto, first: last === 0 };
}

/* ======================================================================
 * §8 搜索掉落表（items.json 的 SearchType / Rate）
 * ==================================================================== */

/**
 * R17/R18：等級對掉落率的修正（= web `city_model.js` 的 `searchItemWeight`）。
 * 原作每件物品有 `Level`（適用等級）與 `SearchType`（1/2 是「等級窗」，其餘看 Rate 原值）：
 *   group 1：|lv-need| 每差 1 級除一次，差 >4 級直接 0
 *   group 2：只在 lv ≥ need-4 時出，lv < need 時按級差衰減
 * 回 0 就代表這件在當前太守等級下搜不到。
 */
export function searchItemWeight(it: CityItem | null | undefined, level: unknown): number {
  const rate = num(it?.Rate);
  if (rate <= 0) return 0;
  const lv = Math.trunc(num(level));
  if (lv <= 0) return rate; // 不知道等級 ⇒ 不修正（舊口徑）
  const need = Math.trunc(num(it?.Level));
  if (need <= 0) return rate; // 物品沒標等級 ⇒ 不修正
  const group = Math.trunc(num(it?.SearchType));
  if (group === 1) {
    const d = Math.abs(lv - need);
    if (d > 4) return 0;
    return d ? rate / d : rate;
  }
  if (group === 2) {
    if (lv < need - 4) return 0;
    return lv < need ? rate / (need - lv) : rate;
  }
  return rate;
}

/**
 * 兩張掉落表：
 *   talisman 兵符／陣法書 — SearchType===0 且 Force>0 或 Battle>0
 *   treasure 寶物       — SearchType 1/2 的兵器坐騎，加上 SearchType 0 的兵書（JEWEL_THING）與珠寶（Loyal>0）
 * Rate 是**權重**，Rate===0 的搜不到。R18：`Attrib === 'ONLYONE'` 的已擁有 ⇒ 不進池（全局唯一）。
 * R17：給了 level（>0）時，等級窗外的物品也一併不進池（與 web 同一個篩法）。
 */
export function searchPools(
  items: CityItem[] | null | undefined,
  taken: ReadonlySet<number | string> | Array<number | string> = [],
  level: unknown = 0,
): { talisman: CityItem[]; treasure: CityItem[] } {
  const held = new Set(
    Array.from(taken instanceof Set ? taken : Array.isArray(taken) ? taken : [])
      .map((n) => String(Math.trunc(num(n))))
      .filter((s) => s !== '0'),
  );
  const lv = Math.trunc(num(level));
  const talisman: CityItem[] = [];
  const treasure: CityItem[] = [];
  const itemList: CityItem[] = Array.isArray(items) ? (items as CityItem[]) : [];
  for (const it of itemList) {
    if (!it || !it.Name) continue;
    const rate = num(it.Rate);
    if (rate <= 0) continue;
    // R17：等級窗外的物品不進池（lv<=0 時 searchItemWeight 回原 rate，等於不篩）
    if (lv > 0 && searchItemWeight(it, lv) <= 0) continue;
    // R18：唯一物品已經有 ⇒ 這次搜索不可能再出（原作全局唯一）
    if (String(it.Attrib || '') === 'ONLYONE' && held.has(String(num(it.Sequence)))) continue;
    const group = num(it.SearchType);
    const type = String(it.TYPE || '');
    if (num(it.Force) > 0 || num(it.Battle) > 0) {
      if (group === 0) talisman.push(it);
    } else if (group === 1 || group === 2) {
      treasure.push(it);
    } else if (type === 'JEWEL_THING' || num(it.Loyal) > 0) {
      treasure.push(it);
    }
  }
  return { talisman, treasure };
}

/** 已擁有的物品序號：`ctx.bag` ∪ `save.foundItems`（R18 用它把唯一物品擋在池子外） */
export function ownedItemSeqs(save: CitySave | null | undefined, ctx?: CityCtx | null): number[] {
  const bag = Array.isArray(ctx?.bag) ? ctx.bag : [];
  const found = Array.isArray(save?.foundItems) ? (save.foundItems as number[]) : [];
  return Array.from(new Set([...bag, ...found].map((n) => Math.trunc(num(n))).filter((n) => n > 0)));
}

/** 記下「本局搜到過這件」，讓唯一物品下一次不再進池（R18） */
export function rememberFound<T extends CitySave | null | undefined>(save: T, seq: unknown): T {
  const n = Math.trunc(num(seq));
  if (!(n > 0) || !save) return save;
  if (!Array.isArray(save.foundItems)) save.foundItems = [];
  const list = save.foundItems as number[];
  if (!list.includes(n)) list.push(n);
  return save;
}

/* ======================================================================
 * §9 物品背包（items.html 的鍵；本頁只做「搜到就放進去」）
 * ==================================================================== */

/** 讀 items.html 的存檔形狀：{equip, bag}；背包＝擁有清單 */
export function parseItemsSave(raw: unknown): { equip: Record<string, unknown>; bag: number[] } {
  const out: { equip: Record<string, unknown>; bag: number[] } = { equip: {}, bag: [] };
  if (isRecord(raw)) {
    if (Array.isArray(raw.bag)) out.bag = raw.bag.map(Number).filter((n) => Number.isFinite(n));
    if (isRecord(raw.equip)) out.equip = raw.equip;
  }
  out.bag = Array.from(new Set(out.bag.filter((n) => Number.isFinite(n))));
  if (!out.bag.length) out.bag = DEFAULT_BAG.slice(); // 與 items.html:209 同一個預設
  return out;
}

/** 把一件物品加進背包（已擁有則不重複）；回傳新的存檔物件，不改入參 */
export function withBagItem(raw: unknown, seq: unknown): { equip: Record<string, unknown>; bag: number[] } {
  const n = num(seq);
  const out = parseItemsSave(raw);
  if (n && !out.bag.includes(n)) out.bag.push(n);
  return out;
}

/* ======================================================================
 * §10 內部：加/移將、加權抽樣
 * ==================================================================== */

export function addToRoster(save: CitySave, city: string, name: string): string[] {
  ensureExtras(save);
  const roster = save.roster as Roster;
  const raw = roster[city];
  const list: string[] = Array.isArray(raw) ? (raw as string[]) : [];
  if (!list.includes(name)) list.push(name);
  roster[city] = list;
  return roster[city] as string[];
}

function detachGeneral(save: CitySave, city: string, general: CityGeneral, ctx?: CityCtx | null): CitySave {
  ensureExtras(save);
  const roster = save.roster as Roster;
  const list = roster[city];
  if (Array.isArray(list)) {
    const arr = list as string[];
    const i = arr.indexOf(general.NAME);
    if (i >= 0) arr.splice(i, 1);
    if (!arr.length) delete roster[city];
  }
  return save;
}

function attachGeneral(save: CitySave, city: string, general: CityGeneral, ctx?: CityCtx | null): CitySave {
  ensureExtras(save);
  const roster = save.roster as Roster;
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const home = cityOf(general, scenIdx);
  if (home === city) {
    if (roster._moved) delete roster._moved[general.NAME];
    const list = roster[city];
    if (Array.isArray(list)) {
      const arr = list as string[];
      const i = arr.indexOf(general.NAME);
      if (i >= 0) arr.splice(i, 1);
      if (!arr.length) delete roster[city];
    }
    return save;
  }
  roster._moved = roster._moved || {};
  roster._moved[general.NAME] = city;
  return addToRoster(save, city, general.NAME) ? save : save;
}

function pickWeightedKey(weights: Record<string, number>, r: number): string {
  const entries = Object.entries(weights).filter(([, w]) => num(w) > 0);
  const total = entries.reduce((a, [, w]) => a + num(w), 0);
  if (!total) return 'none';
  let x = r * total;
  for (const [key, w] of entries) {
    x -= num(w);
    if (x < 0) return key;
  }
  return entries[entries.length - 1][0];
}

/**
 * 加權抽一件；`r` ∈ [0,1)。`weightOf` 可換算權重（R17 用等級窗折算），缺省就是 Rate。
 * 與 `pickWeightedKey` 同一個「乘總和再逐項減」的算法（原作 0x408EE2 的整數版）。
 */
function pickWeightedItem(
  list: CityItem[] | null | undefined,
  r: number,
  weightOf?: (it: CityItem) => number,
): CityItem | null {
  const weight = typeof weightOf === 'function' ? weightOf : (it: CityItem) => num(it.Rate);
  const rows = (Array.isArray(list) ? list : [])
    .map((it): [CityItem, number] => [it, num(weight(it))])
    .filter(([, w]) => w > 0);
  if (!rows.length) return null;
  const total = rows.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [it, w] of rows) {
    x -= w;
    if (x < 0) return it;
  }
  return rows[rows.length - 1][0];
}

/* ======================================================================
 * §11 對外連結（web 版自測會斷言這兩個網址；Cocos 側只留函式不導航）
 * ==================================================================== */

export function itemsUrl(cityName: string): string {
  return './items.html?city=' + encodeURIComponent(String(cityName || ''));
}

export function deployUrl(targetName: string): string {
  return './deploy.html?city=' + encodeURIComponent(String(targetName || ''));
}

/* ======================================================================
 * §12 R8 一月一令（原作 0x4A64BC =「本月内政/军令已下达」）
 *   原作每月只能下**一条**內政或軍令：換月流水線 0x41B69D 把 [0x4A64BC] 清 0，
 *   下令點把它置 1（docs/04c §1；寫點 0x427923 / 清點 0x41B6D5、0x438415）。
 * ==================================================================== */

/** 本月是否已經下過令（unlimited=true 時永遠 false） */
export function monthLocked(save: CitySave | null | undefined, unlimited = false): boolean {
  if (unlimited) return false;
  const acted = intOr(save && save.lastActionMonth, 0, 0);
  return acted > 0 && acted === intOr(save && save.month, 1, 1);
}

/** 記下「本月已行動」；unlimited 或缺存檔時不記。返回是否真的記了。 */
export function markMonthActed(save: CitySave | null | undefined, unlimited = false): boolean {
  if (unlimited || !save || typeof save !== 'object' || Array.isArray(save)) return false;
  save.lastActionMonth = intOr(save.month, 1, 1);
  return true;
}

/** 換月清位（advanceMonth 每月調一次，對應原作的 0x4A64BC = 0） */
export function clearMonthLock<T extends CitySave | null | undefined>(save: T): T {
  if (save && typeof save === 'object' && !Array.isArray(save)) save.lastActionMonth = 0;
  return save;
}

/** 按鈕上的置灰提示；UI 與文件共用同一句 */
export const LOCK_HINT = '本月已行動';
/** 除錯開關打開時顯示的話（寫明不是玩法） */
export const UNLIMITED_HINT = '除錯：不限行動次數（?unlimited=1，不是玩法）';

/* ======================================================================
 * 對拍錨點（勿删）
 *
 * `work/parity_num/unit3_city.mjs` 的 COCOS_PATCHES 會用下面 5 段**舊字串**做
 * find/replace，產生一個「若 CityModel 仍是舊公式」的對照變體；它要求每段在
 * 全文恰好命中 1 次，miss 就 throw、腳本直接崩。這些舊寫法已經從正文移除
 * （本檔已與 web 真源對齊），所以把它們原樣留在這個註解裡當錨點。
 * 修改下方任一行前先看 `unit3_city.mjs:27-65`。
 *
 * C1 efficiencyOf 舊公式：
  return 1 + Math.min(EFF.MAX_BONUS, int / EFF.DIV);
 * C2 INCR devDef 舊值：
  devDef: { v: 6, grade: '新設計',
 * C3 INCR devPopCap 舊值：
  devPopCap: { v: 400000, grade: '新設計',
 * C4 INCR effDiv 舊值：
  effDiv: { v: 400, grade: '新設計',
 * C5 EFF 舊物件（缺 PIVOT）：
export const EFF = { DIV: incrVal('effDiv'), MAX_BONUS: incrVal('effMax') };
 * ==================================================================== */
