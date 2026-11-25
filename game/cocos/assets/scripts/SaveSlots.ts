/**
 * 存檔位（10 槽）—— 純邏輯 + 面板，一個檔案。
 *
 * 為什麼要這個東西：Cocos 的 `CampaignRoot` 只有一套自動存檔（`sanguo_campaign_v1` /
 * `sanguo_city_v1` / `sanguo_items_v1` / `sanguo_monarch_v1` …），沒有「選哪一格」的概念；
 * web 版（`game/web/campaign.html` 的 `#saveSheet` + `game/web/saves.js`）有 10 格。
 * 這裡把 web 的槽位行為搬到 Cocos，但**刻意簡化**（見 `project/120_Cocos招降面板.md` §任務 B）：
 *
 *  - 索引鍵固定 `sanguo_slots_v1 = { active: n, slots: { [n]: { at, meta } } }`（n = 1..10）；
 *  - 每格的存檔本體放自己的鍵 `sanguo_slot_payload_v1_<n>`（不塞進索引，索引保持小）；
 *  - 讀檔 = 把 payload 裡的 `sanguo_*_v1` 整組寫回 live 鍵（**這一步不能省**，否則讀到的
 *    是別人的城），然後 `GameState.resetCache()` 讓下一輪 `loadSave()` 重新讀盤；
 *  - 不做 web 的 v3 快照結構、不做存檔格式遷移、不做改名輸入（Cocos 沒有 `prompt`）。
 *
 * 存取層用 `SlotStorage`（只要求 getItem / setItem / removeItem），所以純邏輯可以在 node 裡
 * 用一個 Map 假 storage 斷言，不需要真 localStorage；`storageOf()` 才是 `sys.localStorage`。
 */
import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  input,
  Input,
  Label,
  Node,
  UITransform,
  Vec3,
  sys,
} from 'cc';
import * as GameState from './GameState';
import { COLORS, FONT_FAMILY } from './view/theme';

const { ccclass } = _decorator;

/** 設計分辨率（跟 ArtLayer / ItemsPanel 同一個口徑） */
const DESIGN_W = 750;
const DESIGN_H = 1334;
const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/* ====================================================================== */
/* §1 常量                                                                */
/* ====================================================================== */

/** 槽位索引鍵 */
export const SLOTS_KEY = 'sanguo_slots_v1';
/** 槽數（web `Saves.SLOT_COUNT` 同值） */
export const SLOT_COUNT = 10;
/** 槽名上限（web `metaFromSnapshot` 的 `slotName.slice(0,20)` 同值） */
export const SLOT_NAME_MAX = 20;
/** 每格存檔本體的鍵前綴 */
export const SLOT_PAYLOAD_PREFIX = 'sanguo_slot_payload_v1_';

/**
 * 讀檔時要「整組換掉」的鍵。前四個是任務書點名的；後三個是 `CampaignRoot`
 * 自己寫的戰報 / 王座 / 滅亡名單——不換的話讀完新檔還會看到舊檔的戰報。
 */
export const CAMPAIGN_KEYS: readonly string[] = [
  'sanguo_campaign_v1',
  'sanguo_city_v1',
  'sanguo_items_v1',
  'sanguo_monarch_v1',
  'sanguo_battlelog_v1',
  'sanguo_monarch_seat_v1',
  'sanguo_monarch_extinct_v1',
];

/** 面板底部的說明（web `SAVE_TIP` 的簡化版） */
export const SAVE_TIP =
  '存＝寫入該槽（覆蓋） · 讀＝回到該槽 · 刪＝清空 · 點槽位列可切換存檔目標。';

/* ====================================================================== */
/* §2 型別                                                                */
/* ====================================================================== */

/** 左上方原點、750×1334 設計座標下的矩形 */
export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 一格的中繼資料。任務書要求「至少含 君主 / 城數 / 年月 / 勝敗」。 */
export interface SlotMeta {
  /** 君主名（`save.monarch || save.king`，空則回退讀 `sanguo_monarch_v1`） */
  monarch: string;
  /** 城數（`save.owned.length`） */
  cities: number;
  /** 月序號（1 起） */
  month: number;
  /** 人類可讀的「第X年Y月」 */
  monthText: string;
  wins: number;
  losses: number;
  /** 武將數（`save.roster` 去重後的個數） */
  generals: number;
  /** 劇本名（可空） */
  scenario: string;
  /** 槽名（改名用，空 = 只有「槽 N」） */
  name: string;
}

/** 索引裡的一格 */
export interface SlotRecord {
  /** 存檔時間戳（ms） */
  at: number;
  meta: SlotMeta;
}

/** `sanguo_slots_v1` 的形狀 */
export interface SlotIndex {
  /** 目前的自動存檔目標槽（1..10） */
  active: number;
  /** 鍵是 `'1'..'10'` */
  slots: Record<string, SlotRecord>;
}

/** 純邏輯只需要這三個方法（`sys.localStorage` 結構上滿足） */
export interface SlotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** `loadFromSlot` 的結果 */
export interface LoadSlotResult {
  ok: boolean;
  slot: number;
  /** 失敗原因（中文，給面板直接顯示） */
  reason: string;
  meta: SlotMeta | null;
  /** payload 裡實際還原的鍵 */
  keys: string[];
}

/** `saveToSlot` 的選項 */
export interface SaveSlotOptions {
  /** 寫槽前先把記憶體裡的存檔刷進 storage（面板傳 `GameState.persistSave`） */
  persist?: () => unknown;
  /** 覆寫時間戳（測試用） */
  now?: number;
  /** 劇本名 */
  scenario?: string;
}

/* ====================================================================== */
/* §3 純邏輯：小工具                                                      */
/* ====================================================================== */

/** 數字收斂（`null` / `'12'` / `NaN` 都吃） */
export function numOf(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** 文字收斂（只認 string / number，物件一律空字串——避免把 `[object Object]` 畫到面板上） */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** 一般物件判定 */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 解析 JSON 物件，失敗回 null（不拋） */
function readJson(text: string | null): Record<string, unknown> | null {
  if (typeof text !== 'string' || !text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const record = asRecord(parsed);
    return Object.keys(record).length > 0 ? record : null;
  } catch {
    return null;
  }
}

/** 1..10 → 原值；其他一律 0（給「這個槽位合不合法」用） */
export function slotOrZero(value: unknown): number {
  const n = Math.trunc(numOf(value));
  return n >= 1 && n <= SLOT_COUNT ? n : 0;
}

/** 槽位 → 本體鍵 */
export function payloadKey(slot: number): string {
  return `${SLOT_PAYLOAD_PREFIX}${slotOrZero(slot) || 1}`;
}

/** 真正的 localStorage 適配器 */
export function storageOf(): SlotStorage {
  return sys.localStorage as unknown as SlotStorage;
}

/** `第X年Y月`（同 `CityModel.monthLabel` 口徑；這裡自己寫一份，免得為了一個函式拖進整個內政模組） */
export function monthLabel(month: unknown): string {
  const m = Math.max(1, Math.trunc(numOf(month)) || 1);
  return `第${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
}

/** 時間戳 → `YYYY-MM-DD HH:mm`（0 / 非法 → 空字串） */
export function dateText(at: unknown): string {
  const ms = Math.trunc(numOf(at));
  if (ms <= 0) return '';
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 空白 meta */
export function emptyMeta(): SlotMeta {
  return {
    monarch: '',
    cities: 0,
    month: 1,
    monthText: monthLabel(1),
    wins: 0,
    losses: 0,
    generals: 0,
    scenario: '',
    name: '',
  };
}

/** 髒資料 → 合法 meta（缺欄位補 0 / 空字串，`monthText` 重新算） */
export function normalizeMeta(raw: unknown): SlotMeta {
  const src = asRecord(raw);
  const month = Math.max(1, Math.trunc(numOf(src.month)) || 1);
  return {
    monarch: textOf(src.monarch),
    cities: Math.max(0, Math.trunc(numOf(src.cities))),
    month,
    monthText: monthLabel(month),
    wins: Math.max(0, Math.trunc(numOf(src.wins))),
    losses: Math.max(0, Math.trunc(numOf(src.losses))),
    generals: Math.max(0, Math.trunc(numOf(src.generals))),
    scenario: textOf(src.scenario),
    name: textOf(src.name).slice(0, SLOT_NAME_MAX),
  };
}

/* ====================================================================== */
/* §4 純邏輯：索引讀寫                                                    */
/* ====================================================================== */

/** 讀索引（壞掉的東西一律丟掉，不拋） */
export function readIndex(storage: SlotStorage = storageOf()): SlotIndex {
  const out: SlotIndex = { active: 1, slots: {} };
  const raw = readJson(storage.getItem(SLOTS_KEY));
  if (!raw) return out;
  out.active = slotOrZero(raw.active) || 1;
  const slots = asRecord(raw.slots);
  for (const key of Object.keys(slots)) {
    const n = slotOrZero(key);
    if (!n) continue;
    const record = asRecord(slots[key]);
    out.slots[String(n)] = {
      at: Math.trunc(numOf(record.at)),
      meta: normalizeMeta(record.meta),
    };
  }
  return out;
}

/** 寫索引（順便清掉鍵不是 1..10 的雜訊） */
export function writeIndex(index: SlotIndex, storage: SlotStorage = storageOf()): void {
  const slots: Record<string, SlotRecord> = {};
  for (const key of Object.keys(index.slots)) {
    const n = slotOrZero(key);
    if (!n) continue;
    const record = index.slots[key];
    if (!record) continue;
    slots[String(n)] = {
      at: Math.trunc(numOf(record.at)),
      meta: normalizeMeta(record.meta),
    };
  }
  const active = slotOrZero(index.active) || 1;
  storage.setItem(SLOTS_KEY, JSON.stringify({ active, slots }));
}

/** 索引裡的一格（沒有 → null） */
export function slotRecord(index: SlotIndex, slot: number): SlotRecord | null {
  const n = slotOrZero(slot);
  if (!n) return null;
  const record = index.slots[String(n)];
  return record ? record : null;
}

/** 已用槽數 */
export function filledCount(index: SlotIndex): number {
  return Object.keys(index.slots).length;
}

/** 讀某一格的本體（鍵 → 字串） */
export function readPayload(storage: SlotStorage, slot: number): Record<string, string> {
  const n = slotOrZero(slot);
  const out: Record<string, string> = {};
  if (!n) return out;
  const raw = readJson(storage.getItem(payloadKey(n)));
  if (!raw) return out;
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** 寫某一格的本體 */
export function writePayload(storage: SlotStorage, slot: number, payload: Record<string, string>): void {
  const n = slotOrZero(slot);
  if (!n) return;
  storage.setItem(payloadKey(n), JSON.stringify(payload));
}

/** 清掉某一格的本體 */
export function clearPayload(storage: SlotStorage, slot: number): void {
  const n = slotOrZero(slot);
  if (!n) return;
  storage.removeItem(payloadKey(n));
}

/* ====================================================================== */
/* §5 純邏輯：中繼資料與四個操作                                          */
/* ====================================================================== */

/** 從 `sanguo_monarch_v1` 裡撈君主名（Cocos 的君主名不一定在 campaign 檔裡） */
export function monarchFromStorage(storage: SlotStorage): string {
  const raw = readJson(storage.getItem('sanguo_monarch_v1'));
  if (!raw) return '';
  return textOf(raw.king) || textOf(raw.monarch);
}

/** 從存檔推 meta（純函式，不碰 storage） */
export function metaOfSave(save: object, scenario = ''): SlotMeta {
  const src = asRecord(save);
  const roster = asRecord(src.roster);
  const names = new Set<string>();
  for (const key of Object.keys(roster)) {
    const list = roster[key];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const name = textOf(raw);
      if (name) names.add(name);
    }
  }
  const owned = Array.isArray(src.owned) ? src.owned : [];
  const cities = asRecord(src.cities);
  // 武將數：roster（招降/在野）之外，還要把我方各城的城主與在城武將算進來。
  // 之前只數 roster，剛開局時是 0 → 存檔行列印「武將000」，與原作「武將NNN」明顯不符
  // （原作幀 work/video_ui/A_save_t0035.png；web 口徑 game/web/saves.js:1395-1407）。
  for (const raw of owned) {
    const city = asRecord(cities[textOf(raw)]);
    const major = textOf(city.major);
    if (major) names.add(major);
    const officers = Array.isArray(city.officers) ? city.officers : [];
    for (const officer of officers) {
      const name = textOf(asRecord(officer).name ?? officer);
      if (name) names.add(name);
    }
  }
  const month = Math.max(1, Math.trunc(numOf(src.month)) || 1);
  return {
    monarch: textOf(src.monarch) || textOf(src.king),
    cities: owned.length > 0 ? owned.length : Object.keys(cities).length,
    month,
    monthText: monthLabel(month),
    wins: Math.max(0, Math.trunc(numOf(src.wins))),
    losses: Math.max(0, Math.trunc(numOf(src.losses))),
    generals: names.size,
    scenario: textOf(scenario) || textOf(src.scenario),
    name: '',
  };
}

/**
 * 存檔到某一格。
 *
 * 注意（與 web 的差異）：web 的「存到槽 2」**不改**自動存檔目標；Cocos 目前沒有
 * 槽位化的自動存檔，`active` 就是「自動存檔會寫哪一格」，所以這裡存完就把
 * `active` 指到該槽——否則使用者會看到「存了槽 2，下次自動存又蓋回槽 1」。
 */
export function saveToSlot(
  save: object,
  slot: number,
  opts: SaveSlotOptions = {},
  storage: SlotStorage = storageOf(),
): SlotRecord | null {
  const n = slotOrZero(slot);
  if (!n) return null;
  try {
    opts.persist?.();
  } catch {
    /* 刷盤失敗不影響「把現在記憶體裡的東西存進槽」，繼續 */
  }
  const payload: Record<string, string> = {};
  for (const key of CAMPAIGN_KEYS) {
    const value = storage.getItem(key);
    if (typeof value === 'string' && value) payload[key] = value;
  }
  writePayload(storage, n, payload);

  const index = readIndex(storage);
  const meta = metaOfSave(save, opts.scenario ?? '');
  if (!meta.monarch) meta.monarch = monarchFromStorage(storage);
  const previous = slotRecord(index, n);
  if (previous && previous.meta.name) meta.name = previous.meta.name; // 存回同名槽不洗掉改名
  const at = typeof opts.now === 'number' && Number.isFinite(opts.now) ? Math.trunc(opts.now) : Date.now();
  const record: SlotRecord = { at, meta };
  index.slots[String(n)] = record;
  index.active = n;
  writeIndex(index, storage);
  return record;
}

/**
 * 從某一格讀檔——**把 `sanguo_*_v1` 整組換掉**再 `GameState.resetCache()`。
 *
 * 呼叫端（`CampaignRoot`）讀完要自己重畫：本模組只換盤，不知道場景長什麼樣。
 * payload 裡沒有的鍵一律 `removeItem`，否則會留著上一局的戰報 / 滅亡名單。
 */
export function loadFromSlot(slot: number, storage: SlotStorage = storageOf()): LoadSlotResult {
  const n = slotOrZero(slot);
  if (!n) return { ok: false, slot: 0, reason: '槽位不存在', meta: null, keys: [] };
  const payload = readPayload(storage, n);
  const keys = Object.keys(payload);
  const campaign = payload[GameState.SAVE_KEY];
  if (!campaign) return { ok: false, slot: n, reason: `槽 ${n} 是空的`, meta: null, keys };
  const parsed = readJson(campaign);
  if (!parsed) return { ok: false, slot: n, reason: `槽 ${n} 的存檔已損壞`, meta: null, keys };

  for (const key of CAMPAIGN_KEYS) {
    const value = payload[key];
    if (typeof value === 'string' && value) storage.setItem(key, value);
    else storage.removeItem(key);
  }

  const index = readIndex(storage);
  index.active = n;
  writeIndex(index, storage);

  // 換槽後記憶體裡的 cached 還是上一局：不 reset 的話 loadSave() 會直接回舊檔。
  GameState.resetCache();

  const record = slotRecord(index, n);
  return { ok: true, slot: n, reason: '', meta: record ? record.meta : metaOfSave(parsed), keys };
}

/** 刪掉某一格（回傳「原本有東西嗎」） */
export function deleteSlot(slot: number, storage: SlotStorage = storageOf()): boolean {
  const n = slotOrZero(slot);
  if (!n) return false;
  const index = readIndex(storage);
  const had = slotRecord(index, n) !== null || Object.keys(readPayload(storage, n)).length > 0;
  clearPayload(storage, n);
  delete index.slots[String(n)];
  writeIndex(index, storage);
  return had;
}

/** 換槽：只改「自動存檔寫哪一格」，不動盤上的任何存檔本體 */
export function setActiveSlot(slot: number, storage: SlotStorage = storageOf()): number {
  const n = slotOrZero(slot);
  if (!n) return readIndex(storage).active;
  const index = readIndex(storage);
  index.active = n;
  writeIndex(index, storage);
  return n;
}

/** 改名（留空 = 退回自動名「槽 N」；超過 20 字截斷） */
export function renameSlot(slot: number, name: string, storage: SlotStorage = storageOf()): boolean {
  const n = slotOrZero(slot);
  if (!n) return false;
  const index = readIndex(storage);
  const record = slotRecord(index, n);
  if (!record) return false;
  record.meta.name = textOf(name).slice(0, SLOT_NAME_MAX);
  index.slots[String(n)] = record;
  writeIndex(index, storage);
  return true;
}

/* ====================================================================== */
/* §6 純邏輯：畫面上要用的文案                                            */
/* ====================================================================== */

/**
 * 存檔槽的原作寫法（web `saves.js:1379 SLOT_LABEL`、`:1382 slotTitle`）：
 * `記錄01` … `記錄10`（兩位補零），不是「槽 1」。
 * 證據：`work/video_ui/A_save_t0035.png` —— 行首是「記錄NN」。
 */
export const SLOT_LABEL = '記錄';

/** 兩位補零（web `era.pad2`） */
export function pad2(value: unknown): string {
  const n = Math.max(0, Math.trunc(numOf(value)) || 0);
  return n < 10 ? `0${n}` : String(n);
}

/** 三位補零（web `era.pad3`） */
export function pad3(value: unknown): string {
  const n = Math.max(0, Math.trunc(numOf(value)) || 0);
  return n < 100 ? (n < 10 ? `00${n}` : `0${n}`) : String(n);
}

/** 西元錨點（web `era.js:41 AD_ANCHOR_DEFAULT`）：第 1 年 = 西元 184 年 */
export const AD_ANCHOR = 184;

/** 遊戲月 → 西元（web `era.adYearOfMonth`） */
export function adYearOfMonth(month: unknown): number {
  const m = Math.max(1, Math.trunc(numOf(month)) || 1);
  return AD_ANCHOR + (Math.floor((m - 1) / 12) + 1) - 1;
}

/** `記錄01` … `記錄10`；越界槽號不拋（web `slotTitle()` 同語義） */
export function slotTitle(index: unknown, label: string = SLOT_LABEL): string {
  const raw = Math.trunc(numOf(index));
  const n = Number.isFinite(raw) ? raw + 1 : 1;
  return `${label}${pad2(n)}`;
}

/**
 * 一列的三行字（空槽也有三行，面板照樣畫）。
 *
 * 第 2 行照原作 4 段（web `saves.js:1395 slotLineParts`，證據 `work/video_ui/A_save_t0035.png`
 * 的「記錄NN｜君主｜城數NN｜武將NNN｜時間NNN年」）：段間用全角分隔符 ` ｜ `。
 * 第 3 行是 Cocos 自己的存檔時間戳 `[新設計]`——原作沒有這一行，但存檔面板沒有時間會分不清先後。
 */
export function slotLines(
  record: SlotRecord | null,
  slot: number,
  active: number,
): { l1: string; l2: string; l3: string } {
  const n = slotOrZero(slot);
  const title = slotTitle(n > 0 ? n - 1 : slot);
  if (!record) return { l1: title, l2: '空 · 可存入目前進度', l3: '' };
  const meta = record.meta;
  const name = meta.name ? ` · ${meta.name}` : '';
  const tag = n > 0 && n === active ? ' · 使用中' : '';
  const parts = [
    meta.monarch || '—',
    `城數${pad2(meta.cities)}`,
    `武將${pad3(meta.generals)}`,
    `時間${adYearOfMonth(meta.month)}年`,
  ];
  const when = dateText(record.at);
  return {
    l1: `${title}${name}${tag}`,
    l2: parts.join(' ｜ '),
    l3: when ? `存於 ${when}` : '',
  };
}

/** 表頭副標 */
export function subText(index: SlotIndex): string {
  return `存檔目標：${slotTitle(index.active - 1)} · 已用 ${filledCount(index)} / ${SLOT_COUNT} 槽 · 點槽位列可切換目標`;
}

/**
 * 月推進提示的**唯一**一句話（原作 `work/video_ui/A_map_monthprompt_t0183.png`；
 * web `saves.js:1420 advanceNotice`）：`內政時間到了....` —— 四個半形點，不是省略號。
 */
export const ADVANCE_NOTICE = '內政時間到了....';

/* ====================================================================== */
/* §7 面板佈局                                                            */
/* ====================================================================== */

/** 面板節點名 */
export const SAVE_PANEL_NODE_NAME = 'SaveSlotsPanel';
/** 一列的高度 / 間隔 */
export const ROW_H = 76;
export const ROW_GAP = 4;

/** 佈局（左上原點設計座標） */
export const LAYOUT: Record<string, SlotRect> = {
  screen: { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H },
  frame: { x: 26, y: 96, w: 698, h: 1084 },
  title: { x: 26, y: 118, w: 698, h: 40 },
  sub: { x: 46, y: 164, w: 658, h: 26 },
  rows: { x: 40, y: 200, w: 670, h: SLOT_COUNT * ROW_H + (SLOT_COUNT - 1) * ROW_GAP },
  msg: { x: 46, y: 1008, w: 658, h: 28 },
  footSave: { x: 40, y: 1048, w: 326, h: 56 },
  footClose: { x: 384, y: 1048, w: 326, h: 56 },
};

/** 第 i 列（i 從 0 起）的外框 */
export function rowRect(i: number): SlotRect {
  return { x: LAYOUT.rows.x, y: LAYOUT.rows.y + i * (ROW_H + ROW_GAP), w: LAYOUT.rows.w, h: ROW_H };
}

/** 第 i 列第 k 顆按鈕（0 存 / 1 讀 / 2 刪） */
export function btnRect(i: number, k: number): SlotRect {
  const row = rowRect(i);
  return { x: 516 + k * 64, y: row.y + 22, w: 58, h: 32 };
}

/** 第 i 列第 j 行字（j 從 0 起） */
export function lineRect(i: number, j: number): SlotRect {
  const row = rowRect(i);
  const ys = [row.y + 8, row.y + 34, row.y + 56];
  const hs = [26, 22, 18];
  return { x: 52, y: ys[j], w: 452, h: hs[j] };
}

/* ====================================================================== */
/* §8 面板                                                                */
/* ====================================================================== */

/** 觸控命中項 */
export type SlotAct = 'row' | 'save' | 'load' | 'del' | 'save-active' | 'close';

export interface SlotHit {
  rect: SlotRect;
  act: SlotAct;
  slot: number;
  label: string;
}

/** 面板選項 */
export interface SaveSlotsPanelOptions {
  /** 目前的存檔物件（`CampaignSave`，只讀） */
  save: object;
  /** 讀檔成功後的回呼（`CampaignRoot` 在這裡重新整理場景） */
  onLoad?: (result: LoadSlotResult) => void;
  /** 關閉回呼 */
  onClose?: () => void;
  /** 劇本名（寫進 meta，可空） */
  scenario?: string;
}

/** `debug()` 的回傳（headless 測試吃這個） */
export interface SaveSlotsDebug {
  open: boolean;
  active: number;
  filled: number;
  msg: string;
  sub: string;
  rows: string[];
  hits: number;
}

/** `#RRGGBB` → Color */
function rgba(hex: string, alpha = 255): Color {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return new Color(255, 255, 255, alpha);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

/** 存檔位面板 */
@ccclass('SaveSlotsPanel')
export class SaveSlotsPanel extends Component {
  /** 從父節點找（沒有就建）一個面板並開起來 */
  static show(parent: Node, options: SaveSlotsPanelOptions): SaveSlotsPanel {
    let node = parent.getChildByName(SAVE_PANEL_NODE_NAME);
    if (!node) {
      node = new Node(SAVE_PANEL_NODE_NAME);
      node.layer = parent.layer;
      parent.addChild(node);
    }
    node.setSiblingIndex(parent.children.length - 1);
    const panel = node.getComponent(SaveSlotsPanel) ?? node.addComponent(SaveSlotsPanel);
    panel.options = options;
    panel.build();
    panel.open();
    return panel;
  }

  private readonly storage: SlotStorage = storageOf();
  private options: SaveSlotsPanelOptions = { save: {} };

  private built = false;
  private opened = false;
  private listening = false;

  private g: Graphics | null = null;
  private labelTitle: Label | null = null;
  private labelSub: Label | null = null;
  private labelMsg: Label | null = null;
  private footLabels: Label[] = [];
  private rowLabels: Label[][] = [];
  private btnLabels: Label[][] = [];

  private hits: SlotHit[] = [];
  private flashText = '';

  /** 面板開著嗎 */
  get isOpen(): boolean {
    return this.opened;
  }

  /** 命中矩形（副本） */
  get hitList(): SlotHit[] {
    return this.hits.map((hit) => ({ rect: { ...hit.rect }, act: hit.act, slot: hit.slot, label: hit.label }));
  }

  /* ---------------------------------------------------------------- */
  /* 建節點                                                            */
  /* ---------------------------------------------------------------- */

  /** 建節點（重複呼叫安全） */
  build(): void {
    if (this.built) return;
    this.built = true;

    this.node.layer = this.node.parent ? this.node.parent.layer : this.node.layer;
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(DESIGN_W, DESIGN_H);
    transform.setAnchorPoint(0.5, 0.5);
    this.node.setPosition(0, 0, 0);

    const veil = new Node('SlotVeil');
    veil.layer = this.node.layer;
    this.node.addChild(veil);
    const veilG = veil.addComponent(Graphics);
    veilG.fillColor = new Color(6, 8, 12, 214);
    this.fillRect(veilG, LAYOUT.screen, new Color(6, 8, 12, 214));

    const frame = new Node('SlotFrame');
    frame.layer = this.node.layer;
    this.node.addChild(frame);
    this.g = frame.addComponent(Graphics);

    this.labelTitle = this.makeLabel('SlotTitle', '存 檔 位', LAYOUT.title, 28, COLORS.goldLight, 'center');
    this.labelSub = this.makeLabel('SlotSub', '', LAYOUT.sub, 14, COLORS.textDim, 'center');
    this.labelMsg = this.makeLabel('SlotMsg', SAVE_TIP, LAYOUT.msg, 14, COLORS.textDim, 'center');

    this.rowLabels = [];
    this.btnLabels = [];
    const btnText = ['存', '讀', '刪'];
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const lines: Label[] = [];
      for (let j = 0; j < 3; j += 1) {
        lines.push(this.makeLabel(`SlotRow${i}_${j}`, '', lineRect(i, j), j === 0 ? 21 : j === 1 ? 15 : 14, COLORS.textDim, 'left'));
      }
      this.rowLabels.push(lines);
      const buttons: Label[] = [];
      for (let k = 0; k < 3; k += 1) {
        buttons.push(this.makeLabel(`SlotBtn${i}_${k}`, btnText[k], btnRect(i, k), 15, COLORS.text, 'center'));
      }
      this.btnLabels.push(buttons);
    }

    this.footLabels = [
      this.makeLabel('SlotFootSave', '存 到 當 前 槽', LAYOUT.footSave, 18, COLORS.bgDeep, 'center'),
      this.makeLabel('SlotFootClose', '關 閉', LAYOUT.footClose, 18, COLORS.text, 'center'),
    ];
  }

  /** 開面板 */
  open(): void {
    this.build();
    this.opened = true;
    this.node.active = true;
    this.flashText = '';
    if (!this.listening) {
      input.on(Input.EventType.TOUCH_END, this.onTouch, this);
      this.listening = true;
    }
    this.refresh();
  }

  /** 關面板 */
  close(): void {
    if (this.listening) {
      input.off(Input.EventType.TOUCH_END, this.onTouch, this);
      this.listening = false;
    }
    this.opened = false;
    this.hits = [];
    this.node.active = false;
    this.options.onClose?.();
  }

  /** 給 headless 測試用：直接點設計座標 */
  tap(x: number, y: number): boolean {
    for (const hit of this.hits) {
      const rect = hit.rect;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        this.act(hit);
        return true;
      }
    }
    return false;
  }

  /** 除錯 / 測試快照 */
  debug(): SaveSlotsDebug {
    const index = readIndex(this.storage);
    return {
      open: this.opened,
      active: index.active,
      filled: filledCount(index),
      msg: this.labelMsg ? this.labelMsg.string : '',
      sub: this.labelSub ? this.labelSub.string : '',
      rows: this.rowLabels.map((lines) => (lines.length > 0 ? lines[0].string : '')),
      hits: this.hits.length,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 觸控                                                              */
  /* ---------------------------------------------------------------- */

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    const transform = this.node.getComponent(UITransform);
    if (!transform) return;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    this.tap(local.x + HALF_W, HALF_H - local.y);
  }

  private act(hit: SlotHit): void {
    switch (hit.act) {
      case 'save': {
        const record = saveToSlot(this.options.save, hit.slot, {
          persist: () => GameState.persistSave(),
          scenario: this.options.scenario,
        });
        this.flashText = record ? `已存入槽 ${hit.slot} · ${record.meta.monthText}` : `槽 ${hit.slot} 存不進去`;
        this.refresh();
        break;
      }
      case 'save-active': {
        const index = readIndex(this.storage);
        const record = saveToSlot(this.options.save, index.active, {
          persist: () => GameState.persistSave(),
          scenario: this.options.scenario,
        });
        this.flashText = record ? `已存入當前槽 ${index.active} · ${record.meta.monthText}` : '存檔失敗';
        this.refresh();
        break;
      }
      case 'load': {
        const result = loadFromSlot(hit.slot);
        if (!result.ok) {
          this.flashText = result.reason;
          this.refresh();
          break;
        }
        this.flashText = `已讀取槽 ${hit.slot} · ${result.meta ? result.meta.monthText : ''}`;
        this.refresh();
        // 換盤之後記憶體 / 場景都是舊的：交給呼叫端重建，然後收面板（同 web 的 closeOverlays）。
        this.options.onLoad?.(result);
        this.close();
        break;
      }
      case 'del': {
        const had = deleteSlot(hit.slot);
        this.flashText = had ? `已刪除槽 ${hit.slot}` : `槽 ${hit.slot} 本來就是空的`;
        this.refresh();
        break;
      }
      case 'row': {
        setActiveSlot(hit.slot);
        this.flashText = `存檔目標改為槽 ${hit.slot}`;
        this.refresh();
        break;
      }
      case 'close':
      default: {
        this.close();
        break;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 重畫                                                              */
  /* ---------------------------------------------------------------- */

  private refresh(): void {
    if (!this.built) return;
    const index = readIndex(this.storage);
    if (this.labelSub) this.labelSub.string = subText(index);
    if (this.labelMsg) this.labelMsg.string = this.flashText || SAVE_TIP;

    this.paint(index);

    this.hits = [];
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const slot = i + 1;
      const record = slotRecord(index, slot);
      const lines = slotLines(record, slot, index.active);
      const labels = this.rowLabels[i];
      const buttons = this.btnLabels[i];
      if (labels && labels.length === 3) {
        labels[0].string = lines.l1;
        labels[1].string = lines.l2;
        labels[2].string = lines.l3;
        labels[0].color = rgba(record ? COLORS.goldLight : COLORS.textFaint);
        labels[1].color = rgba(record ? COLORS.textDim : COLORS.textFaint);
        labels[2].color = rgba(record ? COLORS.textDim : COLORS.textFaint);
      }
      if (buttons && buttons.length === 3) {
        buttons[0].color = rgba(COLORS.goldLight);
        buttons[1].color = rgba(record ? COLORS.text : COLORS.textFaint);
        buttons[2].color = rgba(record ? COLORS.danger : COLORS.textFaint);
      }
      // 先推按鈕再推整列：掃描是線性的，按鈕要贏過列。
      this.hits.push({ rect: btnRect(i, 0), act: 'save', slot, label: `slot:${slot}:save` });
      if (record) {
        this.hits.push({ rect: btnRect(i, 1), act: 'load', slot, label: `slot:${slot}:load` });
        this.hits.push({ rect: btnRect(i, 2), act: 'del', slot, label: `slot:${slot}:del` });
      }
      this.hits.push({ rect: rowRect(i), act: 'row', slot, label: `slot:${slot}:row` });
    }
    this.hits.push({ rect: LAYOUT.footSave, act: 'save-active', slot: index.active, label: 'foot:save' });
    this.hits.push({ rect: LAYOUT.footClose, act: 'close', slot: 0, label: 'foot:close' });
  }

  private paint(index: SlotIndex): void {
    const g = this.g;
    if (!g) return;
    g.clear();

    // 蒙版 + 面板底 + 邊框
    g.fillColor = new Color(6, 8, 12, 214);
    this.fillRect(g, LAYOUT.screen, new Color(6, 8, 12, 214));
    g.fillColor = rgba(COLORS.panel, 250);
    g.roundRect(LAYOUT.frame.x - HALF_W, HALF_H - LAYOUT.frame.y - LAYOUT.frame.h, LAYOUT.frame.w, LAYOUT.frame.h, 12);
    g.fill();
    g.strokeColor = rgba(COLORS.goldDim, 220);
    g.lineWidth = 2;
    g.roundRect(LAYOUT.frame.x - HALF_W, HALF_H - LAYOUT.frame.y - LAYOUT.frame.h, LAYOUT.frame.w, LAYOUT.frame.h, 12);
    g.stroke();

    // 標題下的金線
    g.strokeColor = rgba(COLORS.goldDim, 160);
    g.lineWidth = 1;
    g.moveTo(LAYOUT.frame.x + 24 - HALF_W, HALF_H - (LAYOUT.frame.y + 108));
    g.lineTo(LAYOUT.frame.x + LAYOUT.frame.w - 24 - HALF_W, HALF_H - (LAYOUT.frame.y + 108));
    g.stroke();

    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const slot = i + 1;
      const record = slotRecord(index, slot);
      const active = index.active === slot;
      const row = rowRect(i);

      g.fillColor = record ? rgba(COLORS.panelHi, 235) : rgba(COLORS.bgDeep, 200);
      g.roundRect(row.x - HALF_W, HALF_H - row.y - row.h, row.w, row.h, 8);
      g.fill();
      g.strokeColor = rgba(record ? COLORS.line : COLORS.bgDeep, 255);
      g.lineWidth = 1;
      g.roundRect(row.x - HALF_W, HALF_H - row.y - row.h, row.w, row.h, 8);
      g.stroke();

      if (active) {
        // 左側金條 = 使用中
        g.fillColor = rgba(COLORS.gold, 255);
        g.rect(row.x - HALF_W, HALF_H - row.y - row.h + 8, 4, row.h - 16);
        g.fill();
      }

      for (let k = 0; k < 3; k += 1) {
        const rect = btnRect(i, k);
        const enabled = k === 0 || record !== null;
        g.fillColor = enabled ? rgba(COLORS.panel, 255) : rgba(COLORS.bgDeep, 170);
        g.roundRect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h, 6);
        g.fill();
        g.strokeColor = enabled
          ? rgba(k === 0 ? COLORS.goldDim : k === 1 ? COLORS.ours : COLORS.danger, 220)
          : rgba(COLORS.line, 120);
        g.lineWidth = 1;
        g.roundRect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h, 6);
        g.stroke();
      }
    }

    // 底部兩顆
    const save = LAYOUT.footSave;
    g.fillColor = rgba(COLORS.gold, 240);
    g.roundRect(save.x - HALF_W, HALF_H - save.y - save.h, save.w, save.h, 8);
    g.fill();
    const close = LAYOUT.footClose;
    g.fillColor = rgba(COLORS.panelHi, 255);
    g.roundRect(close.x - HALF_W, HALF_H - close.y - close.h, close.w, close.h, 8);
    g.fill();
    g.strokeColor = rgba(COLORS.line, 255);
    g.lineWidth = 2;
    g.roundRect(close.x - HALF_W, HALF_H - close.y - close.h, close.w, close.h, 8);
    g.stroke();
  }

  private fillRect(g: Graphics, rect: SlotRect, color: Color): void {
    g.fillColor = color;
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.fill();
  }

  private makeLabel(
    name: string,
    text: string,
    rect: SlotRect,
    size: number,
    hex: string,
    align: 'left' | 'center',
  ): Label {
    const node = new Node(name);
    node.layer = this.node.layer;
    this.node.addChild(node);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(rect.w, rect.h);
    transform.setAnchorPoint(0.5, 0.5);
    node.setPosition(rect.x + rect.w / 2 - HALF_W, HALF_H - (rect.y + rect.h / 2), 0);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = size;
    label.lineHeight = Math.round(size * 1.3);
    label.color = rgba(hex);
    label.horizontalAlign = align === 'left' ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
    return label;
  }
}
