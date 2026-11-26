/**
 * advance_month.ts — 「一個月的推進」的 core 單源（F-03 / F-04 / F-14）。
 *
 * 背景（work/parity_sweep/REPORT.md）：
 *   · F-03 Cocos 的 `autonomyTick` 唯一呼叫點是 `CityPanel.ts:691`（只有開內政頁才跑），
 *     web 是每月在 `campaign.html` 的 `advanceMonth()` 裏跑 ⇒ 兩端每月推進都要跑「自治代行 + 金→預備兵」。
 *   · F-04 `GameState.ts:854-862` 還在給所有劇本站城白補守軍 2%，web 已刪 ⇒ 月流水不再碰城兵。
 *   · F-14 Cocos 沒有年度結算 / ledger / 補學，web 有 `annualYearRollover()` + `monthlyLearn()` + saves.js 的
 *     `annualSettle()` ⇒ 收進 core，兩端共用。
 *
 * 純函數邊界：**不 import 瀏覽器 / Cocos / node 的東西**，只認一個「存檔樣子的物件」+ 上下文；
 * 隨機性、AI 行軍、戰報 UI 都留在各自頁面（`advanceOneMonth` 只做時間軸與內政結算）。
 *
 * 流水線順序（＝ web `campaign.html:5389-5558` 的逐月循環體，逐段照抄）：
 *   1. 月推進：`month += 1`、清月令鎖（`lastActionMonth = 0`，＝ `CM.clearMonthLock`）。
 *   2. 年度結算（僅正月）：`yearFlag = 1` → `annualSettle`（saves.js 五段鉤子）→ 失敗回 0；
 *      成功把結算戰報一行推進 logs。
 *   3. 年稅（僅正月）：`save.owned` 逐城 `annualTax(pop) = pop×75/10000 + 2250` 進該城 `money`，
 *      跳過關城（`RATE===0 || POPULATION===0`）；有收入才寫「歲 入」一行。
 *   4. 帳本：`ledgerAdd({ income, months: 1 })`（每月都記；錢不進單一錢包，F16）。
 *   5. 自治代行：`ctx.civic` 適配器（web = `CM.autonomyTick`，Cocos = CityPanel 註冊的
 *      mergeSave→autonomyTick→persist 回調）；沒有適配器但存檔裏本來就有 `prep` 欄位時，
 *      core 只做「金→預備兵」保底（100 金 = 1 兵，同 `city_model.js prepFromMoney`）；
 *      兩者都沒有就標 `civic.mode = 'skipped'`（不靜默）。
 *   6. 疲勞 / 士氣漂移：`tireMonthly` → `moraleMonthly`（＝ campaign.html [[FATIGUE_CORE]] /
 *      [[MORALE_CORE]] 的同式移植；那兩塊被 tests/fatigue.test.ts、tests/morale.test.ts 跨檔鎖住，
 *      所以 core 這份必須與之逐行同值）。
 *   7. 月末補學：`monthlyLearn`（core/unlock.ts 的 `monthlyLearnCheck`），寫回 `save.learned`。
 *
 * 明確**不在** core 的（頁面各自保留）：
 *   · R65 忠誠漂移（`AI.monthlyDrift` + `MM.recordDrift`，網頁版需要 ai_model/monarch_model）；
 *   · 行軍 / AI 月 / 守城戰 / 征地 / 存檔（各端自己的引擎部分）；
 *   · 年度「勢力存亡復核」只讀巡檢（web `annualForceCheck()`，依賴 forceCities）。
 */

import type { GameData } from '../types';
import { createLearnState, monthlyLearnCheck } from './unlock';
import type { PendingLearn } from './unlock';

/** 一年 12 個月（`saves.js YEAR_MONTHS`）。 */
export const YEAR_MONTHS = 12;

/** 疲勞上限 / 高疲勞門檻（原作 0x41B34E cmp 0x3c，campaign.html [[FATIGUE_CORE]]）。 */
export const TIRE_MAX = 100;
export const TIRE_HIGH = 60;

/** 士氣上下限 / 低迷門檻 / 戰敗扣點（campaign.html [[MORALE_CORE]]）。 */
export const MORALE_MAX = 100;
export const MORALE_DEFAULT = 60;
export const MORALE_TIRE_HIGH = 60;
export const MORALE_LOW = 30;
export const MORALE_DEFEAT_LOSS = 10;

/** 錢 → 預備兵匯率：100 金 = 1 預備兵（原作「城裏每 100 金錢 = 1 預備兵」，city_model.js PREP_PER_GOLD）。 */
export const PREP_PER_GOLD = 100;

/** 年稅係數（原作 0x423824：`pop×75/10000 + 2250`，city_model.js TAX）。 */
export const TAX_POP_NUM = 75;
export const TAX_POP_DEN = 10000;
export const TAX_FLAT = 2250;

/** 城防規模：`min(pop/2500 + 110, 600)`（city_model.js RECRUIT）。 */
export const GARRISON_POP_DIV = 2500;
export const GARRISON_BASE = 110;
export const GARRISON_CAP = 600;

// ---------------------------------------------------------------- 型別（最小介面：不 import 頁面/Cocos 型別）

/** 劇本里的城的「靜態定義」（campaign.html 的 `ALL` / scenarios.json 的城市項 / Cocos `CampaignCity`）。 */
export interface MonthCityDef {
  NAME?: string;
  POPULATION?: unknown;
  DEFENSE?: unknown;
  MONEY?: unknown;
  RATE?: unknown;
}

/** 存檔裏的城的「動態狀態」（web `save.cities[name]` / Cocos `CityRuntime`）。 */
export interface MonthCityState {
  troops?: number;
  pop?: number;
  money?: number;
  /** 城防值（內政「開發」加的那個，不是兵）。 */
  def?: number;
  /** 預備兵（錢變兵的目的地；web `save.cities[name].prep`）。 */
  prep?: number;
  /** 士氣（**城池級**只用於舊檔遷移；武將級士氣在 `save.morale`）。 */
  morale?: number;
  cityMorale?: number;
  owner?: string;
  major?: string;
  officers?: readonly unknown[];
}

/** 年度帳本（`saves.js ledgerOf` 的形狀）。 */
export interface MonthLedger {
  year?: number;
  months?: number;
  income?: number;
  salary?: number;
}

/** 年度結算的一段（`saves.js YEAR_STAGES`）。 */
export interface MonthYearStage {
  id: string;
  key: string;
  label: string;
  evidence: string;
  gate?: string;
  delegated?: string;
}

/** 年度結算記錄（`saves.js annualSettle` 寫進 `save.annual` 的那一筆）。 */
export interface MonthAnnualRecord {
  v: number;
  year: number;
  intoYear: number;
  at: number;
  months: number;
  income: number;
  salary: number;
  cities: number;
  pop: number;
  officers: number;
  wins: number;
  losses: number;
  defWins: number;
  gold: number;
  stages: MonthYearStage[];
  text: string;
}

/** `annualSettle` 的返回（與 saves.js 逐欄一致）。 */
export interface MonthAnnualResult {
  ok: boolean;
  reason?: string;
  month: number;
  year: number;
  closed: number;
  record: MonthAnnualRecord | null;
  text: string;
}

/** 存檔裏「已學武將技/軍師技」的一筆（`save.learned[name]`）。 */
export interface MonthKnownLearns {
  magic?: readonly number[];
  wise?: readonly number[];
}

/** core 認得的存檔欄位（＝ web campaign 存檔 / Cocos `CampaignSave` 的交集；其餘鍵一律不管）。 */
export interface MonthSaveLike {
  month?: number;
  year?: number;
  yearFlag?: number;
  owned?: readonly string[];
  cities?: Record<string, MonthCityState>;
  gold?: number;
  goldMigrated?: boolean;
  wins?: number;
  losses?: number;
  defWins?: number;
  tire?: Record<string, number>;
  morale?: Record<string, number>;
  ledger?: MonthLedger;
  annual?: MonthAnnualRecord | null;
  learned?: Record<string, MonthKnownLearns>;
  roster?: Record<string, unknown>;
  lastActionMonth?: number;
  generalLevel?: Record<string, number>;
  /** 只讀：年度「勢力存亡復核」在頁面層做（`annualForceCheck`），core 不碰。 */
  forces?: Record<string, unknown>;
}

/** 自治代行適配器的返回形狀（web `CM.autonomyTick` / Cocos CityPanel 註冊回調）。 */
export interface MonthCivicAuto {
  ok?: boolean;
  text?: string;
}

/** 錢→預備兵的單城結果（同 `city_model.js prepFromMoney` 的返回欄位）。 */
export interface MonthPrepRefill {
  city: string;
  n: number;
  cost: number;
  prep: number;
  cap: number;
}

/** 自治代行適配器的返回：只認 `refilled` / `auto` / `text`，其餘欄位原樣忽略。 */
export interface MonthCivicOutcome {
  refilled?: readonly MonthPrepRefill[] | number;
  auto?: MonthCivicAuto | null;
  text?: string;
}

/** 自治代行：由各端註冊（web 傳 `CM.autonomyTick`；Cocos 由 CityPanel 註冊）。 */
export type MonthCivicTick = (state: MonthSaveLike, ctx: MonthContext) => MonthCivicOutcome | null | undefined;

/** `advanceOneMonth` 的上下文（各端把「自己那份數據」用最小介面餵進來）。 */
export interface MonthContext {
  /** 劇本城定義（年稅要判關城、要拿人口上限）；缺省時年稅不跳關城。 */
  cityDefs?: readonly MonthCityDef[] | null;
  /** 武將/物品/軍師數據（月末補學要 `generals.json` 的 SKILL/WISESKILL 表）；缺省時補學跳過。 */
  data?: GameData | null;
  /** 自治代行適配器；缺省時走 core 的「金→預備兵」保底（再沒有就 skipped）。 */
  civic?: MonthCivicTick | null;
  /** 各城在職武將（web 用 garrison.json 的守將；缺省時從 `state.cities[*].officers` 取）。 */
  officersByCity?: Record<string, readonly string[]> | null;
  /** 武將等級取值器（web `generalLevelOf`）；缺省用 `save.generalLevel[name]` 或 1。 */
  levelOf?: ((name: string) => number) | null;
  /** 結算時刻（`annualSettle` 記錄用）；**預設 0 保持可重放**，頁面傳 `Date.now()`。 */
  ts?: number;
}

/** 疲勞段回報。 */
export interface MonthFatigueReport {
  decayed: number;
  high: number;
  moraleLoss: number;
  moraleSkipped: number;
}

/** 士氣段回報。 */
export interface MonthMoraleReport {
  high: number;
  loss: number;
  recovered: number;
}

/** 自治代行段回報。 */
export interface MonthCivicReport {
  mode: 'adapter' | 'builtin' | 'skipped';
  ok: boolean;
  text: string;
  /** 本月真的有幾座城做了「金→預備兵」。 */
  refilled: number;
  refills: MonthPrepRefill[];
  /** 'skipped' 的人話理由（給 UI 對帳；不影響流程）。 */
  note: string;
}

/** 補學段回報（同 campaign.html `monthlyLearn()` 的返回）。 */
export interface MonthLearnedEntry {
  name: string;
  got: PendingLearn[];
}

/** 一個月推進的完整結果（頁面拿去寫戰報 / Cocos 拿去顯示）。 */
export interface MonthReport {
  month: number;
  year: number;
  yearStart: boolean;
  income: number;
  ledger: MonthLedger;
  annual: MonthAnnualResult | null;
  civic: MonthCivicReport;
  fatigue: MonthFatigueReport;
  morale: MonthMoraleReport;
  learned: MonthLearnedEntry[];
  /** 本月產生的戰報行（已按 web `pushLog` 的順序排好；頁面逐行 pushLog 即可）。 */
  logs: string[];
}

// ---------------------------------------------------------------- 小工具（與 saves.js 的 num/intOr 同義）

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** `Number(x)` 有限才算數，否則 0（`saves.js num`）。 */
export function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 截斷成整數（`saves.js` 的 `Math.trunc(num())` 口徑）。 */
export function int(value: unknown): number {
  return Math.trunc(num(value));
}

/** 非負整數（負值/NaN → 0）。 */
function positive(value: unknown): number {
  const n = int(value);
  return n > 0 ? n : 0;
}

/** 我方城名清單（去空/去重，保序；`save.owned` 可能帶髒值）。 */
export function ownedNames(state: MonthSaveLike): string[] {
  const out: string[] = [];
  const owned = state.owned;
  if (!Array.isArray(owned)) return out;
  for (const name of owned) {
    if (typeof name !== 'string' || !name) continue;
    if (out.includes(name)) continue;
    out.push(name);
  }
  return out;
}

// ---------------------------------------------------------------- 年度軸（＝ saves.js 的同名函數）

/** 絕對月數 → 年（1 起）。 */
export function yearOf(month: unknown): number {
  const m = Math.max(1, int(month) || 1);
  return Math.floor((m - 1) / YEAR_MONTHS) + 1;
}

/** 絕對月數 → 年內月份 1..12。 */
export function monthOfYear(month: unknown): number {
  const m = Math.max(1, int(month) || 1);
  return ((m - 1) % YEAR_MONTHS) + 1;
}

/** 正月（年內 1 月）= 年度結算觸發月（原作 0x4238AF）。 */
export function isYearStart(month: unknown): boolean {
  return monthOfYear(month) === 1;
}

/** 老檔遷移：`year` 缺失/過時按 `month` 補（冪等，只補不改別的鍵）。 */
export function ensureYear(state: MonthSaveLike): number {
  const y = yearOf(state.month);
  if (num(state.year) !== y) state.year = y;
  return y;
}

/** 年稅：`pop×75/10000 + 2250`（原作 0x423824；city_model.js `annualTax`）。 */
export function annualTax(pop: unknown): number {
  const p = Math.max(0, int(pop));
  return Math.floor((p * TAX_POP_NUM) / TAX_POP_DEN) + TAX_FLAT;
}

/** 守軍規模上限：`min(pop/2500 + 110, 600)`（city_model.js `troopCapOf`；F-04 只用到上限，不再白補）。 */
export function troopCapOf(pop: unknown): number {
  const p = Math.max(0, int(pop));
  return Math.min(Math.floor(p / GARRISON_POP_DIV) + GARRISON_BASE, GARRISON_CAP);
}

/** 關城：`RATE===0 || POPULATION===0`（city_model.js `isGate`）。 */
export function isGateDef(def: MonthCityDef | null | undefined): boolean {
  if (!def) return false;
  return num(def.RATE) === 0 || num(def.POPULATION) === 0;
}

/** 當年帳本：跨年/老檔自動重建，三鍵夾非負整數（`saves.js ledgerOf`）。 */
export function ledgerOf(state: MonthSaveLike): MonthLedger {
  const year = ensureYear(state);
  const cur = isRecord(state.ledger) ? state.ledger : null;
  if (!cur || num(cur.year) !== year) state.ledger = { year, months: 0, income: 0, salary: 0 };
  const ledger = state.ledger as MonthLedger;
  ledger.months = positive(ledger.months);
  ledger.income = positive(ledger.income);
  ledger.salary = positive(ledger.salary);
  ledger.year = year;
  return ledger;
}

/** 月推進裏累計（只加正值，不倒扣）。 */
export function ledgerAdd(state: MonthSaveLike, patch: MonthLedger = {}): MonthLedger {
  const ledger = ledgerOf(state);
  ledger.months = positive(ledger.months) + positive(patch.months);
  ledger.income = positive(ledger.income) + positive(patch.income);
  ledger.salary = positive(ledger.salary) + positive(patch.salary);
  return ledger;
}

/** 年度結算 5 段（順序 = 原作 0x423885 的 call 順序，逐字對齊 saves.js）。 */
export const YEAR_STAGES: readonly MonthYearStage[] = [
  { id: '0x423681', key: 'ledger', label: '年度總賬', evidence: '[推測]' },
  { id: '0x423765', key: 'cities', label: '城池巡查', evidence: '[推測]' },
  { id: '0x42379E', key: 'officers', label: '武將名冊', evidence: '[推測]' },
  { id: '0x4237A6', key: 'record', label: '年度戰績', evidence: '[推測]' },
  {
    id: '0x423824',
    key: 'sweep',
    label: '年稅結算（逐城 pop×75/10000+2250）',
    evidence: '[確認]',
    gate: '0x4A6444',
    delegated: 'core/advance_month.ts:annualSettle',
  },
];

/** 年度結算戰報一行（與 saves.js `annualText` 同一串）。 */
export function annualText(rec: Partial<MonthAnnualRecord> | null | undefined): string {
  const r = isRecord(rec) ? rec : {};
  const y = Math.max(1, int(r.year) || 1);
  const months = Math.max(0, int(r.months));
  let tail = '';
  if (months > 0 && months < YEAR_MONTHS) tail = `（賬本 ${months}/${YEAR_MONTHS} 月）`;
  return `${y}年 年 度 結 算：歲入 ${int(r.income)} 金`
    + ` · 城 ${int(r.cities)} · 將 ${int(r.officers)}`
    + ` · 戰績 ${int(r.wins)} 勝 ${int(r.losses)} 敗${tail}`;
}

/** 補學需要「每城在職武將」：從存檔的城市狀態自己拼（Cocos 走這條；web 由頁面傳 garrison 名單）。 */
export function officersByCityOf(state: MonthSaveLike): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const cities = state.cities;
  if (!cities) return out;
  for (const name of ownedNames(state)) {
    const city = cities[name];
    if (!city || !Array.isArray(city.officers)) {
      out[name] = [];
      continue;
    }
    const names: string[] = [];
    for (const officer of city.officers) {
      if (typeof officer === 'string') {
        if (officer) names.push(officer);
        continue;
      }
      if (isRecord(officer) && typeof officer.name === 'string' && officer.name) names.push(officer.name);
    }
    out[name] = names;
  }
  return out;
}

/** 存檔裏有沒有「預備兵」欄位：有 ⇒ core 可做金→預備兵保底；沒有（Cocos 現行存檔）⇒ civic 只能 skipped。 */
export function hasPrepableCity(state: MonthSaveLike): boolean {
  const cities = state.cities;
  if (!cities) return false;
  for (const city of Object.values(cities)) {
    if (city && Number.isFinite(Number(city.prep))) return true;
  }
  return false;
}

/** 金 → 預備兵保底：逐城 `n = min(floor(金/100), 上限-現值)`，金 −n×100、預備兵 +n（同 prepFromMoney）。 */
export function prepFromMoneyAll(state: MonthSaveLike): MonthPrepRefill[] {
  const out: MonthPrepRefill[] = [];
  const cities = state.cities;
  if (!cities) return out;
  for (const [name, city] of Object.entries(cities)) {
    if (!city) continue;
    const prepRaw = Number(city.prep);
    if (!Number.isFinite(prepRaw)) continue;
    const prep = Math.max(0, Math.trunc(prepRaw));
    const cap = troopCapOf(city.pop);
    const room = Math.max(0, cap - prep);
    const money = Math.max(0, num(city.money));
    const n = Math.min(Math.floor(money / PREP_PER_GOLD), room);
    if (!(n > 0)) continue;
    city.prep = prep + n;
    city.money = money - n * PREP_PER_GOLD;
    out.push({ city: name, n, cost: n * PREP_PER_GOLD, prep: city.prep, cap });
  }
  return out;
}

// ---------------------------------------------------------------- 疲勞（campaign.html [[FATIGUE_CORE]] 同式）

/** 疲勞表清洗：只留有限數，截斷夾 [0, TIRE_MAX]。 */
export function tireNormalize(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (typeof name !== 'string' || !name) continue;
    const v = Number(value);
    if (Number.isFinite(v)) out[name] = Math.min(TIRE_MAX, Math.max(0, Math.trunc(v)));
  }
  return out;
}

/** 單個武將疲勞（無記錄 = 0）。 */
export function tireOf(state: MonthSaveLike, name: string): number {
  const map = tireNormalize(state.tire);
  return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : 0;
}

/**
 * 每月疲勞：先 −1（下限 0），再用減後的值判 `>=TIRE_HIGH` → 該城 `morale` −hits。
 * 對「在職武將」與 `save.tire` 裏殘留的名字都衰減（敵將/已離隊也衰減，但不碰士氣）。
 */
export function tireMonthly(
  state: MonthSaveLike,
  officersByCity: Record<string, readonly string[]> | null = null,
): MonthFatigueReport {
  const tire = tireNormalize(state.tire);
  const cities = state.cities ?? {};
  const lists: Record<string, readonly string[]> = isRecord(officersByCity) ? officersByCity : {};

  const names = new Set<string>();
  const employed = new Set<string>();
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
    if (cur > 0) {
      tire[name] = cur - 1;
      decayed += 1;
    }
    const after = tire[name] ?? 0;
    if (employed.has(name) && after >= TIRE_HIGH) high += 1;
  }

  let moraleLoss = 0;
  let moraleSkipped = 0;
  for (const [cityName, list] of Object.entries(lists)) {
    if (!Array.isArray(list)) continue;
    let hits = 0;
    for (const name of list) {
      if (typeof name !== 'string') continue;
      if ((tire[name] ?? 0) >= TIRE_HIGH) hits += 1;
    }
    if (!hits) continue;
    const city = cities[cityName];
    if (city && Number.isFinite(Number(city.morale))) {
      city.morale = Math.max(0, Math.trunc(Number(city.morale)) - hits);
      moraleLoss += hits;
    } else {
      moraleSkipped += hits;
    }
  }

  state.tire = tire;
  return { decayed, high, moraleLoss, moraleSkipped };
}

// ---------------------------------------------------------------- 士氣（campaign.html [[MORALE_CORE]] 同式）

/** 士氣表清洗（跳過 null/boolean/空字串，夾 [0, MORALE_MAX]）。 */
export function moraleNormalize(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (typeof name !== 'string' || !name) continue;
    if (value === null || typeof value === 'boolean' || value === '') continue;
    const v = Number(value);
    if (Number.isFinite(v)) out[name] = Math.min(MORALE_MAX, Math.max(0, Math.trunc(v)));
  }
  return out;
}

/** 單個武將士氣（無記錄 = MORALE_DEFAULT）。 */
export function moraleOf(state: MonthSaveLike, name: string): number {
  const map = moraleNormalize(state.morale);
  return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : MORALE_DEFAULT;
}

/** 寫單個武將士氣，回傳夾取後的值。 */
export function moraleSet(state: MonthSaveLike, name: string, value: unknown): number {
  const v = Math.min(MORALE_MAX, Math.max(0, Math.trunc(Number(value)) || 0));
  if (!name) return v;
  const map = moraleNormalize(state.morale);
  map[name] = v;
  state.morale = map;
  return v;
}

/**
 * 每月士氣（武將級）：疲勞（已由 `tireMonthly` 先 −1）`>=60` → 士氣 −1；否則士氣 `<30` → +1。
 * 只動「在職武將」（`officersByCity`），`save.tire` 裏殘留的敵將/離隊名字不碰士氣。
 */
export function moraleMonthly(
  state: MonthSaveLike,
  officersByCity: Record<string, readonly string[]> | null = null,
): MonthMoraleReport {
  const lists: Record<string, readonly string[]> = isRecord(officersByCity) ? officersByCity : {};
  const rawTire = isRecord(state.tire) ? state.tire : {};
  const tireAt = (name: string): number => {
    const v = Number(rawTire[name]);
    return Number.isFinite(v) ? Math.min(MORALE_MAX, Math.max(0, Math.trunc(v))) : 0;
  };

  const names = new Set<string>();
  for (const list of Object.values(lists)) {
    if (!Array.isArray(list)) continue;
    for (const name of list) {
      if (typeof name === 'string' && name) names.add(name);
    }
  }

  let high = 0;
  let loss = 0;
  let recovered = 0;
  for (const name of names) {
    const cur = moraleOf(state, name);
    if (tireAt(name) >= MORALE_TIRE_HIGH) {
      high += 1;
      const after = moraleSet(state, name, cur - 1);
      if (after < cur) loss += cur - after;
    } else if (cur < MORALE_LOW) {
      const after = moraleSet(state, name, cur + 1);
      if (after > cur) recovered += 1;
    }
  }
  return { high, loss, recovered };
}

// ---------------------------------------------------------------- 年度結算（＝ saves.js annualSettle，逐欄照抄）

/**
 * 年度結算（只在正月、且已有上一年時生效；第一次真結賬發生在月 13）。
 * 就地寫 `year` / `yearFlag` / `ledger` / `annual`，被兩道閘拒掉時**不動檔**。
 */
export function annualSettle(
  state: MonthSaveLike | null | undefined,
  opts: { ts?: number; force?: boolean } = {},
): MonthAnnualResult {
  const empty: MonthAnnualResult = { ok: false, month: 0, year: 0, closed: 0, record: null, text: '' };
  if (!state || typeof state !== 'object') return { ...empty, reason: 'no-save' };

  const month = Math.max(1, int(state.month) || 1);
  const year = yearOf(month);
  if (!opts.force && !isYearStart(month)) {
    return { ok: false, reason: 'not-january', month, year, closed: 0, record: state.annual ?? null, text: '' };
  }
  if (!opts.force && year < 2) {
    return { ok: false, reason: 'first-year', month, year, closed: 0, record: state.annual ?? null, text: '' };
  }

  ensureYear(state);
  const prev = isRecord(state.ledger) ? state.ledger : null;
  const closed = Math.max(1, year - 1);
  let led: { months: number; income: number; salary: number } = { months: 0, income: 0, salary: 0 };
  if (prev && num(prev.year) === closed) {
    led = { months: num(prev.months), income: num(prev.income), salary: num(prev.salary) };
  }

  const cities = state.cities ?? {};
  let pop = 0;
  for (const city of Object.values(cities)) {
    if (!city) continue;
    pop += Math.max(0, int(city.pop));
  }

  let cityCount = 0;
  const owned = state.owned;
  if (Array.isArray(owned)) {
    for (const name of owned) {
      if (typeof name === 'string' && name) cityCount += 1;
    }
  }

  const roster = isRecord(state.roster) ? state.roster : {};
  let officers = 0;
  for (const [key, value] of Object.entries(roster)) {
    if (key !== '_moved' && Array.isArray(value)) officers += value.length;
  }
  // Cocos 的战役存檔沒有 `roster`（在職武將記在各城 `officers`）⇒ 退化成數城裏的武將。
  if (!isRecord(state.roster)) {
    for (const city of Object.values(cities)) {
      if (city && Array.isArray(city.officers)) {
        for (const officer of city.officers) {
          if (officer && (typeof officer === 'string' || typeof officer === 'object')) officers += 1;
        }
      }
    }
  }

  const base: Omit<MonthAnnualRecord, 'text'> = {
    v: 1,
    year: closed,
    intoYear: year,
    at: Number.isFinite(Number(opts.ts)) ? int(opts.ts) : 0,
    months: int(led.months),
    income: int(led.income),
    salary: int(led.salary),
    cities: cityCount,
    pop: int(pop),
    officers,
    wins: Math.max(0, int(state.wins)),
    losses: Math.max(0, int(state.losses)),
    defWins: Math.max(0, int(state.defWins)),
    gold: Math.max(0, int(state.gold)),
    stages: YEAR_STAGES.map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      evidence: row.evidence,
    })),
  };
  const rec: MonthAnnualRecord = { ...base, text: annualText(base) };

  state.yearFlag = 0;
  state.annual = rec;
  state.ledger = { year, months: 0, income: 0, salary: 0 };
  return { ok: true, month, year, closed, record: rec, text: rec.text };
}

// ---------------------------------------------------------------- 月末補學（＝ campaign.html monthlyLearn）

/** 存檔裏的 `learned` 表（壞值重建）。 */
function learnedMapOf(state: MonthSaveLike): Record<string, MonthKnownLearns> {
  const raw = state.learned;
  if (isRecord(raw)) return raw as Record<string, MonthKnownLearns>;
  const fresh: Record<string, MonthKnownLearns> = {};
  state.learned = fresh;
  return fresh;
}

/** 武將等級：優先 `ctx.levelOf`，其次 `save.generalLevel`，默認 1（web `generalLevelOf` 的存檔分支）。 */
function levelOfInSave(state: MonthSaveLike, ctx: MonthContext, name: string): number {
  if (typeof ctx.levelOf === 'function') return Number(ctx.levelOf(name)) || 1;
  const map = state.generalLevel;
  const n = map && typeof map === 'object' ? Number(map[name]) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
}

/**
 * 月末補學：遍歷我方城的在職武將，等級已到的技/軍師技一次補齊，寫回 `save.learned`。
 * 缺 `ctx.data`（Cocos 沒註冊 bridge / 沒傳 data）時照實回空 —— 不憑空造技能。
 */
export function monthlyLearnIn(
  state: MonthSaveLike,
  ctx: MonthContext,
  officersByCity: Record<string, readonly string[]> | null = null,
): MonthLearnedEntry[] {
  const out: MonthLearnedEntry[] = [];
  const data = ctx.data;
  if (!data) return out;
  const learned = learnedMapOf(state);
  const lists: Record<string, readonly string[]> = isRecord(officersByCity) ? officersByCity : {};

  for (const city of ownedNames(state)) {
    const list = lists[city];
    if (!Array.isArray(list)) continue;
    for (const name of list) {
      if (!name || name === '盜賊') continue;
      const known = learned[name] ?? {};
      const learnState = createLearnState(data, name, levelOfInSave(state, ctx, name), {
        magic: known.magic,
        wise: known.wise,
      });
      const got = monthlyLearnCheck(learnState);
      if (!got.length) continue;
      learned[name] = { magic: learnState.magic.slice(), wise: learnState.wise.slice() };
      out.push({ name, got });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 月推進主流水線

/** 城定義索引（沒有 `ctx.cityDefs` 時回 null ⇒ 年稅不判關城）。 */
function cityDefIndexOf(ctx: MonthContext): Map<string, MonthCityDef> | null {
  const defs = ctx.cityDefs;
  if (!Array.isArray(defs) || !defs.length) return null;
  const index = new Map<string, MonthCityDef>();
  for (const def of defs) {
    if (!def || typeof def !== 'object') continue;
    const name = def.NAME;
    if (typeof name !== 'string' || !name) continue;
    index.set(name, def);
  }
  return index;
}

/**
 * 推進一個月（純函數：同輸入 + 同 ctx ⇒ 同輸出，可重放；唯一可變的是傳入的存檔物件本身）。
 *
 * @param state 存檔物件（就地改；`MonthSaveLike` 只列 core 認得的欄位）
 * @param ctx   數據/適配器上下文（見 `MonthContext`）
 * @returns `MonthReport`：本月結算細節 + 已排序的戰報行
 */
export function advanceOneMonth(state: MonthSaveLike, ctx: MonthContext = {}): MonthReport {
  const logs: string[] = [];

  // 1. 月推進：+1 個月、清月令鎖（原作 [0x4A64BC]=0）。web 是 `CM.clearMonthLock(save)`。
  const month = Math.max(1, int(state.month) || 1) + 1;
  state.month = month;
  state.lastActionMonth = 0;
  const yearStart = isYearStart(month);

  // 2. 年度結算（僅正月；失敗把年進位標誌收回，同 web `annualYearRollover`）。
  let annual: MonthAnnualResult | null = null;
  if (yearStart) {
    state.yearFlag = 1;
    annual = annualSettle(state, { ts: ctx.ts });
    if (!annual.ok) {
      state.yearFlag = 0;
    } else if (annual.text) {
      logs.push(annual.text);
    }
  }

  // 3. 年稅（僅正月）：逐城 `pop×75/10000 + 2250` 進本城 money，跳過關城（0x405499）。
  let income = 0;
  if (yearStart) {
    const defIndex = cityDefIndexOf(ctx);
    const cities = state.cities ?? {};
    for (const name of ownedNames(state)) {
      const city = cities[name];
      if (!city) continue;
      const def = defIndex ? defIndex.get(name) : undefined;
      // 給了城定義清單就以清單為準（web：`def && !isGate(def)`）；沒給就當全部可稅。
      const taxable = defIndex ? !!(def && !isGateDef(def)) : true;
      if (!taxable) continue;
      const tax = annualTax(city.pop);
      city.money = num(city.money) + tax;
      income += tax;
    }
  }
  if (income) {
    const owned = state.owned;
    const ownedCount = Array.isArray(owned) ? owned.length : 0;
    logs.push(`歲 入：+${income} 金（正月 · ${ownedCount} 城 · 每城 人口×75/10000 + 2250）`);
  }

  // 4. 帳本：每月 +1 個月；年稅收入記進當年賬本（跨年由 ledgerOf 自動換頁）。
  const ledger = ledgerAdd(state, { income, months: 1 });

  // 5. 自治代行：適配器優先（web CM.autonomyTick / Cocos CityPanel 回調）；
  //    沒有適配器但有 `prep` 欄位時只做「金→預備兵」保底；兩者都沒有 → skipped（不靜默）。
  const civic: MonthCivicReport = { mode: 'skipped', ok: false, text: '', refilled: 0, refills: [], note: '' };
  if (typeof ctx.civic === 'function') {
    const outcome = ctx.civic(state, ctx);
    civic.mode = 'adapter';
    civic.ok = !!outcome;
    if (outcome) {
      const refilled = outcome.refilled;
      if (Array.isArray(refilled)) {
        civic.refilled = refilled.length;
      } else if (typeof refilled === 'number' && Number.isFinite(refilled)) {
        civic.refilled = Math.max(0, Math.trunc(refilled));
      }
      const auto = outcome.auto ?? null;
      if (auto && auto.ok) {
        civic.text = typeof auto.text === 'string' ? auto.text : '';
        if (civic.text) logs.push(civic.text);
      }
    }
    if (!civic.ok) civic.note = '自治適配器沒有返回結果（本月的自治代行未執行）';
  } else if (hasPrepableCity(state)) {
    civic.refills = prepFromMoneyAll(state);
    civic.mode = 'builtin';
    civic.ok = true;
    civic.refilled = civic.refills.length;
    civic.note = '未註冊自治適配器：只做了「金→預備兵」，未做搜索/開發代行';
  } else {
    civic.note = '存檔沒有預備兵欄位、也沒有自治適配器 ⇒ 本月跳過自治代行（Cocos 需 CityPanel 註冊 bridge）';
  }

  // 6. 疲勞 / 士氣漂移（web 順序：先 tireMonthly 再 moraleMonthly）。
  const officersByCity = ctx.officersByCity ?? officersByCityOf(state);
  const fatigue = tireMonthly(state, officersByCity);
  const morale = moraleMonthly(state, officersByCity);
  if (fatigue.decayed > 0 || fatigue.high > 0) {
    let tireLog = `疲 勞：${fatigue.decayed} 人 -1`;
    if (fatigue.high > 0) tireLog += `；高疲勞 ${fatigue.high} 人 → 士氣 -${morale.loss}`;
    logs.push(tireLog);
  }
  if (morale.recovered > 0) logs.push(`士 氣：低迷 ${morale.recovered} 人自然 +1`);

  // 7. 月末補學（原作升級補學有地址、月末兜底是 [推測]）。
  const learned = monthlyLearnIn(state, ctx, officersByCity);
  if (learned.length) {
    let total = 0;
    for (const row of learned) total += row.got.length;
    const first = learned[0];
    const names = first.got.map((item) => item.name).join('、');
    logs.push(`學 習：${learned.length} 名武將 補 ${total} 技（${first.name} 習 ${names}）`);
  }

  return {
    month,
    year: yearOf(month),
    yearStart,
    income,
    ledger,
    annual,
    civic,
    fatigue,
    morale,
    learned,
    logs,
  };
}
