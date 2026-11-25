/**
 * ScenarioLevels.ts — 分劇本起始等級（R85）
 *
 * 為什麼需要這個模組：`generals.json` 的 400 將 `BaseEXP` 全是 **Times1 的 200**，
 * 裸反推一律 Lv2（= 10 兵）。原作新開局是
 * `0x42D38B`（BASEEXP）→ `0x42D392 call 0x409F73` → `0x42D39D mov word[ecx+0x2e],ax`，
 * 而 `TIMES1..5.INI` 的 BaseEXP 是 **200/200/800/2000/3800** ⇒ 五劇本 **Lv2/2/4/6/8**。
 * 這張表由 `work/scen_levels` 從 cp950 的 TIMES 檔抽出並與 `times1..5.json` 互證
 * （401 將 × 5 劇本，0 孤兒），見 `project/136_分剧本起始等级.md`。
 *
 * 用法：`BootRoot` 載完資料後 `await loadScenarioLevels()`；之後任何地方
 * `scenarioLevelOf(name)` 就拿到當前劇本的等級（沒有就回傳 `fallback`）。
 * 這裡**不碰 core**：真正的等級仍是 `core/levels.ts` 的 `levelOf()`，
 * 本模組只提供「這座將在這個劇本該是哪一級」的那一格。
 */
import { JsonAsset } from 'cc';
import { loadRes } from './DataLoader';
import { scenarioIndex } from './RunSetup';

/** 表裡一格：`{ baseExp, level, deployed }` */
export interface ScenarioLevelCell {
  baseExp?: number;
  level?: number;
  deployed?: boolean;
}

export interface ScenarioLevelTable {
  schema?: number;
  scenarios?: Array<{ index?: number; name?: string; defaultLevel?: number; levels?: Record<string, ScenarioLevelCell> }>;
}

let TABLE: ScenarioLevelTable | null = null;
let LOADED = false;

/** 當前劇本下標（`RunSetup` 已經有唯一來源，這裡只做一層保護）。 */
function scenIdx(): number {
  const i = Number(scenarioIndex());
  return Number.isFinite(i) && i >= 0 ? Math.trunc(i) : 0;
}

/** 載入一次；失敗只 warn，不影響開局（退回 BaseEXP 反推的 Lv2）。 */
export async function loadScenarioLevels(): Promise<boolean> {
  if (LOADED) return TABLE !== null;
  LOADED = true;
  try {
    const json = await new Promise<unknown>((resolve, reject) => {
      loadRes('data/levels_by_scenario', JsonAsset, (err: Error | null, asset: JsonAsset | null) => {
        if (err || !asset) {
          reject(new Error(err?.message ?? 'no asset'));
          return;
        }
        resolve(asset.json);
      });
    });
    TABLE = (json ?? null) as ScenarioLevelTable | null;
    return TABLE !== null;
  } catch (err) {
    console.warn(`[res] levels_by_scenario.json 未載入（退回 BaseEXP 反推）：${(err as Error).message}`);
    TABLE = null;
    return false;
  }
}

/** 表裡有幾個名字（自檢用：應為 401）。 */
export function scenarioLevelCount(idx = scenIdx()): number {
  const m = TABLE?.scenarios?.[idx]?.levels;
  return m ? Object.keys(m).length : 0;
}

/** 當前劇本預設等級（Lv2/2/4/6/8）；表沒載入回 0。 */
export function scenarioDefaultLevel(idx = scenIdx()): number {
  const d = Number(TABLE?.scenarios?.[idx]?.defaultLevel);
  return Number.isFinite(d) && d >= 1 ? Math.trunc(d) : 0;
}

/**
 * 該將在該劇本的起始等級；`fallback` 是呼叫方自己的來源（例如 `core/levels.ts` 的
 * `levelOf()` 算出來的值）。表裡沒有這個名字就直接回 `fallback`。
 */
export function scenarioLevelOf(name: string, fallback = 1, idx = scenIdx()): number {
  const key = String(name ?? '').trim();
  const cell = key ? TABLE?.scenarios?.[idx]?.levels?.[key] : undefined;
  const lv = Number(cell?.level);
  if (Number.isFinite(lv) && lv >= 1) return Math.min(99, Math.trunc(lv));
  const fb = Number(fallback);
  return Number.isFinite(fb) && fb >= 1 ? Math.min(99, Math.trunc(fb)) : 1;
}

/** 表是否已載入（給 UI 決定要不要顯示「等級來源：分劇本表」）。 */
export function scenarioLevelsReady(): boolean {
  return TABLE !== null;
}

/** `?demo` / 自檢用：整張表（唯讀）。 */
export function scenarioLevelsTable(): ScenarioLevelTable | null {
  return TABLE;
}
