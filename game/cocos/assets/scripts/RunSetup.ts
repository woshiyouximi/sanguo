/**
 * 開局選擇的唯一來源：`scenarioIndex` + `playerForce`（勢力 id ＝ 君主名）。
 *
 * 為什麼要有這個檔案：Cocos 版原本點開就直接進第 1 劇本、玩家勢力寫死
 * `AiRunner.PLAYER_FORCE = '玩家'`（見 `AiRunner.ts:66`）。開局三殼（標題 /
 * 劇本 / 君主）選完之後，把結果放這裡，`CampaignRoot` / `AiRunner` 由 lead
 * 加 hook 讀；本模組不改那兩個檔（`CampaignRoot.ts` 是別的 agent 的檔案，
 * 且 `PLAYER_FORCE` 被它以字串 import，改成函式會直接讓 tsc 爆）。
 *
 * 儲存：模組級單例 + `localStorage` 兜底，key `sanguo_run_v1`。
 *  - 有 localStorage 就兩邊都寫（切場景 / 熱重載都還在）；
 *  - localStorage 壞了、空了、被塞了髒 JSON，一律回落
 *    「第 1 劇本 + 公孫瓚」（劇本 1 第一座有主之城「北平」的 KING，資料事實）；
 *  - `getItem`/`setItem` 丟錯（隱私模式、配額滿）也吞掉，絕不讓開局面板崩。
 */
import { sys } from 'cc';

/** localStorage key（與 web 的 `sanguo_*_v1` 同前綴，但這是 Cocos 開局專用） */
export const RUN_KEY = 'sanguo_run_v1';
/** 存進去的格式版本；日後改形狀時用來丟棄舊值 */
export const RUN_VERSION = 1;
/** 資料固定 5 套（`data/scenarios.json`）；`BootRoot` 載完資料會用實際長度覆蓋 */
export const SCENARIO_COUNT = 5;
/** 空/髒資料時回落第 1 劇本 */
export const FALLBACK_SCENARIO_INDEX = 0;
/** 第 1 劇本第一個有城的勢力（北平 · 公孫瓚），與 `SelectModel.defaultForceName()` 一致 */
export const FALLBACK_PLAYER_FORCE = '公孫瓚';

/** 一次開局選擇 */
export interface RunSelection {
  scenarioIndex: number;
  playerForce: string;
}

/** 只依賴 localStorage 的三個方法，測試可以注入假物件 */
export interface RunStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 目前 localStorage（Cocos 的 `sys.localStorage` 在 web/微信/原生都有） */
export function storageOf(): RunStorage {
  return sys.localStorage as unknown as RunStorage;
}

/** 模組級單例：localStorage 不可用時至少同一場景內還能記住 */
let cached: RunSelection | null = null;
/** 目前認可的劇本數（`BootRoot` 載完資料會設成 5） */
let scenarioCount = SCENARIO_COUNT;

/** 讓 `BootRoot` 用實際資料長度校正（避免硬編 5 與資料不同步） */
export function setScenarioCount(count: number): void {
  const n = Math.trunc(count);
  if (Number.isFinite(n) && n > 0) scenarioCount = n;
}

/** 目前認可的劇本數（測試/報告用） */
export function getScenarioCount(): number {
  return scenarioCount;
}

/** 把任意輸入夾成合法選擇；髒值一律回落（不丟錯） */
export function sanitizeSelection(input: unknown): RunSelection {
  const raw = (input ?? {}) as Partial<RunSelection>;
  const index = typeof raw.scenarioIndex === 'number' ? raw.scenarioIndex : Number.parseInt(String(raw.scenarioIndex), 10);
  const scenarioIndex =
    Number.isFinite(index) && Number.isInteger(index) && index >= 0 && index < scenarioCount
      ? index
      : FALLBACK_SCENARIO_INDEX;
  const force = typeof raw.playerForce === 'string' ? raw.playerForce.trim() : '';
  return {
    scenarioIndex,
    playerForce: force.length > 0 ? force : FALLBACK_PLAYER_FORCE,
  };
}

/** 讀 localStorage；任何異常（壞 JSON / 存取丟錯）都回落，不拋 */
export function readRun(storage: RunStorage = storageOf()): RunSelection {
  if (cached) return { ...cached };
  let text: string | null = null;
  try {
    text = storage.getItem(RUN_KEY);
  } catch (err) {
    console.warn('[RunSetup] localStorage 讀取失敗，用預設開局', err);
  }
  if (!text) {
    cached = sanitizeSelection(null);
    return { ...cached };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    cached = sanitizeSelection(parsed);
  } catch (err) {
    console.warn('[RunSetup] sanguo_run_v1 壞 JSON，用預設開局', err);
    cached = sanitizeSelection(null);
  }
  return { ...cached };
}

/** 寫入並回傳落盤後的合法值（localStorage 失敗只 warn，記憶體仍生效） */
export function writeRun(selection: Partial<RunSelection>, storage: RunStorage = storageOf()): RunSelection {
  const next = sanitizeSelection(selection);
  cached = next;
  try {
    storage.setItem(RUN_KEY, JSON.stringify({ v: RUN_VERSION, scenarioIndex: next.scenarioIndex, playerForce: next.playerForce }));
  } catch (err) {
    console.warn('[RunSetup] localStorage 寫入失敗（本次仍生效）', err);
  }
  return { ...next };
}

/** 開局三殼選完時呼叫：`setRunSelection(2, '曹操')` */
export function setRunSelection(scenarioIndex: number, playerForce: string): RunSelection {
  return writeRun({ scenarioIndex, playerForce });
}

/**
 * 「這次是玩家主動開新局」的一次性旗標。
 *
 * 為什麼需要：只比 `runKey`（`劇本序號:君主名`）判不出「同劇本同君主又點了一次開始新局」，
 * 舊進度會被原樣繼承（r86 的 P5）。標題頁按下 `開始新局` 時打旗，`GameState.initCampaign`
 * 讀到 `fresh` 就把 `owned/cities/seeded` 清空重來；讀完即清，不影響之後的存讀檔。
 */
const FRESH_KEY = 'sanguo_run_fresh';

/** 標記「下一次進大地圖要開新局」 */
export function markFreshStart(storage: RunStorage = storageOf()): void {
  try {
    storage.setItem(FRESH_KEY, '1');
  } catch (err) {
    console.warn('[RunSetup] 開新局旗標寫入失敗（本次仍生效）', err);
  }
}

/** 取出並清掉旗標；只有標題頁的「開始新局」會讓它為 true */
export function consumeFreshStart(storage: RunStorage = storageOf()): boolean {
  let value: string | null = null;
  try {
    value = storage.getItem(FRESH_KEY);
    if (value) storage.removeItem(FRESH_KEY);
  } catch (err) {
    console.warn('[RunSetup] 開新局旗標讀取失敗', err);
    return false;
  }
  return value === '1';
}

/** 目前劇本下標（`CampaignRoot` 的 hook 用） */
export function scenarioIndex(): number {
  return readRun().scenarioIndex;
}

/** 目前玩家勢力名（`AiRunner` 的 hook 用；Cocos 存檔沒有君主名，故預設公孫瓚） */
export function playerForce(): string {
  return readRun().playerForce;
}

/** 清掉選擇（除錯/換局用；下次讀取回落預設） */
export function clearRun(storage: RunStorage = storageOf()): void {
  cached = null;
  try {
    storage.removeItem(RUN_KEY);
  } catch (err) {
    console.warn('[RunSetup] localStorage 清除失敗', err);
  }
}

/** 測試用：丟掉模組快取，強制下次重讀 localStorage */
export function resetRunCache(): void {
  cached = null;
}
