/**
 * EndingModel.ts — 結局判定、統計與文案（純邏輯，**不 import cc**）。
 *
 * 判定優先序（任務硬性要求）：
 *   ① 玩家統一全國（owned 去重後 >= 60）→ kind 'unify'，reason 'unify'
 *   ② 玩家君主陣亡且無繼承（存檔帶 monarchExtinct / monarchDead / kingDead，
 *      或 forces[玩家勢力].alive === false）→ kind 'fall'，reason 'monarch'
 *   ③ 玩家城數 0 → kind 'fall'，reason 'no-city'
 *   ④ 其餘 → null（未結束）
 *
 * 為什麼君主亡要外部旗標：MonarchModel.extinguish() 會把 monarch / force / king
 * 三欄一起清空，事後無法只憑欄位判斷「是滅亡還是還沒稱王」。因此 lead 必須把
 * CampaignRoot 的 monarchExtinct（localStorage `sanguo_monarch_extinct_v1`）
 * 併進傳給 endingOf() 的 save；本檔同時容忍 forces[id].alive === false。
 *
 * 文案：docs/04c 與 web 版都查不到原作的結局台詞（只有 0x4A6440 階段機與日期格式），
 * 所以三段正文為 [新設計]；標題與印章文字仍用原作的兩類「統一 / 滅亡」。
 */

/** 全國城池數（原作劇本固定 60；判定統一用這個常數，不隨 cities 長度浮動）。 */
export const TOTAL_CITIES = 60;

/** 重新開始時要清的存檔鍵前綴。 */
export const RUN_STORAGE_PREFIX = 'sanguo_';

/** localStorage 的最小介面；Node 測試可傳入 Map 包裝或假物件。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
  readonly length?: number;
}

/** 已知的存檔鍵，storage 不支援枚舉時逐個刪。 */
export const RUN_SAVE_KEYS: readonly string[] = [
  'sanguo_campaign_v1',
  'sanguo_saves_v1',
  'sanguo_monarch_v1',
  'sanguo_monarch_seat_v1',
  'sanguo_monarch_extinct_v1',
  'sanguo_deploy_v1',
  'sanguo_battle_v1',
  'sanguo_run_v1',
  'sanguo_runsetup_v1',
  'sanguo_setup_v1',
];

export type EndingKind = 'unify' | 'fall';
export type EndingReason = 'unify' | 'monarch' | 'no-city';

/** 寬鬆存檔視圖：GameState.CampaignSave 與 CampaignRoot 的合併視圖都能直接塞進來。 */
export interface EndingSaveLike {
  owned?: unknown;
  month?: unknown;
  wins?: unknown;
  losses?: unknown;
  roster?: unknown;
  cities?: unknown;
  monarch?: unknown;
  king?: unknown;
  force?: unknown;
  playerForce?: unknown;
  forces?: unknown;
  monarchExtinct?: unknown;
  monarchDead?: unknown;
  kingDead?: unknown;
  [key: string]: unknown;
}

export interface EndingCityLike {
  NAME?: unknown;
  KING?: unknown;
  MAJOR?: unknown;
  POPULATION?: unknown;
  DEFENSE?: unknown;
  MONEY?: unknown;
  [key: string]: unknown;
}

export interface EndingGeneralLike {
  NAME?: unknown;
  CITY?: unknown;
  [key: string]: unknown;
}

export interface EndingStats {
  /** 存檔第幾個月（1 起；0 表示沒有月資料）。 */
  month: number;
  /** 已經過月數（month - 1）。 */
  elapsedMonths: number;
  years: number;
  remainMonths: number;
  /** 「2 年 3 月」/「7 個月」/「不足一月」。 */
  durationText: string;
  cityCount: number;
  generalCount: number;
  /** 開局存在的勢力數（城池 KING 去重 + 玩家勢力）。 */
  startForces: number;
  /** 結局時還活著的勢力數（非玩家城 owner/KING 去重 + 玩家若有城）。 */
  aliveForces: number;
  /** 擊破勢力數 = startForces - aliveForces（夾在 0 以上）。 */
  brokenForces: number;
}

export interface EndingState {
  kind: EndingKind;
  reason: EndingReason;
  /** 精確兩類：'統一' / '滅亡'。 */
  label: '統一' | '滅亡';
  /** 大標題。 */
  title: string;
  /** 頁首小字。 */
  kicker: string;
  /** 3 段正文（不含縮排；畫面自己加「　　」）。 */
  paragraphs: string[];
  /** 一句收束語。 */
  epithet: string;
  monarch: string;
  stats: EndingStats;
  /** 去重後的玩家城名。 */
  owned: string[];
  /** 穩定簽名，用來避免同一局重複彈同一個結局。 */
  signature: string;
}

/* ------------------------------------------------------------------ */
/* 寬鬆取值                                                            */
/* ------------------------------------------------------------------ */

function dictOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function strOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function numOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function intOf(value: unknown, fallback = 0): number {
  const n = numOf(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function truthyFlag(value: unknown): boolean {
  return value === true;
}

function uniqueStrings(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (item: unknown): void => {
    const text = strOf(item);
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  if (Array.isArray(value)) {
    for (const item of value) push(item);
  } else if (typeof value === 'string') {
    push(value);
  }
  return out;
}

/** 城池 KING 可能是數字（關卡/無主）也可能是國名；純數字不算勢力。 */
function forceNameOfKing(value: unknown): string {
  const text = strOf(value);
  if (!text) return '';
  if (/^\d+$/.test(text)) return '';
  return text;
}

/* ------------------------------------------------------------------ */
/* 判定                                                                */
/* ------------------------------------------------------------------ */

export function playerForceOf(save: EndingSaveLike): string {
  return strOf(save.force) || strOf(save.king) || strOf(save.monarch) || strOf(save.playerForce);
}

export function monarchNameOf(save: EndingSaveLike): string {
  return strOf(save.monarch) || strOf(save.king) || '主公';
}

/** 君主陣亡 / 勢力已滅：先看外部旗標，再看 forces[玩家勢力].alive === false。 */
export function isMonarchLost(save: EndingSaveLike): boolean {
  if (
    truthyFlag(save.monarchExtinct) ||
    truthyFlag(save.monarchDead) ||
    truthyFlag(save.kingDead)
  ) {
    return true;
  }
  const forces = dictOf(save.forces);
  if (!forces) return false;
  const ids = [
    strOf(save.force),
    strOf(save.playerForce),
    strOf(save.king),
    strOf(save.monarch),
  ];
  for (const id of ids) {
    if (!id) continue;
    const force = dictOf(forces[id]);
    if (force && force.alive === false) return true;
  }
  return false;
}

/** 開局/存活/擊破勢力數。以城池 KING 為開局勢力，以 runtime owner 為現勢。 */
export function forceStatsOf(
  save: EndingSaveLike,
  cities: readonly EndingCityLike[]
): { startForces: number; aliveForces: number; brokenForces: number } {
  const owned = new Set(uniqueStrings(save.owned));
  const player = playerForceOf(save);
  const runtime = dictOf(save.cities) ?? {};
  const start = new Set<string>();
  const alive = new Set<string>();

  for (const item of cities) {
    const def = dictOf(item);
    if (!def) continue;
    const name = strOf(def.NAME);
    if (!name) continue;
    const king = forceNameOfKing(def.KING);
    if (king) start.add(king);
    if (owned.has(name)) continue;
    const rt = dictOf(runtime[name]);
    const owner = strOf(rt?.owner) || king;
    if (owner) alive.add(owner);
  }

  // 沒有城池資料時，至少把存檔裡記得的勢力算進去。
  if (cities.length === 0) {
    for (const id of Object.keys(dictOf(save.forces) ?? {})) start.add(id);
  }

  if (player) start.add(player);
  if (owned.size > 0 && player) alive.add(player);

  const startForces = start.size;
  const aliveForces = alive.size;
  // 只算「玩家以外、開局存在、結局已不在」的勢力；玩家自己滅亡不算自己擊破自己。
  let brokenForces = 0;
  for (const force of start) {
    if (force === player) continue;
    if (!alive.has(force)) brokenForces += 1;
  }
  return {
    startForces,
    aliveForces,
    brokenForces: Math.max(0, brokenForces),
  };
}

/** 武將數：優先用 save.roster（城→名字陣列/字串），否則用 generals[].CITY ∈ owned。 */
export function generalCountOf(
  save: EndingSaveLike,
  generals: readonly EndingGeneralLike[]
): number {
  const names = new Set<string>();
  const roster = save.roster;
  const rosterDict = dictOf(roster);
  if (rosterDict) {
    for (const value of Object.values(rosterDict)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const itemDict = dictOf(item);
          const name = strOf(itemDict ? itemDict.NAME ?? itemDict.name : item);
          if (name) names.add(name);
        }
      } else if (typeof value === 'string') {
        for (const part of value.split(/[、,，\s]+/)) {
          const name = part.trim();
          if (name) names.add(name);
        }
      }
    }
  }
  if (names.size === 0) {
    const owned = new Set(uniqueStrings(save.owned));
    for (const item of generals) {
      const def = dictOf(item);
      if (!def) continue;
      const city = strOf(def.CITY);
      const name = strOf(def.NAME);
      if (city && owned.has(city) && name) names.add(name);
    }
  }
  return names.size;
}

/** 時長文字：month 1 起算，第 1 月 = 不足一月。 */
export function durationTextOf(month: number): string {
  if (!Number.isFinite(month) || month <= 0) return '不足一月';
  const elapsed = Math.trunc(month) - 1;
  const years = Math.floor(elapsed / 12);
  const months = elapsed % 12;
  if (years > 0 && months === 0) return `${years} 年`;
  if (years > 0) return `${years} 年 ${months} 月`;
  if (months > 0) return `${months} 個月`;
  return '不足一月';
}

export function formatDuration(stats: EndingStats): string {
  return stats.durationText;
}

/**
 * 只把「劇本裡真的存在」的城算進 owned；沒有城池資料時退回全部 owned。
 * 這樣存檔裡殘留的舊城名/錯字不會被算成「還有一城」，也不會謊報統一。
 */
export function validOwnedOf(
  save: EndingSaveLike,
  cities: readonly EndingCityLike[]
): string[] {
  const owned = uniqueStrings(save.owned);
  if (cities.length === 0) return owned;
  const known = new Set<string>();
  for (const item of cities) {
    const def = dictOf(item);
    const name = strOf(def?.NAME);
    if (name) known.add(name);
  }
  if (known.size === 0) return owned;
  return owned.filter((name) => known.has(name));
}

/** 統計（也給面板直接取用）。 */
export function endingStatsOf(
  save: EndingSaveLike,
  cities: readonly EndingCityLike[],
  generals: readonly EndingGeneralLike[],
  totalCities = TOTAL_CITIES
): EndingStats {
  const owned = validOwnedOf(save, cities);
  const month = Math.max(0, intOf(save.month));
  const elapsedMonths = month > 0 ? month - 1 : 0;
  const forces = forceStatsOf(save, cities);
  return {
    month,
    elapsedMonths,
    years: Math.floor(elapsedMonths / 12),
    remainMonths: elapsedMonths % 12,
    durationText: durationTextOf(month),
    cityCount: Math.min(owned.length, totalCities),
    generalCount: generalCountOf(save, generals),
    startForces: forces.startForces,
    aliveForces: forces.aliveForces,
    brokenForces: forces.brokenForces,
  };
}

function makeState(
  kind: EndingKind,
  reason: EndingReason,
  save: EndingSaveLike,
  stats: EndingStats,
  owned: string[]
): EndingState {
  const monarch = monarchNameOf(save);
  const label: '統一' | '滅亡' = kind === 'unify' ? '統一' : '滅亡';
  const cityCount = stats.cityCount;
  const generalCount = stats.generalCount;
  const duration = stats.durationText;

  let title: string;
  let kicker: string;
  let paragraphs: string[];
  let epithet: string;

  if (reason === 'unify') {
    // [新設計] 原作結局台詞未見於倉庫（docs/04c 只有階段機，web 版無文字）。
    title = '天下統一';
    kicker = '群雄割據 · 終章';
    paragraphs = [
      `烽煙起於州郡，豪傑並起；十餘年間，城頭旗號幾度易主。${monarch} 自一隅起兵，終於盡取天下 ${cityCount} 城。`,
      `自起兵至今日，凡 ${duration}；麾下 ${generalCount} 將，破 ${stats.brokenForces} 家諸侯。山河歸一，刀兵入庫。`,
      '百姓復耕於野，商旅重行於道；成敗功過，留與後人評說。',
    ];
    epithet = '四海歸一 · 天下太平';
  } else if (reason === 'monarch') {
    title = '勢力滅亡';
    kicker = '群雄割據 · 落幕';
    paragraphs = [
      `大廈將傾，非一木可支。${monarch} 中道崩殂，後繼無人；麾下 ${cityCount} 城、${generalCount} 將，一夜星散。`,
      `自起兵至今日，凡 ${duration}；曾破 ${stats.brokenForces} 家諸侯，終究沒能守住最後一面旗。`,
      '旗幟落地，山河易主。史書只留下一行：某年某月，其國亡。',
    ];
    epithet = '後繼無人 · 社稷傾覆';
  } else {
    title = '勢力滅亡';
    kicker = '群雄割據 · 落幕';
    paragraphs = [
      `最後一座城池陷落時，城頭已換了旗號。${monarch} 與 ${generalCount} 名舊部突圍而出，再無寸土可守。`,
      `自起兵至今日，凡 ${duration}；曾據 ${cityCount} 城，會 ${stats.brokenForces} 諸侯，到頭來只剩一身。`,
      '天下之大，竟無立錐之地；殘部或降或走，那面旗從此不再升起。',
    ];
    epithet = '城破旗折 · 無處容身';
  }

  const signature = [
    kind,
    reason,
    monarch,
    cityCount,
    generalCount,
    stats.month,
    stats.brokenForces,
  ].join('|');

  return {
    kind,
    reason,
    label,
    title,
    kicker,
    paragraphs,
    epithet,
    monarch,
    stats,
    owned,
    signature,
  };
}

/**
 * 唯一的結局判定入口。
 * @param save    CampaignSave（建議併入 monarchExtinct，見檔頭說明）
 * @param cities  劇本城池定義（CityDef[] / Scenario.cities）
 * @param generals 劇本武將（General[]；只用在 roster 缺失時）
 */
export function endingOf(
  save: EndingSaveLike | null | undefined,
  cities: readonly EndingCityLike[] | null | undefined,
  generals: readonly EndingGeneralLike[] | null | undefined
): EndingState | null {
  if (!save || typeof save !== 'object') return null;
  const cityList = Array.isArray(cities) ? cities : [];
  const generalList = Array.isArray(generals) ? generals : [];
  const owned = validOwnedOf(save, cityList);
  const ownedCount = Math.min(owned.length, TOTAL_CITIES);
  const stats = endingStatsOf(save, cityList, generalList);

  // ① 統一壓過一切：即使同年君主亡，也算統一。
  if (ownedCount >= TOTAL_CITIES) {
    return makeState('unify', 'unify', save, stats, owned);
  }
  // ② 君主陣亡且無繼承。
  if (isMonarchLost(save)) {
    return makeState('fall', 'monarch', save, stats, owned);
  }
  // ③ 城池盡失。
  if (ownedCount === 0) {
    return makeState('fall', 'no-city', save, stats, owned);
  }
  return null;
}

/** 給畫面/lead 判斷「這一局是不是已經彈過同一結局」。 */
export function endingSignature(state: EndingState | null): string {
  return state ? state.signature : '';
}

/* ------------------------------------------------------------------ */
/* 重新開始：清存檔                                                     */
/* ------------------------------------------------------------------ */

/**
 * 刪掉所有 `sanguo_` 開頭的鍵，回傳實際刪掉的鍵（排序後）。
 * 先嘗試用 length/key 枚舉（真 localStorage）；不支援時只刪 RUN_SAVE_KEYS 裡存在的。
 */
export function clearRunStorage(storage: StorageLike | null | undefined): string[] {
  if (!storage) return [];
  const keys = new Set<string>();
  try {
    if (typeof storage.key === 'function' && typeof storage.length === 'number') {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key) keys.add(key);
      }
    }
  } catch {
    // 跨域 storage 會拋；退回已知鍵。
  }
  if (keys.size === 0) {
    for (const key of RUN_SAVE_KEYS) {
      try {
        if (storage.getItem(key) !== null) keys.add(key);
      } catch {
        // 忽略單鍵讀取失敗。
      }
    }
  }
  const removed: string[] = [];
  for (const key of keys) {
    if (!key.startsWith(RUN_STORAGE_PREFIX)) continue;
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      // 忽略單鍵刪除失敗。
    }
  }
  removed.sort();
  return removed;
}
