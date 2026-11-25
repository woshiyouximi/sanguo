/**
 * era.js — 紀元（西元）顯示層：**純函式**，無 DOM、無 fetch、無頂層副作用。
 *
 * ============================================================================
 * 【內部口徑 vs 顯示口徑】—— 改這個檔之前先讀完這一段
 * ----------------------------------------------------------------------------
 * 內部**仍然是兩個整數**，沒有任何公元欄位寫進存檔：
 *   · `save.month`  = 絕對月序（1 起），**真源**。`saves.js` 的 `yearOf()` / `monthOfYear()`
 *                     就是把它拆成「第 N 年」與「年內 1..12 月」；
 *   · `save.year`   = `floor((month-1)/12)+1`，只是給顯示/對賬用的冗餘鏡像（`ensureYear()` 會校正）。
 *
 * 本檔只做一件事：**把這兩個整數換算成公元再顯示**。
 *   · 不改任何存檔欄位、不寫回 `save`、不碰 localStorage；
 *   · **不動 `monthLabel()` 的「第X年Y月」口徑** —— `game/tests/yearsettle_r7.test.ts:60-62`
 *     與 `saves.js` 的槽位摘要都釘死了它，動了會壞一片。要公元請用本檔的 `eraText*()`。
 *
 * 為什麼要公元：原作大地圖年月匾與內政面板顯示的是「西元 209年 3月」／「209年」，
 * 不是「第 1 年 1 月」。依據：`project/178_全系统界面差异_A组.md` §2.1 / §3.1；
 * 證據幀 `work/video_ui/A_map_date_zoom_t0130.png`（6× 放大，西元 209年 3月）、
 * `work/video_ui/A_city_t0030.png`（內政面板「時間 209年」）。
 *
 * ============================================================================
 * 【公元基準】`toADYear(y) = AD_ANCHOR + (y - 1)`，預設錨點 **184**。
 *   · 184 年 = 黃巾之亂，劇本 1 的起兵年（`docs/04c_世界与内政.md` 年表第一行）。
 *   · `[推测]`「第 1 年 = 184 年」這一步**原作沒有直接把「第 N 年」寫在畫面上過**：
 *     它是用 n1 逐幀抄到的「西元 209年 3月」＋劇本 1 起年 184 反推的
 *     （184 + 25 = 209，也就是第 26 年）。若日後原文年表/存檔對不上，
 *     **只改這一處**：`S.era.setAnchor(ad)`，或直接賦值 `S.era.anchor = ad`。
 *     換錨點會同時影響 `eraText/eraYear/yearField/slotTimeText`，因為它們都走 `toADYear()`。
 *
 * 用法（瀏覽器）：
 *   <script src="era.js"></script>           ← 非 module 載入時自動掛 `window.SG.era`
 *   import * as era from './era.js';         ← module 載入時用命名匯出（saves.js 就是這樣用的）
 * ============================================================================
 */

/** 一年 12 個月（本作無季節系統，`docs/04c:79`） */
export const ERA_MONTHS = 12;

/** 公元錨點預設值：黃巾之亂 184 年 = 第 1 年（`[推测]`，見檔頭） */
export const AD_ANCHOR_DEFAULT = 184;

// ---------------------------------------------------------------------------
// 基礎工具（本檔刻意不 import saves.js：era 要能被任何載入順序單獨用，
// 避免 saves.js ↔ era.js 循環依賴）
// ---------------------------------------------------------------------------

/** 數值化；空串 / null / NaN 一律 0 */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 整數化並夾到 [min, max] */
function intOr(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** 左補零到 width 位；超過寬度就原樣輸出（不截斷） */
export function padN(value, width = 2) {
  const w = Math.max(0, Math.trunc(num(width)));
  const s = String(Math.abs(Math.trunc(num(value))));
  return s.length >= w ? s : `${'0'.repeat(w - s.length)}${s}`;
}

/** 兩位補零：`1` → `01`（存檔行「記錄01」、城數「城數01」用） */
export function pad2(value) {
  return padN(value, 2);
}

/** 三位補零：`5` → `005`（存檔行「武將005」用） */
export function pad3(value) {
  return padN(value, 3);
}

// ---------------------------------------------------------------------------
// 錨點（可覆蓋）
// ---------------------------------------------------------------------------

let adAnchor = AD_ANCHOR_DEFAULT;

/** 目前的公元錨點（第 1 年 = 這一年） */
export function getAnchor() {
  return adAnchor;
}

/**
 * 覆蓋公元錨點（第 1 年 = `ad` 年）。回傳套用後的值。
 * 非數字 / 非正數一律維持原值，不會把紀元弄成 0 年或負年。
 */
export function setAnchor(ad) {
  const n = Math.trunc(Number(ad));
  if (!Number.isFinite(n) || n <= 0) return adAnchor;   // 壞值（含 0/負數）不動紀元
  adAnchor = Math.min(9999, n);
  return adAnchor;
}

/** 還原預設錨點 184，回傳套用後的值（測試收尾用） */
export function resetAnchor() {
  adAnchor = AD_ANCHOR_DEFAULT;
  return adAnchor;
}

// ---------------------------------------------------------------------------
// 換算
// ---------------------------------------------------------------------------

/**
 * 「第 N 年」（1 起）→ 公元年：`184 + (N - 1)`（錨點可被 `setAnchor()` 覆蓋）。
 * 非數字/0 當成第 1 年（畫面寧可顯示 184 年，也不要顯示 NaN 年）。
 */
export function toADYear(year) {
  const y = Math.max(1, Math.trunc(num(year)) || 1);
  return adAnchor + (y - 1);
}

/** 絕對月序 → 年（1 起）。與 `saves.js yearOf()` 同式，但本檔自帶一份避免依賴 */
export function yearOfMonth(month) {
  const m = Math.max(1, Math.trunc(num(month)) || 1);
  return Math.floor((m - 1) / ERA_MONTHS) + 1;
}

/** 絕對月序 → 年內月份 1..12 */
export function monthOfYear(month) {
  const m = Math.max(1, Math.trunc(num(month)) || 1);
  return ((m - 1) % ERA_MONTHS) + 1;
}

/** 絕對月序 → `{ year, month }`（內部口徑，都是 1 起） */
export function yearMonthOf(month) {
  return { year: yearOfMonth(month), month: monthOfYear(month) };
}

/** 絕對月序 → 公元年 */
export function adYearOfMonth(month) {
  return toADYear(yearOfMonth(month));
}

// ---------------------------------------------------------------------------
// 顯示文本
// ---------------------------------------------------------------------------

/**
 * 大地圖年月匾：`西元 209年 3月`（原作 `A_map_date_zoom_t0130.png` 逐字相同）。
 * 注意空格：`西元` 後一個半形空格、`年` 後一個半形空格。
 * `month` 超出 1..12 會被夾回（壞存檔不顯示「13 月」）。
 */
export function eraText(year, month) {
  const m = intOr(month, 1, 1, ERA_MONTHS);
  return `西元 ${toADYear(year)}年 ${m}月`;
}

/** 只到年、帶「西元」：`西元 209年`（存檔/讀檔對話框標題那種場合） */
export function eraYear(year) {
  return `西元 ${toADYear(year)}年`;
}

/** 絕對月序版：`西元 209年 3月` */
export function eraTextOfMonth(month) {
  const ym = yearMonthOf(month);
  return eraText(ym.year, ym.month);
}

/** 絕對月序版：`西元 209年` */
export function eraYearOfMonth(month) {
  return eraYear(yearOfMonth(month));
}

/**
 * 內政面板「時間」欄：**只到年、不帶「西元」** → `209年`
 * （原作 `A_city_t0030.png` 右側 8 欄第一行就是「時間 209年」）。
 */
export function yearField(year) {
  return `${toADYear(year)}年`;
}

/** 絕對月序版：`209年` */
export function yearFieldOfMonth(month) {
  return yearField(yearOfMonth(month));
}

/**
 * 存檔行「時間」欄：`209年`。
 * `A_save_t0035.png` 的 10 行是 `記錄NN | 君主名 | 城數NN | 武將NNN | 時間NNN年`
 * —— 時間同樣只有年、沒有「西元」、沒有月，所以和 `yearField()` 同一個格式。
 */
export function slotTimeText(year) {
  return yearField(year);
}

// ---------------------------------------------------------------------------
// 對外接口
// ---------------------------------------------------------------------------

/** 一包給 `window.SG.era` 的完整 API（命名匯出以外的便利入口） */
export const era = {
  ERA_MONTHS,
  AD_ANCHOR_DEFAULT,
  get anchor() { return adAnchor; },
  set anchor(ad) { setAnchor(ad); },
  getAnchor,
  setAnchor,
  resetAnchor,
  toADYear,
  padN,
  pad2,
  pad3,
  yearOfMonth,
  monthOfYear,
  yearMonthOf,
  adYearOfMonth,
  eraText,
  eraYear,
  eraTextOfMonth,
  eraYearOfMonth,
  yearField,
  yearFieldOfMonth,
  slotTimeText,
};

// 非 module 載入（<script src="era.js">）時掛到 window.SG.era；Node 下 window 不存在，
// 這一段不會執行，所以 `import` 進測試檔是安全的。
if (typeof window !== 'undefined') {
  const SG = (window.SG = window.SG || {});
  SG.era = Object.assign(SG.era || {}, era);
}
