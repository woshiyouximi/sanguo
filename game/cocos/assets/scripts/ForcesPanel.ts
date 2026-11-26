/**
 * 勢力圖（Cocos 3.8.8，750×1334 縱屏）—— 補 web `game/web/campaign.html` 的 `#forceSheet`
 * （`:325-341` 骨架、`:1677 renderForceSheet()`、`:1696 renderForceDetail()`）。
 *
 * 這一頁在 Cocos 側整塊缺失：大地圖只把城點按勢力上色（`CampaignRoot.cityTintOf()`），
 * 但沒有「誰還在、各幾城、幾將、跟我接不接壤、哪年滅的」這一覽。web 版是浮層 + 逐家明細，
 * 這裡合成一屏：**地圖 + 勢力列表**同時在，點列表某家 → 地圖上那家的城亮起來。
 *
 * 三條硬約束（任務書 §三）：
 *  1. 60 城按勢力著色，色板**只用 `MonarchModel.forceColorOf()`**（= `game/web/saves.js:113-186`
 *     的同一套 14 家固定色 + 14 備色），玩家城加 `FORCE_GOLD` 金環 —— 本檔不新建第二套色板；
 *  2. 節點數與勢力家數無關：行節點池 8 個 + 城名標籤池 12 個（見 `ROW_POOL` / `CITY_LABEL_POOL`），
 *     翻頁只改文字，**不增刪節點**；
 *  3. 無資源不白屏：底圖走 `ArtSprite`（`map/chinamap` 缺席 → 節點自己隱藏），
 *     路網/城點/行底色全部用 `Graphics` 現畫；九宮（`frame_panel`/`plate_btn`/`plate_sel`/`plate_sq`）
 *     全部走 `UiSkin`，它內部失敗會自己降級成 Graphics 描邊。
 *
 * 純邏輯（投影、鄰接、勢力列表）都在檔頭導出，`work/cocos_book/model_assert.mjs` 直接斷言，
 * 不需要 `cc`。面板只做節點 + 命中矩形。
 *
 * 座標口徑同 `CampaignRoot` / `SurrenderPanel` / `ItemsPanel`：設計 750×1334、左上原點，
 * 落到 Cocos UI 時 `x-375 / 667-y`。地圖投影**逐字複刻** `CampaignRoot.baseMapScale()`、
 * `baseMapRect()`（`CampaignRoot.ts:355` / `:367`）—— 不能直接 import 那個檔（它 import 了
 * 整個大地圖場景 + `GameState`，會把 Campaign 拖進本面板的編譯單元）。
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
  Sprite,
  UITransform,
  Vec3,
} from 'cc';
import { addOutline, ArtSprite } from './ArtLayer';
import { garrisonOf } from './core/garrison';
import type { GarrisonData } from './core/garrison';
import { FORCE_COLOR_NEUTRAL, forceColorOf, forceIdOf, forceRoster, monthTag, num, str } from './MonarchModel';
import type { ForceRow } from './MonarchModel';
import { makeNineSlice } from './UiSkin';
import { COLORS, FONT_FAMILY } from './view/theme';
import { guardTouch } from './InputGuard';

const { ccclass } = _decorator;

const HALF_W = 375;
const HALF_H = 667;
const DESIGN_W = 750;
const DESIGN_H = 1334;

/* =====================================================================
 * §1 版式（設計座標，左上原點）
 * =================================================================== */

export interface ForceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 一行 48 高、8 行一頁 —— 行節點池就這麼大。 */
export const ROW_H = 48;
export const ROW_POOL = 8;
/** 地圖上最多同時標 12 個城名（玩家城或所選勢力的城）。 */
export const CITY_LABEL_POOL = 12;
/** `map/chinamap` 的原圖尺寸（`scenarios.json` 的 `pos_xy` 就是這個座標系）。 */
export const MAP_W = 1280;
export const MAP_H = 960;
/** 底圖資源 key（bundle `res`，無擴展名）。缺席時地圖區只剩 Graphics 路網與城點。 */
export const MAP_IMAGE = 'map/chinamap';
export const FORCES_NODE_NAME = 'ForcesPanel';

/** 版式：頁頭 0–124、地圖 132–668、表頭 704、列表 736–1120、翻頁 1124–1164、返回 1172–1248（距底 86）。 */
export const FORCES_LAYOUT = {
  screen: { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H },
  title: { x: 150, y: 8, w: 450, h: 52 },
  sub: { x: 24, y: 64, w: 520, h: 34 },
  close: { x: 636, y: 30, w: 96, h: 52 },
  map: { x: 18, y: 132, w: 714, h: 536 },
  mapFoot: { x: 18, y: 672, w: 714, h: 28 },
  head: { x: 18, y: 704, w: 714, h: 28 },
  list: { x: 18, y: 736, w: 714, h: ROW_POOL * ROW_H },
  navPrev: { x: 18, y: 1124, w: 120, h: 40 },
  navPage: { x: 168, y: 1124, w: 414, h: 40 },
  navNext: { x: 612, y: 1124, w: 120, h: 40 },
  back: { x: 250, y: 1176, w: 250, h: 68 },
} as const satisfies Record<string, ForceRect>;

/**
 * 列表列位（絕對設計 x）。右邊界 726 < 列表右邊 732，留 6px。
 * 七列：色塊(九宮 tint) / 勢力 / 君主 / 城數 / 在職 / 接壤 / 滅亡月 / 狀態。
 */
export const ROW_COL = {
  chip: { x: 24, w: 22 },
  name: { x: 52, w: 148 },
  monarch: { x: 204, w: 128 },
  cities: { x: 336, w: 46 },
  officers: { x: 386, w: 46 },
  border: { x: 436, w: 76 },
  month: { x: 516, w: 148 },
  state: { x: 668, w: 58 },
} as const satisfies Record<string, { x: number; w: number }>;

export function rowRect(index: number): ForceRect {
  return { x: FORCES_LAYOUT.list.x, y: FORCES_LAYOUT.list.y + index * ROW_H, w: FORCES_LAYOUT.list.w, h: ROW_H };
}

export function colRect(col: keyof typeof ROW_COL, index: number, padLeft = 4): ForceRect {
  const c = ROW_COL[col];
  const y = FORCES_LAYOUT.list.y + index * ROW_H;
  return { x: c.x + padLeft, y, w: c.w - padLeft, h: ROW_H };
}

/* =====================================================================
 * §2 純邏輯：投影 / 鄰接 / 勢力行
 * =================================================================== */

export interface CityLike {
  NAME?: unknown;
  KING?: unknown;
  pos_xy?: unknown;
}

export interface PathLike {
  Start?: unknown;
  End?: unknown;
  points?: unknown;
}

export interface ScenarioLike {
  cities?: unknown;
  paths?: unknown;
  kings?: unknown;
}

/** 城名：`scenarios.json` 的 `cities[i].NAME`（也認小寫 `name`）。 */
export function cityNameOf(city: unknown): string {
  if (typeof city === 'string') return city;
  if (!city || typeof city !== 'object') return '';
  const box = city as Record<string, unknown>;
  return str(box.NAME) || str(box.name);
}

/** 城的原圖座標：`pos_xy` = `[x, y]`（1280×960）。缺 / 非數字 → `null`。 */
export function cityPointOf(city: unknown): { x: number; y: number } | null {
  const box = city && typeof city === 'object' ? (city as Record<string, unknown>) : null;
  const raw = box?.pos_xy;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const x = num(raw[0]);
  const y = num(raw[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * 底圖矩形：寬度鋪滿 `view.w`、按 1280×960 等比、在 `view` 內垂直居中。
 * 逐字複刻 `CampaignRoot.baseMapRect()`（`CampaignRoot.ts:367-375`）：
 * `k = view.w / 1280`、`h = 960 * k`、`y = view.y + (view.h - h) / 2`。
 */
export function mapRectOf(view: ForceRect): ForceRect {
  const k = view.w / MAP_W;
  const h = MAP_H * k;
  return { x: view.x, y: view.y + (view.h - h) / 2, w: view.w, h };
}

/** 原圖座標 → 設計座標（`mapRectOf()` 的逆投影）。 */
export function projectCity(view: ForceRect, px: number, py: number): { x: number; y: number } {
  const rect = mapRectOf(view);
  const k = rect.w / MAP_W;
  return { x: rect.x + px * k, y: rect.y + py * k };
}

/** 一條路徑的折線（原圖座標 → 設計座標）；`points` 少於 2 個點就丟掉。 */
export function pathPolylines(paths: readonly unknown[], view: ForceRect): Array<Array<{ x: number; y: number }>> {
  const out: Array<Array<{ x: number; y: number }>> = [];
  for (const raw of paths) {
    const box = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const pts = box?.points;
    if (!Array.isArray(pts)) continue;
    const line: Array<{ x: number; y: number }> = [];
    for (const p of pts) {
      if (!Array.isArray(p) || p.length < 2) continue;
      line.push(projectCity(view, num(p[0]), num(p[1])));
    }
    if (line.length >= 2) out.push(line);
  }
  return out;
}

/** 無向鄰接圖：城 → 相鄰城（去重、保序）。 */
export function adjacencyOf(paths: readonly unknown[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    if (!a || !b || a === b) return;
    const list = map.get(a) ?? [];
    if (!list.includes(b)) list.push(b);
    map.set(a, list);
  };
  for (const raw of paths) {
    const box = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    if (!box) continue;
    const a = str(box.Start);
    const b = str(box.End);
    if (!a || !b) continue;
    link(a, b);
    link(b, a);
  }
  return map;
}

/** 與 `others` 裡任一城有路相連的本勢力城（升冪按城名序，去重）。 */
export function neighborCities(
  adj: Map<string, string[]>,
  forceCities: readonly string[],
  others: readonly string[],
): string[] {
  const set = new Set(others);
  const hit: string[] = [];
  for (const city of forceCities) {
    const around = adj.get(city) ?? [];
    if (around.some((n) => set.has(n))) hit.push(city);
  }
  return hit;
}

/**
 * 歸屬 id 歸一：`""` / 純數字（`scenarios.json` 有 12 座空城把 `KING` 寫成 `'1'..'12'`
 * 當佔位）→ `""`。不歸一的話地圖上會冒出 12 個「勢力 1..12」的假行。
 */
export function normOwnerId(raw: unknown): string {
  const id = str(raw).trim();
  if (!id) return '';
  return /^\d+$/.test(id) ? '' : id;
}

/** 城的當前歸屬：先用呼叫方的 `ownerOf`，退回 `save.cities[name].owner`，再退回 `city.KING`。 */
export function makeOwnerOf(
  cities: readonly unknown[],
  save: unknown,
  given?: (cityName: string) => string,
): (cityName: string) => string {
  const byName = new Map<string, unknown>();
  for (const c of cities) byName.set(cityNameOf(c), c);
  const s = save && typeof save === 'object' ? (save as Record<string, unknown>) : {};
  const saved = s.cities && typeof s.cities === 'object' ? (s.cities as Record<string, unknown>) : {};
  return (cityName: string): string => {
    if (given) {
      const got = str(given(cityName));
      if (got) return normOwnerId(got);
    }
    const own = saved[cityName];
    if (own && typeof own === 'object') {
      const id = normOwnerId((own as Record<string, unknown>).owner);
      if (id) return id;
    }
    const city = byName.get(cityName);
    const box = city && typeof city === 'object' ? (city as Record<string, unknown>) : null;
    return normOwnerId(box?.KING);
  };
}

/** 地圖上的一個城點。 */
export interface ForceDot {
  name: string;
  x: number;
  y: number;
  /** 勢力色（`forceColorOf`；無主 = `FORCE_COLOR_NEUTRAL`） */
  color: string;
  /** 玩家城（金環） */
  ring: boolean;
  force: string;
  mine: boolean;
  /** 點半徑：玩家 5、有主 4、無主 3 */
  radius: number;
}

/** 60 個城點（缺 `pos_xy` 的城會被跳過 —— 現在 60/60 都有）。 */
export function forceDots(
  cities: readonly unknown[],
  ownerOf: (cityName: string) => string,
  player: string,
): ForceDot[] {
  const out: ForceDot[] = [];
  for (const city of cities) {
    const name = cityNameOf(city);
    const point = cityPointOf(city);
    if (!name || !point) continue;
    const force = normOwnerId(ownerOf(name));
    const mine = !!player && force === player;
    out.push({
      name,
      x: point.x,
      y: point.y,
      color: force ? forceColorOf(force) : FORCE_COLOR_NEUTRAL,
      ring: mine,
      force,
      mine,
      radius: mine ? 5 : force ? 4 : 3,
    });
  }
  return out;
}

/** 一家的列（`ROSTER` 的擴充：色 + 接壤 + 滅亡月文案 + 無主合成行）。 */
export interface ForceListRow {
  id: string;
  name: string;
  monarch: string;
  color: string;
  player: boolean;
  alive: boolean;
  declared: boolean;
  /** 合成行：`save` 裡不存在的「無主」 */
  neutral: boolean;
  cityCount: number;
  officerCount: number;
  surrenderCount: number;
  endedAt: number;
  /** 滅亡月文案：`第1年3月` / 未滅亡 `—` */
  monthText: string;
  /** 與玩家接壤（有路相連） */
  border: boolean;
  /** 接壤的城數 */
  borderCount: number;
  cities: string[];
}

export interface ForceListArgs {
  save: unknown;
  cities: readonly unknown[];
  ownerOf: (cityName: string) => string;
  officersByCity?: Record<string, unknown>;
  paths?: readonly unknown[];
  /** 玩家勢力 id，缺省 `forceIdOf(save)` */
  player?: string;
}

/**
 * 勢力列表。城數/在職/君主/滅亡月全部複用 `MonarchModel.forceRoster()`
 * （`MonarchModel.ts:717`，口徑：`alive = declared && cityCount > 0`、`officerCount` 只數「在職」）；
 * 本檔只加三樣：勢力色、接壤判定、以及把「無主」城合成最後一行 —— 這樣城數求和恆等於城總數。
 */
export function forceListRows(args: ForceListArgs): ForceListRow[] {
  const cities = args.cities;
  const ownerOf = args.ownerOf;
  const player = str(args.player) || forceIdOf(args.save);
  const roster: ForceRow[] = forceRoster(args.save, {
    cities,
    ownerOf,
    officersByCity: args.officersByCity,
  });
  const adj = adjacencyOf(args.paths ?? []);
  const playerCities: string[] = [];
  for (const city of cities) {
    const name = cityNameOf(city);
    if (name && ownerOf(name) === player && player) playerCities.push(name);
  }
  const rows: ForceListRow[] = [];
  let neutralCount = 0;
  for (const row of roster) {
    const near = playerCities.length && player && row.id !== player
      ? neighborCities(adj, row.cities, playerCities)
      : [];
    rows.push({
      id: row.id,
      name: row.name,
      monarch: row.monarch,
      color: forceColorOf(row.id),
      player: row.player,
      alive: row.alive,
      declared: row.declared,
      neutral: false,
      cityCount: row.cityCount,
      officerCount: row.officerCount,
      surrenderCount: row.surrenderCount,
      endedAt: row.endedAt,
      monthText: row.endedAt > 0 ? monthTag(row.endedAt) : '—',
      border: near.length > 0,
      borderCount: near.length,
      cities: row.cities.slice(),
    });
  }
  for (const city of cities) {
    const name = cityNameOf(city);
    if (name && !ownerOf(name)) neutralCount += 1;
  }
  if (neutralCount > 0) {
    rows.push({
      id: '',
      name: '無主',
      monarch: '',
      color: FORCE_COLOR_NEUTRAL,
      player: false,
      alive: false,
      declared: true,
      neutral: true,
      cityCount: neutralCount,
      officerCount: 0,
      surrenderCount: 0,
      endedAt: 0,
      monthText: '—',
      border: false,
      borderCount: 0,
      cities: [],
    });
  }
  return rows;
}

/** 列表總城數（含無主）—— 應當恆等於城總數。 */
export function sumCityCount(rows: readonly ForceListRow[]): number {
  let n = 0;
  for (const row of rows) n += row.cityCount;
  return n;
}

/** 一家的狀態標籤：`我方` / `存續` / `已滅亡` / `無主`。 */
export function stateTextOf(row: ForceListRow): string {
  if (row.neutral) return '無主';
  if (row.player) return '我方';
  return row.alive ? '存續' : '已滅亡';
}

/** 列表副標：`N 家 · 存續 x · 滅亡 y · 城 60（有主 21 / 無主 39）`。 */
export function rosterSubText(rows: readonly ForceListRow[], cityTotal: number): string {
  let alive = 0;
  let dead = 0;
  let owned = 0;
  for (const row of rows) {
    if (row.neutral) continue;
    if (row.alive) alive += 1;
    else dead += 1;
    owned += row.cityCount;
  }
  return `${rows.length} 家 · 存續 ${alive} · 滅亡 ${dead} · 城 ${cityTotal}（有主 ${owned} / 無主 ${cityTotal - owned}）`;
}

/** 地圖上要標名字的城：所選勢力的城 → 玩家城 → 前 N 座有主的城。 */
export function labelCityNames(
  cities: readonly unknown[],
  ownerOf: (cityName: string) => string,
  player: string,
  selected: string,
  limit = CITY_LABEL_POOL,
): string[] {
  const all: string[] = [];
  for (const city of cities) {
    const name = cityNameOf(city);
    if (name && cityPointOf(city)) all.push(name);
  }
  const out: string[] = [];
  const push = (name: string): void => {
    if (out.length < limit && !out.includes(name)) out.push(name);
  };
  if (selected) for (const name of all) if (ownerOf(name) === selected) push(name);
  if (player) for (const name of all) if (ownerOf(name) === player) push(name);
  for (const name of all) if (ownerOf(name)) push(name);
  return out;
}

/* =====================================================================
 * §3 節點 / 面板
 * =================================================================== */

/** 給 headless（`work/cocos_book/panel_headless.mjs`）與報告用的狀態快照。 */
export interface ForcesDebug {
  opened: boolean;
  /** 勢力行總數（含無主） */
  rows: number;
  pages: number;
  page: number;
  /** 當前頁真的畫出來的勢力名 */
  visible: string[];
  selected: string | null;
  /** 城總數 / 有主 / 玩家 / 無主 */
  cities: number;
  owned: number;
  playerCities: number;
  neutralCities: number;
  dots: number;
  paths: number;
  cityLabels: string[];
  hits: number;
  title: string;
  sub: string;
  foot: string;
  /** 接壤的家數 */
  bordered: number;
  /** 列表城數求和（= `cities`） */
  sumCities: number;
}

export interface ForcesPanelOptions {
  /** `CampaignRoot.save`（型別上只要求是物件） */
  save: object;
  /** 有 `garrison` 就能自己算守將；沒有就用 `officersByCity` */
  data?: GarrisonData | object | null;
  /** 全部城（`scenarios.json` 的 `cities`）；缺省從 `data.scenarios[scenIdx]` 取 */
  cities?: readonly unknown[];
  /** 當前歸屬（城名 → 勢力 id）；缺省 `save.cities[n].owner` → `city.KING` */
  ownerOf?: (cityName: string) => string;
  /** 各城武將（存檔運行時人事，`CampaignRoot.officersByCity()`）；缺省按劇本表取 */
  officersByCity?: Record<string, unknown>;
  /** 路網（`scenarios.json` 的 `paths`）；缺省從 `data.scenarios[scenIdx]` 取 */
  paths?: readonly unknown[];
  /**
   * 劇本號（`CampaignRoot.scenIdx`）：補 `cities/paths` 與 `officersByCity` 的劇本表兜底都用它。
   * 缺省 0 只是舊行為（《討伐董卓》要傳 1，否則 60 城按 184 年的劇本表算）。
   */
  scenIdx?: number;
  /** 玩家勢力 id；缺省 `forceIdOf(save)` */
  player?: string;
  onClose?: (() => void) | null;
}

interface Hit {
  rect: ForceRect;
  label: string;
  act: () => void;
}

function rgba(hexColor: string, alpha = 255): Color {
  const n = Number.parseInt(hexColor.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

function scenarioOf(data: unknown, scenIdx = 0): ScenarioLike | null {
  if (!data || typeof data !== 'object') return null;
  const scenarios = (data as Record<string, unknown>).scenarios;
  if (!Array.isArray(scenarios) || !scenarios.length) return null;
  const pick = scenarios[scenIdx] ?? scenarios[0];
  return pick && typeof pick === 'object' ? (pick as ScenarioLike) : null;
}

/** 從 `garrison.json` 取 `{城: [武將]}`（`garrisonOf()` 缺資料時回 `{}`）；`scenIdx` 是本局劇本號。 */
export function officersByCityOf(data: unknown, cities: readonly unknown[], scenIdx = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const city of cities) {
    const name = cityNameOf(city);
    if (!name) continue;
    const garrison = garrisonOf(data as GarrisonData, scenIdx, name);
    out[name] = garrison ? garrison.officers : [];
  }
  return out;
}

@ccclass('ForcesPanel')
export class ForcesPanel extends Component {
  /* ---- 生命週期 ---- */

  private built = false;
  private opened = false;
  private listening = false;
  private onCloseCb: (() => void) | null = null;

  /* ---- 資料 ---- */

  private save: object = {};
  private cities: readonly unknown[] = [];
  private paths: readonly unknown[] = [];
  private ownerOf: (cityName: string) => string = () => '';
  private rows: ForceListRow[] = [];
  private dots: ForceDot[] = [];
  private player = '';
  private page = 0;
  private selected = '';
  private hits: Hit[] = [];

  /* ---- 節點 ---- */

  private g: Graphics | null = null;
  private mapArt: ArtSprite | null = null;
  private labelTitle: Label | null = null;
  private labelSub: Label | null = null;
  private labelFoot: Label | null = null;
  private labelPage: Label | null = null;
  private labelPrev: Label | null = null;
  private labelNext: Label | null = null;
  private labelBack: Label | null = null;
  private headLabels: Label[] = [];
  private rowChips: Node[] = [];
  private rowName: Label[] = [];
  private rowMonarch: Label[] = [];
  private rowCities: Label[] = [];
  private rowOfficers: Label[] = [];
  private rowBorder: Label[] = [];
  private rowMonth: Label[] = [];
  private rowState: Label[] = [];
  private cityLabels: Label[] = [];
  private selPlate: Node | null = null;

  /* --------------------------------------------------------------------- */
  /* 對外 API                                                              */
  /* --------------------------------------------------------------------- */

  static show(parent: Node, options: ForcesPanelOptions): ForcesPanel {
    const node = parent.getChildByName(FORCES_NODE_NAME) ?? new Node(FORCES_NODE_NAME);
    if (!node.parent) {
      node.layer = Layers.Enum.UI_2D;
      node.parent = parent;
    }
    let panel = node.getComponent(ForcesPanel);
    if (!panel) panel = node.addComponent(ForcesPanel);
    panel.onCloseCb = options.onClose ?? null;
    panel.build();
    panel.open(options);
    const top = node.parent ? node.parent.children.length - 1 : 0;
    if (top >= 0) node.setSiblingIndex(top);
    return panel;
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** 建節點樹（冪等）。節點總數固定，與勢力家數 / 城數無關。 */
  build(): void {
    if (this.built) return;
    this.built = true;

    const root = this.node;
    root.layer = Layers.Enum.UI_2D;
    const transform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(DESIGN_W, DESIGN_H);

    // 蒙版（整屏壓暗，跟 SurrenderPanel 同口徑）
    const veil = new Node('ForcesVeil');
    veil.layer = Layers.Enum.UI_2D;
    veil.parent = root;
    const veilBox = veil.addComponent(UITransform);
    veilBox.setAnchorPoint(0.5, 0.5);
    veilBox.setContentSize(DESIGN_W, DESIGN_H);
    const veilG = veil.addComponent(Graphics);
    veilG.fillColor = new Color(6, 8, 12, 226);
    veilG.rect(-HALF_W, -HALF_H, DESIGN_W, DESIGN_H);
    veilG.fill();

    // 地圖底板（底圖缺席時這塊就是「地圖」，不留白）—— 必須壓在底圖下面
    const bgG = this.makeGraphics('ForcesPlate');
    this.fillRect(bgG, FORCES_LAYOUT.map, '#0B0F14', 255);
    this.fillRect(bgG, FORCES_LAYOUT.list, '#0E1116', 200);

    // 底圖：chinamap（1280×960，與 pos_xy 同座標系）。缺資源 → ArtSprite 自己藏節點，不白屏。
    this.mapArt = new ArtSprite(root, 'ForcesMapArt', mapRectOf(FORCES_LAYOUT.map), 'stretch');
    this.mapArt.setVisible(true);
    this.mapArt.load(MAP_IMAGE);

    // 路網 / 城點 / 行底色都畫在這一個 Graphics 上（在底圖之上、文字之下）
    this.g = this.makeGraphics('ForcesG');

    // 選中行的高亮板：九宮 `plate_sel`。插在 g 之後、行節點之前 —— 壓住行底色、被文字壓住。
    this.selPlate = makeNineSlice(root, 'plate_sel', FORCES_LAYOUT.list.w, ROW_H);
    this.selPlate.name = 'ForcesSelPlate';
    this.selPlate.active = false;

    // 九宮：地圖外框（畫在路網/城點之上，只是一個邊）
    makePanelFrame(root, FORCES_LAYOUT.map).name = 'ForcesMapFrame';

    this.labelTitle = this.makeLabel('ForcesTitle', '勢 力 圖', FORCES_LAYOUT.title, 40, COLORS.goldLight, 'center');
    addOutline(this.labelTitle, new Color(6, 8, 12, 220), 1);
    this.labelSub = this.makeLabel('ForcesSub', '', FORCES_LAYOUT.sub, 22, COLORS.textDim, 'left', Label.Overflow.SHRINK);
    this.labelFoot = this.makeLabel('ForcesFoot', '', FORCES_LAYOUT.mapFoot, 22, COLORS.textFaint, 'center');

    makeSkinBtn(root, 'ForcesCloseBtn', '關 閉', FORCES_LAYOUT.close);
    addTextPlate(root, 'ForcesBackPlate', FORCES_LAYOUT.back);
    this.labelBack = this.makeLabel('ForcesBack', '返 回 大 地 圖', FORCES_LAYOUT.back, 30, COLORS.goldLight, 'center');
    addOutline(this.labelBack, new Color(6, 8, 12, 220), 1);

    // 表頭七列
    const heads: Array<[string, keyof typeof ROW_COL, 'left' | 'center' | 'right']> = [
      ['勢 力', 'name', 'left'],
      ['君 主', 'monarch', 'left'],
      ['城', 'cities', 'center'],
      ['在職', 'officers', 'center'],
      ['接壤', 'border', 'center'],
      ['滅亡', 'month', 'left'],
      ['狀態', 'state', 'center'],
    ];
    for (let i = 0; i < heads.length; i += 1) {
      const [text, col, align] = heads[i];
      const rect: ForceRect = {
        x: ROW_COL[col].x + 4,
        y: FORCES_LAYOUT.head.y,
        w: ROW_COL[col].w - 4,
        h: FORCES_LAYOUT.head.h,
      };
      this.headLabels.push(this.makeLabel(`ForcesHead${i}`, text, rect, 22, COLORS.textFaint, align));
    }

    // 行節點池：色塊（九宮 tint）+ 七個 Label
    for (let i = 0; i < ROW_POOL; i += 1) {
      const chipW = ROW_COL.chip.w;
      const chipRect = { x: ROW_COL.chip.x, y: rowRect(i).y + (ROW_H - chipW) / 2, w: chipW, h: chipW };
      const chip = makeNineSlice(root, 'plate_sq', chipW, chipW);
      chip.name = `ForcesChip${i}`;
      placeAt(chip, chipRect, chipW, chipW);
      this.rowChips.push(chip);
      this.rowName.push(this.makeLabel(`ForcesName${i}`, '', colRect('name', i), 22, COLORS.text, 'left'));
      this.rowMonarch.push(this.makeLabel(`ForcesMonarch${i}`, '', colRect('monarch', i), 22, COLORS.textDim, 'left'));
      this.rowCities.push(this.makeLabel(`ForcesCities${i}`, '', colRect('cities', i), 20, COLORS.text, 'center'));
      this.rowOfficers.push(this.makeLabel(`ForcesOfficers${i}`, '', colRect('officers', i), 20, COLORS.textDim, 'center'));
      this.rowBorder.push(this.makeLabel(`ForcesBorder${i}`, '', colRect('border', i), 18, COLORS.textDim, 'center'));
      this.rowMonth.push(this.makeLabel(`ForcesMonth${i}`, '', colRect('month', i), 18, COLORS.textFaint, 'left'));
      this.rowState.push(this.makeLabel(`ForcesState${i}`, '', colRect('state', i), 18, COLORS.textDim, 'center'));
    }

    // 選中行的高亮板（九宮 plate_sel，只一塊，跟著選中行跑）
    this.labelPrev = this.makeLabel('ForcesPrev', '◀ 上頁', FORCES_LAYOUT.navPrev, 22, COLORS.textDim, 'center');
    this.labelPage = this.makeLabel('ForcesPage', '', FORCES_LAYOUT.navPage, 20, COLORS.textDim, 'center');
    this.labelNext = this.makeLabel('ForcesNext', '下頁 ▶', FORCES_LAYOUT.navNext, 22, COLORS.textDim, 'center');

    // 地圖城名池
    for (let i = 0; i < CITY_LABEL_POOL; i += 1) {
      this.cityLabels.push(this.makeLabel(`ForcesCity${i}`, '', { x: 0, y: 0, w: 100, h: 18 }, 14, COLORS.text, 'center'));
    }

    this.node.active = false;
  }

  /** 填資料並刷新（`show()` 呼叫；測試可先 `build()` 再 `open()`）。 */
  open(options: ForcesPanelOptions): void {
    if (!this.built) this.build();
    const save = options.save ?? {};
    const data = options.data ?? null;
    const scenario = scenarioOf(data, options.scenIdx ?? 0);
    const cities = options.cities ?? pickList(scenario?.cities);
    const paths = options.paths ?? pickList(scenario?.paths);
    const ownerOf = makeOwnerOf(cities, save, options.ownerOf);
    this.save = save;
    this.cities = cities;
    this.paths = paths;
    this.ownerOf = ownerOf;
    this.player = str(options.player) || forceIdOf(save);
    const officersByCity = options.officersByCity ?? officersByCityOf(data, cities, options.scenIdx ?? 0);
    this.rows = forceListRows({
      save,
      cities,
      ownerOf,
      officersByCity,
      paths,
      player: this.player,
    });
    this.dots = forceDots(cities, ownerOf, this.player);
    this.page = 0;
    this.selected = '';
    this.opened = true;
    this.node.active = true;
    if (!this.listening) {
      input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'ForcesPanel'), this);
      this.listening = true;
    }
    this.refresh();
  }

  /** 關（節點保留，下次 `show()` 複用；`destroy()` 由呼叫方決定）。 */
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.node.active = false;
    if (this.listening) {
      input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'ForcesPanel'), this);
      this.listening = false;
    }
    const cb = this.onCloseCb;
    if (cb) cb();
  }

  /** 破壞節點（任務書 §三：用完 `destroy()`）。`show()` 可重建，所以直接移除整棵樹。 */
  destroyPanel(): void {
    this.close();
    if (this.node.isValid) this.node.destroy();
    this.built = false;
    this.rows = [];
    this.dots = [];
    this.rowChips = [];
    this.rowName = [];
    this.rowMonarch = [];
    this.rowCities = [];
    this.rowOfficers = [];
    this.rowBorder = [];
    this.rowMonth = [];
    this.rowState = [];
    this.cityLabels = [];
    this.selPlate = null;
  }

  /** 給 headless / 報告的狀態。 */
  debug(): ForcesDebug {
    let owned = 0;
    let playerCities = 0;
    let neutralCities = 0;
    for (const dot of this.dots) {
      if (dot.force) owned += 1;
      else neutralCities += 1;
      if (dot.mine) playerCities += 1;
    }
    let bordered = 0;
    for (const row of this.rows) if (row.border) bordered += 1;
    return {
      opened: this.opened,
      rows: this.rows.length,
      pages: this.pageCount(),
      page: this.page,
      visible: this.pageRows().map((r) => r.name),
      selected: this.selected || null,
      cities: this.cities.length,
      owned,
      playerCities,
      neutralCities,
      dots: this.dots.length,
      paths: this.paths.length,
      cityLabels: this.cityLabelNames(),
      hits: this.hits.length,
      title: this.labelTitle ? this.labelTitle.string : '',
      sub: this.labelSub ? this.labelSub.string : '',
      foot: this.labelFoot ? this.labelFoot.string : '',
      bordered,
      sumCities: sumCityCount(this.rows),
    };
  }

  /** 模擬一次點擊（設計座標，左上原點）。headless 用它走完翻頁 / 選勢力 / 關閉。 */
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

  get hitList(): ReadonlyArray<{ rect: ForceRect; label: string }> {
    return this.hits.map((hit) => ({ rect: hit.rect, label: hit.label }));
  }

  /** 選中一家（`''` = 取消）。地圖高亮 + 表頭副標跟著變。 */
  select(forceId: string): void {
    const id = str(forceId);
    this.selected = this.selected === id ? '' : id;
    this.refresh();
  }

  /* --------------------------------------------------------------------- */
  /* 繪製                                                                  */
  /* --------------------------------------------------------------------- */

  private pageCount(): number {
    return Math.max(1, Math.ceil(this.rows.length / ROW_POOL));
  }

  private pageRows(): ForceListRow[] {
    const start = this.page * ROW_POOL;
    const out: ForceListRow[] = [];
    for (let i = start; i < start + ROW_POOL && i < this.rows.length; i += 1) out.push(this.rows[i]);
    return out;
  }

  private cityLabelNames(): string[] {
    return labelCityNames(this.cities, this.ownerOf, this.player, this.selected);
  }

  private refresh(): void {
    const pages = this.pageCount();
    if (this.page >= pages) this.page = pages - 1;
    if (this.page < 0) this.page = 0;
    this.hits = [];

    if (this.labelTitle) this.labelTitle.string = '勢 力 圖';
    if (this.labelSub) this.labelSub.string = rosterSubText(this.rows, this.cities.length);
    if (this.labelFoot) {
      const selected = this.selectedRow();
      this.labelFoot.string = selected
        ? `所選 ${selected.name}：${selected.cityCount} 城 · ${selected.officerCount} 在職 · 接壤 ${selected.borderCount} 城`
        : `路網 ${this.paths.length} 條 · 城 ${this.cities.length} · 點一家高亮其城`;
    }

    this.drawMap();
    this.drawRows();

    // 翻頁
    const multi = pages > 1;
    if (this.labelPage) {
      this.labelPage.string = `第 ${this.page + 1} / ${pages} 頁　（共 ${this.rows.length} 家）`;
      this.labelPage.node.active = multi;
    }
    if (this.labelPrev) {
      this.labelPrev.node.active = multi;
      this.labelPrev.color = rgba(this.page > 0 ? COLORS.textDim : COLORS.textFaint);
      if (this.page > 0) this.addHit('prev', FORCES_LAYOUT.navPrev, () => this.flip(-1));
    }
    if (this.labelNext) {
      this.labelNext.node.active = multi;
      this.labelNext.color = rgba(this.page < pages - 1 ? COLORS.textDim : COLORS.textFaint);
      if (this.page < pages - 1) this.addHit('next', FORCES_LAYOUT.navNext, () => this.flip(1));
    }
    this.addHit('close', FORCES_LAYOUT.close, () => this.close());
    this.addHit('back', FORCES_LAYOUT.back, () => this.close());

    // 城名標籤（池子固定 12 個，多的關掉）
    const names = this.cityLabelNames();
    const byName = new Map<string, ForceDot>();
    for (const dot of this.dots) byName.set(dot.name, dot);
    for (let i = 0; i < this.cityLabels.length; i += 1) {
      const label = this.cityLabels[i];
      const name = names[i];
      const dot = name ? byName.get(name) : undefined;
      if (!name || !dot) {
        label.node.active = false;
        continue;
      }
      const p = projectCity(FORCES_LAYOUT.map, dot.x, dot.y);
      label.node.active = true;
      label.string = name;
      label.color = rgba(dot.mine ? COLORS.goldLight : COLORS.text);
      label.node.setPosition(p.x - HALF_W, HALF_H - (p.y - 12), 0);
    }
  }

  private selectedRow(): ForceListRow | null {
    if (!this.selected) return null;
    for (const row of this.rows) if (row.id === this.selected) return row;
    return null;
  }

  private drawMap(): void {
    const g = this.g;
    if (!g) return;
    const view = FORCES_LAYOUT.map;
    g.clear();
    // 不填底色：底板由 `ForcesPlate` 畫、底圖由 `ForcesMapArt` 畫，這裡只畫路網與城點。

    // 路網
    g.strokeColor = rgba(COLORS.line, 170);
    g.lineWidth = 1;
    for (const line of pathPolylines(this.paths, view)) {
      g.moveTo(line[0].x - HALF_W, HALF_H - line[0].y);
      for (let i = 1; i < line.length; i += 1) g.lineTo(line[i].x - HALF_W, HALF_H - line[i].y);
      g.stroke();
    }

    // 城點：勢力色 + 玩家金環 + 所選勢力白環
    const selected = this.selected;
    for (const dot of this.dots) {
      const p = projectCity(view, dot.x, dot.y);
      const x = p.x - HALF_W;
      const y = HALF_H - p.y;
      const dim = selected && dot.force && dot.force !== selected ? 96 : 255;
      g.fillColor = rgba(dot.color, dim);
      g.circle(x, y, dot.radius);
      g.fill();
      if (dot.mine) {
        g.strokeColor = rgba('#EFC978', 235);
        g.lineWidth = 2;
        g.circle(x, y, dot.radius + 3);
        g.stroke();
      }
      if (selected && dot.force === selected) {
        g.strokeColor = rgba(COLORS.text, 230);
        g.lineWidth = 2;
        g.circle(x, y, dot.radius + 3);
        g.stroke();
      }
    }

    // 外框
    this.strokeRect(g, view, COLORS.goldDim, 200, 1);
  }

  private drawRows(): void {
    const g = this.g;
    if (!g) return;
    const rows = this.pageRows();

    for (let i = 0; i < ROW_POOL; i += 1) {
      const row = rows[i];
      const rect = rowRect(i);
      const nodes: Node[] = [
        this.rowChips[i],
        this.rowName[i].node,
        this.rowMonarch[i].node,
        this.rowCities[i].node,
        this.rowOfficers[i].node,
        this.rowBorder[i].node,
        this.rowMonth[i].node,
        this.rowState[i].node,
      ];
      if (!row) {
        for (const node of nodes) node.active = false;
        continue;
      }
      for (const node of nodes) node.active = true;

      const on = row.id === this.selected;
      if (g) {
        this.fillRect(g, rect, on ? '#1B2330' : row.neutral ? '#0D1116' : '#12161C', 235);
        // 左側勢力色條（比色塊更省節點，同時是「這家什麼顏色」的錨）
        this.fillRect(g, { x: rect.x + 8, y: rect.y + 6, w: 3, h: rect.h - 12 }, row.color, on ? 255 : 210);
        this.hline(g, rect.y + rect.h - 1, rect.x + 8, rect.w - 16, COLORS.line, 120);
        if (on) this.strokeRect(g, rect, COLORS.gold, 235, 1);
      }

      // 色塊：九宮 plate_sq tint 成勢力色
      const sprite = this.rowChips[i].getComponent(Sprite);
      if (sprite) sprite.color = rgba(row.color, row.neutral ? 120 : 255);

      this.rowName[i].string = row.neutral ? '無 主' : row.name;
      this.rowName[i].color = rgba(row.player ? COLORS.goldLight : row.alive ? COLORS.text : COLORS.textFaint);
      this.rowMonarch[i].string = row.monarch || '—';
      this.rowCities[i].string = String(row.cityCount);
      this.rowOfficers[i].string = String(row.officerCount);
      this.rowBorder[i].string = row.player ? '—' : row.border ? `接壤 ${row.borderCount}` : '—';
      this.rowBorder[i].color = rgba(row.border ? COLORS.goldLight : COLORS.textFaint);
      this.rowMonth[i].string = row.alive || row.neutral ? '—' : row.monthText;
      this.rowState[i].string = stateTextOf(row);
      this.rowState[i].color = rgba(
        row.neutral ? COLORS.textFaint : row.player ? COLORS.goldLight : row.alive ? COLORS.ok : COLORS.enemy,
      );

      const id = row.id;
      this.addHit(`row:${id || 'none'}`, rect, () => this.select(id));
    }

    // 選中行高亮板（一塊，跟著選中行跑；壓在文字下面）
    const plate = this.selPlate;
    if (plate) {
      const index = rows.findIndex((row) => row.id === this.selected && row.id !== '');
      if (index < 0) plate.active = false;
      else {
        plate.active = true;
        placeAt(plate, rowRect(index), FORCES_LAYOUT.list.w, ROW_H);
      }
    }
  }

  /* --------------------------------------------------------------------- */
  /* 操作                                                                  */
  /* --------------------------------------------------------------------- */

  private flip(delta: number): void {
    const pages = this.pageCount();
    const next = this.page + delta;
    if (next < 0 || next >= pages) return;
    this.page = next;
    this.refresh();
  }

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    const transform = this.node.getComponent(UITransform);
    if (!transform) return;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    this.tap(local.x + HALF_W, HALF_H - local.y);
  }

  /* --------------------------------------------------------------------- */
  /* 幾何 / 建節點                                                         */
  /* --------------------------------------------------------------------- */

  private centerOf(rect: ForceRect): { x: number; y: number } {
    return { x: rect.x + rect.w / 2 - HALF_W, y: HALF_H - (rect.y + rect.h / 2) };
  }

  private makeGraphics(name: string): Graphics {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.node;
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    return node.addComponent(Graphics);
  }

  private makeLabel(
    name: string,
    text: string,
    rect: ForceRect,
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
    label.lineHeight = Math.round(fontSize * 1.36);
    label.color = rgba(color);
    label.horizontalAlign =
      align === 'left' ? Label.HorizontalAlign.LEFT : align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = overflow === Label.Overflow.NONE && align !== 'center' ? Label.Overflow.SHRINK : overflow;
    return label;
  }

  private fillRect(g: Graphics, rect: ForceRect, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.fill();
  }

  private strokeRect(g: Graphics, rect: ForceRect, color: string, alpha = 255, width = 1): void {
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

  private addHit(label: string, rect: ForceRect, act: () => void): void {
    this.hits.push({ rect, label, act });
  }
}

/* =====================================================================
 * §4 模組級小工具
 * =================================================================== */

function pickList(raw: unknown): readonly unknown[] {
  return Array.isArray(raw) ? raw : [];
}

/** 設計座標擺位（左上原點，`w`/`h` 為節點自身尺寸；九宮節點自行帶尺寸） */
function placeAt(node: Node, rect: ForceRect, w: number, h: number): void {
  node.setPosition(rect.x + w / 2 - HALF_W, HALF_H - (rect.y + h / 2), 0);
}

/** 面板框（九宮 `frame_panel`），返回節點。 */
function makePanelFrame(parent: Node, rect: ForceRect): Node {
  const node = makeNineSlice(parent, 'frame_panel', rect.w, rect.h);
  placeAt(node, rect, rect.w, rect.h);
  return node;
}

/** 九宮按鈕（`plate_btn` + 居中 Label；失敗時 UiSkin 自己降級 Graphics 描邊）。 */
function makeSkinBtn(parent: Node, name: string, text: string, rect: ForceRect): Node {
  const node = makeNineSlice(parent, 'plate_btn', rect.w, rect.h);
  node.name = name;
  placeAt(node, rect, rect.w, rect.h);
  const labelNode = new Node(`${name}Label`);
  labelNode.layer = Layers.Enum.UI_2D;
  labelNode.parent = node;
  const transform = labelNode.addComponent(UITransform);
  transform.setAnchorPoint(0.5, 0.5);
  transform.setContentSize(Math.max(1, rect.w), Math.max(1, rect.h));
  const label = labelNode.addComponent(Label);
  label.string = text;
  label.fontFamily = FONT_FAMILY;
  label.fontSize = 22;
  label.lineHeight = 28;
  label.color = rgba(COLORS.text);
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.SHRINK;
  return node;
}

/** 返回鍵的底板（`plate_btn`），與文字分開擺，方便文字換行/換色不動底板。 */
function addTextPlate(parent: Node, name: string, rect: ForceRect): Node {
  const node = makeNineSlice(parent, 'plate_btn', rect.w, rect.h);
  node.name = name;
  placeAt(node, rect, rect.w, rect.h);
  return node;
}
