/**
 * GeneralBook.ts — 「武將資料名冊」的純邏輯（Cocos / 微信版）。
 *
 * ## 這一層為什麼存在
 *
 * web 版的名冊（`game/web/campaign.html:1735 generalRowsAll()`）是**從城反查武將**：
 * 走一遍 60 座城的 `garrison.officers`，湊出 142 個「在場」武將，按勢力分組顯示。
 * Cocos 版要的是 **`data.generals` 的 401 條全量名冊**（c5 審計的缺口就是「401 將看不到」），
 * 所以主鍵必須是 generals.json，城只是它的一個欄位。
 *
 * 兩邊合起來的優先級（`mergeRow`，逐欄位寫死、可斷言）：
 *
 * | 欄位 | 第一來源 | 第二來源 | 兜底 |
 * |------|----------|----------|------|
 * | 所屬城 | `officersByCity` 反查（= 存檔現場的守將表） | `generals.CITY` | `''`（未登場） |
 * | 狀態 | `save.generalStatus[名]`（原作 +0x0B9） | 城內守將記錄的 `status` | `generals.Status` → `'未'` |
 * | 等級 | `save.generalLevel[名]`（原作 +0x04E） | `generals.level` | 20（`CityModel.levelOf` 同口徑） |
 * | 忠誠 | `save.loyal[名]` | 守將記錄 `loyal` | `generals.Loyal` → 90 |
 * | 士氣 | `save.morale[名]`（≡ 原作 Spirit） | — | `generals.Spirit` → 80 |
 * | 疲勞 | `save.tire[名]`（原作 +0x05C） | — | 0 |
 * | 武力/智力 | 守將記錄 `str`/`int` | `generals.STR`/`INT` | 0 |
 * | 勢力 | `ownerOf(城)`（呼叫端注入，campaign 傳自己的 `forceAt`） | — | `''` |
 *
 * ## 三個「不是 bug」的資料事實（先看再改）
 *
 * 1. **`SKILL` / `WISESKILL` 是字串，不是陣列**：`types.ts` 宣告成
 *    `Array<[number, number]>`，但 generals.json 401 條**全是** `"40, 110"` 這種
 *    「級別, 技 id」的單對字串（`typeof === 'string'` 401/401）。
 *    每將恰好 1 條必殺技 + 1 條軍師技（`work/cocos_book/model_assert.mjs` 斷言）。
 *    這裡自己 `parseSkillPairs()` 解析，不信型別宣告。
 *
 * 2. **401 條裡只有 142 條「在場」**：另外 259 條 `Status === '未'`、`CITY === ''`
 *    （本劇本未登場）。所以名冊必然有一個「未登場」大桶（259 人），
 *    這不是分組寫錯，是 5 個劇本共用同一張武將表。
 *
 * 3. **等級不在資料表裡**：generals.json 沒有 `level` 欄位（`BaseEXP` 是基礎經驗，不是等級）。
 *    原作把等級存在**存檔**（段4 +0x04E → `save.generalLevel[名]`，見 `game/web/saves.js:26`），
 *    新檔這張表是空的 ⇒ 全員 20 級（`CityModel.ts:371 levelOf()` 的兜底，web `qs.lv || 20` 同口徑）。
 *    技能過濾因此在**新檔**下幾乎全員「未解鎖」，這是資料事實；面板會把未解鎖的招
 *    連同解鎖等級一起顯示（`必殺技 鬼哭神號 · Lv40 未解鎖`），不會顯示成空字串。
 *
 * ## 零依賴
 *
 * 只 import `MonarchModel`（勢力色板 / 狀態詞 / 帶兵上限）與 `CityModel`（等級口徑），
 * 三者都**不 import 'cc'**，所以 `work/cocos_book/model_assert.mjs` 能直接在 node 裡
 * `require` 編譯後的 JS 跑斷言（不需要 mock 引擎）。面板才碰 `cc`。
 */
import { levelOf as cityLevelOf, type CityGeneral } from './CityModel';
import { FORCE_COLOR_NEUTRAL, forceColorOf, intOr, num, str, troopCapOf } from './MonarchModel';
import { scenarioLevelOf } from './ScenarioLevels';

/* =====================================================================
 * §0 常量 / 型別
 * =================================================================== */

/** 原作段4 +0x0B9 STATUS：1=登用 / 2=俘虜 / 8=在野；`未` 是資料表默認（未登場） */
export type BookStatus = '登' | '俘' | '野' | '未';

/** 名冊分組維度 */
export type BookGroup = 'force' | 'city';

/** 每頁行數（硬約束：401 條不能一幀全建，見 `project/126_Cocos武將與勢力圖.md` §節點上限） */
export const BOOK_PAGE_SIZE = 20;

/** 狀態詞（在職/俘虜/在野/未登場）——`登`/`俘`/`野` 與 `MonarchModel.STATUS_TEXT` 同字，多一個 `未` */
export const BOOK_STATUS_TEXT: Readonly<Record<BookStatus, string>> = Object.freeze({
  登: '在職',
  俘: '俘虜',
  野: '在野',
  未: '未登場',
});

/** 沒有城的將歸到這組（按城分組時）；`\u0000` 開頭保證不會撞真城名 */
export const NO_CITY_KEY = '\u0000none';
export const NO_CITY_LABEL = '未登場';
/** 沒有勢力的將（有城但城無主 = 在野；連城都沒有 = 未登場） */
export const WILD_KEY = '\u0000wild';
export const WILD_LABEL = '在野';
export const NO_FORCE_LABEL = '無屬';

/** 一條技能（必殺技 / 軍師技共用） */
export interface BookSkill {
  /** 解鎖等級（`"40, 110"` 的 40） */
  level: number;
  /** 原作技 id（magics.SEQUENCE / wises.SEQUENCE） */
  id: number;
  /** 技名（查 magics/wises 表；查不到回 `#id`） */
  name: string;
  /** `level <= 當前等級` —— 面板據此決定是否灰掉 */
  unlocked: boolean;
}

/** 名冊一行 = 一張單將卡的全部資料（列表只用到前 6 個欄位） */
export interface BookGeneral {
  /** generals.json 的 `id`（= SEQUENCE，0 起） */
  id: number;
  name: string;
  str: number;
  int: number;
  /** 等級（存檔 +0x04E → 資料表 level → 20） */
  level: number;
  /** 體力上限（原作 BaseHP，直接顯示，不做換算） */
  hp: number;
  /** 技力上限（原作 BaseMP） */
  mp: number;
  /** 單將帶兵上限（`MonarchModel.troopCapOf(level)`，卡片附帶） */
  troopCap: number;
  loyal: number;
  spirit: number;
  tire: number;
  status: BookStatus;
  statusText: string;
  /** 所屬城；`''` = 未登場（按城分組時歸 `NO_CITY_KEY`） */
  city: string;
  /** 勢力 id = 開國君主名；`''` = 在野 / 未登場（按勢力分組時歸 WILD/NO_CITY） */
  force: string;
  /** 列表「勢力」欄要顯示的字：勢力名 / 在野 / 未登場 */
  forceLabel: string;
  /** 勢力色（`MonarchModel.forceColorOf`，無勢力時是中性色） */
  color: string;
  /** 是否玩家的將（`force === 玩家勢力`） */
  mine: boolean;
  /** `generals.FACE` 原串，如 `FACE\\FACE385` */
  face: string;
  /** 三位編號（`FACE385` → `385`），給 `Portrait` 的回落鏈用 */
  faceNo: string | null;
  type: number;
  weapon: string;
  horse: string;
  thing: string;
  /** 必殺技（`SKILL`，可能為 null） */
  skill: BookSkill | null;
  /** 軍師技（`WISESKILL`，可能為 null） */
  wise: BookSkill | null;
  /** 同族/家臣標記（`LoyalKing`，原作 +0xBF 的效忠對象，**不是** Force 欄位） */
  loyalKing: string;
  /** 節操（`CONSTANCY`） */
  constancy: number;
  /** 排序鍵：我方 → 在職 → 俘虜 → 在野 → 未登場 */
  sortKey: number;
}

/** 分組後一組（勢力 / 城） */
export interface BookGroupRow {
  key: string;
  label: string;
  color: string;
  /** 這組是不是玩家的（城：`save.owned` 含此城；勢力：`force === 玩家勢力`） */
  mine: boolean;
  count: number;
  rows: BookGeneral[];
}

/** 建名冊的輸入 */
export interface BookOptions {
  /** generals.json（401 條；非陣列視為空表，不拋） */
  generals?: unknown;
  /** 戰役存檔（`CampaignSave`：generalLevel/generalStatus/loyal/morale/tire/owned/king/force…） */
  save?: unknown;
  /** magics.json（必殺技名；查不到就顯示 `#id`） */
  magics?: unknown;
  /** wises.json（軍師技名） */
  wises?: unknown;
  /** 各城守將 `{城: [武將]}`（campaign 傳 `CampaignRoot.officersByCity()`） */
  officersByCity?: Record<string, unknown> | null;
  /** 城 → 勢力 id（campaign 傳自己的 `forceAt`）；不傳則全部視為無主 */
  ownerOf?: ((city: string) => string) | null;
}

export interface BookSummary {
  total: number;
  employed: number;
  captive: number;
  wild: number;
  absent: number;
  mine: number;
  forces: number;
  cities: number;
}

/* =====================================================================
 * §1 小工具（純函式）
 * =================================================================== */

/** 夾在 [lo, hi] 的整數（`layout.ts` 也有一個 clamp，但那支吃 number 且不取整） */
export function clampInt(value: unknown, lo: number, hi: number): number {
  // 直接用 `MonarchModel.intOr(v, fallback, min, max)`：非有限 → 下限，其餘 trunc + clamp，
  // 全倉庫只有這一份取整夾具，不要在名冊裡再造一個。
  return intOr(value, lo, lo, hi);
}

/**
 * 解析 `SKILL` / `WISESKILL`：`"40, 110"` → `[[40, 110]]`。
 *
 * 為什麼不用 `split(',')` 直接取兩段：`盜賊`（id 0）的 `SKILLLEVEL2 = "01,01,01"`
 * 是三段，`POS` 這種空格分隔的欄位也在隔壁 —— 一次性把數字全抽出來再兩兩配對，
 * 段數是奇數時最後一段自動丟掉，不會把 `NaN` 塞進技能表。
 */
export function parseSkillPairs(raw: unknown): Array<[number, number]> {
  if (typeof raw !== 'string') return [];
  const nums: number[] = [];
  for (const piece of raw.split(/[,，、\s]+/)) {
    if (!/^-?\d+$/.test(piece)) continue;
    nums.push(Number(piece));
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

/** 從 magics/wises 表按 `SEQUENCE` 查技名；查不到回 `''` */
export function skillNameOf(table: unknown, id: number): string {
  if (!Array.isArray(table) || !Number.isFinite(id)) return '';
  for (const row of table) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    if (intOr(rec.SEQUENCE, -1) === id) return str(rec.NAME);
  }
  return '';
}

/** `FACE\\FACE385` → `385`；不成形回 null（面板會回落 `Portrait.faceNumberOf(name)`） */
export function faceNumberOf(raw: unknown): string | null {
  const face = str(raw);
  const hit = /FACE\s*(\d{1,3})\s*$/i.exec(face);
  if (!hit) return null;
  const no = Number(hit[1]);
  if (!Number.isFinite(no) || no <= 0) return null;
  return String(Math.trunc(no)).padStart(3, '0');
}

/** 狀態規範化：`登/俘/野/未` 之外一律當 `未` */
export function normBookStatus(value: unknown): BookStatus {
  const s = str(value).trim();
  if (s === '登' || s === '1') return '登';
  if (s === '俘' || s === '2') return '俘';
  if (s === '野' || s === '8') return '野';
  return '未';
}

/** 排序權重：我方 0 起步，再按狀態，再按武力 */
function sortKeyOf(status: BookStatus, mine: boolean): number {
  const rank = status === '登' ? 0 : status === '俘' ? 1 : status === '野' ? 2 : 3;
  return (mine ? 0 : 1) * 10 + rank;
}

/** 存檔側的 `{名: 值}` 表取數（非物件回 undefined） */
function mapGet(rec: unknown, name: string): unknown {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return undefined;
  return (rec as Record<string, unknown>)[name];
}

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* =====================================================================
 * §2 逐欄位解析（優先級見檔頭表）
 * =================================================================== */

/**
 * 等級：存檔 `generalLevel[名]` → `generals.level` → 20（夾 1..99）。
 *
 * 20 這條兜底不是隨手取的：`CityModel.ts:371 levelOf()` 就是「有 level 用它、
 * 否則 ctx.level、再否則 20」，web `qs.lv || 20` 同口徑。這裡只是把「存檔特有位」
 * 補在 CityModel 之前，其餘整支轉呼叫，避免出現第二套等級規則。
 */
export function levelOf(raw: unknown, save?: unknown): number {
  const rec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = str(rec.NAME);
  const saved = finiteOr(mapGet((save as Record<string, unknown> | null)?.generalLevel, name), 0);
  if (saved > 0) return clampInt(saved, 1, 99);
  // R85：没存档等级时取**当前剧本的起始等级**（Lv2/2/4/6/8），不要一律落 20
  // （旧注释说「与 web qs.lv||20 同口径」，但 web 现在走 levels.ts + 分剧本表，20 已过期）。
  const fromTable = scenarioLevelOf(name, 0);
  if (fromTable >= 1) return clampInt(fromTable, 1, 99);
  return clampInt(cityLevelOf(rec as unknown as CityGeneral, null), 1, 99);
}

/** 一條技能 + 是否已解鎖 */
export function skillOf(raw: unknown, level: number, table: unknown): BookSkill | null {
  const pairs = parseSkillPairs(raw);
  if (pairs.length === 0) return null;
  const [lv, id] = pairs[0];
  const name = skillNameOf(table, id);
  return {
    level: clampInt(lv, 0, 99),
    id,
    name: name || `#${id}`,
    unlocked: clampInt(lv, 0, 99) <= level,
  };
}

/** 把 `{城: [武將]}` 攤成 `名 → {城, 記錄}`（同名以先出現的城為準） */
export function officerIndex(officersByCity: Record<string, unknown> | null | undefined): Map<string, { city: string; rec: Record<string, unknown> }> {
  const out = new Map<string, { city: string; rec: Record<string, unknown> }>();
  if (!officersByCity || typeof officersByCity !== 'object') return out;
  for (const city of Object.keys(officersByCity)) {
    const list = officersByCity[city];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const rec = (item && typeof item === 'object' ? item : null) as Record<string, unknown> | null;
      if (!rec) continue;
      const name = str(rec.name ?? rec.NAME);
      if (!name || out.has(name)) continue;
      out.set(name, { city, rec });
    }
  }
  return out;
}

/* =====================================================================
 * §3 建表
 * =================================================================== */

/** 把 generals.json 一行 + 存檔/守將表合成名冊一行 */
export function mergeRow(
  raw: unknown,
  ctx: {
    save?: unknown;
    magics?: unknown;
    wises?: unknown;
    officer?: { city: string; rec: Record<string, unknown> } | null;
    ownerOf?: ((city: string) => string) | null;
    playerForce?: string;
  },
): BookGeneral | null {
  const rec = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!rec) return null;
  const name = str(rec.NAME);
  if (!name) return null;
  const save = (ctx.save && typeof ctx.save === 'object' ? ctx.save : {}) as Record<string, unknown>;
  const officer = ctx.officer ?? null;
  const level = levelOf(rec, save);

  const city = officer && officer.city ? officer.city : str(rec.CITY).trim();
  const liveStatus = mapGet(save.generalStatus, name);
  const status = normBookStatus(
    liveStatus !== undefined && str(liveStatus) ? liveStatus : officer ? officer.rec.status : rec.Status,
  );
  // 有城但沒人認領 = 在野；連城都沒有 = 未登場。兩個都不是「勢力 ''」的同一件事，
  // 所以這裡先算 forceLabel，再由呼叫端決定分組鍵（見 groupByForce）。
  const force = city && typeof ctx.ownerOf === 'function' ? str(ctx.ownerOf(city)) : '';
  const player = str(ctx.playerForce);
  const forceLabel = force || (city ? WILD_LABEL : NO_CITY_LABEL);
  const loyal = finiteOr(
    mapGet(save.loyal, name),
    finiteOr(officer?.rec.loyal, finiteOr(rec.Loyal, 90)),
  );
  const spirit = finiteOr(mapGet(save.morale, name), finiteOr(rec.Spirit, 80));
  const tire = finiteOr(mapGet(save.tire, name), 0);
  const mine = !!player && force === player;

  return {
    id: clampInt(rec.id ?? rec.SEQUENCE, 0, 9999),
    name,
    str: clampInt(officer?.rec.str ?? rec.STR, 0, 999),
    int: clampInt(officer?.rec.int ?? rec.INT, 0, 999),
    level,
    hp: clampInt(rec.BaseHP, 0, 9999),
    mp: clampInt(rec.BaseMP, 0, 9999),
    troopCap: troopCapOf(level),
    loyal: clampInt(loyal, 0, 999),
    spirit: clampInt(spirit, 0, 999),
    tire: clampInt(tire, 0, 999),
    status,
    statusText: BOOK_STATUS_TEXT[status],
    city,
    force,
    forceLabel,
    color: force ? forceColorOf(force) : FORCE_COLOR_NEUTRAL,
    mine,
    face: str(rec.FACE),
    faceNo: faceNumberOf(rec.FACE),
    type: clampInt(rec.TYPE, 0, 99),
    weapon: str(rec.Weapon).trim(),
    horse: str(rec.Horse).trim(),
    thing: str(rec.Thing).trim(),
    skill: skillOf(rec.SKILL, level, ctx.magics),
    wise: skillOf(rec.WISESKILL, level, ctx.wises),
    loyalKing: str(rec.LoyalKing).trim(),
    constancy: clampInt(rec.CONSTANCY, 0, 99),
    sortKey: sortKeyOf(status, mine),
  };
}

/**
 * 建 401 人名冊。
 *
 * 排序（`sortBook` 同一支）：我方 → 在職 → 俘虜 → 在野 → 未登場，同層再按勢力名、
 * 武力降序、名字（`localeCompare`）。這樣「按勢力分組」在列表上表現為**連續段**，
 * 不需要插組頭也能看出分組（決策理由見 project/126 §2）。
 */
export function buildBook(opts: BookOptions = {}): BookGeneral[] {
  const list = Array.isArray(opts.generals) ? opts.generals : [];
  const save = (opts.save && typeof opts.save === 'object' ? opts.save : {}) as Record<string, unknown>;
  const index = officerIndex(opts.officersByCity);
  const playerForce = str(save.force) || str(save.king);
  const rows: BookGeneral[] = [];
  for (const raw of list) {
    const rec = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
    if (!rec) continue;
    const name = str(rec.NAME);
    const row = mergeRow(rec, {
      save: opts.save,
      magics: opts.magics,
      wises: opts.wises,
      officer: index.get(name) ?? null,
      ownerOf: opts.ownerOf ?? null,
      playerForce,
    });
    if (row) rows.push(row);
  }
  sortBook(rows);
  return rows;
}

/** 原地排序（呼叫端多半剛 build 完，就地把 401 行排好最省） */
export function sortBook(rows: BookGeneral[]): BookGeneral[] {
  rows.sort(
    (a, b) =>
      a.sortKey - b.sortKey ||
      a.forceLabel.localeCompare(b.forceLabel, 'zh-Hans-CN') ||
      b.str - a.str ||
      a.name.localeCompare(b.name, 'zh-Hans-CN'),
  );
  return rows;
}

/* =====================================================================
 * §4 分組 / 篩選 / 分頁
 * =================================================================== */

/** 按勢力分組（我方 → 有城的 → 在野 → 未登場，與列表同序） */
export function groupByForce(rows: readonly BookGeneral[]): BookGroupRow[] {
  const map = new Map<string, BookGroupRow>();
  for (const row of rows) {
    const key = row.force || (row.city ? WILD_KEY : NO_CITY_KEY);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: row.force || (row.city ? WILD_LABEL : NO_CITY_LABEL),
        color: row.force ? row.color : FORCE_COLOR_NEUTRAL,
        mine: row.mine,
        count: 0,
        rows: [],
      };
      map.set(key, group);
    }
    group.rows.push(row);
    group.count += 1;
    if (row.mine) group.mine = true;
  }
  const out = Array.from(map.values());
  // 我方先、未登場最後、其餘按人數降序（勢力面板的排序習慣）
  out.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      Number(a.key === NO_CITY_KEY) - Number(b.key === NO_CITY_KEY) ||
      b.count - a.count ||
      a.label.localeCompare(b.label, 'zh-Hans-CN'),
  );
  return out;
}

/**
 * 按城分組。`owned` = `save.owned`（我方城名），用來標 `mine`。
 *
 * 驗收 ③ 要的是「按城分組與 save.owned 一致」：這裡的語義是
 *   · 每組的 `mine` 嚴格等價於 `owned.includes(城)`；
 *   · `owned` 裡有、但名冊裡沒將的城**不出現**（組是「有將的城」，不是全部 60 城）；
 *   · 沒城的將全部落在 `NO_CITY_KEY` 一組。
 * 這三條都在 model_assert 斷言。
 */
export function groupByCity(rows: readonly BookGeneral[], owned: readonly string[] = []): BookGroupRow[] {
  const mineSet = new Set<string>();
  for (const name of owned) {
    const s = str(name).trim();
    if (s) mineSet.add(s);
  }
  const map = new Map<string, BookGroupRow>();
  for (const row of rows) {
    const key = row.city || NO_CITY_KEY;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: row.city || NO_CITY_LABEL,
        color: row.color,
        mine: !!row.city && mineSet.has(row.city),
        count: 0,
        rows: [],
      };
      map.set(key, group);
    }
    group.rows.push(row);
    group.count += 1;
  }
  const out = Array.from(map.values());
  out.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      Number(a.key === NO_CITY_KEY) - Number(b.key === NO_CITY_KEY) ||
      b.count - a.count ||
      a.label.localeCompare(b.label, 'zh-Hans-CN'),
  );
  return out;
}

/** 名字首字 → 人數（「按名字首字篩選」的索引；Cocos 沒有輸入法，只能給這個） */
export function initialsOf(rows: readonly BookGeneral[]): Array<{ ch: string; count: number }> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const ch = Array.from(row.name)[0] ?? '';
    if (!ch) continue;
    map.set(ch, (map.get(ch) ?? 0) + 1);
  }
  const out = Array.from(map.entries()).map(([ch, count]) => ({ ch, count }));
  out.sort((a, b) => b.count - a.count || a.ch.localeCompare(b.ch, 'zh-Hans-CN'));
  return out;
}

export interface BookFilter {
  /** 勢力 id / `WILD_KEY` / `NO_CITY_KEY`；`''` = 全部 */
  force?: string;
  /** 名字首字；`''` = 全部 */
  initial?: string;
}

/** 篩選（勢力 + 首字可疊加）。回傳新陣列，不改輸入 */
export function filterBook(rows: readonly BookGeneral[], filter: BookFilter = {}): BookGeneral[] {
  const force = str(filter.force);
  const initial = str(filter.initial);
  if (!force && !initial) return rows.slice();
  return rows.filter((row) => {
    if (force) {
      const key = row.force || (row.city ? WILD_KEY : NO_CITY_KEY);
      if (key !== force) return false;
    }
    if (initial && (Array.from(row.name)[0] ?? '') !== initial) return false;
    return true;
  });
}

/** 每頁 20 行切成頁（最後一頁可以不足；空表回 `[[]]`，面板永遠有一頁可畫） */
export function paginateBook(rows: readonly BookGeneral[], size: number = BOOK_PAGE_SIZE): BookGeneral[][] {
  const step = Math.max(1, Math.trunc(size) || BOOK_PAGE_SIZE);
  if (rows.length === 0) return [[]];
  const pages: BookGeneral[][] = [];
  for (let i = 0; i < rows.length; i += step) pages.push(rows.slice(i, i + step));
  return pages;
}

/** 總頁數（至少 1，與 `paginateBook().length` 同義） */
export function pageCountOf(total: number, size: number = BOOK_PAGE_SIZE): number {
  const n = Math.max(0, Math.trunc(num(total)));
  const step = Math.max(1, Math.trunc(size) || BOOK_PAGE_SIZE);
  return Math.max(1, Math.ceil(n / step));
}

/** 統計（面板副標題與 model_assert 共用） */
export function summarize(rows: readonly BookGeneral[]): BookSummary {
  const forces = new Set<string>();
  const cities = new Set<string>();
  let employed = 0;
  let captive = 0;
  let wild = 0;
  let absent = 0;
  let mine = 0;
  for (const row of rows) {
    if (row.status === '登') employed += 1;
    else if (row.status === '俘') captive += 1;
    else if (row.status === '野') wild += 1;
    else absent += 1;
    if (row.mine) mine += 1;
    if (row.force) forces.add(row.force);
    if (row.city) cities.add(row.city);
  }
  return { total: rows.length, employed, captive, wild, absent, mine, forces: forces.size, cities: cities.size };
}

/* =====================================================================
 * §5 顯示文字（面板與斷言共用；放這裡是為了讓 headless 能斷言「文字非空」）
 * =================================================================== */

/** 列表一行：`名 · 城`（城空顯示 未登場） */
export function rowTitle(row: BookGeneral): string {
  return `${row.name} · ${row.city || NO_CITY_LABEL}`;
}

/** 列表：`武 99  智 85  級 20` */
export function rowStatText(row: BookGeneral): string {
  return `武 ${row.str}  智 ${row.int}  級 ${row.level}`;
}

/** 列表：`在職 · 關羽軍`（勢力名可能是君主名，這裡只拼標籤） */
export function rowForceText(row: BookGeneral): string {
  return `${row.statusText} · ${row.forceLabel}`;
}

/** 技能一行：已解鎖 `鬼哭神號`，未解鎖 `鬼哭神號（Lv40）` */
export function skillText(skill: BookSkill | null): string {
  if (!skill) return '—';
  return skill.unlocked ? skill.name : `${skill.name}（Lv${skill.level}）`;
}

/** 卡片「必殺技」欄：已解鎖的招 + 「還有 N 招未解鎖」 */
export function skillLine(skill: BookSkill | null, label: string): string {
  if (!skill) return `${label}　—`;
  return `${label}　${skillText(skill)}`;
}

/** 裝備一行：`兵 眉尖刀 / 馬 黃鬃馬 / 書 —` */
export function equipLine(row: BookGeneral): string {
  return `兵 ${row.weapon || '—'}　馬 ${row.horse || '—'}　書 ${row.thing || '—'}`;
}

/** 卡片體力/技力/帶兵：`體 85　技 43　兵 100` */
export function vitalLine(row: BookGeneral): string {
  return `體 ${row.hp}　技 ${row.mp}　兵 ${row.troopCap}`;
}

/** 卡片忠誠/士氣/疲勞：`忠 100　氣 100　疲 0` */
export function moodLine(row: BookGeneral): string {
  return `忠 ${row.loyal}　氣 ${row.spirit}　疲 ${row.tire}`;
}

/** 副標題：`401 人 · 在職 79 · 在野 63 · 未登場 259 · 15 家 · 34 城` */
export function summaryText(s: BookSummary): string {
  return `${s.total} 人 · 在職 ${s.employed} · 在野 ${s.wild} · 未登場 ${s.absent} · ${s.forces} 家 · ${s.cities} 城`;
}
