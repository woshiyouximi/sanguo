/**
 * 出征 → 戰後回寫 的兵數閉環（純函數：不碰 DOM、不碰 localStorage、不 import core）。
 *
 * 為什麼要單獨一層：同一條口徑同時被三處用 ——
 *   · `deploy.html`：算出征上限（城裡實有兵 / 預備兵）、確認出征時把出陣兵從出發城扣掉；
 *   · `main.js`    ：戰後按 A 方存活比折算兵損，把倖存兵還回出發城；
 *   · `tests/march_flow.test.ts`：直接 import 這一層做純函數直測。
 * 三份各寫一遍就會漂移（project/93 §5 那種「同一場仗兩個數字」），所以公式只放在這裡。
 *
 * 名詞：
 *   部隊兵（st.troops）   = 城裡編制內的兵；出征扣的就是它（原作 city+0x086「總兵數」）
 *   預備兵（st.prep）     = 可徵召的後備兵池，上限 `prepCapOf(POPULATION)`（原作 +0x082）
 *   出征池（pool）        = 部隊兵 + 預備兵 = 這座城這一刻最多能帶走多少
 *   上陣兵（fielded）     = 真的進戰場的人數（= 步 + 騎兩欄），可以小於出征池
 *   兵團兵（army.troops） = 已經從城裡扣走、正在路上的那支部隊的兵（campaign 的 save.armies）
 */

/** 部隊兵硬上限（docs/04c §2.2：+0x082 上限 600；campaign.html 的 `refundArmy()` 也用 600）。 */
export const TROOP_HARD_CAP = 600;
/** 出陣名冊最多 5 槽（= core/deploy_queue.ts 的 DEPLOY_SLOTS；本模組不 import core，只對齊數字）。 */
export const DEPLOY_OFFICER_MAX = 5;

const toInt = (v, dflt = 0) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : dflt;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * `?officers=張飛,關羽` → 名字陣列。
 * 容忍逗號/頓號/分號/斜線/空白分隔，去空、去重、截到 `max` 個。
 * 沒帶（空字串 / undefined）→ `[]`，語義是「名冊不限，這座城的武將都能編」。
 */
export function parseOfficerList(raw, max = DEPLOY_OFFICER_MAX) {
  const text = String(raw == null ? '' : raw);
  const limit = Math.max(1, toInt(max, DEPLOY_OFFICER_MAX));
  const out = [];
  for (const part of text.split(/[,，、;；|/\s]+/)) {
    const name = part.trim();
    if (!name || out.includes(name)) continue;
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 出發城這一刻能帶出去的兵（部隊兵 + 預備兵，各自夾到合法範圍）。
 *
 * `st` 是存檔裡的 `save.cities[<出發城>]`，可能是 `undefined`、缺欄位、或字串壞值 ——
 * 一律按「缺就用預設」處理，不 throw（這條路徑在出征按鈕上，不能因為一個壞欄位白屏）。
 *
 * @param {object|null|undefined} st
 * @param {{fallbackTroops?: number, prepCap?: number}} [opts]
 *   fallbackTroops：城狀態缺失時的部隊兵（通常 = `Saves.cityTroops(cityDef)`）
 *   prepCap       ：預備兵上限（通常 = `prepCapOf(POPULATION)`；0 = 這城沒有預備兵池）
 * @returns {{troops: number, prep: number, prepCap: number, pool: number}}
 */
export function cityPoolOf(st, opts = {}) {
  const prepCap = clamp(toInt(opts.prepCap, 0), 0, TROOP_HARD_CAP);
  const fallback = clamp(toInt(opts.fallbackTroops, 0), 0, TROOP_HARD_CAP);
  const raw = st && typeof st === 'object' ? st : {};
  // 老檔沒有 prep 欄位：campaign 的 normalizeCityState() 第一次碰到會補滿池，
  // 這裡跟著用「滿池」算，免得同一個城在兩頁顯示兩個數字。
  const troops = clamp(Number.isFinite(Number(raw.troops)) ? toInt(raw.troops) : fallback, 0, TROOP_HARD_CAP);
  const prep = clamp(Number.isFinite(Number(raw.prep)) ? toInt(raw.prep) : prepCap, 0, prepCap);
  return { troops, prep, prepCap, pool: troops + prep };
}

/**
 * 上陣總上限 = min(每將等級上限, 城裡能帶的兵)。
 * 等級上限（`troopCapOf(level) + cavalryCapOf(level)`）仍是**每將上限**，只是不許超過城兵。
 */
export function fieldCapOf(levelCap, pool) {
  const lv = clamp(toInt(levelCap, 0), 0, TROOP_HARD_CAP * 2);
  const p = clamp(toInt(pool, 0), 0, TROOP_HARD_CAP * 2);
  return Math.min(lv, p);
}

/**
 * 從城裡扣走出征兵（遠征出發那一刻）。
 *
 * 先扣**部隊兵**，不夠才動預備兵：部隊兵已經在編制內，預備兵要先徵兵才會變成部隊，
 * 能不動就不動。不夠就整筆失敗（`ok:false`），**絕不會**把城兵扣成負數。
 *
 * @returns {{ok: true, taken: number, fromTroops: number, fromPrep: number, troops: number, prep: number, pool: number}
 *          | {ok: false, reason: string, want: number, taken: 0, fromTroops: 0, fromPrep: 0, troops: number, prep: number, pool: number}}
 */
export function takeFromCity(st, n, opts = {}) {
  const want = clamp(toInt(n, 0), 0, TROOP_HARD_CAP * 2);
  const cur = cityPoolOf(st, opts);
  if (want <= 0) {
    return { ok: true, taken: 0, fromTroops: 0, fromPrep: 0, troops: cur.troops, prep: cur.prep, pool: cur.pool };
  }
  if (want > cur.pool) {
    return {
      ok: false, reason: 'not-enough', want, taken: 0, fromTroops: 0, fromPrep: 0,
      troops: cur.troops, prep: cur.prep, pool: cur.pool,
    };
  }
  const fromTroops = Math.min(want, cur.troops);
  const fromPrep = want - fromTroops;
  return {
    ok: true,
    taken: want,
    fromTroops,
    fromPrep,
    troops: clamp(cur.troops - fromTroops, 0, TROOP_HARD_CAP),
    prep: clamp(cur.prep - fromPrep, 0, cur.prepCap),
    pool: cur.pool - want,
  };
}

/**
 * 戰後把倖存的兵還回出發城（進**部隊兵**欄，硬上限 600）。
 * 回不去的那部分記在 `overflow`，讓呼叫端可以寫進提示（不靜默吞兵）。
 *
 * @returns {{before: number, troops: number, added: number, overflow: number}}
 */
export function returnToCity(st, n, opts = {}) {
  const cap = clamp(toInt(opts.troopsCap, TROOP_HARD_CAP), 0, TROOP_HARD_CAP);
  const raw = st && typeof st === 'object' ? st : {};
  const before = clamp(toInt(raw.troops, 0), 0, TROOP_HARD_CAP);
  const add = Math.max(0, toInt(n, 0));
  const after = clamp(before + add, 0, cap);
  return { before, troops: after, added: after - before, overflow: Math.max(0, before + add - after) };
}

/**
 * 戰損折算 —— 與守城 branch 同一口徑（`main.js:1126-1134`）：
 * 上陣 `start`、活到最後 `alive`，用「出征池 `/` 上陣」放大回真實兵力池。
 * 有傷亡就至少損 1（守城那條的 `Math.max(1, ...)` 同款）。
 *
 * 為什麼要放大：一場仗只上陣 100，但城裡／兵團是 178 兵 —— 直接扣「上陣傷亡」
 * 等於只損失了上陣那一部分，另外 78 兵永遠不參與傷亡（project/93 §5 的兵損失真）。
 *
 * @returns {{pool: number, loss: number, returned: number, lostFielded: number, startFielded: number, aliveCount: number}}
 */
export function casualtySplitOf(pool, startFielded, aliveCount) {
  const p = clamp(toInt(pool, 0), 0, TROOP_HARD_CAP);
  const start = Math.max(1, toInt(startFielded, 1));
  const alive = clamp(toInt(aliveCount, start), 0, start);
  const lostFielded = start - alive;
  const raw = Math.round((p * lostFielded) / start);
  const loss = lostFielded <= 0 ? 0 : clamp(Math.max(1, raw), 0, p);
  return { pool: p, loss, returned: p - loss, lostFielded, startFielded: start, aliveCount: alive };
}
