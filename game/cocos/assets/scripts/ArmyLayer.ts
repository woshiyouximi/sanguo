/**
 * ArmyLayer.ts — 大地圖部隊層 + 兵團指令面板（把 web 兩輪實作整支搬到 Cocos）
 *
 * 對應 web 來源（**逐條照它**，不是重新設計）：
 *   · `game/web/campaign.html:998-1141`  `[[MARCH_UI_CORE]]`：折線插值 / 重疊錯開 / 圓形命中 /
 *     改道校驗 / 剩餘月數 / 部隊在不在城上（純函式，`game/tests/march_ui.test.ts` 直接抽出來測）。
 *   · `game/web/campaign.html:1188-1411` `[[MARCH_STATION_CORE]]`：隨軍名單 / 軍師可點性 /
 *     駐紮判定 / 同段阻擋夾點 / 對峙判定（`project/185_驻扎与军师.md` §B）。
 *   · `game/web/campaign.html:2871-3040`：旗幟圖元 `drawArmyMark()`、7 行軍情 `armyInfoRows()`、
 *     `canEnterCity()`、5 項指令 `renderArmySheet()`（`data-army-act`）。
 *   · `game/web/campaign.html:3627-3642`：地圖點擊優先級 —— 選點態只認城，其次部隊，最後城。
 *
 * 為什麼要一整份列表而不是「畫一次、點一次」：web `armyScreenList()` 的註解寫得很直白 ——
 * 「看到旗在哪、點就在哪」是這一層唯一的正確性要求。所以**繪製與命中吃同一份**
 * `armyScreenList()` 的輸出（含重疊錯開後的座標），Cocos 這邊也一樣。
 *
 * 本檔分三段：
 *   1. `[ARMY_CORE_BEGIN]`…`[ARMY_CORE_END]`：純邏輯，**不 import、不碰 cc**，
 *      `work/cocos_army/assert_army.mjs` 用 ts.transpileModule 逐字抽出來跑斷言
 *      （同 `work/cocos_map84/probe.mjs` 的口徑）。
 *   2. `drawArmyMark()`：Cocos Graphics 版旗幟圖元（web 用 Canvas2D，座標 y 軸相反）。
 *   3. `ArmyMenu`：兵團指令面板（5 項 + 7 行軍情 + 任命軍師子頁）。
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
  UITransform,
  Vec3,
} from 'cc';
import { addVeil, HALF_H, HALF_W } from './ArtLayer';
import { makeBtn, makeNineSlice, placeDesign } from './UiSkin';
import { COLORS, FONT_FAMILY } from './view/theme';

const { ccclass } = _decorator;

/* ========================================================================== *
 * [ARMY_CORE_BEGIN] 純邏輯（不 import、不碰 cc）—— 探針逐字抽這段跑斷言
 * ========================================================================== */

/** 部隊（`save.armies[]` 的元素）。`officers/advisor/stationed/reported` 是 R95 起的新欄位。 */
export interface ArmyLike {
  id: string;
  side: 'A' | 'B';
  from: string;
  to: string;
  pathIndex: number;
  progress: number;
  troops: number;
  general?: string;
  /** 隨軍武將（主將排第一，≤ `ARMY_MAX_OFFICERS`） */
  officers?: string[];
  /** 軍師（必須是本兵團成員；空字串＝未任命） */
  advisor?: string;
  /** 駐紮：停在路上不動，擋住同段的敵軍 */
  stationed?: boolean;
  reported?: boolean;
}

/** 只取部隊層真正會讀的兩張表（`cities[].NAME/pos_xy`、`paths[].Start/End/Length/points`） */
export interface ArmyScenarioLike {
  cities?: readonly { NAME?: string; pos_xy?: unknown }[];
  paths?: readonly { Start?: string; End?: string; Length?: number; points?: unknown }[];
}

export interface PlacedArmy {
  a: ArmyLike;
  /** 設計座標（750×1334，左上原點）—— 繪製與命中共用 */
  x: number;
  y: number;
}

export type ArmyPoint = [number, number];

/** 旗面寬（web `MARCH_FLAG_W = 11`，campaign.html:1007） */
export const MARCH_FLAG_W = 11;
/** 部隊命中半徑（web `MARCH_HIT_R = 16`，campaign.html:1008；任務要求 ≥14） */
export const MARCH_HIT_R = 16;
/** 重疊部隊錯開間距（web `MARCH_STACK_GAP = 13`，campaign.html:1009） */
export const MARCH_STACK_GAP = 13;
/** 駐紮接觸點容差（web `STATION_EPS = 0.005`，campaign.html:1199） */
export const STATION_EPS = 0.005;
/** 浮點餘裕（web `STATION_SLACK = 1e-9`，campaign.html:1202） */
export const STATION_SLACK = 1e-9;
/** 隨軍武將上限（web `ARMY_MAX_OFFICERS = 5`，campaign.html:1250） */
export const ARMY_MAX_OFFICERS = 5;
/** 進城後守軍上限（web `enterCity()` 的 600，campaign.html:2988） */
export const CITY_TROOP_CAP = 600;
/** 一個月按 30 天折算（web `marchRemain(progress, step, daysPerMonth = 30)`） */
export const ARMY_DAYS_PER_MONTH = 30;

/** `Number` 收斂：非有限值 → fallback */
export function armyNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 夾到 [0,1]；非有限值 → 0（web `marchClamp01`，campaign.html:1011） */
export function armyClamp01(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * 沿折線按段長等距插值（web `marchLerpPoint`，campaign.html:1020）：
 * 過濾非法點；單點＝該點；`reverse` 時取 `1-t`（從 End 往 Start 走）。
 */
export function armyLerpPoint(points: unknown, progress: unknown, reverse: boolean): ArmyPoint {
  const pts: ArmyPoint[] = [];
  if (Array.isArray(points)) {
    for (const raw of points) {
      if (!Array.isArray(raw) || raw.length < 2) continue;
      const x = Number(raw[0]);
      const y = Number(raw[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
    }
  }
  if (pts.length === 0) return [0, 0];
  if (pts.length === 1) return pts[0];

  const t = armyClamp01(progress);
  const along = reverse ? 1 - t : t;

  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d);
    total += d;
  }
  if (!(total > 0)) return pts[0];

  let want = along * total;
  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i];
    if (want <= seg || i === segs.length - 1) {
      const k = seg > 0 ? Math.min(1, want / seg) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    want -= seg;
  }
  return pts[pts.length - 1];
}

/** 城點座標（`pos_xy`）；查不到 / 值壞 → null */
export function armyCityPos(scenario: ArmyScenarioLike, name: unknown): ArmyPoint | null {
  const cities = Array.isArray(scenario?.cities) ? scenario.cities : [];
  const key = String(name ?? '');
  for (const city of cities) {
    if (!city || String(city.NAME ?? '') !== key) continue;
    const pair = Array.isArray(city.pos_xy) ? (city.pos_xy as unknown[]) : null;
    if (!pair || pair.length < 2) return null;
    const x = Number(pair[0]);
    const y = Number(pair[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  }
  return null;
}

function armyPathOf(
  scenario: ArmyScenarioLike,
  army: ArmyLike,
): { Start?: string; End?: string; Length?: number; points?: unknown } | null {
  const paths = Array.isArray(scenario?.paths) ? scenario.paths : [];
  const index = Math.trunc(armyNum(army?.pathIndex, -1));
  const path = index >= 0 ? paths[index] : null;
  return path ?? null;
}

/**
 * 部隊在地圖像素座標（web `armyPos`，campaign.html:1148-1161）：
 * 取 `paths[pathIndex].points`；點不夠時用兩端城的 `pos_xy` 兜底；
 * 方向由 `army.from` 決定（from 是 path.End 時反向）。
 */
export function armyPos(scenario: ArmyScenarioLike, army: ArmyLike): ArmyPoint {
  const path = armyPathOf(scenario, army);
  if (!path) return [0, 0];
  const pts: ArmyPoint[] = [];
  if (Array.isArray(path.points)) {
    for (const raw of path.points) {
      if (!Array.isArray(raw) || raw.length < 2) continue;
      const x = Number(raw[0]);
      const y = Number(raw[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
    }
  }
  if (pts.length < 2) {
    const start = armyCityPos(scenario, path.Start);
    const end = armyCityPos(scenario, path.End);
    if (start) pts.push(start);
    if (end) pts.push(end);
  }
  const reverse = army.from === path.End && army.from !== path.Start;
  return armyLerpPoint(pts, army.progress, reverse);
}

/** 一條路走幾個月：`clamp(ceil(Length/100), 1, 3)`（web `marchMonths`，campaign.html:984） */
export function armyMonthsOfLength(length: unknown): number {
  const n = armyNum(length, 0);
  return Math.min(3, Math.max(1, Math.ceil(n / 100)));
}

/** 部隊所在路的月數；查不到路 → 1（與 web 的 `|| 0` 同效應） */
export function armyMonths(scenario: ArmyScenarioLike, pathIndex: unknown): number {
  const paths = Array.isArray(scenario?.paths) ? scenario.paths : [];
  const index = Math.trunc(armyNum(pathIndex, -1));
  const path = index >= 0 ? paths[index] : null;
  return armyMonthsOfLength(path ? path.Length : 0);
}

/**
 * 一個月推進的比例。web `marchStep(pi) = MARCH_PER_MONTH * (3 / marchMonths(pi))`
 * （campaign.html:990）＝ `1 / months`：近路一個月到、遠路三個月到。
 */
export function armyStep(scenario: ArmyScenarioLike, pathIndex: unknown): number {
  return 1 / armyMonths(scenario, pathIndex);
}

export interface ArmyRemain {
  progress: number;
  pct: number;
  months: number;
  days: number;
}

/** 剩餘路程（web `marchRemain`，campaign.html:1125）：月取一位小數，天按 30 天/月 */
export function armyRemain(progress: unknown, step: unknown, daysPerMonth = ARMY_DAYS_PER_MONTH): ArmyRemain {
  const p = armyClamp01(progress);
  const s = armyNum(step, 0);
  const left = 1 - p;
  const raw = s > 0 ? left / s : 0;
  return {
    progress: p,
    pct: Math.round(p * 100),
    months: Math.round(raw * 10) / 10,
    days: Math.round(raw * daysPerMonth),
  };
}

/** 部隊是否正站在城上：p≤0 → 出發城、p≥1 → 目的城、路上 → `''`（web `marchAtCity`，:1135） */
export function armyAtCity(army: ArmyLike): string {
  if (!army) return '';
  const p = armyClamp01(army.progress);
  if (p <= 0) return String(army.from ?? '');
  if (p >= 1) return String(army.to ?? '');
  return '';
}

/**
 * 重疊錯開（web `marchStackPlace`，campaign.html:1054）：九宮格按 `minDist` 一格一格試，
 * 與已放好的每一個都拉開 `minDist - 0.001` 以上；九格都撞就疊著不動。
 * 順序＝正右/正左/正下/正上/四個斜角（與 web 完全一致，換順序會讓同一份存檔畫出不同位置）。
 */
export function armyStackPlace(base: readonly ArmyPoint[], minDist = MARCH_STACK_GAP): ArmyPoint[] {
  const gap = armyNum(minDist, MARCH_STACK_GAP) || MARCH_STACK_GAP;
  const offsets: ArmyPoint[] = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  const out: ArmyPoint[] = [];
  for (const point of Array.isArray(base) ? base : []) {
    const bx = armyNum(point?.[0], 0);
    const by = armyNum(point?.[1], 0);
    let put: ArmyPoint = [bx, by];
    for (const off of offsets) {
      const x = bx + off[0] * gap;
      const y = by + off[1] * gap;
      let ok = true;
      for (const prev of out) {
        const dx = prev[0] - x;
        const dy = prev[1] - y;
        if (Math.hypot(dx, dy) < gap - 0.001) {
          ok = false;
          break;
        }
      }
      if (ok) {
        put = [x, y];
        break;
      }
    }
    out.push(put);
  }
  return out;
}

/**
 * 圓形最近命中（web `marchHitArmy`，campaign.html:1076）：
 * `d <= r*r && d < best` 才算，同一點上兩支取**列表靠前**那支；沒有 → -1。
 */
export function armyHitIndex(
  placed: readonly ArmyPoint[],
  px: number,
  py: number,
  radius = MARCH_HIT_R,
): number {
  const r = armyNum(radius, MARCH_HIT_R);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  const rows = Array.isArray(placed) ? placed : [];
  for (let i = 0; i < rows.length; i += 1) {
    const dx = armyNum(rows[i]?.[0], 0) - armyNum(px, 0);
    const dy = armyNum(rows[i]?.[1], 0) - armyNum(py, 0);
    const distance = dx * dx + dy * dy;
    if (distance <= r * r && distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * 螢幕列表（web `armyScreenList`，campaign.html:2878）：
 * 過濾無 id 的髒資料 → 逐支算地圖座標 → 交給 `armyStackPlace` 錯開。
 * **繪製與命中都吃這一支函式的回傳值**。
 */
export function armyScreenList(
  scenario: ArmyScenarioLike,
  armies: readonly ArmyLike[],
  project: (x: number, y: number) => { x: number; y: number },
): PlacedArmy[] {
  const rows: ArmyLike[] = [];
  for (const army of Array.isArray(armies) ? armies : []) {
    if (army && army.id) rows.push(army);
  }
  const base: ArmyPoint[] = rows.map((army) => {
    const point = armyPos(scenario, army);
    const screen = project(point[0], point[1]);
    return [armyNum(screen?.x, 0), armyNum(screen?.y, 0)] as ArmyPoint;
  });
  const placed = armyStackPlace(base);
  return rows.map((army, i) => ({ a: army, x: placed[i][0], y: placed[i][1] }));
}

export type MapHitKind = 'pick' | 'army' | 'city' | 'none';

export interface MapHit {
  kind: MapHitKind;
  armyIndex: number;
  cityIndex: number;
}

/**
 * 地圖點擊優先級（web campaign.html:3627-3642）：
 *   `if (pickArmyId)` → **只認城**（`hitCity`），部隊與空白都不吃；
 *   否則是 `hitArmy` → `hitCity`。
 * 這支是 onTouch 的唯一判準，純函式所以能直接斷言「選點態 > 部隊 > 城」。
 */
export function resolveMapHit(pickMode: boolean, armyIndex: number, cityIndex: number): MapHit {
  const a = Number.isInteger(armyIndex) ? armyIndex : -1;
  const c = Number.isInteger(cityIndex) ? cityIndex : -1;
  if (pickMode) {
    return c >= 0 ? { kind: 'pick', armyIndex: -1, cityIndex: c } : { kind: 'none', armyIndex: -1, cityIndex: -1 };
  }
  if (a >= 0) return { kind: 'army', armyIndex: a, cityIndex: c };
  if (c >= 0) return { kind: 'city', armyIndex: -1, cityIndex: c };
  return { kind: 'none', armyIndex: -1, cityIndex: -1 };
}

/* ---------------------------------------------------------------- 駐紮 / 軍師 */

/** 隨軍武將清單：主將第一、去重（web `armyOfficerList`，campaign.html:1224） */
export function armyOfficerList(army: ArmyLike | null | undefined): string[] {
  const out: string[] = [];
  const push = (value: unknown): void => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name && out.indexOf(name) < 0) out.push(name);
  };
  if (army && army.general) push(army.general);
  const officers = army && Array.isArray(army.officers) ? army.officers : [];
  for (const name of officers) push(name);
  return out;
}

/** 軍師可點性：**只看兵團裡有幾個人**，≥2 才可任命（web `armyCanAppointAdvisor`，:1281） */
export function armyCanAppointAdvisor(army: ArmyLike | null | undefined): boolean {
  return armyOfficerList(army).length >= 2;
}

/** 現任軍師；不在名單裡（舊檔/被移走）→ `''`（web `armyAdvisorOf`，:1286） */
export function armyAdvisorOf(army: ArmyLike | null | undefined): string {
  const advisor = army && typeof army.advisor === 'string' ? army.advisor.trim() : '';
  if (!advisor) return '';
  return armyOfficerList(army).indexOf(advisor) >= 0 ? advisor : '';
}

/** 任命/免職（web `armySetAdvisor`，:1292）：`''`＝免職返 true，非成員返 false 且不改值 */
export function armySetAdvisor(army: ArmyLike | null | undefined, name: unknown): boolean {
  if (!army) return false;
  const want = typeof name === 'string' ? name.trim() : '';
  if (!want) {
    army.advisor = '';
    return true;
  }
  if (armyOfficerList(army).indexOf(want) < 0) return false;
  army.advisor = want;
  return true;
}

/** 駐紮中（web `armyIsStationed`，:1302）：只有嚴格 `true` 才算 */
export function armyIsStationed(army: ArmyLike | null | undefined): boolean {
  return Boolean(army) && army!.stationed === true;
}

/**
 * 舊檔補欄位（web `normalizeArmyExtras`，campaign.html:1205，冪等）：
 * `officers` 陣列化並把主將 unshift 到最前；`advisor` 不在名單就清 `''`；
 * `stationed = (=== true)`。Cocos 這支在 `GameState.normalizeArmies()` 裡呼叫。
 */
export function normalizeArmyExtras(army: ArmyLike | null | undefined): ArmyLike | null {
  if (!army || typeof army !== 'object') return null;
  const general = typeof army.general === 'string' ? army.general.trim() : '';
  const names: string[] = [];
  const raw = Array.isArray(army.officers) ? army.officers : [];
  for (const value of raw) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name && names.indexOf(name) < 0) names.push(name);
  }
  if (general) {
    const at = names.indexOf(general);
    if (at >= 0) names.splice(at, 1);
    names.unshift(general);
  }
  army.officers = names.slice(0, ARMY_MAX_OFFICERS);
  const advisor = typeof army.advisor === 'string' ? army.advisor.trim() : '';
  army.advisor = advisor && army.officers.indexOf(advisor) >= 0 ? advisor : '';
  army.stationed = army.stationed === true;
  army.reported = army.reported === true;
  return army;
}

/**
 * 隨軍名單（web `armyRosterPick`，campaign.html:1259）：
 * 主將第一 → 出陣順序裡屬於本城名冊的人 → 名冊補齊 → 上限。
 */
export function armyRosterPick(
  queueNames: readonly unknown[],
  rosterNames: readonly unknown[],
  general: unknown,
  max = ARMY_MAX_OFFICERS,
): string[] {
  const cap = Math.max(1, Math.trunc(armyNum(max, ARMY_MAX_OFFICERS)));
  const out: string[] = [];
  const add = (value: unknown): void => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || out.length >= cap || out.indexOf(name) >= 0) return;
    out.push(name);
  };
  add(general);
  const roster: string[] = [];
  for (const value of Array.isArray(rosterNames) ? rosterNames : []) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name) roster.push(name);
  }
  const inRoster = (value: unknown): boolean => roster.indexOf(String(value ?? '').trim()) >= 0;
  for (const value of Array.isArray(queueNames) ? queueNames : []) {
    if (inRoster(value)) add(value);
  }
  for (const name of roster) add(name);
  return out;
}

/** 同一路段（web `marchSameLeg`，:1307）：from/to 相同或互換，否則比 pathIndex */
export function armySameLeg(a: ArmyLike | null, b: ArmyLike | null): boolean {
  if (!a || !b) return false;
  if (a.from === b.from && a.to === b.to) return true;
  if (a.from === b.to && a.to === b.from) return true;
  return Math.trunc(armyNum(a.pathIndex, -1)) === Math.trunc(armyNum(b.pathIndex, -2));
}

/**
 * 推進上限（web `stationProgressLimit`，campaign.html:1326）：
 * 同陣營 / 對方沒駐紮 / 不同段 / 對方不在路上 → 1（不受限）；
 * 相向 → `clamp01(1 - pb - STATION_EPS)`（**接觸點**）；同向且我還沒超過他 → `clamp01(pb - STATION_EPS)`。
 */
export function stationProgressLimit(mover: ArmyLike, blocker: ArmyLike): number {
  if (!mover || !blocker || mover === blocker) return 1;
  if (mover.side === blocker.side) return 1;
  if (!armyIsStationed(blocker)) return 1;
  if (!armySameLeg(mover, blocker)) return 1;
  const pm = armyClamp01(mover.progress);
  const pb = armyClamp01(blocker.progress);
  if (!(pb > 0 && pb < 1)) return 1;
  const opposite = mover.from === blocker.to && mover.to === blocker.from;
  if (opposite) return armyClamp01(1 - pb - STATION_EPS);
  if (pm < pb) return armyClamp01(pb - STATION_EPS);
  return 1;
}

export interface ArmyMove {
  a: ArmyLike;
  /** 推進前 */
  from: number;
  /** 不受阻時想去哪 */
  want: number;
  /** 實際寫回的 progress */
  next: number;
  /** 駐紮或已到城下 → 凍結 */
  frozen: boolean;
  /** 擋住它的部隊 id（沒被擋 → null） */
  blockedBy: string | null;
}

/**
 * 一個月的推進計畫（web `planArmyMoves`，campaign.html:1346）：
 *   · 駐紮 / 已到城下 → 凍結（`frozen = stationed`）；
 *   · 否則取所有 blocker 裡最小的 limit，`next = want > limit ? max(p, limit) : want`
 *     ——**不後退、不超車**（campaign.html:1367）；
 *   · `blockedBy` 只在「真的被夾住」時才寫。
 */
export function planArmyMoves(
  list: readonly ArmyLike[],
  stepOf: (army: ArmyLike) => number,
): ArmyMove[] {
  const rows: ArmyLike[] = [];
  for (const army of Array.isArray(list) ? list : []) {
    if (army && army.id) rows.push(army);
  }
  const moves: ArmyMove[] = [];
  for (const army of rows) {
    const p = armyClamp01(army.progress);
    const frozen = armyIsStationed(army);
    if (frozen || p >= 1) {
      moves.push({ a: army, from: p, want: p, next: p, frozen, blockedBy: null });
      continue;
    }
    const step = Math.max(0, armyNum(stepOf(army), 0));
    const want = armyClamp01(p + step);
    let limit = 1;
    let blocker: ArmyLike | null = null;
    for (const other of rows) {
      if (other === army) continue;
      const candidate = stationProgressLimit(army, other);
      if (candidate < limit) {
        limit = candidate;
        blocker = other;
      }
    }
    const next = want > limit ? Math.max(p, limit) : want;
    moves.push({
      a: army,
      from: p,
      want,
      next,
      frozen: false,
      blockedBy: blocker && next < want ? blocker.id : null,
    });
  }
  return moves;
}

/** 對峙配對鍵（web `stationPairKey`，:1377） */
export function stationPairKey(blocker: ArmyLike, mover: ArmyLike): string {
  return `${blocker?.id ?? ''}>${mover?.id ?? ''}`;
}

/**
 * 駐紮對峙（web `stationStandoff`，campaign.html:1388）：
 * 駐紮方 0<ps<1、敵對、同段、推進方沒駐紮且 0<pm<1；
 * 相向判 `|pm - (1-ps)| <= EPS + SLACK`，同向判 `0 <= ps - pm <= EPS + SLACK`。
 */
export function stationStandoff(
  list: readonly ArmyLike[],
): { blocker: ArmyLike; mover: ArmyLike } | null {
  const rows: ArmyLike[] = [];
  for (const army of Array.isArray(list) ? list : []) {
    if (army && army.id) rows.push(army);
  }
  for (const blocker of rows) {
    if (!armyIsStationed(blocker)) continue;
    const ps = armyClamp01(blocker.progress);
    if (!(ps > 0 && ps < 1)) continue;
    for (const mover of rows) {
      if (mover === blocker || mover.side === blocker.side) continue;
      if (armyIsStationed(mover)) continue;
      if (!armySameLeg(mover, blocker)) continue;
      const pm = armyClamp01(mover.progress);
      if (!(pm > 0 && pm < 1)) continue;
      const opposite = mover.from === blocker.to && mover.to === blocker.from;
      const ok = opposite
        ? Math.abs(pm - (1 - ps)) <= STATION_EPS + STATION_SLACK
        : ps - pm >= 0 && ps - pm <= STATION_EPS + STATION_SLACK;
      if (ok) return { blocker, mover };
    }
  }
  return null;
}

export interface RetargetCheck {
  ok: boolean;
  pathIndex?: number;
  why?: string;
}

/**
 * 改道校驗（web `marchRetargetCheck`，campaign.html:1100）—— 六條拒絕文案逐字照它：
 * 「沒有選中兵團。」/「敵軍兵團不能變更目的。」/「沒有選中城市。」/
 * 「兵團的目的地已經是 X。」/「目的城不能是出發城 X：部隊要回城請用『進入城內』。」/
 * 「X 到 Y 沒有可行道路：兵團只能改為與出發城相鄰的城。」/「Y 是我方城池：本作兵團只能開往敵城或空城。」
 */
export function armyRetargetCheck(
  army: ArmyLike | null | undefined,
  to: unknown,
  pathOf: (from: string, to: string) => number | null,
  isMine: (city: string) => boolean,
): RetargetCheck {
  if (!army) return { ok: false, why: '沒有選中兵團。' };
  if (army.side !== 'A') return { ok: false, why: '敵軍兵團不能變更目的。' };
  const dest = typeof to === 'string' ? to.trim() : '';
  if (!dest) return { ok: false, why: '沒有選中城市。' };
  if (dest === army.to) return { ok: false, why: `兵團的目的地已經是 ${dest}。` };
  if (dest === army.from) {
    return { ok: false, why: `目的城不能是出發城 ${army.from}：部隊要回城請用「進入城內」。` };
  }
  const pathIndex = pathOf(army.from, dest);
  if (pathIndex === null || pathIndex === undefined || !Number.isFinite(Number(pathIndex))) {
    return { ok: false, why: `${army.from} 到 ${dest} 沒有可行道路：兵團只能改為與出發城相鄰的城。` };
  }
  if (isMine(dest)) return { ok: false, why: `${dest} 是我方城池：本作兵團只能開往敵城或空城。` };
  return { ok: true, pathIndex: Number(pathIndex) };
}

export interface EnterCityCheck {
  ok: boolean;
  city?: string;
  why?: string;
}

/** 進入城內可點性（web `canEnterCity`，campaign.html:2974） */
export function armyCanEnterCity(
  army: ArmyLike | null | undefined,
  isMine: (city: string) => boolean,
): EnterCityCheck {
  if (!army) return { ok: false, why: '沒有選中兵團。' };
  const at = armyAtCity(army);
  if (!at) return { ok: false, why: '部隊在路途中，不在城上' };
  if (!isMine(at)) return { ok: false, why: `${at} 不是我方城池，不能進城` };
  return { ok: true, city: at };
}

export type ArmyCmdAct = 'general' | 'retarget' | 'station' | 'advisor' | 'enter';

export interface ArmyCmd {
  act: ArmyCmdAct;
  label: string;
  hint: string;
  enabled: boolean;
  primary: boolean;
}

/**
 * 5 項兵團指令（web `renderArmySheet()` 的 `cmd(...)` 五條，campaign.html:3020-3035）。
 * 可點性與灰字**逐字**照 web：這是「逐項可用性」唯一的真值來源，面板與斷言都吃它。
 */
export function armyCmdRows(army: ArmyLike, isMine: (city: string) => boolean): ArmyCmd[] {
  const own = army?.side === 'A';
  const stationed = armyIsStationed(army);
  const p = armyClamp01(army?.progress);
  const onRoad = p > 0 && p < 1;
  const advisorName = armyAdvisorOf(army);
  const officers = armyOfficerList(army);
  const enter = armyCanEnterCity(army, isMine);
  return [
    {
      act: 'general',
      label: '武將資料',
      hint: army?.general ? `${army.general} 的數值` : '沒有主將',
      enabled: Boolean(army?.general),
      primary: false,
    },
    {
      act: 'retarget',
      label: '變更目的',
      hint: own ? '點相鄰敵城改道' : '敵軍兵團不可用',
      enabled: own,
      primary: own,
    },
    {
      act: 'station',
      label: '部隊駐紮',
      hint: own
        ? stationed
          ? '駐紮中：再點一次解除'
          : '駐紮：停在路上、阻擋敵軍'
        : '敵軍兵團不可用',
      enabled: own && (stationed || onRoad),
      primary: false,
    },
    {
      act: 'advisor',
      label: '任命軍師',
      hint: own
        ? officers.length < 2
          ? '軍團僅主將一人，無可任命'
          : advisorName
            ? `現任 ${advisorName} · 點此更換`
            : `從 ${officers.length} 名隨軍武將裡選`
        : '敵軍兵團不可用',
      enabled: own && armyCanAppointAdvisor(army),
      primary: false,
    },
    {
      act: 'enter',
      label: '進入城內',
      hint: enter.ok ? `併入 ${enter.city} 守軍` : (enter.why ?? ''),
      enabled: enter.ok,
      primary: false,
    },
  ];
}

export interface ArmyInfoCtx {
  gold: number;
  /** 這條路的月數 */
  months: number;
  levelOf?: (name: string) => number;
  wiseSeqOf?: (name: string) => number;
  wiseHintOf?: (seq: number) => string;
}

/**
 * 7 行軍情（web `armyInfoRows`，campaign.html:2949-2972）—— 順序與文字逐字照原作：
 * 主將 / 軍師 / 目的地 / 武將數 / 兵數 / 金錢 / 目前所在地形。
 */
export function armyInfoRows(army: ArmyLike, ctx: ArmyInfoCtx): [string, string][] {
  const leader = army?.general || '—';
  const level = army?.general && ctx.levelOf ? ctx.levelOf(army.general) : 0;
  const at = armyAtCity(army);
  const place = at ? `城（${at}）` : '平原（路上）';
  const advisorName = armyAdvisorOf(army);
  const advisorSeq = advisorName && ctx.wiseSeqOf ? ctx.wiseSeqOf(advisorName) : 0;
  const advisorHint = advisorSeq && ctx.wiseHintOf ? ctx.wiseHintOf(advisorSeq) || '軍師技' : '未學軍師技';
  const officers = armyOfficerList(army);
  const gold = Math.round(armyNum(ctx.gold, 0));
  return [
    ['主將', army?.general ? `${leader} Lv${level}` : '—（無主將）'],
    ['軍師', advisorName ? `${advisorName} · ${advisorHint}` : `${leader}（主將兼） · 未任命`],
    ['目的地', `${army?.to ?? ''} · ${armyNum(ctx.months, 1)} 個月`],
    ['武將數', `${officers.length}${officers.length > 1 ? ` · ${officers.join('、')}` : ''}`],
    ['兵數', `${Math.round(armyNum(army?.troops, 0))}`],
    ['金錢', `${gold.toLocaleString('en-US')} · 勢力共用`],
    [
      '目前所在地形',
      armyIsStationed(army) ? `${place} · 駐紮中（進度凍結）` : place,
    ],
  ];
}

/* ========================================================================== *
 * [ARMY_CORE_END]
 * ========================================================================== */

/* -------------------------------------------------------------------------- *
 * 旗幟圖元（web drawArmyMark，campaign.html:2898-2946）
 * -------------------------------------------------------------------------- */

function armyColor(value: string, alpha = 255): Color {
  const text = (value || '').replace('#', '').trim();
  let full = text;
  if (full.length === 3) full = full.split('').map((c) => c + c).join('');
  else if (full.length < 6) full = full.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return new Color(r, g, b, alpha);
}

/** 旗色＝陣營（web `armyFlagColor`，:2871） */
export function armyFlagColor(army: ArmyLike): string {
  return army?.side === 'A' ? '#7FD1A8' : '#F2AE97';
}

/** 兵力牌字色（web `armyFlagInk`，:2872） */
export function armyFlagInk(army: ArmyLike): string {
  return army?.side === 'A' ? '#A9E8C9' : '#F0B8A8';
}

/**
 * 畫一支部隊：暗底圓 → 旗桿（2.8px 墨 + 1.1px 米色高光）→ 三角旗面 → 馬身橢圓；
 * 選中時加金環。Cocos 的 Graphics 沒有 save/restore，所以每段自己重下 path/顏色，
 * 並且 **y 軸要翻**（web 是 y 向下、Cocos 節點是 y 向上）。
 * 兵力牌（web 的 `a.troops`/「抵達」小牌）留給 Label 畫，見 CampaignRoot.armyBadge。
 */
export function drawArmyMark(g: Graphics, it: PlacedArmy, selectedId: string | null): void {
  const cx = it.x - HALF_W;
  const cy = HALF_H - it.y;
  const flag = armyColor(armyFlagColor(it.a));
  const ink = armyColor('#080C10', 82);

  // 暗底：底圖有河有路，純色小旗在淺色地形上會糊掉
  g.fillColor = ink;
  g.circle(cx, cy - 2, 9.2);
  g.fill();

  // 旗桿（墨）
  g.strokeColor = armyColor('#080C10', 242);
  g.lineWidth = 2.8;
  g.moveTo(cx, cy - 10);
  g.lineTo(cx, cy + 9);
  g.stroke();
  // 旗桿（米色高光）
  g.strokeColor = armyColor('#E9E4D6', 255);
  g.lineWidth = 1.1;
  g.moveTo(cx, cy - 9);
  g.lineTo(cx, cy + 8);
  g.stroke();

  // 旗面：左上角釘在旗桿頂，朝右的小三角
  const w = MARCH_FLAG_W;
  const h = 8;
  const tipX = cx + 0.8;
  const topY = cy + 9;
  const midY = cy + 9 - h / 2;
  const botY = cy + 9 - h;
  g.fillColor = flag;
  g.moveTo(tipX, topY);
  g.lineTo(tipX + w, midY);
  g.lineTo(tipX, botY);
  g.close();
  g.fill();
  g.strokeColor = armyColor('#080C10', 230);
  g.lineWidth = 1.4;
  g.moveTo(tipX, topY);
  g.lineTo(tipX + w, midY);
  g.lineTo(tipX, botY);
  g.close();
  g.stroke();

  // 馬身（沒有這一點，小旗在豎屏地圖上只剩一個色點）
  g.fillColor = flag;
  g.ellipse(cx, cy - 10, 5.2, 3);
  g.fill();
  g.strokeColor = armyColor('#080C10', 230);
  g.lineWidth = 1.1;
  g.ellipse(cx, cy - 10, 5.2, 3);
  g.stroke();

  // 選中：金環 + 抵達光暈
  if (selectedId && it.a.id === selectedId) {
    g.strokeColor = armyColor(COLORS.goldLight, 255);
    g.lineWidth = 2.2;
    g.circle(cx, cy, 13.5);
    g.stroke();
  }
  if (armyClamp01(it.a.progress) >= 1) {
    g.strokeColor = armyColor(it.a.side === 'A' ? '#B8F0D4' : '#FFC2B4', 200);
    g.lineWidth = 1.4;
    g.circle(cx, cy, 16);
    g.stroke();
  }
}

/* -------------------------------------------------------------------------- *
 * 兵團指令面板
 * -------------------------------------------------------------------------- */

export const ARMY_MENU_NODE_NAME = 'ArmyMenu';

type Align = 'left' | 'center' | 'right';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SCREEN: Rect = { x: 0, y: 0, w: 750, h: 1334 };
/**
 * 遮罩要比設計解析度大一圈：exactFitScreen 下畫布可能比 750×1334 寬（實測 876×1368），
 * 只蓋滿設計框的話左右會露出底下的地圖與提示條文字（截圖 07 就是這樣漏的）。
 */
const VEIL: Rect = { x: -240, y: -240, w: 750 + 480, h: 1334 + 480 };
const FRAME: Rect = { x: 10, y: 56, w: 730, h: 1222 };
const TITLE: Rect = { x: 34, y: 78, w: 540, h: 46 };
const CLOSE: Rect = { x: 588, y: 84, w: 128, h: 44 };
const SUB: Rect = { x: 34, y: 128, w: 682, h: 66 };
const INFO: Rect = { x: 24, y: 206, w: 702, h: 324 };
const INFO_ROW_H = 44;
const CMD_Y0 = 552;
const CMD_H = 100;
const CMD_GAP = 10;
const CMD_W = 702;
const CMD_X = 24;
const FOOT: Rect = { x: 30, y: 1112, w: 690, h: 62 };
const BACK: Rect = { x: 195, y: 1194, w: 360, h: 62 };
const ADV_ROW_Y0 = 216;
const ADV_ROW_H = 96;
const ADV_ROW_GAP = 10;
const ADV_MAX = ARMY_MAX_OFFICERS + 1;
const ADV_FOOT: Rect = { x: 30, y: 902, w: 690, h: 48 };

export interface ArmyMenuOptions {
  army: ArmyLike;
  /** 勢力金錢（7 行軍情的「金錢 · 勢力共用」） */
  gold?: number;
  /** 這條路的月數 */
  months?: number;
  isMine: (city: string) => boolean;
  levelOf?: (name: string) => number;
  wiseSeqOf?: (name: string) => number;
  wiseHintOf?: (seq: number) => string;
  onClose?: (() => void) | null;
  /** 5 項指令；面板不自己改存檔，全部交回 lead（CampaignRoot） */
  onCommand?: ((act: ArmyCmdAct, army: ArmyLike) => void) | null;
  /** 任命軍師：`''` = 不設軍師 */
  onAdvisor?: ((name: string, army: ArmyLike) => void) | null;
  /** 一進來就開在「任命軍師」子頁（驗收截圖用） */
  mode?: 'menu' | 'advisor';
}

interface Hit {
  name: string;
  rect: Rect;
  act: () => void;
}

export interface ArmyMenuDebug {
  opened: boolean;
  mode: string;
  armyId: string;
  title: string;
  sub: string;
  infoKeys: string[];
  infoValues: string[];
  cmds: { act: string; label: string; hint: string; enabled: boolean }[];
  foot: string;
  advisorRows: { text: string; enabled: boolean }[];
  hitNames: string[];
  nodeCount: number;
}

function countNodes(root: Node): number {
  let total = 1;
  for (const child of root.children) total += countNodes(child);
  return total;
}

@ccclass('ArmyMenu')
export class ArmyMenu extends Component {
  private built = false;
  private opened = false;
  private mode: 'menu' | 'advisor' = 'menu';

  private g: Graphics | null = null;
  private menuGroup: Node | null = null;
  private advisorGroup: Node | null = null;

  private titleLabel: Label | null = null;
  private subLabel: Label | null = null;
  private footLabel: Label | null = null;
  private backLabel: Label | null = null;
  private infoKeys: Label[] = [];
  private infoValues: Label[] = [];
  private cmdLabels: Label[] = [];
  private cmdHints: Label[] = [];
  private advisorLabels: Label[] = [];
  private advisorSubs: Label[] = [];
  private advisorFoot: Label | null = null;

  private hits: Hit[] = [];
  private options: ArmyMenuOptions | null = null;

  /* ---------------------------------------------------------------- */
  /* 靜態入口                                                          */
  /* ---------------------------------------------------------------- */

  static show(parent: Node, options: ArmyMenuOptions): ArmyMenu {
    let node = parent.getChildByName(ARMY_MENU_NODE_NAME);
    if (!node) {
      node = new Node(ARMY_MENU_NODE_NAME);
      node.layer = Layers.Enum.UI_2D;
    }
    if (node.parent !== parent) node.parent = parent;
    let panel = node.getComponent(ArmyMenu);
    if (!panel) panel = node.addComponent(ArmyMenu);
    panel.build();
    panel.open(options);
    return panel;
  }

  static hide(parent: Node): void {
    const node = parent.getChildByName(ARMY_MENU_NODE_NAME);
    node?.getComponent(ArmyMenu)?.close();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  get currentMode(): 'menu' | 'advisor' {
    return this.mode;
  }

  /* ---------------------------------------------------------------- */
  /* 生命週期                                                          */
  /* ---------------------------------------------------------------- */

  build(): void {
    if (this.built) return;
    this.built = true;
    const root = this.node;
    root.layer = Layers.Enum.UI_2D;
    let transform = root.getComponent(UITransform);
    if (!transform) transform = root.addComponent(UITransform);
    transform.setContentSize(SCREEN.w, SCREEN.h);

    // 深底：整塊吃掉地圖點擊（面板是模態的，與 CityListPanel 同一口徑）
    addVeil(root, 'ArmyMenuBg', VEIL, new Color(9, 12, 17, 236));

    const frame = makeNineSlice(root, 'frame_panel', FRAME.w, FRAME.h);
    frame.name = 'ArmyMenuFrame';
    placeDesign(frame, FRAME.x, FRAME.y, FRAME.w, FRAME.h);

    const layer = new Node('ArmyMenuFrameGfx');
    layer.layer = Layers.Enum.UI_2D;
    layer.parent = root;
    const layerTransform = layer.addComponent(UITransform);
    layerTransform.setContentSize(SCREEN.w, SCREEN.h);
    layer.setPosition(0, 0);
    this.g = layer.addComponent(Graphics);

    // 指令頁
    const menu = new Node('ArmyMenuSheet');
    menu.layer = Layers.Enum.UI_2D;
    menu.parent = root;
    menu.addComponent(UITransform).setContentSize(SCREEN.w, SCREEN.h);
    this.menuGroup = menu;

    // 標題/副標掛在 root（不是 menu 群組）：軍師頁也要顯示「任 命 軍 師」，
    // 掛在 menu 群組裡會被 `menuGroup.active = false` 一起藏掉（實測 05 截圖標題空白）。
    this.titleLabel = this.makeLabel(root, 'ArmyTitle', '', TITLE, 34, COLORS.goldLight, {
      align: 'left',
      bold: true,
      lineHeight: 42,
    });
    this.subLabel = this.makeLabel(root, 'ArmySub', '', SUB, 19, COLORS.textDim, {
      align: 'left',
      lineHeight: 26,
      wrap: true,
    });
    for (let i = 0; i < 7; i += 1) {
      const y = INFO.y + 12 + i * INFO_ROW_H;
      this.infoKeys.push(
        this.makeLabel(menu, `ArmyInfoK${i}`, '', { x: INFO.x + 18, y, w: 150, h: INFO_ROW_H - 8 }, 18, COLORS.textFaint, {
          align: 'left',
        }),
      );
      this.infoValues.push(
        this.makeLabel(
          menu,
          `ArmyInfoV${i}`,
          '',
          { x: INFO.x + 176, y, w: INFO.w - 196, h: INFO_ROW_H - 8 },
          19,
          COLORS.text,
          { align: 'left' },
        ),
      );
    }
    for (let i = 0; i < 5; i += 1) {
      const y = CMD_Y0 + i * (CMD_H + CMD_GAP);
      this.cmdLabels.push(
        this.makeLabel(menu, `ArmyCmdLabel${i}`, '', { x: CMD_X + 22, y: y + 16, w: 400, h: 34 }, 24, COLORS.text, {
          align: 'left',
          bold: true,
        }),
      );
      this.cmdHints.push(
        this.makeLabel(
          menu,
          `ArmyCmdHint${i}`,
          '',
          { x: CMD_X + 22, y: y + 56, w: CMD_W - 150, h: 28 },
          16,
          COLORS.textFaint,
          { align: 'left' },
        ),
      );
    }
    this.footLabel = this.makeLabel(menu, 'ArmyFoot', '', FOOT, 16, COLORS.textFaint, {
      align: 'center',
      lineHeight: 22,
      wrap: true,
    });
    const closeNode = makeBtn(menu, 'plate_btn', '關 閉', CLOSE.w, CLOSE.h, { fontSize: 20, color: COLORS.textDim });
    closeNode.name = 'ArmyClose';
    placeDesign(closeNode, CLOSE.x, CLOSE.y, CLOSE.w, CLOSE.h);

    // 軍師頁
    const advisor = new Node('ArmyAdvisorSheet');
    advisor.layer = Layers.Enum.UI_2D;
    advisor.parent = root;
    advisor.addComponent(UITransform).setContentSize(SCREEN.w, SCREEN.h);
    this.advisorGroup = advisor;
    for (let i = 0; i < ADV_MAX; i += 1) {
      const y = ADV_ROW_Y0 + i * (ADV_ROW_H + ADV_ROW_GAP);
      this.advisorLabels.push(
        this.makeLabel(advisor, `ArmyAdvName${i}`, '', { x: 48, y: y + 14, w: 420, h: 34 }, 24, COLORS.text, {
          align: 'left',
          bold: true,
        }),
      );
      this.advisorSubs.push(
        this.makeLabel(advisor, `ArmyAdvSub${i}`, '', { x: 48, y: y + 52, w: 620, h: 28 }, 16, COLORS.textFaint, {
          align: 'left',
        }),
      );
    }
    this.advisorFoot = this.makeLabel(advisor, 'ArmyAdvFoot', '', ADV_FOOT, 17, COLORS.textDim, {
      align: 'center',
      wrap: true,
      lineHeight: 24,
    });
    const advBack = makeBtn(advisor, 'plate_btn', '返 回 兵 團 指 令', BACK.w, BACK.h, {
      fontSize: 22,
      color: COLORS.goldLight,
    });
    advBack.name = 'ArmyAdvisorBack';
    placeDesign(advBack, BACK.x, BACK.y, BACK.w, BACK.h);

    this.node.active = false;
  }

  open(options: ArmyMenuOptions): this {
    this.build();
    this.options = options;
    this.mode = options.mode === 'advisor' ? 'advisor' : 'menu';
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.refresh();
    if (!this.opened) {
      this.opened = true;
      input.on(Input.EventType.TOUCH_END, this.onTouch, this);
    }
    return this;
  }

  /** 存檔變了（任命軍師 / 駐紮 / 進城）→ 換一份部隊資料重畫 */
  refreshWith(army: ArmyLike, options: Partial<ArmyMenuOptions> = {}): this {
    if (!this.options) return this;
    this.options = { ...this.options, ...options, army };
    this.refresh();
    return this;
  }

  setMode(mode: 'menu' | 'advisor'): this {
    this.mode = mode === 'advisor' ? 'advisor' : 'menu';
    this.refresh();
    return this;
  }

  close(): void {
    if (this.opened) {
      this.opened = false;
      input.off(Input.EventType.TOUCH_END, this.onTouch, this);
    }
    this.node.active = false;
    this.options?.onClose?.();
  }

  onDestroy(): void {
    if (this.opened) {
      this.opened = false;
      input.off(Input.EventType.TOUCH_END, this.onTouch, this);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 畫面                                                              */
  /* ---------------------------------------------------------------- */

  private refresh(): void {
    if (!this.built || !this.options) return;
    const opts = this.options;
    const army = opts.army;
    const advisorMode = this.mode === 'advisor';
    if (this.menuGroup) this.menuGroup.active = !advisorMode;
    if (this.advisorGroup) this.advisorGroup.active = advisorMode;

    if (!advisorMode) this.refreshMenu(army, opts);
    else this.refreshAdvisor(army, opts);

    this.drawStatic(advisorMode);
    this.rebuildHits(army, opts);
  }

  private refreshMenu(army: ArmyLike, opts: ArmyMenuOptions): void {
    const rem = armyRemain(army.progress, 1 / Math.max(1, armyNum(opts.months, 1)));
    const stationed = armyIsStationed(army);
    if (this.titleLabel) this.titleLabel.string = '兵 團 指 令';
    if (this.subLabel) {
      this.subLabel.string =
        `${army.side === 'A' ? '我軍' : '敵軍'} · ${army.from} → ${army.to} · 已走 ${rem.pct}%` +
        (stationed
          ? ' · 駐紮中：進度凍結，擋住這條道'
          : rem.months > 0
            ? ` · 剩 ${rem.months} 個月（約 ${rem.days} 天）`
            : ' · 本月到城下');
    }
    const rows = armyInfoRows(army, {
      gold: armyNum(opts.gold, 0),
      months: armyNum(opts.months, 1),
      levelOf: opts.levelOf,
      wiseSeqOf: opts.wiseSeqOf,
      wiseHintOf: opts.wiseHintOf,
    });
    for (let i = 0; i < 7; i += 1) {
      const row = rows[i] ?? ['', ''];
      if (this.infoKeys[i]) this.infoKeys[i].string = row[0];
      if (this.infoValues[i]) {
        this.infoValues[i].string = row[1];
        this.infoValues[i].color = armyColor(i === 6 && stationed ? COLORS.goldLight : COLORS.text);
      }
    }
    const cmds = armyCmdRows(army, opts.isMine);
    for (let i = 0; i < 5; i += 1) {
      const cmd = cmds[i];
      const label = this.cmdLabels[i];
      const hint = this.cmdHints[i];
      if (!cmd) {
        if (label) label.node.active = false;
        if (hint) hint.node.active = false;
        continue;
      }
      if (label) {
        label.node.active = true;
        label.string = cmd.label;
        label.color = armyColor(cmd.enabled ? (cmd.primary ? COLORS.goldLight : COLORS.text) : COLORS.textFaint);
      }
      if (hint) {
        hint.node.active = true;
        hint.string = cmd.hint;
        hint.color = armyColor(cmd.enabled ? COLORS.textDim : COLORS.textFaint);
      }
    }
    if (this.footLabel) {
      this.footLabel.string =
        `${Math.round(armyNum(army.troops, 0))} 兵 · ${army.from} → ${army.to} · ${armyNum(opts.months, 1)} 個月路程` +
        (stationed ? ' · 駐紮中：敵軍沿這條道來會被擋在接觸點' : '') +
        ' · 點地圖其他部隊可切換';
    }
  }

  private refreshAdvisor(army: ArmyLike, opts: ArmyMenuOptions): void {
    const officers = armyOfficerList(army);
    const current = armyAdvisorOf(army);
    if (this.titleLabel) this.titleLabel.string = '任 命 軍 師';
    if (this.subLabel) {
      this.subLabel.string =
        `${army.from} → ${army.to} · 隨軍 ${officers.length} 人 · 現任 ${current || '未任命'}` +
        (officers.length < 2 ? '\n軍團僅主將一人，無可任命' : '\n點一張卡即任命，或點「不設軍師」免職');
    }
    const rows: { text: string; sub: string; enabled: boolean }[] = [];
    if (officers.length >= 2) {
      rows.push({ text: '不 設 軍 師', sub: current ? '卸下軍師一職' : '目前未任命', enabled: true });
    }
    for (const name of officers) {
      const isLeader = name === (army.general ?? '');
      const isCurrent = name === current;
      rows.push({
        text: `${name}${isLeader ? '  ·  主將' : ''}${isCurrent ? '  ·  現任' : ''}`,
        sub: isCurrent ? '點此免職／改派別人' : isLeader ? '主將兼軍師（不另任命）' : '任命為本兵團軍師',
        enabled: officers.length >= 2,
      });
    }
    for (let i = 0; i < ADV_MAX; i += 1) {
      const row = rows[i];
      const label = this.advisorLabels[i];
      const sub = this.advisorSubs[i];
      if (!row) {
        if (label) label.node.active = false;
        if (sub) sub.node.active = false;
        continue;
      }
      if (label) {
        label.node.active = true;
        label.string = row.text;
        label.color = armyColor(row.enabled ? COLORS.text : COLORS.textFaint);
      }
      if (sub) {
        sub.node.active = true;
        sub.string = row.sub;
      }
    }
    if (this.advisorFoot) {
      this.advisorFoot.string =
        officers.length < 2
          ? '軍團僅主將一人，無可任命'
          : `現任軍師：${current || '未任命'} · 點別張卡即更換 · 軍師技於開戰時發動`;
    }
  }

  private drawStatic(advisorMode: boolean): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    this.paint(FRAME, '#0B0E13', 245);
    this.paint({ x: FRAME.x, y: FRAME.y, w: FRAME.w, h: 132 }, '#10151C', 255);
    this.line(FRAME.x, FRAME.y + 132, FRAME.x + FRAME.w, FRAME.y + 132, COLORS.gold, 120);
    if (advisorMode) {
      // 卡片底
      const rows = this.advisorLabels.filter((label) => label.node.active).length;
      for (let i = 0; i < rows; i += 1) {
        const y = ADV_ROW_Y0 + i * (ADV_ROW_H + ADV_ROW_GAP);
        this.paint({ x: 24, y, w: 702, h: ADV_ROW_H }, '#121821', 240);
        this.line(24, y + ADV_ROW_H, 726, y + ADV_ROW_H, COLORS.line, 120);
      }
      this.line(24, ADV_FOOT.y - 8, 726, ADV_FOOT.y - 8, COLORS.line, 160);
      return;
    }
    // 軍情框
    this.paint({ x: INFO.x, y: INFO.y, w: INFO.w, h: INFO.h }, '#0E131A', 236);
    this.line(INFO.x, INFO.y, INFO.x + INFO.w, INFO.y, COLORS.gold, 70);
    for (let i = 0; i < 7; i += 1) {
      const y = INFO.y + 12 + i * INFO_ROW_H;
      if (i % 2 === 0) this.paint({ x: INFO.x + 6, y: y - 4, w: INFO.w - 12, h: INFO_ROW_H - 4 }, '#151B24', 190);
    }
    // 5 項指令底：可點＝金屬片，灰＝壓暗（與 web 的 disabled 按鈕同語義）
    const army = this.options?.army;
    const cmds = army ? armyCmdRows(army, this.options!.isMine) : [];
    for (let i = 0; i < cmds.length; i += 1) {
      const y = CMD_Y0 + i * (CMD_H + CMD_GAP);
      const cmd = cmds[i];
      this.paint({ x: CMD_X, y, w: CMD_W, h: CMD_H }, cmd.enabled ? '#1B2330' : '#10151C', cmd.enabled ? 250 : 220);
      this.paint({ x: CMD_X, y, w: 4, h: CMD_H }, cmd.enabled ? COLORS.gold : COLORS.line, cmd.enabled ? 210 : 140);
      this.line(CMD_X, y, CMD_X + CMD_W, y, COLORS.line, 150);
      this.line(CMD_X, y + CMD_H, CMD_X + CMD_W, y + CMD_H, COLORS.line, 90);
    }
    this.line(24, FOOT.y - 6, 726, FOOT.y - 6, COLORS.line, 160);
  }

  private rebuildHits(army: ArmyLike, opts: ArmyMenuOptions): void {
    const hits: Hit[] = [];
    for (let i = 0; i < 5; i += 1) {
      const y = CMD_Y0 + i * (CMD_H + CMD_GAP);
      hits.push({
        name: `cmd:${i}`,
        rect: { x: CMD_X, y, w: CMD_W, h: CMD_H },
        act: () => this.fireCmd(i, army, opts),
      });
    }
    if (this.mode === 'advisor') {
      const officers = armyOfficerList(army);
      const usable = officers.length >= 2;
      const rows = usable ? officers.length + 1 : 0;
      for (let i = 0; i < rows; i += 1) {
        const y = ADV_ROW_Y0 + i * (ADV_ROW_H + ADV_ROW_GAP);
        hits.push({
          name: `advisor:${i}`,
          rect: { x: 24, y, w: 702, h: ADV_ROW_H },
          act: () => {
            if (!usable) return;
            const name = i === 0 ? '' : (officers[i - 1] ?? '');
            opts.onAdvisor?.(name, army);
          },
        });
      }
      hits.push({ name: 'advisor:back', rect: BACK, act: () => this.setMode('menu') });
    }
    hits.push({ name: 'close', rect: CLOSE, act: () => this.close() });
    hits.push({ name: 'back', rect: BACK, act: () => (this.mode === 'advisor' ? this.setMode('menu') : this.close()) });
    this.hits = hits;
  }

  private fireCmd(index: number, army: ArmyLike, opts: ArmyMenuOptions): void {
    const cmds = armyCmdRows(army, opts.isMine);
    const cmd = cmds[index];
    if (!cmd || !cmd.enabled) return;
    if (cmd.act === 'advisor') {
      this.setMode('advisor');
      return;
    }
    opts.onCommand?.(cmd.act, army);
  }

  /* ---------------------------------------------------------------- */
  /* 輸入                                                              */
  /* ---------------------------------------------------------------- */

  tap(x: number, y: number): boolean {
    for (const hit of this.hits) {
      const r = hit.rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        hit.act();
        return true;
      }
    }
    return false;
  }

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    const ui = event.getUILocation();
    const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    this.tap(local.x + HALF_W, HALF_H - local.y);
  }

  /* ---------------------------------------------------------------- */
  /* 除錯                                                              */
  /* ---------------------------------------------------------------- */

  debug(): ArmyMenuDebug {
    const army = this.options?.army;
    const cmds = army ? armyCmdRows(army, this.options!.isMine) : [];
    return {
      opened: this.opened,
      mode: this.mode,
      armyId: army?.id ?? '',
      title: this.titleLabel?.string ?? '',
      sub: this.subLabel?.string ?? '',
      infoKeys: this.infoKeys.map((label) => label.string),
      infoValues: this.infoValues.map((label) => label.string),
      cmds: cmds.map((cmd) => ({ act: cmd.act, label: cmd.label, hint: cmd.hint, enabled: cmd.enabled })),
      foot: this.footLabel?.string ?? '',
      advisorRows: this.advisorLabels
        .filter((label) => label.node.active)
        .map((label, i) => ({ text: label.string, enabled: this.advisorSubs[i]?.node.active === true })),
      hitNames: this.hits.map((hit) => hit.name),
      nodeCount: countNodes(this.node),
    };
  }

  /* ---------------------------------------------------------------- */
  /* 私有：Graphics / Label                                            */
  /* ---------------------------------------------------------------- */

  private paint(rect: Rect, color: string, alpha: number): void {
    const g = this.g;
    if (!g) return;
    g.fillColor = armyColor(color, alpha);
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.fill();
  }

  private line(x1: number, y1: number, x2: number, y2: number, color: string, alpha: number): void {
    const g = this.g;
    if (!g) return;
    g.strokeColor = armyColor(color, alpha);
    g.lineWidth = 1;
    g.moveTo(x1 - HALF_W, HALF_H - y1);
    g.lineTo(x2 - HALF_W, HALF_H - y2);
    g.stroke();
  }

  private makeLabel(
    parent: Node,
    name: string,
    text: string,
    rect: Rect,
    fontSize: number,
    color: string,
    opts: { align?: Align; bold?: boolean; lineHeight?: number; wrap?: boolean } = {},
  ): Label {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = parent;
    const transform = node.addComponent(UITransform);
    transform.setContentSize(rect.w, rect.h);
    node.setPosition(rect.x + rect.w / 2 - HALF_W, HALF_H - (rect.y + rect.h / 2));
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = fontSize;
    label.lineHeight = opts.lineHeight ?? Math.round(fontSize * 1.42);
    label.color = armyColor(color);
    label.horizontalAlign =
      opts.align === 'left'
        ? Label.HorizontalAlign.LEFT
        : opts.align === 'right'
          ? Label.HorizontalAlign.RIGHT
          : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = opts.wrap ? Label.Overflow.RESIZE_HEIGHT : Label.Overflow.SHRINK;
    label.enableWrapText = opts.wrap === true;
    label.isBold = opts.bold === true;
    return label;
  }
}
