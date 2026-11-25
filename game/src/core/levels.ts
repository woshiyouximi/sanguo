/**
 * levels.ts — 武將等級 / 帶兵上限的**唯一**口徑（R84）
 *
 * 為什麼要有這一層：`game/data/generals.json` 是 401 元素陣列（`[0]` = id0 `盜賊` 模板，
 * `[1..400]` 真將），**沒有 LEVEL 欄位**；`BaseEXP` 400 將全是 200（只有 `盜賊` 是 9999）。
 * 原作等級來自 SSAV 存檔（R70 明說不做），網頁版沒有這條來源，於是舊口徑
 * `levelFromExp(200)` 把 400 將一律算成 Lv2 → `min(5×2,100) = 10` 兵，
 * 出征滑桿只能拉到 10 兵，6v6 變成 129 秒的拖戲（R84 的頭號卡點）。
 *
 * 本層定三件事：
 *  1. **起始等級 `[新設計]`**：`startLevelOf()` = `clamp(1 + floor((STR+INT)/40), 6, 20)`。
 *     下限 6 是有意的：`troopCapOf(6) = 30` 兵，30 兵才打得動；上限 20 是原作騎兵起算點
 *     （`cavalryCapOf(20) = 0`，0x409FD8）兼滿編點（`troopCapOf(20) = 100`）。
 *     原作**沒有**這條公式（等級存在 SSAV 裡），所以標 `[新設計]`，見 `project/104_等級與帶兵上限.md`。
 *  2. **等級來源優先序**（唯一入口 `levelOf()`）：呼叫方覆蓋（`?level=` / `?lv=` / 存檔
 *     `save.generalLevel[名]`）> 武將行自帶 `level` > `startLevelOf()`。
 *     `campaign.html` 的 `generalLevelOf()`、`snapshotForSave()`、`ensureGeneralLevels()`、
 *     `deploy.html` 的 `GEN_LEVEL` 全部要改成呼叫這裡，**不許有第二套算法**。
 *  3. **派生量**：`troopCapOf(level)` = `min(5×等級, 100)`（原作 `0x409FB6`）；
 *     `cavalryCapOf(level)` = `clamp((等級−20)×5, 0, 100)`（原作 `0x409FD8`），
 *     與 `game/web/city_model.js` 的 `cavalryCapOf` 同式（floor + `|| 20` 兜底）。
 *
 * 「EXE 那條公式只當上限」：`min(5L,100) + clamp((L−20)×5,0,100)` 是**上限**，不是上陣初值；
 * 上陣兵數由出征滑桿（`deploy.html`）或守軍池在 `1..上限` 之間給。守軍兵仍走
 * `garrison.ts` 的 `battleSetup()` 舊口徑 `round(守軍/6)`（不回到 EXE 上限）。
 *
 * 純函式，不碰 DOM、不讀 localStorage；唯一依賴是 `battle.ts` 的等級經驗表（不複製第二份）。
 */
import { levelFromExp } from './battle.ts';

/** 起始等級下限 `[新設計]`：6 級 = 30 兵。低於這個數字 6v6 打不動（R84 實測）。 */
export const START_LEVEL_MIN = 6;
/** 起始等級上限 `[新設計]`：20 級 = 滿編 100 兵 + 騎兵起算點。 */
export const START_LEVEL_MAX = 20;
/** 起始等級的屬性分母 `[新設計]`：每 40 點 (STR+INT) 一級。 */
export const START_LEVEL_DIV = 40;

/** 等級下夾（原作沒有 0 級武將）。 */
export const LEVEL_MIN = 1;
/** 等級上夾（經驗表只到 99）。 */
export const LEVEL_MAX = 99;

/** 每級帶兵數（原作 `0x409FB6`）。 */
export const TROOP_PER_LEVEL = 5;
/** 帶兵數硬上限（原作 `0x409FB6`；也是 `docs/04b` 的 `+0x42` 上限）。 */
export const TROOP_CAP_MAX = 100;

/** 騎兵起算等級（原作 `0x409FD8`）。 */
export const CAVALRY_LV_BASE = 20;
/** 每級騎兵數（原作 `0x409FD8`）。 */
export const CAVALRY_PER_LEVEL = 5;
/** 騎兵數硬上限（原作 `0x409FD8`）。 */
export const CAVALRY_CAP_MAX = 100;

/**
 * 戰場士兵槽上限（原作 `0x43AA44` 的 `0xC8` = 200）。
 *
 * 這個 200 **不是**另一個兵數上限，而是「步 100 + 騎 100」兩欄相加後的天花板：
 * 原作把 `unit+0x58`（步+騎）與 `unit+0x5C`（總數）寫進同一段槽位，
 * 上限 `0xC8` 對應的正是滿級武將兩欄都滿編的情形。
 * 口徑來源：`project/168_战场每侧单位数.md` §4（`0x443118`/`0x443124`/`0x43AA44`
 * 逐條回比 EXE，0 處不符）；本輪落地見 `project/170_步骑两栏兵力.md`。
 */
export const TROOP_COLUMNS_MAX = TROOP_CAP_MAX + CAVALRY_CAP_MAX;

/**
 * 等級來源的最小欄位集：`generals.json` 的大寫欄位（`STR`/`INT`）與
 * `garrison.ts` 的 `Officer` 小寫欄位（`str`/`int`）都吃，另外可帶一個運行時 `level`。
 */
export type LevelRow = {
  STR?: unknown;
  INT?: unknown;
  str?: unknown;
  int?: unknown;
  level?: unknown;
  /** 原作 `generals.json` 的 `BaseEXP`（`+0x2A`）；起始等級由它反推，見 `startLevelOf()`。 */
  BaseEXP?: unknown;
  baseExp?: unknown;
  exp?: unknown;
};

/**
 * 數值化：`'99'`→99、`''`/null/`undefined`/NaN→fallback。
 * 與 `web/saves.js` 的 `num()` 同語義（那邊非有限一律 0），這裡多一個 fallback 參數。
 */
function numOf(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 等級正規化：trunc + 夾 `1..99`；非正數/非有限一律回 0（= 「沒有等級」哨兵）。 */
function normLevel(value: unknown): number {
  const n = Math.trunc(numOf(value, 0));
  if (n < LEVEL_MIN) return 0;
  return Math.min(LEVEL_MAX, n);
}

/**
 * 起始等級 `[确认]`（R85，f2-orig-numbers 指令级取证）。
 *
 * 原作没有「等级表」，也没有把等级存在单独档位里：新开局时按
 * `0x42D38B mov [ecx+0x2a],eax`（BASEEXP）→ `0x42D392 call 0x409F73`
 * → `0x42D39D mov word[ecx+0x2e],ax`，即 **`等级 = 門檻表反推(BaseEXP)`**，
 * 門檻表就是 `0x409EE0(k) = ((k−1)×137−34)×k/2+17`（= 本仓 `battle.ts` 的 `expToReach`）。
 *
 * 用原版 TIMES 数据的 `base_exp` 代入 ⇒ 五剧本起始等级 Lv2 / Lv2 / Lv4 / Lv6 / Lv8
 * （`盜賊` 模板 9999 → Lv12），四个非 200 的值都刚好跨过一级门槛，数据与公式互证，
 * 见 `project/133_原作数值真值.md` §3。
 *
 * 历史：R84 曾用 `[新设计]` 的 `clamp(1+floor((STR+INT)/40), 6, 20)`，理由是
 * 「BaseEXP 全 200 ⇒ 全员 Lv2 ⇒ 只带 10 兵打不动」。取证后确认 10 兵就是原作口径
 * （守军上阵兵另有 `round(守軍/6)` 池，见 `garrison.ts`），故改回真值。
 */
export function startLevelOf(gen?: LevelRow | null): number {
  const exp = Math.trunc(numOf(gen?.BaseEXP ?? gen?.baseExp ?? gen?.exp, 0));
  const lv = levelFromExp(exp > 0 ? exp : 200);
  return Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, lv));
}

/**
 * 等級唯一入口：`override`（呼叫方明確指定：`?level=`、存檔 `generalLevel`）>
 * `gen.level`（武將行自帶）> `startLevelOf(gen)`。
 *
 * `override` 傳 0 / 負數 / NaN / `''` / 0.9（截斷成 0）都視同「沒指定」，會往下落；
 * 合法值一律 trunc 並夾 `1..99`。`campaign.html` 的 `LEVEL_OVERRIDE` 沒 `?level=` 時就是 0，
 * 靠的正是這條「0 = 沒指定」。
 */
export function levelOf(gen?: LevelRow | null, override?: unknown): number {
  const fromOverride = normLevel(override);
  if (fromOverride > 0) return fromOverride;
  const own = normLevel(gen?.level);
  if (own > 0) return own;
  return startLevelOf(gen);
}

/**
 * 帶兵上限 `min(5×等級, 100)`（原作 `0x409FB6`）。
 * 與 `web/monarch_model.js` 的 `troopCapOf()`、`web/city_model.js` 的 `troopMaxOf()` 同值：
 * 非有限/≤0 → 1 級（5 兵），>99 → 99 級（100 兵）。
 */
export function troopCapOf(level: unknown): number {
  const lv = normLevel(level) || LEVEL_MIN;
  return Math.max(1, Math.min(lv * TROOP_PER_LEVEL, TROOP_CAP_MAX));
}

/**
 * 騎兵上限 `clamp((等級−20)×5, 0, 100)`（原作 `0x409FD8`）。
 * 逐字對齊 `web/city_model.js` 的 `cavalryCapOf()`：`Math.floor(num || 20)` 兜底
 * （0/`''`/NaN/undefined 都當 20 級 = 0 騎兵），下夾 0、上夾 100。
 * 差別只在**非整數**：那邊 floor、`battle.ts` 那份 round；整數 1..99 三邊完全同值。
 */
export function cavalryCapOf(level: unknown): number {
  const lv = Math.floor(numOf(level, 0) || CAVALRY_LV_BASE);
  return Math.max(0, Math.min(CAVALRY_CAP_MAX, (lv - CAVALRY_LV_BASE) * CAVALRY_PER_LEVEL));
}

/**
 * 帶兵上限 + 騎兵上限 = **戰場總兵力上限**（原作兩欄相加，`unit+0x5C`）。
 *
 * 原作：`min(帶兵數, 帶兵上限) + min(騎兵數, 騎兵上限)`（`0x443118` 寫 `unit+0x58`
 * = 步+騎、`0x443124` 寫 `unit+0x5C` = 總數）；兩欄**互不包含**——`troopCapOf()`
 * 只管步兵那一欄，`cavalryCapOf()` 只管騎兵那一欄，加起來才是上陣總數。
 * 舊實作把騎兵當成帶兵數的子集（`cavalry ⊆ soldiers`），所以 20 級以下騎兵恆 0、
 * 20 級以上總兵力又卡在 100，兩頭都不對。詳見 `project/168` §4 與 `project/170`。
 *
 * 上夾 `TROOP_COLUMNS_MAX`(200) = 原作士兵槽 `0xC8`，滿級時正好 100 + 100。
 */
export function troopCapSumOf(level: unknown): number {
  return Math.min(TROOP_COLUMNS_MAX, troopCapOf(level) + cavalryCapOf(level));
}

/**
 * 兩欄拆解 `{ inf, cav, total }`：`inf` 是帶兵那一欄、`cav` 是騎兵那一欄、
 * `total = inf + cav`。編成頁（web `deploy.html` / Cocos `DeployRoot.ts`）用它
 * 畫兩條滑桿，`garrison.ts` 用它算守將上陣兵數——同一份口徑，不在各頁再抄一遍。
 */
export function troopColumnsOf(level: unknown): { inf: number; cav: number; total: number } {
  const inf = troopCapOf(level);
  const cav = cavalryCapOf(level);
  return { inf, cav, total: troopCapSumOf(level) };
}

/**
 * 經驗→等級：**直接轉出 `battle.ts` 的同一份實作**（那裡是 `0x408xxx` 經驗表的移植，
 * `tests/level_troop.test.ts` 逐點釘死：`expToReach(2)=120`、`levelFromExp(200)=2`、
 * `levelFromExp(662921)=99`）。這裡不重寫，避免出現第三份。
 */
export { levelFromExp };
