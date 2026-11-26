/**
 * ItemsPanel.ts — 物品 / 裝備面板（移植 `game/web/items.html`，625 行）。
 *
 * 對應 web 版面：
 *   頁眉（共 N 件 · 可裝備 55 · 背包 N · 已裝備 n/4）
 *   武將卡（肖像 72×92 + 武力/智力/生命/速度 + 所在城/忠誠 + 四槽 + 12 人切換）
 *   分類頁籤（全部/兵器/坐騎/兵書/寶物/兵符/陣法）
 *   物品列表（圖示 + 名稱 + 描述 + Lv + 加成；依 Sort 升序、按組帶表頭）
 *   右側詳情（大圖 + 類型 + 擁有/裝備狀態 + 十項加成表 + 描述 + 裝上後預覽 + 12 行原作欄位）
 *   底欄（裝備/卸下 + 全部解鎖 + 返回 + 提示行）
 *
 * 與 web 的三處必要差異（都寫在 `project/70_Cocos物品页.md` 的「移植對照」裡）：
 *  1. **分頁代替滾動**：Cocos 這套工程沒有 ScrollView 型別（`types/cc.d.ts` 沒宣告，且場景是
 *     純代碼建節點），列表改成「上頁/下頁 + 第 x/y 頁」。每頁按高度貪心裝填（行 56px、組頭 26px），
 *     所以組頭永遠不會被切到頁外。
 *  2. **武將切換條 2 行 × 6 個**：web 是橫向滾動的 12 人一條；面板高度夠，直接鋪成兩行，
 *     12 人一次全在視野裡，省掉一個滾動容器。
 *  3. **toast 用 `setTimeout` 1.6s 自己消失**（web 同款 1.6s）；沒有調度器依賴。
 *
 * 觸控口徑與 CampaignRoot 一致：全域 `input.on(TOUCH_END)` → `UITransform.convertToNodeSpaceAR`
 * → 設計座標（左上原點）→ 命中 `hits[]` 裡的矩形。
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
  Layers,
  Node,
  sys,
  UITransform,
  Vec3,
} from 'cc';
import { addVeil, ArtBg, ArtSprite, loadFrame } from './ArtLayer';
import {
  allItems,
  applyEquip,
  bitsOf,
  bonusOf,
  equipItem,
  equippedSlot,
  GROUP_LABELS,
  GROUP_ORDER,
  groupOf,
  isEquippable,
  isFormBook,
  isTalisman,
  itemOf,
  normalizeEquips,
  num,
  registerItems,
  runtimeGeneral,
  slotOf,
  SLOT_NAMES,
  SLOTS,
  STAT_KEYS,
  STAT_NAMES,
  typeOf,
  unequipSlot,
} from './ItemsModel';
import type { EquipTable, GroupKey, ItemLike, Slot, StatKey } from './ItemsModel';
// F-05：物品表快照的 localStorage 鍵（算法在 core/equip_bonus，這裡只負責寫快照）
import { EQUIP_ITEMS_CACHE_KEY } from './core/equip_bonus';
import { loadPortrait } from './Portrait';
import type { PortraitResult } from './Portrait';
import type { General, Item } from './types';
// 「這座城現在有誰」的唯一入口（純邏輯、零 cc 依賴）：武將池從存檔的運行時人事取，
// 不再吃 `generals.json` 的靜態 `CITY`（劇本 0）——見 `OfficersOfCity.ts` 的檔頭說明。
import * as O from './OfficersOfCity';
import type { DesignRect as Rect } from './ArtLayer';
import { COLORS, FONT_FAMILY } from './view/theme';
import { applyTextRole, applyTextRoles } from './TextRole';
import { makeNineSlice, placeDesign } from './UiSkin';
// 漸層近似（w5-render）：Cocos 沒有 CSS gradient，用多段色帶逼近
import { Band, doubleEdge, edgeBands, hBands, innerEdge, lightGrid, topSheen, vBands, WARM, wash } from './Draw';
import { guardTouch } from './InputGuard';

const { ccclass } = _decorator;

/**
 * 設計分辨率寫死在面板裡（跟 ArtLayer 的 HALF_W/HALF_H 同一個口徑），
 * 這樣 `ItemsPanel` 的執行期依賴只有 `cc` + `ArtLayer` + `Portrait` + `ItemsModel` + `theme`，
 * 不會把 `view/layout`（→ `core/battle`）整條鏈拖進來；矩形型別直接借 ArtLayer 的 `DesignRect`。
 */
const DESIGN_W = 750;
const DESIGN_H = 1334;
const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/** 武将卡上那四項的短名（web items.html 的 `武力 99 · 智力 85 · 生命 85 · 速度 0`）。 */
const GEN_STAT_LABELS: Record<string, string> = { STR: '武力', INT: '智力', MaxHP: '生命', Speed: '速度' };

/** 物品存檔 key：與 web 同一個（`items.html` 的 `sanguo_items_v1`），方便兩邊互通。 */
export const ITEM_SAVE_KEY = 'sanguo_items_v1';

/** web 的初始背包（12 件）。 */
export const DEFAULT_BAG = [1, 4, 49, 52, 14, 20, 45, 56, 57, 73, 76, 77];

/** 武將卡最多顯示 12 人（與 web 一致）。 */
export const POOL_SIZE = 12;
/** 列表行池 / 組頭池 / 頁容量（設計像素）。 */
export const ROW_POOL = 11;
const HEAD_POOL = 6;
const ROW_H = 56;
const HEAD_H = 26;
const LIST_BODY = 644;
/**
 * 橡膠筋越界上限（設計 px，w9-render3）。
 *
 * web 的 `overflow-y:auto` 在 iOS/Android 上拉到兩端會有橡皮筋：手指離開後回彈。
 * 這裡允許拖到 [-OVERSCROLL, maxScroll+OVERSCROLL]，拖動時越界量打 0.42 折（越拉越硬），
 * 松手後由 `update()` 用 `lerp()` 收回端點。超過這個量就硬夾住，避免拖到天外。
 */
const OVERSCROLL = 56;
/** 越界橡皮筋阻尼：手指拉 1px，畫面只動 0.42px */
const RUBBER = 0.42;
/** 慣性每幀衰減（工單指定 0.92）：60fps 下約 0.55s 衰到 3px/幀以下 */
const INERTIA_DECAY = 0.92;
/** 低於這個速度就當停住（設計 px / 幀） */
const INERTIA_MIN = 3;
/**
 * 標量線性插值（回彈用）。
 *
 * 引擎 `math` 命名空間的 `lerp` 在 3.8.8 的 `cc` 型別宣告裡只導出了 `Vec2.lerp`（拿 `IVec2Like` 當出參），
 * 沒有 number 版；爲了一個標量插值去造 `Vec2` 不划算，這裡照 `math.lerp` 的公式 `a + (b - a) * t` 寫一份。
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
const TOAST_MS = 1600;

const TYPE_NAMES: Record<string, string> = {
  JEWEL_WEAPON: '兵器',
  JEWEL_HORSE: '坐騎',
  JEWEL_THING: '兵書',
  JEWEL_MISC: '雜項',
};

const ATTRIB_NAMES: Record<string, string> = {
  '': '—',
  ONLYONE: '唯一（ONLYONE）',
  USED: '使用（USED）',
};

/** 面板幾何：全部設計座標（750×1334、左上原點）。導出給 `panel_layout.md` 對照。 */
export const LAYOUT = {
  screen: { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H },
  header: { x: 0, y: 0, w: DESIGN_W, h: 96 },
  title: { x: 175, y: 8, w: 400, h: 44 },
  sub: { x: 19, y: 54, w: 712, h: 34 },
  gen: { x: 18, y: 96, w: 714, h: 302 },
  portrait: { x: 34, y: 108, w: 72, h: 92 },
  genName: { x: 116, y: 106, w: 320, h: 32 },
  genStat: { x: 116, y: 138, w: 560, h: 24 },
  genCity: { x: 116, y: 162, w: 560, h: 22 },
  slot: { x: 34, y: 190, w: 164, h: 54, gap: 8 },
  /**
   * 武將卡底部的「裝備總加成」摘要帶（w7-cocos-render3）。
   *
   * 十二格武將格（`pick`）第二排結束在 y 368，卡片邊界 398 —— 中間 30px 原本是純空帶，
   * 在這張 750×1334 的頁面上等於白扔一條。web 的 `items.html` 在四槽底下有一行
   * 「已裝備合計」，這裡照同一位置補上（不改任何既有矩形，只填空白）。
   */
  genBonus: { x: 34, y: 369, w: 682, h: 24 },
  pick: { x: 34, y: 254, w: 107, h: 54, gap: 8, perRow: 6, rowGap: 6 },
  tabs: { x: 24, y: 414, w: 56, h: 34, gap: 4 },
  list: { x: 18, y: 406, w: 430, h: 736 },
  listBody: { x: 26, y: 456, w: 414, h: LIST_BODY },
  row: { x: 26, w: 414, h: ROW_H },
  nav: { x: 26, y: 1104, w: 414, h: 32 },
  det: { x: 460, y: 406, w: 272, h: 736 },
  bigFrame: { x: 533, y: 414, w: 126, h: 126 },
  bigImage: { x: 546, y: 427, w: 100, h: 100 },
  detName: { x: 464, y: 546, w: 264, h: 28 },
  detType: { x: 464, y: 574, w: 264, h: 18 },
  detFoot: { x: 464, y: 592, w: 264, h: 18 },
  sectBonus: { x: 464, y: 616, w: 264, h: 18 },
  /**
   * 加成表的兩欄（v18-cocos-layout 修版式）。
   *
   * 舊值 `[{x:468,w:126}, {x:594,w:126}]`：右欄 x 594 剛好等於左欄「數值框」的右邊界
   * （`x + w - 52` = 542，寬 52 → 594），於是 `武力 +1` 的 `+1` 與 `生命` 貼在一起，
   * 渲染成「武力 +1生命 —」（見 r89_04_items.png）。
   * 現在：左欄 464..590、右欄 602..728，欄間 12px 淨空；每格「標籤左對齊(w78) + 數值右對齊(w46)」。
   */
  statCol: [{ x: 464, y: 638, w: 126 }, { x: 602, y: 638, w: 126 }],
  statRowStep: 20,
  desc: { x: 464, y: 742, w: 264, h: 42 },
  preview: { x: 464, y: 788, w: 264, h: 34 },
  sectField: { x: 464, y: 826, w: 264, h: 18 },
  fieldKeys: { x: 464, y: 848, w: 132, h: 192 },
  fieldVals: { x: 596, y: 848, w: 132, h: 192 },
  footer: { x: 18, y: 1152, h: 76 },
  actBtn: { x: 18, y: 1152, w: 400, h: 76 },
  unlockBtn: { x: 430, y: 1152, w: 146, h: 76 },
  backBtn: { x: 588, y: 1152, w: 144, h: 76 },
  hint: { x: 18, y: 1240, w: 714, h: 40 },
  toast: { x: 150, y: 690, w: 450, h: 54 },
} as const;

/** 物品存檔形狀：與 web 的 `{equip:{名:{槽:seq}}, bag:[seq]}` 相同，多存一個 `gen` 記住上次選的武將。 */
export interface ItemsSave {
  equip: Record<string, EquipTable>;
  bag: number[];
  gen: string | null;
}

type TabKey = 'all' | GroupKey;

interface Tab {
  key: TabKey;
  label: string;
}

interface Hit {
  rect: Rect;
  act: () => void;
}

type ListEntry =
  | { kind: 'head'; group: GroupKey; label: string; total: number; owned: number; height: number }
  | { kind: 'row'; item: ItemLike; height: number };

/** `debug()` 的輸出：給 headless 驗證（work/cocos_items/panel_headless.mjs）與報告用。 */
export interface PanelDebug {
  opened: boolean;
  generals: string[];
  genIndex: number;
  general: string | null;
  /** 選中將現在所在城（運行時；測試釘「不是劇本 0 的靜態 CITY」用）。 */
  generalCity: string;
  filter: TabKey;
  page: number;
  pages: number;
  entries: number;
  /** 每頁塞了幾筆（含組頭），驗收「8 頁每頁都有內容」用。 */
  pageSizes: number[];
  selected: number | null;
  bag: number;
  equipped: string[];
  tabs: string[];
  hits: number;
  toast: string;
}

/* ------------------------------------------------------------------------- */
/* 純函式小工具                                                              */
/* ------------------------------------------------------------------------- */

function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

/** 有裝備時顯示 `80→110`，沒變只顯示數字（web 的 `<i>b→a</i>` 同義）。 */
function pairText(before: number, after: number): string {
  return before === after ? String(after) : `${before}→${after}`;
}

function seqOf(item: ItemLike | null | undefined): number | null {
  if (!item) return null;
  const seq = Number(item.Sequence);
  return Number.isFinite(seq) ? seq : null;
}

function bySortAsc(a: ItemLike, b: ItemLike): number {
  const diff = num(a.Sort) - num(b.Sort);
  if (diff !== 0) return diff;
  return num(a.Sequence) - num(b.Sequence);
}

/** `"JEWEL\\BOOK01"` → `"BOOK01"`（web 的 `Sprite.split(/[\\/]/).pop()`）。 */
function iconStem(item: ItemLike | null | undefined): string {
  const sprite = typeof item?.Sprite === 'string' ? item.Sprite : '';
  const parts = sprite.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

/** 圖示的 bundle key：`items/BOOK01`（bundle 內是 `items/BOOK01.png`，key 不帶副檔名）。 */
function iconPath(item: ItemLike | null | undefined): string | null {
  const stem = iconStem(item);
  return stem.length > 0 ? `items/${stem}` : null;
}

function textOrDash(v: unknown): string {
  if (v === '' || v === null || v === undefined) return '—';
  return String(v);
}

function bitsText(mask: unknown): string {
  const bits = bitsOf(mask);
  return bits.length > 0 ? bits.join(' / ') : '—';
}

/** 列表行第二行（web 的 `bonus` 欄）。 */
function rowBonusText(item: ItemLike): string {
  if (slotOf(item) !== null) {
    const b = bonusOf(item);
    const parts: string[] = [];
    for (const k of STAT_KEYS) if (b[k] !== 0) parts.push(`${STAT_NAMES[k]} ${b[k] > 0 ? '+' : ''}${b[k]}`);
    return parts.length > 0 ? parts.join(' · ') : '無加成';
  }
  const desc = typeof item.Description === 'string' ? item.Description : '';
  if (isTalisman(item)) return desc.replace(/^可使用/, '解鎖') || '—';
  if (isFormBook(item)) return desc.replace(/^學會/, '') || '—';
  return desc || '—';
}

/**
 * 列表行的「第三行」：只留 `Description` 裡 meta 行沒說過的條目。
 *
 * 原作資料的 `Description` 是「條目式」的一句話，例如
 * `"速度上昇5點，無法退兵無效，使用等級40。"`。前後兩段 meta 行已經有
 * （`Lv 40 · 速度 +5`），只有中間那段是真正的額外資訊，所以剝掉前兩類：
 *   ① `<屬性>上昇 N 點` —— meta 的加成欄在講同一件事；
 *   ② `使用等級 N`      —— meta 的 `Lv N` 在講同一件事。
 * 全被剝光就回空字串，呼叫端把 meta 上移補位（見 `rowParts().merged`）。
 */
function rowExtraText(item: ItemLike): string {
  if (slotOf(item) === null) return '';
  const desc = typeof item.Description === 'string' ? item.Description : '';
  if (!desc) return '';
  const kept = desc
    .split(/[，、。]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !/^[^0-9]{1,6}(上昇|上升|增加)\s*[+-]?\d+\s*點?$/.test(part))
    .filter((part) => !/^使用等級\s*\d+$/.test(part));
  return kept.join(' · ');
}

/** 貪心分頁：每頁高度 ≤ budget，組頭不會被切到頁外。 */
function paginate(entries: readonly ListEntry[], budget: number): ListEntry[][] {
  const pages: ListEntry[][] = [];
  let page: ListEntry[] = [];
  let used = 0;
  for (const entry of entries) {
    if (page.length > 0 && used + entry.height > budget) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(entry);
    used += entry.height;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

function readItemsSave(): ItemsSave {
  const out: ItemsSave = { equip: {}, bag: DEFAULT_BAG.slice(), gen: null };
  let raw: string | null = null;
  try {
    raw = sys.localStorage.getItem(ITEM_SAVE_KEY);
  } catch (err) {
    console.warn(`[ItemsPanel] 讀取 ${ITEM_SAVE_KEY} 失敗：${String(err)}`);
  }
  if (!raw) return out;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[ItemsPanel] ${ITEM_SAVE_KEY} 不是合法 JSON，用預設背包：${String(err)}`);
    return out;
  }
  if (!parsed || typeof parsed !== 'object') return out;
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.bag)) {
    const bag: number[] = [];
    for (const v of obj.bag) {
      const seq = Number(v);
      if (Number.isFinite(seq)) bag.push(seq);
    }
    out.bag = bag;
  }
  if (obj.equip && typeof obj.equip === 'object') {
    for (const [name, table] of Object.entries(obj.equip as Record<string, unknown>)) {
      out.equip[name] = normalizeEquips(table);
    }
  }
  if (typeof obj.gen === 'string') out.gen = obj.gen;
  return out;
}

function writeItemsSave(save: ItemsSave): void {
  try {
    sys.localStorage.setItem(ITEM_SAVE_KEY, JSON.stringify(save));
  } catch (err) {
    console.warn(`[ItemsPanel] 寫入 ${ITEM_SAVE_KEY} 失敗：${String(err)}`);
  }
}

/**
 * 寫一份物品表快照（`F-05` 装备加成的共用資料通道）。
 *
 * 物品頁是**唯一**手裡有整張 `data/items` 表的地方；名冊（`GeneralBook.ts`）與出征
 * （`GameState.startBattle`）都是同步模型，拿不到 `DataLoader.loadGameData()` 的
 * Promise，所以只能讀這份快照 + `sanguo_items_v1` 的裝備紀錄。物品表是靜態設定檔
 * （77 列、約 35KB），每次開物品頁覆寫一次即可；寫失敗只影響加成顯示，絕不能擋開面板。
 */
function writeEquipItemsCache(items: readonly Item[]): void {
  try {
    sys.localStorage.setItem(EQUIP_ITEMS_CACHE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn(`[ItemsPanel] 寫入 ${EQUIP_ITEMS_CACHE_KEY} 失敗：${String(err)}`);
  }
}

/** web 的武將池口徑：排除盜賊 → 只留自家城（沒有 owned 就要求 CITY 非空）→ STR+INT 前 12。 */
function pickPool(generals: readonly General[], owned: readonly string[]): General[] {
  const ownedSet = new Set(owned.filter((name) => typeof name === 'string' && name.length > 0));
  const usable = generals.filter((g) => {
    if (!g || typeof g.NAME !== 'string' || g.NAME.length === 0) return false;
    if (g.NAME === '盜賊') return false;
    return ownedSet.size > 0 ? ownedSet.has(g.CITY ?? '') : Boolean(g.CITY);
  });
  const sorted = usable
    .slice()
    .sort((a, b) => num(b.STR) + num(b.INT) - (num(a.STR) + num(a.INT)));
  const pool = sorted.slice(0, POOL_SIZE);
  if (pool.length === 0) {
    const fallback = generals.find((g) => g?.NAME === '關羽') ?? generals[0];
    if (fallback) pool.push(fallback);
  }
  return pool;
}

/**
 * 武將池的**運行時口徑**（2026-11-26 用戶反饋：物品頁武將卡不該被劇本表綁死）。
 *
 * 池子 = 我方每座城「現在駐著誰」（`OfficersOfCity.officersOfCity`）：先讀存檔裡的人事
 * 紀錄（`roster` / `cities[城].officers`），只有完全沒有紀錄的城才按劇本表播種。
 * 這樣「劉備開局看到張角」不再可能：劇本 1 下平原的運行時名單是劉備自己人。
 *
 * `pickPool()` 只在存檔連一座城的名字都給不出時兜底（例如舊檔/空存檔）。
 */
function pickRuntimePool(
  generals: readonly General[],
  opts: ItemsOpenOptions,
  owned: readonly string[],
): { pool: General[]; cities: Record<string, string>; rows: Map<string, O.OfficerLike> } {
  const built = O.ownedOfficerPool(
    opts.save,
    owned,
    {
      generals,
      scenIdx: opts.scenIdx ?? 0,
      roster: (opts.roster as Record<string, unknown> | null | undefined) ?? null,
      playerForce: opts.playerForce ?? '',
      scenarioCities: opts.scenarioCities ?? null,
    },
    POOL_SIZE + 32,
  );
  const byName = new Map<string, General>();
  for (const g of generals) {
    const name = typeof g?.NAME === 'string' ? g.NAME : '';
    if (name && !byName.has(name)) byName.set(name, g);
  }
  const pool: General[] = [];
  for (const name of built.names) {
    if (pool.length >= POOL_SIZE) break;
    const g = byName.get(name);
    if (g) pool.push(g);
  }
  const rows = new Map<string, O.OfficerLike>();
  for (const row of built.rows) rows.set(row.name, row);
  const cities: Record<string, string> = {};
  for (const name of built.names) cities[name] = built.cityOf[name] ?? '';
  return { pool, cities, rows };
}

function buildTabs(): Tab[] {
  const tabs: Tab[] = [{ key: 'all', label: '全部' }];
  for (const group of GROUP_ORDER) tabs.push({ key: group, label: GROUP_LABELS[group].replace(/\s+/g, '') });
  return tabs;
}

/* ------------------------------------------------------------------------- */
/* 面板                                                                      */
/* ------------------------------------------------------------------------- */

export interface ItemsPanelOptions {
  onClose?: (() => void) | null;
}

/**
 * `open()` 的第 4 個參數：武將池的資料源（存檔運行時人事）。
 *
 * 兩個呼叫端（`CampaignRoot.openItems()` / `CityPanel.cmdItems()`）都必須傳；
 * 少了 `save` 才會退回舊的劇本表口徑（只當舊檔兼容的兜底，正常遊玩走不到）。
 */
export interface ItemsOpenOptions {
  /** 戰役存檔（`GameState.loadSave()` 或內政面板持有的 `CitySave`）；取運行時人事用。 */
  save?: unknown;
  /** `generals.json` 全表；查 STR/INT/Loyal/Status（不傳就用 `open()` 的第一個參數）。 */
  generals?: readonly General[] | null;
  /** 劇本號（`RunSetup.scenarioIndex()`）；**只**用於「還沒有人事紀錄的城」的播種。 */
  scenIdx?: number;
  /** 當前城（`CampaignRoot.selected` / 內政頁的 `cityName`）：默認選將優先這座城的太守。 */
  cityName?: string;
  /** 君主名（`M.monarchOf(...)` / `runPlayerForce()`）：默認選將第二優先。 */
  king?: string;
  /** 當前城太守名（`CampaignRoot.leaderOf(city)` / 內政 `M.majorOf`）：第一優先。 */
  preferName?: string;
  /** 運行時 roster（`mergeRosters(存檔 roster, 內政 extras roster)`）；不傳就讀 `save.roster`。 */
  roster?: Record<string, unknown> | null;
  /** 玩家勢力名（`RunSetup.playerForce()`）；判斷「劇本開局是否屬於玩家」用。 */
  playerForce?: string;
  /** `scenarios[scenIdx].cities`；判斷城池 KING/MAJOR 用。 */
  scenarioCities?: readonly unknown[] | null;
}

export const ITEMS_NODE_NAME = 'ItemsPanel';

/**
 * 九宮底板規格（w5-cocos-skin）。
 *
 * 只放「位置固定、一生只建一次」的底板；隨資料變動的分頁籤、武將格、分頁鈕在
 * `build()` 的對應迴圈裡各自建（見 `addPlate`），選中行用一塊可移動的 `plate_sel`。
 * `rect` 全部照抄 `LAYOUT` 的既有矩形，一個數字不新增。
 */
interface SkinSlot {
  name: string;
  key: string;
  rect: Rect;
}

/**
 * R224：`全部解鎖`（補滿背包）是 **web 調試台** 的設施（`game/web/items.html:199` 標了「調試」）。
 * 依 `project/215_双端口径与调试开关.md`「Cocos = 正式版」，原生包（`sys.isNative`）與 `?rel=1`
 * 發佈形態都不該出現；只在 web-mobile 預覽 / headless 驗證裡保留。
 */
function devToolsOn(): boolean {
  try {
    const g = globalThis as unknown as {
      cc?: { sys?: { isNative?: boolean } };
      location?: { search?: string };
    };
    if (g.cc && g.cc.sys && g.cc.sys.isNative) return false;
    const search = String(g.location?.search ?? '');
    if (/[?&]rel=1(?:&|$)/.test(search)) return false;
    return true;
  } catch {
    return true;
  }
}

const SKIN_SLOTS: readonly SkinSlot[] = [
  { name: 'SkinGenFrame', key: 'frame_panel', rect: LAYOUT.gen },
  { name: 'SkinListFrame', key: 'frame_panel', rect: LAYOUT.list },
  { name: 'SkinDetFrame', key: 'frame_panel', rect: LAYOUT.det },
  { name: 'SkinPortraitPlate', key: 'plate_sq', rect: LAYOUT.portrait },
  { name: 'SkinBigFrame', key: 'plate_sq', rect: LAYOUT.bigFrame },
  { name: 'SkinActPlate', key: 'plate_btn', rect: LAYOUT.actBtn },
  { name: 'SkinUnlockPlate', key: 'plate_btn', rect: LAYOUT.unlockBtn },
  { name: 'SkinBackPlate', key: 'plate_btn', rect: LAYOUT.backBtn },
];

@ccclass('ItemsPanel')
export class ItemsPanel extends Component {
  /** 面板根節點（`show()` 創建，掛在呼叫方的節點下）。 */
  static show(parent: Node, options: ItemsPanelOptions = {}): ItemsPanel {
    const node = parent.getChildByName(ITEMS_NODE_NAME) ?? new Node(ITEMS_NODE_NAME);
    if (!node.parent) {
      node.layer = Layers.Enum.UI_2D;
      node.parent = parent;
    }
    let panel = node.getComponent(ItemsPanel);
    if (!panel) panel = node.addComponent(ItemsPanel);
    panel.onCloseCb = options.onClose ?? null;
    panel.build();
    return panel;
  }

  /* ---- 生命週期 ---- */

  private built = false;
  private opened = false;
  private listening = false;
  private onCloseCb: (() => void) | null = null;

  /* ---- 節點 ---- */

  private artBg: ArtBg | null = null;
  private g: Graphics | null = null;
  private labelTitle: Label | null = null;
  private labelSub: Label | null = null;
  private portrait: ArtSprite | null = null;
  private labelGenName: Label | null = null;
  private labelGenStat: Label | null = null;
  private labelGenCity: Label | null = null;
  /** 武將卡底部：四槽已裝備的合計加成（w7-cocos-render3） */
  private labelGenBonus: Label | null = null;
  private slotKeys: Label[] = [];
  private slotVals: Label[] = [];
  private pickSprites: ArtSprite[] = [];
  private pickLabels: Label[] = [];
  private tabLabels: Label[] = [];
  private headLabels: Label[] = [];
  private rowSprites: ArtSprite[] = [];
  private rowNames: Label[] = [];
  private rowDescs: Label[] = [];
  private rowMetas: Label[] = [];
  private labelPage: Label | null = null;
  private labelPrev: Label | null = null;
  private labelNext: Label | null = null;
  private bigSprite: ArtSprite | null = null;
  private labelDetName: Label | null = null;
  private labelDetType: Label | null = null;
  private labelDetFoot: Label | null = null;
  private labelSectBonus: Label | null = null;
  private statNames: Label[] = [];
  private statVals: Label[] = [];
  private labelDesc: Label | null = null;
  private labelPreview: Label | null = null;
  private labelSectField: Label | null = null;
  private labelFieldKeys: Label | null = null;
  private labelFieldVals: Label | null = null;
  /** 詳情卡底部的常駐註記（無選中時那 100px 空帶的填充之一，見 drawFrame） */
  private labelDetNote: Label | null = null;
  private labelActMain: Label | null = null;
  private labelActSub: Label | null = null;
  /** R224：調試設施是否可見（原生包＝false，見 `devToolsOn()`）。 */
  private devTools = true;

  private labelUnlockMain: Label | null = null;
  private labelUnlockSub: Label | null = null;
  private labelBack: Label | null = null;
  private labelHint: Label | null = null;
  private labelToast: Label | null = null;

  /* ---- 九宮底板（w5-cocos-skin） ---- */

  private skinLayer: Node | null = null;
  private skinNodes = new Map<string, Node>();
  /** 選中行的 `plate_sel`：列表行是動態落點（`placed`），所以只留一塊、每幀擺位。 */
  private skinRowSel: Node | null = null;

  /* ---- 狀態 ---- */

  private generals: General[] = [];
  private pool: General[] = [];
  private genIndex = 0;
  /** `open()` 第 4 參數：武將池資料源（存檔運行時人事），`renderGeneral` 也用它取所在城。 */
  private ctx: ItemsOpenOptions = {};
  /** 武將池每一員「現在在哪座城」（運行時；`renderGeneral` 的「所在」用）。 */
  private poolCities: Record<string, string> = {};
  /** 武將池每一員的運行時屬性（忠誠等；`renderGeneral` 用）。 */
  private poolRows = new Map<string, O.OfficerLike>();
  private save: ItemsSave = { equip: {}, bag: DEFAULT_BAG.slice(), gen: null };
  private bag = new Set<number>();
  private filter: TabKey = 'all';
  private page = 0;
  private pages: ListEntry[][] = [[]];
  /** 當前頁的最終落點（entry + y）：分頁是「組頭 26 / 行 56」混排，y 只能在 refresh 時算。 */
  private placed: { entry: ListEntry; y: number }[] = [];
  /**
   * 列表滾動量（設計 px，0 = 整份列表的頂端）。w7-cocos-render2：web 的物品列表是
   * `overflow-y:auto` 的長列表（一屏內可滾），Cocos 原本只有分頁。現在兩套入口共用
   * 同一組幾何：`pageTops[p]` = 第 p 頁起點的前綴和，「翻頁」= 把 scrollPx 跳到某頁起點，
   * 「拖動」= 在 0..maxScroll 之間平移窗口。分頁仍按 LIST_BODY 切，所以 `第 x/8 頁`、
   * pageSizes、每頁行數這些既有探針的口徑完全沒變。
   */
  private scrollPx = 0;
  /**
   * 列表的兩種擺法（w7-cocos-render2）：
   * true  = 「翻頁模式」：只鋪當前頁、從視窗頂開始，行數/組頭數等於 pageSizes[p]
   *         （work\cocos_items 的探針就是按這個口徑數的）；
   * false = 「拖動模式」：按 scrollPx 鋪整份列表的連續窗口，一行不多一行不少。
   * 用旗標而不是比較 scrollPx，是因為最後一頁的 pageTops 會被 maxScroll 夾住、
   * 兩者不再相等（第 8 頁 top=4412 > maxScroll=3824），比較法會誤判成拖動模式。
   */
  private pagedMode = true;
  private pageTops: number[] = [];
  private maxScroll = 0;
  private dragOn = false;
  private dragMoved = false;
  private dragStartY = 0;
  private dragStartScroll = 0;
  /**
   * 慣性速度，單位「設計 px / 幀（60fps 基準）」（w9-render3）。
   *
   * 為什麼要有：本頁的列表是自己寫的（不是 `ScrollView`），松手就停 —— 手感像「用手指
   * 拖一張紙」，而不是 web `overflow-y:auto` 那種「一甩滑好幾屏」。這裡照工單把 web 的
   * 合成器慣性搬過來：松手時記下速度，之後每幀 `v *= 0.92`，`|v| < 3` 就停。
   *
   * 公開（非 private）是給截圖/探針腳本讀的：驗收要證明「松手後還滑了多少 px」。
   */
  velPx = 0;
  /** 拖動取樣（時間戳 + 那次移動後的 scrollPx），松手時用最近兩點算速度 */
  private dragSampleT = 0;
  private dragSamplePx = 0;
  private selectedSeq: number | null = null;
  private toastText = '';
  private toastToken = 0;
  private hits: Hit[] = [];

  /* ---- 圖片快取記帳：避免每次 refresh 都重載同一張圖 ---- */

  private portraitFor = '';
  private pickFor: string[] = [];
  private rowIconFor: string[] = [];
  private bigFor = '';

  /* ----------------------------------------------------------------------- */
  /* 對外 API                                                                */
  /* ----------------------------------------------------------------------- */

  get isOpen(): boolean {
    return this.opened;
  }

  /** 建節點樹（冪等）。由 `show()` 呼叫；也可以在測試裡直接叫。 */
  build(): void {
    if (this.built) return;
    this.built = true;

    const root = this.node;
    root.layer = Layers.Enum.UI_2D;
    const transform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(DESIGN_W, DESIGN_H);

    // 底圖：bg/map_bg 已在包裡（CampaignRoot 用同一張），失敗時下面那層純色照樣兜住。
    this.artBg = new ArtBg(root, 'ItemsBg', LAYOUT.screen, true);
    this.artBg.node.setSiblingIndex(0);
    this.artBg.load('bg/map_bg');
    addVeil(root, 'ItemsVeil', LAYOUT.screen, new Color(8, 11, 16, 228));

    this.g = this.makeGraphics('ItemsFrame');
    this.buildSkin();

    this.labelTitle = this.makeLabel('ItemsTitle', '物 品 　裝 備', LAYOUT.title, 28, COLORS.goldLight, 'center');
    this.labelSub = this.makeLabel('ItemsSub', '', LAYOUT.sub, 14, COLORS.textDim, 'center');

    this.portrait = new ArtSprite(root, 'ItemsPortrait', LAYOUT.portrait, 'contain');
    this.labelGenName = this.makeLabel('ItemsGenName', '', LAYOUT.genName, 23, COLORS.goldLight, 'left');
    this.labelGenStat = this.makeLabel('ItemsGenStat', '', LAYOUT.genStat, 15, COLORS.text, 'left');
    this.labelGenCity = this.makeLabel('ItemsGenCity', '', LAYOUT.genCity, 13, COLORS.textDim, 'left');
    this.labelGenBonus = this.makeLabel('ItemsGenBonus', '', LAYOUT.genBonus, 12, COLORS.textDim, 'left');

    for (let i = 0; i < SLOTS.length; i += 1) {
      this.slotKeys.push(this.makeLabel('ItemsSlotKey', SLOT_NAMES[SLOTS[i]], this.slotKeyRect(i), 14, COLORS.textDim, 'center'));
      this.slotVals.push(this.makeLabel('ItemsSlotVal', '', this.slotValRect(i), 14, COLORS.text, 'center'));
    }

    for (let i = 0; i < POOL_SIZE; i += 1) {
      this.addPlate('plate_sq', this.pickRect(i), `SkinPickPlate_${i}`);
      this.pickSprites.push(new ArtSprite(root, 'ItemsPickFace', this.pickFaceRect(i), 'contain'));
      this.pickLabels.push(this.makeLabel('ItemsPickName', '', this.pickNameRect(i), 11, COLORS.textDim, 'center'));
      this.pickFor.push('');
    }

    const tabs = buildTabs();
    for (let i = 0; i < tabs.length; i += 1) {
      this.addPlate('plate_btn', this.tabRect(i), `SkinTabPlate_${i}`);
      this.tabLabels.push(this.makeLabel('ItemsTab', tabs[i].label, this.tabRect(i), 14, COLORS.textDim, 'center'));
    }

    for (let i = 0; i < HEAD_POOL; i += 1) {
      this.headLabels.push(
        this.makeLabel('ItemsHead', '', this.headLine(LAYOUT.listBody.y + i * (ROW_H + HEAD_H)), 12, COLORS.goldDim, 'left'),
      );
    }

    for (let i = 0; i < ROW_POOL; i += 1) {
      const parts = this.rowParts(LAYOUT.listBody.y + i * ROW_H);
      this.rowSprites.push(new ArtSprite(root, 'ItemsRowIcon', parts.icon));
      this.rowNames.push(this.makeLabel('ItemsRowName', '', parts.name, 15, COLORS.text, 'left'));
      this.rowDescs.push(this.makeLabel('ItemsRowDesc', '', parts.desc, 11, COLORS.textFaint, 'left'));
      this.rowMetas.push(this.makeLabel('ItemsRowMeta', '', parts.meta, 10, COLORS.textDim, 'left'));
      this.rowIconFor.push('');
    }

    this.labelPrev = this.makeLabel('ItemsPrev', '◀ 上頁', this.navRect(0), 13, COLORS.textDim, 'center');
    this.labelPage = this.makeLabel('ItemsPage', '', this.navRect(1), 12, COLORS.textDim, 'center');
    this.labelNext = this.makeLabel('ItemsNext', '下頁 ▶', this.navRect(2), 13, COLORS.textDim, 'center');
    this.addPlate('plate_btn', this.navRect(0), 'SkinNavPrevPlate');
    this.addPlate('plate_btn', this.navRect(2), 'SkinNavNextPlate');

    this.bigSprite = new ArtSprite(root, 'ItemsBigIcon', LAYOUT.bigImage);
    this.labelDetName = this.makeLabel('ItemsDetName', '', LAYOUT.detName, 19, COLORS.goldLight, 'center');
    this.labelDetType = this.makeLabel('ItemsDetType', '', LAYOUT.detType, 11, COLORS.textDim, 'center');
    this.labelDetFoot = this.makeLabel('ItemsDetFoot', '', LAYOUT.detFoot, 11, COLORS.textDim, 'center');
    this.labelSectBonus = this.makeLabel('ItemsSectBonus', '加 成', LAYOUT.sectBonus, 12, COLORS.gold, 'left');
    for (let i = 0; i < STAT_KEYS.length; i += 1) {
      this.statNames.push(this.makeLabel('ItemsStatName', '', this.statNameRect(i), 11, COLORS.textDim, 'left'));
      this.statVals.push(this.makeLabel('ItemsStatVal', '', this.statValRect(i), 11, COLORS.textDim, 'right'));
    }
    this.labelDesc = this.makeLabel('ItemsDesc', '', LAYOUT.desc, 11, COLORS.textDim, 'left', Label.Overflow.CLAMP);
    this.labelPreview = this.makeLabel('ItemsPreview', '', LAYOUT.preview, 11, COLORS.ok, 'left', Label.Overflow.CLAMP);
    this.labelSectField = this.makeLabel('ItemsSectField', '原 作 欄 位', LAYOUT.sectField, 12, COLORS.gold, 'left');
    this.labelFieldKeys = this.makeLabel('ItemsFieldKeys', '', LAYOUT.fieldKeys, 10, COLORS.textFaint, 'left');
    this.labelFieldVals = this.makeLabel('ItemsFieldVals', '', LAYOUT.fieldVals, 10, COLORS.text, 'right');
    // 原作欄位表底下的常駐註記：web 的 `items.html` 在欄位表下面還有一行細字說明，
    // 這裡把那 100px 空帶佔住（w12-render：詳情卡下半不再是一整片純色）。
    this.labelDetNote = this.makeLabel(
      'ItemsDetNote',
      '原作欄位為資料表原文 · 唯讀　加成已計入四槽 · 不重複計算',
      { x: LAYOUT.det.x + 8, y: 1046, w: LAYOUT.det.w - 16, h: 40 },
      11,
      COLORS.textFaint,
      'left',
      Label.Overflow.CLAMP,
    );

    this.labelActMain = this.makeLabel('ItemsActMain', '裝 備', this.actMainRect(), 21, COLORS.goldLight, 'center');
    this.labelActSub = this.makeLabel('ItemsActSub', '', this.actSubRect(), 12, COLORS.textDim, 'center');
    this.devTools = devToolsOn();
    this.labelUnlockMain = this.makeLabel('ItemsUnlockMain', '全部解鎖', this.unlockMainRect(), 15, COLORS.text, 'center');
    // R224：正式版藏掉「全部解鎖 / 補滿背包」（web 調試台設施），底板與命中一起收。
    this.labelUnlockMain.node.active = this.devTools;
    this.labelUnlockSub = this.makeLabel('ItemsUnlockSub', '補滿背包', this.unlockSubRect(), 11, COLORS.textFaint, 'center');
    this.labelUnlockSub.node.active = this.devTools;
    // R224：詳情卡下半的「原作欄位」除錯表也是 web 調試台設施（原始 Sequence / WeaponObject / Rate…），
    // 正式包（原生 / `?rel=1`）整塊收起：標題、兩欄、註記一起藏，畫框那幾條線在 drawFrame 裡同樣受
    // `devTools` 門控。headless / 預覽沒有 cc.sys.isNative，devToolsOn() 仍回 true，校驗腳本不受影響。
    if (this.labelSectField) this.labelSectField.node.active = this.devTools;
    if (this.labelFieldKeys) this.labelFieldKeys.node.active = this.devTools;
    if (this.labelFieldVals) this.labelFieldVals.node.active = this.devTools;
    if (this.labelDetNote) this.labelDetNote.node.active = this.devTools;
    this.labelBack = this.makeLabel('ItemsBack', '返 回', LAYOUT.backBtn, 15, COLORS.textDim, 'center');
    this.labelHint = this.makeLabel('ItemsHint', '', LAYOUT.hint, 11, COLORS.textFaint, 'center', Label.Overflow.CLAMP);
    this.labelHint.lineHeight = 17;

    this.labelToast = this.makeLabel('ItemsToast', '', LAYOUT.toast, 15, COLORS.goldLight, 'center');
    this.labelToast.node.active = false;

    // 最後一步：所有 Label 都建好了，統一上文字層級
    this.applyRoles();

    this.node.active = false;
  }

  /* ----------------------------------------------------------------------- */
  /* 九宮底板 + 文字層級（w5-cocos-skin）                                      */
  /* ----------------------------------------------------------------------- */

  /**
   * 建九宮底板層。
   *
   * 位置很關鍵：`artBg`（底圖）與 `ItemsVeil`（遮罩）排在它前面、所有 Label 排在它後面，
   * 所以底板一定會蓋住純色遮罩、又永遠不會壓到字。`frame_panel`/`plate_*` 的中心是
   * 全透明的（PNG 實測 alpha=0），底下的 Graphics 填充照樣透出來，不需要再疊底色。
   */
  private buildSkin(): void {
    const layer = new Node('ItemsPanelSkin');
    layer.layer = Layers.Enum.UI_2D;
    layer.setPosition(0, 0, 0);
    const transform = layer.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(DESIGN_W, DESIGN_H);
    layer.parent = this.node;
    this.skinLayer = layer;

    for (const slot of SKIN_SLOTS) {
      const node = makeNineSlice(layer, slot.key, slot.rect.w, slot.rect.h);
      node.name = slot.name;
      placeDesign(node, slot.rect.x, slot.rect.y, slot.rect.w, slot.rect.h);
      this.skinNodes.set(slot.name, node);
    }
    const unlockPlate = this.skinNodes.get('SkinUnlockPlate');
    if (unlockPlate) unlockPlate.active = this.devTools;

    // 選中行高亮：只有四角有裝飾（中心 alpha 0），疊在行底上不會糊掉行文字
    const sel = makeNineSlice(layer, 'plate_sel', LAYOUT.row.w, LAYOUT.row.h);
    sel.name = 'SkinRowSelected';
    sel.active = false;
    this.skinRowSel = sel;
  }

  /** 在底板層上墊一塊（分頁籤 / 武將格 / 分頁鈕用；`rect` 一律取自既有幾何函式）。 */
  private addPlate(key: string, rect: Rect, name: string): Node | null {
    const layer = this.skinLayer;
    if (!layer) return null;
    const node = makeNineSlice(layer, key, rect.w, rect.h);
    node.name = name;
    placeDesign(node, rect.x, rect.y, rect.w, rect.h);
    this.skinNodes.set(name, node);
    return node;
  }

  /** 把 `plate_sel` 擺到選中行；`rect` 為 null 時整個隱藏。 */
  private placeRowSelection(rect: Rect | null): void {
    const sel = this.skinRowSel;
    if (!sel) return;
    if (!rect) {
      sel.active = false;
      return;
    }
    const transform = sel.getComponent(UITransform);
    if (transform) transform.setContentSize(rect.w, rect.h);
    placeDesign(sel, rect.x, rect.y, rect.w, rect.h);
    sel.active = true;
  }

  /**
   * 文字層級分配。
   *
   * 第三個參數是「版式豁免字號」：物品頁的格子又密又多（武將格 107×54、加成表 20px 行距、
   * 12 行原作欄位），放不下 role 默認字號的位置只換描邊/投影策略、不動字號。
   * `statCol` 兩欄的座標與寬度一個沒改（v18 剛修過對齊），只調了字號與描邊。
   */
  private applyRoles(): void {
    applyTextRole(this.labelTitle, 'title', 32);
    applyTextRole(this.labelSub, 'tip', 14);

    // 武將卡
    applyTextRole(this.labelGenName, 'head', 22);
    applyTextRole(this.labelGenStat, 'num', 16);
    applyTextRole(this.labelGenCity, 'tip', 13);
    applyTextRole(this.labelGenBonus, 'badge', 12);
    applyTextRoles(this.slotKeys, 'badge', 13);
    applyTextRoles(this.slotVals, 'num', 15);
    applyTextRoles(this.pickLabels, 'badge', 11);

    // 頁籤 / 列表
    applyTextRoles(this.tabLabels, 'num', 14);
    applyTextRoles(this.headLabels, 'head', 13);
    applyTextRoles(this.rowNames, 'body', 15);
    applyTextRoles(this.rowDescs, 'badge', 11);
    applyTextRoles(this.rowMetas, 'badge', 10);
    applyTextRole(this.labelPrev, 'num', 13);
    applyTextRole(this.labelPage, 'badge', 12);
    applyTextRole(this.labelNext, 'num', 13);

    // 詳情
    applyTextRole(this.labelDetName, 'head', 20);
    applyTextRole(this.labelDetType, 'badge', 11);
    applyTextRole(this.labelDetFoot, 'tip', 11);
    applyTextRole(this.labelSectBonus, 'head', 13);
    applyTextRoles(this.statNames, 'body', 11);
    applyTextRoles(this.statVals, 'num', 13);
    applyTextRole(this.labelDesc, 'tip', 11);
    applyTextRole(this.labelPreview, 'tip', 11);
    applyTextRole(this.labelSectField, 'head', 12);
    applyTextRole(this.labelFieldKeys, 'badge', 10);
    applyTextRole(this.labelFieldVals, 'badge', 11);
    applyTextRole(this.labelDetNote, 'tip', 11);

    // 底欄 / 提示 / toast
    applyTextRole(this.labelActMain, 'head', 22);
    applyTextRole(this.labelActSub, 'badge', 12);
    applyTextRole(this.labelUnlockMain, 'num', 15);
    applyTextRole(this.labelUnlockSub, 'badge', 11);
    applyTextRole(this.labelBack, 'num', 16);
    applyTextRole(this.labelHint, 'tip', 11);
    applyTextRole(this.labelToast, 'head', 15);
  }

  /**
   * 開面板：灌資料、讀存檔、選武將與第一件物品。
   *
   * 武將池的真源是**存檔**（`opts.save` 的我方城人事 + `opts.roster`），劇本表只在
   * 存檔完全沒有人事紀錄時兜底。2026-11-26 用戶反饋「劉備開局物品頁看到張角」就是
   * 舊碼直接吃 `generals.json` 的靜態 `CITY`（= 劇本 0 的所屬城）造成的；詳見
   * `OfficersOfCity.ts` 的檔頭說明。
   */
  open(
    generals: readonly General[],
    items: readonly Item[],
    owned: readonly string[],
    opts: ItemsOpenOptions = {},
  ): void {
    if (!this.built) this.build();
    registerItems(items as readonly unknown[]);
    // F-05：物品表落地一份快照，供名冊 / 出征算装备加成（兩處都是同步模型、拿不到 bundle）
    writeEquipItemsCache(items);
    this.generals = generals.slice();
    this.ctx = opts;
    this.save = readItemsSave();
    this.bag = new Set<number>();
    for (const seq of this.save.bag) if (itemOf(seq)) this.bag.add(seq);

    const runtimePool = pickRuntimePool(this.generals, opts, owned);
    this.poolCities = runtimePool.cities;
    this.poolRows = runtimePool.rows;
    this.pool = runtimePool.pool.length > 0 ? runtimePool.pool : pickPool(this.generals, owned);
    // 默認選將：上次選的（還在池裡）→ 當前城太守 → 君主 → 池首。
    // 舊碼 `if (index < 0) index = 0` 等於默認選 STR+INT 最高的那位，劇本 0 平原就是張角。
    this.genIndex = O.pickDefaultIndex(
      this.pool.map((g) => g.NAME),
      [this.save.gen, opts.preferName, opts.king],
    );

    this.filter = 'all';
    this.page = 0;
    this.scrollPx = 0;
    this.pagedMode = true;
    this.velPx = 0;
    this.dragOn = false;
    this.dragMoved = false;
    this.toastText = '';
    const sorted = allItems().slice().sort(bySortAsc);
    this.selectedSeq = seqOf(sorted[0]);

    this.opened = true;
    this.node.active = true;
    if (!this.listening) {
      input.on(Input.EventType.TOUCH_START, guardTouch(this, 'onTouchStart', 'ItemsPanel'), this);
      input.on(Input.EventType.TOUCH_MOVE, guardTouch(this, 'onTouchMove', 'ItemsPanel'), this);
      input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'ItemsPanel'), this);
      this.listening = true;
    }
    this.refresh();
  }

  /** 關面板（面板節點保留，下次 `open()` 直接複用）。 */
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.node.active = false;
    if (this.listening) {
      input.off(Input.EventType.TOUCH_START, guardTouch(this, 'onTouchStart', 'ItemsPanel'), this);
      input.off(Input.EventType.TOUCH_MOVE, guardTouch(this, 'onTouchMove', 'ItemsPanel'), this);
      input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'ItemsPanel'), this);
      this.listening = false;
    }
    this.persist();
    const cb = this.onCloseCb;
    if (cb) cb();
  }

  /** 給 headless 驗證 / 報告用的狀態快照。 */
  debug(): PanelDebug {
    return {
      opened: this.opened,
      generals: this.pool.map((g) => g.NAME),
      genIndex: this.genIndex,
      general: this.genName(),
      generalCity: this.currentGeneralCity(),
      filter: this.filter,
      page: this.page,
      pages: this.pages.length,
      entries: this.pages.reduce((sum, page) => sum + page.length, 0),
      pageSizes: this.pages.map((page) => page.length),
      selected: this.selectedSeq,
      bag: this.bag.size,
      equipped: Object.keys(normalizeEquips(this.equipsOf(this.genName()))),
      tabs: buildTabs().map((tab) => tab.label),
      hits: this.hits.length,
      toast: this.toastText,
    };
  }

  /* ----------------------------------------------------------------------- */
  /* 節點輔助                                                                */
  /* ----------------------------------------------------------------------- */

  private makeGraphics(name: string): Graphics {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.node;
    node.setPosition(0, 0, 0);
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    return node.addComponent(Graphics);
  }

  private centerOf(rect: Rect): { x: number; y: number } {
    return { x: rect.x + rect.w / 2 - HALF_W, y: HALF_H - (rect.y + rect.h / 2) };
  }

  private makeLabel(
    name: string,
    text: string,
    rect: Rect,
    fontSize: number,
    color: string,
    align: 'left' | 'center' | 'right',
    overflow: number = Label.Overflow.NONE,
  ): Label {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.node;
    const transform = node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(Math.max(1, rect.w), Math.max(1, rect.h));
    const p = this.centerOf(rect);
    node.setPosition(p.x, p.y, 0);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.42);
    label.color = rgba(color);
    label.horizontalAlign =
      align === 'left'
        ? Label.HorizontalAlign.LEFT
        : align === 'right'
          ? Label.HorizontalAlign.RIGHT
          : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = overflow;
    // 可能會超寬的行（名稱/加成串/頁眉）一律 SHRINK：寧可縮字，也不要把後半句裁掉。
    if (overflow === Label.Overflow.NONE && align !== 'center') label.overflow = Label.Overflow.SHRINK;
    return label;
  }

  private fillRect(g: Graphics, rect: Rect, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.fill();
  }

  /** 漸層近似（w5-render）：把設計座標色帶交給本頁的 fillRect，座標轉換只做一次 */
  private paintBands(g: Graphics, bands: Band[]): void {
    for (let i = 0; i < bands.length; i += 1) {
      const band = bands[i];
      this.fillRect(g, band, band.color, band.alpha);
    }
  }

  private strokeRect(g: Graphics, rect: Rect, color: string, alpha = 255, width = 1): void {
    g.strokeColor = rgba(color, alpha);
    g.lineWidth = width;
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.stroke();
  }

  private hline(g: Graphics, y: number, x: number, w: number, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(x - HALF_W, HALF_H - y, w, 1);
    g.fill();
  }

  private addHit(rect: Rect, act: () => void): void {
    this.hits.push({ rect, act });
  }

  /* ---- 幾何 ---- */

  private slotRect(index: number): Rect {
    const { x, y, w, h, gap } = LAYOUT.slot;
    return { x: x + index * (w + gap), y, w, h };
  }

  private slotKeyRect(index: number): Rect {
    const base = this.slotRect(index);
    return { x: base.x + 4, y: base.y + 4, w: base.w - 8, h: 20 };
  }

  private slotValRect(index: number): Rect {
    const base = this.slotRect(index);
    return { x: base.x + 4, y: base.y + 28, w: base.w - 8, h: 20 };
  }

  private pickRect(index: number): Rect {
    const { x, y, w, h, gap, perRow, rowGap } = LAYOUT.pick;
    const col = index % perRow;
    const row = Math.floor(index / perRow);
    return { x: x + col * (w + gap), y: y + row * (h + rowGap), w, h };
  }

  private pickFaceRect(index: number): Rect {
    const base = this.pickRect(index);
    return { x: base.x + 4, y: base.y + 7, w: 30, h: 40 };
  }

  private pickNameRect(index: number): Rect {
    const base = this.pickRect(index);
    return { x: base.x + 36, y: base.y + 17, w: base.w - 40, h: 20 };
  }

  private tabRect(index: number): Rect {
    const { x, y, w, h, gap } = LAYOUT.tabs;
    return { x: x + index * (w + gap), y, w, h };
  }

  /** 把節點擺到設計矩形中心（Label / Sprite 節點都是 0.5 錨點）。 */
  private placeNode(node: Node | null, rect: Rect): void {
    if (!node) return;
    node.setPosition(rect.x + rect.w / 2 - HALF_W, HALF_H - (rect.y + rect.h / 2), 0);
  }

  /** 列表組頭的文字框（y 由分頁游標決定）。 */
  private headLine(y: number): Rect {
    const { x, w } = LAYOUT.listBody;
    return { x: x + 2, y: y + 2, w: w - 4, h: HEAD_H - 4 };
  }

  /**
   * 列表行的 4 塊：圖示 / 名稱 / 描述 / `Lv n · 加成`。y 由分頁游標決定。
   *
   * `merged` 是「描述與 meta 合併成一行」時 meta 落的位置（w7-cocos-render3）：
   * 多數裝備的 `Description` 只是把加成換句話說（「武力上昇1點。」對 `武力 +1`），
   * 兩行並排等於同一句話印兩遍。此時描述行留空、meta 上移 15px 補位，整行讀成兩行。
   */
  private rowParts(y: number): { row: Rect; icon: Rect; name: Rect; desc: Rect; meta: Rect; merged: Rect } {
    const { x, w, h } = LAYOUT.row;
    return {
      row: { x, y, w, h },
      icon: { x: x + 4, y: y + 6, w: 44, h: 44 },
      name: { x: x + 56, y: y + 2, w: w - 64, h: 21 },
      desc: { x: x + 56, y: y + 23, w: w - 64, h: 16 },
      meta: { x: x + 56, y: y + 38, w: w - 64, h: 16 },
      merged: { x: x + 56, y: y + 25, w: w - 64, h: 18 },
    };
  }

  private navRect(index: number): Rect {
    const { x, y, w, h } = LAYOUT.nav;
    const col = w / 3;
    return { x: x + index * col, y, w: col - 4, h };
  }

  /** 加成表標籤框：欄寬 126 內左對齊 78 寬（數值框從 x+80 起，兩者留 2px） */
  private statNameRect(index: number): Rect {
    const col = index < 5 ? 0 : 1;
    const row = index % 5;
    const base = LAYOUT.statCol[col];
    return { x: base.x, y: base.y + row * LAYOUT.statRowStep, w: 78, h: 18 };
  }

  /** 加成表數值框：右對齊到欄右邊界（`base.x + base.w`），與標籤同一基線 */
  private statValRect(index: number): Rect {
    const col = index < 5 ? 0 : 1;
    const row = index % 5;
    const base = LAYOUT.statCol[col];
    return { x: base.x + base.w - 46, y: base.y + row * LAYOUT.statRowStep, w: 46, h: 18 };
  }

  private actMainRect(): Rect {
    const { x, y, w } = LAYOUT.actBtn;
    return { x, y: y + 10, w, h: 32 };
  }

  private actSubRect(): Rect {
    const { x, y, w, h } = LAYOUT.actBtn;
    return { x, y: y + h - 34, w, h: 24 };
  }

  private unlockMainRect(): Rect {
    const { x, y, w, h } = LAYOUT.unlockBtn;
    return { x, y: y + 14, w, h: 28 };
  }

  private unlockSubRect(): Rect {
    const { x, y, w, h } = LAYOUT.unlockBtn;
    return { x, y: y + h - 30, w, h: 20 };
  }

  /* ----------------------------------------------------------------------- */
  /* 狀態存取                                                                */
  /* ----------------------------------------------------------------------- */

  private currentGeneral(): General | null {
    return this.pool[this.genIndex] ?? null;
  }

  private genName(): string {
    return this.currentGeneral()?.NAME ?? '';
  }

  /**
   * 選中將「現在所在城」：武將池的運行時所在城優先；池是舊劇本表兜底時，
   * 按劇本口徑的 `city_by_times[scenIdx]` 取（不再用靜態 `general.CITY`）。
   */
  private currentGeneralCity(): string {
    const general = this.currentGeneral();
    if (!general) return '';
    const fromPool = this.poolCities[general.NAME];
    if (typeof fromPool === 'string' && fromPool) return fromPool;
    return O.cityOfGeneral(general as unknown, this.ctx.scenIdx ?? 0);
  }

  private equipsOf(name: string): EquipTable {
    if (!name) return {};
    return this.save.equip[name] ?? {};
  }

  private setEquipsOf(name: string, table: EquipTable): void {
    if (!name) return;
    this.save.equip[name] = normalizeEquips(table);
  }

  private persist(): void {
    const name = this.genName();
    this.save.gen = name || null;
    // Array.from 而不是 [...this.bag]：Creator 的 Babel 會把 Set 展開降成 `[].concat(set)`，
    // 存檔裡就會變成一個塞了 Set 物件的一元陣列（JSON 再寫成 {}），背包直接丟失。
    this.save.bag = Array.from(this.bag).sort((a, b) => a - b);
    writeItemsSave(this.save);
  }

  private toast(text: string): void {
    this.toastText = text;
    const token = this.toastToken + 1;
    this.toastToken = token;
    setTimeout(() => {
      // 面板關掉或已經被新 toast 取代時不要清別人的字
      if (this.toastToken !== token) return;
      this.toastText = '';
      if (!this.built || !this.opened) return;
      if (this.labelToast) this.labelToast.node.active = false;
      this.refresh();
    }, TOAST_MS);
    this.refresh();
  }

  /* ----------------------------------------------------------------------- */
  /* 操作                                                                    */
  /* ----------------------------------------------------------------------- */

  private selectGeneral(index: number): void {
    if (index < 0 || index >= this.pool.length) return;
    this.genIndex = index;
    this.page = 0;
    this.persist();
    this.refresh();
  }

  private selectSeq(seq: number | null): void {
    if (seq !== null) {
      const item = itemOf(seq);
      if (!item) return;
      const group = groupOf(item);
      // 選到的東西不在當前頁籤 → 切回「全部」，否則右側詳情會跟列表說兩件事
      if (this.filter !== 'all' && group !== this.filter) this.filter = 'all';
      this.selectedSeq = seq;
      this.pages = paginate(this.entries(), LIST_BODY);
      const page = this.pageOf(seq);
      if (page >= 0) this.page = page;
      this.scrollPx = Math.min(this.pageTops[this.page] ?? 0, this.maxScroll);
      this.pagedMode = true;
    }
    this.refresh();
  }

  private setFilter(tab: TabKey): void {
    this.filter = tab;
    this.page = 0;
    this.scrollPx = 0;
    this.pagedMode = true;
    const entries = this.entries();
    const first = entries.find((entry) => entry.kind === 'row');
    this.selectedSeq = first && first.kind === 'row' ? seqOf(first.item) : null;
    this.refresh();
  }

  private setPage(page: number): void {
    if (page < 0 || page >= this.pages.length) return;
    this.page = page;
    // 翻頁 = 對齊到該頁起點（w7-cocos-render2）：只看這一頁，行數口徑與舊版一致
    this.scrollPx = Math.min(this.pageTops[page] ?? 0, this.maxScroll);
    this.pagedMode = true;
    this.refresh();
  }

  /** 裝備/卸下（web 的 `setEquip(on)`）。 */
  private setEquip(on: boolean): void {
    const name = this.genName();
    const seq = this.selectedSeq;
    if (!name) {
      this.toast('先選一位武將');
      return;
    }
    if (seq === null) {
      this.toast('先選一件物品');
      return;
    }
    const item = itemOf(seq);
    if (!item) return;
    const slot = slotOf(item);
    if (!slot) {
      this.toast('使用品不佔裝備槽');
      return;
    }
    const clean = normalizeEquips(this.equipsOf(name));
    const current = clean[slot];
    if ((current === seq) === on) return; // 已經在目標狀態，不寫存檔也不提示
    if (on && !this.bag.has(seq)) {
      this.toast('背包裡沒有這件');
      return;
    }
    const next = on ? equipItem(clean, seq) : unequipSlot(clean, slot);
    this.setEquipsOf(name, next);
    this.bag.add(seq);
    this.persist();
    this.refresh();
  }

  private toggleEquip(): void {
    const seq = this.selectedSeq;
    if (seq === null) {
      this.toast('先選一件物品');
      return;
    }
    const slot = equippedSlot(this.equipsOf(this.genName()), seq);
    this.setEquip(slot === null);
  }

  /** 全部解鎖：背包補滿全部 77 件（web 同款）。 */
  private unlockAll(): void {
    // toast 要說「這次補了幾件」，不是「總共幾件」—— 補完 bag.size 恒等於 77 就沒信息量了。
    const before = this.bag.size;
    this.bag = new Set<number>();
    for (const item of allItems()) {
      const seq = seqOf(item);
      if (seq !== null) this.bag.add(seq);
    }
    const added = this.bag.size - before;
    this.persist();
    this.toast(added > 0 ? `背包補滿 ${added} 件` : '背包裡已經全有了');
  }

  private hitSlot(slot: Slot): void {
    const seq = normalizeEquips(this.equipsOf(this.genName()))[slot];
    if (seq === undefined) {
      this.toast(`${SLOT_NAMES[slot]}槽是空的`);
      return;
    }
    this.selectSeq(seq);
  }

  /* ----------------------------------------------------------------------- */
  /* 列表                                                                    */
  /* ----------------------------------------------------------------------- */

  private entries(): ListEntry[] {
    const groups: GroupKey[] = this.filter === 'all' ? GROUP_ORDER.slice() : [this.filter];
    const out: ListEntry[] = [];
    for (const group of groups) {
      // R228b：列表只列「背包裡真的有的」（使用者口径）——整类目录不再混进来。
      const rows = allItems()
        .filter((item) => groupOf(item) === group)
        .filter((item) => {
          const seq = seqOf(item);
          return seq !== null && this.bag.has(seq);
        })
        .sort(bySortAsc);
      if (rows.length === 0) continue;
      out.push({
        kind: 'head',
        group,
        label: `${GROUP_LABELS[group]} ${rows.length} 件`,
        total: rows.length,
        owned: rows.length,
        height: HEAD_H,
      });
      for (const item of rows) out.push({ kind: 'row', item, height: ROW_H });
    }
    return out;
  }

  private pageOf(seq: number | null): number {
    if (seq === null) return -1;
    for (let index = 0; index < this.pages.length; index += 1) {
      for (const entry of this.pages[index]) {
        if (entry.kind === 'row' && seqOf(entry.item) === seq) return index;
      }
    }
    return -1;
  }

  /* ----------------------------------------------------------------------- */
  /* 渲染                                                                    */
  /* ----------------------------------------------------------------------- */

  private refresh(): void {
    if (!this.built) return;
    const items = allItems();
    this.pages = paginate(this.entries(), LIST_BODY);
    this.measureList();
    this.placed = this.placePage();

    this.hits = [];
    this.drawFrame();
    this.renderHeader(items);
    this.renderGeneral();
    this.renderTabs();
    this.renderList();
    this.renderDetail();
    this.renderFooter();
    this.renderToast();
  }

  /** 當前頁的落點：組頭 26 / 行 56 混排，所以每個 entry 的 y 都在這裡一次算好。 */
  private placePage(): { entry: ListEntry; y: number }[] {
    const out: { entry: ListEntry; y: number }[] = [];
    const top = LAYOUT.listBody.y;
    const bottom = top + LIST_BODY;
    // 對齊到某頁起點（翻頁鈕 / 剛開面板 / 選中某件後跳頁）時，只鋪這一頁：
    // 「第 x/8 頁」的行數與組頭數必須仍等於 pageSizes[p]（work\cocos_items 的探針口徑）。
    const atTop = this.pagedMode;
    let y = top - (atTop ? 0 : this.scrollPx);
    const pageEntries: ListEntry[] = atTop ? (this.pages[this.page] ?? []) : this.flatEntries();
    for (const entry of pageEntries) {
      // 只放「整條落在視窗內」的：半條被裁會在 nav 列（y 1104）上壓出重疊
      if (y >= top - 0.5 && y + entry.height <= bottom + 0.5) out.push({ entry, y });
      y += entry.height;
    }
    return out;
  }

  /** 整份列表（所有頁攤平）：拖動時的連續窗口用。 */
  private flatEntries(): ListEntry[] {
    const out: ListEntry[] = [];
    for (const page of this.pages) for (const entry of page) out.push(entry);
    return out;
  }

  /**
   * 量一次列表幾何（w7-cocos-render2）：
   * `pageTops[p]` = 第 p 頁第一條 entry 的設計 y 偏移，`maxScroll` = 整份列表比視窗多出來的高度。
   * `page` 仍由誰呼叫 refresh 決定，但會被 clamp 回合法範圍，`scrollPx` 也一併夾好。
   */
  private measureList(): void {
    const tops: number[] = [];
    let acc = 0;
    for (const page of this.pages) {
      tops.push(acc);
      for (const entry of page) acc += entry.height;
    }
    this.pageTops = tops;
    this.maxScroll = Math.max(0, acc - LIST_BODY);
    if (!Number.isFinite(this.scrollPx)) this.scrollPx = 0;
    // w9-render3：這裡原本把 scrollPx 硬夾在 [0, maxScroll]，於是「拖過頭再放手」永遠不會
    // 發生 —— 越界回彈（web 的橡皮筋）根本沒機會出現。現在留 ±OVERSCROLL 的空間，
    // 但硬夾上界：拖很遠之後再接一次 refresh（翻頁/換武將）不會停在天外。
    if (this.scrollPx < -OVERSCROLL) this.scrollPx = -OVERSCROLL;
    if (this.scrollPx > this.maxScroll + OVERSCROLL) this.scrollPx = this.maxScroll + OVERSCROLL;
    if (this.page >= this.pages.length) this.page = Math.max(0, this.pages.length - 1);
    if (this.page < 0) this.page = 0;
  }

  /** 某個滾動位置落在第幾頁（拖動時讓「第 x/8 頁」跟著走）。 */
  private pageAt(scroll: number): number {
    let page = 0;
    for (let i = 0; i < this.pageTops.length; i += 1) if (this.pageTops[i] <= scroll + 0.5) page = i;
    return Math.min(page, Math.max(0, this.pages.length - 1));
  }

  private renderHeader(items: readonly ItemLike[]): void {
    let equippable = 0;
    for (const item of items) if (isEquippable(item)) equippable += 1;
    const equipped = Object.keys(normalizeEquips(this.equipsOf(this.genName()))).length;
    if (this.labelSub) {
      this.labelSub.string = `共 ${items.length} 件 · 可裝備 ${equippable} · 背包 ${this.bag.size} 件 · 已裝備 ${equipped}/4`;
      this.labelSub.color = rgba(COLORS.textDim);
    }
  }

  private renderGeneral(): void {
    const general = this.currentGeneral();
    if (!general) {
      if (this.labelGenName) this.labelGenName.string = '— 無可用武將 —';
      return;
    }
    const base = runtimeGeneral(general);
    const applied = applyEquip(base, this.equipsOf(general.NAME));
    const stats: StatKey[] = ['STR', 'INT', 'MaxHP', 'Speed'];
    if (this.labelGenName) this.labelGenName.string = general.NAME;
    if (this.labelGenStat) {
      // 卡片上的四項用 web 頁的短名（生命 / 速度），詳情區才用 STAT_NAMES 的全名。
      this.labelGenStat.string = stats
        .map((key) => `${GEN_STAT_LABELS[key]} ${pairText(num(base[key]), num(applied[key]))}`)
        .join(' · ');
    }
    if (this.labelGenCity) {
      // 所在城與忠誠走運行時人事（存檔）口徑；劇本表只在沒有任何紀錄時兜底。
      const runtimeRow = this.poolRows.get(general.NAME);
      const city = this.currentGeneralCity() || '—';
      this.labelGenCity.string = `所在 ${city} · 忠誠 ${runtimeRow ? runtimeRow.loyal : num(general.Loyal)}`;
    }

    // 肖像只在換人時重載（full → thumb → hero → 隱藏）
    if (this.portrait) {
      if (this.portraitFor !== general.NAME) {
        this.portraitFor = general.NAME;
        loadPortrait(this.portrait, general.NAME, 'full', loadFrame, (result: PortraitResult) => {
          if (result.via === 'none' && this.portrait) this.portrait.setVisible(false);
        });
      }
      this.portrait.setVisible(this.portrait.state !== 'failed');
    }

    const clean = normalizeEquips(this.equipsOf(general.NAME));
    for (let i = 0; i < SLOTS.length; i += 1) {
      const slot = SLOTS[i];
      const seq = clean[slot];
      const item = seq === undefined ? null : itemOf(seq);
      const key = this.slotKeys[i];
      const val = this.slotVals[i];
      if (key) key.string = SLOT_NAMES[slot];
      if (val) {
        val.string = item ? String(item.Name ?? '—') : '空';
        val.color = rgba(item ? COLORS.goldLight : COLORS.textFaint);
      }
      this.addHit(this.slotRect(i), () => this.hitSlot(slot));
    }

    // 四槽合計（w7-cocos-render3）：填武將卡底部那條原本空著的帶。
    // web 的 `items.html` 也在四槽底下給一行合計，玩家不必自己把四個槽的數字加起來。
    if (this.labelGenBonus) {
      const totals: Record<string, number> = {};
      let count = 0;
      for (const slot of SLOTS) {
        const seq = clean[slot];
        const equippedItem = seq === undefined ? null : itemOf(seq);
        if (!equippedItem) continue;
        count += 1;
        const bonus = bonusOf(equippedItem);
        for (const key of STAT_KEYS) totals[key] = (totals[key] ?? 0) + (bonus[key] ?? 0);
      }
      const parts: string[] = [];
      for (const key of STAT_KEYS) {
        const value = totals[key] ?? 0;
        if (value !== 0) parts.push(`${STAT_NAMES[key]} ${value > 0 ? '+' : ''}${value}`);
      }
      this.labelGenBonus.string = count === 0
        ? '裝備總加成　—　四槽皆空　·　右側選一件，按「裝 備」' 
        : `裝備總加成　${parts.length > 0 ? parts.join('　') : '無'}　·　已裝備 ${count}/4`;
      this.labelGenBonus.color = rgba(count === 0 ? COLORS.textFaint : COLORS.textDim);
    }

    for (let i = 0; i < POOL_SIZE; i += 1) {
      const member = this.pool[i];
      const label = this.pickLabels[i];
      const sprite = this.pickSprites[i];
      if (!member) {
        if (label) label.string = '';
        if (sprite) sprite.setVisible(false);
        continue;
      }
      if (label) {
        label.string = member.NAME;
        label.color = rgba(i === this.genIndex ? COLORS.goldLight : COLORS.textDim);
      }
      if (sprite) {
        if (this.pickFor[i] !== member.NAME) {
          this.pickFor[i] = member.NAME;
          loadPortrait(sprite, member.NAME, 'thumb', loadFrame, (result: PortraitResult) => {
            if (result.via === 'none') sprite.setVisible(false);
          });
        }
        sprite.setVisible(sprite.state !== 'failed');
      }
      this.addHit(this.pickRect(i), () => this.selectGeneral(i));
    }
  }

  private renderTabs(): void {
    const tabs = buildTabs();
    for (let i = 0; i < tabs.length; i += 1) {
      const label = this.tabLabels[i];
      if (!label) continue;
      const active = tabs[i].key === this.filter;
      label.string = tabs[i].label;
      label.color = rgba(active ? '#1A1408' : COLORS.textDim);
      this.addHit(this.tabRect(i), () => this.setFilter(tabs[i].key));
    }
  }

  private renderList(): void {
    let headIndex = 0;
    let rowIndex = 0;
    for (const placed of this.placed) {
      const entry = placed.entry;
      if (entry.kind === 'head') {
        const label = this.headLabels[headIndex];
        if (label) {
          this.placeNode(label.node, this.headLine(placed.y));
          label.string = entry.label;
        }
        headIndex += 1;
        continue;
      }
      const index = rowIndex;
      rowIndex += 1;
      const item = entry.item;
      const seq = seqOf(item);
      const parts = this.rowParts(placed.y);
      const name = this.rowNames[index];
      const desc = this.rowDescs[index];
      const meta = this.rowMetas[index];
      const sprite = this.rowSprites[index];
      const selected = seq !== null && seq === this.selectedSeq;
      const equipped = seq !== null && equippedSlot(this.equipsOf(this.genName()), seq) !== null;
      const tags: string[] = [];
      if (equipped) tags.push('已裝備');
      if (slotOf(item) === null) tags.push('使用品');
      if (name) {
        this.placeNode(name.node, parts.name);
        name.string = tags.length > 0 ? `${String(item.Name ?? '—')}　[${tags.join('·')}]` : String(item.Name ?? '—');
        name.color = rgba(selected ? COLORS.goldLight : equipped ? COLORS.gold : COLORS.text);
      }
      const extra = rowExtraText(item);
      if (desc) {
        this.placeNode(desc.node, parts.desc);
        desc.string = extra;
        desc.node.active = extra.length > 0;
      }
      if (meta) {
        this.placeNode(meta.node, extra.length > 0 ? parts.meta : parts.merged);
        meta.node.active = true;
        meta.string = `Lv ${textOrDash(item.Level)} · ${rowBonusText(item)}`;
        meta.color = rgba(seq !== null && this.bag.has(seq) ? COLORS.textDim : COLORS.textFaint);
      }
      if (sprite) {
        const path = iconPath(item);
        const key = path ?? '';
        if (this.rowIconFor[index] !== key) {
          this.rowIconFor[index] = key;
          if (path) sprite.load(path);
          else sprite.apply(null);
        }
        sprite.setPosition(parts.icon.x, parts.icon.y);
        sprite.setVisible(Boolean(path) && sprite.state !== 'failed');
      }
      this.addHit(parts.row, () => this.selectSeq(seq));
    }
    for (let i = headIndex; i < HEAD_POOL; i += 1) {
      const label = this.headLabels[i];
      if (label) label.string = '';
    }
    for (let i = rowIndex; i < ROW_POOL; i += 1) {
      const name = this.rowNames[i];
      const desc = this.rowDescs[i];
      const meta = this.rowMetas[i];
      const sprite = this.rowSprites[i];
      if (name) name.string = '';
      if (desc) {
        desc.string = '';
        desc.node.active = true;
      }
      if (meta) meta.string = '';
      if (sprite) sprite.setVisible(false);
      this.rowIconFor[i] = '';
    }
    if (this.labelPage) {
      this.labelPage.string = this.pages.length > 0 ? `第 ${this.page + 1}/${this.pages.length} 頁` : '—';
    }
    if (this.labelPrev) {
      this.labelPrev.color = rgba(this.page > 0 ? COLORS.text : COLORS.textFaint);
      this.addHit(this.navRect(0), () => this.setPage(this.page - 1));
    }
    if (this.labelNext) {
      this.labelNext.color = rgba(this.page < this.pages.length - 1 ? COLORS.text : COLORS.textFaint);
      this.addHit(this.navRect(2), () => this.setPage(this.page + 1));
    }
  }

  private renderDetail(): void {
    const seq = this.selectedSeq;
    const item = seq === null ? null : itemOf(seq);
    if (!item) {
      // 無選中態（點到 0 件的分頁 = `setFilter` 把 selectedSeq 清成 null）：web 這裡仍把
      // 加成表 / 原作欄位的骨架留在原位，只是值全空。以前這裡把六個 Label 清成空字串，
      // 詳情卡下半就變成 400px 的純色空帶（w12-render 的空帶驗收口徑 ≤80px）。
      // 現在：原作欄位照樣鋪 12 行「欄名 + —」（唯讀表的空行是真實內容，不是畫上去的灰條）。
      if (this.labelDetName) this.labelDetName.string = '未選擇物品';
      if (this.labelDetType) this.labelDetType.string = '點左邊清單任一行';
      if (this.labelDetFoot) {
        this.labelDetFoot.string = this.devTools ? '選中後顯示加成與原作欄位' : '選中後顯示加成與說明';
      }
      if (this.labelDesc) {
        this.labelDesc.string = this.devTools
          ? '這張卡會列出：名稱 · 類型 · 十項加成 · 說明 ·\n裝上後差異 · 原作欄位（唯讀）。'
          : '這張卡會列出：名稱 · 類型 · 十項加成 · 說明 ·\n裝上後差異。';
      }
      if (this.labelPreview) this.labelPreview.string = '裝上後：—';
      if (this.labelFieldKeys) {
        this.labelFieldKeys.string = FIELD_ROWS.map((row) => row.key).join('\n');
        this.labelFieldKeys.lineHeight = 16;
      }
      if (this.labelFieldVals) {
        this.labelFieldVals.string = FIELD_ROWS.map(() => '—').join('\n');
        this.labelFieldVals.lineHeight = 16;
      }
      for (let i = 0; i < STAT_KEYS.length; i += 1) {
        const name = this.statNames[i];
        const val = this.statVals[i];
        if (name) name.string = STAT_NAMES[STAT_KEYS[i]];
        if (val) {
          val.string = '—';
          val.color = rgba(COLORS.textFaint);
        }
      }
      if (this.bigSprite) this.bigSprite.setVisible(false);
      this.bigFor = '';
      return;
    }

    const typeName = typeOf(item);
    const slot = slotOf(item);
    const inBag = seq !== null && this.bag.has(seq);
    const equipSlot = equippedSlot(this.equipsOf(this.genName()), seq);

    if (this.labelDetName) this.labelDetName.string = String(item.Name ?? '—');
    if (this.labelDetType) {
      const attrib = typeof item.Attrib === 'string' ? item.Attrib : '';
      const typeLabel = TYPE_NAMES[typeName] ?? (typeName || '—');
      this.labelDetType.string = `${typeLabel}　${ATTRIB_NAMES[attrib] ?? (attrib || '—')}　Lv ${textOrDash(item.Level)}`;
    }
    if (this.labelDetFoot) {
      const owner = inBag ? '在背包' : '未擁有';
      const state = equipSlot
        ? `裝備中 · ${SLOT_NAMES[equipSlot]}槽`
        : isEquippable(item)
          ? `可裝備 · ${SLOT_NAMES[slot as Slot]}槽`
          : '不可裝備';
      this.labelDetFoot.string = `${owner} · ${state}`;
      this.labelDetFoot.color = rgba(equipSlot ? COLORS.gold : isEquippable(item) ? COLORS.ok : COLORS.textFaint);
    }
    if (this.labelDesc) this.labelDesc.string = typeof item.Description === 'string' ? item.Description : '';
    if (this.labelPreview) {
      this.labelPreview.string = this.previewText(item);
      this.labelPreview.color = rgba(isEquippable(item) ? COLORS.ok : COLORS.textDim);
    }

    const b = bonusOf(item);
    for (let i = 0; i < STAT_KEYS.length; i += 1) {
      const key = STAT_KEYS[i];
      const name = this.statNames[i];
      const val = this.statVals[i];
      if (name) name.string = STAT_NAMES[key];
      if (val) {
        const value = b[key];
        val.string = value === 0 ? '—' : `${value > 0 ? '+' : ''}${value}`;
        val.color = rgba(value === 0 ? COLORS.textFaint : value > 0 ? COLORS.ok : COLORS.danger);
      }
    }

    const keys: string[] = [];
    const vals: string[] = [];
    for (const row of FIELD_ROWS) {
      keys.push(row.key);
      vals.push(row.get(item));
    }
    if (this.labelFieldKeys) {
      this.labelFieldKeys.string = keys.join('\n');
      this.labelFieldKeys.lineHeight = 16;
    }
    if (this.labelFieldVals) {
      this.labelFieldVals.string = vals.join('\n');
      this.labelFieldVals.lineHeight = 16;
    }

    if (this.bigSprite) {
      const path = iconPath(item);
      const key = path ?? '';
      if (this.bigFor !== key) {
        this.bigFor = key;
        if (path) this.bigSprite.load(path);
        else this.bigSprite.apply(null);
      }
      this.bigSprite.setVisible(Boolean(path) && this.bigSprite.state !== 'failed');
    }
  }

  /** 右側詳情的「裝上後」預覽（web 的 diff 邏輯）。 */
  private previewText(item: ItemLike): string {
    if (!isEquippable(item)) return '使用品：不佔裝備槽，也不加任何屬性';
    const name = this.genName();
    const seq = seqOf(item);
    const slot = slotOf(item);
    if (!slot || seq === null) return '';
    const clean = normalizeEquips(this.equipsOf(name));
    if (clean[slot] === seq) return `${String(item.Name ?? '—')} 已裝備於「${SLOT_NAMES[slot]}」槽`;
    if (!this.bag.has(seq)) return this.devTools
      ? '背包裡沒有這件（按「全部解鎖」可補滿）'
      : '背包裡沒有這件';
    const base = runtimeGeneral(this.currentGeneral());
    const before = applyEquip(base, clean);
    const after = applyEquip(base, equipItem(clean, seq));
    const diff: string[] = [];
    for (const key of STAT_KEYS) {
      const from = num(before[key]);
      const to = num(after[key]);
      if (from !== to) diff.push(`${STAT_NAMES[key]} ${from}→${to}`);
    }
    return diff.length > 0 ? `裝上後：${diff.join(' · ')}` : '裝上後：無屬性變化';
  }

  private renderFooter(): void {
    const item = this.selectedSeq === null ? null : itemOf(this.selectedSeq);
    const slot = slotOf(item);
    const equipped = equippedSlot(this.equipsOf(this.genName()), this.selectedSeq);
    if (this.labelActMain) {
      this.labelActMain.string = !item ? '—' : !slot ? '不可裝備' : equipped ? '卸 下' : '裝 備';
      this.labelActMain.color = rgba(!item || !slot ? COLORS.textFaint : COLORS.goldLight);
    }
    if (this.labelActSub) {
      this.labelActSub.string = !item
        ? '先選一件物品'
        : slot
          ? `${SLOT_NAMES[slot]} · ${String(item.Name ?? '—')}`
          : isTalisman(item)
            ? '兵符 · 使用品'
            : isFormBook(item)
              ? '陣法書 · 使用品'
              : '雜項 · 使用品';
    }
    if (this.labelUnlockMain) {
      this.labelUnlockMain.string = '全部解鎖';
      this.labelUnlockMain.color = rgba(COLORS.text);
    }
    if (this.labelUnlockSub) this.labelUnlockSub.string = `背包 ${this.bag.size} 件`;
    if (this.labelHint) {
      this.labelHint.string =
        '加成＝武將基礎＋四槽；兵符與陣法書是使用品，不佔槽、不加屬性。\n點武將切換；點左列選物品；點槽位看已裝備。';
    }
    this.addHit(LAYOUT.actBtn, () => this.toggleEquip());
    if (this.devTools) this.addHit(LAYOUT.unlockBtn, () => this.unlockAll());
    this.addHit(LAYOUT.backBtn, () => this.close());
  }

  private renderToast(): void {
    if (!this.labelToast) return;
    const active = this.toastText.length > 0;
    this.labelToast.string = this.toastText;
    this.labelToast.node.active = active;
  }

  /* ----------------------------------------------------------------------- */
  /* 畫框：一次畫完整個面板（Graphics 只有一層，永遠在所有 Label/圖之下）      */
  /* ----------------------------------------------------------------------- */

  private drawFrame(): void {
    const g = this.g;
    if (!g) return;
    g.clear();

    // 底：整屏縱向漸層（w5-render：web 的 body 是 linear-gradient(#0d1117→#1a1208)，
    // 原本單一純色 #0B0E13 一整頁，是色數/對比度落後的主因之一）
    this.paintBands(g, vBands(0, 0, DESIGN_W, DESIGN_H, '#171B21', '#1E160E', 20, 246, 246));
    this.paintBands(g, vBands(0, 0, DESIGN_W, LAYOUT.header.h, '#2A241C', '#14100B', 12, 236, 236));
    this.hline(g, LAYOUT.header.h - 1, 0, DESIGN_W, COLORS.line, 255);
    this.hline(g, LAYOUT.header.h + 1, 0, DESIGN_W, COLORS.gold, 46);
    // w7-cocos-render2：頁頭頂端高光條 + 四周內陰影（和大地圖 / 內政 / 編成三頁同一種語言）
    this.paintBands(g, vBands(0, 0, DESIGN_W, 6, '#5E4C2C', '#2A241C', 4, 132, 58));
    this.paintBands(g, edgeBands({ x: 0, y: 0, w: DESIGN_W, h: LAYOUT.header.h }, '#000000', 140, 18, 3));

    // 武將卡
    this.paintBands(
      g,
      vBands(LAYOUT.gen.x, LAYOUT.gen.y, LAYOUT.gen.w, LAYOUT.gen.h, '#26221C', '#181411', 16, 224, 224),
    );
    this.paintBands(g, edgeBands(LAYOUT.gen, '#000000', 90, 24, 3));
    this.paintBands(g, topSheen(LAYOUT.gen.x + 2, LAYOUT.gen.y + 2, LAYOUT.gen.w - 4, '#F2DCA8', 30));
    this.strokeRect(g, LAYOUT.gen, COLORS.line, 255, 1);
    this.strokeRect(g, LAYOUT.portrait, COLORS.goldDim, 220, 1);
    this.hline(g, LAYOUT.gen.y + LAYOUT.gen.h - 1, LAYOUT.gen.x, LAYOUT.gen.w, COLORS.line, 200);

    // 四槽
    const clean = normalizeEquips(this.equipsOf(this.genName()));
    // 摘要帶的分隔線（web `items.html` 的 `.genfoot{border-top:1px solid var(--line-soft)}`）
    this.hline(g, LAYOUT.genBonus.y - 3, LAYOUT.genBonus.x, LAYOUT.genBonus.w, COLORS.line, 170);

    for (let i = 0; i < SLOTS.length; i += 1) {
      const rect = this.slotRect(i);
      const on = clean[SLOTS[i]] !== undefined;
      this.paintBands(
        g,
        vBands(rect.x, rect.y, rect.w, rect.h, on ? '#3A2C1B' : '#26211A', on ? '#1B1409' : '#14110C', 8, on ? 238 : 176, on ? 238 : 176),
      );
      this.paintBands(g, topSheen(rect.x + 1, rect.y + 1, rect.w - 2, on ? '#F2DCA8' : '#8FA6C0', on ? 46 : 22));
      this.strokeRect(g, rect, on ? COLORS.gold : COLORS.line, 255, on ? 2 : 1);
    }

    // 12 個武將格
    for (let i = 0; i < POOL_SIZE; i += 1) {
      if (!this.pool[i]) continue;
      const rect = this.pickRect(i);
      const on = i === this.genIndex;
      this.paintBands(
        g,
        vBands(rect.x, rect.y, rect.w, rect.h, on ? '#3A2C1B' : '#26211A', on ? '#1B1409' : '#14110C', 8, on ? 242 : 158, on ? 242 : 158),
      );
      this.paintBands(g, topSheen(rect.x + 1, rect.y + 1, rect.w - 2, on ? '#F2DCA8' : '#8FA6C0', on ? 52 : 20));
      this.strokeRect(g, rect, on ? COLORS.gold : COLORS.line, 255, on ? 2 : 1);
    }

    // 頁籤
    const tabs = buildTabs();
    for (let i = 0; i < tabs.length; i += 1) {
      const rect = this.tabRect(i);
      const on = tabs[i].key === this.filter;
      this.paintBands(
        g,
        vBands(rect.x, rect.y, rect.w, rect.h, on ? '#EBC96F' : '#2A251E', on ? '#7E5F20' : '#14110C', 8, on ? 255 : 196, on ? 255 : 196),
      );
      if (on) this.paintBands(g, topSheen(rect.x + 1, rect.y + 1, rect.w - 2, '#FFF4D2', 90));
      this.strokeRect(g, rect, on ? COLORS.goldLight : COLORS.line, 255, 1);
    }

    // 列表框
    // w9-render3：底色由冷灰 '#1C2026'→'#14181D' 換成暖褐（本頁頁頭、四槽、詳情卡已是暖的，
    // 只有列表框與行底還冷著，整頁讀起來像兩套 UI）。再壓一層橫向暖光把色數交叉開。
    this.paintBands(
      g,
      lightGrid(LAYOUT.list, 8, 16, WARM.panelHi, 16, -14),
    );
    this.paintBands(g, wash(LAYOUT.list, '#D8B36A', 20, 0, 10, true));
    this.paintBands(g, innerEdge(LAYOUT.list, COLORS.gold, 30, 1));
    // 雙線描邊（w9-render3）：外 1px 暗 + 內縮 2px 淡金（web `.sec` 的 1px 亮邊 + 1px 暗邊）
    this.paintBands(g, doubleEdge(LAYOUT.list, '#000000', 160, COLORS.gold, 52, 1, 2));
    this.paintBands(g, topSheen(LAYOUT.list.x + 2, LAYOUT.list.y + 2, LAYOUT.list.w - 4, '#F2DCA8', 34));
    this.paintBands(g, topSheen(LAYOUT.list.x + 2, LAYOUT.list.y + LAYOUT.list.h - 2, LAYOUT.list.w - 4, '#000000', 86));

    // 組頭 + 行底（y 一律取 placePage() 算好的落點）
    let rowIndex = 0;
    let selRect: Rect | null = null;
    for (const placed of this.placed) {
      const entry = placed.entry;
      if (entry.kind === 'head') {
        const rect = this.headLine(placed.y);
        this.hline(g, rect.y + rect.h + 1, LAYOUT.listBody.x, LAYOUT.listBody.w, COLORS.line, 190);
        continue;
      }
      const index = rowIndex;
      rowIndex += 1;
      const rect = this.rowParts(placed.y).row;
      const seq = seqOf(entry.item);
      const selected = seq !== null && seq === this.selectedSeq;
      if (selected) selRect = rect;
      const equipped = seq !== null && equippedSlot(this.equipsOf(this.genName()), seq) !== null;
      // 行底：每行一條極淡的縱向漸層（w5-render）。純色行會讓 736px 的列表讀成
      // 一整塊；web 的列表行自帶 linear-gradient 底 + 交替行陰影。
      this.paintBands(
        g,
        vBands(
          rect.x,
          rect.y,
          rect.w,
          rect.h,
          selected ? '#3A3226' : index % 2 === 1 ? '#26211A' : '#211D17',
          selected ? '#171309' : '#131110',
          4,
          selected ? 248 : 190,
          selected ? 248 : 190,
        ),
      );
      if (selected) this.strokeRect(g, rect, COLORS.goldLight, 255, 1);
      else if (equipped) this.strokeRect(g, rect, COLORS.goldDim, 200, 1);
      if (index % 2 === 1) this.hline(g, rect.y + rect.h - 1, rect.x, rect.w, COLORS.line, 120);
      // w7-cocos-render2：行內再疊一層「左亮右暗」的橫向反光（web 列表行是 90deg 漸層），
      // 每行 +4 段色、選中行更亮 —— 這是物品頁色數往 web 靠又不動布局的主要手段。
      this.paintBands(
        g,
        hBands(
          rect.x,
          rect.y,
          rect.w,
          rect.h,
          selected ? '#4A4030' : '#2E2820',
          selected ? '#141008' : '#12100C',
          4,
          selected ? 62 : 34,
          selected ? 20 : 10,
        ),
      );
      this.paintBands(g, topSheen(rect.x + 1, rect.y + rect.h - 2, rect.w - 2, '#000000', selected ? 70 : 44));
    }
    // 選中行的 plate_sel 疊層（純外觀，位置取自上面那一輪算出來的 row 矩形）
    this.placeRowSelection(selRect);
    // 分隔線（列表 / 詳情）
    this.hline(g, LAYOUT.list.y + LAYOUT.list.h - 1, LAYOUT.list.x, LAYOUT.list.w, COLORS.line, 200);

    // 分頁按鈕
    for (let i = 0; i < 3; i += 1) {
      const rect = this.navRect(i);
      if (i === 1) continue;
      const enabled = i === 0 ? this.page > 0 : this.page < this.pages.length - 1;
      this.paintBands(
        g,
        vBands(rect.x, rect.y, rect.w, rect.h, '#2A251E', '#14110C', 6, enabled ? 236 : 110, enabled ? 236 : 110),
      );
      this.strokeRect(g, rect, COLORS.line, 255, 1);
    }

    // 詳情
    this.paintBands(
      g,
      lightGrid(LAYOUT.det, 6, 14, WARM.panelHi, 18, -12),
    );
    // 交叉疊光 + 雙線描邊（w9-render3）：詳情卡是右側最大的一塊平面，web 的 `.sec` 在
    // 縱向漸層之上還有 `::before` 的絹面反光與 1px 亮/暗雙線；這裡用 wash + doubleEdge 補。
    this.paintBands(g, wash(LAYOUT.det, '#D8B36A', 18, 0, 10, true));
    this.paintBands(g, doubleEdge(LAYOUT.det, '#000000', 160, COLORS.gold, 48, 1, 2));
    this.paintBands(g, innerEdge(LAYOUT.det, COLORS.gold, 34, 1));
    this.paintBands(g, topSheen(LAYOUT.det.x + 2, LAYOUT.det.y + 2, LAYOUT.det.w - 4, '#F2DCA8', 32));
    this.paintBands(g, topSheen(LAYOUT.det.x + 2, LAYOUT.det.y + LAYOUT.det.h - 2, LAYOUT.det.w - 4, '#000000', 84));
    this.paintBands(
      g,
      vBands(
        LAYOUT.bigFrame.x,
        LAYOUT.bigFrame.y,
        LAYOUT.bigFrame.w,
        LAYOUT.bigFrame.h,
        '#302417',
        '#14100A',
        12,
        238,
        238,
      ),
    );
    this.paintBands(g, edgeBands(LAYOUT.bigFrame, '#000000', 120, 18, 3));
    this.strokeRect(g, LAYOUT.bigFrame, COLORS.goldDim, 220, 2);
    this.paintBands(g, topSheen(LAYOUT.bigFrame.x + 2, LAYOUT.bigFrame.y + 2, LAYOUT.bigFrame.w - 4, '#F2DCA8', 40));
    this.hline(g, LAYOUT.sectBonus.y + LAYOUT.sectBonus.h, LAYOUT.det.x + 6, LAYOUT.det.w - 12, COLORS.line, 200);
    // R224：原作欄位除錯表的分隔線只在調試台（devTools）畫；正式包連同下方 Label 一起收起。
    if (this.devTools) {
      this.hline(g, LAYOUT.sectField.y + LAYOUT.sectField.h, LAYOUT.det.x + 6, LAYOUT.det.w - 12, COLORS.line, 200);
    }

    // 無選中態的「空帶」補丁（w12-render）：
    // 1) 大圖框：126×126 只剩漸層 + 一圈 2px 金線，縱向 126px 沒有任何結構；
    //    這裡補一層內縮雙線 + 斜十字（純 Graphics，不新增節點、不動 LAYOUT）。
    if (this.selectedSeq === null) {
      const bf = LAYOUT.bigFrame;
      this.paintBands(g, doubleEdge(bf, '#000000', 120, COLORS.goldDim, 52, 1, 9));
      g.strokeColor = rgba(COLORS.goldDim, 64);
      g.lineWidth = 1;
      g.moveTo(bf.x + 30 - HALF_W, HALF_H - (bf.y + 30));
      g.lineTo(bf.x + bf.w - 30 - HALF_W, HALF_H - (bf.y + bf.h - 30));
      g.stroke();
      g.moveTo(bf.x + bf.w - 30 - HALF_W, HALF_H - (bf.y + 30));
      g.lineTo(bf.x + 30 - HALF_W, HALF_H - (bf.y + bf.h - 30));
      g.stroke();
      this.strokeRect(g, { x: bf.x + 45, y: bf.y + 45, w: 36, h: 36 }, COLORS.goldDim, 80, 1);
    } else {
      // 有選中時大圖框由 bigSprite 撐住，只把內縮雙線留下當圖框的第二道邊
      this.paintBands(g, doubleEdge(LAYOUT.bigFrame, '#000000', 90, COLORS.goldDim, 40, 1, 9));
    }
    // 2) 原作欄位表底下的 1040→1142：一整條 100px 純色。補一條註記帶（帶底 + 雙線 + 分隔），
    //    文字由 labelDetNote 提供；兩者都只在 det 矩形內部畫。正式包（devTools=false）連註記帶一起收，
    //    避免頁面下半留一塊只有裝飾線、卻沒有字的空帶。
    if (this.devTools) {
      const noteRect = { x: LAYOUT.det.x + 6, y: 1042, w: LAYOUT.det.w - 12, h: 1142 - 2 - 1042 };
      this.paintBands(g, vBands(noteRect.x, noteRect.y, noteRect.w, noteRect.h, '#241E18', '#14110C', 8, 226, 226));
      this.paintBands(g, doubleEdge(noteRect, '#000000', 110, COLORS.goldDim, 46, 1, 2));
      this.paintBands(g, topSheen(noteRect.x + 2, noteRect.y + 2, noteRect.w - 4, '#F2DCA8', 22));
      this.hline(g, noteRect.y, noteRect.x, noteRect.w, COLORS.gold, 70);
      // 註記帶裡再加兩條分隔（文字在 1046..1086，線壓在文字下面），讓 98px 內不再出現
      // 超過 30px 的無墨縱帶
      this.hline(g, noteRect.y + 50, noteRect.x + 4, noteRect.w - 8, COLORS.line, 120);
      this.hline(g, noteRect.y + 51, noteRect.x + 4, noteRect.w - 8, COLORS.gold, 26);
      this.hline(g, noteRect.y + 72, noteRect.x + 4, noteRect.w - 8, COLORS.line, 90);
    }

    // 底欄
    const actItem = this.selectedSeq === null ? null : itemOf(this.selectedSeq);
    const actSlot = slotOf(actItem);
    const primary = Boolean(actItem) && Boolean(actSlot);
    // 底欄＝裝備（主鈕）+ 返回；中間的「全部解鎖」只在調試台（devTools）出現。
    // R224：正式包以前連底板都畫（Label/Skin 已藏 → 留下一個沒有字的空按鈕位），現在底板與命中一起收。
    this.paintBands(
      g,
      vBands(
        LAYOUT.actBtn.x,
        LAYOUT.actBtn.y,
        LAYOUT.actBtn.w,
        LAYOUT.actBtn.h,
        primary ? '#4A3A20' : '#2A251E',
        primary ? '#1D1509' : '#14110C',
        8,
        primary ? 255 : 190,
        primary ? 255 : 190,
      ),
    );
    if (primary) this.paintBands(g, topSheen(LAYOUT.actBtn.x + 2, LAYOUT.actBtn.y + 2, LAYOUT.actBtn.w - 4, '#FBEBBE', 74));
    this.strokeRect(g, LAYOUT.actBtn, primary ? COLORS.gold : COLORS.line, 255, 2);
    if (this.devTools) {
      this.paintBands(
        g,
        vBands(LAYOUT.unlockBtn.x, LAYOUT.unlockBtn.y, LAYOUT.unlockBtn.w, LAYOUT.unlockBtn.h, '#2A251E', '#14110C', 8, 232, 232),
      );
      this.paintBands(g, topSheen(LAYOUT.unlockBtn.x + 1, LAYOUT.unlockBtn.y + 1, LAYOUT.unlockBtn.w - 2, '#C9B99A', 26));
      this.strokeRect(g, LAYOUT.unlockBtn, COLORS.line, 255, 1);
    }
    this.paintBands(
      g,
      vBands(LAYOUT.backBtn.x, LAYOUT.backBtn.y, LAYOUT.backBtn.w, LAYOUT.backBtn.h, '#2A251E', '#14110C', 8, 232, 232),
    );
    this.paintBands(g, topSheen(LAYOUT.backBtn.x + 1, LAYOUT.backBtn.y + 1, LAYOUT.backBtn.w - 2, '#C9B99A', 26));
    this.strokeRect(g, LAYOUT.backBtn, COLORS.line, 255, 1);

    // toast 底板
    if (this.toastText.length > 0) {
      this.fillRect(g, LAYOUT.toast, '#0B0E13', 236);
      this.strokeRect(g, LAYOUT.toast, COLORS.gold, 220, 1);
    }

    // 滾動條（w7-cocos-render2）：整份列表比視窗高時才畫。軌 4px + thumb，
    // 位置 = scrollPx / maxScroll —— 這條 bar 就是「這裡可以拖」的視覺承諾。
    if (this.maxScroll > 0.5) {
      const body = LAYOUT.listBody;
      // 3 → 9：列表框右緣（x=448）外還有 12px 的 gutter，貼著面板畫會被金色內描邊
      // （445–446）壓掉、thumb 只剩 1px 可見；往右挪到 gutter 正中才看得出是一根滾動條。
      const trackX = body.x + body.w + 9;
      const trackY = body.y;
      const total = this.maxScroll + LIST_BODY;
      const thumbH = Math.max(36, Math.round((LIST_BODY * LIST_BODY) / total));
      const span = LIST_BODY - thumbH;
      const thumbY = trackY + Math.round((this.scrollPx / this.maxScroll) * span);
      this.fillRect(g, { x: trackX, y: trackY, w: 4, h: LIST_BODY }, '#0A0D12', 200);
      this.strokeRect(g, { x: trackX, y: trackY, w: 4, h: LIST_BODY }, COLORS.line, 120, 1);
      this.paintBands(
        g,
        vBands(trackX, thumbY, 4, thumbH, COLORS.goldLight, COLORS.goldDim, 4, 236, 214),
      );
      this.fillRect(g, { x: trackX, y: thumbY, w: 1, h: thumbH }, '#FBEBBE', 120);
    }
  }

  /* ----------------------------------------------------------------------- */
  /* 觸控                                                                    */
  /* ----------------------------------------------------------------------- */

  /** 觸控座標 → 設計座標（左上原點）。 */
  private toDesign(event: EventTouch): { x: number; y: number } | null {
    const transform = this.node.getComponent(UITransform);
    if (!transform) return null;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    return { x: local.x + HALF_W, y: HALF_H - local.y };
  }

  /**
   * 列表區按下（w7-cocos-render2）：只有按在列表視窗（LAYOUT.listBody）內才進入拖動模式，
   * 其他區域（武將格、頁籤、詳情、底欄）維持原本的點擊語義。
   */
  private onTouchStart(event: EventTouch): void {
    this.dragOn = false;
    this.dragMoved = false;
    if (!this.opened) return;
    const p = this.toDesign(event);
    if (!p) return;
    const body = LAYOUT.listBody;
    if (p.x < body.x || p.x > body.x + body.w) return;
    if (p.y < body.y || p.y > body.y + LIST_BODY) return;
    this.dragOn = true;
    this.dragStartY = p.y;
    this.dragStartScroll = this.scrollPx;
    // 新的一次按下會中斷上一輪滑行（web 上一碰螢幕慣性就停）
    this.velPx = 0;
    this.dragSampleT = Date.now();
    this.dragSamplePx = this.scrollPx;
  }

  /** 拖動：手指位移直映滾動量；累計超過 6px 就算「在拖」，放手時吞掉這一次點擊。 */
  private onTouchMove(event: EventTouch): void {
    if (!this.dragOn || !this.opened) return;
    const p = this.toDesign(event);
    if (!p) return;
    const dy = this.dragStartY - p.y;
    if (Math.abs(dy) > 6) this.dragMoved = true;
    // 越界橡皮筋（w9-render3）：0..maxScroll 之外只走 RUBBER 折的位移 —— 手指拉 1px、
    // 畫面動 0.42px，越拉越硬。這是 web `overflow:auto` 在手機上的手感，也是「松手回彈」
    // 能出現的前提（原本這裡硬夾在 [0,maxScroll]，永遠不會越界）。
    const raw = this.dragStartScroll + dy;
    let next = raw;
    if (raw < 0) next = raw * RUBBER;
    else if (raw > this.maxScroll) next = this.maxScroll + (raw - this.maxScroll) * RUBBER;
    next = Math.max(-OVERSCROLL, Math.min(this.maxScroll + OVERSCROLL, next));
    // 速度取樣（w9-render3）：換算成「設計 px / 幀（60fps）」。用兩點位移除上經過的幀數，
    // 再對上一次取樣做 EMA —— 單幀抖動不該變成一甩就飛。
    const now = Date.now();
    const frames = Math.max(1, (now - this.dragSampleT) / (1000 / 60));
    const v = (next - this.dragSamplePx) / frames;
    this.velPx = this.velPx * 0.35 + v * 0.65;
    this.dragSampleT = now;
    this.dragSamplePx = next;
    if (Math.abs(next - this.scrollPx) < 0.5) return;
    this.scrollPx = next;
    this.pagedMode = false;
    this.page = this.pageAt(next);
    this.refresh();
  }

  /**
   * 松手結算（w9-render3）：把拖動速度交給慣性，或者（已經越界時）交給回彈。
   *
   * web 的列表在松手後由合成器接著跑，速度就是最後幾幀的位移；Cocos 這邊沒有那層，
   * 所以自己算一份 `velPx`。三種情況要歸零：
   *   1. 松手前 90ms 內沒動過（按住不放再放開，不該甩出去）；
   *   2. 速度低於 INERTIA_MIN（3px/幀）；
   *   3. 已經越界（越界一律回彈，不繼續滑）。
   */
  private startInertia(): void {
    if (Date.now() - this.dragSampleT > 90) this.velPx = 0;
    if (Math.abs(this.velPx) < INERTIA_MIN) this.velPx = 0;
    if (this.scrollPx < 0 || this.scrollPx > this.maxScroll) this.velPx = 0;
  }

  /**
   * 慣性 + 回彈（w9-render3）—— 本頁唯一每幀跑的邏輯。
   *
   * - 越界：`lerp(scrollPx, 端點, 1 - 0.72^幀數)` 指數逼近，越近收得越慢，
   *   收到 0.5px 以內直接吸附，避免永遠差一點點而每幀都 refresh。
   * - 慣性：`v *= 0.92^幀數`（工單指定 0.92），`|v| < 3px/幀` 停；撞到兩端就歸零。
   * - `dragOn` 時完全不動：手指還在畫面上，位置由 onTouchMove 決定。
   */
  protected update(dt: number): void {
    if (!this.opened || this.dragOn) return;
    // dt 是秒。掉幀時最多補 3 幀的量，不然一次 update 會跳過一整屏。
    const frames = Math.min(3, Math.max(0.2, dt * 60));
    if (this.scrollPx < 0 || this.scrollPx > this.maxScroll) {
      const target = this.scrollPx < 0 ? 0 : this.maxScroll;
      const k = 1 - Math.pow(0.72, frames);
      const next = lerp(this.scrollPx, target, k);
      this.scrollPx = Math.abs(target - next) < 0.5 ? target : next;
      this.page = this.pageAt(this.scrollPx);
      this.refresh();
      return;
    }
    if (this.velPx === 0) return;
    this.velPx *= Math.pow(INERTIA_DECAY, frames);
    if (Math.abs(this.velPx) < INERTIA_MIN) {
      this.velPx = 0;
      return;
    }
    let next = this.scrollPx + this.velPx * frames;
    if (next <= 0) {
      next = 0;
      this.velPx = 0;
    } else if (next >= this.maxScroll) {
      next = this.maxScroll;
      this.velPx = 0;
    }
    this.scrollPx = next;
    this.pagedMode = false;
    this.page = this.pageAt(next);
    this.refresh();
  }

  /** 給截圖/探針用：直接滾到某個設計像素位置（0 = 列表頂端）。 */
  scrollTo(px: number): void {
    this.velPx = 0;
    this.scrollPx = Math.max(0, Math.min(this.maxScroll, px));
    // scrollTo 是「拖到這裡」，走拖動模式（不然頁頂那一格會被吸回翻頁模式）
    this.pagedMode = false;
    this.page = this.pageAt(this.scrollPx);
    this.refresh();
  }

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    // 剛才是拖動（不是點擊）→ 只收尾，不派發 hit（否則拖完會誤選一行）
    if (this.dragMoved) {
      this.dragOn = false;
      this.dragMoved = false;
      this.startInertia();
      return;
    }
    this.dragOn = false;
    this.velPx = 0;
    const transform = this.node.getComponent(UITransform);
    if (!transform) return;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    const x = local.x + HALF_W;
    const y = HALF_H - local.y;
    for (const hit of this.hits) {
      const rect = hit.rect;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        hit.act();
        return;
      }
    }
  }

  /** 供 headless 驗證呼叫：模擬一次點擊（設計座標）。 */
  tap(x: number, y: number): boolean {
    for (const hit of this.hits) {
      const rect = hit.rect;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        hit.act();
        return true;
      }
    }
    return false;
  }

  /** 面板自己的存檔 key（給文件/除錯用）。 */
  static get saveKey(): string {
    return ITEM_SAVE_KEY;
  }
}

/** 右側詳情的 12 行原作欄位（web 的 `原作欄位` 區塊）。 */
const FIELD_ROWS: { key: string; get: (item: ItemLike) => string }[] = [
  { key: '編號 Sequence', get: (item) => textOrDash(item.Sequence) },
  { key: '原作 TYPE', get: (item) => textOrDash(item.TYPE) },
  { key: '標記 Attrib', get: (item) => ATTRIB_NAMES[String(item.Attrib ?? '')] ?? textOrDash(item.Attrib) },
  { key: '使用等級 Level', get: (item) => textOrDash(item.Level) },
  { key: '排序 Sort', get: (item) => textOrDash(item.Sort) },
  { key: '兵器型 WeaponType', get: (item) => textOrDash(item.WeaponType) },
  { key: '外形 WeaponObject', get: (item) => textOrDash(item.WeaponObject) },
  { key: '搜索型 SearchType', get: (item) => textOrDash(item.SearchType) },
  { key: '出現率 Rate', get: (item) => textOrDash(item.Rate) },
  { key: 'Force 位', get: (item) => bitsText(item.Force) },
  { key: 'Battle 位', get: (item) => bitsText(item.Battle) },
  { key: '圖示 Sprite', get: (item) => iconStem(item) || '—' },
];
