/**
 * OfficersOfCity.ts — 「這座城現在有誰」的唯一入口（純邏輯，零 import）。
 *
 * ## 為什麼要有這一層（2026-11-26 用戶實機反饋）
 *
 * 用戶在《討伐董卓》選劉備開局：內政頁平原顯示「武將 8/10」正常，但點「物品 裝備」，
 * 上方武將卡卻是**黃巾之亂的張角**——因為物品頁的武將池直接吃 `generals.json` 的靜態
 * `CITY` 欄位（= 劇本 0 的所屬城），其他面板則吃 `garrisonOf(data, 0, 城)`（劇本表 +
 * 劇本號恆 0）。用戶原話：
 *
 *   「这个和当前剧本有什么关系，不应该是当前选择势力吗？难道我不是刘备，曹操占领了
 *     这里，就变成看刘备的武将吗？」
 *
 * 他說得對：**城市駐將 = 存檔運行時狀態**（這座城現在歸誰、駐著誰），劇本表只是開局
 * 快照/播種用。勢力易手之後，面板必須跟著變。
 *
 * ## 口徑（優先序，永不倒退）
 *
 *   1. 我方城（`save.owned` 含此城）：以 `save.roster` 為準
 *      （`save.roster[城]` + `_moved`；`CampaignRoot` 開局播種時寫入整份名單，
 *       內政頁的任免/派遣/招降也改這份，見 `CityModel.ts` 的 §10）。
 *      名單為空 → 才回落劇本表播種；占領來的城（劇本裡不屬於玩家的城）名單為空
 *      就顯示空城，**不**拿原守將的劇本名單冒充自己的。
 *   2. 其他城（敵方/中立）：`save.cities[城].officers` 運行時人事（AI 月結 / 佔領寫入）；
 *      還沒有就回落劇本表（`city_by_times[scenIdx]`，與 `garrisonOf()` 同一算法）。
 *   3. `scenIdx` **只影響第 1/2 步的「劇本表播種」**：存檔裡已有名單的城，換劇本、
 *      換勢力都不會再看劇本表一行。
 *
 * ## 為什麼零 import
 *
 *   - Cocos 面板（`ItemsPanel` / `GeneralBookPanel` / `ForcesPanel` / `MonarchPanel` /
 *     `CityPanel`）都要 import 它；`core/garrison.ts` 會把 `./levels` → battle 依賴鏈
 *     拖進來，面板不吃這條鏈。
 *   - `node --test` 只認零 import 的模組（現有 `tests/cocos_affairs.test.ts` 直接
 *     `import '../cocos/assets/scripts/CityModel.ts'` 就是因為零 import）；本模組要能
 *     被 `tests/panels_roster_source.test.ts` 直接 import。
 *   - 與 `CityModel.cityOf/statusOf`、`core/garrison.garrisonOf` 的算法逐條對齊，
 *     測試 `panels_roster_source.test.ts` 拿 `M.rosterOf()` / `data.garrison` 對拍。
 *
 * 注意：本模組**不寫 localStorage**，所有寫入都只改傳進來的存檔物件；落盤由呼叫端
 * （`CampaignRoot` 的 `GameState.persistSave()`）負責。
 */

/* ======================================================================
 * §0 型別與小工具
 * ==================================================================== */

/** 一城名單裡的一員（欄位對齊 `GameState.CityOfficer` / `core/garrison.Officer`） */
export interface OfficerLike {
  name: string;
  str: number;
  int: number;
  loyal: number;
  status: string;
}

/** 寬鬆物件（存檔/資料表都可能是髒資料） */
type Rec = Record<string, unknown>;

/** 面板/播種要用的上下文。全部可選：缺了就按「沒有這層資料」處理，不拋。 */
export interface OfficersCtx {
  /** `generals.json` 全表（查 STR/INT/Loyal/Status 用；缺了就只能用名單自帶的數字） */
  generals?: readonly unknown[] | null;
  /**
   * 劇本序號（`RunSetup.scenarioIndex()`）。**只**影響「還沒有人事紀錄的城」的播種；
   * 存檔裡已有名單的城不受影響。
   */
  scenIdx?: unknown;
  /**
   * `save.roster` 的覆蓋值。`CampaignRoot` 傳 `mergeRosters(存檔 roster, 內政 extras roster)`，
   * `CityPanel` 傳自己的 `CitySave.roster`（= `sanguo_city_v1` 那份）。
   * 不傳就讀 `save.roster`。
   */
  roster?: Rec | null;
  /** 玩家勢力名（`runPlayerForce()`）；用來判斷「這座城是不是劇本開局就屬於玩家」 */
  playerForce?: string;
  /** `scenarios.json[scenIdx].cities`（判斷城池 KING/MAJOR；不傳就只能靠 `generals.json`） */
  scenarioCities?: readonly unknown[] | null;
}

function isRec(value: unknown): value is Rec {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 字串化：只認字串/有限數字，其餘 → `''`（名將名/城名不會是其他型別） */
function str(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** 有限數字，否則 fallback（= `CityModel.num` 的同一口徑） */
function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 取整並夹到 [min,max]；非有限 → fallback（= `CityModel.intOr`） */
function intOr(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = num(value, NaN);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function recordOf(value: unknown): Rec {
  return isRec(value) ? value : {};
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/* ======================================================================
 * §1 存檔 / 名單 / 劇本表的基本讀取
 * ==================================================================== */

function saveRecord(save: unknown): Rec {
  return isRec(save) ? save : {};
}

function citiesRecord(save: unknown): Rec {
  return recordOf(saveRecord(save).cities);
}

/** 城名：字串本身或 `{NAME}` / `{name}` 列（`cities[]` 與 `save.cities` 的 key 都吃） */
export function cityNameOf(row: unknown): string {
  if (typeof row === 'string') return row.trim();
  if (isRec(row)) return str(row.NAME ?? row.name).trim();
  return '';
}

/** `save.owned` 的城名清單 */
export function ownedCities(save: unknown): string[] {
  const out: string[] = [];
  for (const item of arrayOf(saveRecord(save).owned)) {
    const name = cityNameOf(item);
    if (name && out.indexOf(name) < 0) out.push(name);
  }
  return out;
}

/** `save.cities[城]` 運行時（沒有就 `null`；**不改存檔**） */
export function cityRuntime(save: unknown, city: string): Rec | null {
  const name = str(city).trim();
  if (!name) return null;
  const row = citiesRecord(save)[name];
  return isRec(row) ? row : null;
}

/** `save.cities[城]` 運行時；沒有就建一個空物件（寫入路徑用） */
function ensureCityRuntime(save: unknown, city: string): Rec {
  const base = saveRecord(save);
  if (!isRec(base.cities)) base.cities = {};
  const cities = base.cities as Rec;
  if (!isRec(cities[city])) cities[city] = {};
  return cities[city] as Rec;
}

/**
 * 合併多份 roster（存檔 roster ∪ 內政 extras roster）。
 *
 * 同名城的名單取**聯集**（順序先到先留），`_moved` 逐鍵覆蓋（後面的來源優先）。
 * 之所以要合併：Cocos 現在有兩份 roster——戰役存檔的 `save.roster`（招降台帳，
 * `core/roster.applyPostBattle` 寫）與內政 `sanguo_city_v1` 的 `roster`（任免/派遣/招降，
 * `CityPanel.persist` 寫）。兩者互不同步（`CityPanel.ts:781-785` 的註釋），
 * 面板要看到「最新的那一份」就只能取聯集。
 */
export function mergeRosters(...sources: readonly unknown[]): Rec {
  const out: Rec = {};
  const lists = new Map<string, string[]>();
  const moved: Rec = {};
  let hasMoved = false;
  for (const source of sources) {
    const roster = recordOf(source);
    for (const key of Object.keys(roster)) {
      if (key === '_moved') {
        const raw = roster._moved;
        if (isRec(raw)) {
          for (const name of Object.keys(raw)) {
            const to = str(raw[name]);
            if (name && to) {
              moved[name] = to;
              hasMoved = true;
            }
          }
        }
        continue;
      }
      let list = lists.get(key);
      if (!list) {
        list = [];
        lists.set(key, list);
      }
      for (const item of arrayOf(roster[key])) {
        const name = cityNameOf(item);
        if (name && list.indexOf(name) < 0) list.push(name);
      }
    }
  }
  for (const [city, names] of lists) if (names.length) out[city] = names;
  if (hasMoved) out._moved = moved;
  return out;
}

function movedRecord(roster: Rec): Record<string, string> {
  const raw = roster._moved;
  if (!isRec(raw)) return {};
  const out: Record<string, string> = {};
  for (const name of Object.keys(raw)) {
    const to = str(raw[name]);
    if (name && to) out[name] = to;
  }
  return out;
}

/** roster 裡「這座城的名字」（只做格式清洗，不判斷 `_moved`/隨軍） */
function rawRosterNames(roster: Rec, city: string): string[] {
  const out: string[] = [];
  for (const item of arrayOf(roster[city])) {
    const name = cityNameOf(item);
    if (name && out.indexOf(name) < 0) out.push(name);
  }
  return out;
}

/** `save.roster` 的實際來源：`ctx.roster` 優先，否則 `save.roster` */
function rosterSourceOf(save: unknown, ctx: OfficersCtx): Rec {
  if (isRec(ctx.roster)) return ctx.roster;
  const raw = saveRecord(save).roster;
  return isRec(raw) ? raw : {};
}

/** 隨軍將名集合（`save.away` 的鍵 ∪ `save.armies` 我方部隊的 general/officers）= `CityModel.awayNameSet` */
export function awayNameSet(save: unknown): Set<string> {
  const set = new Set<string>();
  const base = saveRecord(save);
  const away = base.away;
  if (isRec(away)) {
    for (const name of Object.keys(away)) if (name && str(away[name]) !== '') set.add(name);
  }
  for (const army of arrayOf(base.armies)) {
    if (!isRec(army) || army.side !== 'A') continue;
    const general = str(army.general);
    if (general) set.add(general);
    for (const item of arrayOf(army.officers)) {
      const name = cityNameOf(item);
      if (name) set.add(name);
    }
  }
  // [R232] 已抵達、正在戰前準備（攻城）的部隊：兵團已 removeArmy，不在 armies 裡，
  // 但這些將同樣「不在城內」——不算進在途的話，再派第二支會把他們又列進候選名單。
  const siege = base.siege;
  if (isRec(siege)) {
    const general = str(siege.general);
    if (general) set.add(general);
    for (const item of arrayOf(siege.officers)) {
      const name = cityNameOf(item);
      if (name) set.add(name);
    }
  }
  return set;
}

/* ======================================================================
 * §2 武將表 / 劇本表的派生（與 CityModel.cityOf / statusOf 逐條對齊）
 * ==================================================================== */

function generalRows(ctx: OfficersCtx): Rec[] {
  const out: Rec[] = [];
  for (const item of arrayOf(ctx.generals)) if (isRec(item)) out.push(item);
  return out;
}

function generalIndexOf(ctx: OfficersCtx): Map<string, Rec> {
  const index = new Map<string, Rec>();
  for (const row of generalRows(ctx)) {
    const name = str(row.NAME).trim();
    if (name && !index.has(name)) index.set(name, row);
  }
  return index;
}

/** 該劇本裡這名將在哪座城（`city_by_times[scenIdx]` 優先，缺了退回靜態 `CITY`）= `CityModel.cityOf` */
export function cityOfGeneral(general: unknown, scenIdx = 0): string {
  const row = isRec(general) ? general : null;
  const list = row?.city_by_times;
  // R224：有這一項就以它為準（空字串＝這劇本不在任何城），只有缺項才回落靜態 CITY。
  if (Array.isArray(list) && scenIdx < list.length) {
    const v = list[scenIdx];
    return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
  }
  return str(row?.CITY).trim();
}

/** 該劇本裡這名將的狀態：未 / 登 / 野 = `CityModel.statusOf` */
export function statusOfGeneral(general: unknown, scenIdx = 0): string {
  const row = isRec(general) ? general : null;
  const list = row?.status_by_times;
  if (Array.isArray(list) && scenIdx < list.length) {
    const v = list[scenIdx];
    return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
  }
  return str(row?.Status).trim();
}

/** 劇本的城市列（`scenarios[scenIdx].cities` 裡對應這座城的那一條） */
function scenarioCityOf(city: string, ctx: OfficersCtx): Rec | null {
  const name = str(city).trim();
  if (!name) return null;
  for (const row of arrayOf(ctx.scenarioCities)) {
    if (isRec(row) && str(row.NAME).trim() === name) return row;
  }
  return null;
}

/** 劇本裡這座城的歸屬勢力（`""` = 無主；沒有劇本城市列時也回 `""`） */
export function cityKingOf(city: string, ctx: OfficersCtx): string {
  return str(scenarioCityOf(city, ctx)?.KING).trim();
}

/**
 * 這座城是不是「劇本開局就屬於玩家」。
 *
 * 用來擋住**占領城**：玩家打下平原後，`scenIdx` 對應的劇本表裡平原仍屬於原勢力，
 * 若照劇本表派生會把原守將（甚至黃巾張角）當成自己的武將——正是用戶反饋的那一幕。
 * 判據：`scenarioCities` 裡該城 `KING === playerForce`。資料缺了就當 `true`
 * （寧可退回舊行為，也不要平白把名單清空）。
 */
export function isScenarioHome(city: string, ctx: OfficersCtx): boolean {
  const force = str(ctx.playerForce).trim();
  if (!force) return true;
  const king = cityKingOf(city, ctx);
  if (!king) return true;
  return king === force;
}

/** 名字 → 屬性（STR/INT/Loyal/Status），排序與換算用 */
function statsOf(ctx: OfficersCtx): Map<string, OfficerLike> {
  const out = new Map<string, OfficerLike>();
  for (const row of generalRows(ctx)) {
    const name = str(row.NAME).trim();
    if (!name || out.has(name)) continue;
    out.set(name, {
      name,
      str: num(row.STR),
      int: num(row.INT),
      loyal: num(row.Loyal, 90),
      status: statusOfGeneral(row, intOr(ctx.scenIdx, 0, 0)),
    });
  }
  return out;
}

/** 名單排序：`STR+INT` 降序、同分按名字碼位升序（= `garrison.ts` 的同一份順序） */
function sortNames(names: readonly string[], stats: Map<string, OfficerLike>): string[] {
  return names.slice().sort((a, b) => {
    const ra = stats.get(a);
    const rb = stats.get(b);
    const ta = (ra?.str ?? 0) + (ra?.int ?? 0);
    const tb = (rb?.str ?? 0) + (rb?.int ?? 0);
    if (tb !== ta) return tb - ta;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/* ======================================================================
 * §3 名單派生：我方城（roster 口徑） / 敵城（劇本表口徑）
 * ==================================================================== */

/** `roster[城]` 的名單（清掉隨軍與已調去別城的將；空陣列 = 沒有額外名單） */
function rosterNamesOfCity(save: unknown, city: string, ctx: OfficersCtx): string[] {
  const roster = rosterSourceOf(save, ctx);
  const moved = movedRecord(roster);
  const away = awayNameSet(save);
  const out: string[] = [];
  for (const name of rawRosterNames(roster, city)) {
    if (away.has(name)) continue;
    const movedTo = moved[name];
    if (movedTo && movedTo !== city) continue;
    out.push(name);
  }
  return out;
}

/**
 * 劇本表裡這座城的駐將（`city_by_times[scenIdx] === 城`）。
 * `excludeWild = true` 時剔除「野」將——我方城走內政口徑（`CityModel.rosterOf` 同款）；
 * 敵城要保留野將（`garrison.json` 的守將名單本來就含野將）。
 */
function scenarioNamesOfCity(save: unknown, city: string, ctx: OfficersCtx, excludeWild: boolean): string[] {
  const scenIdx = intOr(ctx.scenIdx, 0, 0);
  const away = awayNameSet(save);
  const out: string[] = [];
  for (const row of generalRows(ctx)) {
    const name = str(row.NAME).trim();
    if (!name || name === '盜賊' || away.has(name)) continue;
    if (cityOfGeneral(row, scenIdx) !== city) continue;
    if (excludeWild && statusOfGeneral(row, scenIdx) === '野') continue;
    if (out.indexOf(name) < 0) out.push(name);
  }
  return sortNames(out, statsOf(ctx));
}

/**
 * 我方城的駐將名單（單一入口）。
 *
 *   1. `roster` 裡有的名字 → **以它為準**（開局播種寫的是整份名單；之後任免/派遣/招降
 *      都改這份）。此時 `scenIdx` 一行都不看——劇本號不再影響已有人事紀錄的城。
 *   2. roster 沒有名字、且這座城劇本開局屬於玩家 → 劇本表播種（排除野將，內政口徑）。
 *   3. roster 沒有名字、且是占領來的城 → `[]`（不拿原守將冒充自己的武將）。
 */
function ownedCityNames(save: unknown, city: string, ctx: OfficersCtx): string[] {
  const fromRoster = rosterNamesOfCity(save, city, ctx);
  if (fromRoster.length > 0) return sortNames(fromRoster, statsOf(ctx));
  if (!isScenarioHome(city, ctx)) return [];
  return scenarioNamesOfCity(save, city, ctx, true);
}

/* ======================================================================
 * §4 單一入口：這座城現在有誰
 * ==================================================================== */

function officerRowFromGeneral(name: string, index: Map<string, Rec>, scenIdx: number): OfficerLike {
  const row = index.get(name);
  if (!row) return { name, str: 0, int: 0, loyal: 90, status: '' };
  return {
    name,
    str: num(row.STR),
    int: num(row.INT),
    loyal: num(row.Loyal, 90),
    status: statusOfGeneral(row, scenIdx),
  };
}

/** 名單 → 名冊列（數值查 `generals.json`；查不到的將保留名字、數值 0） */
function rowsFromNames(names: readonly string[], ctx: OfficersCtx): OfficerLike[] {
  const index = generalIndexOf(ctx);
  const scenIdx = intOr(ctx.scenIdx, 0, 0);
  return names.map((name) => officerRowFromGeneral(name, index, scenIdx));
}

/** 運行時 `officers[]` 的單列（字串或 `{name,str,int,loyal,status}` 都吃） */
export function officerRowOf(raw: unknown, general?: Rec | null): OfficerLike | null {
  if (typeof raw === 'string' || typeof raw === 'number') {
    const name = str(raw).trim();
    if (!name) return null;
    return {
      name,
      str: num(general?.STR),
      int: num(general?.INT),
      loyal: num(general?.Loyal, 90),
      status: str(general?.Status).trim(),
    };
  }
  if (!isRec(raw)) return null;
  const name = str(raw.name ?? raw.NAME).trim();
  if (!name) return null;
  return {
    name,
    str: num(raw.str ?? raw.STR ?? general?.STR),
    int: num(raw.int ?? raw.INT ?? general?.INT),
    loyal: num(raw.loyal ?? raw.Loyal ?? general?.Loyal, 90),
    status: str(raw.status ?? raw.Status ?? general?.Status).trim(),
  };
}

/**
 * 「這座城現在有誰」——所有面板的唯一讀取口。
 *
 * - 我方城：`save.roster`（`roster[城]` + `_moved`）→ 劇本表播種（見 `ownedCityNames`）。
 * - 其他城：`save.cities[城].officers`（AI 月結 / 佔領寫入的人事真相）→ 劇本表。
 *
 * `save.cities[城].officers` 只要是**陣列**就算權威（空陣列 = 這座城真的沒人），
 * 不再用「長度 > 0」猜——否則占領城會被劇本表原守將頂回來。
 */
export function officersOfCity(save: unknown, city: string, ctx: OfficersCtx = {}): OfficerLike[] {
  const name = str(city).trim();
  if (!name) return [];
  const owned = ownedCities(save);
  if (owned.indexOf(name) >= 0) return rowsFromNames(ownedCityNames(save, name, ctx), ctx);

  const runtime = cityRuntime(save, name);
  const officers = runtime ? runtime.officers : null;
  if (Array.isArray(officers)) {
    const index = generalIndexOf(ctx);
    const out: OfficerLike[] = [];
    const seen = new Set<string>();
    for (const item of officers) {
      const key = isRec(item) ? str(item.name ?? item.NAME) : cityNameOf(item);
      const row = officerRowOf(item, index.get(str(key).trim()) ?? null);
      if (!row || seen.has(row.name)) continue;
      seen.add(row.name);
      out.push(row);
    }
    return out;
  }
  return rowsFromNames(scenarioNamesOfCity(save, name, ctx, false), ctx);
}

/** 同上，只要名字 */
export function officerNamesOfCity(save: unknown, city: string, ctx: OfficersCtx = {}): string[] {
  return officersOfCity(save, city, ctx).map((row) => row.name);
}

/**
 * `{城: [武將]}`——`GeneralBookPanel.officersByCity` / `ForcesPanel.officersByCity` /
 * `MonarchPanel.officersByCity` 的來源（取代舊的 `ForcesPanel.officersByCityOf(data, cities)`
 * 與 `CampaignRoot.officersByCity()`，兩者都是 `garrisonOf(data, 0, 城)`）。
 */
export function officersByCity(save: unknown, cities: readonly unknown[], ctx: OfficersCtx = {}): Record<string, OfficerLike[]> {
  const out: Record<string, OfficerLike[]> = {};
  const names = arrayOf(cities).map(cityNameOf).filter((name) => !!name);
  const keys = names.length ? names : Object.keys(citiesRecord(save));
  for (const city of keys) out[city] = officersOfCity(save, city, ctx);
  return out;
}

/**
 * 我方所有城的駐將池（物品頁武將卡用：原本是 `pickPool()` 拿 `general.CITY` 過濾）。
 *
 * `owned` 傳空 → 掃 `save.cities` 的全部城（舊行為：沒有任何 `owned` 時不過濾城）。
 * 回傳按 `STR+INT` 降序、已去重、只取前 `cap` 名；`cityOf` 是「這名將在哪座城」。
 */
export function ownedOfficerPool(
  save: unknown,
  owned: readonly unknown[],
  ctx: OfficersCtx = {},
  cap = 12,
): { rows: OfficerLike[]; names: string[]; cityOf: Record<string, string> } {
  const list: string[] = [];
  for (const item of arrayOf(owned)) {
    const name = cityNameOf(item);
    if (name && list.indexOf(name) < 0) list.push(name);
  }
  const scan = list.length ? list : Object.keys(citiesRecord(save));
  const seen = new Set<string>();
  const cityOf: Record<string, string> = {};
  const names: string[] = [];
  for (const city of scan) {
    for (const row of officersOfCity(save, city, ctx)) {
      if (seen.has(row.name)) continue;
      seen.add(row.name);
      names.push(row.name);
      cityOf[row.name] = city;
    }
  }
  const stats = statsOf(ctx);
  const sorted = sortNames(names, stats).slice(0, Math.max(0, Math.trunc(num(cap, 12))));
  const rows = rowsFromNames(sorted, ctx);
  const trimmed: Record<string, string> = {};
  for (const name of sorted) trimmed[name] = cityOf[name] ?? '';
  return { rows, names: sorted, cityOf: trimmed };
}

/**
 * 從候選名單挑「預設選中的武將」的索引（物品頁武將卡）。
 *
 * 依序找：存檔上次選的將 → 呼叫端指定的優先名（當前城太守）→ 君主 → 第一個。
 * 找不到就回 0（不會回 `-1`，`genIndex` 必須可渲染）。
 */
export function pickDefaultIndex(names: readonly unknown[], candidates: readonly unknown[]): number {
  const list = names.map((name) => str(name).trim());
  for (const raw of arrayOf(candidates)) {
    const name = str(raw).trim();
    if (!name) continue;
    const index = list.indexOf(name);
    if (index >= 0) return index;
  }
  return 0;
}

/* ======================================================================
 * §5 城的歸屬 / 太守
 * ==================================================================== */

/** 運行時歸屬勢力（`""` = 還沒寫過） */
export function cityOwnerOf(save: unknown, city: string): string {
  return str(cityRuntime(save, city)?.owner).trim();
}

/**
 * 太守：我方城 → 運行時 `major`（AI/佔領寫的）→ 劇本表 `MAJOR` → 名單第一位；
 * 敵城 → 運行時 `major` → 劇本表 `MAJOR` → `""`。
 */
export function cityMajorNameOf(save: unknown, city: string, ctx: OfficersCtx = {}): string {
  const name = str(city).trim();
  if (!name) return '';
  const runtimeMajor = str(cityRuntime(save, name)?.major).trim();
  const owned = ownedCities(save);
  if (owned.indexOf(name) >= 0) {
    if (isScenarioHome(name, ctx) && !runtimeMajor) {
      const scenMajor = str(scenarioCityOf(name, ctx)?.MAJOR).trim();
      if (scenMajor) return scenMajor;
    }
    return runtimeMajor || ownedCityNames(save, name, ctx)[0] || '';
  }
  if (runtimeMajor) return runtimeMajor;
  return str(scenarioCityOf(name, ctx)?.MAJOR).trim();
}

/* ======================================================================
 * §6 寫入路徑（播種 / 同步）
 * ==================================================================== */

function writeRows(save: unknown, city: string, rows: readonly OfficerLike[]): OfficerLike[] {
  const runtime = ensureCityRuntime(save, city);
  const copied = rows.map((row) => ({ ...row }));
  runtime.officers = copied;
  return copied;
}

/**
 * 把名單寫進 `save.cities[城].officers`（寫入路徑：開局播種 / 內政關閉後同步 /
 * 佔領清空）。數值查 `generals.json`，不傳 `ctx.generals` 就寫 0。
 */
export function writeCityOfficers(save: unknown, city: string, names: readonly unknown[], ctx: OfficersCtx = {}): OfficerLike[] {
  const list: string[] = [];
  for (const item of arrayOf(names)) {
    const name = cityNameOf(item);
    if (name && list.indexOf(name) < 0) list.push(name);
  }
  return writeRows(save, city, rowsFromNames(list, ctx));
}

/** 把我方城的名單寫回 `save.roster[城]`（空名單 → 刪掉該鍵，別留空陣列） */
export function writeRosterNames(save: unknown, city: string, names: readonly unknown[]): string[] {
  const name = str(city).trim();
  if (!name) return [];
  const base = saveRecord(save);
  if (!isRec(base.roster)) base.roster = {};
  const roster = base.roster as Rec;
  const list: string[] = [];
  for (const item of arrayOf(names)) {
    const key = cityNameOf(item);
    if (key && list.indexOf(key) < 0) list.push(key);
  }
  if (list.length) roster[name] = list;
  else delete roster[name];
  return list;
}

/** 寫入城的歸屬/太守（`owner` 空字串 = 不寫；`major` 照傳入值覆蓋） */
export function writeCityOwner(save: unknown, city: string, owner: string, major: string): void {
  const runtime = ensureCityRuntime(save, city);
  const ownerName = str(owner).trim();
  if (ownerName) runtime.owner = ownerName;
  runtime.major = str(major).trim();
}

/**
 * 開局播種 / 內政關閉後同步（`CampaignRoot.seedRuntimeOfficers()` 的純邏輯本體）。
 *
 * 我方城：名單寫回 `roster[城]` **與** `cities[城].officers`（兩份都是運行時真源，
 *         內政頁/物品頁/名冊頁從此同一個口徑）。
 * 敵城：有人事紀錄就尊重（AI 月結寫的）；沒有才按劇本表播種。若運行時歸屬還掛著玩家
 *       （= 這座城剛被攻陷），先清掉當成敵城重播，否則玩家的舊駐將會留在敵城。
 *
 * 回傳 `{ owned, seeded }`：同步的我方城數 / 播種的敵城數（報告/測試用）。
 */
export function seedCityOfficers(
  save: unknown,
  cities: readonly unknown[],
  ctx: OfficersCtx = {},
): { owned: number; seeded: number } {
  const ownedSet = new Set(ownedCities(save));
  const playerForce = str(ctx.playerForce).trim();
  let ownedCount = 0;
  let seeded = 0;
  for (const row of arrayOf(cities)) {
    const city = cityNameOf(row);
    if (!city) continue;
    if (ownedSet.has(city)) {
      const names = ownedCityNames(save, city, ctx);
      writeCityOfficers(save, city, names, ctx);
      writeRosterNames(save, city, names);
      const major = cityMajorNameOf(save, city, ctx);
      writeCityOwner(save, city, playerForce || cityOwnerOf(save, city), major);
      ownedCount += 1;
      continue;
    }
    const runtime = cityRuntime(save, city);
    const officers = runtime ? runtime.officers : null;
    const staleOwner = str(runtime?.owner).trim();
    const staleForUs = !!playerForce && staleOwner === playerForce;
    if (Array.isArray(officers) && officers.length > 0 && !staleForUs) continue;
    const names = scenarioNamesOfCity(save, city, ctx, false);
    writeCityOfficers(save, city, names, ctx);
    const scen = scenarioCityOf(city, ctx);
    writeCityOwner(save, city, str(scen?.KING).trim(), str(scen?.MAJOR).trim());
    seeded += 1;
  }
  return { owned: ownedCount, seeded };
}
