/**
 * 開局流程的**純邏輯**（劇本卡 / 君主列表 / 分頁），不碰 `cc`、不碰節點。
 *
 * 為什麼要單獨一層：`TitlePanel` / `ScenarioSelect` 的排版可以在 headless 裡
 * 用 mock `cc` 驗，但「5 套劇本各有幾家勢力、每家幾座城、開局三城叫什麼」
 * 這些是資料事實，跟節點樹無關。抽在這裡之後，`work/cocos_select/model_assert.mjs`
 * 可以直接 require 編譯產物做 40+ 條斷言，不必先造場景。
 *
 * 資料形狀見 `types.ts`：`Scenario.cities` 在型別上是 `unknown[]`，實際每項是
 * `{NAME,KING,MAJOR,POPULATION,DEFENSE,MONEY,POS,...}`（`data/scenarios.json`）。
 * 這裡只認 `NAME` / `KING` 兩個欄位，其餘一律不碰。
 *
 * 兩個資料坑（報告 `project/125_Cocos开局流程.md` 有統計）：
 *  1. 劇本 1 有 12 座城的 `KING` 是轉換殘留的純數字 `"1".."12"`，必須濾掉，
 *     否則君主列表會多出 12 個假勢力；
 *  2. `cities[].KING` 去重後是 14/18/8/8/5 家，而 `kings[]`（= `system.TotalKing`）
 *     是 15/19/9/9/6 家 —— 差的那家是「盜賊」，名下 0 城。列表按「城池歸屬優先、
 *     kings[] 補 0 城勢力」取並集，長度才等於 TotalKing。
 */
import type { GameData, Scenario } from './types';

/** 君主列表一頁幾行（750×1334 下 8 行 × 108px 剛好不壓到底部按鈕） */
export const FORCE_PAGE_SIZE = 8;
/** 劇本卡「開局三城」固定取前 3 座（與 web `newCampaign` / `GameState.initCampaign` 同口徑） */
export const OPENING_CITY_COUNT = 3;

/** `data/scenarios.json` 裡 `cities[]` 的實際形狀（只列本模組會讀的欄位） */
export interface ScenarioCity {
  NAME?: unknown;
  KING?: unknown;
  POPULATION?: unknown;
  DEFENSE?: unknown;
  MONEY?: unknown;
}

/** 劇本卡的顯示資料 */
export interface ScenarioCard {
  /** 在 `data.scenarios` 的下標（0 起），也就是 `RunSetup.scenarioIndex` */
  index: number;
  /** 原作劇本 id（`scenario.id`，1 起） */
  id: number;
  name: string;
  year: number;
  /** 勢力數（= 城池歸屬 ∪ kings[]，等於 `system.TotalKing`） */
  forceCount: number;
  cityCount: number;
  pathCount: number;
  /** 開局三城（`cities.slice(0, 3)` 的 NAME，含空城） */
  opening: string[];
}

/** 君主列表的一行 */
export interface ForceRow {
  name: string;
  /** 名下城池（按劇本城池順序） */
  cities: string[];
  cityCount: number;
  /** 有城才能選；kings[] 獨有的 0 城勢力（盜賊）列出來但不可選 */
  selectable: boolean;
  flag: number;
}

/** 把 unknown 收成去空白的字串；數字轉字串（`KING` 髒值要靠它先攤平） */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** 把 unknown 收成整數；壞值回 `fallback` */
export function intOf(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number.parseInt(textOf(value), 10);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** 安全取 `scenario.cities`（型別是 `unknown[]`） */
export function scenarioCities(scenario: Scenario | null | undefined): ScenarioCity[] {
  if (!scenario || !Array.isArray(scenario.cities)) return [];
  return scenario.cities as ScenarioCity[];
}

/** 劇本名：`system.TIME`（原作 INI 的劇本名），缺了退回「劇本N」 */
export function scenarioName(scenario: Scenario | null | undefined, index = 0): string {
  const system = (scenario?.system ?? {}) as Record<string, unknown>;
  return textOf(system['TIME']) || `劇本${index + 1}`;
}

/** 劇本年份：`system.YEAR`，缺了退回 184（劇本 1） */
export function scenarioYear(scenario: Scenario | null | undefined): number {
  const system = (scenario?.system ?? {}) as Record<string, unknown>;
  return intOf(system['YEAR'], 184);
}

/** 城池名（空城也可能沒有 NAME —— 一律回空串，呼叫端自己 filter） */
export function cityName(city: ScenarioCity | null | undefined): string {
  return textOf(city?.NAME);
}

/**
 * 這個 `KING` 值算不算一個勢力名。
 * 空字串 = 空城；純數字 = 劇本 1 的轉換殘留（`"1".."12"`），兩者都不算。
 */
export function isKingName(value: unknown): boolean {
  const name = textOf(value);
  if (!name) return false;
  return !/^[0-9]+$/.test(name);
}

/** 開局三城的名字（含空城；不足 3 座就給幾座） */
export function openingCityNames(
  scenario: Scenario | null | undefined,
  count = OPENING_CITY_COUNT,
): string[] {
  return scenarioCities(scenario)
    .slice(0, Math.max(0, count))
    .map(cityName)
    .filter((name) => name.length > 0);
}

/**
 * 某劇本的君主列表。
 *
 * 順序：城池 `KING` **首次出現**的順序（第一個有主的城 = 預設君主），
 * 再接 `kings[]` 裡沒在城池中出現的勢力（盜賊，0 城、不可選）。
 */
export function scenarioForces(scenario: Scenario | null | undefined): ForceRow[] {
  const order: string[] = [];
  const byName = new Map<string, ForceRow>();

  for (const city of scenarioCities(scenario)) {
    const king = textOf(city.KING);
    if (!isKingName(king)) continue;
    let row = byName.get(king);
    if (!row) {
      row = { name: king, cities: [], cityCount: 0, selectable: false, flag: 0 };
      byName.set(king, row);
      order.push(king);
    }
    const name = cityName(city);
    if (name) row.cities.push(name);
  }

  const kings = scenario && Array.isArray(scenario.kings) ? scenario.kings : [];
  for (const king of kings) {
    const name = textOf(king?.NAME);
    if (!name || byName.has(name)) continue;
    byName.set(name, {
      name,
      cities: [],
      cityCount: 0,
      selectable: false,
      flag: intOf(king?.FLAGNUM, 0),
    });
    order.push(name);
  }

  const rows: ForceRow[] = [];
  for (const name of order) {
    const row = byName.get(name);
    if (!row) continue;
    row.cityCount = row.cities.length;
    row.selectable = row.cityCount > 0;
    rows.push(row);
  }
  return rows;
}

/** 預設君主 = 列表裡第一個有城的勢力（劇本 1 = 公孫瓚） */
export function defaultForceName(scenario: Scenario | null | undefined): string {
  const row = scenarioForces(scenario).find((force) => force.selectable);
  return row ? row.name : '';
}

/** 單張劇本卡 */
export function scenarioCard(scenario: Scenario | null | undefined, index: number): ScenarioCard {
  const cities = scenarioCities(scenario);
  return {
    index,
    id: intOf(scenario?.id, index + 1),
    name: scenarioName(scenario, index),
    year: scenarioYear(scenario),
    forceCount: scenarioForces(scenario).length,
    cityCount: cities.length,
    pathCount: scenario && Array.isArray(scenario.paths) ? scenario.paths.length : 0,
    opening: openingCityNames(scenario),
  };
}

/** 5 張劇本卡（`data` 缺失時回空陣列 —— 面板要能降級，不許崩） */
export function scenarioCards(data: GameData | null | undefined): ScenarioCard[] {
  if (!data || !Array.isArray(data.scenarios)) return [];
  return data.scenarios.map((scenario, index) => scenarioCard(scenario, index));
}

/** 存檔載入後用劇本**名**反查下標（`SlotMeta.scenario` 存的是名字，不是 id） */
export function matchScenarioIndex(data: GameData | null | undefined, name: string): number {
  const target = textOf(name);
  if (!target || !data || !Array.isArray(data.scenarios)) return -1;
  for (let i = 0; i < data.scenarios.length; i += 1) {
    if (scenarioName(data.scenarios[i], i) === target) return i;
  }
  return -1;
}

/** 總頁數（至少 1 頁，避免空列表顯示「0/0」） */
export function pageCount(total: number, per = FORCE_PAGE_SIZE): number {
  const size = Math.max(1, Math.trunc(per));
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** 把頁碼夾進合法範圍 */
export function clampPage(page: number, total: number, per = FORCE_PAGE_SIZE): number {
  return Math.max(0, Math.min(pageCount(total, per) - 1, Math.trunc(page) || 0));
}

/** 取某一頁的切片 */
export function pageSlice<T>(rows: T[], page: number, per = FORCE_PAGE_SIZE): T[] {
  const size = Math.max(1, Math.trunc(per));
  const at = clampPage(page, rows.length, size);
  return rows.slice(at * size, at * size + size);
}
